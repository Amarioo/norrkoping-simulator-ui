// Airport Lighting Phase E1: writes the runway light layout (src/lib/airport/runwayLights.ts) as data,
// for review and for byte-identical rebuild checks: every light (id, group, scene x/z rounded to
// 1e-4 units, height, faces) plus counts and the threshold check against the AIP coordinates.
//   node scripts/airport-e1/layout-summary.mjs <out.json>      (Node ≥ 22.18 strips the TypeScript types)
import fs from 'node:fs';
import {
  esspRunwayLights,
  AIP_EDITION,
  ESSP_RWY,
  ESTIMATES,
  E1_RULE,
} from '../../src/lib/airport/runwayLights.ts';
import { geodeticToScene } from '../../src/lib/geo/sweref99tm.js';

const [out] = process.argv.slice(2);
if (!out) throw new Error('usage: <out.json>');
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const ref = map.meta.reference ?? Object.values(map.meta).find((v) => v && v.originEasting);
const lights = esspRunwayLights(map.airways, map.meta.metresPerUnit);
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const dms = (s, d) => +s.slice(0, d) + +s.slice(d, d + 2) / 60 + +s.slice(d + 2) / 3600;
// AIP §2.12 threshold coordinates (WGS 84), converted with the project's EPSG:3006 functions.
const AIP_THR = { '09': ['583510.01', '0161354.08'], 27: ['583508.92', '0161610.53'] };
const runway = map.airways.find((a) => a.ref === '09/27' && !a.historic);
const thresholdCheck = Object.fromEntries(
  Object.entries(AIP_THR).map(([k, [la, lo]]) => {
    const p = geodeticToScene(ref, dms(la, 2), dms(lo, 3));
    const end = k === '09' ? runway.points[0] : runway.points.at(-1);
    return [
      k,
      {
        aipScene: p.map(r4),
        osmEnd: end,
        distanceM: r4(Math.hypot(p[0] - end[0], p[1] - end[1]) * 25),
      },
    ];
  }),
);
const byGroup = {};
for (const l of lights) byGroup[l.group] = (byGroup[l.group] ?? 0) + 1;
const report = {
  rule: E1_RULE,
  aip: AIP_EDITION,
  source: ESSP_RWY,
  estimates: ESTIMATES,
  thresholdCheck,
  counts: { total: lights.length, byGroup },
  lights: lights.map((l) => ({ ...l, position: l.position.map(r4) })),
};
fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ counts: report.counts, thresholdCheck }));
