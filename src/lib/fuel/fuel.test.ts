/**
 * Phase D2 — fuel stations: the measured canopy data, the layout of the estimated parts, the model
 * that replaces the OSM roof extrusions, and the canopy downlights as a street-lighting rollout
 * (validated, accepted by the controller next to the full citywide set, bright under the canopy and
 * dark on the deck above).
 */
import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { MeshStandardMaterial, Scene, type BufferGeometry, type WebGLRenderer } from 'three';
import { terrain } from '../terrain';
import { cityMap } from '../mapModel';
import { DETAILED_BUILDING_IDS } from '../cityPlaces';
import places from '../data/city-places.json';
import { cityLightingRegistry, createCityLighting } from '../lighting/controller';
import { mergeRegistries } from '../lighting/corridorRegistry';
import type { CompactSet } from '../lighting/compactSet';
import { FIXTURE_TYPES, fixtureLamps, type FixtureRecord } from '../lighting/fixtures';
import { toPilotFixture, validateRegistry } from '../lighting/registry';
import { lampLux } from '../lighting/reference';
import { createIdrottsparken } from '../stadium/idrottsparken';
import { createFuelStations, renderedGround } from './fuelStations';
import { fuelLightingRegistry } from './fuelLighting';
import { canopyLayouts, canopyRing, edgeDistance, inside, minAreaRect, type XZ } from './layout';
import {
  FASCIA_DEPTH_M,
  FUEL_CANOPY_IDS,
  FUEL_DATA,
  FUEL_REPLACED_IDS,
  FUEL_VERSION,
  LAMP,
  NIGHT_GAIN,
} from './spec';

const M = terrain.data.reference.metresPerUnit;
const layouts = canopyLayouts(M);
const polygonArea = (r: XZ[]) =>
  Math.abs(
    r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0),
  ) / 2;
const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8')) as CompactSet;

describe('measured canopies (src/lib/data/fuel-canopies.json)', () => {
  test('all 32 OSM fuel features are accounted for; 21 stations get their LiDAR-confirmed canopy', () => {
    expect(FUEL_DATA.stations).toHaveLength(32);
    expect(FUEL_DATA.stations.filter((s) => s.built)).toHaveLength(21);
    expect(FUEL_CANOPY_IDS).toHaveLength(21);
    for (const s of FUEL_DATA.stations)
      if (!s.built) expect((s as { reason?: string }).reason).toMatch(/no canopy outline in OSM/);
    // Every accepted canopy: flat top, roof over most of the outline, 3.8–7 m above the LiDAR ground
    // (the lowest is OKQ8 Hagebygatan, 3.97 m).
    for (const c of FUEL_DATA.canopies.filter((c) => c.accepted)) {
      expect(c.topRh2000.p90 - c.topRh2000.p10).toBeLessThanOrEqual(0.8);
      expect(c.canopyCellShare).toBeGreaterThanOrEqual(0.5);
      expect(c.clearanceM).toBeGreaterThan(3.8);
      expect(c.clearanceM).toBeLessThan(7);
      expect(c.groundSamples).toBeGreaterThan(100);
    }
    // The one outline the LiDAR does not confirm (24 % roofed in 2020) is not built.
    const moa = FUEL_DATA.canopies.find((c) => c.id === 'way/287685611')!;
    expect(moa.accepted).toBe(false);
    expect(FUEL_CANOPY_IDS).not.toContain('way/287685611');
    // The user's decision of 2026-11-10: two more stations from the LiDAR. Ingo Lindövägen's OSM
    // building=yes outline read as the canopy; OKQ8 Hagebygatan's outline measured from the LiDAR (a
    // rectangle the roofed cells fill to ≥ 75 %, next to the station, outside every OSM building).
    const lindo = FUEL_DATA.canopies.find((c) => c.id === 'way/96575513')!;
    expect(lindo).toMatchObject({ station: 'osm:node/247135512', accepted: true });
    expect(lindo.outline).toBe('osm building=yes, read as the canopy (user decision 2026-11-10)');
    const hageby = FUEL_DATA.canopies.find((c) => c.id === 'lidar:node/1107696684')!;
    expect(hageby).toMatchObject({ station: 'osm:node/1107696684', accepted: true });
    expect(hageby.ringSweref).toHaveLength(4);
    expect(hageby.rectangleFill).toBeGreaterThanOrEqual(0.75);
    expect(hageby.areaM2).toBeGreaterThan(300);
    expect(hageby.areaM2).toBeLessThan(600);
    // The adjoining OSM building is not overlapped by more than a sliver (≤ 5 % of the canopy).
    const ring = canopyRing(hageby, M);
    const building = cityMap.buildings
      .find((b) => b.id === 'way/95526635')!
      .rings[0].map(([x, z]) => [x * M, z * M] as XZ);
    let n = 0,
      hit = 0;
    for (
      let x = Math.min(...ring.map((p) => p[0]));
      x < Math.max(...ring.map((p) => p[0]));
      x += 0.5
    )
      for (
        let z = Math.min(...ring.map((p) => p[1]));
        z < Math.max(...ring.map((p) => p[1]));
        z += 0.5
      )
        if (inside(ring, [x, z])) {
          n++;
          if (inside(building, [x, z])) hit++;
        }
    expect(hit / n).toBeLessThan(0.05);
  });

  test('the canopies replace their OSM extrusions; the OSM data itself is unchanged', () => {
    // Every OSM-outlined canopy replaces its extrusion; the LiDAR-outlined one is not a map building.
    expect(FUEL_REPLACED_IDS).toEqual(
      FUEL_CANOPY_IDS.filter((id) => id !== 'lidar:node/1107696684'),
    );
    for (const id of FUEL_REPLACED_IDS) {
      expect(DETAILED_BUILDING_IDS.has(id)).toBe(true);
      expect(cityMap.buildings.some((b) => b.id === id)).toBe(true);
    }
    expect(DETAILED_BUILDING_IDS.has('way/95526635')).toBe(false);
    expect(DETAILED_BUILDING_IDS.has('way/287685611')).toBe(false);
    // The other building=roof outlines stay as they were: only the three platform shelters that
    // city-places.json already replaced before D2 are detailed, the rest keep their OSM extrusion.
    const roofs = cityMap.buildings.filter((b) => b.kind === 'roof').map((b) => b.id);
    expect(roofs).toHaveLength(30);
    const fuel = new Set(FUEL_CANOPY_IDS);
    expect(roofs.filter((id) => fuel.has(id))).toHaveLength(18);
    const earlier = new Set(places.roofs.map((r) => 'way/' + r.id));
    expect(roofs.filter((id) => !fuel.has(id) && DETAILED_BUILDING_IDS.has(id)).sort()).toEqual(
      [...earlier].sort(),
    );
  });
});

describe('layout (estimated islands, dispensers, columns, downlights)', () => {
  test('frames are metric and the rectangle encloses the outline', () => {
    expect(layouts.map((l) => l.id)).toEqual([...FUEL_CANOPY_IDS]);
    for (const l of layouts) {
      expect(Math.hypot(...l.u)).toBeCloseTo(1, 12);
      expect(l.u[0] * l.v[0] + l.u[1] * l.v[1]).toBeCloseTo(0, 12);
      expect(l.lengthM).toBeGreaterThanOrEqual(l.widthM);
      expect(l.lengthM * l.widthM).toBeGreaterThanOrEqual(polygonArea(l.ring) - 1e-6);
      // 0.9 m fascia, shallower only on the two low canopies (underside ≥ 3.5 m above the LiDAR ground).
      const depth = l.topY - l.undersideY;
      expect(depth).toBeCloseTo(Math.min(FASCIA_DEPTH_M, l.topY - l.lidarGroundY - 3.5), 9);
      expect(depth).toBeGreaterThan(0.4);
      if (l.topY - l.lidarGroundY >= 4.4) expect(depth).toBeCloseTo(FASCIA_DEPTH_M, 9);
    }
    // A unit square rotated by 30°: the rectangle is the square itself.
    const a = Math.PI / 6;
    const sq: XZ[] = [
      [0, 0],
      [Math.cos(a), Math.sin(a)],
      [Math.cos(a) - Math.sin(a), Math.sin(a) + Math.cos(a)],
      [-Math.sin(a), Math.cos(a)],
    ];
    const r = minAreaRect(sq);
    expect(r.lengthM * r.widthM).toBeCloseTo(1, 9);
  });

  test('every canopy has at least one island and one downlight, all inside the outline', () => {
    let islands = 0,
      lamps = 0;
    for (const l of layouts) {
      expect(l.islands.length).toBeGreaterThan(0);
      expect(l.lamps.length).toBeGreaterThan(0);
      expect(l.columns).toHaveLength(l.islands.length);
      expect(l.dispensers).toHaveLength(l.islands.length);
      for (const p of l.lamps) {
        expect(inside(l.ring, p)).toBe(true);
        expect(edgeDistance(l.ring, p)).toBeGreaterThanOrEqual(LAMP.edgeM - 1e-9);
      }
      for (const b of [...l.islands, ...l.columns]) expect(inside(l.ring, b.centre)).toBe(true);
      islands += l.islands.length;
      lamps += l.lamps.length;
    }
    console.log(`D2 layout: ${layouts.length} canopies, ${islands} islands, ${lamps} downlights`);
    expect(lamps).toBeLessThan(400);
  });

  test('the canopies stand at their measured height above the rendered ground', () => {
    for (const l of layouts) {
      const g = renderedGround(terrain, M, l.centre);
      // The rendered terrain agrees with the LiDAR ground around the canopy …
      expect(Math.abs(g - l.lidarGroundY)).toBeLessThan(0.6);
      // … so the underside is a plausible drive-through height everywhere under the canopy.
      for (const p of [...l.ring, l.centre]) {
        const clear = l.undersideY - renderedGround(terrain, M, p);
        expect(clear).toBeGreaterThan(3.2);
        expect(clear).toBeLessThan(6.5);
      }
    }
  });
});

describe('model', () => {
  test('three merged standard meshes, a small budget, no glow by day', () => {
    const fuel = createFuelStations(terrain);
    expect(fuel.meshes.map((m) => m.name)).toEqual(['fuel-structure', 'fuel-soffits', 'fuel-lit']);
    let triangles = 0;
    for (const m of fuel.meshes) {
      const material = m.material as MeshStandardMaterial;
      expect(material).toBeInstanceOf(MeshStandardMaterial);
      expect(material.vertexColors).toBe(true);
      expect(material.map).toBeNull();
      // By day nothing glows: the structure has no emissive colour, the lit parts intensity 0.
      if (m.name === 'fuel-structure') expect(material.emissive.getHex()).toBe(0);
      else expect(material.emissiveIntensity).toBe(0);
      triangles += (m.geometry as BufferGeometry).getAttribute('position').count / 3;
    }
    expect(triangles).toBeGreaterThan(1000);
    expect(triangles).toBeLessThan(20_000);
    expect(fuel.group.scale.x).toBeCloseTo(1 / M, 12);
    fuel.setNightLevel(1);
    expect((fuel.meshes[1].material as MeshStandardMaterial).emissiveIntensity).toBeCloseTo(
      NIGHT_GAIN.soffit,
    );
    expect((fuel.meshes[2].material as MeshStandardMaterial).emissiveIntensity).toBeCloseTo(
      NIGHT_GAIN.band,
    );
    fuel.setNightLevel(0);
    expect((fuel.meshes[2].material as MeshStandardMaterial).emissiveIntensity).toBe(0);
    for (const r of fuel.report) {
      expect(r.clearanceM).toBeGreaterThan(3.2);
      expect(r.clearanceM).toBeLessThan(6.5);
    }
    fuel.dispose();
  });
});

describe('canopy downlights (rollout fuel-d2-v1)', () => {
  const registry = fuelLightingRegistry(terrain, layouts);
  const fixtures = registry.fixtures.map(toPilotFixture) as unknown as FixtureRecord[];
  const lamps = fixtureLamps(fixtures, terrain);

  test('a valid estimated set, hung under the canopies', () => {
    const v = validateRegistry(registry, {
      reference: terrain.data.reference,
      supportedTypes: FIXTURE_TYPES,
    });
    expect(v.errors).toEqual([]);
    expect(registry.fixtures).toHaveLength(layouts.reduce((s, l) => s + l.lamps.length, 0));
    const byCanopy = new Map(layouts.map((l) => [l.id, l]));
    registry.fixtures.forEach((r, i) => {
      const m = new RegExp(`^estimate:${FUEL_VERSION}:((?:way|lidar:node)/\\d+):s\\d+$`).exec(r.id);
      expect(m).not.toBeNull();
      const c = byCanopy.get(m![1])!;
      // The source element is the canopy's OSM way, or the station node of the LiDAR outline.
      expect(r.source.element).toBe(c.id.replace(/^lidar:/, ''));
      expect(r.placement).toBe('estimated');
      expect(r.photometry).toMatchObject({
        fixtureType: 'canopy-downlight',
        cctK: LAMP.cct,
        status: 'estimated',
      });
      expect(r.support).toMatchObject({ kind: 'canopy-underside', y: c.undersideY / M });
      expect(r.mountingHeightM.value).toBeGreaterThan(3.2);
      expect(r.mountingHeightM.value).toBeLessThan(6.5);
      // The lens sits 5 cm below the underside.
      expect(lamps[i].y * M).toBeCloseTo(c.undersideY - 0.05, 6);
      expect(lamps[i].clipBelow).toBe(false);
    });
  });

  test('≈ 70–220 lx on the forecourt under the canopy, nothing on the deck above', () => {
    const lux = (p: XZ, y: number, n: [number, number, number]) =>
      lamps.reduce((s, l) => s + lampLux(l, [p[0] / M, y / M, p[1] / M], n, M), 0);
    const means: number[] = [];
    for (const l of layouts) {
      // Mean horizontal illuminance on the ground over the downlights' grid points.
      const ground = l.lamps.map((p) => lux(p, renderedGround(terrain, M, p), [0, 1, 0]));
      means.push(ground.reduce((a, b) => a + b, 0) / ground.length);
      // The deck (top) faces up, above every lamp: unlit.
      expect(lux(l.centre, l.topY + 0.01, [0, 1, 0])).toBe(0);
    }
    means.sort((a, b) => a - b);
    console.log(
      `D2 forecourt under the lamps: min ${means[0].toFixed(0)} lx, median ${means[means.length >> 1].toFixed(0)} lx, max ${means.at(-1)!.toFixed(0)} lx`,
    );
    expect(means[0]).toBeGreaterThan(60);
    expect(means.at(-1)!).toBeLessThan(250);
  });

  test('accepted with the full citywide set: ≤ 32 lamps per cell, its own rollout, no real-time lights', () => {
    const l2 = read('src/lib/data/streetlights-l2.json'),
      l2bc = read('src/lib/data/streetlights-l2bc.json'),
      l2d = read('src/lib/data/streetlights-l2d.json');
    const city = cityLightingRegistry(terrain, l2, l2bc, l2d);
    const merged = mergeRegistries(city, registry);
    const v = validateRegistry(merged, {
      reference: terrain.data.reference,
      supportedTypes: FIXTURE_TYPES,
    });
    expect(v.errors).toEqual([]);
    const stadium = createIdrottsparken(terrain);
    const renderer = { toneMappingExposure: 1, info: { programs: [] } } as unknown as WebGLRenderer;
    const lighting = createCityLighting({
      terrain,
      stadium,
      renderer,
      scene: new Scene(),
      registry: merged,
      strict: true,
    });
    const d = lighting.describe();
    expect(d.fixtures).toBe(city.fixtures.length + registry.fixtures.length);
    expect(d.streetLighting.index!.overflowCells).toBe(0);
    expect(d.streetLighting.index!.maxRawOccupancy).toBeLessThanOrEqual(32);
    expect(d.streetLighting.rollouts![FUEL_VERSION]).toEqual({
      mapped: 0,
      estimated: registry.fixtures.length,
    });
    // The site-lighting category is unchanged (the downlights are not counted as site lighting).
    expect(d.siteLighting).toMatchObject({ rollout: 'lighting-l2d-v1', fixtures: l2d.count });
    expect(d.realtimeLights).toMatchObject({ point: 0, spot: 0 });
    lighting.dispose();
    stadium.dispose();
  });
});
