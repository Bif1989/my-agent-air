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
      [{ action: { type: 'callback', label: '👤 KABINET', payload: payload('cabinet') }, color: 'secondary' }],
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
    ],
  };
}

function privateHome() {
  return {
    text: [
      '🤖 AVIA MARKET — SHAXSIY BOT / KABINET', '',
      'Taklif yoki so‘rovni shu yerdan yuboring.',
      'E’lonlar agentlar ko‘radigan UMUMIY CHATga chiqariladi.', '',
      'Tez, sodda va ortiqcha bosqichlarsiz.',
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
      '🤖 Shaxsiy amallar — SHAXSIY BOT / KABINET ichida.',
    ].join('\n'),
    keyboard: groupMenu(),
  };
}

module.exports = { privateMenu, groupMenu, privateHome, groupHome };
