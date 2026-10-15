const assert = require('assert');
const { parseListing, normalizeListingText, listingMarker, formatStoredList } = require('../lib/market');
const { messageRef } = require('../lib/vk');
const storage = require('../lib/storage');
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

assert.deepStrictEqual(messageRef(77), { message_id: 77, conversation_message_id: null });
assert.deepStrictEqual(messageRef({ message_id: 88, conversation_message_id: 99 }), { message_id: 88, conversation_message_id: 99 });
assert.deepStrictEqual(messageRef({ conversation_message_id: 99 }), { message_id: null, conversation_message_id: 99 });

const privateKeyboard = privateMenu();
const groupKeyboard = groupMenu();
const adminKeyboard = adminMenu();
assert.strictEqual(privateKeyboard.buttons.length, 5, 'private keyboard must stay compact');
assert.strictEqual(privateKeyboard.buttons[0][0].action.type, 'open_link', 'public chat button must open the chat directly');
assert(privateKeyboard.buttons[0][0].action.label.includes('UMUMIY CHAT'));
assert(privateKeyboard.buttons[0][0].action.link.includes('/im/convo/2000000001'), 'public chat button must point to the verified common chat');
assert.strictEqual(privateKeyboard.buttons[0][0].color, undefined, 'VK open_link buttons must not define color');
assert.strictEqual(groupKeyboard, null, 'public chat must use a pinned plain-text bot link, not an inline keyboard');
assert.strictEqual(adminKeyboard.buttons.length, 2, 'admin controls must stay in a separate compact card');
assert(adminKeyboard.buttons[0][0].action.payload.includes('admin_pinmenu'));
assert(adminKeyboard.buttons[0][0].action.label.includes('ZAKREPLEN'));
assert(adminKeyboard.buttons[1][0].action.payload.includes('admin_cleanall'));

const privateHomeText = privateHome().text;
const groupHomeCard = groupHome();
const groupHomeText = groupHomeCard.text;
const adminHomeText = adminHome().text;
assert(privateHomeText.includes('SHAXSIY BOT / KABINET'));
assert(privateHomeText.includes('avtomatik chiqmaydi'));
assert(privateHomeText.includes('Shundan keyingina e’lon UMUMIY CHATga chiqariladi'));
assert(groupHomeText.includes('UMUMIY CHAT'));
assert(groupHomeText.includes('https://vk.me/aviamarketbot'));
assert(groupHomeText.includes('SHAXSIY BOT'));
assert(groupHomeText.includes('24 soat'));
assert.strictEqual(groupHomeCard.keyboard, null);
assert(!groupHomeText.includes('ADMIN BOT'));
assert(adminHomeText.includes('faqat admin akkauntida'));
assert(adminHomeText.includes('Alohida ADMIN BOT yo‘q'));
assert(adminHomeText.includes('pin qiladi'));

for (const name of ['health', 'setMode', 'createListing', 'finalizeListing', 'trackBotMessage', 'listCleanupTargets', 'markDeleted', 'checkChatDuplicate']) {
  assert.strictEqual(typeof storage[name], 'function', `storage.${name} must be exported`);
}

const formatted = formatStoredList('TEST', [{ kind: 'offer', body: 'TAS–MOW 220 USD', created_at: '2026-10-15T00:00:00Z' }]);
assert(formatted.includes('TAS–MOW 220 USD'));

console.log('smoke tests: OK');
