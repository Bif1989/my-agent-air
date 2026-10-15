const BOT_OPEN_URL = process.env.VK_BOT_OPEN_URL || 'https://vk.me/aviamarketbot';

function payload(cmd) { return JSON.stringify({ cmd, v: 2 }); }

function privateMenu() {
  return {
    inline: true,
    buttons: [
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
    ],
  };
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

function privateHome() {
  return {
    text: [
      '🤖 AVIA MARKET — SHAXSIY BOT / KABINET', '',
      'Taklif yoki so‘rovni shu yerdan yuboring.',
      'E’lonlar agentlar ko‘radigan UMUMIY CHATga chiqariladi.', '',
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
      'Aviakassa va agentlar uchun taklif va so‘rovlar bozori.',
      'E’lon kiritish uchun tugmalardan foydalaning.', '',
      '🤖 Shaxsiy ro‘yxatlar va statistika — SHAXSIY BOT / KABINET ichida.',
    ].join('\n'),
    keyboard: groupMenu(),
  };
}

module.exports = { privateMenu, groupMenu, privateHome, groupHome };
