// Air traffic: what more aircraft cost to draw. For 0, 1, 3 and 6 aircraft, standing in the queues at
// the start of a paused simulation, with the camera on Kungsängen's loop (half the fleet in view): draw
// calls, triangles and frame time, in three interleaved rounds.
// Needs a dev (hook) server with API_TARGET to a backend that flies the fleet.
//   node scripts/air-traffic/frames.mjs <base-url> <out.json>
// The out file must not exist yet. The numbers are from a development build and compare the fleet sizes
// with each other on this machine; they are not the frame rate of the published site.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('usage: <base-url> <out.json>');
if (fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);

const SETTINGS = { compact: 100, estate: 60, trucks: 20, buses: 12, trams: 8, trains: 2, timeScale: 3 };
const post = (name, data) =>
  fetch(new URL('/api/simulator/' + name, base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => r.json());
const world = () => fetch(new URL('/api/simulator/world', base)).then((r) => r.json());

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await post('settings', { ...SETTINGS, flights: true, planes: 6 });
await post('reset', {});
await post('pause', { paused: true });
await page.goto(new URL('/?date=2026-06-15&time=13:00&stadium=off', base).href);
await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
await page.evaluate(() => {
  const { camera, controls } = globalThis.__cityCamera;
  camera.position.set(103, 7.5, 21.5);
  controls.target.set(101.5, 0.1, 11.5);
  controls.update();
});
const renderer = await page.evaluate(() => {
  const gl = globalThis.__cityLighting.renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
});

const measure = (frames) =>
  page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        const ms = [];
        let calls = 0,
          triangles = 0;
        const tick = () => {
          const p = globalThis.__cityPerformance;
          ms.push(p.frameMs);
          calls = Math.max(calls, p.calls);
          triangles = Math.max(triangles, p.triangles);
          if (ms.length < frames) requestAnimationFrame(tick);
          else {
            ms.sort((a, b) => a - b);
            resolve({
              medianMs: +ms[Math.floor(ms.length / 2)].toFixed(2),
              p95Ms: +ms[Math.floor(ms.length * 0.95)].toFixed(2),
              calls,
              triangles,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    frames,
  );

const runs = [];
for (let round = 1; round <= 3; round++)
  for (const planes of [0, 1, 3, 6]) {
    await post('settings', { ...SETTINGS, flights: planes > 0, planes: planes || 1 });
    await post('reset', {});
    await post('pause', { paused: true });
    const w = await world();
    if (w.aircraft.length !== planes) throw new Error(`asked for ${planes}, got ${w.aircraft.length}`);
    await page.waitForTimeout(1500);
    const drawn = await page.evaluate(() => globalThis.__cityLighting.aircraftLights().aircraft);
    runs.push({ round, planes, drawn, ...(await measure(400)) });
  }
await post('settings', { ...SETTINGS, flights: true, planes: 3 });
await post('pause', { paused: false });
await browser.close();

const summary = [0, 1, 3, 6].map((planes) => {
  const of = runs.filter((r) => r.planes === planes);
  const mid = (key) => of.map((r) => r[key]).sort((a, b) => a - b)[1];
  return {
    planes,
    calls: mid('calls'),
    triangles: mid('triangles'),
    medianMs: mid('medianMs'),
    p95Ms: mid('p95Ms'),
  };
});
const report = { base, build: 'development server', viewport: [1500, 1000], renderer, summary, runs, errors };
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ renderer, summary, errors }, null, 1));
if (errors.length) process.exit(1);
