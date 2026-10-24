/**
 * Lighting Phase 0 registry: pilot counts and provenance, stable canonical IDs, the coordinate and
 * orientation contracts, unknown fields, explicit-unlit exclusions and semantic rejection.
 */
import { describe, expect, test } from 'vitest';
import { terrain } from '../terrain';
import { geodeticToSweref, sceneToSweref, swerefToScene } from '../geo/sweref99tm.js';
import { emitterPosition, FIXTURE_TYPES, FIXTURES } from './fixtures';
import { pilotLightingRegistry } from './controller';
import {
  attachProvenance,
  canonicalPilotId,
  headingToGridAzimuth,
  pilotRegistry,
  validateRegistry,
  type LightingRegistry,
  type PilotData,
  type PilotProvenance,
  type RegistryFixture,
} from './registry';
import lightingData from '../data/streetlights.json';
import provenanceData from '../data/streetlights-provenance.json';
import source from '../../../scripts/data/norrkoping-lighting-source.json';

const ref = terrain.data.reference;
const registry = pilotLightingRegistry(terrain);
const options = { reference: ref, supportedTypes: FIXTURE_TYPES };
type Element = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
};
const elements = (pilot: string) =>
  (source.pilots as unknown as Record<string, { elements: Element[] }>)[pilot].elements;
const unlitWays = new Set(
  ['kungsgatan', 'stromparken', 'idrottsparken'].flatMap((p) =>
    elements(p)
      .filter((e) => e.type === 'way' && e.tags?.lit === 'no')
      .map((e) => `way/${e.id}`),
  ),
);

describe('pilot registry', () => {
  test('105 fixtures: 10 mapped, 95 estimated, unchanged per pilot and support', () => {
    const v = validateRegistry(registry, { ...options, unlitElements: unlitWays });
    expect(v.errors).toEqual([]);
    expect(v.counts).toMatchObject({ records: 105, fixtures: 105, mapped: 10, estimated: 95 });
    expect(v.counts.byGroup).toEqual({
      kungsgatan: { mapped: 1, estimated: 41 },
      stromparken: { mapped: 9, estimated: 16 },
      idrottsparken: { mapped: 0, estimated: 38 },
    });
    expect(v.counts.bySupport).toEqual({ ground: 98, 'bridge-deck': 7 });
  });
  test('canonical IDs are unique, follow the registry convention and cross-walk one-to-one', () => {
    const ids = registry.fixtures.map((r) => r.id);
    expect(new Set(ids).size).toBe(105);
    expect(new Set(registry.fixtures.map((r) => r.runtimeId)).size).toBe(105);
    for (const r of registry.fixtures) {
      if (r.placement === 'mapped') expect(r.id).toMatch(/^osm:node\/\d+$/);
      else
        expect(r.id).toMatch(/^estimate:step6-pilot-v1:(way\/\d+:s\d+|idrottsparken:entrance-\d)$/);
      expect(canonicalPilotId(r.runtimeId)!.id).toBe(r.id);
    }
    expect(canonicalPilotId('kungsgatan:osm-node-11231112374')).toMatchObject({
      id: 'osm:node/11231112374',
      element: 'node/11231112374',
    });
    expect(canonicalPilotId('kungsgatan:est-way-26154805-3')).toMatchObject({
      id: 'estimate:step6-pilot-v1:way/26154805:s3',
      station: 3,
    });
    expect(canonicalPilotId('something-else')).toBeNull();
  });
  test('IDs and records do not depend on input order', () => {
    const data = lightingData as unknown as PilotData;
    const reversed = pilotRegistry({ ...data, fixtures: [...data.fixtures].reverse() }, ref);
    const byId = (r: LightingRegistry) => Object.fromEntries(r.fixtures.map((f) => [f.id, f]));
    expect(byId(reversed)).toEqual(byId(registry));
  });
  test('full provenance joins without conflict: source elements, snapshot dates, mapped vs estimated evidence', () => {
    const { fixtures, issues } = attachProvenance(
      registry,
      provenanceData.fixtures as PilotProvenance[],
    );
    expect(issues).toEqual([]);
    for (const { record, provenance } of fixtures) {
      expect(record.source.element).toBe(provenance!.source.element);
      expect(record.source.snapshot).toMatch(/^2026-10-21T15:5\d:\d\dZ$/);
      expect(record.source.licence).toMatch(/ODbL/);
      if (record.placement === 'estimated' && record.generator.method === 'lit-way-station')
        expect(provenance!.source.tags!.lit).toBe('yes');
    }
    // Entrance posts: their source element is only in the provenance file.
    const entrances = fixtures.filter((f) => f.record.generator.method === 'pilot-site');
    expect(entrances).toHaveLength(3);
    expect(
      registry.fixtures
        .filter((r) => r.generator.method === 'pilot-site')
        .every((r) => r.source.element === null),
    ).toBe(true);
  });
  test('unknown fields stay unknown; pilot assumptions are labelled estimates, never known', () => {
    for (const r of registry.fixtures) {
      expect(r.position.heightRh2000M).toBeNull();
      expect(r.activation).toEqual({ mode: 'solar-night', schedule: null, status: 'estimated' });
      expect(r.photometry.status).toBe('estimated');
      expect(r.mountingHeightM.status).toBe('estimated');
      expect(r.position.status).toBe(r.placement === 'mapped' ? 'known' : 'estimated');
      expect(r.support.status).toBe('derived');
      expect(r.generator.seed).toBeNull();
      if (r.placement === 'mapped')
        expect(r.orientation).toEqual({
          sceneHeadingRad: null,
          gridAzimuthDeg: null,
          status: 'unknown',
        });
    }
  });
  test('E/N are EPSG:3006 metres derived from the stored scene values; rendering uses those values unchanged', () => {
    for (const r of registry.fixtures) {
      const [e, n] = sceneToSweref(ref as never, r.position.scene.x, r.position.scene.z);
      expect([r.position.e, r.position.n]).toEqual([e, n]);
      const [x, z] = swerefToScene(ref as never, r.position.e, r.position.n);
      expect(Math.abs(x - r.position.scene.x) * 25).toBeLessThan(1e-6);
      expect(Math.abs(z - r.position.scene.z) * 25).toBeLessThan(1e-6);
      const f = FIXTURES.find((q) => q.id === r.runtimeId)!;
      expect([r.position.scene.x, r.position.scene.z]).toEqual([f.x, f.z]);
    }
    // Independent check of mapped positions: OSM node lat/lon → TM, against the registry E/N.
    for (const r of registry.fixtures.filter((q) => q.placement === 'mapped')) {
      const node = elements(r.group).find((e) => `node/${e.id}` === r.source.element)!;
      const [e, n] = geodeticToSweref(node.lat!, node.lon!);
      expect(Math.hypot(e - r.position.e, n - r.position.n)).toBeLessThan(0.005); // 4-decimal scene rounding
    }
  });
  test('grid azimuth convention: clockwise from grid north, matches the bracket arm direction', () => {
    expect(headingToGridAzimuth(0)).toBeCloseTo(180, 12); // arm towards +z = grid south
    expect(headingToGridAzimuth(Math.PI / 2)).toBeCloseTo(90, 12); // +x = east
    expect(headingToGridAzimuth(Math.PI)).toBeCloseTo(0, 12);
    expect(headingToGridAzimuth(-Math.PI / 2)).toBeCloseTo(270, 12);
    for (const r of registry.fixtures.filter((q) => q.orientation.sceneHeadingRad !== null)) {
      const f = FIXTURES.find((q) => q.id === r.runtimeId)!;
      const [ex, , ez] = emitterPosition(f, 0, 25);
      if (Math.hypot(ex - f.x, ez - f.z) < 1e-9) continue; // lanterns have no arm offset
      const az = (Math.atan2(ex - f.x, -(ez - f.z)) * 180) / Math.PI;
      expect(Math.abs(((az + 360) % 360) - r.orientation.gridAzimuthDeg!) % 360).toBeLessThan(1e-6);
    }
  });
  test('no fixture derives from an explicitly unlit way; an injected one is rejected', () => {
    expect(unlitWays.size).toBeGreaterThan(0);
    for (const r of registry.fixtures) expect(unlitWays.has(r.source.element ?? '')).toBe(false);
    const unlit = [...unlitWays][0];
    const bad = mutate(0, (r) => ({
      ...r,
      id: `estimate:step6-pilot-v1:${unlit}:s0`,
      placement: 'estimated',
      illumination: 'estimated',
      generator: { ...r.generator, method: 'lit-way-station', station: 0 },
      position: { ...r.position, status: 'estimated' },
      source: { ...r.source, element: unlit },
    }));
    expect(issues(bad, unlitWays)).toContainEqual(
      expect.objectContaining({
        field: 'illumination',
        message: expect.stringMatching(/explicitly unlit/),
      }),
    );
  });
});

/** Registry with fixture i replaced. */
const mutate = (i: number, f: (r: RegistryFixture) => unknown): LightingRegistry => ({
  ...registry,
  fixtures: registry.fixtures.map((r, k) => (k === i ? (f(r) as RegistryFixture) : r)),
});
const issues = (r: LightingRegistry, unlitElements?: Set<string>) =>
  validateRegistry(r, { ...options, unlitElements }).errors;
const bracket = registry.fixtures.findIndex((r) => r.photometry.profile === 0);
const lantern = registry.fixtures.findIndex((r) => r.placement === 'mapped');

describe('semantic rejection before allocation', () => {
  const cases: [string, LightingRegistry, string][] = [
    [
      'duplicate canonical ID',
      {
        ...registry,
        fixtures: [...registry.fixtures, { ...registry.fixtures[2], runtimeId: 'x:dup' }],
      },
      'id',
    ],
    [
      'non-finite position',
      mutate(1, (r) => ({ ...r, position: { ...r.position, e: Number.NaN } })),
      'position',
    ],
    [
      'missing geometry is not placed at the origin',
      mutate(1, (r) => ({ ...r, position: null })),
      'position',
    ],
    [
      'E/N 0/0 outside the map',
      mutate(1, (r) => ({ ...r, position: { ...r.position, e: 0, n: 0 } })),
      'position',
    ],
    [
      'E/N disagree with the stored scene value',
      mutate(1, (r) => ({ ...r, position: { ...r.position, e: r.position.e + 0.5 } })),
      'position',
    ],
    ['wrong CRS', { ...registry, horizontalCrs: 'EPSG:4326' as never }, 'horizontalCrs'],
    [
      'range too large',
      mutate(1, (r) => ({ ...r, photometry: { ...r.photometry, rangeM: 500 } })),
      'photometry.rangeM',
    ],
    [
      'negative intensity',
      mutate(1, (r) => ({ ...r, photometry: { ...r.photometry, candela: -1 } })),
      'photometry.candela',
    ],
    [
      'colour temperature out of bounds',
      mutate(1, (r) => ({ ...r, photometry: { ...r.photometry, cctK: 300 } })),
      'photometry.cctK',
    ],
    [
      'unsupported fixture type',
      mutate(1, (r) => ({ ...r, photometry: { ...r.photometry, fixtureType: 'airport-papi' } })),
      'photometry.fixtureType',
    ],
    [
      'unsupported profile',
      mutate(1, (r) => ({ ...r, photometry: { ...r.photometry, profile: 2 } })),
      'photometry.profile',
    ],
    [
      'street distribution without orientation',
      mutate(bracket, (r) => ({
        ...r,
        orientation: { sceneHeadingRad: null, gridAzimuthDeg: null, status: 'unknown' },
      })),
      'orientation',
    ],
    [
      'azimuth inconsistent with heading',
      mutate(bracket, (r) => ({ ...r, orientation: { ...r.orientation, gridAzimuthDeg: 12 } })),
      'orientation',
    ],
    [
      'occlusion sectors missing',
      mutate(1, (r) => ({ ...r, occlusionM: { ...r.occlusionM, values: [1, 2, 3] } })),
      'occlusionM',
    ],
    [
      'mounting height invalid',
      mutate(1, (r) => ({ ...r, mountingHeightM: { value: 0, status: 'estimated' } })),
      'mountingHeightM',
    ],
    [
      'bridge station outside the segment',
      mutate(
        registry.fixtures.findIndex((r) => r.support.kind === 'bridge-deck'),
        (r) => ({
          ...r,
          support: {
            ...r.support,
            segment: { ...(r.support as { segment: object }).segment, t: 1.5 },
          },
        }),
      ),
      'support.segment',
    ],
    [
      'mapped record labelled estimated',
      mutate(lantern, (r) => ({ ...r, illumination: 'estimated' })),
      'illumination',
    ],
    ['estimate with a mapped node ID', mutate(1, (r) => ({ ...r, id: 'osm:node/1' })), 'id'],
    [
      'mapped ID not matching its element',
      mutate(lantern, (r) => ({ ...r, source: { ...r.source, element: 'node/1' } })),
      'source.element',
    ],
    [
      'unknown source dataset',
      mutate(1, (r) => ({ ...r, source: { ...r.source, dataset: 'nowhere' } })),
      'source.dataset',
    ],
    [
      'missing dataset revision',
      mutate(1, (r) => ({ ...r, source: { ...r.source, snapshot: '' } })),
      'source.snapshot',
    ],
    [
      'missing generator version',
      mutate(1, (r) => ({ ...r, generator: { ...r.generator, version: '' } })),
      'generator',
    ],
    ['unresolved parent', mutate(1, (r) => ({ ...r, parentId: 'osm:node/42' })), 'parentId'],
    ['non-fixture role', mutate(1, (r) => ({ ...r, role: 'site' })), 'role'],
    [
      'unsupported activation',
      mutate(1, (r) => ({
        ...r,
        activation: { mode: 'event', schedule: null, status: 'estimated' },
      })),
      'activation',
    ],
  ];
  test.each(cases)('%s', (_, r, field) => {
    expect(issues(r).map((e) => e.field)).toContain(field);
  });
  test('the valid pilot has no issues and duplicates are never merged by distance', () => {
    expect(issues(registry)).toEqual([]);
    // Two distinct IDs at one position are two fixtures (no proximity merge); they stay valid records.
    const twin = {
      ...registry.fixtures[1],
      id: registry.fixtures[1].id.replace(/:s(\d+)$/, ':s9$1'),
      runtimeId: 'twin',
    };
    expect(issues({ ...registry, fixtures: [...registry.fixtures, twin] })).toEqual([]);
  });
});
