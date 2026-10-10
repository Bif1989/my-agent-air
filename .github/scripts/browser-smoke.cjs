/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { chromium, webkit, devices } = require('playwright');

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function checkProfile(browser, label, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  let response = await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, `${label}: home did not load`);
  assert.match(await page.locator('body').innerText(), /MY AGENT AIR/i, `${label}: brand missing`);

  response = await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, `${label}: login did not load`);
  await page.locator('input[type="email"]').waitFor();
  await page.locator('input[type="password"]').waitFor();

  response = await page.goto(`${baseURL}/register`, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, `${label}: register did not load`);
  for (const name of ['fullName', 'email', 'company', 'phone', 'city', 'agentType', 'password', 'passwordConfirmation']) {
    assert.equal(await page.locator(`[name="${name}"]`).count(), 1, `${label}: missing register field ${name}`);
  }
  assert((await page.locator('[name="password"]').getAttribute('minlength')) === '10', `${label}: password minlength must be 10`);

  response = await page.goto(`${baseURL}/agents/static-shell-smoke`, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, `${label}: static agent rewrite did not load`);
  await page.waitForURL('**/login', { timeout: 10000 });

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

  console.log('Browser smoke passed: desktop Chromium + Android Chromium + iOS WebKit');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
