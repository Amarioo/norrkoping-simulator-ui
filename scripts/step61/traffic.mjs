// Observe the real Ktor simulation through a live browser SSE connection, with no injected vehicles.
// BASE=http://127.0.0.1:5185/ DURATION=120 node scripts/step61/traffic.mjs <outDir>
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  const base = process.env.BASE ?? 'http://127.0.0.1:5185/';
  const post = async (name, data) => {
    const response = await page.request.post(base + 'api/simulator/' + name, { data });
    if (!response.ok()) throw new Error(`${name}: ${response.status()}`);
  };
  await post('settings', {
    compact: 600,
    estate: 170,
    trucks: 150,
    buses: 80,
    trams: 0,
    trains: 0,
    flights: false,
    timeScale: 20,
  });
  await post('reset', {});
  await post('pause', { paused: true });
  await page.goto(base + '?date=2026-10-21&time=21:30&stadium=off');
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 120000 });
  await page.locator('.label-toggle input').uncheck();
  await page.evaluate(() => {
    const { camera, controls } = globalThis.__cityCamera;
    camera.position.set(-17.9, 2.8, 2.9);
    controls.target.set(-21.1, 0.8, -0.9);
    controls.update();
    globalThis.__cityLighting.settle();
    globalThis.__trafficEvidence = { frames: [], reversals: [], crossings: [], seen: {} };
    const stream = new EventSource('/api/simulator/stream');
    stream.addEventListener('city', (event) => {
      const world = JSON.parse(event.data),
        evidence = globalThis.__trafficEvidence;
      const vehicles = world.vehicles.filter(
        (v) => v.pos[0] > -23 && v.pos[0] < -19 && v.pos[2] > -4 && v.pos[2] < 4,
      );
      evidence.frames.push({ time: world.simulationTime, vehicles });
      for (const v of vehicles) {
        const prev = evidence.seen[v.id];
        // Northbound on the deck, later southbound before leaving its northern end.
        if (
          v.road === 'Kungsgatan' &&
          v.pos[2] > -1.3 &&
          v.pos[2] < 2.7 &&
          Math.cos(v.heading) < -0.7
        )
          evidence.seen[v.id] = { ...prev, north: true, kind: v.kind };
        if (prev?.north && v.pos[2] < -1.6) evidence.seen[v.id].departedDeck = true;
        if (
          prev?.north &&
          !prev.departedDeck &&
          !prev.done &&
          Math.cos(v.heading) > 0.7 &&
          v.pos[2] > -1.5 &&
          v.pos[2] < 0
        ) {
          evidence.reversals.push({ time: world.simulationTime, vehicle: v });
          evidence.seen[v.id].done = true;
        }
        if (prev?.north && !prev.crossed && v.pos[2] < -2.5 && Math.cos(v.heading) < -0.7) {
          evidence.crossings.push({ time: world.simulationTime, vehicle: v });
          evidence.seen[v.id].crossed = true;
        }
      }
    });
  });
  await post('pause', { paused: false });
  let turns = 0,
    crossings = 0;
  for (let second = 0; second < Number(process.env.DURATION ?? 120); second++) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => ({
      turns: __trafficEvidence.reversals.length,
      crossings: __trafficEvidence.crossings.length,
    }));
    if ((state.turns > turns && turns < 3) || (state.crossings > crossings && crossings < 3)) {
      await page
        .locator('.map-panel')
        .screenshot({
          path: `${out}/t${second}-turns${state.turns}-crossings${state.crossings}.png`,
        });
    }
    turns = state.turns;
    crossings = state.crossings;
  }
  await post('pause', { paused: true });
  const evidence = await page.evaluate(() => __trafficEvidence);
  fs.writeFileSync(`${out}/trace.json`, JSON.stringify({ ...evidence, errors }, null, 1));
  console.log(
    JSON.stringify({ out, reversals: evidence.reversals, crossings: evidence.crossings, errors }),
  );
} finally {
  await browser.close();
}
if (errors.length) process.exitCode = 1;
