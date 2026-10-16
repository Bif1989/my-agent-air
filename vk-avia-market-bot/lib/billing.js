const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const storage = require('./storage');
const { getUserName, sendMessage, answerEvent } = require('./vk');

const CLICK_SERVICE_ID = String(process.env.CLICK_SERVICE_ID || '').trim();
const CLICK_MERCHANT_ID = String(process.env.CLICK_MERCHANT_ID || '').trim();
const CLICK_MERCHANT_USER_ID = String(process.env.CLICK_MERCHANT_USER_ID || '').trim();
const CLICK_SECRET_KEY = String(process.env.CLICK_SECRET_KEY || '');
const CLICK_PAYMENT_URL = String(process.env.CLICK_PAYMENT_URL || 'https://my.click.uz/services/pay').trim();
const CLICK_RETURN_URL = String(process.env.CLICK_RETURN_URL || 'https://vk.me/aviamarketbot').trim();
const CLICK_ENABLED = String(process.env.CLICK_ENABLED || '').toLowerCase() === 'true';
const CLICK_ORDER_RE = /^amw_[0-9a-f]{32}$/;

function payload(cmd, extra = {}) {
  return JSON.stringify({ cmd, v: 2, ...extra });
}

function callbackButton(label, cmd, color = 'secondary', extra = {}) {
  return { action: { type: 'callback', label, payload: payload(cmd, extra) }, color };
}

function billingKeyboard(status = {}) {
  const plan = status?.plan || {};
  const rows = [
    [callbackButton('💳 BALANS TO‘LDIRISH', 'billing_topup', 'primary')],
  ];
  if (status?.monetization_enabled && plan?.is_active && Number(plan?.price_amount || 0) > 0) {
    rows.push([callbackButton('⭐ PRO TARIFNI OLISH', 'billing_buy', 'positive')]);
  }
  rows.push([
    callbackButton('📜 TO‘LOVLAR', 'billing_history'),
    callbackButton('✏️ KONTAKTLAR', 'profile_edit'),
  ]);
  rows.push([callbackButton('🏠 MENYU', 'home')]);
  return { inline: true, buttons: rows };
}

function paymentKeyboard(paymentUrl) {
  return {
    inline: true,
    buttons: [
      [{ action: { type: 'open_link', label: '💳 CLICK ORQALI TO‘LASH', link: paymentUrl } }],
      [callbackButton('↩️ KABINET', 'cabinet')],
    ],
  };
}

function simpleBackKeyboard() {
  return { inline: true, buttons: [[callbackButton('↩️ KABINET', 'cabinet')]] };
}

function money(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0 UZS';
  return `${Math.trunc(amount).toLocaleString('uz-UZ')} UZS`;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

function normalizeProfileValue(value) {
  const text = String(value || '').trim();
  return !text || text === '-' ? null : text;
}

function normalizeTelegram(value) {
  let text = normalizeProfileValue(value);
  if (!text) return null;
  text = text.replace(/^https?:\/\/(?:www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@+/, '');
  if (!text || !/^[A-Za-z0-9_]{4,64}$/.test(text)) return null;
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

function parseUserAmount(text) {
  const normalized = String(text || '').replace(/[\s\u00a0_'’`]/g, '');
  if (!/^\d{1,12}$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function safePayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function clickConfigured() {
  return Boolean(CLICK_SERVICE_ID && CLICK_MERCHANT_ID && CLICK_SECRET_KEY && CLICK_PAYMENT_URL && CLICK_RETURN_URL);
}

function clickHealth() {
  return {
    enabled: CLICK_ENABLED,
    configured: clickConfigured(),
    service_configured: Boolean(CLICK_SERVICE_ID),
    merchant_configured: Boolean(CLICK_MERCHANT_ID),
    merchant_user_configured: Boolean(CLICK_MERCHANT_USER_ID),
    secret_configured: Boolean(CLICK_SECRET_KEY),
  };
}

function buildClickPaymentUrl({ orderRef, amount }) {
  if (!CLICK_ORDER_RE.test(String(orderRef || ''))) throw new Error('invalid_click_order_ref');
  if (!Number.isSafeInteger(Number(amount)) || Number(amount) <= 0) throw new Error('invalid_click_amount');
  if (!clickConfigured()) throw new Error('click_not_configured');
  const url = new URL(CLICK_PAYMENT_URL);
  url.searchParams.set('service_id', CLICK_SERVICE_ID);
  url.searchParams.set('merchant_id', CLICK_MERCHANT_ID);
  if (CLICK_MERCHANT_USER_ID) url.searchParams.set('merchant_user_id', CLICK_MERCHANT_USER_ID);
  url.searchParams.set('amount', String(Math.trunc(Number(amount))));
  url.searchParams.set('transaction_param', String(orderRef));
  url.searchParams.set('return_url', CLICK_RETURN_URL);
  return url.toString();
}

async function safeBillingStatus(userId) {
  try {
    const status = await storage.billingStatus(userId);
    return status?.ok ? status : { ok: false, balance: 0, plan: {}, monetization_enabled: false, subscription_active: false };
  } catch (error) {
    console.warn('billing_status_failed', { userId, code: error?.code || null });
    return { ok: false, balance: 0, plan: {}, monetization_enabled: false, subscription_active: false };
  }
}

async function sendCabinet(userId) {
  const [name, profile, stats, billing] = await Promise.all([
    getUserName(userId),
    storage.getProfile(userId).catch(() => ({})),
    storage.stats(userId).catch(() => ({})),
    safeBillingStatus(userId),
  ]);
  const plan = billing?.plan || {};
  const price = Number(plan?.price_amount || 0);
  const planReady = Boolean(billing?.monetization_enabled && plan?.is_active && price > 0);
  const tariffLine = billing?.subscription_active
    ? `✅ Faol tarif: ${plan?.name || 'AVIA MARKET PRO'} — ${formatDate(billing?.subscription_ends_at)} gacha`
    : planReady
      ? `⭐ Tarif: ${plan?.name || 'AVIA MARKET PRO'} / ${Number(plan?.duration_days || 30)} kun — ${money(price)}`
      : '🆓 Tarif: hozircha bepul rejim';
  const clickLine = CLICK_ENABLED && clickConfigured()
    ? '💳 Click orqali balans to‘ldirish: faol'
    : '💳 Click orqali balans to‘ldirish: tayyorlanmoqda';
  const text = [
    '👤 AVIA MARKET — KABINET',
    '',
    `👤 ${name}`,
    `🏢 Kompaniya: ${profile?.company || '—'}`,
    `📞 Telefon: ${profile?.phone || '—'}`,
    `✈️ Telegram: ${profile?.telegram || '—'}`,
    '',
    `💰 Balans: ${money(billing?.balance || 0)}`,
    tariffLine,
    clickLine,
    '',
    `📦 Takliflarim (7 kun): ${Number(stats?.my_offers || 0)}`,
    `📋 So‘rovlarim (7 kun): ${Number(stats?.my_searches || 0)}`,
    '',
    billing?.ok ? 'Balans, tarif va to‘lovlar shu kabinetdan boshqariladi.' : '⚠️ Billing ma’lumoti vaqtincha yuklanmadi. Qayta urinib ko‘ring.',
  ].join('\n');
  await sendMessage(userId, text, billingKeyboard(billing));
}

async function sendTopupPrompt(userId) {
  if (!CLICK_ENABLED || !clickConfigured()) {
    await sendMessage(userId, [
      '💳 BALANS TO‘LDIRISH',
      '',
      'Click integratsiyasi tayyorlanmoqda, lekin hozircha to‘lov qabul qilish yoqilmagan.',
      'KABINETga qaytib keyinroq urinib ko‘ring.',
    ].join('\n'), simpleBackKeyboard());
    return;
  }
  await storage.setMode(userId, 'topup');
  await sendMessage(userId, [
    '💳 BALANS TO‘LDIRISH',
    '',
    'To‘ldirmoqchi bo‘lgan summani so‘mda keyingi BITTA xabarda yuboring.',
    'Masalan: 100000',
    '',
    'Minimal summa: 1 000 UZS.',
    '↩️ Bekor qilish: /menu',
  ].join('\n'), simpleBackKeyboard());
}

async function handleTopupText(userId, text) {
  if (!CLICK_ENABLED || !clickConfigured()) {
    await storage.clearMode(userId).catch(() => null);
    await sendMessage(userId, '💳 Click orqali to‘lov hozircha yoqilmagan.', simpleBackKeyboard());
    return true;
  }
  const amount = parseUserAmount(text);
  if (!amount) {
    await sendMessage(userId, '❗ Summani faqat butun so‘mda yozing. Masalan: 100000\n\nBekor qilish: /menu', simpleBackKeyboard());
    return true;
  }
  let order;
  try {
    order = await storage.createClickTopup(userId, amount);
  } catch (error) {
    console.error('click_topup_order_failed', { userId, code: error?.code || null });
    await sendMessage(userId, '⚠️ To‘lov orderini yaratib bo‘lmadi. Bir ozdan keyin qayta urinib ko‘ring.', simpleBackKeyboard());
    return true;
  }
  if (!order?.ok) {
    if (order?.status === 'amount_out_of_range') {
      await sendMessage(userId, `❗ Summa ${money(order?.min_amount || 1000)} dan ${money(order?.max_amount || 500000000)} gacha bo‘lsin.`, simpleBackKeyboard());
      return true;
    }
    await sendMessage(userId, '⚠️ To‘lov orderini yaratib bo‘lmadi.', simpleBackKeyboard());
    return true;
  }
  const paymentUrl = buildClickPaymentUrl({ orderRef: order.order_ref, amount: Number(order.amount) });
  await storage.clearMode(userId).catch(() => null);
  await sendMessage(userId, [
    '💳 CLICK ORQALI BALANS TO‘LDIRISH',
    '',
    `Summa: ${money(order.amount)}`,
    `Order: ${order.order_ref}`,
    '',
    'Pastdagi tugmani bosing va Click sahifasida to‘lovni yakunlang.',
    'Muvaffaqiyatli Complete callbackdan keyin balans avtomatik yangilanadi.',
  ].join('\n'), paymentKeyboard(paymentUrl));
  return true;
}

async function sendBillingHistory(userId) {
  let result;
  try { result = await storage.billingHistory(userId, 10); }
  catch (error) {
    console.warn('billing_history_failed', { userId, code: error?.code || null });
    await sendMessage(userId, '⚠️ To‘lov tarixini yuklab bo‘lmadi.', simpleBackKeyboard());
    return;
  }
  const items = Array.isArray(result?.items) ? result.items : [];
  if (!items.length) {
    await sendMessage(userId, '📜 TO‘LOVLAR TARIXI\n\nHozircha operatsiya yo‘q.', simpleBackKeyboard());
    return;
  }
  const lines = items.map((item, index) => {
    const sign = Number(item?.amount || 0) > 0 ? '+' : '';
    const kind = item?.kind === 'click_topup' ? '💳 Balans to‘ldirish' : item?.kind === 'tariff_purchase' ? '⭐ Tarif xaridi' : '💰 Operatsiya';
    return `${index + 1}. ${kind}\n${sign}${money(item?.amount || 0)} · Qoldiq: ${money(item?.balance_after || 0)}\n${formatDate(item?.created_at)}`;
  });
  await sendMessage(userId, `📜 TO‘LOVLAR TARIXI\n\n${lines.join('\n\n')}`.slice(0, 3900), simpleBackKeyboard());
}

async function buyTariff(userId, eventId, peerId, payloadValue) {
  const eventFingerprint = JSON.stringify({ userId: Number(userId), eventId: String(eventId || ''), peerId: Number(peerId || 0), payload: safePayload(payloadValue) });
  const purchaseKey = crypto.createHash('sha256').update(eventFingerprint, 'utf8').digest('hex');
  let result;
  try { result = await storage.buyTariff(userId, 'pro_30d', purchaseKey); }
  catch (error) {
    console.error('tariff_purchase_failed', { userId, code: error?.code || null });
    await sendMessage(userId, '⚠️ Tarifni faollashtirib bo‘lmadi. Qayta urinib ko‘ring.', simpleBackKeyboard());
    return;
  }
  if (!result?.ok) {
    if (result?.status === 'monetization_disabled' || result?.status === 'plan_unavailable') {
      await sendMessage(userId, '⏳ Pullik tarif hali ishga tushirilmagan. Hozir bot bepul rejimda ishlamoqda.', simpleBackKeyboard());
      return;
    }
    if (result?.status === 'insufficient_balance') {
      await sendMessage(userId, `❗ Balans yetarli emas.\nBalans: ${money(result?.balance || 0)}\nKerak: ${money(result?.required || 0)}`, {
        inline: true,
        buttons: [[callbackButton('💳 BALANS TO‘LDIRISH', 'billing_topup', 'primary')], [callbackButton('↩️ KABINET', 'cabinet')]],
      });
      return;
    }
    await sendMessage(userId, '⚠️ Tarif xaridi bajarilmadi.', simpleBackKeyboard());
    return;
  }
  await sendMessage(userId, [
    '✅ AVIA MARKET PRO FAOLLASHTIRILDI',
    '',
    `Tarif: ${result?.plan_name || 'AVIA MARKET PRO'}`,
    `To‘lov: ${money(result?.amount || 0)}`,
    `Balans qoldig‘i: ${money(result?.balance || 0)}`,
    `Amal qiladi: ${formatDate(result?.ends_at)} gacha`,
  ].join('\n'), simpleBackKeyboard());
}

async function sendProfilePrompt(userId) {
  await storage.setMode(userId, 'billing_profile');
  await sendMessage(userId, [
    '✏️ KONTAKTLARNI SOZLASH',
    '',
    'Keyingi BITTA xabarda 3 qismni | belgisi bilan yuboring:',
    'Kompaniya | Telefon | Telegram',
    '',
    'Masalan:',
    'BIF AVIA | +998 91 292 40 10 | @bif89',
    '',
    'Kerak bo‘lmagan qism uchun - yozing.',
    'Bekor qilish: /menu',
  ].join('\n'), simpleBackKeyboard());
}

async function handleProfileText(userId, text) {
  const profile = parseProfileInput(text);
  if (!profile) {
    await sendMessage(userId, '❗ Format noto‘g‘ri.\n\nKompaniya | Telefon | Telegram\nMasalan: BIF AVIA | +998 91 292 40 10 | @bif89', simpleBackKeyboard());
    return true;
  }
  const saved = await storage.setProfile(userId, profile);
  if (!saved?.ok) {
    await sendMessage(userId, '⚠️ Kontaktlarni saqlab bo‘lmadi.', simpleBackKeyboard());
    return true;
  }
  await storage.clearMode(userId).catch(() => null);
  await sendMessage(userId, '✅ Kontaktlar saqlandi.');
  await sendCabinet(userId);
  return true;
}

async function showSubscriptionRequired(userId) {
  const billing = await safeBillingStatus(userId);
  const price = Number(billing?.plan?.price_amount || 0);
  const text = price > 0
    ? `🔒 E’lon berish uchun faol tarif kerak.\n\n${billing?.plan?.name || 'AVIA MARKET PRO'}: ${money(price)} / ${Number(billing?.plan?.duration_days || 30)} kun\nBalans: ${money(billing?.balance || 0)}`
    : '🔒 E’lon berish uchun faol tarif kerak. KABINET orqali tarif holatini tekshiring.';
  await sendMessage(userId, text, billingKeyboard(billing));
}

async function handleMessageEvent(obj) {
  const userId = Number(obj?.user_id || 0);
  const peerId = Number(obj?.peer_id || 0);
  if (!userId || peerId !== userId) return false;
  const data = safePayload(obj?.payload);
  const cmd = String(data?.cmd || '');

  if (cmd === 'cabinet' || cmd === 'billing') {
    await sendCabinet(userId);
    await answerEvent(obj, 'Kabinet yangilandi');
    return true;
  }
  if (cmd === 'billing_topup') {
    await sendTopupPrompt(userId);
    await answerEvent(obj, CLICK_ENABLED ? 'Summani yuboring' : 'Click hali yoqilmagan');
    return true;
  }
  if (cmd === 'billing_history') {
    await sendBillingHistory(userId);
    await answerEvent(obj, 'To‘lovlar tarixi');
    return true;
  }
  if (cmd === 'billing_buy') {
    await buyTariff(userId, obj?.event_id, peerId, obj?.payload);
    await answerEvent(obj, 'Tarif tekshirildi');
    return true;
  }
  if (cmd === 'profile_edit') {
    await sendProfilePrompt(userId);
    await answerEvent(obj, 'Kontaktlarni yuboring');
    return true;
  }
  if (cmd === 'new_offer' || cmd === 'new_search') {
    const billing = await safeBillingStatus(userId);
    if (billing?.monetization_enabled && !billing?.subscription_active) {
      await showSubscriptionRequired(userId);
      await answerEvent(obj, 'Faol tarif kerak');
      return true;
    }
  }
  return false;
}

async function handlePrivateMessage(msg) {
  const userId = Number(msg?.from_id || 0);
  const peerId = Number(msg?.peer_id || 0);
  if (!userId || peerId !== userId || Number(msg?.out || 0) === 1) return false;
  const text = String(msg?.text || '').trim();
  if (!text || text.startsWith('/')) return false;

  let session;
  try { session = await storage.getMode(userId); }
  catch { return false; }
  const mode = String(session?.mode || '');
  if (mode === 'topup') return handleTopupText(userId, text);
  if (mode === 'billing_profile' || mode === 'profile') return handleProfileText(userId, text);
  if (mode === 'offer' || mode === 'search') {
    const billing = await safeBillingStatus(userId);
    if (billing?.monetization_enabled && !billing?.subscription_active) {
      await showSubscriptionRequired(userId);
      return true;
    }
  }
  return false;
}

async function handleVkEvent(event) {
  if (event?.type === 'message_event') return handleMessageEvent(event?.object || {});
  if (event?.type === 'message_new') return handlePrivateMessage(event?.object?.message || {});
  return false;
}

function normalizeClickFields(body, requirePrepareId = false) {
  let source = body;
  if (Buffer.isBuffer(source)) source = source.toString('utf8');
  if (typeof source === 'string') source = Object.fromEntries(new URLSearchParams(source));
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const fields = {};
  for (const key of ['click_trans_id','service_id','click_paydoc_id','merchant_trans_id','merchant_prepare_id','amount','action','error','error_note','sign_time','sign_string']) {
    if (source[key] !== undefined && source[key] !== null) fields[key] = String(source[key]);
  }
  const required = ['click_trans_id','service_id','click_paydoc_id','merchant_trans_id','amount','action','error','error_note','sign_time','sign_string'];
  if (requirePrepareId) required.push('merchant_prepare_id');
  if (required.some((key) => fields[key] === undefined || fields[key] === '')) return null;
  return fields;
}

function expectedClickSignature(fields, secret = CLICK_SECRET_KEY) {
  const raw = [
    fields?.click_trans_id || '',
    fields?.service_id || '',
    secret || '',
    fields?.merchant_trans_id || '',
    String(fields?.action || '') === '1' ? (fields?.merchant_prepare_id || '') : '',
    fields?.amount || '',
    fields?.action || '',
    fields?.sign_time || '',
  ].join('');
  return crypto.createHash('md5').update(raw, 'utf8').digest('hex');
}

function verifyClickSignature(fields, secret = CLICK_SECRET_KEY) {
  const expected = expectedClickSignature(fields, secret);
  const actual = String(fields?.sign_string || '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(actual)) return false;
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(actual, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseClickAmount(value) {
  const text = String(value || '');
  if (!/^\d{1,12}(?:\.0{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function clickError(fields = {}, code = -8) {
  const notes = {
    '-1': 'SIGN CHECK FAILED!',
    '-2': 'Incorrect parameter amount',
    '-3': 'Action not found',
    '-4': 'Already paid',
    '-5': 'User does not exist',
    '-6': 'Transaction does not exist',
    '-7': 'Failed to update user',
    '-8': 'Error in request from click',
    '-9': 'Transaction cancelled',
  };
  return {
    click_trans_id: fields?.click_trans_id || '',
    merchant_trans_id: fields?.merchant_trans_id || '',
    error: code,
    error_note: notes[String(code)] || 'Error',
  };
}

function reasonCode(reason, stage) {
  if (reason === 'order_not_found') return -5;
  if (reason === 'amount_mismatch') return -2;
  if (reason === 'already_paid') return -4;
  if (['prepare_mismatch','transaction_mismatch','prepare_required'].includes(String(reason))) return -6;
  if (['cancelled','expired','failed'].includes(String(reason))) return -9;
  if (reason === 'invalid_input') return -8;
  return stage === 'prepare' ? -7 : -6;
}

async function handleClickWebhook(req, stage) {
  if (!['prepare', 'complete'].includes(stage)) return clickError({}, -8);
  if (!CLICK_SERVICE_ID || !CLICK_SECRET_KEY) return clickError({}, -8);
  const fields = normalizeClickFields(req?.body, stage === 'complete');
  if (!fields) return clickError({}, -8);
  const expectedAction = stage === 'prepare' ? '0' : '1';
  if (fields.action !== expectedAction) return clickError(fields, -3);
  if (fields.service_id !== CLICK_SERVICE_ID) return clickError(fields, -8);
  if (!CLICK_ORDER_RE.test(fields.merchant_trans_id) || !/^\d+$/.test(fields.click_trans_id) || !/^\d+$/.test(fields.click_paydoc_id) || !/^-?\d{1,6}$/.test(fields.error)) return clickError(fields, -8);
  if (!verifyClickSignature(fields)) return clickError(fields, -1);
  const amount = parseClickAmount(fields.amount);
  if (amount === null) return clickError(fields, -2);

  if (Number(fields.error) < 0) {
    await storage.cancelClickTopup(fields.merchant_trans_id, fields.click_trans_id, Number(fields.error), fields.error_note).catch(() => null);
    return clickError(fields, -9);
  }

  if (stage === 'prepare') {
    const result = await storage.prepareClickTopup(fields.merchant_trans_id, fields.click_trans_id, fields.click_paydoc_id, amount);
    if (!result?.ok) return clickError(fields, reasonCode(result?.reason, stage));
    return {
      click_trans_id: fields.click_trans_id,
      merchant_trans_id: fields.merchant_trans_id,
      merchant_prepare_id: Number(result.merchant_prepare_id),
      error: 0,
      error_note: 'Success',
    };
  }

  const prepareId = Number(fields.merchant_prepare_id);
  if (!Number.isSafeInteger(prepareId) || prepareId <= 0) return clickError(fields, -6);
  const result = await storage.completeClickTopup(fields.merchant_trans_id, fields.click_trans_id, fields.click_paydoc_id, prepareId, amount);
  if (!result?.ok) return clickError(fields, reasonCode(result?.reason, stage));
  if (Number(result?.user_id || 0) > 0) {
    waitUntil(Promise.resolve(sendMessage(Number(result.user_id), [
      '✅ BALANS TO‘LDIRILDI',
      '',
      `+${money(result?.amount || amount)}`,
      `💰 Yangi balans: ${money(result?.balance || 0)}`,
      '',
      'KABINET orqali balans va tarifni boshqarishingiz mumkin.',
    ].join('\n'), simpleBackKeyboard())).catch((error) => {
      console.warn('click_topup_notification_failed', { code: error?.code || null });
    }));
  }
  return {
    click_trans_id: fields.click_trans_id,
    merchant_trans_id: fields.merchant_trans_id,
    merchant_confirm_id: Number(result.merchant_confirm_id),
    error: 0,
    error_note: 'Success',
  };
}

module.exports = {
  billingKeyboard,
  buildClickPaymentUrl,
  clickConfigured,
  clickError,
  clickHealth,
  expectedClickSignature,
  handleClickWebhook,
  handleVkEvent,
  normalizeClickFields,
  parseClickAmount,
  parseProfileInput,
  parseUserAmount,
  verifyClickSignature,
};
