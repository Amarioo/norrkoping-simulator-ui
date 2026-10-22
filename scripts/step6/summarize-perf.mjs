// Summarises scripts/measure-startup.mjs reports: medians across runs per metric.
// Usage: node scripts/step6/summarize-perf.mjs <glob-prefix> (e.g. work/step6/perf/before-prod-)
import fs from 'node:fs';
import path from 'node:path';
const prefix = process.argv[2];
const dir = path.dirname(prefix),
  base = path.basename(prefix);
const runs = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith(base) && f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const med = (a) => {
  const s = a.filter((v) => v != null).sort((x, y) => x - y);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const out = {
  runs: runs.length,
  readyMs: med(runs.map((r) => r.readyMs)),
  mapReadyAt: med(runs.map((r) => r.upload.mapReadyAt)),
  uploadExcessMs: med(runs.map((r) => r.upload.excessMs)),
  uploadMaxFrameMs: med(runs.map((r) => r.upload.maxFrameMs)),
  heapMB: med(runs.map((r) => r.metrics.JSHeapUsedSize / 1e6)),
  geometries: med(runs.map((r) => r.perf?.geometries)),
  views: {},
};
for (const v of Object.keys(runs[0].views))
  out.views[v] = {
    median: med(runs.map((r) => r.views[v].median)),
    p90: med(runs.map((r) => r.views[v].p90)),
    mean: med(runs.map((r) => r.views[v].mean)),
    calls: med(runs.map((r) => r.views[v].calls)),
    triangles: med(runs.map((r) => r.views[v].triangles)),
  };
console.log(JSON.stringify(out, null, 1));
