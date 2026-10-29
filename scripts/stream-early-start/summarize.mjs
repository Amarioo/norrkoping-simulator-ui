// Summarise diag jsonl files: per condition medians of the second-tab timeline, pass rate at 5 s,
// and paired differences against the first condition (same round).
import fs from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) =>
  fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.afterLoadMs != null),
);
const med = (a) => {
  const s = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const by = {};
rows.forEach((r) => (by[r.variant] ??= []).push(r));
const fields = {
  esCreate: (r) => r.t.esCreate,
  reqSent: (r) => r.net?.find((n) => n[0] === 'req' && /stream/.test(n[1]))?.[2],
  respHandled: (r) => r.net?.find((n) => n[0] === 'resp')?.[2],
  wDoneLast: (r) => Math.max(...Object.entries(r.t).filter(([k]) => k.startsWith('wDone')).map(([, v]) => v)),
  metricsDom: (r) => r.t.metricsDom,
  metrics60: (r) => r.t.metricsTarget,
  afterLoad: (r) => r.afterLoadMs,
  firstLongTask: (r) => r.longTasks?.[0]?.[1],
  buildMs: (r) => r.buildMs,
};
console.log('variant      n  pass@5s ' + Object.keys(fields).map((k) => k.padStart(12)).join(''));
for (const [v, rs] of Object.entries(by))
  console.log(
    v.padEnd(12) + String(rs.length).padStart(2) + `  ${rs.filter((r) => r.afterLoadMs < 5000).length}/${rs.length}`.padEnd(8) +
      Object.values(fields).map((f) => String(med(rs.map(f)) ?? '-').padStart(12)).join(''),
  );
const names = Object.keys(by);
const base = names[0];
for (const v of names.slice(1)) {
  const n = Math.min(by[base].length, by[v].length);
  const d = [];
  for (let i = 0; i < n; i++) d.push(by[v][i].afterLoadMs - by[base][i].afterLoadMs);
  console.log(`paired ${v} − ${base}: median ${med(d)} ms, ${d.filter((x) => x < 0).length}/${n} negative, [${d.join(', ')}]`);
}
