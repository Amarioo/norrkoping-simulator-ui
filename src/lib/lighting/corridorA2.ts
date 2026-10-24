/**
 * Lighting Phase A2 — western Norra Promenaden and northern Kungsgatan: the connection between the
 * Phase A1 corridor (zone A, Resecentrum / Norra Promenaden) and the Step 6 Kungsgatan pilot
 * (docs/lighting-phase-a2/).
 *
 * Two adjoining zones in SWEREF 99 TM / EPSG:3006 E/N metres (the canonical boundary; scene
 * coordinates are derived with the fixed affine reference):
 * - D  Norra Promenaden west of A1: both carriageways, the tram reservation with the Norrtull stop
 *      (no platform fixtures), the paths beside them, and the east arc of the Kungstorget circular
 *      junction where Kungsgatan and Norra Promenaden meet. The rest of the Kungstorget ring,
 *      Stockholmsvägen, Ingelstagatan and the parallel residential street "Norra promenaden" are
 *      outside.
 * - E  Kungsgatan from the north end of its split at Kungstorget south to the Kungsgatan pilot,
 *      with the Slottsgatan junction mouth.
 * Seams: D's east edge lies on A1 zone A's west edge (E 568 572.7, the south-west vertex of A1 is
 * shared); E's south edge lies on the Kungsgatan pilot's north bound (scene z = −14.6, its west end
 * is the pilot's north-west corner); D/E across Kungsgatan where its carriageways split. No A2 zone
 * overlaps A1 or a pilot area (tested), so a lamp position is owned by exactly one rollout.
 */
export const A2_GENERATOR = {
  script: 'src/lib/lighting/corridorGenerator.ts',
  version: 'lighting-a2-v1',
  /** No random numbers: output depends only on the pinned inputs. */
  seed: null,
} as const;
export const A2_DATASET = 'osm-lighting-a2-snapshot';
export const A2_ROLLOUT = 'lighting-a2';

export type A2Zone = 'D' | 'E';
/** Zone polygons, EPSG:3006 E/N metres (closed implicitly). */
export const A2_ZONES: Record<A2Zone, { name: string; ring: [number, number][] }> = {
  D: {
    name: 'Norra Promenaden west (A1 – Kungstorget), Norrtull tram stop, Kungstorget east junction',
    ring: [
      // East edge on A1 zone A's west edge (E 568 572.7), from 15 m north of the westbound
      // carriageway to A1's south-west vertex.
      [568572.7, 6495635.0],
      // North edge ≈ 15 m north of the westbound carriageway centreline.
      [568514.2, 6495616.5],
      [568428.0, 6495594.5],
      [568377.7, 6495581.3],
      // West edge through the Kungstorget ring island (east arc of the ring inside).
      [568356.5, 6495571.3],
      [568359.0, 6495546.3],
      [568347.7, 6495521.3],
      [568341.5, 6495502.6],
      // D/E seam across Kungsgatan where its carriageways split.
      [568367.7, 6495483.1],
      [568408.7, 6495494.1],
      // South edge: junction corner, then ≈ 12 m south of the eastbound carriageway centreline
      // (north of the parallel residential street), to A1's south-west vertex.
      [568412.7, 6495521.3],
      [568423.7, 6495539.3],
      [568446.7, 6495545.8],
      [568496.9, 6495559.6],
      [568572.7, 6495573.8],
    ],
  },
  E: {
    name: 'Kungsgatan north (Kungstorget – Kungsgatan pilot), Slottsgatan junction',
    ring: [
      [568367.7, 6495483.1],
      // West edge ≈ 20 m west of the centreline (the promenade path beside it inside).
      [568374.5, 6495457.1],
      [568385.7, 6495414.4],
      [568392.2, 6495392.1],
      // South edge on the pilot's north bound (z = −14.6), from its north-west corner.
      [568405.2, 6495353.876],
      [568443.2, 6495353.876],
      // East edge ≈ 17.5 m east of the centreline.
      [568430.2, 6495401.1],
      [568423.7, 6495423.4],
      [568412.5, 6495466.1],
      [568408.7, 6495494.1],
    ],
  },
};
export const A2_ZONE_ORDER: A2Zone[] = ['D', 'E'];
