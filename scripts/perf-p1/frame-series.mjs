// Phase P1: frame-by-frame series (frame interval, CPU time of the Threlte tasks and of
// renderer.render(), GPU time, traffic-snapshot frames) to see what makes the long frames behind the
// overview's p95. Fullscreen 2560x1440, traffic on, hook build. Values rounded to 0.01 ms.
//   node scripts/perf-p1/frame-series.mjs <out.json> [rounds=3] [baseUrl=http://127.0.0.1:5280]
// Env: VIEWS (overview,kungsgatan), CONDITIONS (night,day), FRAMES (1200), GPU (1 = timer on).
import fs from 'node:fs';
import path from 'node:path';
import { host, openApp, setCondition, setView, vehicleCount } from './lib.mjs';
import { machineLoad } from './load.mjs';

const [
  out = 'docs/perf-p1/data/frame-series.json',
  roundsArg = '3',
  base = 'http://127.0.0.1:5280',
] = process.argv.slice(2);
const VIEWS = (process.env.VIEWS ?? 'overview,kungsgatan').split(',');
const CONDS = (process.env.CONDITIONS ?? 'night,day').split(',');
const FRAMES = Number(process.env.FRAMES ?? 1200);
const GPU = process.env.GPU === '1';
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const report = {
  note: `Phase P1 frame series: ${FRAMES} consecutive frames per view; rAF interval (what the viewer sees), hook CPU split (tasks before the render stage, render stage), GPU timer ${GPU ? 'on' : 'off'}, snapshot = a new traffic snapshot was seen at the start of the frame. Fullscreen 2560x1440, traffic on, hook build, Edge headless uncapped, Europe/Stockholm 2026-10-21, stadium off.`,
  host: host(),
  runs: [],
  errors: [],
};
fs.mkdirSync(path.dirname(out), { recursive: true });
for (let round = 1; round <= Number(roundsArg); round++) {
  const { browser, page, gpu, errors } = await openApp({ base, traffic: true });
  const run = { round, gpu, load: await machineLoad(2000), series: {} };
  try {
    for (const condition of CONDS) {
      await setCondition(page, condition);
      for (const view of VIEWS) {
        await setView(page, view);
        const frames = await page.evaluate(
          async ({ n, gpu }) => {
            const p = globalThis.__perfP1;
            if (gpu) p.gpu.enable();
            for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(r));
            p.frames.start();
            for (let i = 0; i <= n; i++) await new Promise((r) => requestAnimationFrame(r));
            p.frames.stop();
            if (gpu) for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
            const f = p.frames.collect();
            if (gpu) p.gpu.disable();
            return f;
          },
          { n: FRAMES, gpu: GPU },
        );
        const real = frames.filter((f) => f.interval != null);
        run.series[`${condition}/${view}`] = {
          interval: real.map((f) => r2(f.interval)),
          tasks: real.map((f) => r2(f.tasksMs)),
          render: real.map((f) => r2(f.renderMs)),
          gpu: GPU ? real.map((f) => r2(f.gpuMs)) : undefined,
          snapshot: real.map((f) => (f.snapshot ? 1 : 0)),
        };
        console.log(round, condition, view, real.length);
      }
    }
    run.vehicles = await vehicleCount(page);
  } catch (e) {
    report.errors.push(`r${round}: ${e.message}`);
  } finally {
    report.errors.push(...errors);
    report.runs.push(run);
    fs.writeFileSync(out, JSON.stringify(report));
    await browser.close();
  }
}
if (report.errors.length) {
  console.error(report.errors);
  process.exitCode = 1;
}
