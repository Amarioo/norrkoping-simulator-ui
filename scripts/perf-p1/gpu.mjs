// Phase P1 task 4: the GPU side. In P0's fullscreen views (2560x1440), day and night with traffic:
// (a) GPU time per renderer.render() with EXT_disjoint_timer_query_webgl2 (switched on only while
//     measuring), next to frame time and CPU time;
// (b) resolution scaling: drawing-buffer pixel ratio 0.5 / 0.75 / 1 / 1.5 (1 = the app's dpr 1;
//     1.5 = 3840x2160 pixels) — if frame time does not follow the pixel count, fill rate is not the
//     bottleneck;
// (c) the night lighting's per-pixel cost: street-lamp loop off (cityCellSlots = 0) and vehicle
//     beams off, at ratio 1 and 1.5.
// Note: on ANGLE/D3D11 the timer measures elapsed GPU-timeline time between the begin and end
// markers, which includes the GPU waiting for commands that the CPU is still submitting. It is an
// upper bound of GPU busy time, not the busy time itself; differences between variants are what count.
//
//   node scripts/perf-p1/gpu.mjs <out.json> [rounds=3] [baseUrl=http://127.0.0.1:5280]
// Env: VIEWS (overview,city,kungsgatan), CONDITIONS (night,day), FRAMES (300), RATIOS (0.5,0.75,1,1.5).
import fs from 'node:fs';
import path from 'node:path';
import { host, measureFrames, openApp, setCondition, setView, vehicleCount } from './lib.mjs';
import { machineLoad } from './load.mjs';

const [out = 'docs/perf-p1/data/gpu.json', roundsArg = '3', base = 'http://127.0.0.1:5280'] =
  process.argv.slice(2);
const rounds = Number(roundsArg);
const VIEWS = (process.env.VIEWS ?? 'overview,city,kungsgatan').split(',');
const CONDS = (process.env.CONDITIONS ?? 'night,day').split(',');
const FRAMES = Number(process.env.FRAMES ?? 300);
const RATIOS = (process.env.RATIOS ?? '0.5,0.75,1,1.5').split(',').map(Number);

const pick = (m, size) => ({
  pixels: size ? `${size.width}x${size.height}` : undefined,
  fps: m.fps,
  meanMs: m.meanMs,
  p95Ms: m.p95Ms,
  cpuMs: m.cpu.mean,
  renderMs: m.render.mean,
  gpuMs: m.gpu?.mean ?? null,
  gpuMedianMs: m.gpu?.median ?? null,
  gpuP95Ms: m.gpu?.p95 ?? null,
  gpuSamples: m.gpu?.n ?? 0,
  calls: m.calls,
});
const setRatio = (page, r) => page.evaluate((r) => globalThis.__perfP1.setPixelRatio(r), r);
const perPixel = (page, on) =>
  page.evaluate((on) => {
    const l = globalThis.__cityLighting;
    if (!on) {
      globalThis.__p1Slots = l.uniforms.cityCellSlots.value;
      l.uniforms.cityCellSlots.value = 0;
      l.setVehicleBeams(false);
    } else {
      l.uniforms.cityCellSlots.value = globalThis.__p1Slots;
      l.setVehicleBeams(true);
    }
  }, on);

const report = {
  note: `Phase P1 GPU: EXT_disjoint_timer_query_webgl2 around renderer.render() (elapsed GPU-timeline time, an upper bound of busy time on ANGLE/D3D11), pixel-ratio scaling of the drawing buffer, per-pixel night lighting off; ${FRAMES} frames per measurement, fullscreen 2560x1440 window, hook build, Edge headless uncapped, traffic on, Europe/Stockholm 2026-10-21, stadium off.`,
  host: host(),
  views: VIEWS,
  conditions: CONDS,
  ratios: RATIOS,
  frames: FRAMES,
  runs: [],
  errors: [],
};
fs.mkdirSync(path.dirname(out), { recursive: true });
for (let round = 1; round <= rounds; round++) {
  const { browser, page, gpu, errors } = await openApp({ base, traffic: true });
  const run = {
    round,
    gpu,
    timer: null,
    vehicles: null,
    loadBefore: await machineLoad(2000),
    results: {},
  };
  try {
    run.timer = await page.evaluate(() => globalThis.__perfP1.gpu.available);
    const ratios = round % 2 ? RATIOS : [...RATIOS].reverse();
    for (const condition of CONDS) {
      await setCondition(page, condition);
      for (const view of VIEWS) {
        await setView(page, view);
        const r = (run.results[`${condition}/${view}`] = { ratios: {}, lightsOff: {} });
        for (const ratio of ratios) {
          const size = await setRatio(page, ratio);
          await page.waitForTimeout(500);
          r.ratios[ratio] = pick(await measureFrames(page, FRAMES, { gpu: run.timer }), size);
        }
        if (condition === 'night')
          for (const ratio of [1, 1.5]) {
            const size = await setRatio(page, ratio);
            await perPixel(page, false);
            await page.waitForTimeout(500);
            r.lightsOff[ratio] = pick(await measureFrames(page, FRAMES, { gpu: run.timer }), size);
            await perPixel(page, true);
          }
        await setRatio(page, 1);
        console.log(
          round,
          condition,
          view,
          JSON.stringify(
            Object.fromEntries(
              Object.entries(r.ratios).map(([k, v]) => [
                k,
                [v.meanMs.toFixed(2), v.gpuMs?.toFixed(2)],
              ]),
            ),
          ),
        );
      }
    }
    run.vehicles = await vehicleCount(page);
    run.loadAfter = await machineLoad(2000);
  } catch (e) {
    report.errors.push(`r${round}: ${e.message}`);
  } finally {
    report.errors.push(...errors);
    report.runs.push(run);
    fs.writeFileSync(out, JSON.stringify(report, null, 1));
    await browser.close();
  }
}
if (report.errors.length) {
  console.error(report.errors);
  process.exitCode = 1;
}
