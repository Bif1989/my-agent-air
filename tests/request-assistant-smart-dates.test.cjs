const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRequestDraft, parseRequestDrafts } = require('../lib/request-assistant.ts');

const now = new Date('2026-10-05T09:00:00Z');

test('day and month without year use current year when date is still ahead', () => {
  const parsed = parseRequestDraft('TAS-IST 20окт 2 киши avia', {}, now);
  assert.equal(parsed.draft.origin, 'Toshkent');
  assert.equal(parsed.draft.destination, 'Istanbul');
  assert.equal(parsed.draft.travel_date, '2026-10-20');
  assert.equal(parsed.draft.adults, 2);
});

test('day and month without year roll to next year after the date has passed', () => {
  const parsed = parseRequestDraft('TAS-IST 15 yanvar 2 kishi avia', {}, now);
  assert.equal(parsed.draft.travel_date, '2027-01-15');
});

test('short numeric dates also infer the nearest future year', () => {
  assert.equal(parseRequestDraft('TAS-IST 20.10 avia', {}, now).draft.travel_date, '2026-10-20');
  assert.equal(parseRequestDraft('TAS-IST 15.01 avia', {}, now).draft.travel_date, '2027-01-15');
});

test('one AI message can create several independent request drafts', () => {
  const drafts = parseRequestDrafts('TAS-IST 20окт 2 kishi; TAS-DXB 25окт 3 kishi', {}, now);
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts.map((item) => item.draft.destination), ['Istanbul', 'Dubai']);
  assert.deepEqual(drafts.map((item) => item.draft.travel_date), ['2026-10-20', '2026-10-25']);
  assert.deepEqual(drafts.map((item) => item.draft.adults), [2, 3]);
});

test('multiple service types still create separate drafts for one route', () => {
  const drafts = parseRequestDrafts('TAS-IST 20 okt 2 kishi aviachipta hotel transfer', {}, now);
  assert.deepEqual(drafts.map((item) => item.draft.category), ['Aviachipta', 'Mehmonxona', 'Transfer']);
});
