/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { chromium, webkit, devices } = require('playwright');

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function expectLoginRedirect(page, path, label) {
  const response = await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, `${label}: ${path} static rewrite did not load`);
  await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
}

async function installTurnstileMock(page) {
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `(() => {
        let sequence = 0;
        const widgets = new Map();
        window.turnstile = {
          render(element, options = {}) {
            const id = 'ci-turnstile-' + (++sequence);
            const marker = document.createElement('div');
            marker.dataset.testTurnstile = String(options.action || 'unknown');
            marker.dataset.testWidgetId = id;
            marker.textContent = 'Turnstile test challenge';
            element.appendChild(marker);
            widgets.set(id, marker);
            return id;
          },
          remove(id) {
            const marker = widgets.get(id);
            if (marker) marker.remove();
            widgets.delete(id);
          },
          reset() {},
        };
      })();`,
    });
  });
}

async function expectTurnstile(page, action, label) {
  const marker = page.locator(`[data-test-turnstile="${action}"]`);
  await marker.waitFor({ state: 'attached', timeout: 10000 });
  assert.equal(await marker.count(), 1, `${label}: ${action} Turnstile challenge did not render exactly once`);
}

async function dismissPwaInstall(page) {
  const dialog = page.locator('aside[role="dialog"][aria-label="Ilovani o‘rnatish"], aside[role="dialog"][aria-label="Установка приложения"]');
  if (!await dialog.isVisible().catch(() => false)) return;
  const later = dialog.getByRole('button', { name: /Keyin|Позже/ });
  if (await later.count()) await later.click();
  await dialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}

async function clickPath(page, href, pathname, label) {
  await dismissPwaInstall(page);
  const link = page.locator(`a[href="${href}"]`).first();
  assert.equal(await link.count(), 1, `${label}: missing link to ${href}`);
  try {
    await link.click({ timeout: 5000 });
  } catch (error) {
    await dismissPwaInstall(page);
    await link.click({ timeout: 10000 }).catch(() => { throw error; });
  }
  await page.waitForFunction(
    (expectedPathname) => window.location.pathname === expectedPathname,
    pathname,
    { timeout: 10000 },
  );
}

async function checkProfile(browser, label, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await installTurnstileMock(page);

  let response = await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, `${label}: home did not load`);
  assert.match(await page.locator('body').innerText(), /MY AGENT AIR/i, `${label}: brand missing`);

  response = await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, `${label}: login did not load`);
  await page.locator('input[name="identifier"]').waitFor();
  await page.locator('input[type="password"]').waitFor();
  await expectTurnstile(page, 'login', label);

  // Real user auth navigation: keep the same document/script cache and verify
  // Turnstile remounts after each Next.js client-side route transition.
  await clickPath(page, '/register', '/register', label);
  for (const name of ['identifier', 'password', 'terms']) {
    assert.equal(await page.locator(`[name="${name}"]`).count(), 1, `${label}: missing register field ${name}`);
  }
  for (const deferredName of ['fullName', 'company', 'city', 'agentType', 'passwordConfirmation']) {
    assert.equal(await page.locator(`[name="${deferredName}"]`).count(), 0, `${label}: profile field ${deferredName} must be deferred until after verification`);
  }
  assert((await page.locator('[name="password"]').getAttribute('minlength')) === '10', `${label}: password minlength must be 10`);
  assert.match(await page.locator('body').innerText(), /Telefon|Телефон/);
  assert.match(await page.locator('body').innerText(), /Email/);
  await expectTurnstile(page, 'signup', label);

  await clickPath(page, '/login', '/login', label);
  await expectTurnstile(page, 'login', label);
  await clickPath(page, '/forgot-password', '/forgot-password', label);
  await page.locator('input[name="email"]').waitFor();
  await expectTurnstile(page, 'recover', label);
  await clickPath(page, '/login', '/login', label);
  await expectTurnstile(page, 'login', label);

  for (const path of [
    '/agents/static-shell-smoke',
    '/admin/agents/static-shell-smoke',
    '/deals/static-shell-smoke',
    '/feed/static-shell-smoke',
    '/feed/static-shell-smoke/edit',
    '/messenger/static-shell-smoke',
    '/messenger/static-shell-smoke/settings',
    '/requests/static-shell-smoke',
    '/requests/static-shell-smoke/edit',
  ]) await expectLoginRedirect(page, path, label);

  response = await page.goto(`${baseURL}/supplier-request/0123456789abcdef0123456789abcdef`, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, `${label}: public supplier static rewrite did not load`);

  const manifest = await context.request.get(`${baseURL}/manifest.webmanifest`);
  assert(manifest.ok(), `${label}: manifest unavailable`);
  const manifestJson = await manifest.json();
  assert.equal(manifestJson.start_url, '/dashboard', `${label}: unexpected PWA start_url`);
  assert(Array.isArray(manifestJson.icons) && manifestJson.icons.length >= 2, `${label}: PWA icons missing`);

  await context.close();
}

// All data is synthetic; no authenticated request reaches a real backend.
async function checkAccountSwitch(browser, label, contextOptions) {
  const context = await browser.newContext({ ...contextOptions, serviceWorkers: 'block' });
  const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  const session = (id) => ({ user: { id }, refresh_token: `fixture-${id}`, access_token: `e30.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800 })).toString('base64url')}.fixture` });
  await context.addInitScript((initial) => {
    if (!localStorage.getItem('my_agent_air_session')) localStorage.setItem('my_agent_air_session', JSON.stringify(initial));
  }, session(ids[0]));
  await context.route('https://*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const token = (request.headers().authorization || '').replace('Bearer ', '');
    const uid = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub : ids[0];
    const name = uid === ids[0] ? 'PRIVATE_ACCOUNT_A' : 'PRIVATE_ACCOUNT_B';
    let body = [];
    if (url.pathname.endsWith('/profiles')) body = [{ id: uid, full_name: name, company_name: 'Fixture Travel', region: 'Toshkent', city: 'Toshkent', phone: '998901234567', agent_type: 'Turagent', services: [], avatar_url: null, role: 'admin', is_active: true, is_verified: false, registration_status: 'active', created_at: '2026-10-01T00:00:00Z', updated_at: null }];
    if (url.pathname.endsWith('/rpc/list_messenger_conversations')) body = [{ room_id: 'fixture-room', room_type: 'direct', counterpart_full_name: name, counterpart_company_name: 'Fixture Travel', last_message: name, last_message_at: null, unread_count: 0 }];
    if (url.pathname.endsWith('/rpc/get_unread_deal_message_count')) body = 0;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  await page.routeWebSocket(/supabase\.co/, (socket) => socket.close());
  await page.goto(`${baseURL}/messenger`, { waitUntil: 'domcontentloaded' });
  await page.locator('a[href="/messenger/fixture-room"]').getByText('PRIVATE_ACCOUNT_A', { exact: true }).first().waitFor();
  const before = await page.evaluate(() => performance.timeOrigin);
  // A second tab writes the shared session, firing the real browser storage event.
  const second = await context.newPage();
  await second.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
  await second.evaluate((next) => localStorage.setItem('my_agent_air_session', JSON.stringify(next)), session(ids[1]));
  await page.waitForFunction((old) => performance.timeOrigin !== old, before);
  await page.locator('a[href="/messenger/fixture-room"]').getByText('PRIVATE_ACCOUNT_B', { exact: true }).first().waitFor();
  assert(!((await page.locator('body').innerText()).includes('PRIVATE_ACCOUNT_A')), `${label}: old account data survived storage switch`);
  const after = await page.evaluate(() => performance.timeOrigin);
  await page.evaluate((next) => {
    localStorage.setItem('my_agent_air_session', JSON.stringify(next));
    dispatchEvent(new Event('my-agent-air:session-changed'));
  }, session(ids[0]));
  await page.waitForFunction((old) => performance.timeOrigin !== old, after);
  await page.locator('a[href="/messenger/fixture-room"]').getByText('PRIVATE_ACCOUNT_A', { exact: true }).first().waitFor();
  assert(!((await page.locator('body').innerText()).includes('PRIVATE_ACCOUNT_B')), `${label}: old account data survived local switch`);
  await context.close();
}

async function checkHomeLayout(browser, label, widths) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/api/public/platform-stats', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ supplier_records: 1392, hotels: 2, tour_operators: 3, travel_agents: 3, total_active: 19, agent_profiles: 48, updated_at: new Date().toISOString() }),
  }));
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    for (const locale of ['UZ', 'RU']) {
      await page.getByRole('button', { name: locale, exact: true }).click();
      const stats = page.locator('[aria-label="Platforma statistikasi"], [aria-label="Статистика платформы"]');
      await stats.getByText(/1\D?392/).waitFor().catch(async (error) => {
        throw new Error(`${label} ${width}px ${locale}: stats did not render; errors=${JSON.stringify(errors)}; page=${await page.locator('body').innerText()}; ${error.message}`);
      });
      const overflow = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        return [...document.querySelectorAll('nav a, nav button, h1, [aria-label="Platforma statistikasi"] span, [aria-label="Platforma statistikasi"] p, [aria-label="Статистика платформы"] span, [aria-label="Статистика платформы"] p')]
          .filter((element) => { const box = element.getBoundingClientRect(); return box.width && (box.left < -1 || box.right > viewport + 1 || element.scrollWidth > element.clientWidth + 1); })
          .map((element) => element.textContent.trim());
      });
      assert.deepEqual(overflow, [], `${label} ${width}px ${locale}: clipped hero/navigation/statistics`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} ${width}px ${locale}: page overflow`);
    }
  }
  await context.close();
}

(async () => {
  const chromiumBrowser = await chromium.launch({ headless: true });
  try {
    await checkProfile(chromiumBrowser, 'desktop-chromium', { viewport: { width: 1440, height: 900 } });
    await checkProfile(chromiumBrowser, 'android-chromium', { ...devices['Pixel 7'] });
    await checkAccountSwitch(chromiumBrowser, 'desktop-account-switch', { viewport: { width: 1440, height: 900 } });
    await checkAccountSwitch(chromiumBrowser, 'android-account-switch', { ...devices['Pixel 7'] });
    await checkHomeLayout(chromiumBrowser, 'chromium-layout', [320, 375, 768, 1024, 1440]);
  } finally {
    await chromiumBrowser.close();
  }

  const webkitBrowser = await webkit.launch({ headless: true });
  try {
    await checkProfile(webkitBrowser, 'ios-webkit', { ...devices['iPhone 15'] });
    await checkAccountSwitch(webkitBrowser, 'ios-account-switch', { ...devices['iPhone 15'] });
    await checkHomeLayout(webkitBrowser, 'webkit-layout', [320, 390, 1440]);
  } finally {
    await webkitBrowser.close();
  }

  console.log('Browser smoke passed: account-switch isolation + auth navigation + Turnstile remount on desktop Chromium, Android Chromium and iOS WebKit');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
