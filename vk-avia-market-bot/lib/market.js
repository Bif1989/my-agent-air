const {
  getUserName,
  sendMessage,
  editMessage,
  answerEvent,
  deleteMessage,
  deleteMessageRefs,
  pinMessage,
  getInviteLink,
  messageRef,
} = require('./vk');
const {
  privateMenu,
  profileMenu,
  listingManageMenu,
  confirmDeleteMenu,
  privateHome,
  groupHome,
} = require('./ui');
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
    if (/^(👤|🏢|📞|🕒|✏️)\s/i.test(value)) return false;
    if (/^✈️\s+Telegram:/i.test(value)) return false;
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

function normalizeProfileValue(value) {
  const text = String(value || '').trim();
  return !text || text === '-' ? null : text;
}

function normalizeTelegram(value) {
  let text = normalizeProfileValue(value);
  if (!text) return null;
  text = text.replace(/^https?:\/\/(?:www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@+/, '');
  if (!text) return null;
  if (!/^[A-Za-z0-9_]{4,64}$/.test(text)) return null;
  return `@${text}`;
}

function parseProfileInput(text) {
  const parts = String(text || '').split('|').map((part) => part.trim());
  if (parts.length !== 3) return null;
  const company = normalizeProfileValue(parts[0]);
  const phone = normalizeProfileValue(parts[1]);
  const rawTelegram = normalizeProfileValue(parts[2]);
  const telegram = normalizeTelegram(parts[2]);
  if ((company && company.length > 100) || (phone && phone.length > 40)) return null;
  if (rawTelegram && !telegram) return null;
  return { company, phone, telegram };
}

function listingRefs(listing) {
  return {
    message_id: Number(listing?.vk_message_id || 0) || null,
    conversation_message_id: Number(listing?.vk_conversation_message_id || 0) || null,
  };
}

function hasMessageRef(refs) {
  return Boolean(Number(refs?.message_id || 0) || Number(refs?.conversation_message_id || 0));
}

async function buildListingText(userId, kind, text, { edited = false } = {}) {
  const [name, profile] = await Promise.all([
    getUserName(userId),
    storage.getProfile(userId).catch((error) => {
      console.warn('profile_read_for_listing_failed', { userId, code: error?.code || null });
      return {};
    }),
  ]);
  const now = Math.floor(Date.now() / 1000);
  return [
    kind === 'search' ? '🔎 SO‘ROV' : '✈️ TAKLIF',
    `👤 [id${userId}|${name}]`,
    profile?.company ? `🏢 ${profile.company}` : null,
    profile?.phone ? `📞 ${profile.phone}` : null,
    profile?.telegram ? `✈️ Telegram: ${profile.telegram}` : null,
    edited ? `✏️ Yangilandi: ${formatTime(now)}` : `🕒 ${formatTime(now)}`,
    '',
    String(text).trim(),
    '',
    '#AviaMarket',
    listingMarker(kind, userId),
  ].filter((line) => line !== null).join('\n');
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
    '👤 KABINETda saqlangan telefon, Telegram va kompaniya nomi e’londa avtomatik chiqadi.',
    '🛡 Bir xil e’lon 24 soat ichida qayta chiqmaydi.',
    '⏱ Yangi e’lonlar orasida kamida 30 soniya bo‘lishi kerak.',
    '↩️ Bekor qilish: /menu',
  ].join('\n'), privateMenu());
}

async function publishListing(userId, kind, text) {
  if (!PRIMARY_PEER_ID) throw new Error('VK_PRIMARY_PEER_ID is not configured');
  const post = await buildListingText(userId, kind, text);
  return sendMessage(PRIMARY_PEER_ID, post);
}

function formatStoredList(title, items) {
  if (!Array.isArray(items) || !items.length) return `${title}\n\nHozircha ma’lumot yo‘q.`;
  const body = items.slice(0, 10).map((item, index) => [
    `${index + 1}. ${item.kind === 'search' ? '🔎' : '✈️'} ${formatTime(item.created_at)}`,
    String(item.body || '').trim(),
  ].join('\n')).join('\n\n────────\n\n');
  return `${title}\n\n${body}`.slice(0, 3900);
}

function formatManagedList(title, items) {
  if (!Array.isArray(items) || !items.length) return `${title}\n\nHozircha e’lon yo‘q.`;
  const body = items.slice(0, 5).map((item, index) => {
    const text = String(item.body || '').trim();
    const short = text.length > 420 ? `${text.slice(0, 417)}...` : text;
    return `${index + 1}. #${Number(item.id)} · ${formatTime(item.updated_at || item.created_at)}\n${short}`;
  }).join('\n\n────────\n\n');
  return [title, '', body, '', 'Pastdagi raqam bo‘yicha:', '✏️ — o‘zgartirish   🗑 — o‘chirish'].join('\n').slice(0, 3900);
}

async function sendList(userId, action) {
  const kind = action.includes('search') ? 'search' : 'offer';
  const mine = action.startsWith('my_');
  const titles = {
    offers: '🌐 SO‘NGGI TAKLIFLAR',
    searches: '👥 SO‘NGGI SO‘ROVLAR',
    my_offers: '📦 MENING TAKLIFLARIM',
    my_searches: '📋 MENING SO‘ROVLARIM',
  };

  if (mine) {
    const result = await storage.listUser(userId, kind, 5);
    const items = Array.isArray(result?.items) ? result.items.slice(0, 5) : [];
    return sendMessage(userId, formatManagedList(titles[action], items), listingManageMenu(items));
  }

  const result = await storage.listRecent(kind, 10);
  return sendMessage(userId, formatStoredList(titles[action] || 'AVIA MARKET', result?.items || []), privateMenu());
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
  const [data, profile, name] = await Promise.all([
    storage.stats(userId),
    storage.getProfile(userId),
    getUserName(userId),
  ]);
  await sendMessage(userId, [
    '👤 AVIA MARKET — KABINET',
    '',
    `👤 VK: [id${userId}|${name}]`,
    `🏢 Kompaniya: ${profile?.company || 'Kiritilmagan'}`,
    `📞 Telefon: ${profile?.phone || 'Kiritilmagan'}`,
    `✈️ Telegram: ${profile?.telegram || 'Kiritilmagan'}`,
    '',
    'ℹ️ Shu kontaktlar yangi Taklif/So‘rovlaringizda avtomatik ko‘rinadi.',
    '📦 Tarif: Bepul',
    '✅ Holat: Faol',
    '',
    `✈️ 7 kunda takliflarim: ${Number(data?.my_offers || 0)}`,
    `🔎 7 kunda so‘rovlarim: ${Number(data?.my_searches || 0)}`,
  ].join('\n'), profileMenu());
}

async function sendProfilePrompt(userId) {
  await storage.setMode(userId, 'profile');
  return sendMessage(userId, [
    '✏️ KONTAKTLARNI SOZLASH',
    '',
    'Keyingi BITTA xabarda 3 qismni “ | ” bilan ajratib yuboring:',
    'Kompaniya | Telefon | Telegram',
    '',
    'Masalan:',
    'BIF AVIA | +998 91 292 40 10 | @bif89',
    '',
    'Biror maydonni olib tashlash uchun o‘rniga - yozing.',
    'Masalan: BIF AVIA | +998 91 292 40 10 | -',
    '',
    '⚠️ Saqlangan kontaktlar yangi e’lonlaringizda hammaga ko‘rinadi.',
    '↩️ Bekor qilish: /menu',
  ].join('\n'), privateMenu());
}

async function handleProfileText(userId, text) {
  const parsed = parseProfileInput(text);
  if (!parsed) {
    return sendMessage(userId, [
      '⚠️ Format noto‘g‘ri.',
      'Shunday yuboring:',
      'Kompaniya | Telefon | @telegram',
      '',
      'Masalan: BIF AVIA | +998 91 292 40 10 | @bif89',
      'Telegram username 4–64 ta harf/raqam/_ bo‘lishi kerak.',
    ].join('\n'), privateMenu());
  }

  const result = await storage.setProfile(userId, parsed);
  if (!result?.ok) return sendMessage(userId, '⚠️ Kontaktlarni saqlashda xato bo‘ldi. Qayta urinib ko‘ring.', privateMenu());
  await sendMessage(userId, '✅ Kontaktlaringiz saqlandi. Endi yangi Taklif/So‘rovlarda avtomatik chiqadi.', privateMenu());
  return sendCabinet(userId);
}

async function sendEditPrompt(userId, listingId) {
  const listing = await storage.getOwnListing(userId, listingId);
  if (!listing?.ok || listing?.state !== 'published') {
    return sendMessage(userId, '⚠️ Bu e’lon topilmadi yoki endi o‘zgartirib bo‘lmaydi.', privateMenu());
  }
  await storage.setMode(userId, `edit:${Number(listingId)}`);
  return sendMessage(userId, [
    `✏️ E’LON #${Number(listingId)} NI O‘ZGARTIRISH`,
    '',
    'Hozirgi matn:',
    String(listing.body || ''),
    '',
    'Yangi matnni keyingi BITTA xabarda to‘liq yuboring.',
    'Kontaktlar KABINETdagi joriy ma’lumotlardan qayta olinadi.',
    '↩️ Bekor qilish: /menu',
  ].join('\n').slice(0, 3900), privateMenu());
}

async function sendDeleteConfirm(userId, listingId) {
  const listing = await storage.getOwnListing(userId, listingId);
  if (!listing?.ok || listing?.state !== 'published') {
    return sendMessage(userId, '⚠️ Bu e’lon topilmadi yoki allaqachon o‘chirilgan.', privateMenu());
  }
  return sendMessage(userId, [
    `🗑 E’LON #${Number(listingId)} NI O‘CHIRISH`,
    '',
    String(listing.body || '').slice(0, 1000),
    '',
    'Rostdan ham o‘chirilsinmi? E’lon ASOSIY UMUMIY CHATdan ham olib tashlanadi.',
  ].join('\n'), confirmDeleteMenu(listingId));
}

async function deleteOwnListing(userId, listingId) {
  const listing = await storage.getOwnListing(userId, listingId);
  if (!listing?.ok || listing?.state !== 'published') {
    return sendMessage(userId, '⚠️ Bu e’lon topilmadi yoki allaqachon o‘chirilgan.', privateMenu());
  }

  const refs = listingRefs(listing);
  if (hasMessageRef(refs)) {
    try {
      await deleteMessageRefs(PRIMARY_PEER_ID, [refs]);
    } catch (error) {
      console.error('owned_listing_vk_delete_failed', { listingId, userId, code: error?.code || null });
      throw error;
    }
  }

  const result = await storage.deleteOwnListing(userId, listingId);
  if (!result?.ok || result?.status !== 'deleted') throw new Error(`delete_listing_${result?.status || 'failed'}`);
  await storage.clearMode(userId).catch(() => {});
  await sendMessage(userId, `✅ E’lon #${Number(listingId)} o‘chirildi.`, privateMenu());
  return true;
}

async function handleEditListingText(userId, listingId, text) {
  const cleanText = String(text || '').trim();
  if (cleanText.length < 2 || cleanText.length > 2000) {
    return sendMessage(userId, '⚠️ Yangi e’lon matni 2–2000 belgi oralig‘ida bo‘lishi kerak. Qayta yuboring.', privateMenu());
  }

  const listing = await storage.getOwnListing(userId, listingId);
  if (!listing?.ok || listing?.state !== 'published') {
    await storage.clearMode(userId).catch(() => {});
    return sendMessage(userId, '⚠️ E’lon topilmadi yoki endi o‘zgartirib bo‘lmaydi.', privateMenu());
  }

  const oldText = String(listing.body || '');
  const oldRefs = listingRefs(listing);
  const firstUpdate = await storage.updateOwnListing(userId, listingId, cleanText, oldRefs);
  if (firstUpdate?.status === 'duplicate') {
    return sendMessage(userId, '🛡 Aynan shu matndagi boshqa e’loningiz oxirgi 24 soatda mavjud. Boshqa matn yuboring yoki /menu bilan bekor qiling.', privateMenu());
  }
  if (!firstUpdate?.ok) {
    return sendMessage(userId, '⚠️ E’lonni yangilashda xato bo‘ldi. Qayta urinib ko‘ring.', privateMenu());
  }

  const post = await buildListingText(userId, listing.kind, cleanText, { edited: true });
  let finalRefs = oldRefs;
  let publicUpdated = false;

  if (hasMessageRef(oldRefs)) {
    publicUpdated = await editMessage(PRIMARY_PEER_ID, oldRefs, post);
  }

  if (!publicUpdated) {
    let sent;
    try {
      sent = await sendMessage(PRIMARY_PEER_ID, post);
      finalRefs = messageRef(sent);
    } catch (error) {
      await storage.updateOwnListing(userId, listingId, oldText, oldRefs).catch(() => {});
      await storage.setMode(userId, `edit:${Number(listingId)}`).catch(() => {});
      throw error;
    }

    if (hasMessageRef(oldRefs)) {
      try {
        await deleteMessageRefs(PRIMARY_PEER_ID, [oldRefs]);
      } catch (error) {
        await deleteMessageRefs(PRIMARY_PEER_ID, [finalRefs]).catch(() => {});
        await storage.updateOwnListing(userId, listingId, oldText, oldRefs).catch(() => {});
        await storage.setMode(userId, `edit:${Number(listingId)}`).catch(() => {});
        console.error('owned_listing_replace_cleanup_failed', { listingId, userId, code: error?.code || null });
        throw error;
      }
    }

    const refUpdate = await storage.updateOwnListing(userId, listingId, cleanText, finalRefs);
    if (!refUpdate?.ok) {
      console.error('owned_listing_ref_update_failed', { listingId, userId, status: refUpdate?.status || null });
    }
  }

  await storage.clearMode(userId).catch(() => {});
  await sendMessage(userId, `✅ E’lon #${Number(listingId)} yangilandi.`, privateMenu());
  return true;
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

  if (created?.status === 'no_mode' || created?.status === 'wrong_mode') {
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

  if (['/start', '/menu', '/help', 'menu', '/cancel'].includes(command)) {
    await storage.clearMode(userId).catch(() => {});
    return sendPrivateHome(userId, { pin: true });
  }
  if (command === '/cleanall' && isAdmin(userId)) return cleanChat(userId);
  if (!text || text.startsWith('/')) {
    return sendPrivateHome(userId, { pin: true });
  }

  let mode;
  try {
    const state = await storage.getMode(userId);
    mode = String(state?.mode || '');
  } catch (error) {
    console.error('input_mode_read_failed', { userId, code: error?.code || null });
    return sendMessage(userId, '⚠️ Saqlash xizmati vaqtincha javob bermadi. Bir ozdan keyin qayta urinib ko‘ring.', privateMenu());
  }

  if (mode === 'profile') return handleProfileText(userId, text);
  if (/^edit:\d+$/.test(mode)) return handleEditListingText(userId, Number(mode.split(':')[1]), text);
  if (mode === 'offer' || mode === 'search') return handleListingText(userId, text);

  const home = privateHome();
  return sendMessage(userId, 'ℹ️ Amal tanlanmagan. Menyudan kerakli tugmani bosing.\n\n' + home.text, home.keyboard);
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
  const data = safePayload(obj?.payload);
  const cmd = String(data?.cmd || '');
  const listingId = Number(data?.id || 0);
  if (!userId) return;

  const run = async (work, successText) => {
    try {
      const result = await work();
      await answerEvent(obj, result?.snackbar || successText || 'Bajarildi');
      return result;
    } catch (error) {
      const cannotDm = [901, 902, 914].includes(Number(error?.code));
      await answerEvent(obj, cannotDm ? 'Avval “SHAXSIY BOT / KABINET”ni oching' : 'Xatolik. Qayta urinib ko‘ring');
      console.error('callback_action_failed', { cmd, listingId: listingId || null, code: error?.code || null, message: error?.message || String(error) });
      return null;
    }
  };

  if (cmd === 'home') return run(async () => {
    await storage.clearMode(userId).catch(() => {});
    return sendPrivateHome(userId, { pin: false });
  }, 'Menyu yuborildi');
  if (cmd === 'new_offer') return run(() => sendEntryPrompt(userId, 'offer'), 'Taklif matnini yuboring');
  if (cmd === 'new_search') return run(() => sendEntryPrompt(userId, 'search'), 'So‘rov matnini yuboring');
  if (['offers', 'searches', 'my_offers', 'my_searches'].includes(cmd)) return run(() => sendList(userId, cmd), 'Natija shaxsiy botga yuborildi');
  if (cmd === 'stats') return run(() => sendStats(userId), 'Statistika shaxsiy botga yuborildi');
  if (cmd === 'cabinet') return run(() => sendCabinet(userId), 'Kabinet shaxsiy botga yuborildi');
  if (cmd === 'profile_edit') return run(() => sendProfilePrompt(userId), 'Kontaktlarni yuboring');
  if (cmd === 'edit_listing' && listingId > 0) return run(() => sendEditPrompt(userId, listingId), 'Yangi matnni yuboring');
  if (cmd === 'delete_listing' && listingId > 0) return run(() => sendDeleteConfirm(userId, listingId), 'Tasdiqlang');
  if (cmd === 'confirm_delete_listing' && listingId > 0) return run(() => deleteOwnListing(userId, listingId), 'E’lon o‘chirildi');
  if (cmd === 'cancel_delete_listing') return run(() => sendPrivateHome(userId, { pin: false }), 'Bekor qilindi');
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
  parseProfileInput,
  formatStoredList,
  formatManagedList,
  buildListingText,
  sendPrivateHome,
  sendGroupMenu,
  cleanChat,
};
