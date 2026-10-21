/**
 * Measures the RENDERED city geometry against the native Lantmäteriet 1 m DTM.
 *
 * The real worker geometry (cityMesh.buildCityLayers) is built in Node and sampled with vertical
 * rays at the points of work/elevation-step2/samples.json (scripts/geo/elevation_samples.py).
 * Run:  npx vitest run -c scripts/geo/vitest.measure.config.ts
 * Env:  MEASURE_OUT=<file.json> (default work/elevation-step2/measure.json)
 */
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { cityMap, type MapBuilding } from '../../src/lib/mapModel';
import { terrain } from '../../src/lib/terrain';
import * as cityMesh from '../../src/lib/cityMesh';
import transport from '../../src/lib/data/transport-network.json';
import { surfaceAt } from '../../src/lib/cityMesh';
import { wheelHeight, railLift, trackKindOf } from '../../src/lib/trackProfile';

const M = terrain.data.reference.metresPerUnit;
const metres = (sceneY: number) => sceneY * M + terrain.data.reference.verticalOriginMetres;
interface Samples {
  network: {
    segment: number[];
    t: number[];
    lateral: number[];
    x: number[];
    z: number[];
    dtm: (number | null)[];
    ordinary: boolean[];
  };
  cover: { kind: string; x: number; z: number; dtm: number }[];
  buildings: {
    id: string;
    dtmMin: number;
    dtmMedian: number;
    dtmMax: number;
    dtmFirstVertex: number;
  }[];
}

/** Heights of every triangle of the given geometries that covers each query point. */
function raycast(
  geometries: { getAttribute(name: string): { array: ArrayLike<number> } }[],
  points: [number, number][],
) {
  const CELL = 0.25,
    cells = new Map<number, number[]>();
  const key = (x: number, z: number) =>
    (Math.floor(x / CELL) + 4096) * 8192 + Math.floor(z / CELL) + 4096;
  points.forEach(([x, z], i) => {
    const k = key(x, z);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push(i);
  });
  const hits: number[][] = points.map(() => []);
  for (const g of geometries) {
    const p = g.getAttribute('position').array;
    for (let o = 0; o < p.length; o += 9) {
      const ax = p[o],
        az = p[o + 2],
        bx = p[o + 3],
        bz = p[o + 5],
        cx = p[o + 6],
        cz = p[o + 8];
      const x0 = Math.floor(Math.min(ax, bx, cx) / CELL),
        x1 = Math.floor(Math.max(ax, bx, cx) / CELL);
      const z0 = Math.floor(Math.min(az, bz, cz) / CELL),
        z1 = Math.floor(Math.max(az, bz, cz) / CELL);
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-14) continue;
      for (let i = x0; i <= x1; i++)
        for (let j = z0; j <= z1; j++) {
          const list = cells.get((i + 4096) * 8192 + j + 4096);
          if (!list) continue;
          for (const n of list) {
            const [x, z] = points[n];
            const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det,
              l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det,
              l3 = 1 - l1 - l2;
            if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
            hits[n].push(l1 * p[o + 1] + l2 * p[o + 4] + l3 * p[o + 7]);
          }
        }
    }
  }
  return hits;
}
function stats(errors: number[]) {
  const e = errors.filter(Number.isFinite);
  if (!e.length) return { n: 0 };
  const abs = e.map(Math.abs).sort((a, b) => a - b);
  const mean = e.reduce((s, v) => s + v, 0) / e.length;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    n: e.length,
    mean: r(mean),
    rmse: r(Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length)),
    p50abs: r(abs[Math.floor(abs.length * 0.5)]),
    p95abs: r(abs[Math.floor(abs.length * 0.95)]),
    maxAbs: r(abs.at(-1)!),
  };
}

it('measures rendered elevations against the native DTM', { timeout: 600_000 }, () => {
  const samples = JSON.parse(
    readFileSync(process.env.SAMPLES ?? 'work/elevation-step2/samples.json', 'utf8'),
  ) as Samples;
  const started = performance.now();
  const layers = cityMesh.buildCityLayers();
  const buildMs = performance.now() - started;
  const report: Record<string, unknown> = {
    revision: terrain.data.revision,
    buildMs: Math.round(buildMs),
  };

  // ---- Network
  const net = samples.network;
  const points = net.x.map((x, i) => [x, net.z[i]] as [number, number]);
  const top = raycast([...(layers.roads ?? []), ...(layers.markings ?? [])], points).map((h) =>
    h.length ? Math.max(...h) : NaN,
  );
  const groupBy: Record<string, number[]> = {},
    surfaceBy: Record<string, number[]> = {};
  net.x.forEach((x, i) => {
    const r = cityMap.roads[net.segment[i]],
      dtmHeight = net.dtm[i];
    if (dtmHeight === null) return;
    const part =
      r.kind === 'rail' || r.kind === 'tram' ? (net.lateral[i] ? '-railTop' : '-centre') : '';
    const cls = net.ordinary[i]
      ? 'ordinary'
      : r.bridge
        ? 'bridge'
        : r.tunnel
          ? 'tunnel'
          : 'nearSpecial';
    const k = `${r.kind}${part}/${cls}`;
    (groupBy[k] ??= []).push(metres(top[i]) - dtmHeight);
    (surfaceBy[k] ??= []).push(metres(terrain.groundHeight(x, net.z[i])) - dtmHeight);
  });
  report.networkRenderedMinusDtm = Object.fromEntries(
    Object.entries(groupBy)
      .sort()
      .map(([k, v]) => [k, stats(v)]),
  );
  report.networkTerrainSurfaceMinusDtm = Object.fromEntries(
    Object.entries(surfaceBy)
      .sort()
      .map(([k, v]) => [k, stats(v)]),
  );

  // ---- Land cover and plain ground: top of the land layer
  const cover = samples.cover;
  const land = raycast(
    layers.land ?? [],
    cover.map((c) => [c.x, c.z]),
  ).map((h) => (h.length ? Math.max(...h) : NaN));
  const coverBy: Record<string, number[]> = {},
    coverSurface: Record<string, number[]> = {};
  cover.forEach((c, i) => {
    (coverBy[c.kind] ??= []).push(metres(land[i]) - c.dtm);
    (coverSurface[c.kind] ??= []).push(metres(terrain.groundHeight(c.x, c.z)) - c.dtm);
  });
  report.coverRenderedMinusDtm = Object.fromEntries(
    Object.entries(coverBy)
      .sort()
      .map(([k, v]) => [k, stats(v)]),
  );
  report.coverTerrainSurfaceMinusDtm = Object.fromEntries(
    Object.entries(coverSurface)
      .sort()
      .map(([k, v]) => [k, stats(v)]),
  );

  // ---- Buildings: wall bottom (base + minHeight) vs footprint ground
  const base =
    (cityMesh as unknown as { buildingBase?: (b: MapBuilding) => number }).buildingBase ??
    ((b: MapBuilding) => terrain.relativeHeight(b.rings[0][0][0], b.rings[0][0][1], 0.045));
  const byId = new Map(cityMap.buildings.map((b) => [b.id, b]));
  const gapMin: number[] = [],
    gapMedian: number[] = [],
    buriedMax: number[] = [];
  for (const s of samples.buildings) {
    const b = byId.get(s.id);
    if (!b || b.minHeight > 0) continue;
    const bottom = metres(base(b));
    gapMin.push(bottom - s.dtmMin);
    gapMedian.push(bottom - s.dtmMedian);
    buriedMax.push(s.dtmMax - bottom);
  }
  const share = (v: number[], t: number) =>
    Math.round((v.filter((x) => x > t).length / v.length) * 1000) / 10;
  report.buildings = {
    wallBottomMinusDtmFootprintMin: stats(gapMin),
    wallBottomMinusDtmFootprintMedian: stats(gapMedian),
    percentFloatingOver: {
      '0.25m': share(gapMin, 0.25),
      '1m': share(gapMin, 1),
      '2m': share(gapMin, 2),
    },
    footprintMaxAboveWallBottom: stats(buriedMax),
  };

  // ---- Continuity: rendered road-surface height at shared segment endpoints
  const ends = new Map<string, number[]>();
  for (const r of cityMap.roads) {
    if (r.kind === 'stream') continue;
    for (const [p, y] of [
      [r.a, r.yA],
      [r.b, r.yB],
    ] as const)
      (
        ends.get(`${r.kind}:${p[0]},${p[1]}`) ??
        ends.set(`${r.kind}:${p[0]},${p[1]}`, []).get(`${r.kind}:${p[0]},${p[1]}`)!
      ).push(y);
  }
  const jumps: Record<string, number[]> = {};
  for (const [k, ys] of ends)
    if (ys.length > 1)
      (jumps[k.split(':')[0]] ??= []).push((Math.max(...ys) - Math.min(...ys)) * M);
  report.nodeHeightSpreadMetres = Object.fromEntries(
    Object.entries(jumps).map(([k, v]) => [
      k,
      {
        nodes: v.length,
        over1cm: v.filter((x) => x > 0.01).length,
        max: Math.round(Math.max(...v) * 1000) / 1000,
      },
    ]),
  );

  // ---- Vehicles: backend formulas (CityTransport.kt / RailTraffic.kt) replicated with TerrainService
  const nodes = transport.nodes as { x: number; y: number; z: number }[];
  // Car origin (profileHeight + 0.008) vs the highest drawn road surface at or below it.
  const carPoints: [number, number][] = [],
    carY: number[] = [];
  for (const e of transport.edges as { from: number; to: number }[]) {
    const a = nodes[e.from],
      b = nodes[e.to];
    for (const t of [0.25, 0.5, 0.75]) {
      carY.push(terrain.profileHeight([a.x, a.y, a.z], [b.x, b.y, b.z], t) + 0.008);
      carPoints.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]);
    }
  }
  const carGap: number[] = [];
  raycast(layers.roads ?? [], carPoints).forEach((hits, i) => {
    const below = hits.filter((h) => h <= carY[i] + 1e-6);
    if (below.length) carGap.push((carY[i] - Math.max(...below)) * M);
    else if (hits.length) carGap.push((carY[i] - Math.min(...hits)) * M);
  });
  report.carOriginMinusRoadTop = stats(carGap);
  const tramGap: Record<string, number[]> = {};
  const track = cityMap.roads.filter((r) => r.kind === 'rail' || r.kind === 'tram');
  for (const route of cityMap.transitRoutes) {
    const pts = route.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i];
      // Batch A contract (trackProfile.ts): wheel contact = rail top of the same drawn track.
      const y = wheelHeight(pts, i - 1, 0.5, trackKindOf(route.kind));
      const x = (a[0] + b[0]) / 2,
        z = (a[2] + b[2]) / 2;
      let best = track[0],
        d = Infinity;
      for (const r of track) {
        const dx = r.b[0] - r.a[0],
          dz = r.b[1] - r.a[1];
        const t = Math.max(
          0,
          Math.min(1, ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / (dx * dx + dz * dz || 1)),
        );
        const dd = Math.hypot(r.a[0] + dx * t - x, r.a[1] + dz * t - z);
        if (dd < d) [d, best] = [dd, r];
      }
      const dx = best.b[0] - best.a[0],
        dz = best.b[1] - best.a[1];
      const t = Math.max(
        0,
        Math.min(1, ((x - best.a[0]) * dx + (z - best.a[1]) * dz) / (dx * dx + dz * dz || 1)),
      );
      const railTop = surfaceAt(best, t, [best.a[0] + dx * t, best.a[1] + dz * t], railLift(best.kind === 'rail' ? 'rail' : 'tram'));
      (tramGap[`${route.id}/${best.bridge ? 'bridge' : 'ground'}`] ??= []).push((y - railTop) * M);
    }
  }
  report.railVehicleOriginMinusRailTop = Object.fromEntries(
    Object.entries(tramGap)
      .sort()
      .map(([k, v]) => [k, stats(v)]),
  );
  // ---- Bridge decks vs LiDAR class 17 (scripts/geo/deck_points.py): highest drawn network surface.
  const deckFile = process.env.DECKS ?? 'work/elevation-step2/deck-points.json';
  try {
    const decks = JSON.parse(readFileSync(deckFile, 'utf8')) as {
      x: number;
      z: number;
      metres: number;
      bridge: string;
    }[];
    const hits = raycast(
      layers.roads ?? [],
      decks.map((d) => [d.x, d.z]),
    );
    const byBridge: Record<string, number[]> = {};
    decks.forEach((d, i) => {
      if (hits[i].length) (byBridge[d.bridge] ??= []).push(metres(Math.max(...hits[i])) - d.metres);
    });
    report.deckRenderedMinusLidar = Object.fromEntries(
      Object.entries(byBridge)
        .sort()
        .map(([k, v]) => [k, stats(v)]),
    );
    report.deckWorst = decks
      .map((d, i) => ({ ...d, hits: hits[i].map((h) => Math.round(metres(h) * 100) / 100) }))
      .filter((d) => d.hits.length && d.bridge !== 'other')
      .map((d) => ({ ...d, error: Math.round((Math.max(...d.hits) - d.metres) * 100) / 100 }))
      .sort((p, q) => Math.abs(q.error) - Math.abs(p.error))
      .slice(0, 12);
  } catch (error) {
    report.deckRenderedMinusLidar = String(error);
  }
  const out = process.env.MEASURE_OUT ?? 'work/elevation-step2/measure.json';
  writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify(report, null, 1));
});
