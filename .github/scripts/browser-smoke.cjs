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

(async () => {
  const chromiumBrowser = await chromium.launch({ headless: true });
  try {
    await checkProfile(chromiumBrowser, 'desktop-chromium', { viewport: { width: 1440, height: 900 } });
    await checkProfile(chromiumBrowser, 'android-chromium', { ...devices['Pixel 7'] });
  } finally {
    await chromiumBrowser.close();
  }

  const webkitBrowser = await webkit.launch({ headless: true });
  try {
    await checkProfile(webkitBrowser, 'ios-webkit', { ...devices['iPhone 15'] });
  } finally {
    await webkitBrowser.close();
  }

  console.log('Browser smoke passed: auth navigation + Turnstile remount on desktop Chromium, Android Chromium and iOS WebKit');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
