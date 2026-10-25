// Vehicle Lights Phase F1: paired summary of measure.mjs output (per round after − before, then the
// median over rounds), the same reduction as the earlier lighting phases.
//
//   node scripts/vehicle-lights-f1/summarize.mjs <perf.json> [more.json …]
import fs from 'node:fs';

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
for (const file of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ok = r.runs.filter((x) => !x.failed);
  const rounds = [...new Set(ok.map((x) => x.round))].filter(
    (n) => ok.some((x) => x.round === n && x.label === 'before') && ok.some((x) => x.round === n && x.label === 'after'),
  );
  const pair = (n) => ({
    before: ok.find((x) => x.round === n && x.label === 'before'),
    after: ok.find((x) => x.round === n && x.label === 'after'),
  });
  const out = { file, stress: r.stress, vehicles: r.vehicles, rounds: rounds.length, errors: r.errors, frames: {} };
  for (const [condition] of r.conditions) {
    out.frames[condition] = {};
    for (const view of r.views) {
      const d = rounds.map((n) => {
        const { before, after } = pair(n);
        return {
          p95: after.frames[condition][view].p95 - before.frames[condition][view].p95,
          median: after.frames[condition][view].median - before.frames[condition][view].median,
          beforeP95: before.frames[condition][view].p95,
          afterP95: after.frames[condition][view].p95,
          beams: after.beams?.[condition]?.[view] ?? null,
        };
      });
      out.frames[condition][view] = {
        p95Delta: round(median(d.map((x) => x.p95))),
        p95DeltaRounds: d.map((x) => round(x.p95)),
        medianDelta: round(median(d.map((x) => x.median))),
        beforeP95: round(median(d.map((x) => x.beforeP95))),
        afterP95: round(median(d.map((x) => x.afterP95))),
        beams: d.map((x) => x.beams),
      };
    }
  }
  const md = rounds.map((n) => pair(n).after.mapReadyMs - pair(n).before.mapReadyMs);
  const heap = rounds.map((n) => pair(n).after.heapMB - pair(n).before.heapMB);
  out.mapReadyDeltaMs = { median: round(median(md), 1), rounds: md.map((x) => round(x, 1)) };
  out.heapDeltaMB = { median: round(median(heap)), rounds: heap.map((x) => round(x)) };
  out.gpu = ok[0]?.gpu;
  out.browser = ok[0]?.browser;
  console.log(JSON.stringify(out, null, 1));
}
