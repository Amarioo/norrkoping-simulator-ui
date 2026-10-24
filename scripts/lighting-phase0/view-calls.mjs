// Draw calls / triangles of the performance views (scripts/lighting-phase0/measure.mjs) per
// condition, from a DEV server (__cityPerformance). Explains frame-interval differences.
//
//   node scripts/lighting-phase0/view-calls.mjs <baseUrl> <out.json>
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const result = {};
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(new URL('?date=2026-10-21&time=12:39&stadium=off', base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.waitForTimeout(3500);
  for (const [condition, minutes, mode] of [
    ['day', 759, 'off'],
    ['night-off', 1290, 'off'],
    ['night-match', 1290, 'event'],
  ]) {
    await page.$eval(
      '#light-time',
      (el, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      minutes,
    );
    await page.selectOption('#stadium-lights', mode);
    await page.waitForTimeout(1600);
    for (const view of process.env.VIEWS?.split(',') ??
      ['kungsgatan', 'stromparken', 'idrottsparkenPitch', 'parken', 'city']) {
      await page.selectOption('#city-focus', view);
      await page.waitForTimeout(3000);
      const p = await page.evaluate(() => globalThis.__cityPerformance);
      result[`${condition}/${view}`] = { calls: p.calls, triangles: p.triangles };
    }
  }
} finally {
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  await browser.close();
}
