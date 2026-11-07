// Landmark Phase B1 part 2: evidence screenshots of Rådhuset's floodlit tower at night (and one by day)
// from fixed viewpoints in Rådhuset's building frame, the first one from the north bank of Motala
// ström like the 2017 night photograph. (Copied from scripts/landmark-b2/shots.mjs.)
// No backend needed (the API is blocked). Needs a dev (hook) server, e.g. phase0-dev.
//   node scripts/landmark-b1-2/shots.mjs <base-url> <out-dir>
// The out dir must not exist yet (evidence is never overwritten).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('usage: <base-url> <out-dir>');
if (fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);
fs.mkdirSync(out, { recursive: true });

const lidar = JSON.parse(fs.readFileSync('docs/landmark-b1/data/radhuset-lidar.json', 'utf8'));
const [ox, oz] = lidar.frame.originScene,
  [ux, uz] = lidar.frame.axisScene;
const M = 25;
/** Building frame (u, v metres; h RH2000 m) → scene. */
const scene = (u, v, h) => [ox + (u * ux + v * uz) / M, h / M, oz + (u * uz - v * ux) / M];

// [file, time, camera, target] in the building frame.
const SHOTS = [
  ['01-night-from-north-bank.png', '20:18', [-60, 200, 10], [0, 0, 45]],
  ['02-night-tyska-torget.png', '20:18', [-25, 95, 22], [0, -10, 36]],
  ['03-night-tower.png', '20:18', [-40, 110, 30], [0, 0, 52]],
  ['04-night-with-hedvigs-kyrka.png', '20:18', [-70, 140, 45], [20, 20, 25]],
  ['05-day-tower.png', '12:00', [-40, 110, 30], [0, 0, 52]],
];

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/**', (r) => r.abort());
const log = [];
let loaded = null;
for (const [file, time, cam, target] of SHOTS) {
  if (loaded !== time) {
    await page.goto(new URL(`/?date=2026-11-30&time=${time}&stadium=off`, base).href);
    await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
    await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
    await page.locator('.label-toggle input').uncheck();
    loaded = time;
  }
  await page.evaluate(
    ({ c, t }) => {
      globalThis.__cityLighting.settle();
      const { camera, controls } = globalThis.__cityCamera;
      camera.position.set(...c);
      controls.target.set(...t);
      controls.update();
    },
    { c: scene(...cam), t: scene(...target) },
  );
  await page.waitForTimeout(1500);
  await page.locator('.map-panel').screenshot({ path: path.join(out, file) });
  const d = await page.evaluate(() => globalThis.__cityLighting.describe());
  log.push({
    file,
    time,
    camera: cam,
    target,
    facadeLights: d.facadeLights.active,
    programs: d.programs,
  });
  console.log(file, d.facadeLights.active, d.programs);
}
fs.writeFileSync(
  path.join(out, 'shots.json'),
  JSON.stringify(
    {
      frame: "Rådhuset's building frame (u, v, h RH2000), see src/lib/landmarks/radhuset/spec.ts",
      shots: log,
      errors,
    },
    null,
    1,
  ) + '\n',
);
await browser.close();
if (errors.length) {
  console.error(errors);
  process.exitCode = 1;
}
