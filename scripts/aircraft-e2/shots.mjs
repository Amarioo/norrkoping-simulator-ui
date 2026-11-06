// Aircraft Lights Phase E2: evidence screenshots of the aircraft lights at night on approach to
// Norrköping-Kungsängen, seen from fixed viewpoints in the aircraft's own frame (front, behind, left,
// right, from the runway), plus the colour measured at each projected position light.
// Needs a dev (hook) server with API_TARGET to a backend (e.g. phase0-e2e + phase0-backend).
//   node scripts/aircraft-e2/shots.mjs <base-url> <out-dir>
// The out dir must not exist yet (evidence is never overwritten). The simulation runs at time scale
// 20 until the aircraft is on approach to Kungsängen, is paused there, and is set back to time scale 3,
// running, at the end.
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

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await post('pause', { paused: false });
await post('settings', { ...SETTINGS, timeScale: 20 });
await page.goto(new URL('/?date=2026-10-21&time=21:30&stadium=off', base).href);
await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
await page.locator('.label-toggle input').uncheck();

const lights = () => page.evaluate(() => globalThis.__cityLighting.aircraftLights());
// Wait for the approach to Kungsängen (east of the city, x > 100 scene units), part-way down.
const started = Date.now();
for (;;) {
  const d = await lights();
  const p = d.poses[0];
  if (p && p.phase === 'APPROACH' && p.matrix[12] > 60 && p.matrix[12] < 150) break;
  if (Date.now() - started > 600000) throw new Error('no approach to Kungsängen within 10 min');
  await page.waitForTimeout(100);
}
await post('pause', { paused: true });
await page.waitForTimeout(1500);
// Not frozen in the middle of a strobe flash (it would cover the position lights' colours).
const strobeLit = async () =>
  (await lights()).lights.some((l) => l.group === 'strobe' && l.weight > 0);
for (let i = 0; i < 20 && (await strobeLit()); i++) {
  await post('pause', { paused: false });
  await page.waitForTimeout(150);
  await post('pause', { paused: true });
  await page.waitForTimeout(1500);
}

const frames = () =>
  page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
/** Camera at a point of the aircraft's model frame (metres), looking at another; world up. */
const view = (eye, at) =>
  page.evaluate(
    ({ eye, at }) => {
      const g = globalThis;
      const m = g.__cityLighting.aircraftLights().poses[0].matrix;
      const tf = ([x, y, z]) => [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ];
      const { camera, controls } = g.__cityCamera;
      camera.position.set(...tf(eye));
      controls.target.set(...tf(at));
      controls.update();
    },
    { eye, at },
  );
/** Screen positions of this frame's lights in map-panel screenshot pixels, and their colours. */
const projected = () =>
  page.evaluate(() => {
    const g = globalThis;
    const { camera } = g.__cityCamera;
    const canvas = document.querySelector('.map-panel canvas').getBoundingClientRect();
    const panel = document.querySelector('.map-panel').getBoundingClientRect();
    return g.__cityLighting.aircraftLights().lights.map((l) => {
      const v = camera.position
        .clone()
        .set(...l.world)
        .project(camera);
      return {
        kind: l.kind,
        weight: l.weight,
        rgb: l.rgb,
        x: canvas.left - panel.left + ((v.x + 1) / 2) * canvas.width,
        y: canvas.top - panel.top + ((1 - v.y) / 2) * canvas.height,
        inView: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1,
      };
    });
  });
/** Mean sRGB colour of a (2·half)² square of a PNG, decoded in the page. */
const sample = (png, x, y, half = 3) =>
  page.evaluate(
    async ({ b64, x, y, half }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(Math.round(x - half), Math.round(y - half), 2 * half, 2 * half).data;
      const s = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += d[i + k];
      return s.map((v) => Math.round(v / (d.length / 4)));
    },
    { b64: png.toString('base64'), x, y, half },
  );

// Viewpoints in the aircraft frame (+x left, +y up, +z forward; metres): eye, target.
const VIEWS = [
  ['01-night-front', [0, 4, 42], [0, 2.5, 0]],
  ['02-night-behind', [0, 6, -42], [0, 2.5, 0]],
  ['03-night-left-side', [42, 4, 3], [0, 2.5, 0]],
  ['04-night-right-side', [-42, 4, 3], [0, 2.5, 0]],
  ['05-night-front-left-quarter', [30, 3, 30], [0, 2.5, 0]],
  ['06-night-chase-wide-towards-kungsangen', [8, 25, -260], [0, -20, 400]],
  // (The free camera cannot look upwards, so the head-on view is from slightly above the path.)
  ['07-night-head-on-120m-ahead-landing-lights', [0, 8, 120], [0, 2.5, 0]],
];
const report = { base, date: '2026-10-21', time: '21:30', views: [], errors };
report.aircraft = (await lights()).poses[0];
for (const [name, eye, at] of VIEWS) {
  await view(eye, at);
  await frames();
  await page.waitForTimeout(600);
  await frames();
  const png = await page.locator('.map-panel').screenshot();
  fs.writeFileSync(path.join(out, name + '.png'), png);
  const points = await projected();
  for (const p of points)
    if (p.inView && ['navLeft', 'navRight', 'navTail'].includes(p.kind))
      p.pixel = await sample(png, p.x, p.y);
  report.views.push({ name, eye, at, points });
}
// The same front view by day (anti-collision lights flash by day; steady glows only at night).
await page.$eval('#light-time', (el) => {
  el.value = '759';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(1600);
await view([30, 3, 30], [0, 2.5, 0]);
await frames();
await page.waitForTimeout(600);
fs.writeFileSync(
  path.join(out, '08-day-front-left-quarter.png'),
  await page.locator('.map-panel').screenshot(),
);
report.day = await lights();

await post('settings', { ...SETTINGS, timeScale: 3 });
await post('pause', { paused: false });
fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(report, null, 1));
await browser.close();
console.log(
  JSON.stringify(
    report.views.map((v) => ({
      view: v.name,
      nav: v.points.filter((p) => p.pixel).map((p) => [p.kind, p.pixel, +p.weight.toFixed(2)]),
    })),
    null,
    0,
  ),
);
if (errors.length) console.log('page errors', errors);
