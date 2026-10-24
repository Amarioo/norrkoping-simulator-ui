/**
 * Lighting Phase A3 — the rest of the Kungstorget ring (docs/lighting-phase-a3/).
 *
 * One zone in SWEREF 99 TM / EPSG:3006 E/N metres (the canonical boundary; scene coordinates are
 * derived with the fixed affine reference):
 * - F  the Kungstorget circular junction west of Phase A2 zone D: the seven lit=yes ring ways
 *      312490062, 312486752, 286445688, 684962393, 163928046, 308315550, 286445686 (210.7 m) and the
 *      west part of the ring island. The ring's east arc (286445685, 286445687) is A2's. The approach
 *      streets (Stockholmsvägen, Norra Promenaden west, Ingelstagatan) are outside, except for their
 *      first metres at the ring mouths, where no station falls.
 *
 * Derivation (reproduced in corridorA3.test.ts from the pinned extract):
 * - outer edge: every vertex of the seven ring ways, in travel order (counter-clockwise, from
 *   312490062 to 286445686), moved 8 m radially outwards from the ring centre, rounded to 0.1 m;
 *   vertices that would fall inside zone D are dropped. Ring centre = mean of all vertices of the nine
 *   Kungstorget ring ways in the pinned snapshot (E 568 321.7, N 6 495 541.1), the same centre the
 *   generator uses for the outer-kerb side. 8 m clears the outermost possible bracket position
 *   (half the 6.6 m carriageway + 0.8 m setback + at most 2 m extra setback = 6.1 m);
 * - east edge: zone D's west edge (A2_ZONES.D vertices 4–9) reused exactly, so the A2/A3 seam has no
 *   gap and no overlap. The values are written out (this module has no imports, so the plain-Node
 *   extract script can load it); corridorA3.test.ts asserts they equal A2_ZONES.D exactly.
 */

export const A3_GENERATOR = {
  script: 'src/lib/lighting/corridorGenerator.ts',
  version: 'lighting-a3-v1',
  /** No random numbers: output depends only on the pinned inputs. */
  seed: null,
} as const;
export const A3_DATASET = 'osm-lighting-a3-snapshot';
export const A3_ROLLOUT = 'lighting-a3';
/** Radial offset of the outer edge from the ring centreline, metres. */
export const A3_RING_OFFSET_M = 8;

/** Zone D's west edge, A2_ZONES.D vertices 4…9 (north-west corner … D/E seam west vertex). */
export const A3_D_WEST_EDGE: [number, number][] = [
  [568377.7, 6495581.3],
  [568356.5, 6495571.3],
  [568359.0, 6495546.3],
  [568347.7, 6495521.3],
  [568341.5, 6495502.6],
  [568367.7, 6495483.1],
];
const [D4, D5, D6, D7, D8, D9] = A3_D_WEST_EDGE;

export type A3Zone = 'F';
/** Zone polygons, EPSG:3006 E/N metres (closed implicitly). */
export const A3_ZONES: Record<A3Zone, { name: string; ring: [number, number][] }> = {
  F: {
    name: 'Kungstorget ring west of zone D (north, west and south arcs)',
    ring: [
      // A2 zone D vertex 4 (its north-west corner).
      D4,
      // Outer edge, 8 m outside the ring, by source way (its first vertex lies inside D: dropped).
      // 312490062
      [568365.5, 6495581.5],
      [568359.6, 6495585.9],
      [568353.2, 6495589.3],
      [568346.3, 6495591.8],
      [568339.1, 6495593.3],
      [568331.8, 6495593.7],
      [568324.4, 6495593.1],
      // 312486752
      [568314.9, 6495591.3],
      [568307.8, 6495588.8],
      // 286445688
      [568304.2, 6495587.1],
      [568295.2, 6495581.2],
      [568285.8, 6495571.3],
      [568279.9, 6495561.2],
      [568275.4, 6495550.2],
      [568274.4, 6495547.4],
      // 684962393
      [568273.3, 6495543.8],
      [568271.8, 6495537.5],
      [568271.4, 6495535.1],
      // 163928046
      [568271.4, 6495532.2],
      [568271.6, 6495529.7],
      [568272.3, 6495526.0],
      [568273.5, 6495522.2],
      [568274.3, 6495520.2],
      [568276.1, 6495515.7],
      [568281.3, 6495506.1],
      [568283.9, 6495503.0],
      [568284.2, 6495502.7],
      [568289.4, 6495499.1],
      // 308315550
      [568294.4, 6495495.7],
      [568299.7, 6495493.5],
      [568305.0, 6495492.5],
      [568311.1, 6495492.1],
      // 286445686 (its last two offset vertices lie inside D: dropped)
      [568333.1, 6495497.1],
      // Zone D's west edge, reversed: vertices 9 (D/E seam west), 8, 7, 6, 5.
      D9,
      D8,
      D7,
      D6,
      D5,
    ],
  },
};
export const A3_ZONE_ORDER: A3Zone[] = ['F'];
