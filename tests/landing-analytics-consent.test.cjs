const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { ANALYTICS_COOKIE_NAME, isAnalyticsLandingPage, readAnalyticsChoice, serializeAnalyticsChoice } = require('../lib/landing-analytics-consent.ts');
const { getLandingAnalyticsConfig, renderAnalyticsFrame } = require('../lib/landing-analytics.ts');

const origin = 'https://agent.bifavia.uz';
const grant = ANALYTICS_COOKIE_NAME + '=v1.granted';

test('only a valid, versioned affirmative cookie opts in', () => {
  assert.equal(readAnalyticsChoice(''), null);
  assert.equal(readAnalyticsChoice('test=' + grant), null);
  assert.equal(readAnalyticsChoice(ANALYTICS_COOKIE_NAME + '=v0.granted'), null);
  assert.equal(readAnalyticsChoice(grant + '; ' + grant), null);
  assert.equal(readAnalyticsChoice('unrelated=1; ' + grant), 'granted');
  assert.equal(readAnalyticsChoice(ANALYTICS_COOKIE_NAME + '=v1.denied'), 'denied');
  assert.match(serializeAnalyticsChoice('denied'), /Path=\/; Max-Age=15552000; SameSite=Strict; Secure$/);
});

test('measurement is limited to the canonical landing path with no query or anchor', () => {
  assert.equal(isAnalyticsLandingPage(origin, '/', '', ''), true);
  for (const [base, path, search, hash] of [
    [origin, '/register', '', ''], [origin, '/dashboard', '', ''], [origin, '/s/token', '', ''],
    [origin, '/', 'email=example', ''], [origin, '/', '', '#token'], ['https://preview.vercel.app', '/', '', ''],
  ]) assert.equal(isAnalyticsLandingPage(base, path, search, hash), false);
});

test('unset, malformed and conflicting provider configuration fail closed', () => {
  assert.equal(getLandingAnalyticsConfig({}), null);
  assert.equal(getLandingAnalyticsConfig({ LANDING_ANALYTICS_GTM_ID: 'G-12345' }), null);
  assert.equal(getLandingAnalyticsConfig({ LANDING_ANALYTICS_GA4_ID: 'G-12345', LANDING_ANALYTICS_GTM_ID: 'GTM-67890' }), null);
  assert.deepEqual(getLandingAnalyticsConfig({ LANDING_ANALYTICS_GTM_ID: 'GTM-67890' }), { kind: 'gtm', id: 'GTM-67890' });
  assert.deepEqual(getLandingAnalyticsConfig({ LANDING_ANALYTICS_GA4_ID: 'G-12345' }), { kind: 'ga4', id: 'G-12345' });
});

test('GTM and GA4 companion documents deny ad permissions and provide the same fixed public context', () => {
  for (const config of [{ kind: 'gtm', id: 'GTM-67890' }, { kind: 'ga4', id: 'G-12345' }]) {
    const body = renderAnalyticsFrame(config, 'test-nonce');
    assert.match(body, /https:\/\/agent\.bifavia\.uz\//);
    assert.match(body, /page_referrer[^\n]*''/);
    assert.match(body, /'consent','default'.*analytics_storage:'denied'/);
    assert.match(body, /'consent','update'.*analytics_storage:'granted'.*ad_storage:'denied'/);
    assert.match(body, config.kind === 'gtm' ? /maa_landing_view/ : /send_page_view:false/);
    assert.doesNotMatch(body, /window\.location|document\.referrer|window\.parent/);
  }
});

test('client only mounts an opaque, no-referrer sandbox with valid opt-in', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app/components/analytics-consent.tsx'), 'utf8');
  assert.match(source, /enabled && publicLanding && choice === "granted" && !blockForThisDocument/);
  assert.match(source, /shouldLoad && config && <LandingAnalyticsFrame/);
  assert.match(source, /sandbox="allow-scripts"/);
  assert.doesNotMatch(source, /allow-same-origin/);
  assert.match(source, /referrerPolicy="no-referrer"/);
  assert.match(source, /URL\.createObjectURL\(new Blob/);
  assert.match(source, /URL\.revokeObjectURL\(frameUrl\)/);
  const body = renderAnalyticsFrame({ kind: 'ga4', id: 'G-12345' }, 'test-nonce');
  assert.match(body, /Content-Security-Policy/);
  assert.match(body, /default-src 'none'; object-src 'none'; base-uri 'none'; script-src 'nonce-test-nonce'/);
  assert.match(body, /referrer" content="no-referrer"/);
});
