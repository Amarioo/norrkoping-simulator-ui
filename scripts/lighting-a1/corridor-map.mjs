// Lighting Phase A1: diagnostic top-down map of the corridor from committed data only (rendered map,
// A1 source extract, generated fixtures and provenance). Not a basemap; for review and docs.
//
//   node scripts/lighting-a1/corridor-map.mjs <out.png> [x0 x1 z0 z1 pxPerUnit]
//
// Grey: carriageways (rendered widths); orange: lit=yes ways; blue dashed: lit=no; magenta: tram
// tracks; light blue: water; tan: bridge outlines; buildings grey. Green dashed: A1 zones. Fixtures:
// orange / yellow / green circles = A1 estimates (8 m bracket / 6 m bracket / 4 m lantern; tick = arm),
// blue squares = A1 mapped OSM lamps, small dark-green dots = pilot fixtures, purple ring = deck
// support. ✕ red = rejected/skipped candidate, ✕ grey = suppressed by a nearby fixture.
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { geodeticToScene, swerefToScene } from '../../src/lib/geo/sweref99tm.js';
import { A1_ZONES } from '../../src/lib/lighting/corridorA1.ts';

const [out = 'docs/lighting-phase-a1/evidence/corridor-map.png', ...box] = process.argv.slice(2);
const [x0, x1, z0, z1, s] = (box.length ? box : ['-19.5', '3', '-32.5', '-10.5', '44']).map(Number);
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const map = read('src/lib/data/norrkoping-map.json');
const source = read('scripts/data/lighting-a1-source.json');
const a1 = read('src/lib/data/streetlights-a1.json');
const prov = read('src/lib/data/streetlights-a1-provenance.json');
const pilot = read('src/lib/data/streetlights.json');
const bridges = read('src/lib/data/city-bridges.json').bridges;
const ref = map.meta.reference;
const X = (x) => ((x - x0) * s).toFixed(1),
  Z = (z) => ((z - z0) * s).toFixed(1);
const inb = (p, m = 2) => p[0] > x0 - m && p[0] < x1 + m && p[1] > z0 - m && p[1] < z1 + m;
const W = Math.round((x1 - x0) * s),
  H = Math.round((z1 - z0) * s);
const poly = (r, fill, stroke = 'none', sw = 0, extra = '') =>
  `<polygon points="${r.map((p) => `${X(p[0])},${Z(p[1])}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#fbfaf7;font-family:Arial">`;
for (const a of map.areas)
  if (a.rings[0].some((p) => inb(p)))
    svg += poly(
      a.rings[0],
      a.kind === 'water' ? '#a9d3f5' : '#e9efe2',
      'none',
      0,
      a.kind === 'water' ? '' : 'fill-opacity="0.7"',
    );
for (const b of bridges) if (inb(b.center)) svg += poly(b.ring, '#dccba6', '#9c7d4b', 1);
for (const b of map.buildings)
  if (b.rings[0].some((p) => inb(p, 0))) svg += poly(b.rings[0], '#cbc6be', '#9a948a', 0.5);
for (const r of map.roads) {
  if (!inb(r.a) && !inb(r.b)) continue;
  if (r.kind === 'road')
    svg += `<line x1="${X(r.a[0])}" y1="${Z(r.a[1])}" x2="${X(r.b[0])}" y2="${Z(r.b[1])}" stroke="#a3abb3" stroke-width="${(r.width * s).toFixed(1)}" stroke-linecap="round"/>`;
  else if (r.kind === 'rail')
    svg += `<line x1="${X(r.a[0])}" y1="${Z(r.a[1])}" x2="${X(r.b[0])}" y2="${Z(r.b[1])}" stroke="#555" stroke-width="1"/>`;
}
for (const e of source.elements) {
  if (e.type !== 'way' || !e.geometry) continue;
  const pts = e.geometry.map(([la, lo]) => geodeticToScene(ref, la, lo));
  if (!pts.some((p) => inb(p))) continue;
  const lit = e.tags.lit;
  svg += `<polyline points="${pts.map((p) => `${X(p[0])},${Z(p[1])}`).join(' ')}" fill="none" stroke="${lit === 'yes' ? '#f28c28' : '#1f4fff'}" stroke-width="${lit === 'yes' ? 1.1 : 2.2}" ${lit === 'yes' ? '' : 'stroke-dasharray="5 3"'}/>`;
}
for (const r of map.roads)
  if (r.kind === 'tram' && (inb(r.a) || inb(r.b)))
    svg += `<line x1="${X(r.a[0])}" y1="${Z(r.a[1])}" x2="${X(r.b[0])}" y2="${Z(r.b[1])}" stroke="#d81b9a" stroke-width="1.4"/>`;
for (const z of Object.values(A1_ZONES))
  svg += poly(
    z.ring.map(([e, n]) => swerefToScene(ref, e, n)),
    'none',
    '#0a8a2a',
    2.5,
    'stroke-dasharray="9 5"',
  );
for (const f of pilot.fixtures)
  if (inb([f.x, f.z])) svg += `<circle cx="${X(f.x)}" cy="${Z(f.z)}" r="3" fill="#1b5e20"/>`;
const colour = {
  'street-bracket-8m': '#e8590c',
  'street-bracket-6m': '#e0b000',
  'park-lantern-4m': '#13a35b',
};
for (const f of a1.fixtures) {
  if (f.placement === 'mapped')
    svg += `<rect x="${(+X(f.x) - 5).toFixed(1)}" y="${(+Z(f.z) - 5).toFixed(1)}" width="10" height="10" fill="#1565ff" stroke="#000"/>`;
  else {
    svg += `<circle cx="${X(f.x)}" cy="${Z(f.z)}" r="5.5" fill="${colour[f.type]}" stroke="#000"/>`;
    if (f.type !== 'park-lantern-4m')
      svg += `<line x1="${X(f.x)}" y1="${Z(f.z)}" x2="${X(f.x + Math.sin(f.heading) * 0.13)}" y2="${Z(f.z + Math.cos(f.heading) * 0.13)}" stroke="#000" stroke-width="2"/>`;
  }
  if (f.mount.kind === 'bridge')
    svg += `<circle cx="${X(f.x)}" cy="${Z(f.z)}" r="9" fill="none" stroke="#8e24aa" stroke-width="2.2"/>`;
}
for (const r of prov.rejected) {
  const [x, z] = swerefToScene(ref, r.en[0], r.en[1]);
  svg += `<text x="${X(x)}" y="${Z(z)}" font-size="13" text-anchor="middle" dominant-baseline="middle" fill="${r.reason.startsWith('suppressed') ? '#777' : '#d50000'}">✕</text>`;
}
const legend = [
  ['#e8590c', 'A1 estimate, 8 m bracket'],
  ['#e0b000', 'A1 estimate, 6 m bracket'],
  ['#13a35b', 'A1 estimate, 4 m lantern'],
  ['#1565ff', 'A1 mapped OSM lamp'],
  ['#1b5e20', 'Step 6 pilot fixture'],
];
svg += `<rect x="8" y="${H - 130}" width="235" height="122" fill="#fff" fill-opacity="0.9" stroke="#999"/>`;
legend.forEach(([c, t], i) => {
  svg += `<circle cx="22" cy="${H - 114 + i * 18}" r="5.5" fill="${c}" stroke="#000"/><text x="34" y="${H - 110 + i * 18}" font-size="12">${t}</text>`;
});
svg += `<text x="14" y="${H - 18}" font-size="11" fill="#333">green dashed: A1 zones · ✕ rejected/suppressed · scene grid ${1} unit = 25 m</text>`;
svg += `<text x="${W - 8}" y="${H - 8}" font-size="10" text-anchor="end" fill="#555">© OpenStreetMap contributors (ODbL) · OSM base 2026-10-16 (map) / 2026-10-23 (lit)</text>`;
svg += '</svg>';
fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.screenshot({ path: out });
await browser.close();
console.log(out, W, H);
