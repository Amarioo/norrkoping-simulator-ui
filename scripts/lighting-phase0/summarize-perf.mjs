// Summarizes scripts/lighting-phase0/measure.mjs output: per condition/view the median across runs
// of each run's median and p95 frame interval, per-round paired differences, map-ready and post-GC
// heap. Failed runs are listed, never dropped silently.
//
//   node scripts/lighting-phase0/summarize-perf.mjs <raw.json> [<raw2.json> …] > summary.json
import fs from 'node:fs';

const files = process.argv.slice(2);
const runs = files.flatMap((f) =>
  JSON.parse(fs.readFileSync(f, 'utf8')).runs.map((r) => ({ ...r, file: f })),
);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length
    ? s.length % 2
      ? s[(s.length - 1) / 2]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : null;
};
const round1 = (v) => (v == null ? null : Number(v.toFixed(2)));
const ok = runs.filter((r) => !r.failed);
const by = (label) => ok.filter((r) => r.label === label);
const out = {
  files,
  runs: runs.map((r) => ({
    file: r.file,
    label: r.label,
    round: r.round,
    order: r.order,
    failed: r.failed ?? null,
    mapReadyMs: round1(r.mapReadyMs),
    heapMB: r.heapMB == null ? null : Number(r.heapMB.toFixed(3)),
    gpu: r.gpu,
    browser: r.browser,
  })),
  mapReady: {},
  heap: {},
  frames: {},
  pairedRounds: [],
};
for (const label of ['before', 'after']) {
  out.mapReady[label] = round1(median(by(label).map((r) => r.mapReadyMs)));
  out.heap[label] = by(label).length
    ? Number(median(by(label).map((r) => r.heapMB)).toFixed(3))
    : null;
}
out.mapReady.delta = round1(out.mapReady.after - out.mapReady.before);
out.heap.delta = Number((out.heap.after - out.heap.before).toFixed(3));
const conditions = Object.keys(ok[0]?.frames ?? {});
for (const c of conditions) {
  out.frames[c] = {};
  for (const v of Object.keys(ok[0].frames[c])) {
    const cell = {};
    for (const label of ['before', 'after'])
      cell[label] = {
        median: round1(median(by(label).map((r) => r.frames[c][v].median))),
        p95: round1(median(by(label).map((r) => r.frames[c][v].p95))),
      };
    cell.delta = {
      median: round1(cell.after.median - cell.before.median),
      p95: round1(cell.after.p95 - cell.before.p95),
    };
    out.frames[c][v] = cell;
  }
}
// Paired per (file, round): after − before.
const keys = [...new Set(ok.map((r) => `${r.file}#${r.round}`))];
for (const k of keys) {
  const [b, a] = ['before', 'after'].map((l) =>
    ok.find((r) => `${r.file}#${r.round}` === k && r.label === l),
  );
  if (!a || !b) continue;
  const p95 = {};
  for (const c of conditions)
    for (const v of Object.keys(a.frames[c]))
      p95[`${c}/${v}`] = round1(a.frames[c][v].p95 - b.frames[c][v].p95);
  out.pairedRounds.push({
    round: k,
    mapReadyDelta: round1(a.mapReadyMs - b.mapReadyMs),
    heapDelta: Number((a.heapMB - b.heapMB).toFixed(3)),
    p95Delta: p95,
  });
}
const allDeltas = Object.values(out.frames).flatMap((c) =>
  Object.values(c).map((x) => x.delta.p95),
);
const dayDeltas = Object.values(out.frames.day ?? {}).map((x) => x.delta.p95);
out.gates = {
  mapReadyDeltaMs: out.mapReady.delta,
  maxP95DeltaMs: round1(Math.max(...allDeltas)),
  maxDayP95DeltaMs: round1(Math.max(...dayDeltas)),
  heapDeltaMB: out.heap.delta,
  failedRuns: runs.filter((r) => r.failed).length,
};
console.log(JSON.stringify(out, null, 1));
