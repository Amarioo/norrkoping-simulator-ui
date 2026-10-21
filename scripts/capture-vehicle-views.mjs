// Captures fixed cameras with a rail vehicle in view (Batch A evidence: trains/trams on their tracks).
// For each pose it waits until the backend reports a vehicle of the wanted kind with a section within
// `radius` scene units of `near`, pauses the simulation, screenshots the map panel and resumes.
// Usage: E2E_BASE_URL=http://127.0.0.1:5179/ API=http://127.0.0.1:8091 POSES=poses.json \
//          node scripts/capture-vehicle-views.mjs <outDir>
// poses.json: { name: { position: [x,y,z], target: [x,y,z], kind: 'train'|'tram', near: [x,z], radius } }
// Needs a dev server (FreeCamera.svelte exposes __cityCamera in dev) and a backend without Origin checks
// for CLI requests (CommandGuard allows requests without an Origin header).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const out = process.argv[2] ?? 'test-results/vehicle-views';
const api = process.env.API ?? 'http://127.0.0.1:8091';
const poses = JSON.parse(fs.readFileSync(process.env.POSES, 'utf8'));
const only = process.env.VIEWS?.split(',');
fs.mkdirSync(out, { recursive: true });
const post = (path, body) =>
  fetch(api + '/api/simulator/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const world = async () => (await fetch(api + '/api/simulator/world')).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await post('pause', { paused: false });
await post('settings', { compact: 40, estate: 20, trucks: 5, buses: 6, trams: 24, trains: 12, flights: false, timeScale: 6 });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const found = {};
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:5179/', { timeout: 120000 });
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 240000 });
  await page.waitForTimeout(3000);
  for (const [name, pose] of Object.entries(poses)) {
    if (only && !only.includes(name)) continue;
    await page.evaluate((pose) => {
      const { camera, controls } = globalThis.__cityCamera;
      camera.position.fromArray(pose.position);
      controls.target.fromArray(pose.target);
      controls.update();
    }, pose);
    let hit = null;
    const until = Date.now() + (pose.timeout ?? 240000);
    while (pose.kind && Date.now() < until) {
      const w = await world();
      hit = w.vehicles.find(
        (v) =>
          v.kind === pose.kind &&
          (v.sections?.length ? v.sections : [v]).some((s) => Math.hypot(s.pos[0] - pose.near[0], s.pos[2] - pose.near[1]) < pose.radius),
      );
      if (hit) break;
      await sleep(250);
    }
    await post('pause', { paused: true });
    await page.waitForTimeout(2500);
    await page.locator('.map-panel').screenshot({ path: `${out}/${name}.png` });
    found[name] = hit ? { id: hit.id, kind: hit.kind, sections: hit.sections } : null;
    await post('pause', { paused: false });
  }
} finally {
  await browser.close();
  await post('pause', { paused: false });
}
fs.writeFileSync(`${out}/vehicles.json`, JSON.stringify(found, null, 1));
console.log(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v ? v.kind + ' ' + v.id : 'none'])));
