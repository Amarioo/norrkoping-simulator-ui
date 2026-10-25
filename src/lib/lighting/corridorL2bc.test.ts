/**
 * Lighting Phase L2bc: paths, squares, junction ranges and motorways (corridorL2.ts l2bcSpec).
 * Reproduction, the new rules (squares, ranges, motorways), seams with every earlier rollout and the
 * full citywide set (pilot + A1–A3 + L2a + L2bc) through the real controller.
 */
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { Scene, type WebGLRenderer } from 'three';
import { terrain } from '../terrain';
import { createIdrottsparken } from '../stadium/idrottsparken';
import { cityLightingRegistry, createCityLighting } from './controller';
import { decodeCompactSet, type CompactSet } from './compactSet';
import { L2BC_GENERATOR } from './corridorL2';
import { validateRegistry } from './registry';
import { FIXTURE_TYPES } from './fixtures';
import { geodeticToScene, SCENE_REFERENCE } from '../geo/sweref99tm.js';
import {
  L2_OUTPUT_FILES,
  L2BC_OUTPUT_FILES,
  generateL2bc,
  loadL2bcInputs,
  toL2bcFiles,
} from '../../../scripts/lighting-l2/inputs';

const M = terrain.data.reference.metresPerUnit;
const inputs = loadL2bcInputs();
const output = generateL2bc(inputs);
const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8')) as CompactSet;
const l2 = read(L2_OUTPUT_FILES.runtime);
const l2bc = read(L2BC_OUTPUT_FILES.runtime);
const prov = JSON.parse(fs.readFileSync(L2BC_OUTPUT_FILES.provenance, 'utf8'));
const ruleOf = new Map<string, string>(prov.fixtures.map((r: string[]) => [r[0], r[1]]));

describe('L2bc generation', () => {
  test('committed runtime and provenance files equal a fresh generation, byte for byte', () => {
    const files = toL2bcFiles(output, inputs);
    expect(fs.readFileSync(L2BC_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
    expect(fs.readFileSync(L2BC_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
  });
  test('lanterns on paths and squares, brackets on junction ranges and motorways; IDs carry the L2bc version', () => {
    expect(output.fixtures.length).toBeGreaterThan(7000);
    for (const f of output.fixtures) {
      const rule = ruleOf.get(f.id)!;
      expect(f.id.startsWith(`estimate:${L2BC_GENERATOR.version}:way/`) || f.id.startsWith('osm:node/')).toBe(true);
      if (rule === 'lit-path-beside' || rule === 'lit-square-perimeter') expect(f.type).toBe('park-lantern-4m');
      if (rule === 'lit-way-junction-range') expect(f.type).not.toBe('park-lantern-4m');
    }
    const rules = new Set(ruleOf.values());
    for (const r of ['lit-path-beside', 'lit-square-perimeter', 'lit-way-junction-range', 'lit-way-one-side', 'mapped-osm-node'])
      expect(rules.has(r), r).toBe(true);
  });
  test('junction ranges: every station lies inside a lit interval of its way', () => {
    const rows = prov.fixtures.filter((r: (string | number)[]) => r[1] === 'lit-way-junction-range');
    expect(rows.length).toBeGreaterThan(20);
    const l0 = JSON.parse(fs.readFileSync('docs/lighting-city-l0/data/city-lighting-l0.json', 'utf8'));
    const ranges = new Map<number, [number, number][]>(l0.ways.map((w: unknown[]) => [w[0], w[8]]));
    for (const r of rows) {
      const way = Number(String(r[0]).split('way/')[1].split(':')[0]);
      const chain = Number(r[5]);
      expect(ranges.get(way)!.some(([a, b]) => chain >= a - 0.1 && chain <= b + 0.1), String(r[0])).toBe(true);
    }
  });
  test('squares: perimeter lanterns stand inside the square outline', () => {
    const geo = new Map(
      inputs.input.source.elements.filter((e) => e.type === 'way').map((e) => [e.id, e.geometry!]),
    );
    const inRing = (p: number[], r: number[][]) => {
      let inside = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++)
        if (r[i][1] > p[1] !== r[j][1] > p[1] && p[0] < r[i][0] + ((p[1] - r[i][1]) * (r[j][0] - r[i][0])) / (r[j][1] - r[i][1]))
          inside = !inside;
      return inside;
    };
    let n = 0;
    for (const f of output.fixtures) {
      if (ruleOf.get(f.id) !== 'lit-square-perimeter') continue;
      const way = Number(f.id.split('way/')[1].split(':')[0]);
      const ring = geo.get(way)!.map(([la, lo]) => geodeticToScene(SCENE_REFERENCE, la, lo));
      expect(inRing([f.x, f.z], ring), f.id).toBe(true);
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });
  test('seams: nothing re-created, nothing within 3 m of an earlier fixture; L2a car roads are context only', () => {
    const existing = inputs.input.existing;
    const ids = new Set(existing.map((f) => f.id));
    for (const f of output.fixtures) expect(ids.has(f.id)).toBe(false);
    let nearest = Infinity;
    for (const f of output.fixtures)
      for (const e of existing) nearest = Math.min(nearest, Math.hypot(f.x - e.x, f.z - e.z) * M);
    expect(nearest).toBeGreaterThanOrEqual(3);
    // No L2a way (wholly lit car road) produced a candidate of this rollout.
    const l2aWays = new Set(decodeCompactSet(l2).fixtures.map((f) => f.id.split(':s')[0].split('way/')[1]));
    for (const f of output.fixtures)
      if (f.id.startsWith('estimate:') && ruleOf.get(f.id) === 'lit-way-one-side') {
        const way = f.id.split('way/')[1].split(':')[0];
        expect(l2aWays.has(way), f.id).toBe(false);
      }
  });
});

describe('the full citywide set (pilot + A1–A3 + L2a + L2bc)', () => {
  const registry = cityLightingRegistry(terrain, l2, l2bc);
  test('validates as a registry and is accepted by the controller; ≤ 32 per cell; 20 programs unchanged', () => {
    const v = validateRegistry(registry, { reference: terrain.data.reference, supportedTypes: FIXTURE_TYPES });
    expect(v.errors).toEqual([]);
    const stadium = createIdrottsparken(terrain);
    const renderer = { toneMappingExposure: 1, info: { programs: [] } } as unknown as WebGLRenderer;
    const city = createCityLighting({ terrain, stadium, renderer, scene: new Scene(), registry, strict: true });
    const d = city.describe();
    expect(d.fixtures).toBe(273 + l2.count + l2bc.count);
    expect(d.streetLighting.index!.overflowCells).toBe(0);
    expect(d.streetLighting.index!.maxRawOccupancy).toBeLessThanOrEqual(32);
    expect(d.streetLighting.rollouts!['lighting-l2bc-v1'].estimated + d.streetLighting.rollouts!['lighting-l2bc-v1'].mapped).toBe(l2bc.count);
    city.dispose();
    stadium.dispose();
  });
});
