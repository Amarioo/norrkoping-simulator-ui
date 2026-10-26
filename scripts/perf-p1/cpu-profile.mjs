// Phase P1 task 3: where does the main-thread time per frame go? Samples the page's JavaScript with
// the Chrome DevTools Protocol profiler (Profiler domain, 100 µs sampling) while the map runs in a
// fixed fullscreen view, maps every sampled function back to its source file and name through the
// hook build's source maps (minified production code, built with --sourcemap), and groups the time
// into categories (three.js render phases, traffic, lighting, Svelte, Threlte, GC, browser).
//
//   node scripts/perf-p1/cpu-profile.mjs <out.json> [rounds=3] [baseUrl=http://127.0.0.1:5280] [distDir=work/perf-p1/dist-hook]
// Env: VIEWS (default overview,kungsgatan), CONDITIONS (default night,day), TRAFFIC (on,off), SECONDS (6),
// RAW_DIR (optional: keep the raw .cpuprofile files there; they are large and machine-run specific).
import fs from 'node:fs';
import path from 'node:path';
import { createAnalyser } from './cpu-analyse.mjs';
import { host, openApp, setCondition, setView, vehicleCount } from './lib.mjs';
import { machineLoad } from './load.mjs';

const [
  out = 'docs/perf-p1/data/cpu-profile.json',
  roundsArg = '3',
  base = 'http://127.0.0.1:5280',
  dist = 'work/perf-p1/dist-hook',
] = process.argv.slice(2);
const rounds = Number(roundsArg);
const VIEWS = (process.env.VIEWS ?? 'overview,kungsgatan').split(',');
const CONDS = (process.env.CONDITIONS ?? 'night,day').split(',');
const TRAFFIC = (process.env.TRAFFIC ?? 'on,off').split(',').map((t) => t === 'on');
const SECONDS = Number(process.env.SECONDS ?? 6);
const RAW = process.env.RAW_DIR;

const analyse = createAnalyser(dist);

const report = {
  note: `Phase P1 CPU profile: CDP Profiler (sampling 100 µs) on the page's main thread for ${SECONDS} s per view after settling, fullscreen 2560x1440, hook build with source maps (minified), Edge headless uncapped, DPR 1, Europe/Stockholm 2026-10-21, stadium off. ms per frame = sampled time / frames rendered during the profile. The profiler itself slows the page somewhat (sampling overhead), so absolute numbers are a little above the unprofiled ones; the split is what matters.`,
  host: host(),
  views: VIEWS,
  conditions: CONDS,
  seconds: SECONDS,
  runs: [],
  errors: [],
};
fs.mkdirSync(path.dirname(out), { recursive: true });
if (RAW) fs.mkdirSync(RAW, { recursive: true });
for (let round = 1; round <= rounds; round++)
  for (const traffic of TRAFFIC) {
    const { browser, page, gpu, errors } = await openApp({ base, traffic });
    const run = { round, traffic, gpu, vehicles: null, load: await machineLoad(2000), results: {} };
    try {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
      for (const condition of CONDS) {
        await setCondition(page, condition);
        for (const view of VIEWS) {
          await setView(page, view);
          await page.evaluate(() => globalThis.__perfP1.frames.start());
          await cdp.send('Profiler.start');
          await page.waitForTimeout(SECONDS * 1000);
          const { profile } = await cdp.send('Profiler.stop');
          const frames = await page.evaluate(() => globalThis.__perfP1.frames.stop());
          const real = frames.filter((f) => f.interval != null);
          const meanInterval = real.reduce((a, f) => a + f.interval, 0) / real.length;
          const meanCpu = real.reduce((a, f) => a + f.cpuMs, 0) / real.length;
          const key = `${condition}/${view}`;
          run.results[key] = {
            frameMs: meanInterval,
            cpuMs: meanCpu,
            ...analyse(profile, frames.length),
          };
          if (RAW)
            fs.writeFileSync(
              path.join(
                RAW,
                `r${round}-${traffic ? 'traffic' : 'notraffic'}-${condition}-${view}.cpuprofile`,
              ),
              JSON.stringify(profile),
            );
          console.log(round, traffic, key, frames.length, 'frames', meanInterval.toFixed(2), 'ms');
        }
      }
      run.vehicles = await vehicleCount(page);
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
