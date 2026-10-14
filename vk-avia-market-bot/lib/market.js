const { getHistory, getUserName, sendMessage, answerEvent, deleteMessage, getInviteLink, pinMessage, vkApi } = require('./vk');
const { privateMenu, privateHome, groupHome } = require('./ui');

const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 0);
const ADMIN_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);
const STRICT_MARKET_CHAT = process.env.VK_STRICT_MARKET_CHAT !== 'false';
const LISTING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MODE_TTL_MS = 30 * 60 * 1000;

const isAdmin = (userId) => ADMIN_USER_ID > 0 && Number(userId) === ADMIN_USER_ID;
const normalizeListingText = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
const normalizeCommand = (text) => String(text || '').replace(/^\[club\d+\|@[^\]]+\]\s*/i, '').trim().toLowerCase();
const listingMarker = (kind, userId) => `#AM2_${kind === 'search' ? 'SEARCH' : 'OFFER'}_${Number(userId)}`;

function safePayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function formatTime(unixSeconds) {
  try {
    return new Intl.DateTimeFormat('uz-UZ', {
      timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(Number(unixSeconds) * 1000));
  } catch { return ''; }
}

function parseListing(message) {
  const text = String(message?.text || '');
  const marker = text.match(/#AM2_(OFFER|SEARCH)_(\d+)/i);
  if (!marker) return null;
  const kind = marker[1].toUpperCase() === 'SEARCH' ? 'search' : 'offer';
  const userId = Number(marker[2]);
  const body = text.split('\n').filter((line) => {
    const value = String(line || '').trim();
    if (!value) return true;
    if (/^(✈️ TAKLIF|🔎 SO‘ROV)$/i.test(value)) return false;
    if (/^👤\s/i.test(value) || /^🕒\s/i.test(value)) return false;
    if (/^#AviaMarket$/i.test(value) || /^#AM2_(OFFER|SEARCH)_\d+$/i.test(value)) return false;
    return true;
  }).join('\n').trim();
  return { kind, userId, text: body, date: Number(message?.date || 0), cmid: Number(message?.conversation_message_id || 0) };
}

async function recentListings(limit = 200) {
  if (!PRIMARY_PEER_ID) return [];
  const history = await getHistory(PRIMARY_PEER_ID, Math.min(limit, 200));
  const cutoff = Date.now() - LISTING_WINDOW_MS;
  return history.map(parseListing).filter(Boolean).filter((item) => item.date * 1000 >= cutoff);
}

async function inferModeFromPrivateHistory(userId) {
  const history = await getHistory(userId, 12);
  const now = Date.now();
  for (const item of history) {
    if (Number(item?.out || 0) !== 1) continue;
    if (now - Number(item?.date || 0) * 1000 > MODE_TTL_MS) break;
    const text = String(item?.text || '');
    if (text.startsWith('✈️ TAKLIF KIRITISH')) return 'offer';
    if (text.startsWith('🔎 SO‘ROV KIRITISH')) return 'search';
    if (text.startsWith('✅ ') || text.startsWith('⚠️ ') || text.startsWith('🤖 AVIA MARKET')) return null;
  }
  return null;
}

async function sendEntryPrompt(userId, mode) {
  const offer = mode === 'offer';
  await sendMessage(userId, [
    offer ? '✈️ TAKLIF KIRITISH' : '🔎 SO‘ROV KIRITISH', '',
    offer ? 'Taklifingizni keyingi BITTA xabarda yozing.' : 'So‘rovingizni keyingi BITTA xabarda yozing.', '',
    offer ? 'Masalan: TAS–MOW 20 oktabr, HY, 4 ta joy, 220 USD, bagaj 20 kg.' : 'Masalan: TAS–MOW 20 oktabrga 3 ta joy kerak, bagaj bilan.', '',
    '⏱ Rejim 30 daqiqa amal qiladi.',
  ].join('\n'), privateMenu({ isAdmin: isAdmin(userId) }));
}

async function publishListing(userId, kind, text) {
  if (!PRIMARY_PEER_ID) throw new Error('VK_PRIMARY_PEER_ID is not configured');
  const normalized = normalizeListingText(text);
  const duplicate = (await recentListings(120)).some((item) => item.userId === Number(userId) && item.kind === kind && normalizeListingText(item.text) === normalized);
  if (duplicate) return { duplicate: true };

  const name = await getUserName(userId);
  const now = Math.floor(Date.now() / 1000);
  await sendMessage(PRIMARY_PEER_ID, [
    kind === 'search' ? '🔎 SO‘ROV' : '✈️ TAKLIF',
    `👤 [id${userId}|${name}]`, `🕒 ${formatTime(now)}`, '', String(text).trim(), '', '#AviaMarket', listingMarker(kind, userId),
  ].join('\n'));
  return { duplicate: false };
}

function formatList(title, items) {
  if (!items.length) return `${title}\n\nHozircha ma’lumot yo‘q.`;
  return `${title}\n\n${items.slice(0, 10).map((item, index) => `${index + 1}. ${item.kind === 'search' ? '🔎' : '✈️'} ${formatTime(item.date)}\n${item.text}`).join('\n\n────────\n\n')}`.slice(0, 3900);
}

async function sendList(userId, action) {
  const all = await recentListings(200);
  const filtered = all.filter((item) => {
    if (action === 'offers') return item.kind === 'offer';
    if (action === 'searches') return item.kind === 'search';
    if (action === 'my_offers') return item.kind === 'offer' && item.userId === Number(userId);
    if (action === 'my_searches') return item.kind === 'search' && item.userId === Number(userId);
    return false;
  });
  const titles = { offers: '🌐 SO‘NGGI TAKLIFLAR', searches: '👥 SO‘NGGI SO‘ROVLAR', my_offers: '📦 MENING TAKLIFLARIM', my_searches: '📋 MENING SO‘ROVLARIM' };
  await sendMessage(userId, formatList(titles[action] || 'Avia Market', filtered), privateMenu({ isAdmin: isAdmin(userId) }));
}

async function sendStats(userId) {
  const all = await recentListings(200);
  const mine = all.filter((x) => x.userId === Number(userId));
  await sendMessage(userId, [
    '📊 AVIA MARKET — 7 KUNLIK STATISTIKA', '',
    `✈️ Takliflar: ${all.filter((x) => x.kind === 'offer').length}`,
    `🔎 So‘rovlar: ${all.filter((x) => x.kind === 'search').length}`,
    `📦 Mening takliflarim: ${mine.filter((x) => x.kind === 'offer').length}`,
    `📋 Mening so‘rovlarim: ${mine.filter((x) => x.kind === 'search').length}`,
  ].join('\n'), privateMenu({ isAdmin: isAdmin(userId) }));
}

async function sendCabinet(userId) {
  const mine = (await recentListings(200)).filter((x) => x.userId === Number(userId));
  await sendMessage(userId, [
    '👤 AVIA MARKET — KABINET', '', `🆔 VK ID: ${userId}`, '📦 Tarif: Bepul', '✅ Holat: Faol',
    `✈️ 7 kunda takliflarim: ${mine.filter((x) => x.kind === 'offer').length}`,
    `🔎 7 kunda so‘rovlarim: ${mine.filter((x) => x.kind === 'search').length}`,
  ].join('\n'), privateMenu({ isAdmin: isAdmin(userId) }));
}

async function sendMarketLink(userId) {
  const link = await getInviteLink(PRIMARY_PEER_ID);
  const chatId = PRIMARY_PEER_ID - 2000000000;
  await sendMessage(userId, `🌐 AVIA MARKET — UMUMIY CHAT\n\n👉 ${link || `https://vk.ru/im?sel=c${chatId > 0 ? chatId : 1}`}`, privateMenu({ isAdmin: isAdmin(userId) }));
}

async function sendGroupMenu({ pin = false } = {}) {
  const home = groupHome();
  const sent = await sendMessage(PRIMARY_PEER_ID, home.text, home.keyboard);
  return { pinned: pin ? await pinMessage(PRIMARY_PEER_ID, sent) : false };
}

async function cleanChat(userId) {
  if (!isAdmin(userId)) return sendMessage(userId, '⛔ Bu amal faqat admin uchun.');
  const cmids = (await getHistory(PRIMARY_PEER_ID, 200)).map((item) => Number(item?.conversation_message_id || 0)).filter(Boolean);
  let deleted = 0;
  for (let i = 0; i < cmids.length; i += 25) {
    const batch = cmids.slice(i, i + 25);
    try {
      await vkApi('messages.delete', { peer_id: PRIMARY_PEER_ID, cmids: batch.join(','), delete_for_all: 1 });
      deleted += batch.length;
    } catch (error) {
      console.warn('clean_batch_failed', { code: error?.code || null });
    }
  }
  await sendMessage(userId, `🧹 Tozalash yakunlandi.\n✅ O‘chirildi: ${deleted}`, privateMenu({ isAdmin: true }));
}

async function handlePrivateMessage(msg) {
  const userId = Number(msg?.from_id || 0);
  const text = String(msg?.text || '').trim();
  if (!userId) return;
  const command = normalizeCommand(text);
  if (['/start', '/menu', '/help', 'menu'].includes(command)) {
    const home = privateHome(isAdmin(userId));
    return sendMessage(userId, home.text, home.keyboard);
  }
  if (command === '/cleanall' && isAdmin(userId)) return cleanChat(userId);
  if (!text || text.startsWith('/')) {
    const home = privateHome(isAdmin(userId));
    return sendMessage(userId, home.text, home.keyboard);
  }

  const mode = await inferModeFromPrivateHistory(userId);
  if (!mode) {
    const home = privateHome(isAdmin(userId));
    return sendMessage(userId, 'ℹ️ Avval “➕ TAKLIF BERISH” yoki “🔎 SO‘ROV BERISH” tugmasini bosing.\n\n' + home.text, home.keyboard);
  }

  try {
    const result = await publishListing(userId, mode, text);
    if (result.duplicate) return sendMessage(userId, '⚠️ Aynan shu e’lon oxirgi 7 kun ichida allaqachon joylashtirilgan.', privateMenu({ isAdmin: isAdmin(userId) }));
    return sendMessage(userId, mode === 'offer' ? '✅ Taklif UMUMIY CHATga joylashtirildi.' : '✅ So‘rov UMUMIY CHATga joylashtirildi.', privateMenu({ isAdmin: isAdmin(userId) }));
  } catch (error) {
    console.error('publish_failed', { code: error?.code || null, message: error?.message || String(error) });
    return sendMessage(userId, '⚠️ VK vaqtincha javob bermadi. E’loningiz yo‘qolmadi — xuddi shu xabarni qayta yuboring.', privateMenu({ isAdmin: isAdmin(userId) })).catch(() => {});
  }
}

async function handleGroupMessage(msg) {
  const peerId = Number(msg?.peer_id || 0);
  const fromId = Number(msg?.from_id || 0);
  const cmid = Number(msg?.conversation_message_id || 0);
  const command = normalizeCommand(msg?.text);
  if (['/menu', 'menu'].includes(command)) return Promise.allSettled([sendGroupMenu({ pin: isAdmin(fromId) }), deleteMessage(peerId, cmid)]);
  if (STRICT_MARKET_CHAT && Number(msg?.out || 0) !== 1) await deleteMessage(peerId, cmid);
}

async function handleCallback(obj) {
  const userId = Number(obj?.user_id || 0);
  const cmd = String(safePayload(obj?.payload)?.cmd || '');
  if (!userId) return;
  const run = async (work, successText) => {
    try {
      await work();
      await answerEvent(obj, successText || 'Bajarildi');
    } catch (error) {
      const cannotDm = [901, 902, 914].includes(Number(error?.code));
      await answerEvent(obj, cannotDm ? 'Avval “SHAXSIY BOT / KABINET”ni oching' : 'Xatolik. Qayta urinib ko‘ring');
      console.error('callback_action_failed', { cmd, code: error?.code || null, message: error?.message || String(error) });
    }
  };

  if (cmd === 'new_offer' || cmd === 'new_search') return run(() => sendEntryPrompt(userId, cmd === 'new_offer' ? 'offer' : 'search'), 'Davom etish uchun shaxsiy botni oching');
  if (['offers', 'searches', 'my_offers', 'my_searches'].includes(cmd)) return run(() => sendList(userId, cmd), 'Natija shaxsiy botga yuborildi');
  if (cmd === 'stats') return run(() => sendStats(userId), 'Statistika shaxsiy botga yuborildi');
  if (cmd === 'cabinet') return run(() => sendCabinet(userId), 'Kabinet shaxsiy botga yuborildi');
  if (cmd === 'open_market_chat') return run(() => sendMarketLink(userId), 'Umumiy chat havolasi yuborildi');
  if (cmd === 'admin_cleanall') return run(() => cleanChat(userId), 'Tozalash bajarildi');
  if (cmd === 'admin_pinmenu') {
    if (!isAdmin(userId)) return answerEvent(obj, 'Bu amal faqat admin uchun');
    return run(async () => {
      const result = await sendGroupMenu({ pin: true });
      await sendMessage(userId, result.pinned ? '✅ Menyu yangilandi va pin qilindi.' : '⚠️ Menyu yangilandi, lekin VK pin qilishga ruxsat bermadi.', privateMenu({ isAdmin: true }));
    }, 'Umumiy menyu yangilandi');
  }
  await answerEvent(obj, 'Noma’lum amal');
}

async function processEvent(event) {
  if (event?.type === 'message_event') return handleCallback(event.object || {});
  if (event?.type !== 'message_new') return;
  const msg = event?.object?.message || {};
  if (!msg || Number(msg?.out || 0) === 1) return;
  const peerId = Number(msg?.peer_id || 0);
  const fromId = Number(msg?.from_id || 0);
  if (peerId === PRIMARY_PEER_ID) return handleGroupMessage(msg);
  if (peerId > 0 && peerId === fromId) return handlePrivateMessage(msg);
}

module.exports = { processEvent, parseListing, normalizeListingText, inferModeFromPrivateHistory, listingMarker };
