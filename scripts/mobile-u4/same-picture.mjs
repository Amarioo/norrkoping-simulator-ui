// Interface U4 (memory): the same views photographed in two builds (before and after the compact
// vertex format) and compared pixel by pixel.
//   node scripts/mobile-u4/same-picture.mjs <before-url> <after-url> <api-url> <out-dir>
// Both builds must use the same backend (api-url); it is paused while the pictures are taken and
// started again afterwards. The out dir must not exist yet (evidence is never overwritten).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [before, after, api, out] = process.argv.slice(2);
if (!out) throw new Error('usage: <before-url> <after-url> <api-url> <out-dir>');
if (fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);
fs.mkdirSync(out, { recursive: true });

const post = (name, data) =>
  fetch(new URL('/api/simulator/' + name, api), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

/** [name, query, view in the "Utforska" list, optional camera eye and target in scene units]. */
const VIEWS = [
  ['day-city', '?date=2026-06-15&time=13:00&stadium=off', 'city'],
  ['day-overview', '?date=2026-06-15&time=13:00&stadium=off', 'overview'],
  ['day-airport', '?date=2026-06-15&time=13:00&stadium=off', 'airport'],
  ['day-street', '?date=2026-06-15&time=13:00&stadium=off', 'city', [-3.2, 1.2, 9.6], [-4.4, 0.4, 7.4]],
  ['day-river', '?date=2026-06-15&time=17:30&stadium=off', 'city', [-9, 2.2, 4.5], [-5, 0.2, 5.5]],
  ['night-city', '?date=2026-10-21&time=21:30&stadium=off', 'city'],
  ['night-street', '?date=2026-10-21&time=21:30&stadium=off', 'city', [-3.2, 1.2, 9.6], [-4.4, 0.4, 7.4]],
];

const browser = await chromium.launch({ channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 } });
await post('pause', { paused: true });

async function shoot(base, [name, query, view, eye, at]) {
  const page = await context.newPage();
  await page.goto(new URL('/' + query, base).href);
  await page.waitForSelector('[data-map-ready="true"]', { timeout: 180_000 });
  const labels = page.locator('.label-toggle input');
  if (await labels.isChecked()) await labels.uncheck();
  await page.selectOption('#city-focus', view);
  await page.waitForTimeout(2500);
  if (eye)
    await page.evaluate(
      ({ eye, at }) => {
        const { camera, controls } = globalThis.__cityCamera;
        camera.position.set(...eye);
        controls.target.set(...at);
        controls.update();
      },
      { eye, at },
    );
  await page.waitForTimeout(2500);
  const picture = await page.locator('.map-panel canvas').first().screenshot();
  await page.close();
  return picture;
}

const comparer = await context.newPage();
await comparer.setContent('<!doctype html><title>compare</title>');
const diff = (a, b) =>
  comparer.evaluate(
    async ({ a, b }) => {
      const load = async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
      };
      const [x, y] = await Promise.all([load(a), load(b)]);
      if (x.w !== y.w || x.h !== y.h) return { sizeMismatch: true };
      let differing = 0,
        over2 = 0,
        over8 = 0,
        maxDiff = 0;
      for (let i = 0; i < x.d.length; i += 4) {
        const d = Math.max(
          Math.abs(x.d[i] - y.d[i]),
          Math.abs(x.d[i + 1] - y.d[i + 1]),
          Math.abs(x.d[i + 2] - y.d[i + 2]),
        );
        if (d) differing++;
        if (d > 2) over2++;
        if (d > 8) over8++;
        if (d > maxDiff) maxDiff = d;
      }
      const pixels = x.w * x.h;
      return {
        width: x.w,
        height: x.h,
        maxDiff,
        differingShare: differing / pixels,
        over2Share: over2 / pixels,
        over8Share: over8 / pixels,
      };
    },
    { a: a.toString('base64'), b: b.toString('base64') },
  );

const rows = [];
try {
  for (const view of VIEWS) {
    const a = await shoot(before, view),
      a2 = await shoot(before, view),
      b = await shoot(after, view);
    fs.writeFileSync(path.join(out, view[0] + '-before.png'), a);
    fs.writeFileSync(path.join(out, view[0] + '-after.png'), b);
    // The same build photographed twice shows how much two pictures differ with no change at all.
    const row = { view: view[0], sameBuildTwice: await diff(a, a2), beforeAfter: await diff(a, b) };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  await post('pause', { paused: false });
}
fs.writeFileSync(
  path.join(out, 'diff.json'),
  JSON.stringify(
    {
      note: 'Channel differences 0–255 between screenshots of the map canvas, 1440 × 1040 window, Edge, simulation paused. Shares are parts of all pixels: differing = any difference, over2 = more than 2/255, over8 = more than 8/255.',
      before,
      after,
      rows,
    },
    null,
    2,
  ) + '\n',
);
await browser.close();
