const {
  getUserName,
  sendMessage,
  answerEvent,
  deleteMessage,
  deleteMessageRefs,
  pinMessage,
  getInviteLink,
  messageRef,
} = require('./vk');
const { privateMenu, privateHome, groupHome } = require('./ui');
const storage = require('./storage');

const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 0);
const ADMIN_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);

const isAdmin = (userId) => ADMIN_USER_ID > 0 && Number(userId) === ADMIN_USER_ID;
const isGroupPeer = (peerId) => Number(peerId) >= 2000000000;
const normalizeListingText = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
const normalizeCommand = (text) => String(text || '').replace(/^\[club\d+\|@[^\]]+\]\s*/i, '').trim().toLowerCase();
const listingMarker = (kind, userId) => `#AM2_${kind === 'search' ? 'SEARCH' : 'OFFER'}_${Number(userId)}`;
const isForwardedMessage = (msg) => Array.isArray(msg?.fwd_messages) && msg.fwd_messages.length > 0;

function safePayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function formatTime(value) {
  try {
    const date = typeof value === 'number' ? new Date(Number(value) * 1000) : new Date(value);
    return new Intl.DateTimeFormat('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return '';
  }
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
  return {
    kind,
    userId,
    text: body,
    date: Number(message?.date || 0),
    cmid: Number(message?.conversation_message_id || 0),
  };
}

async function sendEntryPrompt(userId, mode) {
  await storage.setMode(userId, mode);
  const offer = mode === 'offer';
  await sendMessage(userId, [
    offer ? '✈️ TAKLIF KIRITISH' : '🔎 SO‘ROV KIRITISH',
    '',
    offer ? 'Taklifingizni keyingi BITTA xabarda yozing.' : 'So‘rovingizni keyingi BITTA xabarda yozing.',
    '',
    offer ? 'Masalan: TAS–MOW 20 oktabr, HY, 4 ta joy, 220 USD, bagaj 20 kg.' : 'Masalan: TAS–MOW 20 oktabrga 3 ta joy kerak, bagaj bilan.',
    '',
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
    '📊 AVIA MARKET — 7 KUNLIK STATISTIKA',
    '',
    `✈️ Takliflar: ${Number(data?.offers || 0)}`,
    `🔎 So‘rovlar: ${Number(data?.searches || 0)}`,
    `📦 Mening takliflarim: ${Number(data?.my_offers || 0)}`,
    `📋 Mening so‘rovlarim: ${Number(data?.my_searches || 0)}`,
  ].join('\n'), privateMenu());
}

async function sendCabinet(userId) {
  const data = await storage.stats(userId);
  await sendMessage(userId, [
    '👤 AVIA MARKET — KABINET',
    '',
    `🆔 VK ID: ${userId}`,
    '📦 Tarif: Bepul',
    '✅ Holat: Faol',
    '',
    `✈️ 7 kunda takliflarim: ${Number(data?.my_offers || 0)}`,
    `🔎 7 kunda so‘rovlarim: ${Number(data?.my_searches || 0)}`,
  ].join('\n'), privateMenu());
}

async function sendMarketLink(userId) {
  const chatId = PRIMARY_PEER_ID - 2000000000;
  const directLink = chatId > 0 ? `https://vk.ru/im?sel=c${chatId}` : 'https://vk.ru/im';
  const inviteLink = PRIMARY_PEER_ID ? await getInviteLink(PRIMARY_PEER_ID) : null;
  const link = inviteLink || directLink;
  const label = inviteLink ? 'Chatga kirish / qo‘shilish havolasi' : 'Umumiy chatni ochish';
  await sendMessage(userId, `🌐 AVIA MARKET — ASOSIY UMUMIY CHAT\n\n${label}:\n👉 ${link}`, privateMenu());
}

async function rememberBotMessage(purpose, sent, peerId = PRIMARY_PEER_ID) {
  const ref = messageRef(sent);
  if (!ref.message_id && !ref.conversation_message_id) return ref;

  // Cleanup storage currently belongs to the primary Avia Market chat only.
  // Secondary managed chats must never leak their conversation_message_id into
  // primary-chat cleanup, because cmid values are local to each conversation.
  if (Number(peerId) !== PRIMARY_PEER_ID) return ref;

  try {
    await storage.trackBotMessage(purpose, ref);
  } catch (error) {
    console.warn('track_bot_message_failed', { purpose, code: error?.code || null });
  }
  return ref;
}

async function sendPrivateHome(userId, { pin = true } = {}) {
  const home = privateHome();
  const sent = await sendMessage(userId, home.text, home.keyboard);
  const pinned = pin ? await pinMessage(userId, sent, { force: true }) : false;
  return { sent, pinned };
}

async function sendGroupMenu({ peerId = PRIMARY_PEER_ID, pin = false, forcePin = false } = {}) {
  const targetPeerId = Number(peerId || 0);
  if (!isGroupPeer(targetPeerId)) throw new Error('A valid VK group-chat peer_id is required');
  const home = groupHome({ isPrimary: targetPeerId === PRIMARY_PEER_ID });
  const sent = await sendMessage(targetPeerId, home.text, home.keyboard);
  const ref = await rememberBotMessage('menu', sent, targetPeerId);
  const pinned = pin ? await pinMessage(targetPeerId, sent, { force: forcePin }) : false;
  return { sent, ref, pinned, peerId: targetPeerId };
}

async function cleanChat(userId) {
  if (!isAdmin(userId)) return sendMessage(userId, '⛔ Bu amal faqat admin uchun.');
  if (!PRIMARY_PEER_ID) return sendMessage(userId, '⚠️ Asosiy umumiy chat sozlanmagan.', privateMenu());

  let targets;
  try {
    const result = await storage.listCleanupTargets(1000);
    targets = Array.isArray(result?.items) ? result.items : [];
  } catch (error) {
    console.error('cleanup_targets_failed', { code: error?.code || null, message: error?.message || String(error) });
    return sendMessage(userId, '⚠️ Tozalash ro‘yxatini olishda xato bo‘ldi. Keyinroq qayta urinib ko‘ring.', privateMenu());
  }

  let deleted = 0;
  const listingIds = [];
  const botMessageIds = [];

  for (let i = 0; i < targets.length; i += 25) {
    const batch = targets.slice(i, i + 25);
    const refs = batch.map((item) => ({
      message_id: Number(item?.vk_message_id || 0) || null,
      conversation_message_id: Number(item?.vk_conversation_message_id || 0) || null,
    })).filter((ref) => ref.message_id || ref.conversation_message_id);
    if (!refs.length) continue;

    try {
      const result = await deleteMessageRefs(PRIMARY_PEER_ID, refs);
      deleted += Number(result?.deleted || refs.length);
      for (const item of batch) {
        if (item?.source === 'listing' && Number(item?.id || 0) > 0) listingIds.push(Number(item.id));
        if (item?.source === 'bot' && Number(item?.id || 0) > 0) botMessageIds.push(Number(item.id));
      }
    } catch (error) {
      console.warn('clean_batch_failed', { code: error?.code || null, size: batch.length });
    }
  }

  if (listingIds.length || botMessageIds.length) {
    try {
      await storage.markDeleted(listingIds, botMessageIds);
    } catch (error) {
      console.error('cleanup_mark_deleted_failed', { code: error?.code || null });
    }
  }

  let rulesPinned = false;
  try {
    const rules = await sendGroupMenu({ peerId: PRIMARY_PEER_ID, pin: true, forcePin: true });
    rulesPinned = Boolean(rules?.pinned);
  } catch (error) {
    console.warn('cleanup_rules_refresh_failed', { code: error?.code || null });
  }

  return sendMessage(userId, [
    '🧹 BOT E’LONLARI TOZALANDI',
    '',
    `✅ Asosiy chatdagi bot kuzatgan xabarlar o‘chirildi: ${deleted}`,
    targets.length === 0 ? 'ℹ️ O‘chirish uchun saqlangan eski e’lonlar yo‘q edi.' : '',
    rulesPinned ? '📌 Asosiy chat qoidalari yangilandi va pin qilindi.' : '📌 Asosiy chat qoidalari yuborildi.',
  ].filter(Boolean).join('\n'), privateMenu());
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
    const ref = messageRef(sent);
    try {
      await storage.finalizeListing(created.id, userId, 'published', ref, null);
    } catch (error) {
      console.error('storage_finalize_failed', { id: created.id, code: error?.code || null, message: error?.message || String(error) });
    }
    return sendMessage(userId, kind === 'offer' ? '✅ Taklif ASOSIY UMUMIY CHATga joylashtirildi.' : '✅ So‘rov ASOSIY UMUMIY CHATga joylashtirildi.', privateMenu());
  } catch (error) {
    console.error('publish_failed', { code: error?.code || null, message: error?.message || String(error) });
    await Promise.allSettled([
      storage.finalizeListing(created.id, userId, 'failed', {}, error?.code || 'vk_send_failed'),
      storage.setMode(userId, kind),
    ]);
    return sendMessage(userId, '⚠️ VK asosiy umumiy chatga yuborishni qabul qilmadi. Rejim saqlandi — shu xabarni qayta yuboring.', privateMenu()).catch(() => {});
  }
}

async function handlePrivateMessage(msg) {
  const userId = Number(msg?.from_id || 0);
  const text = String(msg?.text || '').trim();
  if (!userId) return;
  const command = normalizeCommand(text);

  if (['/start', '/menu', '/help', 'menu'].includes(command)) {
    return sendPrivateHome(userId, { pin: true });
  }
  if (command === '/cleanall' && isAdmin(userId)) return cleanChat(userId);
  if (!text || text.startsWith('/')) {
    return sendPrivateHome(userId, { pin: true });
  }

  return handleListingText(userId, text);
}

async function handleGroupMessage(msg) {
  const peerId = Number(msg?.peer_id || 0);
  const fromId = Number(msg?.from_id || 0);
  const cmid = Number(msg?.conversation_message_id || 0);
  const text = String(msg?.text || '').trim();
  const command = normalizeCommand(text);

  if (!isGroupPeer(peerId)) return;

  if (fromId && cmid && isForwardedMessage(msg)) {
    const deleted = await deleteMessage(peerId, cmid);
    if (!deleted) console.warn('forward_delete_failed', { peerId, fromId, cmid });
    await sendMessage(
      fromId,
      '🚫 Bu chatga boshqa gruppa, kanal yoki chatdan pereslat (forward) qilingan xabar yuborish mumkin emas. Xabaringiz o‘chirildi.',
      privateMenu(),
    ).catch(() => {});
    return;
  }

  if (['/menu', 'menu'].includes(command)) {
    const admin = isAdmin(fromId);
    return Promise.allSettled([
      sendGroupMenu({ peerId, pin: admin, forcePin: admin }),
      deleteMessage(peerId, cmid),
    ]);
  }

  if (!fromId || !cmid || normalizeListingText(text).length < 10) return;

  try {
    const result = await storage.checkChatDuplicate(fromId, peerId, text);
    if (!result?.duplicate) return;

    const deleted = await deleteMessage(peerId, cmid);
    if (!deleted) console.warn('duplicate_delete_failed', { peerId, fromId, cmid });
    await sendMessage(
      fromId,
      '🛡 Bir xil ma’lumot bitta chatga 24 soat ichida faqat 1 marta yuboriladi. Takroriy xabaringiz o‘chirildi.',
      privateMenu(),
    ).catch(() => {});
  } catch (error) {
    console.warn('chat_duplicate_check_failed', { peerId, code: error?.code || null, message: error?.message || String(error) });
  }
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

  if (cmd === 'new_offer') return run(() => sendEntryPrompt(userId, 'offer'), 'Taklif matnini yuboring');
  if (cmd === 'new_search') return run(() => sendEntryPrompt(userId, 'search'), 'So‘rov matnini yuboring');
  if (['offers', 'searches', 'my_offers', 'my_searches'].includes(cmd)) return run(() => sendList(userId, cmd), 'Natija shaxsiy botga yuborildi');
  if (cmd === 'stats') return run(() => sendStats(userId), 'Statistika shaxsiy botga yuborildi');
  if (cmd === 'cabinet') return run(() => sendCabinet(userId), 'Kabinet shaxsiy botga yuborildi');
  if (cmd === 'open_market_chat') return run(() => sendMarketLink(userId), 'Asosiy umumiy chat havolasi yuborildi');
  if (cmd === 'admin_cleanall') return run(() => cleanChat(userId), 'Tozalash yakunlandi');
  if (cmd === 'admin_pinmenu') {
    if (!isAdmin(userId)) return answerEvent(obj, 'Bu amal faqat admin uchun');
    return run(async () => {
      const result = await sendGroupMenu({ peerId: PRIMARY_PEER_ID, pin: true, forcePin: true });
      await sendMessage(
        userId,
        result.pinned ? '✅ Qoidalar yangilandi va ASOSIY UMUMIY CHATga zakrepit qilindi.' : '✅ Qoidalar asosiy chatga yuborildi. VK pin qilishga ruxsat bermasa, yuqoridan qo‘lda zakrepit qiling.',
        privateMenu(),
      );
    }, 'Asosiy chat qoidalari yangilandi');
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

  // Multi-chat mode: every VK conversation where the community bot is present
  // gets the same moderation policy. The primary peer remains the only chat
  // receiving structured listings from the private bot.
  if (isGroupPeer(peerId)) return handleGroupMessage(msg);
  if (peerId > 0 && peerId === fromId) return handlePrivateMessage(msg);
}

module.exports = {
  processEvent,
  parseListing,
  normalizeListingText,
  listingMarker,
  isForwardedMessage,
  isGroupPeer,
  formatStoredList,
  sendPrivateHome,
  sendGroupMenu,
  cleanChat,
};
