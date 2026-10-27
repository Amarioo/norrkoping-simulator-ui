// Phase P2a: Markdown summary of a paired run (paired.mjs). Per view and build: medians over the
// rounds; per build and view: the paired difference to main of the same round (median, min, max).
//   node scripts/perf-p2a/summarize.mjs <paired.json> > <summary.md>
import fs from 'node:fs';
import { median } from '../perf-p1/lib.mjs';

const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const [ref, ...others] = report.builds;
const f = (v, d = 2) => (v == null ? '–' : v.toFixed(d));
const sign = (v) => (v == null ? '–' : (v > 0 ? '+' : '') + v.toFixed(2));
const METRICS = [
  ['rAF mean ms', (r) => r.meanMs],
  ['rAF p95 ms', (r) => r.p95Ms],
  ['CPU median ms', (r) => r.cpu?.median],
  ['CPU p95 ms', (r) => r.cpu?.p95],
  ['frames > 16.7 ms %', (r) => r.over16_7 * 100],
];
const runsOf = (build) => report.runs.filter((r) => r.build === build);
const rounds = [...new Set(report.runs.map((r) => r.round))];
const lines = [
  `# Phase P2a paired run`,
  '',
  `${report.note}`,
  '',
  `Rounds: ${rounds.length}. Builds: ${report.builds.join(', ')} (reference: ${ref}). Load before each build (busy %): ${report.runs.map((r) => r.load?.busyPercent).join(', ')}.`,
  '',
  '## Medians over the rounds',
  '',
];
for (const view of report.views) {
  lines.push(`### ${view}`, '');
  lines.push(
    `| build | ${METRICS.map((m) => m[0]).join(' | ')} | draw calls | tree calls | material switches | tree triangles |`,
  );
  lines.push(`|---|${METRICS.map(() => '---:').join('|')}|---:|---:|---:|---:|`);
  for (const build of report.builds) {
    const res = runsOf(build)
      .map((r) => r.results[view])
      .filter(Boolean);
    lines.push(
      `| ${build} | ${METRICS.map(([, get]) => f(median(res.map(get)))).join(' | ')} | ${median(res.map((r) => r.capture.drawCalls))} | ${median(res.map((r) => r.capture.treeCalls))} | ${median(res.map((r) => r.capture.materialSwitches))} | ${median(res.map((r) => r.capture.treeTriangles))} |`,
    );
  }
  lines.push('');
}
lines.push('## Paired difference to main (same round): median [min … max] in ms', '');
lines.push(`| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |`);
lines.push('|---|---|---:|---:|---:|---:|---:|');
for (const build of others)
  for (const view of report.views) {
    const diffs = { mean: [], p95: [], cpu: [], cpu95: [] };
    for (const round of rounds) {
      const a = report.runs.find((r) => r.round === round && r.build === ref)?.results[view];
      const b = report.runs.find((r) => r.round === round && r.build === build)?.results[view];
      if (!a || !b) continue;
      diffs.mean.push(b.meanMs - a.meanMs);
      diffs.p95.push(b.p95Ms - a.p95Ms);
      diffs.cpu.push(b.cpu.median - a.cpu.median);
      diffs.cpu95.push(b.cpu.p95 - a.cpu.p95);
    }
    const cell = (d) =>
      d.length ? `${sign(median(d))} [${sign(Math.min(...d))} … ${sign(Math.max(...d))}]` : '–';
    lines.push(
      `| ${build} | ${view} | ${cell(diffs.mean)} | ${cell(diffs.p95)} | ${cell(diffs.cpu)} | ${cell(diffs.cpu95)} | ${diffs.cpu.length} |`,
    );
  }
if (report.errors.length) lines.push('', '## Errors', '', ...report.errors.map((e) => `- ${e}`));
console.log(lines.join('\n'));
