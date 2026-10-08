/**
 * Captures the README screenshots from a running web build.
 *
 *   npm run db:up && npm run dev:api              # API on :4600
 *   npm run build:web && npx serve -s apps/mobile/dist -l 3600   # or any static server with SPA fallback
 *   npm run screenshots
 *
 * Env: WEB_URL (default http://localhost:3600), CHROME_PATH (default /usr/bin/google-chrome)
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { launch } from 'puppeteer-core';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3600';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
await mkdir(OUT, { recursive: true });

async function session({ width, height, scheme, scale = 1 }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(`${WEB_URL}/welcome`, { waitUntil: 'networkidle0' });
  return page;
}

async function shot(page, name) {
  await page.mouse.move(1, 1);
  await wait(900);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('saved', name);
}

async function tryDemo(page) {
  await page.click('[data-testid="try-demo"]');
  await page.waitForSelector('[data-testid="balance-summary"]', { timeout: 30_000 });
}

async function openGroup(page, name) {
  await page.click(`[data-testid="group-${name}"]`);
  await page.waitForSelector('[data-testid="my-balance"]', { timeout: 30_000 });
}

async function openAddExpense(page) {
  await page.click('[data-testid="add-expense"]');
  await page.waitForSelector('[data-testid="amount-input"]');
  await page.type('[data-testid="description-input"]', 'Sunset cruise');
  await page.type('[data-testid="amount-input"]', '4500');
  await page.click('[data-testid="segment-PERCENT"]');
  await page.click('[data-testid="segment-SHARES"]');
}

for (const scheme of ['light', 'dark']) {
  const page = await session({ width: 1440, height: 900, scheme });
  if (scheme === 'light') await shot(page, 'desktop-welcome');
  await tryDemo(page);
  await shot(page, `desktop-dashboard-${scheme}`);
  await openGroup(page, 'Goa Trip');
  await shot(page, `desktop-group-${scheme}`);
  await openAddExpense(page);
  await shot(page, `desktop-add-expense-${scheme}`);
  await page.close();
}

{
  const page = await session({ width: 390, height: 844, scheme: 'light', scale: 2 });
  await tryDemo(page);
  await shot(page, 'mobile-dashboard');
  await openGroup(page, 'Goa Trip');
  await shot(page, 'mobile-group-expenses');
  await page.click('[data-testid="segment-balances"]');
  await page.waitForSelector('[data-testid="simplified-debts"]');
  await shot(page, 'mobile-group-balances');
  await page.click('[data-testid="segment-insights"]');
  await page.waitForSelector('[data-testid="insights"]');
  await shot(page, 'mobile-group-insights');
  await page.click('[data-testid="segment-expenses"]');
  await openAddExpense(page);
  await shot(page, 'mobile-add-expense');
  await page.close();
}

{
  const page = await session({ width: 390, height: 844, scheme: 'dark', scale: 2 });
  await tryDemo(page);
  await openGroup(page, 'Goa Trip');
  await page.click('[data-testid="segment-balances"]');
  await page.waitForSelector('[data-testid="simplified-debts"]');
  await shot(page, 'mobile-group-balances-dark');
  await page.close();
}

await browser.close();
