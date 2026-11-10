// Phase D2: evidence screenshots of fuel stations by day and at night, from viewpoints around the
// measured canopies (src/lib/data/fuel-canopies.json). No backend needed (the API is blocked).
// Needs a dev or hook server (the __cityCamera / __cityLighting hooks), e.g. phase0-dev.
//   node scripts/fuel-d2/shots.mjs <base-url> <out-dir> [only-prefix]
// The out dir must not exist yet (evidence is never overwritten).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [base, out, only] = process.argv.slice(2);
if (!base || !out) throw new Error('usage: <base-url> <out-dir> [only-prefix]');
if (fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);
fs.mkdirSync(out, { recursive: true });

const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const data = JSON.parse(fs.readFileSync('src/lib/data/fuel-canopies.json', 'utf8'));
const M = map.meta.reference.metresPerUnit;
/** Vertex centroid (scene units) and LiDAR ground (RH2000 m) of a canopy outline. */
const canopy = (id) => {
  const c = data.canopies.find((x) => x.id === id);
  // A LiDAR-measured outline (ringSweref) is converted like the map: (SWEREF − origin) / (25 · k).
  const r = map.meta.reference,
    unit = r.metresPerUnit * r.gridScaleFactor;
  const ring = c.ringSweref
    ? c.ringSweref.map(([e, n]) => [(e - r.originEasting) / unit, (r.originNorthing - n) / unit])
    : map.buildings.find((b) => b.id === id).rings[0];
  return {
    x: ring.reduce((s, p) => s + p[0], 0) / ring.length,
    z: ring.reduce((s, p) => s + p[1], 0) / ring.length,
    g: c.groundRh2000,
  };
};
/** Camera at `dist` m from the canopy, azimuth `az`° (0 = north, clockwise), `up` m above ground. */
const view = (id, az, dist, up, aimUp = 2.5) => {
  const c = canopy(id);
  const a = (az * Math.PI) / 180;
  return {
    cam: [c.x + (Math.sin(a) * dist) / M, (c.g + up) / M, c.z - (Math.cos(a) * dist) / M],
    target: [c.x, (c.g + aimUp) / M, c.z],
  };
};

// [file, time, view]
const SHOTS = [
  ['01-day-spargatan-norra.png', '12:30', view('way/194456157', 200, 55, 18)],
  ['02-day-rondellen.png', '12:30', view('way/93354349', 250, 50, 14)],
  ['03-day-boktryckargatan-close.png', '12:30', view('way/287687456', 150, 28, 4)],
  ['04-day-skarblacka.png', '12:30', view('way/287685621', 120, 45, 12)],
  ['05-night-spargatan-norra.png', '21:30', view('way/194456157', 200, 55, 18)],
  ['06-night-rondellen.png', '21:30', view('way/93354349', 250, 50, 14)],
  ['07-night-boktryckargatan-close.png', '21:30', view('way/287687456', 150, 28, 4)],
  ['08-night-skarblacka.png', '21:30', view('way/287685621', 120, 45, 12)],
  ['09-night-hagagatan-street.png', '21:30', view('way/287687455', 30, 60, 6, 3)],
  // Added 2026-11-10 (user decision): the two stations built from the LiDAR.
  ['10-day-hagebygatan.png', '12:30', view('lidar:node/1107696684', 200, 50, 14)],
  ['11-night-hagebygatan.png', '21:30', view('lidar:node/1107696684', 200, 50, 14)],
  ['12-day-lindovagen.png', '12:30', view('way/96575513', 160, 35, 10)],
  ['13-night-lindovagen.png', '21:30', view('way/96575513', 160, 35, 10)],
].filter(([f]) => !only || f.startsWith(only));

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/**', (r) => r.abort());
const log = [];
let loaded = null;
for (const [file, time, { cam, target }] of SHOTS) {
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
    { c: cam, t: target },
  );
  await page.waitForTimeout(1500);
  await page.locator('.map-panel').screenshot({ path: path.join(out, file) });
  const d = await page.evaluate(() => globalThis.__cityLighting.describe());
  log.push({
    file,
    time,
    camera: cam,
    target,
    programs: d.programs,
    fuel: d.streetLighting.rollouts?.['fuel-d2-v1'] ?? null,
  });
}
fs.writeFileSync(
  path.join(out, 'shots.json'),
  JSON.stringify({ base, shots: log, errors }, null, 2) + '\n',
);
await browser.close();
console.log(JSON.stringify({ shots: log.length, errors }, null, 2));
