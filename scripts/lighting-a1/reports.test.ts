// Lighting Phase A1: machine-readable evidence for docs/lighting-phase-a1/data/.
//
//   .\node_modules\.bin\vitest.cmd run -c scripts/lighting-a1/vitest.config.ts reports
//
// Writes (small, deterministic; no raw OSM data beyond IDs and derived positions):
//   manifest.json   pinned inputs (SHA-256 / git blob), generator/policy, output hashes, counts
//   registry.json   one compact line per A1 fixture (identity, zone, group, evidence, type, support, E/N)
//   coverage.json   per-way evidence status, rendered ways without lit tag, rejections by reason
//   capacity.json   occupancy of pilot / A1 / combined sets, near-capacity cells with contributors,
//                   density-headroom variants (closer estimate spacing) and the Phase 0 synthetic load
//   underdeck.json  light under Saltängsbron: through the deck vs from the open sides
import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Scene, type WebGLRenderer } from 'three';
import { terrain } from '../../src/lib/terrain';
import { createIdrottsparken } from '../../src/lib/stadium/idrottsparken';
import {
  a1LightingRegistry,
  // Phase A2: the controller default includes A2; this harness describes the A1 state (pilot + A1).
  a1RuntimeLightingRegistry as runtimeLightingRegistry,
  createCityLighting,
  pilotLightingRegistry,
} from '../../src/lib/lighting/controller';
import { A1_POLICY, generateCorridor } from '../../src/lib/lighting/corridorGenerator';
import { A1_GENERATOR, A1_ZONES, inRing } from '../../src/lib/lighting/corridorA1';
import { corridorRegistry, mergeRegistries } from '../../src/lib/lighting/corridorRegistry';
import { prepareStreetLighting } from '../../src/lib/lighting/streetLighting';
import { lookupLamps } from '../../src/lib/lighting/lightIndex';
import { lampLux } from '../../src/lib/lighting/reference';
import type { LightingRegistry } from '../../src/lib/lighting/registry';
import { DECK_OCCLUDER_CLEARANCE_M, INPUT_FILES, loadInputs, toFiles } from './inputs';

const OUT = 'docs/lighting-phase-a1/data';
const M = terrain.data.reference.metresPerUnit;
const file = (path: string) => {
  const bytes = fs.readFileSync(path);
  return {
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    gitBlob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
  };
};
const sha = (a: Float32Array) =>
  createHash('sha256')
    .update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))
    .digest('hex');
const write = (name: string, data: unknown) =>
  fs.writeFileSync(`${OUT}/${name}`, JSON.stringify(data, null, 1) + '\n');
const prepare = (r: LightingRegistry) =>
  prepareStreetLighting(r, terrain, { maxTextureSize: 2048 });
const statsOf = (r: LightingRegistry) => {
  const p = prepare(r);
  const s = p.ok ? p.index.stats : p.stats;
  return {
    ok: p.ok,
    fixtures: r.fixtures.length,
    maxRawOccupancy: s?.maxRawOccupancy,
    overflowCells: s?.overflowCells,
    nonEmptyCells: s?.nonEmptyCells,
    cellEntries: s?.cellEntries,
    histogram: s?.histogram,
    pages: s?.pages,
    bytes: p.ok
      ? {
          lamp: p.lampPack.data.byteLength,
          payload: s!.payload.bytes,
          directory: s!.directory.bytes,
        }
      : null,
    conflicts: p.ok ? [] : p.conflicts.map((c) => ({ cell: c.cell, raw: c.raw })),
  };
};

test('write the A1 evidence data', () => {
  fs.mkdirSync(OUT, { recursive: true });
  const input = loadInputs();
  const out = generateCorridor(input);
  const files = toFiles(out, input);
  expect(fs.readFileSync('src/lib/data/streetlights-a1.json', 'utf8')).toBe(files.runtime);
  const pilot = pilotLightingRegistry(terrain),
    a1 = a1LightingRegistry(terrain),
    runtime = runtimeLightingRegistry(terrain);
  const prov = new Map(out.provenance.map((p) => [p.id, p]));

  // registry.json
  write(
    'registry.json',
    a1.fixtures.map((r) => {
      const p = prov.get(r.id)!;
      return [
        r.id,
        (r as typeof r & { zone: string }).zone,
        r.group,
        r.placement,
        r.photometry.fixtureType,
        r.support.kind,
        Number(r.position.e.toFixed(2)),
        Number(r.position.n.toFixed(2)),
        r.orientation.gridAzimuthDeg === null
          ? null
          : Number(r.orientation.gridAzimuthDeg.toFixed(1)),
        p.source.element,
        p.rule,
        p.station
          ? `${p.station.side}${p.station.sideFallback ? '*' : ''} ${p.station.offsetM} m, shift ${p.station.shiftM} m, spacing ${p.station.spacingM} m`
          : null,
      ];
    }),
  );

  // coverage.json
  const reasons: Record<string, number> = {};
  for (const r of out.rejected) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  write('coverage.json', {
    zones: Object.fromEntries(
      Object.entries(A1_ZONES).map(([k, z]) => [
        k,
        { name: z.name, ringEN: z.ring, fixtures: out.counts[`zone${k}`] },
      ]),
    ),
    counts: out.counts,
    rejectedByReason: reasons,
    ways: out.ways,
    unknownWays: out.unknownWays,
  });

  // capacity.json
  const p = prepare(runtime);
  expect(p.ok).toBe(true);
  if (!p.ok) return;
  const index = p.index;
  const recordOf = new Map(p.records.map((r) => [r.id, r]));
  const near: unknown[] = [];
  const seen = new Set<string>();
  for (const l of p.lamps)
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const cx = Math.floor(l.x) + dx,
          cz = Math.floor(l.z) + dz;
        const key = `${cx},${cz}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ids = lookupLamps(index, cx + 0.5, cz + 0.5).map((i) => index.order[i]);
        if (ids.length < 13) continue;
        const rs = ids.map((id) => recordOf.get(id)!);
        const [e, n] = terrain.toSweref(cx + 0.5, cz + 0.5);
        near.push({
          cell: [cx, cz],
          centreEN: [Math.round(e * 10) / 10, Math.round(n * 10) / 10],
          count: ids.length,
          mapped: rs.filter((r) => r.placement === 'mapped').length,
          estimated: rs.filter((r) => r.placement === 'estimated').length,
          byType: rs.reduce<Record<string, number>>(
            (a, r) => ((a[r.photometry.fixtureType] = (a[r.photometry.fixtureType] ?? 0) + 1), a),
            {},
          ),
          ids,
        });
      }
  near.sort((a, b) => (b as { count: number }).count - (a as { count: number }).count);
  const variants = [1, 0.85, 0.75, 0.6].map((f) => {
    const types = Object.fromEntries(
      Object.entries(input.types).map(([k, t]) => [k, { ...t, spacingM: t.spacingM * f }]),
    );
    const o = generateCorridor({ ...input, types });
    const reg = corridorRegistry(JSON.parse(toFiles(o, input).runtime), terrain.data.reference);
    const s = statsOf(mergeRegistries(pilot, reg));
    return {
      spacingFactor: f,
      a1Fixtures: o.counts.fixtures,
      ...s,
      conflicts: s.conflicts.slice(0, 5),
      conflictCount: s.conflicts.length,
    };
  });
  const synthetic = fs.existsSync('docs/lighting-phase0/measurements/synthetic-city.json')
    ? JSON.parse(fs.readFileSync('docs/lighting-phase0/measurements/synthetic-city.json', 'utf8'))
    : null;
  write('capacity.json', {
    capacity: index.capacity,
    cellMetres: index.stats.cellMetres,
    chunkCells: index.chunkCells,
    pilot: statsOf(pilot),
    a1Only: statsOf(a1),
    combined: { ...statsOf(runtime), conflicts: undefined },
    nearCapacityCells: near,
    densityHeadroom: variants,
    phase0SyntheticCityLoad: synthetic && {
      note: 'Phase 0 hypothetical centreline emitters (not an inventory); unchanged by A1',
      overflowCells: synthetic.overflowCells ?? synthetic.result?.overflowCells ?? null,
      maxRawOccupancy: synthetic.maxRawOccupancy ?? synthetic.result?.maxRawOccupancy ?? null,
    },
  });

  // underdeck.json
  const br = input.bridges.find((b) => b.name === 'Saltängsbron')!;
  const decks = input.map.roads.filter((r) => r.bridge && [47460598, 501428826].includes(r.way));
  const deckTop = (x: number, z: number) => {
    let best: { d: number; y: number } | null = null;
    for (const r of decks) {
      const dx = r.b[0] - r.a[0],
        dz = r.b[1] - r.a[1],
        l2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / l2));
      const d = Math.hypot(x - r.a[0] - t * dx, z - r.a[1] - t * dz);
      const y = terrain.profileHeight([r.a[0], r.yA, r.a[1]], [r.b[0], r.yB, r.b[1]], t);
      if (!best || d < best.d) best = { d, y };
    }
    return best!.y;
  };
  const evaluate = (lamps: typeof p.lamps, ids: string[]) => {
    const xs = br.ring.map((q) => q[0]),
      zs = br.ring.map((q) => q[1]);
    let covered = 0;
    const through = { lux: 0, id: '' },
      open = { lux: 0, id: '' };
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.04)
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.04) {
        if (!inRing([x, z], br.ring)) continue;
        const y = Math.max(terrain.surfaceHeight(x, z), terrain.waterHeight(x, z));
        if ((deckTop(x, z) - y) * M < 2) continue;
        covered++;
        lamps.forEach((l, i) => {
          const lux = lampLux(l, [x, y, z], [0, 1, 0], M);
          if (lux <= 0) return;
          let crosses = false;
          for (let k = 1; k < 200; k++) {
            const u = k / 200,
              qx = l.x + (x - l.x) * u,
              qz = l.z + (z - l.z) * u;
            if (!inRing([qx, qz], br.ring)) continue;
            if (l.y + (y - l.y) * u < deckTop(qx, qz)) {
              const pu = (k - 1) / 200;
              crosses =
                inRing([l.x + (x - l.x) * pu, l.z + (z - l.z) * pu], br.ring) &&
                l.y + (y - l.y) * pu >= deckTop(l.x + (x - l.x) * pu, l.z + (z - l.z) * pu);
              break;
            }
          }
          const slot = crosses ? through : open;
          if (lux > slot.lux) Object.assign(slot, { lux: Number(lux.toFixed(3)), id: ids[i] });
        });
      }
    return {
      coveredSamples: covered,
      sampleStepM: 1,
      maxLuxThroughDeck: through,
      maxLuxFromOpenSides: open,
    };
  };
  const noOccluders = generateCorridor({ ...input, deckOccluders: [] });
  const noOccReg = mergeRegistries(
    pilot,
    corridorRegistry(JSON.parse(toFiles(noOccluders, input).runtime), terrain.data.reference),
  );
  const q = prepare(noOccReg);
  write('underdeck.json', {
    bridge: 'Saltängsbron (city-bridges.json id 501428827)',
    coveredDefinition: `deck top ≥ ${DECK_OCCLUDER_CLEARANCE_M} m above the rendered ground/water`,
    deckOccluderEdges: input.deckOccluders!.filter((o) => o.bridge === br.id).length,
    withDeckOccluders: evaluate(
      p.lamps,
      p.records.map((r) => r.id),
    ),
    withoutDeckOccluders: q.ok
      ? evaluate(
          q.lamps,
          q.records.map((r) => r.id),
        )
      : null,
    referenceRoadLux: 'a street-bracket-8m lamp gives ≈ 25 lux at its nadir (1600 cd / 8 m²)',
  });

  // manifest.json
  const { lighting, dispose } = (() => {
    const stadium = createIdrottsparken(terrain);
    const l = createCityLighting({
      terrain,
      stadium,
      renderer: { toneMappingExposure: 1, info: { programs: [] } } as unknown as WebGLRenderer,
      scene: new Scene(),
      registry: runtimeLightingRegistry(terrain),
    });
    return { lighting: l, dispose: () => (l.dispose(), stadium.dispose()) };
  })();
  const u = lighting.uniforms;
  write('manifest.json', {
    note: 'Lighting Phase A1 manifest. Inputs pinned by SHA-256 and git blob ID; outputs are the combined (pilot + A1) runtime arrays. Regenerate deliberately (scripts/lighting-a1/reports.test.ts).',
    generator: A1_GENERATOR,
    policy: A1_POLICY,
    inputs: [
      ...Object.values(INPUT_FILES),
      'src/lib/data/terrain.json',
      'src/lib/data/bridge-profiles.json',
      'src/lib/geo/sweref99tm.js',
      'scripts/lighting-a1/inputs.ts',
      'scripts/lighting-a1/extract-source.mjs',
    ].map(file),
    outputs: {
      files: [
        'src/lib/data/streetlights-a1.json',
        'src/lib/data/streetlights-a1-provenance.json',
      ].map(file),
      combinedHashes: {
        lampTexture: sha(u.cityLampTex.value.image.data as Float32Array),
        pagePayload: sha(u.cityGridTex.value.image.data as Float32Array),
        pageDirectory: sha(u.cityPageTex.value.image.data as Float32Array),
        canonicalOrder: createHash('sha256').update(lighting.index!.order.join('\n')).digest('hex'),
      },
      counts: lighting.describe().streetLighting.rollouts,
    },
  });
  dispose();
});
