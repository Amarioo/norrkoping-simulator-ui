// Lighting Phase A2: diagnostic top-down map of the A2 corridor and its seams with A1 and the
// Kungsgatan pilot, from committed data only (rendered map, A1/A2 source extracts, generated fixtures
// and provenance). Not a basemap; for review and docs.
//
//   node scripts/lighting-a2/corridor-map.mjs <out.png> [x0 x1 z0 z1 pxPerUnit]
//
// Grey: carriageways (rendered widths); rose: rendered carriageways/paths WITHOUT a lit tag (unknown);
// orange: lit=yes ways; magenta: tram tracks; pink: platforms. Dashed purple: A2 zones D/E; dashed
// green: A1 zones; dotted dark green: Kungsgatan pilot bound. Fixtures: A2 = large circles (purple
// 8 m bracket, lilac 6 m bracket, teal 4 m lantern; tick = arm); A1 = small orange; pilot = small dark
// green. ✕ red: candidate skipped by a rule (covered by road lighting, identity); ✕ grey: suppressed by
// a nearby fixture (spacing rule).
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { geodeticToScene, swerefToScene } from '../../src/lib/geo/sweref99tm.js';
import { A1_ZONES } from '../../src/lib/lighting/corridorA1.ts';
import { A2_ZONES } from '../../src/lib/lighting/corridorA2.ts';

const [out = 'docs/lighting-phase-a2/evidence/corridor-map.png', ...box] = process.argv.slice(2);
const [x0, x1, z0, z1, s] = (box.length ? box : ['-28.5', '-16', '-27', '-13', '72']).map(Number);
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const map = read('src/lib/data/norrkoping-map.json');
const sources = [
  read('scripts/data/lighting-a2-source.json'),
  read('scripts/data/lighting-a1-source.json'),
];
const a1 = read('src/lib/data/streetlights-a1.json');
const a2 = read('src/lib/data/streetlights-a2.json');
const prov = read('src/lib/data/streetlights-a2-provenance.json');
const a1prov = read('src/lib/data/streetlights-a1-provenance.json');
const pilot = read('src/lib/data/streetlights.json');
const places = read('src/lib/data/city-places.json');
const ref = map.meta.reference;
const k = ref.metresPerUnit;
const X = (x) => ((x - x0) * s).toFixed(1),
  Z = (z) => ((z - z0) * s).toFixed(1);
const inb = (p, m = 2) => p[0] > x0 - m && p[0] < x1 + m && p[1] > z0 - m && p[1] < z1 + m;
const W = Math.round((x1 - x0) * s),
  H = Math.round((z1 - z0) * s);
const poly = (r, fill, stroke = 'none', sw = 0, extra = '') =>
  `<polygon points="${r.map((p) => `${X(p[0])},${Z(p[1])}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const unknown = new Set([...prov.unknownWays, ...a1prov.unknownWays].map((u) => u.way));
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#fbfaf7;font-family:Arial">`;
for (const a of map.areas)
  if (a.rings[0].some((p) => inb(p)))
    svg += poly(
      a.rings[0],
      a.kind === 'water' ? '#a9d3f5' : '#e9efe2',
      'none',
      0,
      'fill-opacity="0.7"',
    );
for (const b of map.buildings)
  if (b.rings[0].some((p) => inb(p, 0))) svg += poly(b.rings[0], '#cbc6be', '#9a948a', 0.5);
for (const p of places.platforms)
  if (p.ring.some((q) => inb(q))) svg += poly(p.ring, '#f5c6e6', '#a0207a', 1);
for (const r of map.roads) {
  if (!inb(r.a) && !inb(r.b)) continue;
  const line = (stroke, w, extra = '') =>
    `<line x1="${X(r.a[0])}" y1="${Z(r.a[1])}" x2="${X(r.b[0])}" y2="${Z(r.b[1])}" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
  if (r.kind === 'road')
    svg += line(
      unknown.has(r.way) ? '#e3a5a5' : '#a3abb3',
      (r.width * s).toFixed(1),
      'stroke-linecap="round"',
    );
  else if (r.kind === 'rail') svg += line('#555', 1);
  else if (r.kind === 'path' && unknown.has(r.way))
    svg += line('#d07070', 1.6, 'stroke-dasharray="4 3"');
}
const drawn = new Set();
for (const src of sources)
  for (const e of src.elements) {
    if (e.type !== 'way' || !e.geometry || drawn.has(e.id)) continue;
    drawn.add(e.id);
    const pts = e.geometry.map(([la, lo]) => geodeticToScene(ref, la, lo));
    if (!pts.some((p) => inb(p))) continue;
    const lit = e.tags.lit;
    svg += `<polyline points="${pts.map((p) => `${X(p[0])},${Z(p[1])}`).join(' ')}" fill="none" stroke="${lit === 'yes' ? '#f28c28' : '#1f4fff'}" stroke-width="${lit === 'yes' ? 1.2 : 2.2}" ${lit === 'yes' ? '' : 'stroke-dasharray="5 3"'}/>`;
  }
for (const r of map.roads)
  if (r.kind === 'tram' && (inb(r.a) || inb(r.b)))
    svg += `<line x1="${X(r.a[0])}" y1="${Z(r.a[1])}" x2="${X(r.b[0])}" y2="${Z(r.b[1])}" stroke="#d81b9a" stroke-width="1.4"/>`;
const ringScene = (ring) => ring.map(([e, n]) => swerefToScene(ref, e, n));
for (const z of Object.values(A1_ZONES))
  svg += poly(ringScene(z.ring), 'none', '#0a8a2a', 2.5, 'stroke-dasharray="9 5"');
const pb = pilot.meta.pilots.find((p) => p.id === 'kungsgatan').bounds;
svg += poly(
  [
    [pb.x0, pb.z0],
    [pb.x1, pb.z0],
    [pb.x1, pb.z1],
    [pb.x0, pb.z1],
  ],
  'none',
  '#1b5e20',
  2.5,
  'stroke-dasharray="2 4"',
);
for (const [name, z] of Object.entries(A2_ZONES)) {
  const r = ringScene(z.ring);
  svg += poly(r, '#7b1fa2', '#6a1b9a', 3, 'fill-opacity="0.05" stroke-dasharray="11 5"');
  const c = r.reduce((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0]);
  svg += `<text x="${X(c[0] + (name === 'D' ? 1.2 : 0.9))}" y="${Z(c[1] + (name === 'D' ? -0.2 : 0))}" font-size="26" font-weight="bold" fill="#6a1b9a">${name}</text>`;
}
for (const f of pilot.fixtures)
  if (inb([f.x, f.z])) svg += `<circle cx="${X(f.x)}" cy="${Z(f.z)}" r="3.5" fill="#1b5e20"/>`;
for (const f of a1.fixtures)
  if (inb([f.x, f.z]))
    svg += `<circle cx="${X(f.x)}" cy="${Z(f.z)}" r="3.5" fill="#f28c28" stroke="#5d3000" stroke-width="0.6"/>`;
const colour = {
  'street-bracket-8m': '#8e24aa',
  'street-bracket-6m': '#ce93d8',
  'park-lantern-4m': '#00897b',
};
for (const f of a2.fixtures) {
  if (f.heading !== null && f.type !== 'park-lantern-4m') {
    const len = 0.28;
    svg += `<line x1="${X(f.x)}" y1="${Z(f.z)}" x2="${X(f.x + Math.sin(f.heading) * len)}" y2="${Z(f.z + Math.cos(f.heading) * len)}" stroke="#222" stroke-width="1.6"/>`;
  }
  svg += `<circle cx="${X(f.x)}" cy="${Z(f.z)}" r="6" fill="${colour[f.type]}" stroke="#000" stroke-width="1"/>`;
}
for (const r of prov.rejected) {
  const [x, z] = swerefToScene(ref, r.en[0], r.en[1]);
  if (!inb([x, z], 0)) continue;
  svg += `<text x="${X(x)}" y="${Z(z)}" font-size="15" fill="${r.reason.startsWith('suppressed') ? '#777' : '#d00'}" text-anchor="middle" dominant-baseline="central">✕</text>`;
}
// Labels for the untagged carriageway pieces (evidence gap).
const labelled = new Set();
for (const r of map.roads) {
  if (r.kind !== 'road' || !unknown.has(r.way) || labelled.has(r.way) || !inb(r.a, -0.5)) continue;
  if (![286445696, 300186798, 1050773512].includes(r.way)) continue;
  labelled.add(r.way);
  const m = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
  svg += `<text x="${X(m[0])}" y="${Z(m[1] - 0.18)}" font-size="12" fill="#b00020" text-anchor="middle">no lit tag (way ${r.way})</text>`;
}
svg += `<rect x="${W - 330}" y="${H - 168}" width="320" height="158" fill="#fff" fill-opacity="0.92" stroke="#888"/>`;
const legend = [
  ['#8e24aa', 'A2 8 m bracket (estimate)'],
  ['#ce93d8', 'A2 6 m bracket (estimate)'],
  ['#00897b', 'A2 4 m lantern (estimate)'],
  ['#f28c28', 'Phase A1 fixture'],
  ['#1b5e20', 'Kungsgatan pilot fixture'],
];
legend.forEach(([c, t], i) => {
  svg += `<circle cx="${W - 312}" cy="${H - 150 + i * 22}" r="6" fill="${c}" stroke="#000"/><text x="${W - 298}" y="${H - 145 + i * 22}" font-size="13">${t}</text>`;
});
svg += `<text x="${W - 318}" y="${H - 34}" font-size="12" fill="#b00020">rose road = rendered, no lit tag (unknown)</text>`;
svg += `<text x="${W - 318}" y="${H - 17}" font-size="12">purple dashed: A2 zones · green dashed: A1 · dotted: pilot</text>`;
svg += '</svg>';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
await page.screenshot({ path: out });
await browser.close();
console.log(out, W, H, k);
