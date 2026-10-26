// Phase P1 task 1: draw calls, triangles, objects and materials per part of the scene, in P0's fixed
// fullscreen views, day and night, with and without traffic. Counts, not timings: they do not depend
// on machine load (vehicle positions move, so three captures per view are kept).
//
//   node scripts/perf-p1/breakdown.mjs <out.json> [baseUrl=http://127.0.0.1:5280]
import fs from 'node:fs';
import {
  CONDITIONS,
  P0_VIEWS,
  host,
  openApp,
  setCondition,
  setView,
  vehicleCount,
} from './lib.mjs';

const [out = 'docs/perf-p1/data/breakdown.json', base = 'http://127.0.0.1:5280'] =
  process.argv.slice(2);
const VIEWS = process.env.VIEWS?.split(',') ?? P0_VIEWS;
const CAPTURES = 3;
const report = {
  note: 'Phase P1 breakdown: one frame\'s draw calls attributed to parts (renderer.renderBufferDirect wrapped for that frame, renderer.info read before and after each call), fullscreen 2560x1440, production build with VITE_LIGHTING_HOOK=1, Edge headless uncapped, DPR 1, Europe/Stockholm 2026-10-21, stadium off. Traffic "off" = every /api request aborted (no simulator stream).',
  host: host(),
  screen: '2560x1440',
  views: VIEWS,
  conditions: CONDITIONS,
  captures: CAPTURES,
  runs: [],
  errors: [],
};
fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
for (const traffic of [true, false]) {
  const { browser, page, gpu, errors } = await openApp({ base, traffic });
  const run = { traffic, gpu, vehicles: null, views: {} };
  try {
    for (const condition of Object.keys(CONDITIONS)) {
      await setCondition(page, condition);
      for (const view of VIEWS) {
        await setView(page, view);
        const caps = [];
        for (let i = 0; i < CAPTURES; i++) {
          caps.push(await page.evaluate(() => globalThis.__perfP1.capture()));
          await page.waitForTimeout(500);
        }
        run.views[`${condition}/${view}`] = caps;
      }
    }
    run.vehicles = await vehicleCount(page);
  } catch (e) {
    report.errors.push(`traffic ${traffic}: ${e.message}`);
  } finally {
    report.errors.push(...errors.map((e) => `traffic ${traffic}: ${e}`));
    report.runs.push(run);
    fs.writeFileSync(out, JSON.stringify(report, null, 1));
    await browser.close();
  }
  console.log(JSON.stringify({ traffic, vehicles: run.vehicles }));
}
if (report.errors.length) {
  console.error(report.errors);
  process.exitCode = 1;
}
