const assert = require('assert');
const {
  parseListing,
  normalizeListingText,
  listingMarker,
  isForwardedMessage,
  isGroupPeer,
  parseProfileInput,
  formatStoredList,
  formatManagedList,
  sendPrivateHome,
} = require('../lib/market');
const { messageRef, editMessage } = require('../lib/vk');
const storage = require('../lib/storage');
const {
  privateMenu,
  profileMenu,
  listingManageMenu,
  confirmDeleteMenu,
  groupMenu,
  adminMenu,
  privateHome,
  groupHome,
  adminHome,
} = require('../lib/ui');

assert.strictEqual(normalizeListingText('  TAS   MOW  '), 'tas mow');
assert.strictEqual(listingMarker('offer', 123), '#AM2_OFFER_123');
assert.strictEqual(listingMarker('search', 456), '#AM2_SEARCH_456');
assert.strictEqual(isForwardedMessage({ fwd_messages: [{ id: 1 }] }), true, 'forwarded VK messages must be detected');
assert.strictEqual(isForwardedMessage({ fwd_messages: [] }), false, 'empty forward list must not be blocked');
assert.strictEqual(isForwardedMessage({ text: 'oddiy xabar' }), false, 'ordinary chat messages must remain allowed');
assert.strictEqual(isGroupPeer(2000000001), true);
assert.strictEqual(isGroupPeer(2000000555), true);
assert.strictEqual(isGroupPeer(123456), false);

const parsed = parseListing({
  text: '✈️ TAKLIF\n👤 [id123|Agent]\n🏢 BIF AVIA\n📞 +998 91 292 40 10\n✈️ Telegram: @bif89\n✏️ Yangilandi: 15.10 14:00\n\nTAS–MOW 20 oktabr 220 USD\n\n#AviaMarket\n#AM2_OFFER_123',
  date: 1791990000,
  conversation_message_id: 10,
});
assert(parsed);
assert.strictEqual(parsed.kind, 'offer');
assert.strictEqual(parsed.userId, 123);
assert.strictEqual(parsed.text, 'TAS–MOW 20 oktabr 220 USD');

assert.deepStrictEqual(parseProfileInput('BIF AVIA | +998 91 292 40 10 | @bif89'), {
  company: 'BIF AVIA',
  phone: '+998 91 292 40 10',
  telegram: '@bif89',
});
assert.deepStrictEqual(parseProfileInput('- | +998900000000 | https://t.me/test_user'), {
  company: null,
  phone: '+998900000000',
  telegram: '@test_user',
});
assert.strictEqual(parseProfileInput('BIF AVIA | +99890'), null, 'profile requires exactly three pipe-delimited fields');
assert.strictEqual(parseProfileInput('BIF AVIA | +99890 | @x'), null, 'telegram username validation must reject too-short usernames');

assert.deepStrictEqual(messageRef(77), { message_id: 77, conversation_message_id: null });
assert.deepStrictEqual(messageRef({ message_id: 88, conversation_message_id: 99 }), { message_id: 88, conversation_message_id: 99 });
assert.deepStrictEqual(messageRef({ conversation_message_id: 99 }), { message_id: null, conversation_message_id: 99 });
assert.strictEqual(typeof editMessage, 'function');

const privateKeyboard = privateMenu();
const cabinetKeyboard = profileMenu();
const managerKeyboard = listingManageMenu([{ id: 11 }, { id: 22 }]);
const deleteKeyboard = confirmDeleteMenu(22);
const groupKeyboard = groupMenu();
const adminKeyboard = adminMenu();
assert.strictEqual(privateKeyboard.buttons.length, 5, 'private keyboard must stay compact');
assert.strictEqual(privateKeyboard.buttons[0][0].action.type, 'callback', 'public chat button must resolve the universal chat link through the bot');
assert(privateKeyboard.buttons[0][0].action.label.includes('UMUMIY CHAT'));
assert(privateKeyboard.buttons[0][0].action.payload.includes('open_market_chat'));
assert.strictEqual(privateKeyboard.buttons[0][0].color, 'primary');
assert(cabinetKeyboard.buttons[0][0].action.payload.includes('profile_edit'));
assert(managerKeyboard.buttons[0][0].action.payload.includes('edit_listing'));
assert(managerKeyboard.buttons[0][1].action.payload.includes('delete_listing'));
assert(managerKeyboard.buttons[0][0].action.payload.includes('11'));
assert(deleteKeyboard.buttons[0][0].action.payload.includes('confirm_delete_listing'));
assert.strictEqual(groupKeyboard, null, 'public chat must use a pinned plain-text rules message, not an inline keyboard');
assert.strictEqual(adminKeyboard.buttons.length, 2, 'admin controls must stay in a separate compact card');
assert(adminKeyboard.buttons[0][0].action.payload.includes('admin_pinmenu'));
assert(adminKeyboard.buttons[0][0].action.label.includes('QOIDALARNI'));
assert(adminKeyboard.buttons[1][0].action.payload.includes('admin_cleanall'));

const privateHomeText = privateHome().text;
const groupHomeCard = groupHome();
const secondaryGroupHome = groupHome({ isPrimary: false }).text;
const groupHomeText = groupHomeCard.text;
const adminHomeText = adminHome().text;
assert(privateHomeText.includes('SHAXSIY BOT QOIDALARI'));
assert(privateHomeText.includes('KABINET'));
assert(privateHomeText.includes('o‘zgartirish yoki o‘chirish'));
assert(privateHomeText.includes('24 soat'));
assert(privateHomeText.includes('30 soniya'));
assert(privateHomeText.includes('universal havolasini'));
assert(groupHomeText.includes('UMUMIY CHAT QOIDALARI'));
assert(groupHomeText.includes('https://vk.me/aviamarketbot'));
assert(groupHomeText.includes('SHAXSIY BOT'));
assert(groupHomeText.includes('10+ belgilik'));
assert(groupHomeText.includes('24 soat'));
assert(groupHomeText.includes('pereslat (forward)'));
assert(groupHomeText.includes('bot tomonidan o‘chiriladi'));
assert(secondaryGroupHome.includes('qo‘shimcha chatda bot moderatsiya qiladi'));
assert.strictEqual(groupHomeCard.keyboard, null);
assert(!groupHomeText.includes('ADMIN BOT'));
assert(adminHomeText.includes('faqat admin akkauntida'));
assert(adminHomeText.includes('Alohida ADMIN BOT yo‘q'));
assert(adminHomeText.includes('MULTI-CHAT'));
assert.strictEqual(typeof sendPrivateHome, 'function');

for (const name of [
  'health', 'setMode', 'getMode', 'clearMode', 'createListing', 'finalizeListing',
  'listUser', 'listRecent', 'stats', 'getProfile', 'setProfile', 'getOwnListing',
  'updateOwnListing', 'deleteOwnListing', 'trackBotMessage', 'listCleanupTargets',
  'markDeleted', 'checkChatDuplicate',
]) {
  assert.strictEqual(typeof storage[name], 'function', `storage.${name} must be exported`);
}

const formatted = formatStoredList('TEST', [{ kind: 'offer', body: 'TAS–MOW 220 USD', created_at: '2026-10-15T00:00:00Z' }]);
assert(formatted.includes('TAS–MOW 220 USD'));
const managed = formatManagedList('MENING', [{ id: 9, kind: 'offer', body: 'TAS–DXB 300 USD', created_at: '2026-10-15T00:00:00Z' }]);
assert(managed.includes('#9'));
assert(managed.includes('TAS–DXB 300 USD'));
assert(managed.includes('o‘zgartirish'));

console.log('smoke tests: OK');
