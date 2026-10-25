/**
 * Lighting Phase L2a — street lighting in the whole map (docs/lighting-city-l2/README.md).
 *
 * The corridor generator (corridorGenerator.ts) with the A1–A3 placement policy, unchanged values,
 * run over the whole supported map (zone L2 = the map clip quadrilateral of
 * docs/step62/coverage-audit.md, EPSG:3006) on the car-road ways that Phase L0 classified as lit
 * (OSM lit=yes, gap fill, or the municipal guideline rule). Paths and squares (L2b) and partly lit
 * roads at junctions outside the tätort (L2c) are later steps.
 *
 * Seams: every earlier rollout (pilot, A1, A2, A3) stays exactly as it is. Their estimates count as
 * accepted fixtures for spacing, and a station slot that A1–A3 already rendered (same station rule)
 * is that rollout's fixture, never a second record.
 */
import type { CorridorSpec, LitEvidence, SourceElement } from './corridorGenerator';
import { A3_POLICY } from './corridorGenerator';
import { A1_GENERATOR } from './corridorA1';
import { A2_GENERATOR } from './corridorA2';
import { A3_GENERATOR } from './corridorA3';

export const L2_GENERATOR = {
  script: 'src/lib/lighting/corridorGenerator.ts',
  version: 'lighting-l2a-v1',
  /** No random numbers: output depends only on the pinned inputs. */
  seed: null,
} as const;
export const L2_DATASET = 'osm-lighting-l2-snapshot';
export const L2_ROLLOUT = 'lighting-l2a';

/** The supported map (clip quadrilateral, EPSG:3006 E/N, NW NE SE SW). */
export const L2_ZONES: Record<'L2', { name: string; ring: [number, number][] }> = {
  L2: {
    name: 'Whole supported map (street lighting, Phase L2a)',
    ring: [
      [561804.869, 6501570.951],
      [575151.458, 6501805.721],
      [575355.539, 6491229.31],
      [561972.712, 6490994.115],
    ],
  },
};

/** Placement policy `lighting-l2a-v1`: A3's rules and values; slot identity covers A1, A2 and A3. */
export const L2_POLICY = {
  ...A3_POLICY,
  version: L2_GENERATOR.version,
  existingEstimatesAsAccepted: true,
  stationSlotFamilies: [A1_GENERATOR.version, A2_GENERATOR.version, A3_GENERATOR.version],
};

/** L0 statuses, reasons and evidence (docs/lighting-city-l0/data/city-lighting-l0.json meta.formats). */
export interface L0Classification {
  meta: { formats: { statuses: string[]; evidence: string[] }; rule: { version: string } };
  ways: [number, number, number, number, number, number, number, number, [number, number][]][];
}

/** The L2a spec: lit evidence = L0's decision for wholly lit ways (status 'lit'). */
export function l2Spec(l0: L0Classification): CorridorSpec {
  const { statuses, evidence } = l0.meta.formats;
  const lit = new Map<number, LitEvidence>();
  for (const w of l0.ways)
    if (statuses[w[1]] === 'lit') lit.set(w[0], evidence[w[3]] as LitEvidence);
  return {
    generator: L2_GENERATOR,
    dataset: L2_DATASET,
    zones: L2_ZONES,
    zoneOrder: ['L2'],
    policy: L2_POLICY,
    litEvidence: (e: SourceElement) => lit.get(e.id) ?? null,
  };
}

/**
 * Lighting Phase L2bc — footways, cycleways, paths and squares (L2b) together with partly lit roads
 * at junctions outside the tätort and lit motorways (L2c), in one run over the whole map.
 *
 * Same generator and A1–A3 placement values; three additions, on only for this rollout:
 * - squares: lit closed area=yes ways get park lanterns along the outline, 1.5 m inside the square;
 * - lit ranges: a partly lit way (L0 status 'partial': ±50 m at signals, crossings and roundabout
 *   entries) gets stations only within its lit intervals;
 * - motorways and their links are street-bracket roads when lit (OSM lit=yes; L0 never lights an
 *   untagged motorway).
 * Candidates are every lit way that L2a did not handle (paths, squares, partial ways, motorways);
 * L2a's car roads are context only (they light nearby paths). Paths that L0 found lit by a
 * neighbouring street (sidewalks, paths beside a street) get no lamps of their own.
 */
export const L2BC_GENERATOR = {
  script: 'src/lib/lighting/corridorGenerator.ts',
  version: 'lighting-l2bc-v1',
  seed: null,
} as const;
export const L2BC_DATASET = 'osm-lighting-l2bc-snapshot';
export const L2BC_ROLLOUT = 'lighting-l2bc';
export const L2BC_POLICY = {
  ...L2_POLICY,
  version: L2BC_GENERATOR.version,
  includeMotorways: true,
  squares: { insetM: 1.5 },
  stationSlotFamilies: [...L2_POLICY.stationSlotFamilies, L2_GENERATOR.version],
};
/** Car-road classes of L2a (its candidates when wholly lit and not a square). */
export const L2A_CLASSES = new Set([
  'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary',
  'tertiary_link', 'residential', 'unclassified', 'living_street', 'pedestrian', 'service',
]);
export function l2bcSpec(l0: L0Classification): CorridorSpec {
  const { statuses, evidence } = l0.meta.formats;
  const info = new Map<number, { status: string; evidence: LitEvidence; covered: boolean; ranges: [number, number][] }>();
  for (const w of l0.ways)
    if (statuses[w[1]] === 'lit' || statuses[w[1]] === 'partial')
      info.set(w[0], {
        status: statuses[w[1]],
        evidence: evidence[w[3]] as LitEvidence,
        covered: w[4] === 1,
        ranges: w[8],
      });
  return {
    generator: L2BC_GENERATOR,
    dataset: L2BC_DATASET,
    zones: L2_ZONES,
    zoneOrder: ['L2'],
    policy: L2BC_POLICY,
    litEvidence: (e: SourceElement) => info.get(e.id)?.evidence ?? null,
    candidate: (e: SourceElement) => {
      const w = info.get(e.id);
      if (!w || w.covered) return false;
      const l2a = L2A_CLASSES.has(e.tags.highway) && w.status === 'lit' && e.tags.area !== 'yes';
      return !l2a;
    },
    litRanges: (e: SourceElement) => {
      const w = info.get(e.id);
      return w?.status === 'partial' ? w.ranges : null;
    },
  };
}
