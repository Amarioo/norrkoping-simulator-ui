// Phase F2: evidence screenshots of a tram and a train by day and at night: from the front, from
// behind, and from above behind (the light pool on the track). The simulation is reset to the normal
// traffic and paused first, so two builds (main and F2) show the same frozen vehicles.
// Needs a dev or hook server (the __cityCamera / __cityLighting hooks) that proxies /api to the
// isolated backend copy (port 8095).
//   node scripts/rail-lights-f2/shots.mjs <base-url> <out-dir>
// The out dir must not exist yet (evidence is never overwritten).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('usage: <base-url> <out-dir>');
if (fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);
fs.mkdirSync(out, { recursive: true });

const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const M = map.meta.reference.metresPerUnit;
/** Lens front of the leading section from its centre, metres (vehicleLights.ts VEHICLE_LAMPS). */
const FRONT = { tram: 6.12 / 2 + 0.085, train: 19.5 / 2 + 0.085 };
const post = (url, data) =>
  fetch(new URL(url, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
await post('/api/simulator/settings', {
  compact: 100,
  estate: 60,
  trucks: 20,
  buses: 12,
  trams: 8,
  trains: 2,
  flights: true,
  timeScale: 3,
});
await post('/api/simulator/reset', {});
await post('/api/simulator/pause', { paused: true });
const world = await (await fetch(new URL('/api/simulator/world', base))).json();

/** Point `ahead` m forward, `side` m to the right and `up` m above a section pose (scene units). */
const from = (pose, ahead, side, up) => {
  const fx = Math.sin(pose.heading),
    fz = Math.cos(pose.heading);
  return [
    pose.pos[0] + (fx * ahead - fz * side) / M,
    pose.pos[1] + up / M,
    pose.pos[2] + (fz * ahead + fx * side) / M,
  ];
};
const views = [];
const chosen = {};
for (const kind of ['tram', 'train']) {
  const vehicle = world.vehicles.filter((v) => v.kind === kind).sort((a, b) => a.id - b.id)[0];
  const lead = vehicle.sections[0],
    last = vehicle.sections.at(-1),
    front = FRONT[kind];
  chosen[kind] = { id: vehicle.id, road: vehicle.road, lead };
  views.push(
    [`${kind}-front`, { cam: from(lead, front + 22, 5, 3), target: from(lead, front, 0, 1.5) }],
    [`${kind}-rear`, { cam: from(last, -(front + 22), 5, 3), target: from(last, -front, 0, 1.5) }],
    [`${kind}-above`, { cam: from(lead, -30, 14, 16), target: from(lead, front + 15, 0, 0) }],
  );
}

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const log = [];
let n = 0;
for (const [label, time] of [
  ['night', '21:30'],
  ['day', '12:30'],
]) {
  await page.goto(new URL(`/?date=2026-10-21&time=${time}&stadium=off`, base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await page.waitForTimeout(4000);
  for (const [name, { cam, target }] of views) {
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
    const file = `${String(++n).padStart(2, '0')}-${label}-${name}.png`;
    await page.locator('.map-panel').screenshot({ path: path.join(out, file) });
    const d = await page.evaluate(() => globalThis.__cityLighting.describe());
    log.push({
      file,
      time,
      camera: cam,
      target,
      programs: d.programs,
      beams: d.vehicleLights?.active ?? null,
      beamKinds: d.vehicleLights?.selected?.map((s) => s.kind) ?? null,
    });
  }
}
fs.writeFileSync(
  path.join(out, 'shots.json'),
  JSON.stringify({ base, vehicles: chosen, shots: log, errors }, null, 2) + '\n',
);
await browser.close();
await post('/api/simulator/pause', { paused: false });
console.log(JSON.stringify({ shots: log.length, errors }, null, 2));
