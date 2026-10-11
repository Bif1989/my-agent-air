const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');

test('VK Mini App login uses the consolidated auth function with signed fresh launch params', () => {
  const route = read('app/api/auth/[action]/route.ts');
  const action = read('lib/server/auth-actions/vk.ts');
  const client = read('app/components/vk-launch-auth.tsx');
  assert.match(route, /POST as vkPost/);
  assert.match(route, /vk:\s*vkPost/);
  assert.equal(fs.existsSync('app/api/auth/vk/route.ts'), false);
  assert.match(action, /VK_SECRET_KEY/);
  assert.match(action, /createHmac\("sha256"/);
  assert.match(action, /timingSafeEqual/);
  assert.match(action, /STALE_LAUNCH_PARAMS/);
  assert.match(action, /SUPABASE_SECRET_KEY/);
  assert.match(action, /agent_type:\s*"Aviakassa"/);
  assert.match(client, /getVkLaunchParams/);
  assert.match(client, /VKWebAppGetUserInfo/);
  assert.match(client, /fetch\("\/api\/auth\/vk"/);
  assert.match(client, /saveSession/);
});

test('aviation and tourism requests keep the exact AI text as title and searchable JSON metadata', () => {
  const ai = read('app/requests/request-ai-fill.tsx');
  const api = read('app/requests/requests-api.ts');
  const service = read('lib/service-request.ts');
  assert.match(ai, /source_text:\s*sourceText/);
  assert.match(api, /service_details->>source_text\.ilike/);
  assert.match(service, /return sourceText \|\| base\.requestTitle\(input\)/);
});

test('fast request publishing makes detailed questionnaires optional without dropping validation of supplied values', () => {
  const service = read('lib/service-request.ts');
  const form = read('app/requests/request-form.tsx');
  assert.match(service, /required:\s*false/);
  assert.match(service, /syntheticFields/);
  assert.match(form, /Qo‘shimcha talablar — ixtiyoriy/);
  assert.match(form, /values\.origin\?\.trim\(\) \|\| null/);
  assert.match(form, /setAdvancedOpen\(false\)/);
});

test('outbound tour packages are routed to tour operators and can use destination service areas', () => {
  const matching = read('supabase/migrations/20261010210000_p6_trust_matching_and_agent_ranking.sql');
  assert.match(matching, /when 'Tur paket' then array\['tour_operator','travel_agent'\]/);
  assert.match(matching, /v_request\.category='Tur paket' and c\.capability_type='tour_operator'/);
  assert.match(matching, /service_area_match/);
});

test('VK aviation onboarding classifies legacy users and creates primary Geo-Tender capabilities automatically', () => {
  const sql = read('supabase/migrations/20261011183500_aviation_vk_growth.sql');
  assert.match(sql, /set agent_type = 'Aviakassa'/);
  assert.match(sql, /vk_identities/);
  assert.match(sql, /ensure_primary_supplier_capability/);
  assert.match(sql, /when 'Aviakassa' then 'aviation'/);
  assert.match(sql, /when 'Turoperator' then 'tour_operator'/);
  assert.match(sql, /registration_status <> 'active'/);
  assert.match(sql, /on conflict \(profile_id, capability_type\)/);
});

test('My Agent Air branding replaces the old generic icon without adding a runtime endpoint', () => {
  const icon = read('public/my-agent-air-icon.svg');
  const logo = read('public/my-agent-air-logo.svg');
  const layout = read('app/layout.tsx');
  assert.match(icon, /linearGradient/);
  assert.match(icon, /My Agent Air/);
  assert.match(logo, /MY AGENT/);
  assert.match(logo, />AIR</);
  assert.match(layout, /applicationName:\s*"My Agent Air"/);
  assert.match(layout, /VkLaunchAuth/);
});
