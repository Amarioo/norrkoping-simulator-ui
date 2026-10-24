/**
 * Lighting Phase A1 — the first bounded geographic corridor (central Norrköping), shared by the
 * source extract, the generator, the registry adapter, tests and docs (docs/lighting-phase-a1/).
 *
 * The corridor is three adjoining zones, defined in SWEREF 99 TM / EPSG:3006 E/N metres (the
 * canonical boundary; scene coordinates are derived with the fixed affine reference):
 * - A  Resecentrum and Norra Promenaden: Norra Promenaden from Aurorarondellen to east of the
 *      Sveagatan junction, Stationsrondellen, the station forecourt and bus/taxi loop. The station
 *      building, the rail platforms, the paths beside the tracks and the platform access footways are
 *      outside (no platform lighting is claimed); placement rules also exclude rails and platforms.
 * - B  Drottninggatan from the south kerb of Norra Promenaden to the north bridgehead of
 *      Saltängsbron, with the south-east corner of the park beside it (10 mapped OSM lamps).
 * - C  Saltängsbron (Drottninggatan over Motala ström) and its south connection: the Hamngatan
 *      junctions and Drottninggatan (tram street) to Gamla Rådstugugatan, incl. the Rådhuset stop.
 * Zone seams: A/B just south of Norra Promenaden's southern carriageway at Drottninggatan; B/C on
 * the extension of the bridge deck's north edge. The corridor stays clear of the Step 6 pilots
 * (shortest distances to the pilot bounds: Strömparken 45 m, Kungsgatan 222 m, Idrottsparken 915 m).
 */
export const A1_GENERATOR = {
  script: 'src/lib/lighting/corridorGenerator.ts',
  version: 'lighting-a1-v1',
  /** No random numbers: output depends only on the pinned inputs. */
  seed: null,
} as const;
export const A1_DATASET = 'osm-lighting-a1-snapshot';
export const A1_ROLLOUT = 'lighting-a1';
export const PILOT_ROLLOUT = 'step6-pilot';

export type A1Zone = 'A' | 'B' | 'C';
/** Zone polygons, EPSG:3006 E/N metres (closed implicitly; listed clockwise on the map). */
export const A1_ZONES: Record<A1Zone, { name: string; ring: [number, number][] }> = {
  A: {
    name: 'Resecentrum and Norra Promenaden',
    // North edge: bus/taxi loop, the station building's south facade, then 14 m north of Norra
    // Promenaden's north carriageway (the footways north of it lead to the rail platforms).
    ring: [
      [568572.7, 6495691.3],
      [568730.1, 6495713.8],
      [568750.1, 6495691.3],
      [568840.1, 6495716.3],
      [568907.5, 6495728.7],
      [568967.5, 6495746.2],
      [569030.0, 6495763.7],
      [569085.0, 6495780.0],
      [569085.0, 6495713.8],
      [568905.0, 6495653.8],
      [568790.1, 6495628.8],
      [568730.1, 6495613.8],
      [568572.7, 6495573.8],
    ],
  },
  B: {
    name: 'Drottninggatan (Norra Promenaden – Saltängsbron)',
    ring: [
      [568790.1, 6495628.8],
      [568905.0, 6495653.8],
      [568920.0, 6495538.8],
      [568947.5, 6495474.1],
      [568857.6, 6495439.6],
      [568815.1, 6495429.6],
      [568815.1, 6495536.3],
      [568815.1, 6495621.3],
    ],
  },
  C: {
    name: 'Saltängsbron and its south connection (Hamngatan – Gamla Rådstugugatan)',
    ring: [
      [568857.6, 6495439.6],
      [568947.5, 6495474.1],
      [568965.0, 6495388.9],
      [568990.0, 6495301.4],
      [568992.5, 6495263.9],
      [568900.0, 6495263.9],
      [568885.0, 6495328.9],
      [568872.6, 6495368.9],
      [568880.1, 6495393.9],
    ],
  },
};
export const A1_ZONE_ORDER: A1Zone[] = ['A', 'B', 'C'];

/**
 * Visual grouping (fixtures.ts): A1 fixtures are grouped by fixed geographic chunks of
 * GROUP_CHUNK_CELLS × GROUP_CHUNK_CELLS light-grid cells (32 × 25 m = 800 m), aligned to the scene
 * origin like the light-index pages (100 m pages nest exactly). The key depends only on the fixture
 * base position, never on the camera, the rollout or the source.
 */
export const GROUP_CHUNK_CELLS = 32;
export function groupKey(x: number, z: number) {
  return `chunk:${Math.floor(x / GROUP_CHUNK_CELLS)},${Math.floor(z / GROUP_CHUNK_CELLS)}`;
}

/** Even-odd point-in-polygon (any planar coordinates). */
export function inRing(p: readonly number[], ring: readonly (readonly number[])[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
/** Zone containing an E/N point (first in A, B, C order), or null outside the corridor. */
export function zoneOfEN(e: number, n: number): A1Zone | null {
  for (const z of A1_ZONE_ORDER) if (inRing([e, n], A1_ZONES[z].ring)) return z;
  return null;
}
