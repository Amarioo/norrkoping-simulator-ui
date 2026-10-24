// Lighting Phase L1: the citywide STRESS SET for scale tests — every preliminary L0 station
// (docs/lighting-city-l0/data/city-lighting-l0.json) turned into a renderable fixture record in the
// A1–A3 runtime format (src/lib/data/streetlights-a*.json), so the real renderer can be loaded with
// ≈ 25 000 lamps.
//
// NOT runtime data and NOT a placement: positions are L0 centreline stations moved sideways to an
// approximate kerb (half the rendered road width + 0.8 m, always to the right of the way direction;
// paths + 0.6 m), brackets aim back at the road, lanterns have no heading. Occlusion sectors are cast
// against building footprints like the corridor generator (16 sectors × 3 rays, metres from the
// emitter); bridge decks, water, rails and seams are ignored. All fixtures are ground-mounted
// estimates with ID `estimate:lighting-l1-stress-v0:way/<osm way>:s<n>`. Phase L2 does the real kerb
// placement. Deterministic: no randomness; records sorted by ID.
import fs from 'node:fs';
import { SCENE_REFERENCE, swerefToScene } from '../../src/lib/geo/sweref99tm.js';
import { emitterPosition, type FixtureRecord } from '../../src/lib/lighting/fixtures';
import { SECTORS } from '../../src/lib/lighting/cityLights';
import type { A1Data } from '../../src/lib/lighting/corridorRegistry';

export const STRESS_INPUTS = {
  l0: 'docs/lighting-city-l0/data/city-lighting-l0.json',
  map: 'src/lib/data/norrkoping-map.json',
  types: 'src/lib/data/streetlights.json',
  source: 'scripts/data/lighting-city-source.json',
} as const;
export const STRESS_OUTPUT = 'work/lighting-city-l1/l0-stress-set.json';
export const STRESS_IDENTITY = {
  dataset: 'l1-stress-set',
  generator: { script: 'scripts/lighting-l1/stress-set.ts', version: 'lighting-l1-stress-v0' },
} as const;

type P = [number, number];
const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const round = (v: number, d: number) => Number(v.toFixed(d));

function rayHit(o: P, dir: P, edges: [P, P][], max: number) {
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

export function buildStressSet() {
  const l0 = read(STRESS_INPUTS.l0);
  const map = read(STRESS_INPUTS.map);
  const types = read(STRESS_INPUTS.types).meta.types as Record<
    string,
    { heightM: number; cct: number; candela: number; rangeM: number; profile: number }
  >;
  const M = SCENE_REFERENCE.metresPerUnit;
  const typeNames: string[] = l0.meta.formats.stationTypes;
  const wayGeometry = new Map<number, number[]>(
    (read(STRESS_INPUTS.source).ways as [number, unknown, number, number, number[]][]).map((w) => [
      w[0],
      w[4],
    ]),
  );

  // Rendered road segments per OSM way (scene units).
  const segs = new Map<number, { a: P; b: P; width: number }[]>();
  for (const r of map.roads as { a: P; b: P; width: number; way: number; kind: string }[]) {
    if (r.kind !== 'road' && r.kind !== 'path') continue;
    let l = segs.get(r.way);
    if (!l) segs.set(r.way, (l = []));
    l.push({ a: r.a, b: r.b, width: r.width });
  }
  // Building edges in a 2-unit (50 m) grid.
  const CELL = 2;
  const grid = new Map<string, [P, P][]>();
  for (const b of map.buildings as { rings: P[][] }[])
    for (const ring of b.rings)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          c = ring[(i + 1) % ring.length];
        for (let x = Math.floor(Math.min(a[0], c[0]) / CELL); x <= Math.floor(Math.max(a[0], c[0]) / CELL); x++)
          for (let z = Math.floor(Math.min(a[1], c[1]) / CELL); z <= Math.floor(Math.max(a[1], c[1]) / CELL); z++) {
            const k = `${x},${z}`;
            let l = grid.get(k);
            if (!l) grid.set(k, (l = []));
            l.push([a, c]);
          }
      }
  const edgesNear = (p: P, r: number) => {
    const out = new Set<[P, P]>();
    for (let x = Math.floor((p[0] - r) / CELL); x <= Math.floor((p[0] + r) / CELL); x++)
      for (let z = Math.floor((p[1] - r) / CELL); z <= Math.floor((p[1] + r) / CELL); z++)
        for (const e of grid.get(`${x},${z}`) ?? []) out.add(e);
    return [...out];
  };

  const perWay = new Map<number, number>();
  let offsetCount = 0,
    centreline = 0;
  const fixtures = (l0.stations as [number, number, number, number, number][]).map(
    ([e, n, ti, way]) => {
      const type = typeNames[ti];
      const t = types[type];
      const k = perWay.get(way) ?? 0;
      perWay.set(way, k + 1);
      let [x, z] = swerefToScene(SCENE_REFERENCE, e, n) as P;
      let heading: number | null = null;
      // Nearest rendered segment of the same way: move to the right-hand kerb.
      let best: { d: number; dir: P; width: number } | null = null;
      for (const s of segs.get(way) ?? []) {
        const dx = s.b[0] - s.a[0],
          dz = s.b[1] - s.a[1],
          l2 = dx * dx + dz * dz;
        if (!l2) continue;
        const u = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / l2));
        const d = Math.hypot(x - s.a[0] - u * dx, z - s.a[1] - u * dz);
        if (!best || d < best.d) best = { d, dir: [dx / Math.sqrt(l2), dz / Math.sqrt(l2)], width: s.width };
      }
      if (best && best.d < 2 / M) {
        const right: P = [-best.dir[1], best.dir[0]];
        const off = best.width / 2 + (t.profile === 1 ? 0.6 : 0.8) / M;
        x += right[0] * off;
        z += right[1] * off;
        if (t.profile !== 1) heading = round(Math.atan2(-right[0], -right[1]), 6);
        offsetCount++;
      } else {
        // Way not in the rendered map (newer snapshot): stay on the centreline; a bracket still needs
        // an orientation, taken across the L0 way geometry (scripts/data/lighting-city-source.json).
        centreline++;
        if (t.profile !== 1) {
          const g = wayGeometry.get(way) ?? [];
          let dir: P = [1, 0],
            bd = Infinity;
          for (let i = 0; i + 3 < g.length; i += 2) {
            const [ax, az] = swerefToScene(SCENE_REFERENCE, g[i], g[i + 1]) as P;
            const [bx, bz] = swerefToScene(SCENE_REFERENCE, g[i + 2], g[i + 3]) as P;
            const dx = bx - ax,
              dz = bz - az,
              l2 = dx * dx + dz * dz;
            if (!l2) continue;
            const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
            const d = Math.hypot(x - ax - u * dx, z - az - u * dz);
            if (d < bd) {
              bd = d;
              dir = [dx / Math.sqrt(l2), dz / Math.sqrt(l2)];
            }
          }
          heading = round(Math.atan2(dir[1], -dir[0]), 6);
        }
      }
      x = round(x, 4);
      z = round(z, 4);
      const [ex, , ez] = emitterPosition({ type, x, z, heading } as FixtureRecord, 0, M);
      const edges = edgesNear([ex, ez], t.rangeM / M);
      const occlusionM = Array.from({ length: SECTORS }, (_, s) => {
        let m = t.rangeM;
        for (const f of [-1 / 3, 0, 1 / 3]) {
          const a = ((s + 0.5 + f) / SECTORS) * Math.PI * 2 - Math.PI;
          m = Math.min(m, rayHit([ex, ez], [Math.cos(a), Math.sin(a)], edges, t.rangeM / M) * M);
        }
        return round(m, 2);
      });
      return {
        id: `estimate:${STRESS_IDENTITY.generator.version}:way/${way}:s${k}`,
        zone: 'L0',
        type,
        x,
        z,
        heading,
        mount: { kind: 'ground' as const },
        placement: 'estimated' as const,
        heightM: t.heightM,
        cct: t.cct,
        candela: t.candela,
        rangeM: t.rangeM,
        profile: t.profile,
        occlusionM,
      };
    },
  );
  fixtures.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const data = {
    meta: {
      note: 'Lighting Phase L1 stress set: L0 preliminary stations at an approximate kerb. Test load only, not runtime data or a placement.',
      sources: [
        {
          id: STRESS_IDENTITY.dataset,
          dataset: 'L0 preliminary stations (docs/lighting-city-l0/data/city-lighting-l0.json)',
          license: 'ODbL-1.0 © OpenStreetMap contributors; SCB CC0',
          osmBase: l0.meta.sources.osm.osmBase,
        },
      ],
      counts: { fixtures: fixtures.length, atKerb: offsetCount, atCentreline: centreline },
    },
    fixtures,
  };
  return data as unknown as A1Data & { meta: typeof data.meta };
}
