// Compares two infra-diagnose.test.ts reports (issue counts, rail grades, worst issues after).
// Usage: node scripts/geo/diagnose-compare.mjs <before.json> <after.json>
import fs from 'node:fs';
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const count = (d) => { const c = {}; for (const i of d.issues) { const k = `${i.kind} ${i.severity}${i.exception ? ' (exc)' : ''}`; c[k] = (c[k] || 0) + 1; } return c; };
const ca = count(a), cb = count(b);
for (const k of [...new Set([...Object.keys(ca), ...Object.keys(cb)])].sort()) console.log(k.padEnd(36), String(ca[k] ?? 0).padStart(5), '->', String(cb[k] ?? 0).padStart(5));
for (const r of b.railGrades) { const o = a.railGrades.find((x) => x.route === r.route); console.log('railGrade', r.route, 'p99', o.p99.toFixed(2), '->', r.p99.toFixed(2), 'max', o.max.toFixed(2), '->', r.max.toFixed(2)); }
const top = (d, kind, n = 8) => d.issues.filter((i) => i.kind === kind && !i.exception && !/^path/.test(i.detail)).sort((p, q) => Math.abs(q.value) - Math.abs(p.value)).slice(0, n).map((i) => `${i.detail} ${i.value.toFixed(2)} @E${i.E} N${i.N}`);
for (const k of ['steep-grade', 'grade-break', 'cross-section', 'below-terrain', 'junction-step', 'sag']) { console.log('--', k, 'worst after (non-path)'); for (const l of top(b, k)) console.log('  ', l); }
