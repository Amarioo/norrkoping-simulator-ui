// Phase C1 (copied from scripts/fuel-d2/paired.mjs; views of the measured forest tile: pilotAbove = from the south, 110 m up, the whole tile in view; pilotGround = eye level in the clearing; set through the perf hook camera because main has no preset there): paired timing of builds against main. Every round measures every build once, in a
// rotated order (round r starts with build r mod n, alternating direction), so slow drift of the
// machine hits all builds alike; each build is compared with main *of the same round*.
// Fullscreen 2560x1440, traffic on, hook builds, Edge headless uncapped (P1's set-up, lib.mjs).
// A round starts only when background CPU ≤ MAX_BUSY % (default 18) for 3 samples of 10 s.
//   node scripts/vegetation-c1/paired.mjs <out.json> <rounds> main=url name=url [name=url ...]
// Env: FRAMES (600), VIEWS (day/loopAbove,day/loopGround,night/loopAbove,night/loopGround,day/overview,night/overview), GPU (0)
import fs from 'node:fs';
import path from 'node:path';
import {
  host,
  measureFrames,
  openApp,
  setCondition,
  setView,
  vehicleCount,
} from '../perf-p1/lib.mjs';
import { machineLoad } from '../perf-p1/load.mjs';

const [out, roundsArg, ...targets] = process.argv.slice(2);
if (!out || !roundsArg || targets.length < 2)
  throw new Error('usage: <out.json> <rounds> main=url ...');
if (fs.existsSync(out)) throw new Error(`${out} exists (raw runs are never overwritten)`);
const builds = targets.map((t) => {
  const [name, base] = t.split('=');
  return { name, base };
});
const FRAMES = Number(process.env.FRAMES ?? 600);
// GPU=1: also time every renderer.render() on the GPU (EXT_disjoint_timer_query_webgl2; on ANGLE an
// upper bound of GPU busy time, see scripts/perf-p1/gpu.mjs). Off by default: the queries cost a little.
const GPU = process.env.GPU === '1';
const MAX_BUSY = Number(process.env.MAX_BUSY ?? 18);
const VIEWS = (
  process.env.VIEWS ?? 'day/loopAbove,day/loopGround,night/loopAbove,night/loopGround,day/overview,night/overview'
).split(',');
// Fixed camera poses (scene units), the ones of scripts/vegetation-c1/shots.mjs views 01 and 04.
const POSES = {
  pilotAbove: { c: [13.8047, 6.4735, 106.3963], t: [13.8047, 2.3608, 94.5923] },
  pilotGround: { c: [14.2049, 1.9766, 97.1932], t: [12.0041, 2.562, 93.1918] },
  // The rollout around the trail loop: shots.mjs views 06 (from the south, 330 m up) and 09 (on the trail).
  loopAbove: { c: [16.8057, 14.6609, 133.6056], t: [14.8051, 2.3394, 95.5927] },
  loopGround: { c: [12.0041, 2.2159, 106.3963], t: [15.6053, 2.3157, 102.7951] },
};
const place = (page, pose) =>
  page.evaluate((p) => {
    const camera = globalThis.__perfP1.camera;
    camera.position.set(...p.c);
    camera.lookAt(...p.t);
    camera.updateMatrixWorld();
  }, pose);
const cameraAt = (page) => page.evaluate(() => globalThis.__perfP1.camera.position.toArray());
const report = {
  note: `Phase C1 paired timing: ${FRAMES} frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= ${MAX_BUSY} %.${GPU ? ' GPU timer on.' : ''}`,
  host: host(),
  builds: builds.map((b) => b.name),
  views: VIEWS,
  frames: FRAMES,
  runs: [],
  errors: [],
};
fs.mkdirSync(path.dirname(out), { recursive: true });
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 1));

// Per frame: all draw calls, triangles and material switches, and those of the lights part (street
// lights, halos and, since E1, the airport lights) and the map details.
const capture = (page) =>
  page.evaluate(async () => {
    const c = await globalThis.__perfP1.capture();
    const part = (name) => c.parts.find((p) => p.part === name) ?? {};
    const layers = {};
    for (const name of ['lights', 'aircraft'])
      layers[name] = {
        calls: part(name).drawCalls ?? 0,
        triangles: part(name).triangles ?? 0,
        materialSwitches: part(name).materialSwitches ?? 0,
      };
    return {
      drawCalls: c.totals.drawCalls,
      triangles: c.totals.triangles,
      materialSwitches: c.parts.reduce((a, p) => a + (p.materialSwitches ?? 0), 0),
      layers,
    };
  });

for (let round = 1; round <= Number(roundsArg); round++) {
  for (let inRow = 0; inRow < 3;) {
    const l = await machineLoad(10000);
    inRow = l.busyPercent <= MAX_BUSY ? inRow + 1 : 0;
    if (!inRow) console.log(`round ${round}: waiting, machine ${l.busyPercent} % busy`);
  }
  const n = builds.length,
    start = (round - 1) % n,
    order = Array.from({ length: n }, (_, i) => builds[(start + (round % 2 ? i : n - i)) % n]);
  for (const build of order) {
    const run = { round, build: build.name, order: order.map((b) => b.name), results: {} };
    run.load = await machineLoad(2000);
    const { browser, page, gpu, errors } = await openApp({ base: build.base, traffic: true });
    run.gpu = gpu;
    try {
      let condition = null;
      let settled = null;
      for (const key of VIEWS) {
        const [c, view] = key.split('/');
        if (c !== condition) await setCondition(page, (condition = c));
        if (view === 'plane') {
          // Follow the aircraft (its lights in view); camera keeps moving with it.
          await setView(page, 'overview', 500);
          // The sidebar is outside the fullscreen panel: a DOM click on the button.
          await page.evaluate(() =>
            [...document.querySelectorAll('button')]
              .find((b) => b.textContent?.includes('Följ flygplanet'))
              ?.click(),
          );
          await page.waitForTimeout(4000);
        } else if (POSES[view]) {
          await setView(page, 'overview', 800);
          await place(page, POSES[view]);
          await page.waitForTimeout(2500);
          // The app keeps the camera a little above the ground, so a ground-level pose settles
          // slightly higher (the same in every build). Measure from the settled pose.
          settled = await cameraAt(page);
        } else {
          // After a fixed pose the focus select still says "overview": choose another preset first, or
          // selecting "overview" again changes nothing and the camera stays at the pose.
          if (settled) await setView(page, 'city', 500);
          settled = null;
          await setView(page, view);
        }
        const frames = await measureFrames(page, FRAMES, { gpu: GPU });
        run.results[key] = { ...frames, capture: await capture(page) };
        if (POSES[view]) {
          // The pose must have held through the measurement (nothing moved the camera).
          const at = await cameraAt(page);
          run.results[key].camera = at;
          if (at.some((v, i) => Math.abs(v - settled[i]) > 1e-3))
            throw new Error(key + ': camera moved to ' + at.join(', '));
        }
        console.log(
          round,
          build.name,
          key,
          frames.meanMs.toFixed(2),
          frames.cpu?.median?.toFixed(2),
          frames.gpu?.median?.toFixed(2),
          run.results[key].capture.drawCalls,
        );
      }
      run.vehicles = await vehicleCount(page);
    } catch (e) {
      report.errors.push(`r${round} ${build.name}: ${e.message}`);
    } finally {
      report.errors.push(...errors.map((e) => `r${round} ${build.name}: ${e}`));
      report.runs.push(run);
      save();
      await browser.close();
    }
  }
}
if (report.errors.length) {
  console.error(report.errors);
  process.exitCode = 1;
}
