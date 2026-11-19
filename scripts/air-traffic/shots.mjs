// Air traffic: evidence screenshots of six aircraft sharing the two runways: the queue on the taxiway
// loop at each threshold, a take-off past the queue, the Flyg tab's list, and the queue at night.
// Needs a dev (hook) server with API_TARGET to a backend that flies the fleet (e.g. air-dev + air-backend
// in .claude/launch.json).
//   node scripts/air-traffic/shots.mjs <base-url> <out-dir>
// The out dir must not exist yet (evidence is never overwritten). The simulation runs at time scale 10
// between the shots, is paused for each, and is left running at time scale 3 with three aircraft.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('usage: <base-url> <out-dir>');
if (fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);
fs.mkdirSync(out, { recursive: true });

const SETTINGS = {
  compact: 100,
  estate: 60,
  trucks: 20,
  buses: 12,
  trams: 8,
  trains: 2,
  flights: true,
};
const post = (name, data) =>
  fetch(new URL('/api/simulator/' + name, base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => r.json());
const world = () => fetch(new URL('/api/simulator/world', base)).then((r) => r.json());

const ESSP = 'Norrköpings flygplats',
  F13 = 'Bråvalla F13';
/** Aircraft on the ground at an airport, by phase. */
const onGround = (w, airport) => {
  const at = { PARKED: 0, QUEUE: 0, TAXI_OUT: 0, TAKEOFF: 0, TAXI_IN: 0, LANDING: 0 };
  for (const a of w.aircraft) {
    const here = ['TAXI_IN', 'LANDING'].includes(a.phase) ? a.destination : a.origin;
    if (here === airport && a.phase in at) at[a.phase]++;
  }
  return at;
};

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Paused at the very start: three aircraft stand in each queue, and the first shots are of them.
await post('settings', { ...SETTINGS, planes: 6, timeScale: 10 });
await post('reset', {});
await post('pause', { paused: true });

const open = async (query) => {
  await page.goto(new URL('/' + query, base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
};
const frames = () =>
  page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
/** Camera at a scene point, looking at another (scene units, y up). */
const view = (eye, at) =>
  page.evaluate(
    ({ eye, at }) => {
      const { camera, controls } = globalThis.__cityCamera;
      camera.position.set(...eye);
      controls.target.set(...at);
      controls.update();
    },
    { eye, at },
  );
/** Runs the simulation until `when(world)` holds, then pauses it there. */
const until = async (label, when, limitMs = 900000) => {
  await post('pause', { paused: false });
  const started = Date.now();
  for (;;) {
    const w = await world();
    if (when(w)) break;
    if (Date.now() - started > limitMs) throw new Error('never reached: ' + label);
    await new Promise((r) => setTimeout(r, 80));
  }
  await post('pause', { paused: true });
  await page.waitForTimeout(1500);
  return world();
};
const report = { base, shots: [], errors };
const shoot = async (name, eye, at, w, whole = false) => {
  if (eye) await view(eye, at);
  await frames();
  await page.waitForTimeout(700);
  await frames();
  const target = whole ? page : page.locator('.map-panel');
  await target.screenshot({ path: path.join(out, name + '.png') });
  report.shots.push({
    name,
    eye,
    at,
    simulationTime: w.simulationTime,
    completedFlights: w.completedFlights,
    aircraft: w.aircraft.map((a) => ({
      id: a.id,
      phase: a.phase,
      origin: a.origin,
      destination: a.destination,
      pos: a.pos.map((v) => +v.toFixed(2)),
    })),
  });
};

// Scene coordinates (X east, Y up, Z south; 1 unit = 25 m). Kungsängen's loop lies north of the
// threshold of runway 09 at about (103, 14.6); Bråvalla's south-west of its threshold at (-227, -70).
const KUNGSANGEN = {
  loop: [
    [103, 7.5, 21.5],
    [101.5, 0.1, 11.5],
  ],
  wide: [
    [92, 9, 27],
    [112, 0.1, 13],
  ],
};
const BRAVALLA = {
  loop: [
    [-217, 8, -55],
    [-226, 1.1, -65],
  ],
};
const NIGHT = [
  [102.5, 3.2, 17.5],
  [100.5, 0.2, 11],
];

await open('?date=2026-06-15&time=13:00&stadium=off');
await page.locator('.label-toggle input').uncheck();

// 1. Kungsängen at the start: the first aircraft lines up, two wait behind the hold line.
let w = await until('the first line-up at Kungsängen', (w) => {
  const g = onGround(w, ESSP);
  const first = w.aircraft.find((a) => a.phase === 'TAXI_OUT' && a.origin === ESSP);
  return g.PARKED + g.QUEUE >= 2 && first && first.pos[0] > 100.5;
});
await shoot('01-kungsangen-start-queue-and-line-up', ...KUNGSANGEN.loop, w);
// 2. The same queue as the departure rolls past.
w = await until('the first take-off at Kungsängen', (w) => {
  const g = onGround(w, ESSP);
  const rolling = w.aircraft.find((a) => a.phase === 'TAKEOFF' && a.origin === ESSP);
  return g.PARKED + g.QUEUE >= 2 && rolling && rolling.pos[0] > 107 && rolling.pos[0] < 114;
});
await shoot('02-kungsangen-take-off-past-the-queue', ...KUNGSANGEN.wide, w);
// 3. Bråvalla at the start: its queue on the loop.
w = await until('the queue at Bråvalla', (w) => {
  const g = onGround(w, F13);
  return g.PARKED + g.QUEUE >= 2 && g.TAXI_OUT + g.TAKEOFF === 1;
});
await shoot('03-bravalla-start-queue-on-the-loop', ...BRAVALLA.loop, w);
// 4. Steady traffic (after the first flights have landed): an arrival comes round the loop at
// Kungsängen while another aircraft waits at the hold line.
w = await until('steady traffic at Kungsängen', (w) => {
  const g = onGround(w, ESSP);
  const back = w.aircraft.find((a) => a.phase === 'TAXI_IN' && a.destination === ESSP);
  return w.completedFlights >= 8 && g.PARKED + g.QUEUE >= 1 && back && back.pos[2] < 11;
});
await shoot('04-kungsangen-steady-arrival-on-the-loop', ...KUNGSANGEN.loop, w);
// 5. The whole page with the Flyg tab: the list of aircraft and their phases.
await page.getByRole('tab', { name: 'Flyg' }).click();
await page.getByRole('button', { name: /NK-04/ }).click();
await page.getByRole('button', { name: /Följ flygplanet/ }).click();
await post('pause', { paused: false });
await page.waitForTimeout(2500);
await post('pause', { paused: true });
await page.waitForTimeout(1500);
w = await world();
await shoot('05-flyg-tab-list-following-nk-04', null, null, w, true);
report.followStatus = await page.locator('.map-status').innerText();
report.list = await page.locator('.flight-row').allInnerTexts();

// 6. Night: the queue at Kungsängen with every aircraft's own lights.
await post('pause', { paused: false });
await open('?date=2026-10-21&time=21:30&stadium=off');
await page.locator('.label-toggle input').uncheck();
w = await until('traffic at Kungsängen at night', (w) => {
  const g = onGround(w, ESSP);
  const back = w.aircraft.find((a) => a.phase === 'TAXI_IN' && a.destination === ESSP);
  return g.PARKED + g.QUEUE >= 1 && back && back.pos[2] < 11;
});
await shoot('06-night-kungsangen-lights-on-the-loop', ...NIGHT, w);
const lights = await page.evaluate(() => globalThis.__cityLighting.aircraftLights());
report.night = {
  aircraftDrawnWithLights: lights.aircraft,
  capacity: lights.capacity,
  instances: lights.instances,
  ids: lights.poses.map((p) => p.id + ' ' + p.phase),
};

await post('settings', { ...SETTINGS, planes: 3, timeScale: 3 });
await post('pause', { paused: false });
fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
console.log(
  JSON.stringify({
    shots: report.shots.length,
    errors,
    night: report.night,
    follow: report.followStatus,
  }),
);
if (errors.length) process.exit(1);
