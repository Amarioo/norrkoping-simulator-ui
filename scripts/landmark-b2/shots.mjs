// Landmark Phase B2: evidence screenshots of Hedvigs kyrka by day and at night (estimated floodlights)
// from fixed viewpoints in the church's building frame, plus the reference photograph's viewpoint.
// No backend needed (the API is blocked). Needs a dev (hook) server, e.g. phase0-dev.
//   node scripts/landmark-b2/shots.mjs <base-url> <out-dir>
// The out dir must not exist yet (evidence is never overwritten).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('usage: <base-url> <out-dir>');
if (fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);
fs.mkdirSync(out, { recursive: true });

const lidar = JSON.parse(fs.readFileSync('docs/landmark-b2/data/hedvig-lidar.json', 'utf8'));
const [ox, oz] = lidar.frame.originScene,
  [ux, uz] = lidar.frame.axisScene;
const M = 25;
/** Building frame (u, v metres; h RH2000 m) → scene. */
const scene = (u, v, h) => [ox + (u * ux + v * uz) / M, h / M, oz + (u * uz - v * ux) / M];

// [file, time, camera, target] in the building frame.
const SHOTS = [
  ['01-day-west-front.png', '12:39', [-48, -34, 14], [4, 0, 17]],
  ['02-day-south-east.png', '12:39', [60, -45, 40], [15, 0, 14]],
  ['03-day-tower.png', '12:39', [-30, -26, 12], [-1, -1, 24]],
  ['04-night-west-front.png', '21:30', [-48, -34, 14], [4, 0, 17]],
  ['05-night-west-close.png', '21:30', [-40, -12, 9], [0, 0, 15]],
  ['06-night-east-end.png', '21:30', [52, -14, 9], [33, 0, 12]],
  ['07-night-south-west-wide.png', '21:30', [-38, -42, 22], [8, 0, 15]],
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
    await page.goto(new URL(`/?date=2026-10-21&time=${time}&stadium=off`, base).href);
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
    { frame: 'building frame (u, v, h RH2000), see spec.ts', shots: log, errors },
    null,
    1,
  ) + '\n',
);
await browser.close();
if (errors.length) {
  console.error(errors);
  process.exitCode = 1;
}
