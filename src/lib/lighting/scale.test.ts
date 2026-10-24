/**
 * Lighting Phase L1: city-scale behaviour in the main suite, on a SYNTHETIC grid city (no real
 * data): ≈ 28 000 street brackets and lanterns along a 100 m street grid over 4 × 4 km.
 * - the index accepts it, stores only the actual (cell, lamp) entries and never exceeds 32 per cell;
 * - gathering never drops an instance, keeps the draw-call count constant and bounds the triangles
 *   near any camera, independent of the city total.
 */
import { describe, expect, test } from 'vitest';
import { Vector3 } from 'three';
import { MAX_PER_CELL, type ShaderLamp } from './cityLights';
import { createFixtureVisuals, POLE_DETAIL, type FixtureRecord } from './fixtures';
import { buildLightIndex } from './lightIndex';

const M = 25;
const SPAN = 4000 / M; // scene units
const STREET = 100 / M;
function syntheticCity() {
  const fixtures: FixtureRecord[] = [];
  const lamps: ShaderLamp[] = [];
  const add = (x: number, z: number, heading: number | null, lantern: boolean) => {
    const id = `estimate:synthetic:${String(fixtures.length).padStart(6, '0')}`;
    const type = lantern ? 'park-lantern-4m' : 'street-bracket-6m';
    fixtures.push({
      id,
      pilot: 'synthetic',
      type,
      x,
      z,
      heading,
      mount: { kind: 'ground' },
      placement: 'estimated',
      heightM: lantern ? 4.2 : 6,
      cct: lantern ? 2700 : 3000,
      candela: lantern ? 380 : 900,
      rangeM: lantern ? 16 : 24,
      profile: lantern ? 1 : 0,
      occlusionM: Array(16).fill(lantern ? 16 : 24),
    });
    lamps.push({
      x,
      y: (lantern ? 4 : 5.9) / M,
      z,
      rangeM: lantern ? 16 : 24,
      color: [1, 0.9, 0.8],
      candela: lantern ? 380 : 900,
      profile: lantern ? 1 : 0,
      heading: heading ?? 0,
      baseY: 0,
      clipBelow: false,
      occlusionM: Array(16).fill(lantern ? 16 : 24),
    });
  };
  // Streets every 100 m in x and z; brackets every 18 m on both kerbs (±6 m, denser than the pilot
  // table, so junction cells exceed the old 16-slot limit); a footway with
  // lanterns every 22 m along every second street.
  for (let s = 0; s * STREET <= SPAN; s++) {
    const c = s * STREET;
    for (let t = 0; t <= SPAN; t += 18 / M) {
      add(c - 6 / M, t, Math.PI / 2, false);
      add(c + 6 / M, t + 9 / M, -Math.PI / 2, false);
      add(t, c - 6 / M, 0, false);
      add(t + 9 / M, c + 6 / M, Math.PI, false);
    }
    if (s % 2)
      for (let t = 0; t <= SPAN; t += 22 / M) add(c + 15 / M, t, null, true);
  }
  return { fixtures, lamps };
}

describe('city scale (synthetic, Phase L1)', () => {
  const { fixtures, lamps } = syntheticCity();
  test('≈ 28 000 lamps: accepted, ≤ 32 per cell, list memory follows the entries', () => {
    expect(fixtures.length).toBeGreaterThan(25000);
    const built = buildLightIndex(
      lamps.map((l, i) => ({ id: fixtures[i].id, x: l.x, z: l.z, rangeM: l.rangeM })),
      { metresPerUnit: M, maxTextureSize: 4096 },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const s = built.index.stats;
    expect(s.maxRawOccupancy).toBeGreaterThan(16); // would have been rejected before L1
    expect(s.maxRawOccupancy).toBeLessThanOrEqual(MAX_PER_CELL);
    expect(s.list.entries).toBe(s.cellEntries);
    expect(s.list.bytes).toBeLessThan(s.cellEntries * 4 + 4096 * 4);
    // Headers + list together stay well below the old 16 fixed slots per cell.
    expect(s.payload.bytes + s.list.bytes).toBeLessThan(s.pages * 16 * 16 * 4);
  });
  test('gathering: no dropped instance, constant draw calls, bounded triangles near any camera', () => {
    const visuals = createFixtureVisuals(fixtures, lamps, M);
    let seed = 3;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    let maxTriangles = 0,
      maxMeshes = 0;
    for (let k = 0; k < 150; k++) {
      const p = new Vector3(rnd() * SPAN, 0.08 + rnd() * 6, rnd() * SPAN);
      visuals.update({ position: p } as never, 1, 900, { near: 700, far: 1700 });
      const c = visuals.counts();
      expect(c.droppedLastGather).toBe(0);
      maxTriangles = Math.max(maxTriangles, c.detailTriangles);
      let drawn = 0;
      visuals.group.traverse((o) => {
        if ((o as { isInstancedMesh?: boolean }).isInstancedMesh && o.visible) drawn++;
      });
      maxMeshes = Math.max(maxMeshes, drawn);
    }
    const c = visuals.counts();
    expect(c.instancedMeshes).toBeLessThanOrEqual(13);
    expect(maxMeshes).toBeLessThanOrEqual(c.instancedMeshes);
    // A dense synthetic grid (≈ 1 250 lamps per km²): housings within POLE_DETAIL stay bounded.
    expect(maxTriangles).toBeGreaterThan(0);
    expect(maxTriangles).toBeLessThan(150_000);
    expect(POLE_DETAIL * M).toBe(600);
    visuals.dispose();
  });
});
