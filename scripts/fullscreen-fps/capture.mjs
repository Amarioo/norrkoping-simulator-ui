// Phase P0 evidence screenshots: window mode and fullscreen, fps counter collapsed and expanded, day
// and night, plus a phone-width check of the overlays. Needs a running dev server (hooks) with the
// backend proxied (traffic on). Writes PNGs to <outDir>; refuses to overwrite existing files, so
// re-running never replaces earlier evidence.
//
//   node scripts/fullscreen-fps/capture.mjs <outDir> [baseUrl=http://127.0.0.1:5194]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [outDir, base = 'http://127.0.0.1:5194'] = process.argv.slice(2);
if (!outDir) throw new Error('usage: capture.mjs <outDir> [baseUrl]');
fs.mkdirSync(outDir, { recursive: true });
const save = async (target, name) => {
  const file = path.join(outDir, name);
  if (fs.existsSync(file)) throw new Error(`${file} exists; evidence is never overwritten`);
  await target.screenshot({ path: file });
  console.log('wrote', file);
};
const setTime = (page, minutes) =>
  page.$eval(
    '#light-time',
    (el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    minutes,
  );
const settle = async (page, ms = 2500) => {
  await page.evaluate(() => globalThis.__cityLighting?.settle());
  await page.waitForTimeout(ms);
};
const open = async (browser, viewport) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    timezoneId: 'Europe/Stockholm',
  });
  const page = await context.newPage();
  await page.goto(new URL('?date=2026-10-21&time=12:39&stadium=off', base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.selectOption('#city-focus', 'city');
  await settle(page, 3500);
  return { context, page };
};

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
try {
  // Window mode, 1440 × 1040 (the e2e viewport).
  {
    const { context, page } = await open(browser, { width: 1440, height: 1040 });
    await save(page.locator('.map-panel'), '01-window-day-counter-off.png');
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('p');
    await settle(page);
    await save(page.locator('.map-panel'), '02-window-day-counter-collapsed.png');
    await page.locator('.fps-summary').click();
    await settle(page);
    await save(page.locator('.map-panel'), '03-window-day-counter-expanded.png');
    await setTime(page, 1290);
    await settle(page, 3500);
    await save(page.locator('.map-panel'), '04-window-night-counter-expanded.png');
    await save(page, '05-window-night-full-page.png');
    await context.close();
  }
  // Fullscreen at the user's primary display size (2560 × 1440, 100 % scaling).
  {
    const { context, page } = await open(browser, { width: 2560, height: 1440 });
    await page.locator('.fullscreen-toggle').click();
    await page.waitForFunction(() => document.fullscreenElement?.classList.contains('map-panel'));
    await settle(page, 3000);
    await save(page, '06-fullscreen-day-counter-off.png');
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('p');
    await settle(page);
    await save(page, '07-fullscreen-day-counter-collapsed.png');
    await page.locator('.fps-summary').click();
    await settle(page);
    await save(page, '08-fullscreen-day-counter-expanded.png');
    await setTime(page, 1290);
    await settle(page, 3500);
    await save(page, '09-fullscreen-night-counter-expanded.png');
    await page.selectOption('#city-focus', 'kungsgatan');
    await settle(page, 3500);
    await save(page, '10-fullscreen-night-kungsgatan.png');
    // A vehicle inspector, follow camera and labels in fullscreen (needs the backend for traffic).
    const id = await page.evaluate(() => {
      const s = document.querySelector('#vehicle-select');
      return s && s.options.length > 1 ? s.options[1].value : null;
    });
    if (id) {
      await page.evaluate((v) => {
        const s = document.querySelector('#vehicle-select');
        s.value = v;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }, id);
      await page.locator('.vehicle-inspector .secondary-button').click();
      await settle(page, 4000);
      await save(page, '11-fullscreen-night-follow-vehicle.png');
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.fullscreenElement).catch(() => {});
    await context.close();
  }
  // Phone width: the overlays must not cover each other.
  {
    const { context, page } = await open(browser, { width: 390, height: 844 });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('p');
    await settle(page);
    await save(page.locator('.map-panel'), '12-phone-day-counter-collapsed.png');
    await context.close();
  }
} finally {
  await browser.close();
}
