// Phase C1: evidence screenshots of the measured forest tile(s) by day and at night, from fixed
// SWEREF viewpoints. No backend needed (the API is blocked).
// Needs a DEV server (the __cityCamera / __cityLighting hooks and module import), e.g. phase0-dev.
//   node scripts/vegetation-c1/shots.mjs <base-url> <out-dir>
// The out dir must not exist yet (evidence is never overwritten).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('usage: <base-url> <out-dir>');
if (fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);
fs.mkdirSync(out, { recursive: true });

const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const r = map.meta.reference,
  unit = r.metresPerUnit * r.gridScaleFactor,
  M = r.metresPerUnit;
/** Scene x, z of a SWEREF 99 TM point. */
const scene = (e, n) => [(e - r.originEasting) / unit, (r.originNorthing - n) / unit];

// Viewpoints: camera and target as SWEREF E, N and metres above the ground at that point.
// Pilot tile: E 569250–569500, N 6492500–6492750 (views 1–5, unchanged since the pilot).
const VIEWS = [
  ['oblique-south', { cam: [569375, 6492330, 110], target: [569375, 6492625, 10] }],
  ['oblique-east', { cam: [569680, 6492600, 80], target: [569375, 6492625, 10] }],
  ['top', { cam: [569375, 6492615, 420], target: [569375, 6492625, 0] }],
  ['clearing-eye-level', { cam: [569385, 6492560, 2], target: [569330, 6492660, 12] }],
  ['tile-edge-west', { cam: [569120, 6492560, 45], target: [569300, 6492640, 8] }],
  // Rollout around the trail loop (14 tiles, E 569000–570000, N 6492000–6493250).
  ['loop-from-south', { cam: [569450, 6491650, 330], target: [569400, 6492600, 10] }],
  ['loop-from-north-east', { cam: [570150, 6493350, 260], target: [569400, 6492600, 10] }],
  ['loop-top', { cam: [569450, 6492590, 1050], target: [569450, 6492600, 0] }],
  ['loop-trail-eye-level', { cam: [569330, 6492330, 2], target: [569420, 6492420, 10] }],
];

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/**', (route) => route.abort());
const log = [];
let n = 0;
for (const [label, time] of [
  ['day', '12:30'],
  ['night', '21:30'],
]) {
  await page.goto(new URL(`/?date=2026-10-21&time=${time}&stadium=off`, base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  for (const [name, view] of VIEWS) {
    const placed = await page.evaluate(
      async ({ cam, target, M }) => {
        const { terrain } = await import('/src/lib/terrain.ts');
        globalThis.__cityLighting.settle();
        const { camera, controls } = globalThis.__cityCamera;
        const at = ([x, z, up]) => [x, terrain.groundHeight(x, z) + up / M, z];
        const c = at(cam),
          t = at(target);
        camera.position.set(...c);
        controls.target.set(...t);
        controls.update();
        return { camera: c, target: t };
      },
      {
        cam: [...scene(view.cam[0], view.cam[1]), view.cam[2]],
        target: [...scene(view.target[0], view.target[1]), view.target[2]],
        M,
      },
    );
    await page.waitForTimeout(1500);
    const file = `${String(++n).padStart(2, '0')}-${label}-${name}.png`;
    await page.locator('.map-panel').screenshot({ path: path.join(out, file) });
    const d = await page.evaluate(() => globalThis.__cityLighting.describe());
    log.push({ file, time, sweref: view, ...placed, programs: d.programs });
  }
}
fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify({ shots: log, errors }, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify({ shots: log.length, errors }, null, 2));
