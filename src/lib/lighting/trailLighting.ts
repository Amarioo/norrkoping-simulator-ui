/**
 * Phase C2 — the illuminated trail (elljusspåret) in Vrinneviskogen (docs/trail-c2/README.md).
 *
 * The loop is OSM route relation 5703856 (route=running): 14 ways, 2 368 m, every one tagged lit=yes.
 * The municipality lists "Vrinnevi elljusspår, 2,4 km". Lighting Phase L2bc already put park lanterns
 * on the loop's four highway=path ways (43 fixtures, 929 m); its generator has no rule for
 * highway=track, so the other ten ways (1 439 m) stayed dark. This phase:
 * - adds estimated lanterns on those ten ways (trailGenerator.ts, policy `lighting-c2-v1`), leaving
 *   every earlier fixture exactly as it is;
 * The loop is lit all night, like all other lighting in the city (the user's decision of 2026-11-13:
 * a first version switched the loop off 22.00–06.00 on an assumed schedule; that was removed).
 *
 * What is known and what is assumed:
 * - Known: the loop's geometry and lit=yes (OSM); its length 2.4 km (municipality); about 100 lamps
 *   along it (a visitor's count, 66 working + 34 broken, Norrköpings Tidningar 2019-10-16).
 * - Estimated: every lamp position, the lamp type, height, colour and output.
 */
import type { TypeSpec } from './corridorGenerator';
import { L2_ZONES } from './corridorL2';

/** The loop: OSM route relation and its member ways (scripts/data/trail-c2-source.json). */
export const TRAIL_RELATION = 5703856;
export const TRAIL_WAYS: readonly number[] = [
  26223168, 122294025, 122294026, 372645636, 383320758, 383320778, 383320779, 383320782, 383320783,
  383320784, 432960719, 432960730, 432960738, 432960741,
];
const WAY_ID = /^estimate:[a-z0-9.-]+:way\/(\d+):s\d+$/;
const TRAIL_SET = new Set(TRAIL_WAYS);
/**
 * True for a fixture that stands on the loop: an estimate of any rollout (L2bc's lanterns and this
 * phase's) whose canonical ID names one of the loop's ways (diagnostics and tests).
 */
export function isTrailFixture(canonicalId: string) {
  const m = WAY_ID.exec(canonicalId);
  return !!m && TRAIL_SET.has(Number(m[1]));
}

export const C2_GENERATOR = {
  script: 'src/lib/lighting/trailGenerator.ts',
  version: 'lighting-c2-v1',
  /** No random numbers: output depends only on the pinned inputs. */
  seed: null,
} as const;
export const C2_DATASET = 'osm-trail-c2-snapshot';
export const C2_ROLLOUT = 'lighting-c2';
/** Category label (describe().trailLighting): a recreational trail, not street lighting. */
export const C2_CATEGORY = 'trail';
export const C2_ZONE = {
  id: 'L2',
  name: 'Whole supported map (Vrinnevi illuminated trail, Phase C2)',
  ring: L2_ZONES.L2.ring,
};
/** The existing Step 6 lantern type (its values are unchanged; no new fixture type). */
export const C2_TYPE = 'park-lantern-4m';

/** Placement policy `lighting-c2-v1` (values are this project's parameters). */
export const C2_POLICY = {
  version: C2_GENERATOR.version,
  /**
   * Station spacing along the dark part of the loop. Derived from the only lamp count found: about
   * 100 lamps on the loop (NT 2019) minus the 43 that L2bc already placed leaves 57 for 1 439 m,
   * that is 25 m. (L2bc's own spacing on the path ways is 21–22 m.)
   */
  spacingM: 25,
  /** The lamp count the spacing is derived from (observed by a visitor, not a register). */
  observedLoopLamps: 100,
  /** A post stands this far outside the drawn edge of the trail (as L2bc: 1.2 m from the centreline of a 2 m path). */
  edgeSetbackM: 0.2,
  /** Station shifts along the trail tried on a conflict (metres). */
  shiftsM: [0, 2, -2, 4, -4, 6, -6],
  /** A station within this distance of an earlier fixture is lit by it and dropped (half the spacing). */
  coverM: 12.5,
  /** Clearances (A1–A3 values). */
  buildingClearanceM: 0.6,
  carriagewayClearanceM: 0.4,
  tramClearanceM: 2.2,
  railClearanceM: 3.0,
  /** The source geometry must match the drawn trail within this distance. */
  maxMapDeviationM: 1,
} as const;
export type TrailPolicy = typeof C2_POLICY;

/** The lantern type with the trail's spacing (generator input). */
export const trailType = (types: Record<string, TypeSpec>): TypeSpec => ({
  ...types[C2_TYPE],
  spacingM: C2_POLICY.spacingM,
});
