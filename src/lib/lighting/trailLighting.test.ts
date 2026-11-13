/**
 * Phase C2: the Vrinnevi illuminated trail (trailLighting.ts, trailGenerator.ts). Reproduction byte
 * for byte, the loop (one closed ring of 14 lit ways, 2.4 km), where the new lanterns stand (only on
 * the ways that no earlier rollout lit, beside the drawn trail, clear of buildings, water, earlier
 * fixtures and the measured trees), the lamp count against the roadmap's estimate, the switch-off
 * schedule, its flag in the lamp data, and the full citywide set through the real controller.
 */
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { Scene, Vector3, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { terrain } from '../terrain';
import { createIdrottsparken } from '../stadium/idrottsparken';
import { cityLightingRegistry, createCityLighting, RAMP_SECONDS } from './controller';
import { LAMP_TEXELS, packLampData, type ShaderLamp } from './cityLights';
import { decodeCompactSet, type CompactSet } from './compactSet';
import { validateRegistry } from './registry';
import { FIXTURE_TYPES } from './fixtures';
import { geodeticToScene, SCENE_REFERENCE } from '../geo/sweref99tm.js';
import {
  C2_GENERATOR,
  C2_POLICY,
  C2_TYPE,
  TRAIL_RELATION,
  TRAIL_SCHEDULE,
  TRAIL_WAYS,
  isTrailFixture,
  trailScheduleOn,
} from './trailLighting';
import { forestTiles, trunkRadiusM } from '../forest/forest';
import { C2_OUTPUT_FILES, generateC2, loadC2Inputs, toC2Files } from '../../../scripts/trail-c2/inputs';
import { L2_OUTPUT_FILES, L2BC_OUTPUT_FILES } from '../../../scripts/lighting-l2/inputs';
import { L2D_OUTPUT_FILES } from '../../../scripts/lighting-l2d/inputs';

const M = terrain.data.reference.metresPerUnit;
const input = loadC2Inputs();
const output = generateC2(input);
const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8')) as CompactSet;
const l2 = read(L2_OUTPUT_FILES.runtime);
const l2bc = read(L2BC_OUTPUT_FILES.runtime);
const l2d = read(L2D_OUTPUT_FILES.runtime);
const wayOf = (id: string) => Number(/way\/(\d+)/.exec(id)![1]);
const ways = new Map(input.source.elements.map((w) => [w.id, w]));
const scenePoints = (id: number) =>
  ways.get(id)!.geometry.map(([la, lo]) => geodeticToScene(SCENE_REFERENCE, la, lo) as [number, number]);
const segDist = (p: number[], a: number[], b: number[]) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
const lineDist = (p: number[], pts: number[][]) => {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i]));
  return d;
};
const loopDist = (p: number[]) => Math.min(...TRAIL_WAYS.map((w) => lineDist(p, scenePoints(w))));

describe('the loop', () => {
  test('is the route relation: 14 ways, all tagged lit=yes, 2.4 km, one closed ring', () => {
    expect(input.source.meta.relation.element).toBe(`relation/${TRAIL_RELATION}`);
    expect([...input.source.meta.relation.members].sort((a, b) => a - b)).toEqual([...TRAIL_WAYS]);
    expect(input.source.elements.map((w) => w.id)).toEqual([...TRAIL_WAYS]);
    for (const w of input.source.elements) expect(w.tags.lit, `way/${w.id}`).toBe('yes');
    // The municipality lists the trail as 2.4 km.
    expect(output.counts.loopLengthM).toBeGreaterThan(2300);
    expect(output.counts.loopLengthM).toBeLessThan(2500);
    // Every way appears once in the walk, and consecutive ways share an end node (generateTrail
    // throws otherwise).
    expect(output.ways.map((w) => w.order)).toEqual(output.ways.map((_, i) => i));
    expect(new Set(output.ways.map((w) => w.way)).size).toBe(14);
  });
  test('a broken loop is an error, not a silent partial result', () => {
    const elements = input.source.elements.filter((w) => w.id !== 372645636);
    expect(() => generateC2({ ...input, source: { ...input.source, elements } })).toThrow(/closed loop/);
  });
});

describe('C2 generation', () => {
  test('committed runtime, provenance and statistics equal a fresh generation, byte for byte', () => {
    const files = toC2Files(output, input);
    expect(fs.readFileSync(C2_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
    expect(fs.readFileSync(C2_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
    expect(fs.readFileSync(C2_OUTPUT_FILES.stats, 'utf8')).toBe(files.stats);
  });
  test('input order does not change the outcome', () => {
    const shuffled = {
      ...input,
      source: { ...input.source, elements: [...input.source.elements].reverse() },
      existing: [...input.existing].reverse(),
      map: { ...input.map, roads: [...input.map.roads].reverse(), buildings: [...input.map.buildings].reverse() },
    };
    expect(generateC2(shuffled)).toEqual(output);
  });
  test('only the ways that no earlier rollout lit get lanterns; the earlier lanterns are untouched', () => {
    const earlier = output.ways.filter((w) => w.earlierFixtures > 0);
    expect(earlier.map((w) => w.highway)).toEqual(['path', 'path', 'path', 'path']);
    expect(earlier.every((w) => w.fixtures === 0)).toBe(true);
    expect(output.counts.earlierFixturesOnLoop).toBe(43);
    const lit = new Set(earlier.map((w) => w.way));
    for (const f of output.fixtures) {
      expect(lit.has(wayOf(f.id)), f.id).toBe(false);
      expect(TRAIL_WAYS).toContain(wayOf(f.id));
      expect(f.id.startsWith(`estimate:${C2_GENERATOR.version}:way/`), f.id).toBe(true);
      expect(f.placement).toBe('estimated');
      expect(f.mount.kind).toBe('ground');
      expect(f.type).toBe(C2_TYPE);
      expect(FIXTURE_TYPES).toContain(f.type);
    }
    // No ID of this phase exists in an earlier set, and the dark ways form one continuous run.
    const existingIds = new Set(input.existing.map((f) => f.id));
    expect(output.fixtures.some((f) => existingIds.has(f.id))).toBe(false);
    expect(output.runs.length).toBe(1);
    expect(output.rejected).toEqual([]);
  });
  test('the lamp count agrees with the roadmap (80–120) and with the only count found (about 100)', () => {
    expect(output.fixtures.length).toBe(58);
    expect(output.counts.loopFixtures).toBe(101);
    expect(output.counts.loopFixtures).toBeGreaterThanOrEqual(80);
    expect(output.counts.loopFixtures).toBeLessThanOrEqual(120);
    expect(Math.abs(output.counts.loopFixtures - C2_POLICY.observedLoopLamps)).toBeLessThanOrEqual(5);
  });
  test('posts stand beside the drawn trail, at the trail spacing, clear of earlier fixtures, buildings and water', () => {
    const { buildings, areas } = input.map;
    const water = areas.filter((a) => a.kind === 'water');
    for (const f of output.fixtures) {
      const p = [f.x, f.z];
      // 2 m drawn trail: 1.0 m half width + 0.2 m setback (positions are rounded to 2.5 mm).
      expect(lineDist(p, scenePoints(wayOf(f.id))) * M, f.id).toBeGreaterThan(1.15);
      expect(loopDist(p) * M, f.id).toBeLessThan(1.25);
      for (const e of input.existing)
        if (Math.abs(e.x - f.x) < 1 && Math.abs(e.z - f.z) < 1)
          expect(Math.hypot(e.x - f.x, e.z - f.z) * M, `${f.id} / ${e.id}`).toBeGreaterThanOrEqual(C2_POLICY.coverM);
      for (const b of [...buildings, ...water]) {
        const ring = b.rings[0];
        if (!ring?.length) continue;
        const near = ring.some((q) => Math.abs(q[0] - f.x) < 2 && Math.abs(q[1] - f.z) < 2);
        if (near) expect(lineDist(p, ring) * M, `${f.id} / ${b.id}`).toBeGreaterThan(C2_POLICY.buildingClearanceM);
      }
    }
    // Neighbouring lanterns of this phase: the effective spacing (24.8 m), within the shift range.
    const sorted = [...output.provenance].sort((a, b) => a.station.index - b.station.index);
    const byId = new Map(output.fixtures.map((f) => [f.id, f]));
    for (let i = 1; i < sorted.length; i++) {
      const a = byId.get(sorted[i - 1].id)!,
        b = byId.get(sorted[i].id)!;
      const d = Math.hypot(a.x - b.x, a.z - b.z) * M;
      expect(d, `${a.id} → ${b.id}`).toBeGreaterThan(12);
      expect(d, `${a.id} → ${b.id}`).toBeLessThan(C2_POLICY.spacingM + 6);
      expect(sorted[i].station.spacingM).toBeCloseTo(1439.8 / 58, 1);
    }
  });
  test('no post stands inside a tree drawn from the laser data (Phase C1)', () => {
    let nearest = Infinity;
    for (const tile of forestTiles())
      for (const t of tile.trees)
        for (const f of output.fixtures) {
          const d = Math.hypot(t.x - f.x, t.z - f.z) * M - trunkRadiusM(t.heightM);
          if (d < nearest) nearest = d;
        }
    // Clear of every trunk by more than the post's own radius (0.07 m at the base).
    expect(nearest).toBeGreaterThan(0.1);
  });
});

describe('the switch-off schedule', () => {
  test('is labelled an assumption: on from 06.00, off from 22.00, local time', () => {
    expect(TRAIL_SCHEDULE.status).toBe('assumption');
    const at = (h: number, m = 0) => trailScheduleOn(h * 60 + m);
    expect([at(5, 59), at(6), at(12), at(21, 59), at(22), at(23, 30), at(0), at(3)]).toEqual([
      false, true, true, true, false, false, false, false,
    ]);
    // Presets may pass minutes beyond midnight (next calendar day).
    expect(trailScheduleOn(1440 + 60)).toBe(false);
    expect(trailScheduleOn(1440 + 7 * 60)).toBe(true);
  });
  test('covers every lantern on the loop, of this phase and of L2bc, and nothing else', () => {
    for (const f of output.fixtures) expect(isTrailFixture(f.id), f.id).toBe(true);
    const bc = decodeCompactSet(l2bc).fixtures.filter((f) => isTrailFixture(f.id));
    expect(bc.length).toBe(43);
    for (const f of bc) expect(loopDist([f.x, f.z]) * M, f.id).toBeLessThan(3);
    for (const set of [l2, l2d]) expect(decodeCompactSet(set).fixtures.some((f) => isTrailFixture(f.id))).toBe(false);
    expect(isTrailFixture('osm:node/26223168')).toBe(false);
    expect(isTrailFixture('estimate:lighting-l2bc-v1:way/1:s0')).toBe(false);
  });
  test('the flag shares one float with the bridge flag in the lamp data', () => {
    const lamp = (clipBelow: boolean, scheduled: boolean): ShaderLamp => ({
      x: 0, y: 1, z: 0, rangeM: 16, color: [1, 1, 1], candela: 380, profile: 1, baseY: 0, clipBelow, scheduled, occlusionM: [],
    });
    const { data, width } = packLampData([lamp(false, false), lamp(true, false), lamp(false, true), lamp(true, true)]);
    expect(width).toBe(LAMP_TEXELS);
    expect([0, 1, 2, 3].map((i) => data[i * width * 4 + 9])).toEqual([0, 1, 2, 3]);
    // A lamp without the field is an ordinary lamp (every earlier phase's data).
    const plain = { ...lamp(false, false) };
    delete plain.scheduled;
    expect(packLampData([plain]).data[9]).toBe(0);
  });
});

describe('the full citywide set with the trail', () => {
  test('validates, adds exactly the 58 lanterns, schedules the 101 lamps of the loop, and switches them with the clock', () => {
    const registry = cityLightingRegistry(terrain, l2, l2bc, l2d, true);
    const v = validateRegistry(registry, { reference: terrain.data.reference, supportedTypes: FIXTURE_TYPES });
    expect(v.errors).toEqual([]);
    const stadium = createIdrottsparken(terrain);
    const renderer = { toneMappingExposure: 1, info: { programs: [] } } as unknown as WebGLRenderer;
    const city = createCityLighting({ terrain, stadium, renderer, scene: new Scene(), registry, strict: true });
    const before = 273 + l2.count + l2bc.count + l2d.count;
    let d = city.describe();
    expect(d.fixtures).toBe(before + 58);
    expect(d.streetLighting.index!.overflowCells).toBe(0);
    expect(d.streetLighting.index!.maxRawOccupancy).toBeLessThanOrEqual(32);
    expect(d.streetLighting.rollouts![C2_GENERATOR.version]).toEqual({ mapped: 0, estimated: 58 });
    expect(d.trailLighting).toMatchObject({ category: 'trail', rollout: C2_GENERATOR.version, fixtures: 58, scheduled: 101 });
    expect(city.lamps.filter((l) => l.scheduled).length).toBe(101);
    expect(d.realtimeLights).toMatchObject({ point: 0, spot: 0 });

    const camera = { position: new Vector3(0, 10, 0) } as unknown as PerspectiveCamera;
    const frame = (dt: number) => {
      try {
        city.update(dt, camera, 800);
      } catch {
        // The stub camera has no matrices (sky, halos); the levels are set before those are read.
      }
    };
    const at = (minutes: number) => city.set({ date: '2026-11-13', minutes, stadium: 'off' });
    // 21:30, dark: on. A jump to 22:30 ramps the trail down; the street level is untouched.
    at(21 * 60 + 30);
    city.settle();
    frame(0);
    expect(city.describe().trailLighting).toMatchObject({ on: true, level: 1 });
    expect(city.uniforms.cityScheduleLevel.value).toBe(1);
    at(22 * 60 + 30);
    frame(RAMP_SECONDS / 2);
    d = city.describe();
    expect(d.trailLighting.on).toBe(false);
    expect(d.trailLighting.level).toBeGreaterThan(0.2);
    expect(d.trailLighting.level).toBeLessThan(0.8);
    frame(RAMP_SECONDS);
    expect(city.uniforms.cityScheduleLevel.value).toBe(0);
    // 05:30 still off, 06:30 on again (settle ends the ramp at once).
    at(5 * 60 + 30);
    city.settle();
    expect(city.describe().trailLighting).toMatchObject({ on: false, level: 0 });
    at(6 * 60 + 30);
    city.settle();
    expect(city.describe().trailLighting).toMatchObject({ on: true, level: 1 });
    city.dispose();

    // Without the trail argument the set is exactly the earlier one (the earlier phases' tests).
    const earlier = createCityLighting({ terrain, stadium, renderer, scene: new Scene(), registry: cityLightingRegistry(terrain, l2, l2bc, l2d), strict: true });
    expect(earlier.describe().fixtures).toBe(before);
    expect(earlier.describe().trailLighting).toMatchObject({ fixtures: 0, scheduled: 43 });
    earlier.dispose();
    stadium.dispose();
  });
});
