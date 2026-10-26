// Phase P0: summaries as Markdown tables.
//
//   node scripts/fullscreen-fps/summarize.mjs pair <raw.json> <labelA> <labelB>
//       measure.mjs / counter-cost.mjs output: per condition and view the median over rounds of each
//       run's median and p95 frame interval for A and B, and the paired per-round difference B − A
//       (median and largest); map-ready and post-GC heap.
//   node scripts/fullscreen-fps/summarize.mjs baseline <raw.json>
//       fullscreen-baseline.mjs output: per screen, condition and view the median over rounds.
import fs from 'node:fs';

const [mode, file, labelA, labelB] = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const median = (a) => {
  const s = a.filter((v) => v != null).sort((x, y) => x - y);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const f = (v, d = 2) => (v == null ? '–' : v.toFixed(d));
const sg = (v, d = 2) =>
  v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d);
const ok = report.runs.filter((r) => !r.failed);
const failed = report.runs.filter((r) => r.failed);
const lines = [];

if (mode === 'pair') {
  const A = ok.filter((r) => r.label === labelA),
    B = ok.filter((r) => r.label === labelB);
  const rounds = [...new Set(ok.map((r) => r.round))].filter(
    (n) => A.some((r) => r.round === n) && B.some((r) => r.round === n),
  );
  lines.push(
    `Rounds paired: ${rounds.length}; failed runs: ${failed.length}${failed.map((r) => ` (${r.label} r${r.round}: ${r.failed})`).join('')}`,
    '',
  );
  lines.push(
    `| Condition / view | ${labelA} median / p95 ms | ${labelB} median / p95 ms | Δ median (worst) | Δ p95 (worst) |`,
    '|---|---:|---:|---:|---:|',
  );
  let worstP95 = -Infinity;
  for (const [condition] of report.conditions)
    for (const view of report.views) {
      const get = (runs, k) => runs.map((r) => r.frames?.[condition]?.[view]?.[k]);
      const dm = rounds.map((n) => {
        const a = A.find((r) => r.round === n).frames[condition][view],
          b = B.find((r) => r.round === n).frames[condition][view];
        return { median: b.median - a.median, p95: b.p95 - a.p95 };
      });
      const worst = (k) => dm.reduce((m, d) => (d[k] > m ? d[k] : m), -Infinity);
      worstP95 = Math.max(worstP95, median(dm.map((d) => d.p95)));
      lines.push(
        `| ${condition} / ${view} | ${f(median(get(A, 'median')))} / ${f(median(get(A, 'p95')))} | ${f(median(get(B, 'median')))} / ${f(median(get(B, 'p95')))} | ${sg(median(dm.map((d) => d.median)))} (${sg(worst('median'))}) | ${sg(median(dm.map((d) => d.p95)))} (${sg(worst('p95'))}) |`,
      );
    }
  const mr = (runs) => median(runs.map((r) => r.mapReadyMs));
  const hp = (runs) => median(runs.map((r) => r.heapMB));
  lines.push('', `Largest median paired Δ p95 over views: ${sg(worstP95)} ms`);
  lines.push(
    `Map-ready median: ${labelA} ${f(mr(A), 0)} ms, ${labelB} ${f(mr(B), 0)} ms (Δ ${sg(mr(B) - mr(A), 0)} ms)`,
  );
  lines.push(
    `Post-GC heap median: ${labelA} ${f(hp(A))} MB, ${labelB} ${f(hp(B))} MB (Δ ${sg(hp(B) - hp(A))} MB)`,
  );
} else if (mode === 'baseline') {
  lines.push(
    `Runs: ${ok.length} ok, ${failed.length} failed; GPU: ${[...new Set(ok.map((r) => r.gpu))].join('; ')}`,
    '',
  );
  lines.push(
    '| Screen | Condition / view | fps | ms per frame (mean) | p95 ms | frames > 16.7 ms | CPU ms (mean) | draw calls | triangles |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const screen of [...new Set(ok.map((r) => r.screen))]) {
    const runs = ok.filter((r) => r.screen === screen);
    for (const key of Object.keys(runs[0].views)) {
      const m = (k) => median(runs.map((r) => r.views[key]?.[k]));
      lines.push(
        `| ${screen} | ${key.replace('/', ' / ')} | ${f(m('fps'), 0)} | ${f(m('meanMs'))} | ${f(m('p95Ms'))} | ${f(100 * m('over16_7'), 0)} % | ${f(m('cpuMeanMs'))} | ${f(m('calls'), 0)} | ${Math.round(m('triangles')).toLocaleString('en-US')} |`,
      );
    }
    lines.push(
      `| ${screen} | vehicles in the simulation | ${runs.map((r) => r.vehicles).join(', ')} | | | | | | |`,
    );
  }
} else throw new Error('mode: pair | baseline');
console.log(lines.join('\n'));
