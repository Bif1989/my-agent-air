const BOT_OPEN_URL = process.env.VK_BOT_OPEN_URL || 'https://vk.me/aviamarketbot';

function payload(cmd) { return JSON.stringify({ cmd, v: 2 }); }

function privateMenu() {
  return {
    inline: true,
    buttons: [
      [{ action: { type: 'callback', label: '🌐 UMUMIY CHAT — E’LONLAR', payload: payload('open_market_chat') }, color: 'primary' }],
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

function groupMenu() {
  return {
    inline: true,
    buttons: [
      [{ action: { type: 'open_link', label: '➕ E’LON BERISH — SHAXSIY BOT', link: BOT_OPEN_URL } }],
    ],
  };
}

function adminMenu() {
  return {
    inline: true,
    buttons: [
      [{ action: { type: 'callback', label: '📌 UMUMIY MENYUNI YANGILASH', payload: payload('admin_pinmenu') }, color: 'primary' }],
      [{ action: { type: 'callback', label: '🧹 UMUMIY CHATNI TOZALASH', payload: payload('admin_cleanall') }, color: 'negative' }],
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
      '🌐 AVIA MARKET — UMUMIY CHAT', '',
      'Bu — HAMMAGA OCHIQ taklif va so‘rovlar bozori.',
      'Bu chat e’lonlarni ko‘rish va kuzatish uchun.', '',
      '➕ E’lon berish uchun pastdagi “SHAXSIY BOT” tugmasini bosing.',
      '🔒 Shaxsiy botga yozgan oddiy xabaringiz bu chatda ko‘rinmaydi.',
      '✅ Faqat TAKLIF yoki SO‘ROV rejimida yuborgan e’loningiz shu yerga chiqadi.',
    ].join('\n'),
    keyboard: groupMenu(),
  };
}

function adminHome() {
  return {
    text: [
      '⚙️ AVIA MARKET — ADMIN BOSHQARUV', '',
      'Bu bo‘lim faqat admin akkauntida ko‘rinadi.',
      'Alohida ADMIN BOT yo‘q — boshqaruv shu SHAXSIY BOT ichida.', '',
      '📌 Umumiy menyu — yangi menyuni yuboradi va pin qilishga urinadi.',
      '🧹 Tozalash — umumiy chat tarixini admin huquqlari doirasida tozalaydi.', '',
      '↩️ Shaxsiy menyuga qaytish: /menu',
    ].join('\n'),
    keyboard: adminMenu(),
  };
}

module.exports = { privateMenu, groupMenu, adminMenu, privateHome, groupHome, adminHome };
