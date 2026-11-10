const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relatedRequests, supplierTypes, buildRfqRows, sortRfqRows } = require('../lib/rfq-monitor.ts');

const base = {
  id: 'req-hotel', created_by: 'agent-a', acting_role: null,
  category: 'Mehmonxona', origin: null, destination: 'Samarqand',
  travel_date: '2026-11-20', adults: 2, children: 0, infants: 0,
  baggage: null, budget: 150, currency: 'USD', description: null,
  service_details: { source_text: 'Samarkand hotel, transfer and guide' },
  status: 'open', created_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-10T10:00:00Z',
  creator: null,
};

test('RFQ groups drafts from same owner and original text within 30 minutes', () => {
  const group = [
    base,
    { ...base, id: 'req-car', category: 'Transfer', created_at: '2026-11-10T10:20:00Z' },
    { ...base, id: 'not-this-time', category: 'Gid', created_at: '2026-11-10T12:00:00Z' },
    { ...base, id: 'not-this-owner', created_by: 'agent-b', category: 'Gid' },
    { ...base, id: 'not-this-text', service_details: { source_text: 'Another request' } },
  ];
  assert.deepEqual(relatedRequests(group, base).map((x) => x.id), ['req-hotel', 'req-car']);
});

test('without reliable original text, requests remain separate', () => {
  assert.deepEqual(relatedRequests([base, { ...base, id: 'b', service_details: {} }], { ...base, service_details: {} }).map((x) => x.id), ['req-hotel']);
  assert.deepEqual(supplierTypes('Tur paket'), ['hotel', 'transport', 'guide', 'restaurant']);
  assert.deepEqual(supplierTypes('Viza'), []);
});

test('supplier response merges with match while keeping score and response duration', () => {
  const details = [{
    request: base, offers: [],
    matches: [{
      id: 'supplier-1', name: 'Registon Hotel', supplier_type: 'hotel',
      city: 'Samarqand', region: 'Samarqand', match_score: 92,
    }, {
      id: 'supplier-1', name: 'Registon Hotel', supplier_type: 'hotel',
      city: 'Samarqand', region: 'Samarqand', match_score: 91,
    }],
    invites: [{
      id: 'invite-1', supplier_id: 'supplier-1', supplier_name: 'Registon Hotel',
      status: 'responded', channel: 'email', created_at: '2026-11-10T10:00:00Z',
      responded_at: '2026-11-10T12:30:00Z',
      response: { available: true, price: 120, currency: 'USD', comment: 'Breakfast included' },
    }],
  }];
  const rows = buildRfqRows(details);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 92);
  assert.equal(rows[0].price, 120);
  assert.equal(rows[0].state, 'responded');
  assert.equal(rows[0].responseHours, 2.5);
});

test('offer is visible as a supplier answer without accepting or mutating data', () => {
  const rows = buildRfqRows([{
    request: base, invites: [], matches: [],
    offers: [{
      id: 'offer-1', request_id: 'req-hotel', agent_id: 'agent-2', status: 'pending',
      price: 90, currency: 'USD', created_at: '2026-11-10T11:00:00Z',
      agent: { company_name: 'Agent partner', city: 'Toshkent' }, comment: 'Net',
    }],
  }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'responded');
  assert.equal(rows[0].company, 'Agent partner');
});

test('price sort avoids comparing amounts in different currencies', () => {
  const template = { key: '', requestId: '', service: 'Hotel', company: '', location: '', channel: 'supplier', state: 'responded', price: 100, currency: 'USD', score: 90, createdAt: null, respondedAt: null, responseHours: null, note: '' };
  const rows = sortRfqRows([
    { ...template, key: 'usd-2', price: 200, currency: 'USD' },
    { ...template, key: 'uzs', price: 1000, currency: 'UZS' },
    { ...template, key: 'usd-1', price: 100, currency: 'USD' },
  ], 'price');
  assert.deepEqual(rows.map((x) => x.key), ['usd-1', 'usd-2', 'uzs']);
});
