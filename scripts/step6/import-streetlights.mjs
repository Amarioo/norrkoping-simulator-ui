// Step 6 lighting pilot: fixtures with provenance for the three pilot areas.
//
//   node scripts/step6/import-streetlights.mjs
//
// Reads (all local, no network):
//   scripts/data/norrkoping-lighting-source.json  OSM snapshot (fetch-lighting-sources.mjs)
//   src/lib/data/norrkoping-map.json               roads (widths, bridges, trams), buildings
// Writes src/lib/data/streetlights.json.
//
// Rules (docs/step6/lighting-data.md):
// - Mapped fixtures: every OSM lamp node in a pilot. The position is mapped (not surveyed); type,
//   height, colour temperature and output are inferred from the context (road class / path).
// - Estimated fixtures only along ways with lit=yes. lit=no gets none; a missing lit tag is unknown
//   and also gets none (conservative: not every road or park path is lit).
// - Estimated positions follow class rules (spacing, side, offset behind the kerb). A position is
//   rejected (or shifted ≤ 4 m along the way) when it is inside/too close to a building, inside a
//   carriageway, within 1.2 m of a tram track or 1.5 m of a mapped entrance.
// - Deduplication: estimates within the class suppression radius of a mapped lamp are dropped
//   (mapped coverage wins); estimates closer than 0.55 × spacing to an earlier estimate are dropped.
// - Occlusion: 16 horizontal sectors per fixture, each the shortest distance to a building wall
//   along three rays in the sector (2D footprints), so light does not reach behind façades.
import fs from 'node:fs';
import { geodeticToScene } from '../../src/lib/geo/sweref99tm.js';
import { PILOTS } from './pilots.mjs';

const source = JSON.parse(fs.readFileSync('scripts/data/norrkoping-lighting-source.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const reference = { ...map.meta.reference };
const M = 25; // metres per scene unit (map.meta.metresPerUnit)
const SECTORS = 16;
const toScene = (lat, lon) => geodeticToScene(reference, lat, lon);

/** Fixture types: geometry is in src/lib/lighting/fixtures.ts, photometry here (inferred). */
export const TYPES = {
  'street-bracket-8m': {
    heightM: 8,
    armM: 1.4,
    cct: 3000,
    candela: 1600,
    rangeM: 30,
    profile: 0,
    spacingM: 30,
    suppressM: 14,
  },
  'street-bracket-6m': {
    heightM: 6,
    armM: 0.9,
    cct: 3000,
    candela: 900,
    rangeM: 24,
    profile: 0,
    spacingM: 27,
    suppressM: 12,
  },
  'park-lantern-4m': {
    heightM: 4.2,
    armM: 0,
    cct: 2700,
    candela: 380,
    rangeM: 16,
    profile: 1,
    spacingM: 22,
    suppressM: 9,
  },
  'entrance-post-4m': {
    heightM: 4,
    armM: 0,
    cct: 4000,
    candela: 450,
    rangeM: 15,
    profile: 1,
    spacingM: 0,
    suppressM: 6,
  },
};
const ROAD = new Set([
  'primary',
  'secondary',
  'tertiary',
  'primary_link',
  'secondary_link',
  'tertiary_link',
]);
const MINOR = new Set(['residential', 'living_street', 'unclassified', 'service']);
const PATH = new Set(['footway', 'path', 'cycleway', 'pedestrian', 'steps', 'bridleway']);

function typeFor(highway, pilotKind) {
  if (ROAD.has(highway)) return 'street-bracket-8m';
  if (MINOR.has(highway)) return 'street-bracket-6m';
  if (PATH.has(highway)) return pilotKind === 'park' ? 'park-lantern-4m' : 'park-lantern-4m';
  return null;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz), t };
}
function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
/** Distance (scene units) along a ray to the first footprint edge, or Infinity. */
function rayHit(o, dir, edges, max) {
  let best = max;
  for (const [a, b] of edges) {
    const ex = b[0] - a[0],
      ez = b[1] - a[1];
    const den = dir[0] * ez - dir[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - o[0]) * ez - (a[1] - o[1]) * ex) / den;
    const u = ((a[0] - o[0]) * dir[1] - (a[1] - o[1]) * dir[0]) / den;
    if (t > 1e-6 && t < best && u >= 0 && u <= 1) best = t;
  }
  return best;
}

const out = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    generator: 'scripts/step6/import-streetlights.mjs',
    sources: [
      {
        id: 'osm-lighting-snapshot',
        file: 'scripts/data/norrkoping-lighting-source.json',
        dataset: 'OpenStreetMap (Overpass API)',
        license: 'ODbL-1.0 © OpenStreetMap contributors',
        osmBase: Object.fromEntries(Object.entries(source.pilots).map(([k, p]) => [k, p.osmBase])),
        accessed: source.meta.accessed,
      },
      {
        id: 'osm-map',
        file: 'src/lib/data/norrkoping-map.json',
        dataset: 'OpenStreetMap map snapshot',
        osmBase: map.meta.timestamp,
        license: 'ODbL-1.0',
      },
    ],
    unavailable: source.meta.checkedNotAvailable,
    types: TYPES,
    sectors: SECTORS,
    units:
      'x, z: scene units (1 = 25 m, SWEREF 99 TM scene frame); heights, ranges, offsets, occlusion: metres',
    pilots: PILOTS,
  },
  fixtures: [],
  coverage: {},
};

const trams = map.roads.filter((r) => r.kind === 'tram' || r.kind === 'rail');
const carRoads = map.roads.filter((r) => r.kind === 'road');

// Arena frame (as in src/lib/stadium/frame.ts) for the stadium entrance fixtures.
const pitchRing = map.areas.find((a) => a.id === 'way/100955051').rings[0];
let longest = [pitchRing[0], pitchRing[1]];
for (let i = 1; i < pitchRing.length; i++)
  if (dist(pitchRing[i], pitchRing[i - 1]) > dist(longest[1], longest[0]))
    longest = [pitchRing[i - 1], pitchRing[i]];
const rot = Math.atan2(longest[1][0] - longest[0][0], longest[1][1] - longest[0][1]);
const xs = pitchRing.map((p) => p[0]),
  zs = pitchRing.map((p) => p[1]);
const centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
const arena = (x, z) => [
  centre[0] + (x * Math.cos(rot) + z * Math.sin(rot)) / M,
  centre[1] + (-x * Math.sin(rot) + z * Math.cos(rot)) / M,
];

for (const pilot of PILOTS) {
  const { x0, x1, z0, z1 } = pilot.bounds;
  const inside = ([x, z]) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  const near = ([x, z], m) => x >= x0 - m && x <= x1 + m && z >= z0 - m && z <= z1 + m;
  const elements = source.pilots[pilot.id].elements;
  const buildings = map.buildings.filter((b) => b.rings[0].some((p) => near(p, 3)));
  const edges = [];
  for (const b of buildings)
    for (const ring of b.rings)
      for (let i = 0; i < ring.length - 1; i++) edges.push([ring[i], ring[i + 1]]);
  const localRoads = carRoads.filter((r) => near(r.a, 2) || near(r.b, 2));
  const localTrams = trams.filter((r) => near(r.a, 2) || near(r.b, 2));
  const entrances = elements
    .filter((e) => e.type === 'node' && e.tags.entrance)
    .map((e) => toScene(e.lat, e.lon));
  const fixtures = [];
  const rejected = {
    building: 0,
    carriageway: 0,
    tram: 0,
    entrance: 0,
    mappedCoverage: 0,
    duplicate: 0,
  };
  const conflict = (p, ownWay) => {
    for (const b of buildings) {
      if (b.rings[0].length < 3) continue;
      if (inRing(p, b.rings[0]) && !b.rings.slice(1).some((r) => inRing(p, r))) return 'building';
    }
    for (const [a, b] of edges) if (segDist(p, a, b).d < 0.6 / M) return 'building';
    for (const r of localRoads) {
      const { d } = segDist(p, r.a, r.b);
      if (d < r.width / 2 + 0.4 / M) return 'carriageway';
    }
    for (const r of localTrams) if (segDist(p, r.a, r.b).d < 1.2 / M) return 'tram';
    for (const e of entrances) if (dist(p, e) < 1.5 / M) return 'entrance';
    return null;
  };
  /** Bridge deck under a point: the nearest bridge road segment of the map within its half width. */
  const deckAt = (p) => {
    let best = null;
    for (const r of map.roads) {
      if (!r.bridge || !(near(r.a, 1) || near(r.b, 1))) continue;
      const { d, t } = segDist(p, r.a, r.b);
      if (d <= r.width / 2 + 1.0 / M && (!best || d < best.d))
        best = {
          d,
          segment: { way: r.way, a: r.a, b: r.b, yA: r.yA, yB: r.yB, t: Number(t.toFixed(4)) },
        };
    }
    return best?.segment ?? null;
  };
  /** 16 occlusion sectors, metres. */
  const occlusion = (p, rangeM) =>
    Array.from({ length: SECTORS }, (_, s) => {
      let m = rangeM;
      for (const f of [-1 / 3, 0, 1 / 3]) {
        const a = ((s + 0.5 + f) / SECTORS) * Math.PI * 2 - Math.PI;
        m = Math.min(m, rayHit(p, [Math.cos(a), Math.sin(a)], edges, rangeM / M) * M);
      }
      return Number(m.toFixed(2));
    });
  const add = (f) => {
    const type = TYPES[f.type];
    fixtures.push({
      ...f,
      x: Number(f.x.toFixed(4)),
      z: Number(f.z.toFixed(4)),
      heightM: type.heightM,
      cct: type.cct,
      candela: type.candela,
      rangeM: type.rangeM,
      profile: type.profile,
      occlusionM: occlusion([f.x, f.z], type.rangeM),
    });
  };

  // 1. Mapped OSM lamps.
  const ways = elements.filter((e) => e.type === 'way' && e.tags.highway && e.geometry);
  const nearestWay = (p) => {
    let best = null;
    for (const w of ways) {
      const pts = w.geometry.map(([la, lo]) => toScene(la, lo));
      for (let i = 1; i < pts.length; i++) {
        const { d } = segDist(p, pts[i - 1], pts[i]);
        if (!best || d < best.d) best = { d, way: w };
      }
    }
    return best;
  };
  const mapped = elements.filter(
    (e) =>
      e.type === 'node' &&
      (e.tags.highway === 'street_lamp' ||
        e.tags.man_made === 'street_lamp' ||
        e.tags.light_source),
  );
  for (const n of mapped) {
    const p = toScene(n.lat, n.lon);
    if (!inside(p)) continue;
    const w = nearestWay(p);
    const type = (w && typeFor(w.way.tags.highway, pilot.kind)) || 'street-bracket-6m';
    const deck = deckAt(p);
    add({
      id: `${pilot.id}:osm-node-${n.id}`,
      pilot: pilot.id,
      type,
      x: p[0],
      z: p[1],
      heading: null,
      mount: deck ? { kind: 'bridge', segment: deck } : { kind: 'ground' },
      placement: 'mapped',
      method:
        'OSM node position; type from nearest way ' +
        (w ? `${w.way.id} (highway=${w.way.tags.highway}, ${(w.d * M).toFixed(1)} m)` : '(none)'),
      uncertaintyM: 3,
      source: {
        dataset: 'osm-lighting-snapshot',
        element: `node/${n.id}`,
        version: n.version,
        timestamp: n.timestamp,
        tags: n.tags,
      },
      observed: ['position (mapped, not surveyed)', 'presence of a street lamp'],
      inferred: [
        'fixture type',
        'mounting height',
        'colour temperature',
        'light output',
        'distribution',
      ],
    });
  }
  const mappedPts = fixtures.map((f) => [f.x, f.z]);

  // 2. Estimated fixtures along lit=yes ways.
  const coverage = { litYes: 0, litNo: 0, litUnknown: 0, lengthLitYesM: 0, estimatedWays: [] };
  const estimated = [];
  for (const w of ways) {
    const lit = w.tags.lit;
    const pts = w.geometry.map(([la, lo]) => toScene(la, lo));
    const len = pts.slice(1).reduce((s, p, i) => s + dist(p, pts[i]) * M, 0);
    if (lit === 'yes') coverage.litYes++;
    else if (lit === 'no') coverage.litNo++;
    else coverage.litUnknown++;
    if (lit !== 'yes') continue;
    const type = typeFor(w.tags.highway, pilot.kind);
    if (!type) continue;
    coverage.lengthLitYesM += len;
    // Sidewalks and crossings mapped as separate footways are lit by the street lighting of the road
    // beside them (no own fixtures): footway=sidewalk|crossing, or a path whose vertices lie within
    // 10 m of a lit car road on average.
    if (PATH.has(w.tags.highway)) {
      const litRoads = ways.filter(
        (o) => o.tags.lit === 'yes' && (ROAD.has(o.tags.highway) || MINOR.has(o.tags.highway)),
      );
      const roadPts = litRoads.map((o) => o.geometry.map(([la, lo]) => toScene(la, lo)));
      const nearRoad = (p) => {
        let d = Infinity;
        for (const r of roadPts)
          for (let i = 1; i < r.length; i++) d = Math.min(d, segDist(p, r[i - 1], r[i]).d);
        return d;
      };
      const mean = pts.reduce((s, p) => s + nearRoad(p), 0) / pts.length;
      if (['sidewalk', 'crossing'].includes(w.tags.footway) || mean * M < 10) {
        coverage.sidewalksCoveredByRoad = (coverage.sidewalksCoveredByRoad ?? 0) + 1;
        continue;
      }
    }
    const T = TYPES[type];
    // Width from the map segments of the same way (scene units), else the tag, else 6 m.
    const mapSeg = map.roads.find((r) => r.way === w.id);
    const width = mapSeg ? mapSeg.width : Number(w.tags.width ?? 6) / M;
    const isPath = PATH.has(w.tags.highway);
    const bridge = w.tags.bridge === 'yes';
    const both = !isPath && (width * M >= 9 || bridge);
    const sideTag = w.tags.sidewalk ?? w.tags['sidewalk:both'] ?? '';
    const preferLeft = sideTag === 'left';
    const offset = isPath ? 1.2 / M : bridge ? width / 2 + 0.3 / M : width / 2 + 0.8 / M;
    // Walk the polyline; stations every spacing (staggered when lit on both sides).
    const step = (both ? T.spacingM / 2 : T.spacingM) / M;
    let carried = step / 2,
      k = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i],
        segLen = dist(a, b);
      if (segLen < 1e-9) continue;
      const dir = [(b[0] - a[0]) / segLen, (b[1] - a[1]) / segLen];
      let s = carried;
      for (; s <= segLen; s += step, k++) {
        const side = both ? (k % 2 ? 1 : -1) : preferLeft ? -1 : 1;
        // Normal to the right of travel direction (scene x east, z south): (-dz, dx).
        const nrm = [-dir[1] * side, dir[0] * side];
        let placed = null,
          reason = null;
        for (const shift of [0, 1.5, -1.5, 3, -3, 4, -4]) {
          const base = [a[0] + dir[0] * (s + shift / M), a[1] + dir[1] * (s + shift / M)];
          const p = [base[0] + nrm[0] * offset, base[1] + nrm[1] * offset];
          if (!inside(p)) {
            reason = 'outside';
            break;
          }
          reason = conflict(p, w.id);
          // On a bridge deck the lamp stands on the deck edge: the carriageway test uses the deck way itself.
          if (reason === 'carriageway' && bridge) reason = null;
          if (!reason) {
            placed = p;
            break;
          }
        }
        if (!placed) {
          if (reason && reason !== 'outside') rejected[reason]++;
          continue;
        }
        if (mappedPts.some((m) => dist(m, placed) < T.suppressM / M)) {
          rejected.mappedCoverage++;
          continue;
        }
        if (estimated.some((e) => dist([e.x, e.z], placed) < (0.55 * T.spacingM) / M)) {
          rejected.duplicate++;
          continue;
        }
        const deck = bridge ? deckAt(placed) : null;
        const f = {
          id: `${pilot.id}:est-way-${w.id}-${k}`,
          pilot: pilot.id,
          type,
          x: placed[0],
          z: placed[1],
          // The bracket arm points back to the way (towards the carriageway).
          heading: Math.atan2(-nrm[0], -nrm[1]),
          mount: deck ? { kind: 'bridge', segment: deck } : { kind: 'ground' },
          placement: 'estimated',
          method: `lit=yes on way/${w.id} (highway=${w.tags.highway}${bridge ? ', bridge' : ''}); ${both ? 'staggered both sides' : 'one side'}, spacing ${T.spacingM} m, ${(offset * M).toFixed(1)} m from the centreline`,
          uncertaintyM: Number((T.spacingM / 2).toFixed(1)),
          source: {
            dataset: 'osm-lighting-snapshot',
            element: `way/${w.id}`,
            version: w.version,
            timestamp: w.timestamp,
            tags: { lit: w.tags.lit, highway: w.tags.highway },
          },
          observed: ['the way is lit (lit=yes)'],
          inferred: [
            'pole position',
            'spacing',
            'fixture type',
            'mounting height',
            'colour temperature',
            'light output',
          ],
        };
        estimated.push(f);
        add(f);
      }
      carried = s - segLen;
    }
    coverage.estimatedWays.push(w.id);
  }

  // 3. Stadium entrances: separate ambient-night lighting (not the floodlights), estimated.
  if (pilot.kind === 'stadium') {
    const gate = elements.find(
      (e) => e.type === 'node' && e.tags.barrier === 'gate' && e.tags.ref === '3',
    );
    const entrancePosts = [];
    if (gate) {
      const g = toScene(gate.lat, gate.lon);
      entrancePosts.push({
        p: [g[0] + 1.6 / M, g[1]],
        why: `beside mapped gate node/${gate.id} (${gate.tags.description})`,
        element: `node/${gate.id}`,
      });
    }
    // Main entrance plaza in front of the west projection (OSM relation 1440621 outer way 27210829,
    // x 72.4 m) with the Gunnar Nordahl statue (node 13048742814): two posts flanking the plaza.
    for (const z of [-24, 33])
      entrancePosts.push({
        p: arena(80, z),
        why: 'flanking the west-stand main entrance plaza (arena x 80 m)',
        element: 'relation/1440621',
      });
    entrancePosts.forEach(({ p, why, element }, i) =>
      add({
        id: `${pilot.id}:est-entrance-${i}`,
        pilot: pilot.id,
        type: 'entrance-post-4m',
        x: p[0],
        z: p[1],
        heading: null,
        mount: { kind: 'ground' },
        placement: 'estimated',
        method: 'entrance lighting ' + why,
        uncertaintyM: 6,
        source: { dataset: 'osm-lighting-snapshot', element },
        observed: ['entrance location'],
        inferred: ['presence of entrance lighting', 'position', 'type', 'output'],
      }),
    );
  }
  coverage.lengthLitYesM = Math.round(coverage.lengthLitYesM);
  out.coverage[pilot.id] = {
    ...coverage,
    mapped: fixtures.filter((f) => f.placement === 'mapped').length,
    estimated: fixtures.filter((f) => f.placement === 'estimated').length,
    rejected,
  };
  out.fixtures.push(...fixtures);
}
// Runtime data (bundled, compact) and provenance (not bundled; tests and docs) share the fixture ids.
// OUT=<dir> writes both files elsewhere (the regression test regenerates and compares).
const RUNTIME = [
  'id',
  'pilot',
  'type',
  'x',
  'z',
  'heading',
  'mount',
  'placement',
  'heightM',
  'cct',
  'candela',
  'rangeM',
  'profile',
  'occlusionM',
];
const runtime = {
  meta: {
    generated: out.meta.generated,
    generator: out.meta.generator,
    provenance: 'src/lib/data/streetlights-provenance.json',
    sources: out.meta.sources.map(({ id, dataset, license, osmBase }) => ({
      id,
      dataset,
      license,
      osmBase,
    })),
    types: out.meta.types,
    sectors: out.meta.sectors,
    units: out.meta.units,
    pilots: out.meta.pilots,
  },
  fixtures: out.fixtures.map((f) => Object.fromEntries(RUNTIME.map((k) => [k, f[k]]))),
};
const provenance = {
  meta: { ...out.meta, coverage: out.coverage },
  fixtures: out.fixtures.map((f) => ({
    id: f.id,
    method: f.method,
    uncertaintyM: f.uncertaintyM,
    source: f.source,
    observed: f.observed,
    inferred: f.inferred,
  })),
};
const dir = process.env.OUT ?? 'src/lib/data';
fs.writeFileSync(dir + '/streetlights.json', JSON.stringify(runtime) + '\n');
fs.writeFileSync(dir + '/streetlights-provenance.json', JSON.stringify(provenance, null, 1) + '\n');
console.log(JSON.stringify(out.coverage, null, 1));
console.log('fixtures', out.fixtures.length);
