// Phase P2a: paired timing of builds against main. Every round measures every build once, in a
// rotated order (round r starts with build r mod n, alternating direction), so slow drift of the
// machine hits all builds alike; each build is compared with main *of the same round*.
// Fullscreen 2560x1440, traffic on, hook builds, Edge headless uncapped (P1's set-up, lib.mjs).
// A round starts only when background CPU ≤ MAX_BUSY % (default 18) for 3 samples of 10 s.
//   node scripts/perf-p2a/paired.mjs <out.json> <rounds> main=url name=url [name=url ...]
// Env: FRAMES (600), VIEWS (night/overview,night/city,night/kungsgatan,night/norraPromenaden,day/overview)
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
const MAX_BUSY = Number(process.env.MAX_BUSY ?? 18);
const VIEWS = (
  process.env.VIEWS ??
  'night/overview,night/city,night/kungsgatan,night/norraPromenaden,day/overview'
).split(',');
const report = {
  note: `Phase P2a paired timing: ${FRAMES} frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= ${MAX_BUSY} %.`,
  host: host(),
  builds: builds.map((b) => b.name),
  views: VIEWS,
  frames: FRAMES,
  runs: [],
  errors: [],
};
fs.mkdirSync(path.dirname(out), { recursive: true });
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 1));

const capture = (page) =>
  page.evaluate(async () => {
    const c = await globalThis.__perfP1.capture();
    const trees = c.parts.find((p) => p.part === 'trees');
    return {
      drawCalls: c.totals.drawCalls,
      triangles: c.totals.triangles,
      materialSwitches: c.parts.reduce((a, p) => a + (p.materialSwitches ?? 0), 0),
      treeCalls: trees?.drawCalls ?? 0,
      treeTriangles: trees?.triangles ?? 0,
      treeMaterialSwitches: trees?.materialSwitches ?? 0,
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
      for (const key of VIEWS) {
        const [c, view] = key.split('/');
        if (c !== condition) await setCondition(page, (condition = c));
        await setView(page, view);
        const frames = await measureFrames(page, FRAMES);
        run.results[key] = { ...frames, capture: await capture(page) };
        console.log(
          round,
          build.name,
          key,
          frames.meanMs.toFixed(2),
          frames.cpu?.median?.toFixed(2),
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
