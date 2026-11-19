// Air routes: evidence screenshots of the aircraft types and of a flight on a named route.
// Needs a dev (hook) server with API_TARGET to a backend that flies routes and types (e.g. air-dev +
// air-backend in .claude/launch.json).
//   node scripts/air-routes/shots.mjs <base-url> <out-dir> [api-url]
// With an api-url the script asks the backend directly instead of through the dev server's proxy, which
// has crashed under the polling on this machine.
// The out dir must not exist yet (evidence is never overwritten). The city is reset until its six aircraft
// are of all four types (the types are drawn at random); it is left running with three aircraft.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [base, out, api = base] = process.argv.slice(2);
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
  fetch(new URL('/api/simulator/' + name, api), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => r.json());
const world = () => fetch(new URL('/api/simulator/world', api)).then((r) => r.json());

await post('settings', { ...SETTINGS, planes: 6, timeScale: 10 });
let w,
  resets = 0;
do {
  await post('reset', {});
  await post('pause', { paused: true });
  w = await world();
  resets++;
} while (new Set(w.aircraft.map((a) => a.type)).size < 4 && resets < 200);
const report = {
  base,
  resets,
  fleet: w.aircraft.map((a) => a.id + ' ' + a.type),
  shots: [],
  errors: [],
};

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => report.errors.push(e.message));
const open = async (query) => {
  await page.goto(new URL('/' + query, base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.waitForTimeout(1200);
};
/** Camera beside an aircraft: `side` units to its left, `ahead` in front, `up` above (scene units). */
const beside = async (a, side, ahead, up) => {
  // Heading is atan2(x, z) of the direction of travel; the aircraft's left is (cos h, -sin h) in (x, z).
  const f = [Math.sin(a.heading), Math.cos(a.heading)];
  const l = [Math.cos(a.heading), -Math.sin(a.heading)];
  const eye = [
    a.pos[0] + f[0] * ahead + l[0] * side,
    a.pos[1] + up,
    a.pos[2] + f[1] * ahead + l[1] * side,
  ];
  await page.evaluate(
    ({ eye, at }) => {
      const { camera, controls } = globalThis.__cityCamera;
      camera.position.set(...eye);
      controls.target.set(...at);
      controls.update();
    },
    { eye, at: [a.pos[0], a.pos[1] + 0.12, a.pos[2]] },
  );
  await page.waitForTimeout(800);
};
const shoot = async (name, note, whole = false) => {
  await (whole ? page : page.locator('.map-panel')).screenshot({
    path: path.join(out, name + '.png'),
  });
  report.shots.push({ name, note });
};

await open('?date=2026-06-15&time=13:00&stadium=off');
// 1–4: each type standing in its queue, from the front left.
const seen = new Set();
let n = 1;
for (const a of w.aircraft) {
  if (seen.has(a.type)) continue;
  seen.add(a.type);
  await beside(a, 1.7, 2.3, 0.9);
  await shoot(`0${n++}-type-${a.type}`, `${a.id}, ${a.type}, in the queue at ${a.origin}`);
}
// 5: one of the jets from above, with its neighbours in the queue.
const jet = w.aircraft.find((a) => a.type !== 'TP');
await beside(jet, 0.01, -1.6, 9);
await shoot('05-queue-from-above', `the queue around ${jet.id} (${jet.type}) at ${jet.origin}`);

// 6: the whole page while following an aircraft that cruises on a route other than the direct one.
await page.getByRole('tab', { name: 'Flyg' }).click();
await post('pause', { paused: false });
const started = Date.now();
let flying;
for (;;) {
  w = await world();
  flying = w.aircraft.find(
    (a) => a.phase === 'CRUISE' && a.route !== 'över staden' && a.type !== 'TP',
  );
  if (flying) break;
  if (Date.now() - started > 600000)
    throw new Error('no jet cruised on a northern or southern route');
  await new Promise((r) => setTimeout(r, 100));
}
await page.getByRole('button', { name: new RegExp(flying.id) }).click();
await page.getByRole('button', { name: 'Följ flygplanet' }).click();
await page.waitForTimeout(3000);
await post('pause', { paused: true });
await page.waitForTimeout(1500);
w = await world();
flying = w.aircraft.find((a) => a.id === flying.id);
await shoot(
  '06-following-a-jet-on-a-route',
  `${flying.id}, ${flying.type}, ${flying.phase}, from ${flying.origin} ${flying.route}, at ${flying.pos.map((v) => v.toFixed(1))}`,
  true,
);
report.card = {
  code: await page.locator('.flight-code').innerText(),
  type: await page.locator('.flight-type').innerText(),
  status: await page.locator('.map-status').innerText(),
  rows: await page.locator('.flight-row').allInnerTexts(),
};

// 7: night, a jet on the loop with its lights.
await post('pause', { paused: false });
await open('?date=2026-10-21&time=21:30&stadium=off');
const t0 = Date.now();
let parked;
for (;;) {
  w = await world();
  parked = w.aircraft.find((a) => ['PARKED', 'QUEUE'].includes(a.phase) && a.type !== 'TP');
  if (parked) break;
  if (Date.now() - t0 > 600000) throw new Error('no jet waited on a loop');
  await new Promise((r) => setTimeout(r, 100));
}
await post('pause', { paused: true });
await page.waitForTimeout(1500);
parked = (await world()).aircraft.find((a) => a.id === parked.id);
await beside(parked, 1.5, 2.6, 0.7);
await shoot(
  '07-night-jet-lights',
  `${parked.id}, ${parked.type}, ${parked.phase} at ${parked.origin}`,
);
const lights = await page.evaluate(() => globalThis.__cityLighting.aircraftLights());
report.night = {
  aircraft: lights.aircraft,
  instances: lights.instances,
  types: lights.poses.map((p) => p.id + ' ' + p.type),
};

await post('settings', { ...SETTINGS, planes: 3, timeScale: 3 });
await post('pause', { paused: false });
fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
console.log(
  JSON.stringify({
    fleet: report.fleet,
    card: report.card,
    night: report.night,
    errors: report.errors,
  }),
);
if (report.errors.length) process.exit(1);
