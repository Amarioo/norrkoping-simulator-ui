// Phase P1: Markdown summaries of the raw data in docs/perf-p1/data/.
//   node scripts/perf-p1/summarize.mjs breakdown docs/perf-p1/data/breakdown.json > docs/perf-p1/data/breakdown-summary.md
//   node scripts/perf-p1/summarize.mjs parts     docs/perf-p1/data/part-cost.json  > docs/perf-p1/data/part-cost-summary.md
//   node scripts/perf-p1/summarize.mjs cpu       docs/perf-p1/data/cpu-profile.json > docs/perf-p1/data/cpu-profile-summary.md
//   node scripts/perf-p1/summarize.mjs gpu       docs/perf-p1/data/gpu.json > docs/perf-p1/data/gpu-summary.md
import fs from 'node:fs';
import { median } from './lib.mjs';

const [kind, file] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const out = [];
const p = (s = '') => out.push(s);
const f = (v, d = 2) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(d));
const sg = (v, d = 2) =>
  v == null || !Number.isFinite(v)
    ? '–'
    : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d);
const n = (v) => (v == null ? '–' : Math.round(v).toLocaleString('en-US'));
const range = (vals, d = 2, signed = true) => {
  const s = vals.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return '–';
  const fm = signed ? sg : f;
  return s.length === 1 ? fm(s[0], d) : `${fm(s[0], d)} … ${fm(s.at(-1), d)}`;
};

/** Roadmap categories (Swedish labels, as in the README) and the hook's parts in each. */
export const CATEGORIES = [
  ['Byggnader (OSM-väggar, tak, gesimser)', ['buildings']],
  ['Byggnader, detaljmodeller (kajfasader, stationen, hallar)', ['buildingDetails']],
  ['Mark/terräng (mark, gräs, strandkanter)', ['terrain']],
  ['Vägar, vägmarkeringar och räls', ['roads']],
  ['Broar', ['bridges']],
  ['Vatten', ['water']],
  ['Träd', ['trees']],
  ['Lyktstolpar och halos', ['lights']],
  ['Fordon (bilar, lastbilar)', ['vehicles']],
  ['Kollektivtrafik (bussar, spårvagnar, tåg)', ['transit']],
  ['Trafiksignaler', ['signals']],
  ['Flygtrafik', ['aircraft']],
  ['Etiketter', ['labels']],
  ['Landmärke: rådhuset', ['radhuset']],
  ['Landmärke: polistornet', ['police']],
  ['Landmärke: stadion', ['stadium']],
  ['Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.)', ['mapDetails']],
  ['Himmel', ['sky']],
  ['Övrigt', ['other']],
];

if (kind === 'breakdown') {
  p(`# Phase P1 — draw calls and triangles per part`);
  p();
  p(data.note);
  p();
  p(`Host: ${data.host.cpu}, ${data.host.cores} threads. GPU: ${data.runs[0]?.gpu}.`);
  p(
    "Columns: draw calls, triangles, drawn objects / visible objects of the part, materials and shader programs used, material switches (draw-order changes of material, each one makes three.js re-upload that material's uniforms), scene nodes under the part (all of them go through the matrix update every frame). Median capture of three (by draw calls).",
  );
  for (const run of data.runs)
    for (const [key, caps] of Object.entries(run.views)) {
      const cap = [...caps].sort((a, b) => a.totals.drawCalls - b.totals.drawCalls)[1] ?? caps[0];
      p();
      p(
        `## ${key}, traffic ${run.traffic ? 'on' : 'off'} — ${n(cap.totals.drawCalls)} calls, ${n(cap.totals.triangles)} triangles, ${cap.totals.programs} programs`,
      );
      p();
      p(
        '| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |',
      );
      p('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
      for (const [label, parts] of CATEGORIES) {
        const rows = cap.parts.filter((r) => parts.includes(r.part));
        if (!rows.length) continue;
        const sum = (k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
        if (!sum('drawCalls') && !sum('sceneNodes')) continue;
        p(
          `| ${label} | ${n(sum('drawCalls'))} | ${f((100 * sum('drawCalls')) / cap.totals.drawCalls, 1)} % | ${n(sum('triangles'))} | ${n(sum('drawnObjects'))} / ${n(sum('visibleRenderables'))} | ${n(sum('materials'))} | ${n(sum('programs'))} | ${n(sum('materialSwitches'))} | ${n(sum('sceneNodes'))} |`,
        );
      }
    }
}

if (kind === 'parts') {
  p(`# Phase P1 — cost per part (hide one part / skip one job)`);
  p();
  p(data.note);
  p();
  p(
    `Host: ${data.host.cpu}, ${data.host.cores} threads. Rounds: ${Math.max(...data.runs.map((r) => r.round))}. Machine load before each round (whole machine, all cores): ${data.runs.map((r) => `${r.loadBefore?.busyPercent} %`).join(', ')}.`,
  );
  p();
  p(
    'Δ = variant − baseline of the same page (negative = the part costs that much). Shown: median over rounds, then the range (min … max) over rounds. Mean = mean frame interval; p95 = 95th percentile of the frame interval; CPU = Threlte tasks + renderer.render() per frame.',
  );
  const keys = [...new Set(data.runs.flatMap((r) => Object.keys(r.results)))];
  for (const traffic of [true, false])
    for (const key of keys) {
      const runs = data.runs.filter((r) => r.traffic === traffic && r.results[key]);
      if (!runs.length) continue;
      const base = runs.map((r) => {
        const b = r.results[key].baseline;
        const avg = (k) => b.reduce((a, x) => a + x[k], 0) / b.length;
        return {
          meanMs: avg('meanMs'),
          p95Ms: avg('p95Ms'),
          cpuMs: avg('cpuMs'),
          fps: 1000 / avg('meanMs'),
          calls: b[0].calls,
          drift: b.at(-1).meanMs - b[0].meanMs,
        };
      });
      p();
      p(`## ${key}, traffic ${traffic ? 'on' : 'off'}`);
      p();
      p(
        `Baseline: ${f(median(base.map((b) => b.fps)), 0)} fps, mean ${f(median(base.map((b) => b.meanMs)))} ms (${range(
          base.map((b) => b.meanMs),
          2,
          false,
        )}), p95 ${f(median(base.map((b) => b.p95Ms)))} ms (${range(
          base.map((b) => b.p95Ms),
          1,
          false,
        )}), CPU ${f(median(base.map((b) => b.cpuMs)))} ms, ${n(base[0].calls)} calls; drift first → last baseline ${range(base.map((b) => b.drift))} ms.`,
      );
      p();
      p('| Variant | Δ mean ms | range | Δ p95 ms | range | Δ CPU ms | calls |');
      p('|---|---:|---:|---:|---:|---:|---:|');
      const variants = [...new Set(runs.flatMap((r) => Object.keys(r.results[key].variants)))];
      const rows = variants.map((v) => {
        const d = runs
          .map((r, i) => {
            const x = r.results[key].variants[v];
            return (
              x && {
                mean: x.meanMs - base[i].meanMs,
                p95: x.p95Ms - base[i].p95Ms,
                cpu: x.cpuMs - base[i].cpuMs,
                calls: x.calls,
              }
            );
          })
          .filter(Boolean);
        return { v, d, mean: median(d.map((x) => x.mean)) };
      });
      rows.sort((a, b) => a.mean - b.mean);
      for (const { v, d, mean } of rows)
        p(
          `| ${v} | ${sg(mean)} | ${range(d.map((x) => x.mean))} | ${sg(median(d.map((x) => x.p95)), 1)} | ${range(
            d.map((x) => x.p95),
            1,
          )} | ${sg(median(d.map((x) => x.cpu)))} | ${n(median(d.map((x) => x.calls)))} |`,
        );
    }
}

if (kind === 'cpu') {
  p(`# Phase P1 — CPU profile per frame`);
  p();
  p(data.note);
  p();
  p(
    `Host: ${data.host.cpu}, ${data.host.cores} threads. Machine load before each run: ${data.runs.map((r) => `${r.load?.busyPercent} %`).join(', ')}.`,
  );
  const keys = [...new Set(data.runs.flatMap((r) => Object.keys(r.results)))];
  for (const traffic of [true, false])
    for (const key of keys) {
      const runs = data.runs.filter((r) => r.traffic === traffic && r.results[key]);
      if (!runs.length) continue;
      const res = runs.map((r) => r.results[key]);
      p();
      p(`## ${key}, traffic ${traffic ? 'on' : 'off'}`);
      p();
      p(
        `Frame ${f(median(res.map((r) => r.frameMs)))} ms (${range(
          res.map((r) => r.frameMs),
          2,
          false,
        )}), CPU (hook) ${f(median(res.map((r) => r.cpuMs)))} ms, sampled busy main thread ${f(median(res.map((r) => r.busyMsPerFrame)))} ms per frame, ${runs.length} runs.`,
      );
      p();
      p('| Category | ms per frame (median) | range | share of busy time |');
      p('|---|---:|---:|---:|');
      const cats = [...new Set(res.flatMap((r) => r.categories.map((c) => c.category)))];
      const rows = cats.map((c) => {
        const v = res.map((r) => r.categories.find((x) => x.category === c)?.msPerFrame ?? 0);
        const s = res.map((r) => r.categories.find((x) => x.category === c)?.shareOfBusy ?? 0);
        return { c, m: median(v), v, s: median(s) };
      });
      rows.sort((a, b) => b.m - a.m);
      for (const r of rows)
        if (r.m >= 0.005)
          p(
            `| ${r.c} | ${f(r.m)} | ${range(r.v, 2, false)} | ${r.c.startsWith('inaktiv') ? '' : f(100 * r.s, 1) + ' %'} |`,
          );
      p();
      p('Top functions by self time (median ms per frame over runs):');
      p();
      p('| Function — source | ms per frame |');
      p('|---|---:|');
      const fns = new Map();
      for (const r of res)
        for (const t of r.topSelf) fns.set(t.fn, [...(fns.get(t.fn) ?? []), t.msPerFrame]);
      [...fns]
        .map(([fn, v]) => [fn, median([...v, ...Array(res.length - v.length).fill(0)])])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .forEach(([fn, v]) => p(`| ${fn.replace(/\|/g, '\\|')} | ${f(v, 3)} |`));
    }
}

if (kind === 'gpu') {
  p(`# Phase P1 — GPU time, resolution scaling, per-pixel lighting`);
  p();
  p(data.note);
  p();
  p(
    `Host: ${data.host.cpu}. GPU: ${data.runs[0]?.gpu}. Timer available: ${data.runs.map((r) => r.timer).join(', ')}. Machine load before each round: ${data.runs.map((r) => `${r.loadBefore?.busyPercent} %`).join(', ')}.`,
  );
  const keys = [...new Set(data.runs.flatMap((r) => Object.keys(r.results)))];
  for (const key of keys) {
    const res = data.runs.map((r) => r.results[key]).filter(Boolean);
    p();
    p(`## ${key} (traffic on), median of ${res.length} rounds`);
    p();
    p(
      '| Pixel ratio | Pixels | fps | Frame ms | p95 ms | CPU ms | GPU ms (timer, mean) | GPU p95 ms |',
    );
    p('|---|---|---:|---:|---:|---:|---:|---:|');
    for (const ratio of data.ratios) {
      const v = res.map((r) => r.ratios[ratio]).filter(Boolean);
      const m = (k) => median(v.map((x) => x[k]));
      p(
        `| ${ratio} | ${v[0]?.pixels} | ${f(m('fps'), 0)} | ${f(m('meanMs'))} | ${f(m('p95Ms'), 1)} | ${f(m('cpuMs'))} | ${f(m('gpuMs'))} | ${f(m('gpuP95Ms'))} |`,
      );
    }
    for (const ratio of ['1', '1.5']) {
      const off = res.map((r) => r.lightsOff?.[ratio]).filter(Boolean);
      if (!off.length) continue;
      const on = res.map((r) => r.ratios[ratio]).filter(Boolean);
      const d = (k) => off.map((x, i) => x[k] - on[i][k]);
      p(
        `| ${ratio}, lamps and beams off | ${off[0].pixels} | ${f(median(off.map((x) => x.fps)), 0)} | ${f(median(off.map((x) => x.meanMs)))} (Δ ${sg(median(d('meanMs')))}) | ${f(median(off.map((x) => x.p95Ms)), 1)} | ${f(median(off.map((x) => x.cpuMs)))} | ${f(median(off.map((x) => x.gpuMs)))} (Δ ${sg(median(d('gpuMs')))}, ${range(d('gpuMs'))}) | ${f(median(off.map((x) => x.gpuP95Ms)))} |`,
      );
    }
  }
}

if (kind === 'frames') {
  p(`# Phase P1 — frame-by-frame series`);
  p();
  p(data.note);
  p();
  p(
    'CPU = Threlte tasks + render stage of each frame (hook). Budgets: 16.7 ms = one 60 Hz interval; 12.2 ms = two intervals of the 164 Hz display (a frame that takes longer is shown after three or more). Snapshot frames = a new traffic snapshot arrived at the start of the frame. Median over rounds.',
  );
  p();
  p(
    '| View | frames | CPU median ms | CPU p95 ms | CPU max ms | > 12.2 ms | > 16.7 ms | > 20 ms | snapshot frames | CPU snapshot / other (mean ms) | hook interval p95 ms |',
  );
  p('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const keys = [...new Set(data.runs.flatMap((r) => Object.keys(r.series)))];
  const q = (s, x) => s[Math.min(s.length - 1, Math.ceil(s.length * x) - 1)];
  for (const key of keys) {
    const rows = data.runs
      .map((r) => r.series[key])
      .filter(Boolean)
      .map((s) => {
        const cpu = s.tasks.map((t, i) => t + s.render[i]);
        const sorted = [...cpu].sort((a, b) => a - b);
        const iv = [...s.interval].sort((a, b) => a - b);
        const snap = cpu.filter((_, i) => s.snapshot[i]);
        const other = cpu.filter((_, i) => !s.snapshot[i]);
        const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
        return {
          n: cpu.length,
          med: q(sorted, 0.5),
          p95: q(sorted, 0.95),
          max: sorted.at(-1),
          o12: cpu.filter((v) => v > 12.2).length / cpu.length,
          o16: cpu.filter((v) => v > 1000 / 60).length / cpu.length,
          o20: cpu.filter((v) => v > 20).length / cpu.length,
          snaps: snap.length,
          snapMean: mean(snap),
          otherMean: mean(other),
          ivp95: q(iv, 0.95),
        };
      });
    const m = (k) => median(rows.map((r) => r[k]));
    p(
      `| ${key} | ${n(m('n'))} | ${f(m('med'))} | ${f(m('p95'))} | ${f(m('max'))} | ${f(100 * m('o12'), 0)} % | ${f(100 * m('o16'), 0)} % | ${f(100 * m('o20'), 1)} % | ${n(m('snaps'))} | ${f(m('snapMean'))} / ${f(m('otherMean'))} | ${f(m('ivp95'))} |`,
    );
  }
}

console.log(out.join('\n'));
