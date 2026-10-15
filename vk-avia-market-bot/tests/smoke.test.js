const assert = require('assert');
const { parseListing, normalizeListingText, listingMarker, formatStoredList } = require('../lib/market');
const { privateMenu, groupMenu, adminMenu, privateHome, groupHome, adminHome } = require('../lib/ui');

assert.strictEqual(normalizeListingText('  TAS   MOW  '), 'tas mow');
assert.strictEqual(listingMarker('offer', 123), '#AM2_OFFER_123');
assert.strictEqual(listingMarker('search', 456), '#AM2_SEARCH_456');

const parsed = parseListing({
  text: '✈️ TAKLIF\n👤 [id123|Agent]\n🕒 14.10 21:00\n\nTAS–MOW 20 oktabr 220 USD\n\n#AviaMarket\n#AM2_OFFER_123',
  date: 1791990000,
  conversation_message_id: 10,
});
assert(parsed);
assert.strictEqual(parsed.kind, 'offer');
assert.strictEqual(parsed.userId, 123);
assert.strictEqual(parsed.text, 'TAS–MOW 20 oktabr 220 USD');

const privateKeyboard = privateMenu();
const groupKeyboard = groupMenu();
const adminKeyboard = adminMenu();
assert.strictEqual(privateKeyboard.buttons.length, 5, 'private keyboard must stay compact');
assert.strictEqual(groupKeyboard.buttons.length, 1, 'public chat must have one clear entry point to the private bot');
assert.strictEqual(groupKeyboard.buttons[0][0].action.type, 'open_link');
assert(groupKeyboard.buttons[0][0].action.label.includes('SHAXSIY BOT'));
assert(privateKeyboard.buttons[0][0].action.label.includes('UMUMIY CHAT'));
assert.strictEqual(adminKeyboard.buttons.length, 2, 'admin controls must stay in a separate compact card');
assert(adminKeyboard.buttons[0][0].action.payload.includes('admin_pinmenu'));
assert(adminKeyboard.buttons[1][0].action.payload.includes('admin_cleanall'));

const privateHomeText = privateHome().text;
const groupHomeText = groupHome().text;
const adminHomeText = adminHome().text;
assert(privateHomeText.includes('SHAXSIY BOT / KABINET'));
assert(privateHomeText.includes('avtomatik chiqmaydi'));
assert(privateHomeText.includes('Shundan keyingina e’lon UMUMIY CHATga chiqariladi'));
assert(groupHomeText.includes('UMUMIY CHAT'));
assert(groupHomeText.includes('HAMMAGA OCHIQ'));
assert(groupHomeText.includes('SHAXSIY BOT'));
assert(!groupHomeText.includes('ADMIN BOT'));
assert(adminHomeText.includes('faqat admin akkauntida'));
assert(adminHomeText.includes('Alohida ADMIN BOT yo‘q'));

const formatted = formatStoredList('TEST', [{ kind: 'offer', body: 'TAS–MOW 220 USD', created_at: '2026-10-15T00:00:00Z' }]);
assert(formatted.includes('TAS–MOW 220 USD'));

console.log('smoke tests: OK');
