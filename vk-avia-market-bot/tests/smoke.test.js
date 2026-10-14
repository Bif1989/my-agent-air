const assert = require('assert');
const { parseListing, normalizeListingText, listingMarker } = require('../lib/market');

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
console.log('smoke tests: OK');
