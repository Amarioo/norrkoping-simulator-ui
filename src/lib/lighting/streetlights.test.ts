import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { terrain, ROAD_SURFACE } from '../terrain';
import { cityMap, pointInRing } from '../mapModel';
import { FIXTURES, fixtureLamps, mountHeight, LIGHTING_META, type FixtureRecord } from './fixtures';
import source from '../../../scripts/data/norrkoping-lighting-source.json';
import provenanceData from '../data/streetlights-provenance.json';

interface Provenance {
  id: string;
  method: string;
  uncertaintyM: number;
  source: { element: string };
  observed: string[];
  inferred: string[];
}
const provenance = new Map((provenanceData.fixtures as Provenance[]).map((p) => [p.id, p]));
const prov = (f: FixtureRecord) => provenance.get(f.id)!;

const M = terrain.data.reference.metresPerUnit;
const pilots = LIGHTING_META.pilots as {
  id: string;
  bounds: { x0: number; x1: number; z0: number; z1: number };
}[];
const segDist = (p: number[], a: number[], b: number[]) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
type Element = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags: Record<string, string>;
};
const elements = (pilot: string) =>
  (source.pilots as unknown as Record<string, { elements: Element[] }>)[pilot].elements;

describe('pilot fixtures: provenance and coverage', () => {
  test('three pilots, stable unique ids, every fixture inside its pilot', () => {
    expect(pilots.map((p) => p.id)).toEqual(['kungsgatan', 'stromparken', 'idrottsparken']);
    const ids = new Set(FIXTURES.map((f) => f.id));
    expect(ids.size).toBe(FIXTURES.length);
    for (const f of FIXTURES) {
      const b = pilots.find((p) => p.id === f.pilot)!.bounds;
      expect(f.x >= b.x0 && f.x <= b.x1 && f.z >= b.z0 && f.z <= b.z1).toBe(true);
      expect(f.id.startsWith(f.pilot + ':')).toBe(true);
    }
  });
  test('mapped fixtures are exactly the OSM lamp nodes, at their projected positions', () => {
    for (const pilot of pilots) {
      const nodes = elements(pilot.id).filter(
        (e) => e.type === 'node' && e.tags.highway === 'street_lamp',
      );
      const mapped = FIXTURES.filter((f) => f.pilot === pilot.id && f.placement === 'mapped');
      const inside = nodes.filter((n) => {
        const [x, z] = terrain.project(n.lat!, n.lon!);
        return (
          x >= pilot.bounds.x0 &&
          x <= pilot.bounds.x1 &&
          z >= pilot.bounds.z0 &&
          z <= pilot.bounds.z1
        );
      });
      expect(mapped.length).toBe(inside.length);
      for (const n of inside) {
        const f = mapped.find((m) => prov(m).source.element === `node/${n.id}`)!;
        expect(f).toBeDefined();
        const [x, z] = terrain.project(n.lat!, n.lon!);
        expect(Math.hypot(f.x - x, f.z - z) * M).toBeLessThan(0.01);
        expect(prov(f).observed.join(' ')).toMatch(/mapped, not surveyed/);
      }
    }
    // Strömparken's nine 2023 OSM lamps are all used.
    expect(
      FIXTURES.filter((f) => f.pilot === 'stromparken' && f.placement === 'mapped').length,
    ).toBe(9);
  });
  test('estimates only on lit=yes ways; lit=no and untagged ways get none', () => {
    expect(provenance.size).toBe(FIXTURES.length);
    for (const f of FIXTURES.filter(
      (x) => x.placement === 'estimated' && prov(x).source.element.startsWith('way/'),
    )) {
      const id = Number(prov(f).source.element.split('/')[1]);
      const way = elements(f.pilot).find((e) => e.type === 'way' && e.id === id)!;
      expect(way.tags.lit).toBe('yes');
      expect(prov(f).inferred).toContain('pole position');
      expect(prov(f).uncertaintyM).toBeGreaterThan(0);
    }
  });
  test('mapped coverage suppresses procedural duplicates', () => {
    const types = LIGHTING_META.types as Record<string, { suppressM: number }>;
    for (const m of FIXTURES.filter((f) => f.placement === 'mapped'))
      for (const e of FIXTURES.filter(
        (f) =>
          f.placement === 'estimated' &&
          f.pilot === m.pilot &&
          prov(f).source.element.startsWith('way/'),
      ))
        expect(Math.hypot(m.x - e.x, m.z - e.z) * M).toBeGreaterThanOrEqual(
          types[e.type].suppressM - 1e-6,
        );
  });
  test('regenerating from the local snapshot reproduces the same fixtures', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'streetlights-'));
    execFileSync(process.execPath, ['scripts/step6/import-streetlights.mjs'], {
      env: { ...process.env, OUT: out },
      stdio: 'pipe',
    });
    const again = JSON.parse(fs.readFileSync(path.join(out, 'streetlights.json'), 'utf8'));
    const againProvenance = JSON.parse(
      fs.readFileSync(path.join(out, 'streetlights-provenance.json'), 'utf8'),
    );
    fs.rmSync(out, { recursive: true });
    expect(again.fixtures).toEqual(FIXTURES);
    expect(againProvenance.fixtures).toEqual(provenanceData.fixtures);
  });
});

describe('pilot fixtures: clearances and mounting', () => {
  const roads = cityMap.roads.filter((r) => r.kind === 'road');
  const trams = cityMap.roads.filter((r) => r.kind === 'tram' || r.kind === 'rail');
  const near = (f: FixtureRecord, r: { a: number[]; b: number[] }) =>
    Math.min(Math.hypot(r.a[0] - f.x, r.a[1] - f.z), Math.hypot(r.b[0] - f.x, r.b[1] - f.z)) < 3;
  test('no pole in a carriageway, on a tram/rail track or inside a building', () => {
    for (const f of FIXTURES) {
      const onBridge = f.mount.kind === 'bridge';
      for (const r of roads.filter((r) => near(f, r))) {
        if (onBridge && r.bridge) continue; // deck-edge lamps stand on the deck beside the carriageway
        expect(segDist([f.x, f.z], r.a, r.b) * M, `${f.id} vs road way ${r.way}`).toBeGreaterThan(
          (r.width * M) / 2 + 0.3,
        );
      }
      for (const r of trams.filter((r) => near(f, r)))
        expect(segDist([f.x, f.z], r.a, r.b) * M).toBeGreaterThan(1.1);
      for (const b of cityMap.buildings.filter((b) =>
        b.rings[0].some((p) => Math.hypot(p[0] - f.x, p[1] - f.z) < 2),
      ))
        expect(pointInRing([f.x, f.z], b.rings[0]), `${f.id} in ${b.id}`).toBe(false);
    }
  });
  test('ground fixtures stand on the rendered ground, bridge fixtures on the drawn deck', () => {
    const lamps = fixtureLamps(FIXTURES, terrain);
    FIXTURES.forEach((f, i) => {
      const base = lamps[i].baseY;
      if (f.mount.kind === 'ground') expect(base).toBeCloseTo(terrain.groundHeight(f.x, f.z), 9);
      else {
        const s = f.mount.segment;
        const road = cityMap.roads.find(
          (r) => r.way === s.way && r.a[0] === s.a[0] && r.a[1] === s.a[1],
        )!;
        expect(road.bridge).toBe(true);
        // The drawn deck at the fixture's station (mapModel converted heights + ROAD_SURFACE).
        const deck = road.yA + (road.yB - road.yA) * s.t + ROAD_SURFACE;
        expect(Math.abs(base - deck) * M).toBeLessThan(0.25);
        expect(base).toBeCloseTo(mountHeight(f, terrain), 12);
        expect(lamps[i].clipBelow).toBe(true);
      }
      // The emitter is at the fixture's mounting height above its base.
      expect((lamps[i].y - base) * M).toBeGreaterThan(f.heightM - 0.6);
      expect((lamps[i].y - base) * M).toBeLessThan(f.heightM + 0.1);
    });
    expect(FIXTURES.some((f) => f.mount.kind === 'bridge')).toBe(true);
  });
});
