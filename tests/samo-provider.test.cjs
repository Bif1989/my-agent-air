const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const {
  buildSamoApiUrl,
  buildSamoSearchParams,
  normalizeSamoPrices,
} = require('../lib/server/tour-providers/samo.ts');

test('SAMO API URL keeps credentials server-side and uses export API contract', () => {
  const url = buildSamoApiUrl(
    { baseUrl: 'https://operator.example/samotour', oauthToken: 'secret-token', apiVersion: '1.0' },
    'SearchTour_PRICES',
    { TOWNFROMINC: 2, STATEINC: 6 },
  );
  assert.equal(url.origin, 'https://operator.example');
  assert.equal(url.pathname, '/samotour/export/default.php');
  assert.equal(url.searchParams.get('samo_action'), 'api');
  assert.equal(url.searchParams.get('type'), 'json');
  assert.equal(url.searchParams.get('oauth_token'), 'secret-token');
  assert.equal(url.searchParams.get('action'), 'SearchTour_PRICES');
  assert.equal(url.searchParams.get('TOWNFROMINC'), '2');
  assert.equal(url.searchParams.get('STATEINC'), '6');
});

test('SAMO search parameters map unified input to SearchTour fields', () => {
  const params = buildSamoSearchParams({
    provider: 'samo',
    departureTownId: 1885,
    destinationStateId: 9,
    checkInFrom: '2026-11-10',
    checkInTo: '2026-11-12',
    nightsFrom: 7,
    nightsTo: 9,
    adults: 2,
    children: 1,
    childAges: [8],
    currencyId: 3,
    hotelIds: [100, 200],
  });
  assert.deepEqual(params, {
    TOWNFROMINC: 1885,
    STATEINC: 9,
    CHECKIN_BEG: '20261110',
    CHECKIN_END: '20261112',
    NIGHTS_FROM: 7,
    NIGHTS_TILL: 9,
    ADULT: 2,
    CHILD: 1,
    AGES: '8',
    CURRENCYINC: 3,
    HOTELS: '100,200',
  });
});

test('SAMO price response is normalized into My Agent Air tour offers', () => {
  const offers = normalizeSamoPrices({
    SearchTour_PRICES: {
      prices: {
        price: [
          {
            id: 'offer-1',
            checkIn: '20261110',
            checkOut: '20261117',
            nights: 7,
            adult: 2,
            child: 0,
            tour: 'Antalya package',
            town: 'Antalya',
            hotel: 'Example Resort',
            star: '5*',
            meal: 'AI',
            room: 'Standard',
            htPlace: 'DBL',
            price: '1250.50',
            currency: 'USD',
            bron: 1,
            momentConfirm: 1,
            best: 1,
            stopSale: '',
            tourKey: 10,
            hotelKey: 20,
            townKey: 30,
            mealKey: 40,
            roomKey: 50,
            currencyKey: 2,
          },
          {
            id: 'offer-stopped',
            checkIn: '20261110',
            nights: 7,
            adult: 2,
            child: 0,
            price: 900,
            currency: 'USD',
            bron: 1,
            stopSale: 'Y',
          },
        ],
      },
    },
  }, { onlyAvailable: true, instantConfirmation: true });

  assert.equal(offers.length, 1);
  assert.equal(offers[0].provider, 'samo');
  assert.equal(offers[0].providerOfferId, 'offer-1');
  assert.equal(offers[0].hotel, 'Example Resort');
  assert.equal(offers[0].checkIn, '2026-11-10');
  assert.equal(offers[0].checkOut, '2026-11-17');
  assert.equal(offers[0].price, 1250.5);
  assert.equal(offers[0].available, true);
  assert.equal(offers[0].instantConfirmation, true);
  assert.equal(offers[0].bestPrice, true);
});

test('SAMO route never exposes provider credentials as NEXT_PUBLIC variables', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/tours/search/route.ts'), 'utf8');
  const adapter = fs.readFileSync(path.join(root, 'lib/server/tour-providers/samo.ts'), 'utf8');
  assert.match(route, /verifyUser/);
  assert.match(route, /readBoundedJson/);
  assert.match(adapter, /process\.env\.SAMO_BASE_URL/);
  assert.match(adapter, /process\.env\.SAMO_OAUTH_TOKEN/);
  assert.doesNotMatch(`${route}\n${adapter}`, /NEXT_PUBLIC_SAMO/);
});
