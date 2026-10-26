// Phase P0: are the 3D pictures unchanged with the counter off? Screenshots of the map panel with the
// map toolbar hidden (it holds the two new buttons), API aborted, fixed date/time, labels on, at a few
// views by day and night. Run once against main's dev server and once against this branch's, then
// compare the two folders (compare mode) byte for byte.
//
//   node scripts/fullscreen-fps/scene-pixels.mjs capture <outDir> <baseUrl>
//   node scripts/fullscreen-fps/scene-pixels.mjs compare <dirA> <dirB>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [mode, a, b] = process.argv.slice(2);
const VIEWS = ['city', 'kungsgatan', 'stromparken', 'police'];
if (mode === 'capture') {
  fs.mkdirSync(a, { recursive: true });
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1040 },
      deviceScaleFactor: 1,
    });
    await page.route('**/api/**', (r) => r.abort());
    await page.goto(new URL('?date=2026-10-21&time=12:39&stadium=off', b).href);
    await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
    await page.addStyleTag({
      content: '.explorer-toolbar,.connection-banner{display:none!important}',
    });
    await page.waitForTimeout(3000);
    for (const [cond, minutes] of [
      ['day', 759],
      ['night', 1290],
    ]) {
      await page.$eval(
        '#light-time',
        (el, v) => {
          el.value = String(v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        },
        minutes,
      );
      for (const view of VIEWS) {
        await page.$eval(
          '#city-focus',
          (el, v) => {
            el.value = v;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          },
          view,
        );
        await page.evaluate(() => globalThis.__cityLighting?.settle());
        await page.waitForTimeout(3500);
        await page.locator('.map-panel').screenshot({ path: path.join(a, `${cond}-${view}.png`) });
      }
    }
  } finally {
    await browser.close();
  }
} else if (mode === 'compare') {
  let same = 0;
  for (const f of fs.readdirSync(a).filter((x) => x.endsWith('.png'))) {
    const eq = fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)));
    if (eq) same++;
    console.log(f, eq ? 'identical' : 'DIFFERENT');
  }
  console.log(`${same} identical`);
} else throw new Error('mode: capture | compare');
