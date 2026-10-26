// Phase P1: re-run only the analysis of cpu-profile.mjs on the raw .cpuprofile files it kept
// (RAW_DIR), e.g. after refining the categories. No browser, no new measurement.
//   node scripts/perf-p1/cpu-reanalyse.mjs <cpu-profile.json> <rawDir> <out.json> [distDir=work/perf-p1/dist-hook]
import fs from 'node:fs';
import path from 'node:path';
import { createAnalyser } from './cpu-analyse.mjs';

const [input, raw, out, dist = 'work/perf-p1/dist-hook'] = process.argv.slice(2);
const analyse = createAnalyser(dist);
const report = JSON.parse(fs.readFileSync(input, 'utf8'));
for (const run of report.runs)
  for (const [key, res] of Object.entries(run.results)) {
    const [condition, view] = key.split('/');
    const file = path.join(
      raw,
      `r${run.round}-${run.traffic ? 'traffic' : 'notraffic'}-${condition}-${view}.cpuprofile`,
    );
    const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
    run.results[key] = { frameMs: res.frameMs, cpuMs: res.cpuMs, ...analyse(profile, res.frames) };
  }
report.reanalysed =
  'categories from scripts/perf-p1/cpu-analyse.mjs (re-run on the kept raw profiles)';
fs.writeFileSync(out, JSON.stringify(report, null, 1));
