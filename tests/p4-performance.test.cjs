const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('P4 shared in-flight dedupe reuses only active requests and clears after completion', () => {
  const source = read('lib/inflight-dedupe.ts');
  assert.match(source, /const inFlightReads = new Map<string, Promise<unknown>>\(\)/);
  assert.match(source, /const existing = inFlightReads\.get\(requestKey\)/);
  assert.match(source, /if \(existing\) return existing/);
  assert.match(source, /inFlightReads\.set\(requestKey, task\)/);
  assert.match(source, /inFlightReads\.delete\(requestKey\)/);
  assert.doesNotMatch(source, /setTimeout|Date\.now|localStorage|sessionStorage/);
});

test('P4 deduplicates high-frequency authenticated reads without caching mutations', () => {
  const requests = read('app/requests/requests-api.ts');
  const dashboard = read('app/dashboard/components/dashboard-data.ts');
  const deals = read('app/deals/deals-api.ts');
  const feed = read('app/feed/feed-api.ts');
  const offers = read('app/offers/offers-api.ts');
  const profile = read('app/profile/profile-api.ts');
  const notificationPreferences = read('app/profile/notification-preferences-api.ts');
  const aiHistory = read('lib/ai-chat-history.ts');

  assert.match(requests, /dedupeInFlight\("requests:list"/);
  assert.match(requests, /dedupeInFlight\("requests:get"/);
  assert.match(dashboard, /dedupeInFlight\("dashboard:summary"/);
  assert.match(deals, /dedupeInFlight\("deals:list"/);
  assert.match(deals, /dedupeInFlight\("deals:get"/);
  assert.match(deals, /dedupeInFlight\("deals:activity"/);
  assert.match(feed, /dedupeInFlight\("feed:list"/);
  assert.match(feed, /dedupeInFlight\("feed:get"/);
  assert.match(feed, /dedupeInFlight\("feed:comments"/);
  assert.match(offers, /dedupeInFlight\("offers:list-mine"/);
  assert.match(offers, /dedupeInFlight\("offers:list-incoming"/);
  assert.match(offers, /dedupeInFlight\("offers:get"/);
  assert.match(offers, /dedupeInFlight\("offers:request"/);
  assert.match(profile, /dedupeInFlight\("profile:current"/);
  assert.match(notificationPreferences, /dedupeInFlight\("profile:notification-preferences"/);
  assert.match(aiHistory, /dedupeInFlight\("ai-history:conversations"/);
  assert.match(aiHistory, /dedupeInFlight\("ai-history:messages"/);

  assert.doesNotMatch(requests, /dedupeInFlight\("requests:(create|update|delete)/);
  assert.doesNotMatch(deals, /dedupeInFlight\("deals:update/);
  assert.doesNotMatch(feed, /dedupeInFlight\("feed:(create|update|delete|reaction)/);
  assert.doesNotMatch(offers, /dedupeInFlight\("offers:(create|update|withdraw|accept)/);
  assert.doesNotMatch(profile, /dedupeInFlight\("profile:update/);
  assert.doesNotMatch(notificationPreferences, /dedupeInFlight\("profile:update-notification-preferences"/);
  assert.doesNotMatch(aiHistory, /dedupeInFlight\("ai-history:(save|rename|delete)/);
});
