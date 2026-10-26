/**
 * Lighting Phase L2d: site lighting (siteLighting.ts, siteGenerator.ts). Reproduction byte for byte,
 * rule types and IDs, positions (never in a building, water, carriageway or track clearance; lot
 * poles inside their lot, yard masts on railway land), seams with every earlier rollout, the
 * excluded kinds, and the full citywide set (pilot + A1–A3 + L2a + L2bc + L2d) through the real
 * controller with its own category in describe().
 */
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { Scene, type WebGLRenderer } from 'three';
import { terrain } from '../terrain';
import { createIdrottsparken } from '../stadium/idrottsparken';
import { cityLightingRegistry, createCityLighting } from './controller';
import type { CompactSet } from './compactSet';
import { validateRegistry } from './registry';
import { FIXTURE_TYPES } from './fixtures';
import { inRing } from './corridorA1';
import { geodeticToScene, SCENE_REFERENCE } from '../geo/sweref99tm.js';
import { L2D_GENERATOR, L2D_POLICY, L2D_RULE_TYPE, L2D_RULES, L2D_TYPES, type SiteRule } from './siteLighting';
import { L2D_OUTPUT_FILES, generateL2d, loadL2dInputs, toL2dFiles } from '../../../scripts/lighting-l2d/inputs';
import { L2_OUTPUT_FILES, L2BC_OUTPUT_FILES } from '../../../scripts/lighting-l2/inputs';

const M = terrain.data.reference.metresPerUnit;
const inputs = loadL2dInputs();
const output = generateL2d(inputs);
const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8')) as CompactSet;
const l2 = read(L2_OUTPUT_FILES.runtime);
const l2bc = read(L2BC_OUTPUT_FILES.runtime);
const l2d = read(L2D_OUTPUT_FILES.runtime);
const prov = JSON.parse(fs.readFileSync(L2D_OUTPUT_FILES.provenance, 'utf8'));
const ruleOf = new Map<string, SiteRule>(prov.fixtures.map((r: string[]) => [r[0], r[1]]));
const siteOf = new Map<string, string | null>(prov.fixtures.map((r: (string | null)[]) => [r[0], r[2]]));
const elements = new Map(inputs.input.source.elements.map((e) => [`${e.type}/${e.id}`, e]));
const sceneRing = (g: [number, number][]) => g.map(([la, lo]) => geodeticToScene(SCENE_REFERENCE, la, lo));
const segDist = (p: number[], a: number[], b: number[]) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};

describe('L2d generation', () => {
  test('committed runtime, provenance and statistics equal a fresh generation, byte for byte', () => {
    const files = toL2dFiles(output, inputs);
    expect(fs.readFileSync(L2D_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
    expect(fs.readFileSync(L2D_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
    expect(fs.readFileSync(L2D_OUTPUT_FILES.stats, 'utf8')).toBe(files.stats);
    expect(toL2dFiles(generateL2d(inputs), inputs)).toEqual(files);
  });
  test('every rule is used, with its own type; IDs carry the L2d version; all are estimates', () => {
    expect(output.fixtures.length).toBeGreaterThan(3000);
    for (const f of output.fixtures) {
      expect(f.id.startsWith(`estimate:${L2D_GENERATOR.version}:way/`), f.id).toBe(true);
      expect(f.placement).toBe('estimated');
      expect(f.mount.kind).toBe('ground');
      const rule = ruleOf.get(f.id)!;
      expect(L2D_RULES).toContain(rule);
      expect(f.type).toBe(L2D_RULE_TYPE[rule]);
      expect(FIXTURE_TYPES).toContain(f.type);
      const t = L2D_TYPES[f.type as keyof typeof L2D_TYPES];
      expect([f.heightM, f.cct, f.candela, f.rangeM, f.profile]).toEqual([t.heightM, t.cct, t.candela, t.rangeM, t.profile]);
    }
    for (const r of L2D_RULES) expect(output.counts[`rule:${r}`], r).toBeGreaterThan(20);
    // The provenance labels the new types' photometry as an estimate.
    for (const t of Object.values(prov.meta.types) as { status: string }[]) expect(t.status).toBe('estimate');
  });
  test('no fixture stands in a building, water, a carriageway or a track clearance', () => {
    const { map, platforms } = inputs.input;
    const P = L2D_POLICY;
    // Polygons by bounding box: only those whose box contains the fixture can contain it.
    const polys = [
      ...map.buildings.map((b) => ({ what: `building ${b.id}`, rings: b.rings })),
      ...map.areas.filter((a) => a.kind === 'water').map((w) => ({ what: `water ${w.id}`, rings: w.rings })),
      ...platforms.map((pl) => ({ what: `platform ${pl.id}`, rings: [pl.ring] })),
    ].filter((q) => q.rings[0]?.length >= 3);
    const boxes = polys.map((q) => {
      const xs = q.rings[0].map((v) => v[0]),
        zs = q.rings[0].map((v) => v[1]);
      return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    });
    let tested = 0;
    for (const f of output.fixtures) {
      const p = [f.x, f.z];
      polys.forEach((q, i) => {
        const [x0, z0, x1, z1] = boxes[i];
        if (p[0] < x0 || p[0] > x1 || p[1] < z0 || p[1] > z1) return;
        tested++;
        const inside = inRing(p, q.rings[0]) && !q.rings.slice(1).some((r) => inRing(p, r));
        expect(inside, `${f.id} in ${q.what}`).toBe(false);
      });
    }
    expect(tested).toBeGreaterThan(100);
    // Carriageways and tracks: a spatial pass (roads near each fixture).
    const near = new Map<string, typeof map.roads>();
    const key = (x: number, z: number) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
    for (const r of map.roads)
      for (const q of [r.a, r.b]) {
        const k = key(q[0], q[1]);
        if (!near.has(k)) near.set(k, []);
        near.get(k)!.push(r);
      }
    let checked = 0;
    for (const f of output.fixtures)
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          for (const r of near.get(key(f.x + dx * 2, f.z + dz * 2)) ?? []) {
            const d = segDist([f.x, f.z], r.a, r.b) * M;
            if (r.kind === 'road') expect(d, `${f.id} on way/${r.way}`).toBeGreaterThanOrEqual((r.width * M) / 2 + P.carriagewayClearanceM - 1e-6);
            if (r.kind === 'rail') expect(d, `${f.id} at rail way/${r.way}`).toBeGreaterThanOrEqual(P.railClearanceM - 1e-6);
            if (r.kind === 'tram') expect(d, `${f.id} at tram way/${r.way}`).toBeGreaterThanOrEqual(P.tramClearanceM - 1e-6);
            checked++;
          }
    expect(checked).toBeGreaterThan(10000);
  });
  test('lot poles stand inside their lot; yard masts on railway land; site roads on site land', () => {
    const railLand = [...elements.values()].filter((e) => e.tags.landuse === 'railway' && e.geometry).map((e) => sceneRing(e.geometry!));
    for (const f of output.fixtures) {
      const rule = ruleOf.get(f.id)!;
      if (rule === 'lot-perimeter' || rule === 'lot-grid') {
        const lot = elements.get(siteOf.get(f.id)!)!;
        expect(lot.tags.amenity).toBe('parking');
        expect(inRing([f.x, f.z], sceneRing(lot.geometry!)), f.id).toBe(true);
      }
      if (rule === 'yard-track-mast') expect(railLand.some((r) => inRing([f.x, f.z], r)), f.id).toBe(true);
      if (rule === 'site-road-one-side') {
        const land = elements.get(siteOf.get(f.id)!)!;
        expect(L2D_POLICY.siteLanduse).toContain(land.tags.landuse);
      }
    }
  });
  test('excluded kinds get nothing: lit=no, underground / multi-storey / street-side lots, small lots, driveways, spurs, tram yards', () => {
    const fromElement = new Set(output.fixtures.map((f) => `way/${f.id.split('way/')[1].split(':')[0]}`));
    let n = 0;
    for (const [k, e] of elements) {
      const t = e.tags;
      const lotOut = t.amenity === 'parking' && (['underground', 'multi-storey', 'street_side', 'lane'].includes(t.parking) || t.building);
      const roadOut = t.highway === 'service' && ['driveway', 'emergency_access'].includes(t.service);
      const trackOut = !!t.railway && (t.service === 'spur' || t.railway !== 'rail');
      if (t.lit === 'no' || lotOut || roadOut || trackOut) {
        expect(fromElement.has(k), k).toBe(false);
        n++;
      }
    }
    expect(n).toBeGreaterThan(300);
    for (const s of prov.sites as [string, string, string, string, number, string | null, number][])
      if (s[1] === 'lot' && /^smaller than/.test(s[3])) expect(s[6]).toBe(0);
  });
  test('seams: no earlier fixture re-created, none within 3 m, none within the street-cover distance', () => {
    const existing = inputs.input.existing;
    const ids = new Set(existing.map((f) => f.id));
    let nearest = Infinity;
    const grid = new Map<string, typeof existing>();
    for (const e of existing) {
      const k = `${Math.floor(e.x)},${Math.floor(e.z)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(e);
    }
    for (const f of output.fixtures) {
      expect(ids.has(f.id)).toBe(false);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          for (const e of grid.get(`${Math.floor(f.x) + dx},${Math.floor(f.z) + dz}`) ?? [])
            nearest = Math.min(nearest, Math.hypot(f.x - e.x, f.z - e.z) * M);
    }
    expect(nearest).toBeGreaterThanOrEqual(L2D_POLICY.streetCoverM);
    expect(output.counts['rejected:covered-by-street-lighting']).toBeGreaterThan(100);
  });
  test('the trigger: the lots beside Polishuset (Stinsen 1) and the yard at Norrköping C get fixtures', () => {
    const per = new Map<string, number>((prov.sites as [string, string, string, string, number, string | null, number][]).map((s) => [s[0], s[6]]));
    expect(per.get('way/96410166')).toBeGreaterThan(3); // lot beside the police building
    expect(per.get('way/428944454')).toBeGreaterThan(0); // lot by the station
    const yard = output.fixtures.filter((f) => ruleOf.get(f.id) === 'yard-track-mast');
    expect(yard.length).toBeGreaterThan(50);
  });
});

describe('the full citywide set (pilot + A1–A3 + L2a + L2bc + L2d)', () => {
  test('validates, is accepted by the controller, ≤ 32 per cell, and reports site lighting as its own category', () => {
    const registry = cityLightingRegistry(terrain, l2, l2bc, l2d);
    const v = validateRegistry(registry, { reference: terrain.data.reference, supportedTypes: FIXTURE_TYPES });
    expect(v.errors).toEqual([]);
    const stadium = createIdrottsparken(terrain);
    const renderer = { toneMappingExposure: 1, info: { programs: [] } } as unknown as WebGLRenderer;
    const city = createCityLighting({ terrain, stadium, renderer, scene: new Scene(), registry, strict: true });
    const d = city.describe();
    expect(d.fixtures).toBe(273 + l2.count + l2bc.count + l2d.count);
    expect(d.streetLighting.index!.overflowCells).toBe(0);
    expect(d.streetLighting.index!.maxRawOccupancy).toBeLessThanOrEqual(32);
    expect(d.streetLighting.rollouts!['lighting-l2d-v1']).toEqual({ mapped: 0, estimated: l2d.count });
    expect(d.siteLighting).toMatchObject({ category: 'site', rollout: 'lighting-l2d-v1', shown: true, fixtures: l2d.count });
    expect(d.siteLighting.streetFixtures).toBe(273 + l2.count + l2bc.count);
    expect(d.realtimeLights).toMatchObject({ point: 0, spot: 0 });
    city.dispose();
    // Without the site file the set is exactly the street set (the separate switch).
    const streets = createCityLighting({ terrain, stadium, renderer, scene: new Scene(), registry: cityLightingRegistry(terrain, l2, l2bc), strict: true });
    expect(streets.describe().siteLighting).toMatchObject({ shown: false, fixtures: 0 });
    expect(streets.describe().fixtures).toBe(273 + l2.count + l2bc.count);
    streets.dispose();
    stadium.dispose();
  });
});
