const assert = require('assert');
const { parseListing, normalizeListingText, listingMarker, formatStoredList } = require('../lib/market');
const { privateMenu, groupMenu } = require('../lib/ui');

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

assert.strictEqual(privateMenu().buttons.length, 5, 'private keyboard must stay within VK row limit');
assert.strictEqual(groupMenu().buttons.length, 3, 'group keyboard must stay compact');

const formatted = formatStoredList('TEST', [{ kind: 'offer', body: 'TAS–MOW 220 USD', created_at: '2026-10-15T00:00:00Z' }]);
assert(formatted.includes('TAS–MOW 220 USD'));

console.log('smoke tests: OK');
