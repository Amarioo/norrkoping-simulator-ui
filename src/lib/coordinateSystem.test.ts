/**
 * Step 1 regression tests: SWEREF 99 TM canonical CRS and the local scene frame.
 * Independent references come from src/lib/geo/reference-points.json (scripts/geo/verify_projection.py):
 * Lantmäteriet's published SWEPOS point G5TA, Lantmäteriet STAC tile corners, GRS80 geodesics (PROJ) and
 * native Lantmäteriet 1 m DTM heights. OSM source coordinates come from the snapshots in scripts/data.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import refs from './geo/reference-points.json';
import {
  SCENE_REFERENCE,
  geodeticToSweref,
  swerefToGeodetic,
  swerefToScene,
  sceneToSweref,
  trueNorth,
} from './geo/sweref99tm.js';
import { terrain } from './terrain';
import { cityMap, CITY_VIEWS, project } from './mapModel';
import { trenchRing } from './ingelstaTerrain';
import bridges from './data/city-bridges.json';
import bridgeProfiles from './data/bridge-profiles.json';

type Ring = number[][];
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const hypot = Math.hypot;

describe('WGS84 / SWEREF 99 → SWEREF 99 TM', () => {
  it('matches Lantmäteriet published coordinates (G5TA, STAC tile corners)', () => {
    expect(refs.points.length).toBeGreaterThan(50);
    for (const p of refs.points) {
      const [e, n] = geodeticToSweref(p.lat, p.lon);
      // G5TA is printed to 1 mm / 0.00001″; STAC corners are exact integers.
      expect(hypot(e - p.E, n - p.N)).toBeLessThan(p.source === 'published' ? 0.002 : 0.001);
    }
  });
  it('inverts SWEREF 99 TM to geodetic coordinates', () => {
    for (const p of refs.points) {
      const [lat, lon] = swerefToGeodetic(p.E, p.N);
      // 2e-8 degrees ≈ 2 mm north, 1 mm east.
      expect(Math.abs(lat - p.lat)).toBeLessThan(2e-8);
      expect(Math.abs(lon - p.lon)).toBeLessThan(2e-8);
    }
  });
});

describe('SWEREF 99 TM ↔ local scene frame', () => {
  it('uses one contract in code, terrain dataset, map and transport network', () => {
    const r = terrain.data.reference;
    for (const key of Object.keys(SCENE_REFERENCE) as (keyof typeof SCENE_REFERENCE)[])
      expect(r[key]).toBe(SCENE_REFERENCE[key]);
    expect(r.verticalDatum).toBe('RH2000');
    expect(cityMap.meta).toMatchObject({ metresPerUnit: 25 });
    const meta = (cityMap.meta as unknown as { reference: typeof SCENE_REFERENCE }).reference;
    expect(meta).toEqual(SCENE_REFERENCE);
    expect(read('src/lib/data/transport-network.json').meta.reference).toEqual(SCENE_REFERENCE);
    // Verified scale factor and convergence at the origin (PROJ factors, verify_projection.py).
    expect(SCENE_REFERENCE.gridScaleFactor).toBeCloseTo(refs.contract.projScale, 9);
    expect(-SCENE_REFERENCE.gridConvergenceDegrees).toBeCloseTo(refs.contract.projConvergence, 8);
  });
  it('maps the fixed origin to (0, 0) and keeps ground-metre scale', () => {
    expect(swerefToScene(SCENE_REFERENCE, 569030, 6494989)).toEqual([0, 0]);
    const [x] = swerefToScene(SCENE_REFERENCE, 570030, 6494989);
    expect(x * 25).toBeCloseTo(1000 / SCENE_REFERENCE.gridScaleFactor, 9);
    const [, z] = swerefToScene(SCENE_REFERENCE, 569030, 6493989);
    expect(z * 25).toBeCloseTo(1000 / SCENE_REFERENCE.gridScaleFactor, 9);
  });
  it('round trips scene ↔ SWEREF 99 TM ↔ geodetic', () => {
    for (const [x, z] of [
      [0, 0],
      [-250, -260],
      [240, 150],
      [12.3, -45.6],
    ]) {
      const [e, n] = sceneToSweref(SCENE_REFERENCE, x, z);
      const [x2, z2] = swerefToScene(SCENE_REFERENCE, e, n);
      expect(x2).toBeCloseTo(x, 10);
      expect(z2).toBeCloseTo(z, 10);
      const [lat, lon] = terrain.unproject(x, z);
      const [x3, z3] = terrain.project(lat, lon);
      // Krüger series round trip: micrometres.
      expect(hypot(x3 - x, z3 - z) * 25).toBeLessThan(1e-4);
    }
  });
  it('places Lantmäteriet tile corners exactly where SWEREF 99 TM says', () => {
    for (const p of refs.points.filter((p) => p.source === 'stac')) {
      const [x, z] = terrain.project(p.lat, p.lon);
      const [ex, ez] = terrain.fromSweref(p.E, p.N);
      expect(hypot(x - ex, z - ez) * 25).toBeLessThan(0.001);
    }
  });
  it('reports true north 1.0135° west of grid north', () => {
    const [nx, nz] = trueNorth(SCENE_REFERENCE);
    expect(nz).toBeLessThan(0);
    expect((Math.atan2(nx, -nz) * 180) / Math.PI).toBeCloseTo(-1.0135, 4);
  });
});

describe('real-world distances', () => {
  const legacy = (lat: number, lon: number) => [
    ((lon - 16.18747) * 58010) / 25,
    ((58.58981 - lat) * 111133) / 25,
  ];
  it('matches GRS80 geodesic distances between landmarks to 3e-5', () => {
    const lm = refs.landmarks as Record<string, { lat: number; lon: number }>;
    let worstLegacy = 0;
    for (const { a, b, metres } of refs.geodesicPairs) {
      const pa = project(lm[a].lat, lm[a].lon),
        pb = project(lm[b].lat, lm[b].lon);
      const scene = hypot(pb[0] - pa[0], pb[1] - pa[1]) * 25;
      expect(Math.abs(scene / metres - 1)).toBeLessThan(3e-5);
      const la = legacy(lm[a].lat, lm[a].lon),
        lb = legacy(lm[b].lat, lm[b].lon);
      worstLegacy = Math.max(worstLegacy, Math.abs((hypot(lb[0] - la[0], lb[1] - la[1]) * 25) / metres - 1));
    }
    // The superseded equirectangular frame was off by about 0.25 %.
    expect(worstLegacy).toBeGreaterThan(2e-3);
  });
});

describe('terrain, road and building alignment', () => {
  it('samples the terrain grid at native Lantmäteriet DTM heights (registration)', () => {
    const error = (dx: number, dz: number) =>
      refs.dtmControl.map((c) => {
        const [x, z] = terrain.fromSweref(c.E, c.N);
        return terrain.sample(x + dx, z + dz)!.metresRH2000 - c.metresRH2000;
      });
    const rmse = (e: number[]) => Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length);
    const aligned = error(0, 0);
    expect(rmse(aligned)).toBeLessThan(0.15);
    expect(Math.abs(aligned.reduce((s, v) => s + v, 0) / aligned.length)).toBeLessThan(0.03);
    // Sensitivity: a 10 m misregistration would be detected.
    expect(rmse(error(0.4, 0))).toBeGreaterThan(rmse(aligned) * 3);
    expect(rmse(error(0, 0.4))).toBeGreaterThan(rmse(aligned) * 3);
  });
  it('keeps OSM tram ways where a direct projection of the OSM nodes puts them', () => {
    const source = read('scripts/data/norrkoping-transit-source.json');
    const ends = new Map<number, number[][]>();
    for (const r of cityMap.roads.filter((r) => r.kind === 'tram' && r.way)) {
      if (!ends.has(r.way!)) ends.set(r.way!, []);
      ends.get(r.way!)!.push(r.a, r.b);
    }
    let checked = 0;
    for (const rel of source.elements.filter((e: { type: string }) => e.type === 'relation'))
      for (const m of rel.members)
        if (m.type === 'way' && m.geometry && ends.has(m.ref))
          for (const g of m.geometry) {
            const p = project(g.lat, g.lon);
            const near = Math.min(...ends.get(m.ref)!.map((q) => hypot(q[0] - p[0], q[1] - p[1])));
            if (near < 0.2) {
              // Stored values are rounded to 0.001 unit twice (import and migration).
              expect(near * 25).toBeLessThan(0.05);
              checked++;
            }
          }
    expect(checked).toBeGreaterThan(500);
  });
  it('keeps OSM building footprints where a direct projection puts them', () => {
    const source = read('scripts/data/norrkoping-places-source.json');
    let checked = 0;
    for (const e of source.elements.filter(
      (e: { tags?: Record<string, string>; geometry?: unknown }) => e.tags?.building && e.geometry,
    )) {
      const building = cityMap.buildings.find((b) => b.id === `way/${e.id}`);
      if (!building) continue;
      for (const g of e.geometry) {
        const p = project(g.lat, g.lon);
        const near = Math.min(...building.rings[0].map((q) => hypot(q[0] - p[0], q[1] - p[1])));
        expect(near * 25).toBeLessThan(0.05);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3);
  });
  it('keeps the Ingelsta rail cutting aligned with the hole in the mapped ground', () => {
    const groundVertices = cityMap.ground.flatMap((g) => g.rings.flat());
    for (const corner of trenchRing.slice(0, 4)) {
      const near = Math.min(
        ...groundVertices.map((q) => hypot(q[0] - corner[0], q[1] - corner[1])),
      );
      expect(near * 25).toBeLessThan(0.1);
    }
  });
});

describe('network topology after migration', () => {
  const pointInRing = (p: number[], ring: Ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0])
        inside = !inside;
    }
    return inside;
  };
  it('keeps tram and train routes on the mapped track nodes', () => {
    const ends = new Set(cityMap.roads.flatMap((r) => [r.a.join(), r.b.join()]));
    const onTrack = Object.fromEntries(
      cityMap.transitRoutes.map((r) => [r.id, r.points.filter((p) => ends.has(`${p[0]},${p[2]}`)).length]),
    );
    // Identical to the pre-migration data (two tram-2 connector points never were track nodes).
    expect(onTrack).toEqual({ 'tram-2': 1075, 'tram-3': 838, pendeln: 620 });
    for (const r of cityMap.transitRoutes) {
      const stops = r.stops.map((s) => s.distance);
      expect([...stops].sort((a, b) => a - b)).toEqual(stops);
      // No gaps: the longest mapped straight track segment is about 294 m (11.8 units).
      for (let i = 1; i < r.points.length; i++)
        expect(hypot(r.points[i][0] - r.points[i - 1][0], r.points[i][2] - r.points[i - 1][2])).toBeLessThan(15);
    }
  });
  it('keeps every bridge-profile key on a mapped road endpoint', () => {
    const keys = new Set(
      cityMap.roads.length
        ? read('src/lib/data/norrkoping-map.json').roads.flatMap(
            (r: { a: number[]; b: number[]; yA: number; yB: number }) => [
              [...r.a, r.yA].map((v) => v.toFixed(3)).join(','),
              [...r.b, r.yB].map((v) => v.toFixed(3)).join(','),
            ],
          )
        : [],
    );
    const profileKeys = Object.keys(bridgeProfiles.points);
    expect(profileKeys.length).toBe(810);
    expect(profileKeys.filter((k) => !keys.has(k))).toEqual([]);
  });
  it('keeps detailed bridges over the same mapped bridge segments', () => {
    const owned = bridges.bridges.map(
      (b) =>
        cityMap.roads.filter(
          (r) => r.bridge && pointInRing([(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2], b.ring),
        ).length,
    );
    expect(owned).toEqual([15, 30, 9, 4, 1, 2, 1, 1, 1]);
  });
});

describe('camera presets', () => {
  // Pre-migration preset targets (legacy frame) and their unchanged geographic meaning.
  const legacyTargets: Record<string, number[]> = {
    overview: [-18, -55],
    city: [-4, 8],
    f13: [-195, -92],
    policeEmblem: [-28.38, -25.37],
    ingelstaBridge: [-25.2, -28.4],
    grandHotel: [-2.4, -14.3],
    holmen: [-11.7, -15],
    kungsgatan: [-22, -14],
    soderleden: [14, 66],
    industry: [-17, 3],
    centrum: [2, -5],
    norraPromenaden: [-8, -27.2],
    sodraPromenaden: [-6, 22.85],
    campus: [-24.5, 2.2],
    bergsbron: [-21.3, 0.4],
    laxholmsbron: [-17.36, 4.23],
    laxtrappan: [-9.9, -8.9],
    gamlebro: [-8.4, 1.87],
    saltangsbron: [-4.7, -17.3],
    hamnbron: [15.6, -19.4],
    underpass: [8, -37],
  };
  it('aim at the same geographic points as before the migration', () => {
    for (const [view, [x, z]] of Object.entries(legacyTargets)) {
      const lat = 58.58981 - (z * 25) / 111133,
        lon = 16.18747 + (x * 25) / 58010;
      const target = CITY_VIEWS[view].target;
      const [e1, n1] = geodeticToSweref(lat, lon);
      const [e2, n2] = terrain.toSweref(target[0], target[2]);
      // Presets are stored to 0.01 unit (0.25 m).
      expect(hypot(e2 - e1, n2 - n1), view).toBeLessThan(0.3);
    }
  });
  it('keep overview cameras oriented to true north, not grid north', () => {
    const [nx, nz] = terrain.trueNorth;
    for (const view of ['industry', 'overview', 'centrum', 'parken']) {
      const { target, position } = CITY_VIEWS[view];
      const dx = position[0] - target[0],
        dz = position[2] - target[2];
      const range = position[1] / 0.95;
      // 0.28·range towards true east, 0.75·range towards true south.
      expect((dx * -nz + dz * nx) / range, view).toBeCloseTo(0.28, 9);
      expect(-(dx * nx + dz * nz) / range, view).toBeCloseTo(0.75, 9);
    }
    // Airport overview: the legacy target (146.581, 17) migrated with its true x.
    const airport = CITY_VIEWS.airport.target;
    expect(hypot(airport[0] - 147.258, airport[2] - 14.362) * 25).toBeLessThan(0.3);
  });
  it('keep every preset target inside the mapped region', () => {
    const [x0, z0, x1, z1] = cityMap.meta.bounds;
    for (const [view, preset] of Object.entries(CITY_VIEWS)) {
      expect(preset.target[0], view).toBeGreaterThan(x0);
      expect(preset.target[0], view).toBeLessThan(x1);
      expect(preset.target[2], view).toBeGreaterThan(z0);
      expect(preset.target[2], view).toBeLessThan(z1);
    }
  });
});
