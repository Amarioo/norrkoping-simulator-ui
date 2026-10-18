/**
 * Step 2 regression tests: ground-level surfaces lie on the measured Lantmäteriet terrain.
 *
 * Reference heights in geo/elevation-control.json are the native 1 m DTM (bilinear, RH2000) at
 * points chosen away from bridges, tunnels and lifted infrastructure (scripts/geo/elevation_samples.py).
 * The remaining differences are the error of the adaptive terrain mesh (Step 3, surfaceMesh.ts; was
 * the 10 m / 40 m grid); the bias (formerly +0.6 m to +2.7 m of artificial lift) must stay at zero.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import fixture from './geo/elevation-control.json';
import { buildCityLayers, buildingBase, LAYER_RANK, type CityLayers } from './cityMesh';
import { cityMap, type MapRoad } from './mapModel';
import { LEGACY_LEVELS, ROAD_SURFACE, terrain } from './terrain';
import transport from './data/transport-network.json';
import { cityJson } from './cityData';

const M = terrain.data.reference.metresPerUnit;
const metres = (y: number) => y * M + terrain.data.reference.verticalOriginMetres;

/** Heights of all triangles covering each point (vertical rays through the built geometry). */
function raycast(geometries: BufferGeometry[], points: number[][]) {
  const CELL = 0.25,
    cells = new Map<number, number[]>(),
    key = (i: number, j: number) => (i + 4096) * 8192 + j + 4096;
  points.forEach(([x, z], n) => {
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    cells.set(k, [...(cells.get(k) ?? []), n]);
  });
  const hits: number[][] = points.map(() => []),
    ranks: number[][] = points.map(() => []);
  for (const g of geometries) {
    const p = g.getAttribute('position').array,
      uv = g.getAttribute('uv').array;
    for (let o = 0; o < p.length; o += 9) {
      const [ax, az, bx, bz, cx, cz] = [p[o], p[o + 2], p[o + 3], p[o + 5], p[o + 6], p[o + 8]];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-14) continue;
      for (
        let i = Math.floor(Math.min(ax, bx, cx) / CELL);
        i <= Math.floor(Math.max(ax, bx, cx) / CELL);
        i++
      )
        for (
          let j = Math.floor(Math.min(az, bz, cz) / CELL);
          j <= Math.floor(Math.max(az, bz, cz) / CELL);
          j++
        )
          for (const n of cells.get(key(i, j)) ?? []) {
            const [x, z] = points[n];
            const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det,
              l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
            if (l1 < -1e-9 || l2 < -1e-9 || 1 - l1 - l2 < -1e-9) continue;
            hits[n].push(l1 * p[o + 1] + l2 * p[o + 4] + (1 - l1 - l2) * p[o + 7]);
            ranks[n].push(uv[(o / 3) * 2]);
          }
    }
  }
  return { hits, ranks };
}
const summary = (e: number[]) => ({
  mean: e.reduce((s, v) => s + v, 0) / e.length,
  rmse: Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length),
});

let layers: CityLayers;
beforeAll(() => {
  layers = buildCityLayers(['terrain', 'network', 'buildings']);
}, 120_000);

describe('ground-level surfaces on the measured terrain', () => {
  it('draws ordinary roads, paths and track ballast exactly on the rendered terrain', () => {
    // The fixture keeps 25 m from bridges, tunnels and lifts; engineered spans (Step 3.5) bridge DTM
    // trenches on purpose, so points within 10 m of one are not ordinary either.
    const spanned = cityMap.roads.flatMap((r) =>
      (r.spans ?? []).map((s) => [
        [r.a[0] + (r.b[0] - r.a[0]) * s.t0, r.a[1] + (r.b[1] - r.a[1]) * s.t0],
        [r.a[0] + (r.b[0] - r.a[0]) * s.t1, r.a[1] + (r.b[1] - r.a[1]) * s.t1],
      ]),
    );
    const nearSpan = (x: number, z: number) =>
      spanned.some(([a, b]) => {
        const dx = b[0] - a[0],
          dz = b[1] - a[1],
          t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < 0.4;
      });
    const points = fixture.network.filter((p) => p.kind !== 'tram' && !nearSpan(p.x, p.z));
    const { hits } = raycast(
      [...layers.roads!, ...layers.markings!],
      points.map((p) => [p.x, p.z]),
    );
    let checked = 0;
    points.forEach((p, i) => {
      const ground = terrain.groundHeight(p.x, p.z);
      // Every drawn running surface at an ordinary point is the terrain itself; only rails rise above it.
      for (const h of hits[i]) {
        expect(h).toBeGreaterThan(ground - 1e-4);
        if (h > ground + 1e-4) expect(h - ground).toBeCloseTo(0.016 - ROAD_SURFACE, 4);
      }
      if (hits[i].length) checked++;
    });
    expect(checked / points.length).toBeGreaterThan(0.95);
  });

  it('matches the native DTM within the terrain-mesh error, with no systematic lift', () => {
    const { hits } = raycast(
      [...layers.roads!, ...layers.markings!],
      fixture.network.map((p) => [p.x, p.z]),
    );
    // Before Step 2: mean +2.46 m (road/path), +1.9 m (ballast), RMSE 2.1–2.6 m.
    // Before Step 3 (10 m / 40 m grid): RMSE 0.56 / 0.67 / 0.78 / 0.14 m; adaptive mesh 0.20 / 0.23 /
    // 0.20 / 0.16 m (full Step 2 sample set, scripts/geo/measure-elevation.test.ts).
    const limits: Record<string, { rmse: number }> = {
      road: { rmse: 0.3 },
      path: { rmse: 0.35 },
      rail: { rmse: 0.35 },
      tram: { rmse: 0.25 },
    };
    for (const kind of Object.keys(limits)) {
      const errors = fixture.network
        .map((p, i) => ({
          p,
          h: hits[i].filter((h) => h <= terrain.groundHeight(p.x, p.z) + 1e-4),
        }))
        .filter(({ p, h }) => p.kind === kind && h.length)
        .map(({ p, h }) => metres(Math.max(...h)) - p.dtm);
      const { mean, rmse } = summary(errors);
      expect(errors.length).toBeGreaterThan(kind === 'tram' ? 100 : 300);
      expect(Math.abs(mean)).toBeLessThan(kind === 'rail' ? 0.3 : 0.15);
      expect(rmse).toBeLessThan(limits[kind].rmse);
    }
  });

  it('lays land cover on the terrain and orders overlaps by depth rank, not by height', () => {
    const { hits, ranks } = raycast(
      layers.land!,
      fixture.cover.map((c) => [c.x, c.z]),
    );
    const byKind: Record<string, number[]> = {};
    fixture.cover.forEach((c, i) => {
      const ground = terrain.groundHeight(c.x, c.z);
      for (const h of hits[i]) expect(Math.abs(h - ground)).toBeLessThan(1e-4);
      if (hits[i].length) (byKind[c.kind] ??= []).push(metres(Math.max(...hits[i])) - c.dtm);
      for (const r of ranks[i]) expect(r).toBeLessThan(LAYER_RANK.kerb);
    });
    // Before Step 2: +0.54 m (residential) to +1.48 m (apron) above the DTM.
    for (const [kind, errors] of Object.entries(byKind)) {
      const { mean, rmse } = summary(errors);
      expect(Math.abs(mean), kind).toBeLessThan(0.25);
      // Before Step 3 (10 m / 40 m grid): wood 1.24, plain ground 0.86, others 0.11–0.72 m RMSE.
      expect(rmse, kind).toBeLessThan(kind === 'wood' ? 0.8 : kind === 'ground' ? 0.65 : 0.45);
    }
    expect(Object.keys(byKind).length).toBe(10);
  });

  it('stands buildings on the lowest ground of their footprint', () => {
    const byId = new Map(cityMap.buildings.map((b) => [b.id, b]));
    const gaps: number[] = [];
    for (const s of fixture.buildings) {
      const b = byId.get(s.id)!;
      const base = buildingBase(b);
      // Exact for the rendered surface: never above any footprint vertex or interior grid node.
      for (const [x, z] of b.rings[0])
        expect(base).toBeLessThanOrEqual(terrain.groundHeight(x, z) + 1e-9);
      gaps.push(metres(base) - s.dtmMin);
    }
    // Before Step 2: walls started 1.97 m above the footprint minimum on average; 96.7 % > 1 m.
    // Before Step 3: RMSE 0.54 m, 2.4 % > 1 m; adaptive mesh: RMSE 0.23 m, 0.1 % > 1 m (all buildings).
    const { mean, rmse } = summary(gaps);
    expect(Math.abs(mean)).toBeLessThan(0.1);
    expect(rmse).toBeLessThan(0.35);
    expect(gaps.filter((g) => g > 1).length / gaps.length).toBeLessThan(0.01);
    expect(gaps.filter((g) => g < -1).length / gaps.length).toBeLessThan(0.01);
  });

  it('keeps ordinary road, path and track connections continuous', async () => {
    // Mapped levels: segments meeting at a node on the same level share the legacy key (x, z, y).
    const source = await cityJson<{ roads: MapRoad[] }>('map');
    const surface = new Map<string, number[]>(),
      atNode = new Map<string, number[]>();
    cityMap.roads.forEach((r, i) => {
      if (r.kind === 'stream') return;
      for (const [p, y, legacy] of [
        [r.a, r.yA, source.roads[i].yA],
        [r.b, r.yB, source.roads[i].yB],
      ] as const) {
        const key = `${p[0]},${p[1]},${legacy.toFixed(3)}`;
        surface.set(key, [...(surface.get(key) ?? []), y + ROAD_SURFACE]);
        atNode.set(`${p[0]},${p[1]}`, [...(atNode.get(`${p[0]},${p[1]}`) ?? []), y]);
      }
    });
    let shared = 0;
    for (const ys of surface.values())
      if (ys.length > 1) {
        shared++;
        // Roads, paths and track meeting at a node, including bridge abutments, share one height.
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-9);
      }
    expect(shared).toBeGreaterThan(30000);
    // Only 6 OSM nodes join a lifted land bridge to a path or road below (two levels, Step 4).
    const twoLevel = [...atNode.values()].filter((ys) => Math.max(...ys) - Math.min(...ys) > 1e-6);
    expect(twoLevel.length).toBeLessThanOrEqual(6);
    // Ordinary nodes carry no lift at all. (Bridge approaches, with one profiled end, and engineered
    // spans are checked in infrastructure.test.ts.)
    const ordinary = cityMap.roads.filter(
      (r, i) =>
        !r.linearProfile &&
        !r.bridge &&
        !r.tunnel &&
        !r.spans &&
        terrain.bridgeHeight(r.a[0], r.a[1], source.roads[i].yA) === undefined &&
        terrain.bridgeHeight(r.b[0], r.b[1], source.roads[i].yB) === undefined,
    );
    expect(ordinary.length).toBeGreaterThan(70000);
    for (const r of ordinary.slice(0, 5000))
      if (r.kind !== 'rail' && r.kind !== 'tram')
        expect(r.yA + ROAD_SURFACE).toBeCloseTo(terrain.groundHeight(...r.a), 9);
  });

  it('keeps vehicles on their running surfaces', () => {
    // Cars (CityTransport.kt): profileHeight + 0.008 = 5 cm above the drawn street surface.
    const nodes = transport.nodes as { x: number; y: number; z: number }[];
    for (const e of (transport.edges as { from: number; to: number }[]).slice(0, 3000)) {
      const a = nodes[e.from],
        b = nodes[e.to];
      // Decks, bridge approaches and engineered spans: infrastructure.test.ts.
      if (
        terrain.bridgeHeight(a.x, a.z, a.y) !== undefined ||
        terrain.bridgeHeight(b.x, b.z, b.y) !== undefined ||
        terrain.spans([a.x, a.z], [b.x, b.z])
      )
        continue;
      for (const t of [0, 0.5, 1]) {
        const x = a.x + (b.x - a.x) * t,
          z = a.z + (b.z - a.z) * t;
        const car = terrain.profileHeight([a.x, a.y, a.z], [b.x, b.y, b.z], t) + 0.008;
        expect((car - terrain.groundHeight(x, z)) * M).toBeCloseTo(0.05, 6);
      }
    }
    // Trams and trains (RailTraffic.kt) off bridges: ~5 cm above the rail top, as before Step 2.
    const gaps: number[] = [];
    const track = cityMap.roads.filter(
      (r) => (r.kind === 'rail' || r.kind === 'tram') && !r.bridge,
    );
    for (const route of cityMap.transitRoutes)
      for (let i = 1; i < route.points.length; i += 3) {
        const a = route.points[i - 1],
          b = route.points[i];
        const x = (a[0] + b[0]) / 2,
          z = (a[2] + b[2]) / 2;
        let best: MapRoad | undefined,
          d = 0.02;
        for (const r of track) {
          const dx = r.b[0] - r.a[0],
            dz = r.b[1] - r.a[1];
          const t = Math.max(
            0,
            Math.min(1, ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / (dx * dx + dz * dz)),
          );
          const dd = Math.hypot(r.a[0] + dx * t - x, r.a[1] + dz * t - z);
          if (dd < d) [d, best] = [dd, r];
        }
        if (!best || best.linearProfile) continue;
        const t =
          Math.hypot(x - best.a[0], z - best.a[1]) /
          Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1]);
        const rail = best.yA + (best.yB - best.yA) * t + 0.016;
        gaps.push((terrain.profileHeight(a, b, 0.5) - rail) * M);
      }
    const sorted = gaps.map(Math.abs).sort((p, q) => p - q);
    expect(gaps.length).toBeGreaterThan(500);
    expect(summary(gaps).mean).toBeGreaterThan(0.02);
    expect(summary(gaps).mean).toBeLessThan(0.08);
    expect(sorted[Math.floor(sorted.length * 0.9)]).toBeLessThan(0.25);
  });

  it('places hand-made models on the surface they were modelled on', () => {
    const [x, z] = [1.93, -5.05],
      ground = terrain.groundHeight(x, z);
    // A platform modelled on the legacy street (0.077) now starts on the terrain.
    expect(terrain.placeLegacy(x, z, LEGACY_LEVELS.street, LEGACY_LEVELS.street)).toBeCloseTo(
      ground,
      12,
    );
    // Its 0.02-unit (0.5 m) design height above that street is kept.
    expect(terrain.placeLegacy(x, z, 0.097, LEGACY_LEVELS.street) - ground).toBeCloseTo(0.02, 12);
    // A model on a given base (e.g. a building's footprint minimum) uses that base.
    expect(terrain.placeLegacy(x, z, 0.1, 0.06, 3)).toBeCloseTo(3.04, 12);
  });
});
