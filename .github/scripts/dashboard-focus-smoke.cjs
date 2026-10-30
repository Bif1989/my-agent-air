/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { chromium, webkit, devices } = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function check(browser, options) {
  const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
  const uid = '00000000-0000-4000-8000-000000000001';
  const token = `e30.${Buffer.from(JSON.stringify({ sub: uid, exp: 4102444800 })).toString('base64url')}.fixture`;
  await context.addInitScript(({ uid, token }) => {
    localStorage.setItem('my_agent_air_session', JSON.stringify({ user: { id: uid }, access_token: token, refresh_token: 'fixture' }));
    localStorage.setItem('my-agent-air:locale', 'uz');
  }, { uid, token });
  // Synthetic fixture: no authenticated request, publication or paid AI call reaches production.
  await context.route('https://*.supabase.co/**', route => {
    const path = new URL(route.request().url()).pathname;
    const profile = { id: uid, full_name: 'Demo hamkor', company_name: 'Demo Travel', city: 'Toshkent', phone: '998901234567', agent_type: 'Turagent', services: [], role: 'agent', is_active: true, registration_status: 'active' };
    let body = [];
    if (path.endsWith('/profiles')) body = [profile];
    if (path.endsWith('/rpc/get_dashboard_summary')) body = { profile, stats: { openRequests: 0, offers: 0, deals: 0, agents: 22 } };
    if (path.endsWith('/ai_chat_conversations')) body = [{ id: 'fixture-chat', title: 'Yangi chat', created_at: '2026-10-01', updated_at: '2026-10-01' }];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  let aiCalls = 0;
  await context.route('**/api/ai', route => { aiCalls++; return route.fulfill({ status: 500, body: '{}' }); });
  const page = await context.newPage();
  await page.routeWebSocket(/supabase\.co/, socket => socket.close());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/dashboard`);
  const panel = page.locator('#dashboard-request-panel');
  await panel.waitFor({ state: 'visible' });
  const origin = panel.getByRole('combobox', { name: 'Qayerdan', exact: true });
  await origin.fill('Chust');
  const composer = page.getByRole('textbox', { name: 'AI yordamchiga yozing' });
  await composer.focus();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await composer.evaluate(el => document.activeElement === el), true, 'Focus must stay in the composer');
  await composer.fill('Keep this unsent chat draft');
  const open = page.getByRole('button', { name: /So‘rov panelini ochish/ });
  await open.click();
  await panel.waitFor({ state: 'visible' });
  assert.equal(await origin.inputValue(), 'Chust', 'Collapsing must preserve the request draft');
  assert.equal(await composer.inputValue(), 'Keep this unsent chat draft');
  await composer.focus();
  await panel.waitFor({ state: 'hidden' });
  // Verify growth and visibility without sending anything.
  const chat = await page.locator('#ai-chat').boundingBox();
  const input = await composer.boundingBox();
  assert(chat.height > 250, 'Expanded chat must have usable height');
  assert(input.y >= chat.y && input.y + input.height <= chat.y + chat.height + 1, 'Composer must remain inside expanded chat');
  assert.equal(aiCalls, 0, 'Focus must not send a message');
  assert.deepEqual(errors, [], 'Dashboard must not throw browser exceptions');
  await context.close();
}

(async () => {
  const chrome = await chromium.launch({ headless: true });
  try {
    await check(chrome, { viewport: { width: 1366, height: 768 } });
    await check(chrome, { ...devices['Pixel 7'] });
  } finally { await chrome.close(); }
  const safari = await webkit.launch({ headless: true });
  try { await check(safari, { ...devices['iPhone 13'] }); }
  finally { await safari.close(); }
  console.log('Dashboard focus smoke passed: initial shared view, composer focus, expand/reopen, draft preservation and no auto-send');
})().catch(error => { console.error(error); process.exitCode = 1; });
