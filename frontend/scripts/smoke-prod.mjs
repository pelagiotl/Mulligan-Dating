import { chromium } from 'playwright';

const url = process.argv[2] || 'https://mulligan-frontend.onrender.com/';

const withToken = process.argv.includes('--token');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
if (withToken) {
  await context.addInitScript(() => {
    localStorage.setItem('token', 'fake-token-for-boot-test');
  });
}
const page = await context.newPage();
const errors = [];
const failed = [];

page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${t}`);
  if (t.includes('Uncaught') || t.includes('Error')) errors.push(`console: ${t}`);
});
page.on('requestfailed', (req) => {
  failed.push(`${req.failure()?.errorText || 'failed'} ${req.url()}`);
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(12000);

const mounted = await page.evaluate(() => ({
  entryLoaded: !!window.__MULLIGAN_ENTRY_LOADED__,
  appMounted: !!window.__MULLIGAN_APP_MOUNTED__,
  rootChildCount: document.getElementById('root')?.childElementCount ?? -1,
  html: document.documentElement.outerHTML.slice(0, 800),
}));

const boot = await page.locator('#boot-fallback').count();
const body = await page.locator('body').innerText().catch(() => '');
const rootHtml = await page.locator('#root').innerHTML().catch(() => '');
const title = await page.title();

console.log(JSON.stringify({ url, title, bootFallback: boot, bodyLen: body.length, bodyPreview: body.slice(0, 500), rootLen: rootHtml.length, rootPreview: rootHtml.slice(0, 300), mounted, errors, failed }, null, 2));

await browser.close();
