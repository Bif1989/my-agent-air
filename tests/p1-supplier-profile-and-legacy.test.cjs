const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('supplier capability editor persists service areas and notes inside details', () => {
  const api = read('app/profile/supplier-capabilities-api.ts');
  const ui = read('app/profile/supplier-capabilities.tsx');
  assert.match(api, /service_areas\?: string\[\]/);
  assert.match(api, /normalizeServiceAreas/);
  assert.match(api, /details: cleanDetails\(capability\)/);
  assert.match(ui, /Qo‘shimcha xizmat hududlari/);
  assert.match(ui, /Дополнительные зоны обслуживания/);
  assert.match(ui, /Xizmat haqida qisqa izoh/);
  assert.match(ui, /Кратко об услуге/);
});

test('Geo Tender matching scores supplier service areas against request destination', () => {
  const migration = read('supabase/migrations/20261009034000_supplier_service_area_matching.sql');
  assert.match(migration, /details->'service_areas'/);
  assert.match(migration, /service_area_match/);
  assert.match(migration, /when service_area_match is not null then 30/);
  assert.match(migration, /'service_area',service_area_match/);
  assert.match(migration, /revoke all on function app_private\.refresh_request_targets_internal\(uuid,integer\) from public, anon, authenticated/);
});

test('legacy assistant and messages routes redirect to current product surfaces', () => {
  const assistant = read('app/assistant/page.tsx');
  const messages = read('app/messages/page.tsx');
  const dealMessage = read('app/messages/[dealId]/page.tsx');
  assert.match(assistant, /redirect\("\/dashboard"\)/);
  assert.match(messages, /redirect\("\/deals"\)/);
  assert.match(dealMessage, /redirect\(`\/deals\/\$\{encodeURIComponent\(dealId\)\}#chat`\)/);
});
