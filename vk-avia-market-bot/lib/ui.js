const BOT_OPEN_URL = process.env.VK_BOT_OPEN_URL || 'https://vk.me/aviamarketbot';

function payload(cmd) { return JSON.stringify({ cmd, v: 2 }); }

function privateMenu({ isAdmin = false } = {}) {
  const buttons = [
    [{ action: { type: 'callback', label: '🌐 UMUMIY CHAT', payload: payload('open_market_chat') }, color: 'primary' }],
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
  ];

  // VK inline keyboards reject oversized row counts. Admin actions remain
  // available through /cleanall in private chat and /menu in the market chat.
  // Keeping the same 5-row menu for every user makes the UI predictable.
  void isAdmin;
  return { inline: true, buttons };
}

function groupMenu() {
  return {
    inline: true,
    buttons: [
      [{ action: { type: 'open_link', label: '🤖 SHAXSIY BOT / KABINET', link: BOT_OPEN_URL }, color: 'primary' }],
      [
        { action: { type: 'callback', label: '➕ TAKLIF', payload: payload('new_offer') }, color: 'primary' },
        { action: { type: 'callback', label: '🔎 SO‘ROV', payload: payload('new_search') }, color: 'primary' },
      ],
      [
        { action: { type: 'callback', label: '🌐 TAKLIFLAR', payload: payload('offers') }, color: 'secondary' },
        { action: { type: 'callback', label: '👥 SO‘ROVLAR', payload: payload('searches') }, color: 'secondary' },
      ],
    ],
  };
}

function privateHome(isAdmin = false) {
  return {
    text: [
      '🤖 AVIA MARKET — SHAXSIY BOT / KABINET', '',
      'Bu yerda taklif va so‘rov yuborasiz, o‘zingizning e’lonlaringiz va statistikani ko‘rasiz.', '',
      '🌐 Barcha agentlar ko‘radigan bozor esa alohida — UMUMIY CHAT.',
      ...(isAdmin ? ['', '⚙️ Admin: /cleanall — chatni tozalash. Umumiy chatda /menu — menyuni yangilash.'] : []),
    ].join('\n'),
    keyboard: privateMenu({ isAdmin }),
  };
}

function groupHome() {
  return {
    text: [
      '🌐 AVIA MARKET — UMUMIY CHAT', '',
      'Bu chat — aviakassa va agentlar uchun tartibli bozor lentasi.',
      'Taklif yoki so‘rov kiritish uchun pastdagi tugmalardan foydalaning.', '',
      '🤖 Shaxsiy amallar, ro‘yxatlar va statistika — SHAXSIY BOT / KABINET ichida.',
    ].join('\n'),
    keyboard: groupMenu(),
  };
}

module.exports = { privateMenu, groupMenu, privateHome, groupHome };
