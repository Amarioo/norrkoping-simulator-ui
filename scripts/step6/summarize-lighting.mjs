// Medians across runs of scripts/step6/measure-lighting.mjs reports.
// Usage: node scripts/step6/summarize-lighting.mjs <prefix> (e.g. work/step6/perf/r-after-light-)
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
  return s.length ? Number(s[Math.floor((s.length - 1) / 2)].toFixed(2)) : null;
};
const out = { runs: runs.length, conditions: {}, transitions: {} };
for (const c of Object.keys(runs[0].conditions)) {
  out.conditions[c] = { heapMB: med(runs.map((r) => r.conditions[c].__heapMB)) };
  for (const v of Object.keys(runs[0].conditions[c]).filter((k) => !k.startsWith('__')))
    out.conditions[c][v] = Object.fromEntries(
      ['median', 'p95', 'max'].map((k) => [k, med(runs.map((r) => r.conditions[c][v]?.[k]))]),
    );
}
if (runs[0].transitions)
  for (const w of ['steady', 'toggles', 'scrub', 'play'])
    out.transitions[w] = Object.fromEntries(
      ['median', 'p95', 'max'].map((k) => [k, med(runs.map((r) => r.transitions?.[w]?.[k]))]),
    );
console.log(JSON.stringify(out, null, 1));
