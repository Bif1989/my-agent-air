const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stageRequestDraft, loadStagedRequestDraft } = require('../lib/request-draft-storage.ts');
const storage = () => { const values = new Map(); return { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; };

test('large Cyrillic request drafts use a short URL and retain all permitted fields', () => {
  const store = storage();
  const draft = { category: 'Mehmonxona', destination: 'Самарканд', travel_date: '2099-11-12', description: 'Тихая комната. '.repeat(60), service_details: { check_out: '2099-11-15', rooms: '20', room_distribution: 'Пожелания гостей. '.repeat(30).trim(), child_ages: Array.from({ length: 400 }, () => '7').join(',') } };
  assert.ok(encodeURIComponent(JSON.stringify(draft)).length > 8000);
  const url = stageRequestDraft(draft, 'actor-a', store, 1000);
  assert.ok(url.length < 80);
  assert.ok(!url.includes('Самарканд'));
  const id = new URL(url, 'https://example.invalid').searchParams.get('draft_id');
  const restored = loadStagedRequestDraft(id, 'actor-a', store, 2000);
  assert.equal(restored.description, draft.description);
  assert.deepEqual(restored.service_details, draft.service_details);
  assert.equal(loadStagedRequestDraft(id, 'actor-b', store, 2000), undefined);
  assert.equal(loadStagedRequestDraft(id, 'actor-a', store, 1000 + 86400001), undefined);
  assert.equal(loadStagedRequestDraft(id, 'actor-a', store, 999), undefined);
});
