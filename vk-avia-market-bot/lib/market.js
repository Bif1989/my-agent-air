const { getHistory, getUserName, sendMessage, answerEvent, deleteMessage, pinMessage, vkApi } = require('./vk');
const { privateMenu, privateHome, groupHome } = require('./ui');
const storage = require('./storage');

const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 0);
const ADMIN_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);
const STRICT_MARKET_CHAT = process.env.VK_STRICT_MARKET_CHAT !== 'false';

const isAdmin = (userId) => ADMIN_USER_ID > 0 && Number(userId) === ADMIN_USER_ID;
const normalizeListingText = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
const normalizeCommand = (text) => String(text || '').replace(/^\[club\d+\|@[^\]]+\]\s*/i, '').trim().toLowerCase();
const listingMarker = (kind, userId) => `#AM2_${kind === 'search' ? 'SEARCH' : 'OFFER'}_${Number(userId)}`;

function safePayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function formatTime(value) {
  try {
    const date = typeof value === 'number' ? new Date(Number(value) * 1000) : new Date(value);
    return new Intl.DateTimeFormat('uz-UZ', {
      timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
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

async function sendEntryPrompt(userId, mode) {
  await storage.setMode(userId, mode);
  const offer = mode === 'offer';
  await sendMessage(userId, [
    offer ? '✈️ TAKLIF KIRITISH' : '🔎 SO‘ROV KIRITISH', '',
    offer ? 'Taklifingizni keyingi BITTA xabarda yozing.' : 'So‘rovingizni keyingi BITTA xabarda yozing.', '',
    offer ? 'Masalan: TAS–MOW 20 oktabr, HY, 4 ta joy, 220 USD, bagaj 20 kg.' : 'Masalan: TAS–MOW 20 oktabrga 3 ta joy kerak, bagaj bilan.', '',
    '🛡 Bir xil e’lon 24 soat ichida qayta chiqmaydi.',
    '⏱ Yangi e’lonlar orasida kamida 30 soniya bo‘lishi kerak.',
  ].join('\n'), privateMenu());
}

async function publishListing(userId, kind, text) {
  if (!PRIMARY_PEER_ID) throw new Error('VK_PRIMARY_PEER_ID is not configured');
  const name = await getUserName(userId);
  const now = Math.floor(Date.now() / 1000);
  return sendMessage(PRIMARY_PEER_ID, [
    kind === 'search' ? '🔎 SO‘ROV' : '✈️ TAKLIF',
    `👤 [id${userId}|${name}]`,
    `🕒 ${formatTime(now)}`,
    '',
    String(text).trim(),
    '',
    '#AviaMarket',
    listingMarker(kind, userId),
  ].join('\n'));
}

function sentMessageId(result) {
  if (typeof result === 'number') return result;
  return Number(result?.message_id || result?.conversation_message_id || 0) || null;
}

function formatStoredList(title, items) {
  if (!Array.isArray(items) || !items.length) return `${title}\n\nHozircha ma’lumot yo‘q.`;
  const body = items.slice(0, 10).map((item, index) => [
    `${index + 1}. ${item.kind === 'search' ? '🔎' : '✈️'} ${formatTime(item.created_at)}`,
    String(item.body || '').trim(),
  ].join('\n')).join('\n\n────────\n\n');
  return `${title}\n\n${body}`.slice(0, 3900);
}

async function sendList(userId, action) {
  const kind = action.includes('search') ? 'search' : 'offer';
  const mine = action.startsWith('my_');
  const result = mine ? await storage.listUser(userId, kind, 10) : await storage.listRecent(kind, 10);
  const titles = {
    offers: '🌐 SO‘NGGI TAKLIFLAR',
    searches: '👥 SO‘NGGI SO‘ROVLAR',
    my_offers: '📦 MENING TAKLIFLARIM',
    my_searches: '📋 MENING SO‘ROVLARIM',
  };
  await sendMessage(userId, formatStoredList(titles[action] || 'AVIA MARKET', result?.items || []), privateMenu());
}

async function sendStats(userId) {
  const data = await storage.stats(userId);
  await sendMessage(userId, [
    '📊 AVIA MARKET — 7 KUNLIK STATISTIKA', '',
    `✈️ Takliflar: ${Number(data?.offers || 0)}`,
    `🔎 So‘rovlar: ${Number(data?.searches || 0)}`,
    `📦 Mening takliflarim: ${Number(data?.my_offers || 0)}`,
    `📋 Mening so‘rovlarim: ${Number(data?.my_searches || 0)}`,
  ].join('\n'), privateMenu());
}

async function sendCabinet(userId) {
  const data = await storage.stats(userId);
  await sendMessage(userId, [
    '👤 AVIA MARKET — KABINET', '',
    `🆔 VK ID: ${userId}`,
    '📦 Tarif: Bepul',
    '✅ Holat: Faol', '',
    `✈️ 7 kunda takliflarim: ${Number(data?.my_offers || 0)}`,
    `🔎 7 kunda so‘rovlarim: ${Number(data?.my_searches || 0)}`,
  ].join('\n'), privateMenu());
}

async function sendMarketLink(userId) {
  const chatId = PRIMARY_PEER_ID - 2000000000;
  const link = chatId > 0 ? `https://vk.ru/im?sel=c${chatId}` : 'https://vk.ru/im';
  await sendMessage(userId, `🌐 AVIA MARKET — UMUMIY CHAT\n\n👉 ${link}`, privateMenu());
}

async function sendGroupMenu({ pin = false } = {}) {
  const home = groupHome();
  const sent = await sendMessage(PRIMARY_PEER_ID, home.text, home.keyboard);
  return { pinned: pin ? await pinMessage(PRIMARY_PEER_ID, sent) : false };
}

async function cleanChat(userId) {
  if (!isAdmin(userId)) return sendMessage(userId, '⛔ Bu amal faqat admin uchun.');
  try {
    const history = await getHistory(PRIMARY_PEER_ID, 200);
    const cmids = history.map((item) => Number(item?.conversation_message_id || 0)).filter(Boolean);
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
    return sendMessage(userId, `🧹 Tozalash yakunlandi.\n✅ O‘chirildi: ${deleted}`, privateMenu());
  } catch (error) {
    console.warn('clean_history_unavailable', { code: error?.code || null });
    return sendMessage(userId, '⚠️ VK umumiy chat tarixini o‘qishga ruxsat bermadi. Tozalash bajarilmadi.', privateMenu());
  }
}

async function handleListingText(userId, text) {
  let created;
  try {
    created = await storage.createListing(userId, text);
  } catch (error) {
    console.error('storage_create_failed', { code: error?.code || null, message: error?.message || String(error) });
    return sendMessage(userId, '⚠️ Saqlash xizmati vaqtincha javob bermadi. Bir ozdan keyin qayta urinib ko‘ring.', privateMenu());
  }

  if (created?.status === 'no_mode') {
    const home = privateHome();
    return sendMessage(userId, 'ℹ️ Avval “➕ TAKLIF BERISH” yoki “🔎 SO‘ROV BERISH” tugmasini bosing.\n\n' + home.text, home.keyboard);
  }
  if (created?.status === 'invalid_input') {
    return sendMessage(userId, '⚠️ E’lon matni juda qisqa yoki juda uzun. 2–2000 belgi oralig‘ida yuboring.', privateMenu());
  }
  if (created?.status === 'duplicate') {
    return sendMessage(userId, '🛡 Aynan shu e’lon oxirgi 24 soat ichida allaqachon yuborilgan. Qayta joylanmadi.', privateMenu());
  }
  if (created?.status === 'rate_limited') {
    const seconds = Math.max(1, Number(created?.retry_after || 30));
    return sendMessage(userId, `⏱ Juda tez yuboryapsiz. ${seconds} soniya kutib, shu xabarni yana yuboring.`, privateMenu());
  }
  if (!created?.ok || created?.status !== 'created' || !created?.id) {
    console.error('storage_create_unexpected', { status: created?.status || null });
    return sendMessage(userId, '⚠️ E’lonni saqlashda kutilmagan xato bo‘ldi. Qayta urinib ko‘ring.', privateMenu());
  }

  const kind = created.kind === 'search' ? 'search' : 'offer';
  try {
    const sent = await publishListing(userId, kind, text);
    try {
      await storage.finalizeListing(created.id, userId, 'published', sentMessageId(sent));
    } catch (error) {
      console.error('storage_finalize_failed', { id: created.id, code: error?.code || null });
    }
    return sendMessage(userId, kind === 'offer' ? '✅ Taklif UMUMIY CHATga joylashtirildi.' : '✅ So‘rov UMUMIY CHATga joylashtirildi.', privateMenu());
  } catch (error) {
    console.error('publish_failed', { code: error?.code || null, message: error?.message || String(error) });
    await Promise.allSettled([
      storage.finalizeListing(created.id, userId, 'failed', null, error?.code || 'vk_send_failed'),
      storage.setMode(userId, kind),
    ]);
    return sendMessage(userId, '⚠️ VK umumiy chatga yuborishni qabul qilmadi. Rejim saqlandi — shu xabarni qayta yuboring.', privateMenu()).catch(() => {});
  }
}

async function handlePrivateMessage(msg) {
  const userId = Number(msg?.from_id || 0);
  const text = String(msg?.text || '').trim();
  if (!userId) return;
  const command = normalizeCommand(text);

  if (['/start', '/menu', '/help', 'menu'].includes(command)) {
    const home = privateHome();
    return sendMessage(userId, home.text, home.keyboard);
  }
  if (command === '/cleanall' && isAdmin(userId)) return cleanChat(userId);
  if (!text || text.startsWith('/')) {
    const home = privateHome();
    return sendMessage(userId, home.text, home.keyboard);
  }

  return handleListingText(userId, text);
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
  if (cmd === 'admin_cleanall') return run(() => cleanChat(userId), 'Tozalash tekshirildi');
  if (cmd === 'admin_pinmenu') {
    if (!isAdmin(userId)) return answerEvent(obj, 'Bu amal faqat admin uchun');
    return run(async () => {
      const result = await sendGroupMenu({ pin: true });
      await sendMessage(userId, result.pinned ? '✅ Menyu yangilandi va pin qilindi.' : '⚠️ Menyu yangilandi, lekin VK pin qilishga ruxsat bermadi.', privateMenu());
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

module.exports = { processEvent, parseListing, normalizeListingText, listingMarker, formatStoredList };
