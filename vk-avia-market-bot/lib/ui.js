const BOT_OPEN_URL = process.env.VK_BOT_OPEN_URL || 'https://vk.me/aviamarketbot';
const MARKET_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 2000000001);
const MARKET_CHAT_URL = process.env.VK_MARKET_CHAT_URL || `https://vk.ru/im/convo/${MARKET_PEER_ID}`;

function payload(cmd) { return JSON.stringify({ cmd, v: 2 }); }

function privateMenu() {
  return {
    inline: true,
    buttons: [
      [{ action: { type: 'open_link', label: '🌐 UMUMIY CHAT', link: MARKET_CHAT_URL } }],
      [
        { action: { type: 'callback', label: '➕ TAKLIF BERISH', payload: payload('new_offer') }, color: 'primary' },
        { action: { type: 'callback', label: '🔎 SO‘ROV BERISH', payload: payload('new_search') }, color: 'primary' },
      ],
      [
        { action: { type: 'callback', label: '🌐 TAKLIFLAR', payload: payload('offers') }, color: 'secondary' },
        { action: { type: 'callback', label: '👥 SO‘ROVLAR', payload: payload('searches') }, color: 'secondary' },
      ],
      [
        { action: { type: 'callback', label: '📦 MENING TAKLIFLARIM', payload: payload('my_offers') }, color: 'secondary' },
        { action: { type: 'callback', label: '📋 MENING SO‘ROVLARIM', payload: payload('my_searches') }, color: 'secondary' },
      ],
      [
        { action: { type: 'callback', label: '👤 KABINET', payload: payload('cabinet') }, color: 'secondary' },
        { action: { type: 'callback', label: '📊 STATISTIKA', payload: payload('stats') }, color: 'secondary' },
      ],
    ],
  };
}

// Public chat intentionally has no inline keyboard.
// The stable entry point is a pinned plain-text link to the private bot.
function groupMenu() {
  return null;
}

function adminMenu() {
  return {
    inline: true,
    buttons: [
      [{ action: { type: 'callback', label: '📌 ZAKREPLEN XABARNI YANGILASH', payload: payload('admin_pinmenu') }, color: 'primary' }],
      [{ action: { type: 'callback', label: '🧹 BOT E’LONLARINI TOZALASH', payload: payload('admin_cleanall') }, color: 'negative' }],
    ],
  };
}

function privateHome() {
  return {
    text: [
      '🔒 AVIA MARKET — SHAXSIY BOT / KABINET', '',
      'Bu — sizning shaxsiy boshqaruv oynangiz.',
      'Bu yerga yozgan oddiy xabaringiz UMUMIY CHATga avtomatik chiqmaydi.', '',
      'E’lon berish tartibi:',
      '1) “➕ TAKLIF BERISH” yoki “🔎 SO‘ROV BERISH”ni bosing.',
      '2) Keyingi BITTA xabarda e’lon matnini yuboring.',
      '3) Shundan keyingina e’lon UMUMIY CHATga chiqariladi.', '',
      '🛡 Bir xil e’lon 24 soat ichida qayta joylanmaydi.',
      '⏱ E’lonlar orasida 30 soniyalik himoya bor.',
    ].join('\n'),
    keyboard: privateMenu(),
  };
}

function groupHome() {
  return {
    text: [
      '📌 AVIA MARKET — UMUMIY CHAT', '',
      'Bu — ochiq umumiy suhbat.',
      '✅ Barcha ishtirokchilar erkin yozishi va javob berishi mumkin.', '',
      '✈️ Taklif va 🔎 So‘rovlarni tartibli joylash uchun SHAXSIY BOTdan foydalaning:',
      `🔒 ${BOT_OPEN_URL}`,
      '',
      'Shaxsiy bot orqali berilgan e’lonlar shu chatga ham avtomatik chiqariladi.',
    ].join('\n'),
    keyboard: null,
  };
}

function adminHome() {
  return {
    text: [
      '⚙️ AVIA MARKET — ADMIN BOSHQARUV', '',
      'Bu bo‘lim faqat admin akkauntida ko‘rinadi.',
      'Alohida ADMIN BOT yo‘q — boshqaruv shu SHAXSIY BOT ichida.', '',
      '📌 Zakreplen xabar — UMUMIY CHATga SHAXSIY BOT havolasini yuboradi va pin qiladi.',
      '🧹 Bot e’lonlarini tozalash — faqat bot kuzatgan e’lon/xizmat xabarlarini tozalaydi; oddiy foydalanuvchi yozishmalariga tegmaydi.', '',
      '↩️ Shaxsiy menyuga qaytish: /menu',
    ].join('\n'),
    keyboard: adminMenu(),
  };
}

module.exports = { privateMenu, groupMenu, adminMenu, privateHome, groupHome, adminHome };
