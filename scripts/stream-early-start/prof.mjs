// Attribute CPU-profile samples (second tab main thread) to time windows and app functions.
import fs from 'node:fs';
const [file, ...win] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const windows = win.map((w) => w.split('-').map(Number));
let t = (p.startTime / 1e6 - p.docTs) * 1000;
const agg = windows.map(() => ({ total: 0, outer: new Map(), inner: new Map(), self: new Map() }));
const label = (cf) => `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*?\/(src|node_modules)\//, '$1/').split('?')[0]}:${cf.lineNumber + 1}`;
for (let i = 0; i < p.samples.length; i++) {
  t += p.timeDeltas[i] / 1000;
  const wi = windows.findIndex(([a, b]) => t >= a && t < b);
  if (wi < 0) continue;
  const dt = (p.timeDeltas[i + 1] ?? 0) / 1000;
  const a = agg[wi];
  a.total += dt;
  let id = p.samples[i];
  const self = byId.get(id).callFrame;
  const sl = self.url ? label(self) : self.functionName;
  a.self.set(sl, (a.self.get(sl) ?? 0) + dt);
  const chain = [];
  while (id != null) { chain.push(byId.get(id).callFrame); id = parent.get(id); }
  const app = chain.filter((cf) => cf.url.includes('/src/'));
  const o = app.length ? label(app[app.length - 1]) : '(no app frame)';
  const inn = app.length ? label(app[0]) : '(no app frame) ' + sl;
  a.outer.set(o, (a.outer.get(o) ?? 0) + dt);
  a.inner.set(inn, (a.inner.get(inn) ?? 0) + dt);
}
const top = (m, n = 12) => [...m].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => `   ${v.toFixed(0).padStart(5)} ms  ${k}`).join('\n');
windows.forEach(([a, b], i) => {
  console.log(`== window ${a}-${b} ms: ${agg[i].total.toFixed(0)} ms sampled`);
  console.log(' outermost app frame:\n' + top(agg[i].outer, 8));
  console.log(' innermost app frame:\n' + top(agg[i].inner, 14));
  console.log(' self:\n' + top(agg[i].self, 8));
});
