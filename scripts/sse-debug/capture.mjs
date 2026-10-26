// SSE debug panel evidence screenshots with live backend traffic. Needs a running dev server with the
// backend proxied. Writes JPEGs to <outDir>; refuses to overwrite existing files, so re-running never
// replaces earlier evidence.
//
//   node scripts/sse-debug/capture.mjs <outDir> [baseUrl=http://127.0.0.1:5281]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [outDir, base = 'http://127.0.0.1:5281'] = process.argv.slice(2);
if (!outDir) throw new Error('usage: capture.mjs <outDir> [baseUrl]');
fs.mkdirSync(outDir, { recursive: true });
const save = async (page, name) => {
  const file = path.join(outDir, name);
  if (fs.existsSync(file)) throw new Error(`${file} exists; evidence is never overwritten`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
  console.log('wrote', file);
};
const open = async (browser, query) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1040 },
    deviceScaleFactor: 1,
    timezoneId: 'Europe/Stockholm',
  });
  const page = await context.newPage();
  await page.goto(new URL(`?date=2026-10-21&time=12:39&stadium=off${query}`, base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.selectOption('#city-focus', 'city');
  return { context, page };
};

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
try {
  {
    const { context, page } = await open(browser, '&sse-debug');
    // Fps counter on as well (P), to show both together.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('p');
    await page.waitForTimeout(6000);
    await save(page, '01-panel-live-city-stream.jpg');
    await page.locator('.sse-debug .entry[data-event="city"] .row').first().click();
    await page.waitForTimeout(600);
    await save(page, '02-entry-expanded-json.jpg');
    await context.close();
  }
  {
    const { context, page } = await open(browser, '&sse-debug=raw');
    await page.waitForTimeout(6000);
    await save(page, '03-raw-readers-all-streams.jpg');
    await page.getByRole('searchbox', { name: 'Sök i SSE-loggen' }).fill('"drones"');
    await page.getByLabel('Dölj anslutningshändelser').check();
    await page.waitForTimeout(800);
    await save(page, '04-search-filter.jpg');
    await context.close();
  }
} finally {
  await browser.close();
}
