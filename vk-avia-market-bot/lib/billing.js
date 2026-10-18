const { getUserName, sendMessage, answerEvent, messageRef } = require('./vk');
const storage = require('./storage');
const { privateMenu, privateHome, adminHome } = require('./ui');
const { buildListingText, processEvent } = require('./market');
const { buildPaymentUrl } = require('./click');

const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 0);
const ADMIN_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);
const TOPUP_AMOUNTS = new Set([5000, 10000, 20000, 50000, 100000, 200000]);

function payload(cmd, extra = {}) { return JSON.stringify({ cmd, v: 3, ...extra }); }
function textButton(label, cmd, color = 'secondary', extra = {}) {
  return { action: { type: 'text', label, payload: payload(cmd, extra) }, color };
}
function safePayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}
function formatMoney(value) {
  const number = Math.max(0, Number(value || 0));
  return `${new Intl.NumberFormat('uz-UZ').format(Number.isFinite(number) ? number : 0)} so‘m`;
}
function cabinetMenu() {
  return { inline: true, buttons: [
    [textButton('💰 BALANS / TO‘LDIRISH', 'billing', 'positive')],
    [textButton('✏️ KONTAKTLARNI SOZLASH', 'profile_edit', 'primary')],
    [
      textButton('📦 TAKLIFLARIM', 'my_offers'),
      textButton('📋 SO‘ROVLARIM', 'my_searches'),
    ],
    [textButton('🏠 MENYU', 'home')],
  ] };
}
function billingMenu() {
  return { inline: true, buttons: [
    [
      textButton('5 000 so‘m', 'topup_amount', 'primary', { amount: 5000 }),
      textButton('10 000 so‘m', 'topup_amount', 'primary', { amount: 10000 }),
    ],
    [
      textButton('20 000 so‘m', 'topup_amount', 'secondary', { amount: 20000 }),
      textButton('50 000 so‘m', 'topup_amount', 'secondary', { amount: 50000 }),
    ],
    [
      textButton('100 000 so‘m', 'topup_amount', 'secondary', { amount: 100000 }),
      textButton('200 000 so‘m', 'topup_amount', 'secondary', { amount: 200000 }),
    ],
    [textButton('🔄 BALANSNI YANGILASH', 'billing', 'positive')],
    [textButton('👤 KABINET', 'cabinet')],
  ] };
}
function paymentMenu(url) {
  return { inline: true, buttons: [
    [{ action: { type: 'open_link', label: '💳 CLICK ORQALI TO‘LASH', link: String(url) } }],
    [textButton('🔄 BALANSNI TEKSHIRISH', 'billing', 'positive')],
  ] };
}
function insufficientBalanceMenu() {
  return { inline: true, buttons: [
    [textButton('💰 BALANS TO‘LDIRISH', 'billing', 'primary')],
    [textButton('🏠 MENYU', 'home')],
  ] };
}
async function sendCabinet(userId) {
  const [stats, profile, billing, name] = await Promise.all([
    storage.stats(userId), storage.getProfile(userId), storage.billingStatus(userId), getUserName(userId),
  ]);
  const today = billing?.today || {};
  const price = Number(billing?.price_per_listing || 5000);
  await sendMessage(userId, [
    '👤 AVIA MARKET — KABINET', '',
    `👤 VK: [id${userId}|${name}]`,
    `🏢 Kompaniya: ${profile?.company || 'Kiritilmagan'}`,
    `📞 Telefon: ${profile?.phone || 'Kiritilmagan'}`,
    `✈️ Telegram: ${profile?.telegram || 'Kiritilmagan'}`, '',
    `💰 Depozit balans: ${formatMoney(billing?.balance || 0)}`,
    `🎁 Bugun bepul: ✈️ ${Number(today.offer_remaining ?? 3)}/${Number(today.offer_limit ?? 3)} taklif · 🔎 ${Number(today.search_remaining ?? 3)}/${Number(today.search_limit ?? 3)} so‘rov`,
    `💳 Limitdan keyin: har bir Taklif/So‘rov ${formatMoney(price)}`, '',
    `✈️ 7 kunda takliflarim: ${Number(stats?.my_offers || 0)}`,
    `🔎 7 kunda so‘rovlarim: ${Number(stats?.my_searches || 0)}`,
  ].join('\n'), cabinetMenu());
  return { snackbar: 'Kabinet yuborildi' };
}
async function sendBilling(userId) {
  const billing = await storage.billingStatus(userId);
  const today = billing?.today || {};
  const enabled = Boolean(billing?.click_topup_enabled);
  await sendMessage(userId, [
    '💰 AVIA MARKET — DEPOZIT BALANS', '',
    `Balans: ${formatMoney(billing?.balance || 0)}`,
    `🎁 Bugun qolgan: ✈️ ${Number(today.offer_remaining ?? 3)} taklif · 🔎 ${Number(today.search_remaining ?? 3)} so‘rov`,
    `💳 Bepul limitdan keyin: ${formatMoney(billing?.price_per_listing || 5000)} / e’lon`, '',
    enabled ? 'Balansni CLICK orqali to‘ldirish uchun summani tanlang:' : '⚠️ CLICK orqali balans to‘ldirish vaqtincha o‘chiq.',
    'To‘lov tasdiqlangach pul depozit balansga avtomatik tushadi.',
  ].join('\n'), enabled ? billingMenu() : cabinetMenu());
  return { snackbar: 'Balans yuborildi' };
}
async function createTopupPayment(userId, amount) {
  const value = Number(amount || 0);
  if (!TOPUP_AMOUNTS.has(value)) throw Object.assign(new Error('invalid_topup_amount'), { code: 'invalid_topup_amount' });
  const billing = await storage.billingStatus(userId);
  if (!billing?.click_topup_enabled) {
    await sendMessage(userId, '⚠️ CLICK orqali balans to‘ldirish hozircha faol emas.', cabinetMenu());
    return { snackbar: 'CLICK hozircha faol emas' };
  }
  const order = await storage.createClickTopup(userId, value);
  if (!order?.ok || !order?.order_ref) throw new Error(`topup_order_${order?.status || 'failed'}`);
  const url = buildPaymentUrl(order.order_ref, value);
  await sendMessage(userId, [
    '💳 CLICK ORQALI BALANS TO‘LDIRISH', '', `Summa: ${formatMoney(value)}`,
    'CLICK tugmasini bosing va to‘lovni yakunlang.', '',
    '✅ CLICK to‘lovni tasdiqlagach depozit balans avtomatik yangilanadi.',
    '🔄 Keyin “BALANSNI TEKSHIRISH” tugmasini bosing.',
  ].join('\n'), paymentMenu(url));
  return { snackbar: 'CLICK to‘lov havolasi yuborildi' };
}
async function handleListingText(userId, text) {
  let created;
  try { created = await storage.createListing(userId, text); }
  catch (error) {
    console.error('billing_storage_create_failed', { code: error?.code || null, message: error?.message || String(error) });
    await sendMessage(userId, '⚠️ Saqlash xizmati vaqtincha javob bermadi. Bir ozdan keyin qayta urinib ko‘ring.', privateMenu());
    return true;
  }
  if (created?.status === 'no_mode' || created?.status === 'wrong_mode') return false;
  if (created?.status === 'invalid_input') { await sendMessage(userId, '⚠️ E’lon matni 2–2000 belgi oralig‘ida bo‘lishi kerak.', privateMenu()); return true; }
  if (created?.status === 'duplicate') { await sendMessage(userId, '🛡 Aynan shu e’lon oxirgi 24 soat ichida allaqachon yuborilgan. Qayta joylanmadi.', privateMenu()); return true; }
  if (created?.status === 'rate_limited') {
    const seconds = Math.max(1, Number(created?.retry_after || 30));
    await sendMessage(userId, `⏱ Juda tez yuboryapsiz. ${seconds} soniya kutib, shu xabarni yana yuboring.`, privateMenu());
    return true;
  }
  if (created?.status === 'insufficient_balance') {
    await sendMessage(userId, [
      '💰 Bugungi bepul limit tugadi.',
      `Bu e’lon narxi: ${formatMoney(created?.price || 5000)}.`,
      `Depozit balans: ${formatMoney(created?.balance || 0)}.`, '',
      'Balansni CLICK orqali to‘ldiring. Keyin shu e’lon matnini qayta yuboring.',
    ].join('\n'), insufficientBalanceMenu());
    return true;
  }
  if (!created?.ok || created?.status !== 'created' || !created?.id) {
    console.error('billing_storage_create_unexpected', { status: created?.status || null });
    await sendMessage(userId, '⚠️ E’lonni saqlashda kutilmagan xato bo‘ldi. Qayta urinib ko‘ring.', privateMenu());
    return true;
  }
  const kind = created.kind === 'search' ? 'search' : 'offer';
  try {
    if (!PRIMARY_PEER_ID) throw new Error('VK_PRIMARY_PEER_ID is not configured');
    const post = await buildListingText(userId, kind, text);
    const sent = await sendMessage(PRIMARY_PEER_ID, post);
    const ref = messageRef(sent);
    try { await storage.finalizeListing(created.id, userId, 'published', ref, null); }
    catch (error) { console.error('billing_storage_finalize_failed', { id: created.id, code: error?.code || null, message: error?.message || String(error) }); }
    const charge = Number(created?.charge_amount || 0);
    const label = kind === 'offer' ? 'Taklif' : 'So‘rov';
    const note = charge > 0
      ? `💳 Depozitdan ${formatMoney(charge)} yechildi. Qoldiq: ${formatMoney(created?.balance || 0)}.`
      : `🎁 Bepul limitdan foydalanildi. Bugun shu turdan yana ${Number(created?.free_remaining || 0)} ta bepul.`;
    await sendMessage(userId, `✅ ${label} ASOSIY UMUMIY CHATga joylashtirildi.\n${note}`, privateMenu());
    return true;
  } catch (error) {
    console.error('billing_publish_failed', { code: error?.code || null, message: error?.message || String(error) });
    await Promise.allSettled([
      storage.finalizeListing(created.id, userId, 'failed', {}, error?.code || 'vk_send_failed'),
      storage.setMode(userId, kind),
    ]);
    await sendMessage(userId, '⚠️ VK umumiy chatga yuborishni qabul qilmadi. Agar balansdan pul yechilgan bo‘lsa, avtomatik qaytariladi. Shu xabarni qayta yuboring.', privateMenu()).catch(() => {});
    return true;
  }
}
async function handleCallback(event) {
  const obj = event?.object || {};
  const userId = Number(obj?.user_id || 0);
  const data = safePayload(obj?.payload);
  const cmd = String(data?.cmd || '');
  if (!userId || !['cabinet', 'billing', 'topup_amount'].includes(cmd)) return false;
  try {
    let result;
    if (cmd === 'cabinet') result = await sendCabinet(userId);
    if (cmd === 'billing') result = await sendBilling(userId);
    if (cmd === 'topup_amount') result = await createTopupPayment(userId, Number(data?.amount || 0));
    await answerEvent(obj, result?.snackbar || 'Bajarildi');
  } catch (error) {
    console.error('billing_callback_failed', { cmd, code: error?.code || null, message: error?.message || String(error) });
    await answerEvent(obj, 'Xatolik. Qayta urinib ko‘ring').catch(() => {});
  }
  return true;
}
async function handleAdminCommand(event) {
  if (event?.type !== 'message_new' || !ADMIN_USER_ID) return false;
  const msg = event?.object?.message || {};
  const userId = Number(msg?.from_id || 0);
  const peerId = Number(msg?.peer_id || 0);
  if (!userId || userId !== ADMIN_USER_ID || peerId !== userId || Number(msg?.out || 0) === 1) return false;
  const command = String(msg?.text || '').trim().toLowerCase();
  if (!['/start', '/menu', '/help', 'menu', '/admin'].includes(command)) return false;
  if (command === '/admin') {
    const admin = adminHome();
    await sendMessage(userId, admin.text, admin.keyboard);
    return true;
  }
  const home = privateHome();
  const admin = adminHome();
  await sendMessage(userId, home.text, home.keyboard);
  await sendMessage(userId, admin.text, admin.keyboard);
  return true;
}
async function processBillingEvent(event) {
  if (event?.type === 'message_event') {
    if (await handleCallback(event)) return true;
    await processEvent(event);
    return true;
  }
  if (event?.type !== 'message_new') { await processEvent(event); return true; }
  if (await handleAdminCommand(event)) return true;
  const msg = event?.object?.message || {};
  if (Number(msg?.out || 0) === 1) return true;
  const userId = Number(msg?.from_id || 0);
  const peerId = Number(msg?.peer_id || 0);
  const text = String(msg?.text || '').trim();
  if (userId > 0 && peerId === userId && text && !text.startsWith('/')) {
    try {
      const mode = String((await storage.getMode(userId))?.mode || '');
      if (mode === 'offer' || mode === 'search') return handleListingText(userId, text);
    } catch (error) { console.warn('billing_mode_check_failed', { userId, code: error?.code || null }); }
  }
  await processEvent(event);
  return true;
}
module.exports = {
  TOPUP_AMOUNTS, formatMoney, cabinetMenu, billingMenu, paymentMenu, insufficientBalanceMenu,
  sendCabinet, sendBilling, createTopupPayment, handleListingText, processBillingEvent,
};
