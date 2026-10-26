// Phase P1 evidence: fullscreen 2560x1440 screenshots with the fps counter expanded (night, traffic on)
// in the overview, Innerstaden and Kungsgatan, plus the overview with the worker-built layers
// (terrain, roads, water, OSM buildings) hidden, to show which part carries the draw calls.
// Uncapped headless Edge, so the counter shows headroom, not the 164 Hz display rate.
// Never overwrites: the target directory must not exist.
//   node scripts/perf-p1/capture.mjs <newDir> [baseUrl=http://127.0.0.1:5280]
import fs from 'node:fs';
import path from 'node:path';
import { openApp, setCondition, setView } from './lib.mjs';

const [dir, base = 'http://127.0.0.1:5280'] = process.argv.slice(2);
if (!dir) throw new Error('usage: capture.mjs <newDir> [baseUrl]');
if (fs.existsSync(dir)) throw new Error(`${dir} exists; evidence is never overwritten`);
fs.mkdirSync(dir, { recursive: true });
const { browser, page } = await openApp({ base, traffic: true });
const save = async (name) => {
  const file = path.join(dir, name);
  if (fs.existsSync(file)) throw new Error(`${file} exists`);
  await page.screenshot({ path: file });
};
try {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('p');
  await page.waitForTimeout(800);
  await page.locator('.fps-summary').click();
  await setCondition(page, 'night');
  for (const [view, name] of [
    ['overview', '01-overview-night-counter.png'],
    ['city', '02-city-night-counter.png'],
    ['kungsgatan', '03-kungsgatan-night-counter.png'],
  ]) {
    await setView(page, view, 4000);
    await save(name);
  }
  await setView(page, 'overview', 3000);
  await page.evaluate(() => {
    for (const part of ['terrain', 'roads', 'water', 'buildings'])
      globalThis.__perfP1.setPartVisible(part, false);
  });
  await page.waitForTimeout(3000);
  await save('04-overview-night-layers-hidden.png');
  await page.evaluate(() => globalThis.__perfP1.restoreParts());
} finally {
  await browser.close();
}
