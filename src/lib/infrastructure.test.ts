/**
 * Step 3.5 regression tests: terrain, roads, rails, bridges, water and buildings as one environment.
 *
 * The checks are src/lib/infraDiagnostics.ts (also run map-wide by scripts/geo/infra-diagnose.test.ts
 * and drawn by the dev overlay `?inspect=infra`). Bounds are the measured state of 2026-10-18 with a
 * small margin; the pre-Step-3.5 values are in docs/claude-progress.md.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { cityMap, type MapRoad } from './mapModel';
import { terrain, ROAD_SURFACE } from './terrain';
import { buildCityLayers, networkPieces, surfaceAt, type CityLayers } from './cityMesh';
import {
  belowTerrain,
  buildingsInWater,
  dataChecks,
  deckClearance,
  junctionSteps,
  profiles,
  shorelines,
} from './infraDiagnostics';
import { WATER_REACHES, waterSurfaces, waterFalls, drapedWater, dryBanks, waterSurfaceAt } from './waterReaches';
import transport from './data/transport-network.json';
import bridgeProfiles from './data/bridge-profiles.json';
import profileControl from './geo/network-profile-control.json';

const M = terrain.data.reference.metresPerUnit;
const ringArea = (ring: number[][]) => {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s / 2);
};
const polygonArea = (rings: number[][][]) => ringArea(rings[0]) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0);

describe('ground-level infrastructure on the terrain', () => {
  it('never draws an at-grade running surface below the terrain', () => {
    // Draped pieces (ordinary ways and bridge approaches) are the terrain plus a non-negative offset.
    let n = 0;
    for (const whole of cityMap.roads) {
      if (whole.kind === 'stream' || whole.tunnel) continue;
      for (const r of networkPieces(whole)) {
        if (r.linearProfile) continue;
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const p: [number, number] = [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];
          expect(surfaceAt(r, t, p, ROAD_SURFACE)).toBeGreaterThan(terrain.groundHeight(...p) - 1e-6);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(400_000);
  });

  it('keeps decks and spans above the terrain (before: 523 pieces, worst 5.27 m)', () => {
    const issues = belowTerrain();
    // What remains are deck edges beside quay walls the 5 m terrain grid cannot represent and, since
    // Batch C, the uphill edge of bridged approaches on side slopes (level cross-section, median 0.1 m).
    expect(issues.length).toBeLessThanOrEqual(380);
    expect(issues.filter((i) => i.value > 0.3).length).toBeLessThanOrEqual(30);
    expect(Math.max(...issues.map((i) => i.value))).toBeLessThan(1.3);
    const vehicles = issues.filter((i) => !i.detail.startsWith('path'));
    expect(Math.max(0, ...vehicles.map((i) => i.value))).toBeLessThan(0.6);
  });

  it('joins every junction into one surface, apart from the documented two-level nodes', () => {
    // OSM nodes shared by a lifted land bridge and a way below it (Step 4: bridge reconstruction).
    const twoLevel = ['287129602', '59432617', '954899965', '4384861', '24507534'];
    const steps = junctionSteps();
    expect(steps.length).toBeLessThanOrEqual(5);
    for (const s of steps) expect(twoLevel.some((w) => s.detail.includes(w))).toBe(true);
  });

  it('bridges DTM trenches instead of dropping ways into them', () => {
    const { issues, grades } = profiles();
    // Roads, rails and tram tracks dipping > 1.5 m within 25 m (not under a bridge). What remains are
    // small roads in rolling terrain; before Step 3.5 motorways fell 5-6 m into underpass trenches.
    const sags = issues.filter((i) => i.kind === 'sag' && !i.detail.startsWith('path'));
    expect(sags.length).toBeLessThanOrEqual(20);
    expect(Math.max(...sags.map((s) => s.value))).toBeLessThan(3.2);
    expect(sags.filter((s) => s.value > 2.5).length).toBeLessThanOrEqual(4);
    const p99 = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(0.99 * (v.length - 1))];
    expect(p99(grades.rail)).toBeLessThan(5); // before: 7.2 %
    expect(p99(grades.road)).toBeLessThan(9.5); // before: 9.9 %
  });

  it('places engineered spans only on at-grade ways, and ways meeting inside a span meet it at its level', () => {
    const info = bridgeProfiles.spanInfo;
    expect(info.length).toBeGreaterThan(60);
    const ends = new Map<string, { r: (typeof cityMap.roads)[number]; t: number }[]>();
    for (const r of cityMap.roads)
      for (const [p, t] of [
        [r.a, 0],
        [r.b, 1],
      ] as const) {
        const k = `${p[0]},${p[1]}`;
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k)!.push({ r, t });
      }
    let pieces = 0,
      inner = 0;
    for (const r of cityMap.roads) {
      if (!r.spans) continue;
      expect(r.bridge || r.tunnel || r.linearProfile).toBeFalsy();
      for (const s of r.spans) {
        pieces++;
        expect(s.t1).toBeGreaterThan(s.t0);
        // Batch C: a junction inside a span is allowed; every way there is drawn at the span's level.
        if (s.t1 >= 1 - 1e-9) {
          const here = ends.get(`${r.b[0]},${r.b[1]}`)!.filter((e) => ['road', 'path', 'rail', 'tram'].includes(e.r.kind) && !e.r.bridge);
          // Documented two-level nodes (lifted land bridges over a way below; see the junction test).
          const twoLevel = [287129602, 59432617, 954899965, 4384861, 24507534];
          if (here.length > 2 && !here.some((e) => twoLevel.includes(e.r.way ?? 0))) {
            inner++;
            const h = here.map((e) => surfaceAt(e.r, e.t, e.t ? e.r.b : e.r.a, 0) * M);
            expect(Math.max(...h) - Math.min(...h), `${r.b} ways ${here.map((e) => e.r.way)}`).toBeLessThan(0.05);
          }
        }
      }
    }
    expect(pieces).toBeGreaterThan(100);
    expect(inner).toBeGreaterThan(0);
  });
});

describe('vehicles on decks, approaches and spans', () => {
  const segments = new Map<string, MapRoad>();
  for (const r of cityMap.roads) segments.set(`${r.a[0]},${r.a[1]}|${r.b[0]},${r.b[1]}`, r);
  const find = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    segments.get(`${a.x},${a.z}|${b.x},${b.z}`) ??
    (() => {
      const r = segments.get(`${b.x},${b.z}|${a.x},${a.z}`);
      // A segment absorbed into a breakline patch has no spans in the map model (mapModel.ts), so its reversed
      // copy must not regain them from the profiles (Step 5.1: integrated approaches traversed backwards).
      return r && { ...r, a: r.b, b: r.a, yA: r.yB, yB: r.yA, spans: r.spans && terrain.spans(r.b, r.a) };
    })();

  it('drive cars 5 cm above the drawn surface where the profile is not the plain terrain', () => {
    const nodes = transport.nodes as { x: number; y: number; z: number }[];
    let checked = 0;
    for (const e of transport.edges as { from: number; to: number }[]) {
      const a = nodes[e.from],
        b = nodes[e.to];
      const special =
        terrain.spans([a.x, a.z], [b.x, b.z]) ||
        terrain.bridgeHeight(a.x, a.z, a.y) !== undefined ||
        terrain.bridgeHeight(b.x, b.z, b.y) !== undefined;
      if (!special) continue;
      const r = find(a, b);
      if (!r) continue;
      for (const t of [0, 0.3, 0.5, 0.7, 1]) {
        const p: [number, number] = [a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t];
        const car = terrain.profileHeight([a.x, a.y, a.z], [b.x, b.y, b.z], t) + 0.008;
        expect((car - surfaceAt(r, t, p, ROAD_SURFACE)) * M).toBeCloseTo(0.05, 5);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('keep trams and trains on the span surface itself (rail head added by the vehicle contract)', () => {
    let checked = 0;
    for (const route of cityMap.transitRoutes)
      for (let i = 1; i < route.points.length; i++) {
        const [p, q] = [route.points[i - 1], route.points[i]];
        const r = find({ x: p[0], z: p[2] }, { x: q[0], z: q[2] });
        if (!r?.spans) continue;
        for (const t of [0.2, 0.5, 0.8]) {
          const at: [number, number] = [p[0] + (q[0] - p[0]) * t, p[2] + (q[2] - p[2]) * t];
          expect(terrain.profileHeight(p, q, t) - surfaceAt(r, t, at, 0)).toBeCloseTo(0, 9);
          checked++;
        }
      }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('water at measured levels', () => {
  let layers: CityLayers;
  beforeAll(() => {
    layers = buildCityLayers(['terrain']);
  }, 120_000);

  it('uses the LiDAR class 9 level of each reach, the flattened DTM only as a flagged fallback', () => {
    for (const r of WATER_REACHES.values()) {
      if (r.source === 'lidar-class9')
        expect(Math.abs(r.levelMetres - (r.dtmLevelMetres ?? r.levelMetres))).toBeLessThan(0.25);
      else if (r.source === 'sea-smhi-mean-2021-2025') {
        expect(r.levelMetres).toBe(0.14);
        expect(r.scanDayMetres).toBeDefined();
      } else expect(r.source).toBe('dtm-hydroflattened');
    }
    // Motala ström is several reaches: the falls in the centre step down from 22 m to the sea.
    const levels = [...new Set(waterSurfaces.map((s) => s.reach.levelMetres))];
    expect(levels.filter((l) => l > 10).length).toBeGreaterThanOrEqual(4);
    for (const f of waterFalls) expect(f.upper - f.lower).toBeGreaterThan(0.05 / M);
  });

  it('cuts every OSM water polygon into pieces without gaps or overlaps', () => {
    const areas = new Map(cityMap.areas.filter((a) => a.kind === 'water').map((a) => [a.id, a]));
    const covered = new Map<string, number>();
    for (const s of [...waterSurfaces, ...drapedWater, ...dryBanks])
      covered.set(s.area, (covered.get(s.area) ?? 0) + polygonArea(s.rings));
    for (const [id, sum] of covered) {
      const osm = polygonArea(areas.get(id)!.rings.map((r) => r.slice(0, -1)));
      expect(Math.abs(sum - osm) / osm).toBeLessThan(0.005);
    }
  });

  it('draws measured water flat at its level', () => {
    const water = layers.water as BufferGeometry[];
    let flat = 0;
    for (const g of water) {
      const p = g.getAttribute('position').array;
      for (let o = 0; o < p.length; o += 9) {
        const x = (p[o] + p[o + 3] + p[o + 6]) / 3,
          z = (p[o + 2] + p[o + 5] + p[o + 8]) / 3;
        if (p[o + 1] !== p[o + 4] || p[o + 4] !== p[o + 7]) continue; // falls and draped streams
        // Slivers (< 0.5 m2) can have their centroid on the edge shared with the neighbouring reach.
        const twice = Math.abs((p[o + 3] - p[o]) * (p[o + 8] - p[o + 2]) - (p[o + 6] - p[o]) * (p[o + 5] - p[o + 2]));
        if (twice * M * M < 1) continue;
        const s = waterSurfaceAt(x, z);
        if (!s) continue;
        expect(p[o + 1]).toBeCloseTo(s.y, 5);
        flat++;
      }
    }
    expect(flat).toBeGreaterThan(5000);
  });

  it('keeps every deck clear of the water (before: 75 decks, worst 1.68 m under it)', () => {
    expect(deckClearance()).toEqual([]);
  });

  it('meets the land at the shoreline', () => {
    const { issues, gaps } = shorelines();
    const sorted = [...gaps].sort((a, b) => a - b);
    // Land lower than the water next to it remains only at dam crests and harbour piers.
    expect(sorted[Math.floor(0.05 * sorted.length)]).toBeGreaterThan(-0.15);
    expect(issues.length).toBeLessThanOrEqual(200);
  });

  it('keeps buildings out of the water, apart from structures standing in the river', () => {
    const allowed = ['way/1355629338'];
    for (const b of buildingsInWater()) expect(allowed.some((id) => b.detail.startsWith(id))).toBe(true);
  }, 30_000); // samples every building footprint every 2 m: about 5 s
});

describe('data integrity', () => {
  it('reproduces the network heights shared with TerrainService.kt (NetworkProfileTest.kt)', () => {
    expect(profileControl.revision).toBe(terrain.data.revision);
    let n = 0;
    for (const rows of Object.values(profileControl.groups))
      for (const v of rows) {
        expect(terrain.profileHeight(v.slice(0, 3), v.slice(3, 6), v[6])).toBeCloseTo(v[7], 9);
        n++;
      }
    expect(n).toBeGreaterThan(1200);
  });

  it('has one owner per bridge structure and terrain under every network node', () => {
    expect(dataChecks()).toEqual([]);
  });

  it('profiles both ends of every bridge segment (the linear deck contract)', () => {
    for (const r of cityMap.roads.filter((r) => r.bridge && r.kind !== 'stream'))
      expect(r.linearProfile).toBe(true);
  });
});
