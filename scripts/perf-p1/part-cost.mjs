// Phase P1 task 2: what does each part cost per frame? Hides one part at a time (or skips one CPU job)
// through globalThis.__perfP1 and measures frame time, CPU time and p95 against the unchanged scene
// measured before and after in the same page (baseline = mean of the two). Fullscreen 2560x1440, day
// and night, with and without traffic, several rounds (fresh browser per round and traffic setting).
//
//   node scripts/perf-p1/part-cost.mjs <out.json> [rounds=3] [baseUrl=http://127.0.0.1:5280]
// Env: VIEWS (overview,city,kungsgatan), CONDITIONS (night,day), TRAFFIC (on,off), FRAMES (300).
import fs from 'node:fs';
import path from 'node:path';
import {
  CONDITIONS,
  host,
  measureFrames,
  openApp,
  setCondition,
  setView,
  vehicleCount,
} from './lib.mjs';
import { machineLoad } from './load.mjs';

const [out = 'docs/perf-p1/data/part-cost.json', roundsArg = '3', base = 'http://127.0.0.1:5280'] =
  process.argv.slice(2);
const rounds = Number(roundsArg);
const VIEWS = (process.env.VIEWS ?? 'overview,city,kungsgatan').split(',');
const CONDS = (process.env.CONDITIONS ?? 'night,day').split(',');
const TRAFFIC = (process.env.TRAFFIC ?? 'on,off').split(',').map((t) => t === 'on');
const FRAMES = Number(process.env.FRAMES ?? 300);

/** Variants: parts hidden (render cost) or CPU jobs skipped. Labels follow the roadmap's categories. */
const VARIANTS = {
  buildings: { hide: ['buildings', 'buildingDetails'] },
  terrain: { hide: ['terrain'] },
  roads: { hide: ['roads', 'bridges'] },
  water: { hide: ['water'] },
  trees: { hide: ['trees'] },
  lights: { hide: ['lights'] },
  labels: { hide: ['labels'] },
  landmarks: { hide: ['radhuset', 'police', 'stadium'] },
  mapDetails: { hide: ['mapDetails'] },
  trafficRender: { hide: ['vehicles', 'transit', 'signals'], traffic: true },
  aircraft: { hide: ['aircraft'], traffic: true },
  trafficUpdate: { flags: ['trafficUpdate'], traffic: true },
  vehicleLights: { flags: ['vehicleLights'], traffic: true },
  lightingUpdate: { flags: ['lightingUpdate'] },
  lightsPerPixel: { perPixel: true, night: true },
  everything: { hide: ['all'], flags: ['trafficUpdate', 'vehicleLights'] },
};

async function apply(page, v, on) {
  await page.evaluate(
    ({ v, on }) => {
      const p = globalThis.__perfP1;
      const l = globalThis.__cityLighting;
      if (on) {
        for (const part of v.hide ?? []) p.setPartVisible(part, false);
        for (const f of v.flags ?? []) p.flags[f] = false;
        if (v.perPixel) {
          // Street lamps evaluate no lamp per pixel; vehicle beams off. Stadium is off in these runs.
          globalThis.__p1Slots = l.uniforms.cityCellSlots.value;
          l.uniforms.cityCellSlots.value = 0;
          l.setVehicleBeams(false);
        }
      } else {
        p.restoreParts();
        p.resetFlags();
        if (v.perPixel) {
          l.uniforms.cityCellSlots.value = globalThis.__p1Slots;
          l.setVehicleBeams(true);
        }
      }
    },
    { v, on },
  );
}

const pick = (m) => ({
  fps: m.fps,
  meanMs: m.meanMs,
  p95Ms: m.p95Ms,
  over16_7: m.over16_7,
  cpuMs: m.cpu.mean,
  cpuP95Ms: m.cpu.p95,
  tasksMs: m.tasks.mean,
  renderMs: m.render.mean,
  outsideMs: m.outsideFrame.mean,
  snapshotFrames: m.snapshotFrames,
  calls: m.calls,
  triangles: m.triangles,
});

const report = {
  note: `Phase P1 part cost: hide one part (or skip one CPU job) and compare with the unchanged scene measured right before and after (baseline = mean of the two), ${FRAMES} frames each, fullscreen 2560x1440, hook build, Edge headless uncapped, DPR 1, Europe/Stockholm 2026-10-21, stadium off. Traffic off = /api aborted. Variant order rotates per round.`,
  host: host(),
  views: VIEWS,
  conditions: CONDS,
  frames: FRAMES,
  variants: VARIANTS,
  runs: [],
  errors: [],
};
fs.mkdirSync(path.dirname(out), { recursive: true });
const names = Object.keys(VARIANTS);
for (let round = 1; round <= rounds; round++)
  for (const traffic of TRAFFIC) {
    const { browser, page, gpu, errors } = await openApp({ base, traffic });
    const run = {
      round,
      traffic,
      gpu,
      vehicles: null,
      loadBefore: await machineLoad(2000),
      results: {},
    };
    try {
      for (const condition of CONDS) {
        await setCondition(page, condition);
        for (const view of VIEWS) {
          await setView(page, view);
          const key = `${condition}/${view}`;
          const r = (run.results[key] = { baseline: [], variants: {} });
          r.baseline.push(pick(await measureFrames(page, FRAMES)));
          const shift = (round - 1) % names.length;
          const order = [...names.slice(shift), ...names.slice(0, shift)].filter(
            (n) =>
              (!VARIANTS[n].traffic || traffic) && (!VARIANTS[n].night || condition === 'night'),
          );
          for (const name of order) {
            await apply(page, VARIANTS[name], true);
            await page.waitForTimeout(400);
            r.variants[name] = pick(await measureFrames(page, FRAMES));
            await apply(page, VARIANTS[name], false);
            await page.waitForTimeout(200);
          }
          r.baseline.push(pick(await measureFrames(page, FRAMES)));
          console.log(
            round,
            traffic ? 'traffic' : 'no-traffic',
            key,
            r.baseline.map((b) => b.meanMs.toFixed(2)).join(' / '),
          );
        }
      }
      run.vehicles = await vehicleCount(page);
      run.loadAfter = await machineLoad(2000);
    } catch (e) {
      report.errors.push(`r${round} traffic ${traffic}: ${e.message}`);
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
