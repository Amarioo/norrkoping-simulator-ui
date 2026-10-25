/**
 * Norrköpings rådhus (town hall, I. G. Clason, 1907–1910) and Gull-Olle, Landmark Phase B1: the
 * dimensions the model is built from.
 *
 * BUILDING FRAME: horizontal ground metres with the origin at the measured tower centre, +u along the
 * north façade towards the north-east corner (OSM way/285809156 vertex 0 → vertex 5), +v out of the
 * north façade (≈ north-north-west, towards Tyska torget); heights are RH2000 metres (the scene's
 * vertical datum: scene y = RH2000 / metresPerUnit). Scene placement: see `radhusetFrame`.
 *
 * Evidence (docs/landmark-b1/data-provenance.md):
 *   [OSM]    footprint way/285809156, map snapshot 2026-10-16 (ODbL). Mapped from aerial imagery,
 *            typically ±1 m.
 *   [LIDAR]  Lantmäteriet point cloud (STAC `dsm-skoglig-copc`, "Laserdata NH 2020"), tile
 *            y20c012-64950_5675_25, item date 2020-02-03, CC BY 4.0; scripts/landmark-b1/radhuset_lidar.py
 *            → docs/landmark-b1/data/radhuset-lidar.json. Height ±0.1–0.2 m on hard surfaces, positions
 *            of walls ±0.3–0.5 m (few returns on vertical faces).
 *   [KOMMUN] norrkoping.se "Norrköpings rådhus" (updated 2026-09-29, read 2026-10-25): tower 68 m;
 *            a 4.5 m gilded granite sculpture of Sankt Olof ("Gull-Olle") at the top.
 *   [WIKI]   sv.wikipedia "Norrköpings rådhus" (read 2026-10-25): Helsingborg brick, 1907–1910.
 *   [PHOTO]  Wikimedia Commons: "Norrköpings Rådhus, norra fasaden mot Tyska Torget.jpg" (2015,
 *            CC BY-SA 4.0), "Norrköpings rådhus tower 20th of September 2016.jpg" (CC BY-SA 4.0),
 *            "Norrköpings rådhus (hösten 2025).jpg" (CC0). Inspected for layout and colour only;
 *            nothing is copied into the model.
 *   [EST]    estimate (no measurement): marked per value.
 */

/** OSM id of the mapped building this model replaces (its generic OSM walls are no longer drawn). */
export const RADHUSET_ID = 'way/285809156';

/**
 * [LIDAR] frame: tower centre in scene units (mid-points of the tower roof slices 59–66 m) and the
 * façade axis (unit vector in scene x/z, from [OSM] vertices 0 → 5).
 */
export const FRAME = {
  originScene: [-1.1325, -10.6945] as [number, number],
  axisScene: [0.960852, -0.277062] as [number, number],
};

/** [LIDAR] ground (class 2) medians, RH2000 m. */
export const GROUND = { towerFront: 4.47, north: 4.47, west: 5.28, east: 5.49, courtyard: 6.5 };

/**
 * Wings, from the [OSM] footprint (rounded to 0.1 m) and [LIDAR] roof cross-sections
 * (median over the wing of the highest return per 1 m × 0.5 m cell).
 * Roof profile: [inset from the eave edge (m), height RH2000 (m)], ending at the ridge.
 */
export const WINGS = {
  /**
   * North wing (Tyska torget). Mansard: steep lower slope (with dormers) to ≈ 30.9 m, upper slope to
   * the ridge 37.9 m at v −5.25. The slopes differ: `profile` is the courtyard (south) side — 24.5 m
   * 0.95 m in, break 2.4 m in —, `profileNorth` the square side — 25.4 m 0.55 m in (behind the
   * balustrade), break ≈ 3.6 m in. Same heights per point (the roof rings are level).
   */
  north: {
    u0: -33.4,
    u1: 34.3,
    v0: -15.2,
    v1: 4.8,
    profile: [
      [0, 22.5],
      [0.9, 24.6],
      [2.4, 30.9],
      [10.0, 37.9],
    ] as [number, number][],
    profileNorth: [
      [0, 22.5],
      [0.35, 24.6],
      [3.6, 30.9],
      [10.0, 37.9],
    ] as [number, number][],
  },
  /** West wing. Short steep lower slope (22.5 → 26.1 m in 1.2 m), then the ridge 30.1 m. */
  west: {
    u0: -33.7,
    u1: -19.4,
    v0: -47.0,
    v1: -15.2,
    profile: [
      [0, 22.5],
      [1.2, 26.1],
      [7.15, 30.1],
    ] as [number, number][],
  },
  /** East wing ([OSM] outer wall 34.1 → 33.5 m; modelled at 33.8). Ridge 30.15 m. */
  east: {
    u0: 22.1,
    u1: 33.8,
    v0: -46.3,
    v1: -15.4,
    profile: [
      [0, 22.5],
      [1.2, 26.1],
      [5.85, 30.15],
    ] as [number, number][],
  },
};
/** [LIDAR] cornice (eave edge) of all three wings, south and courtyard sides: 22.5 m. */
export const EAVE = 22.5;
/**
 * [LIDAR] the north façade's edge returns reach 23.6 m (22.5 elsewhere): the balustrade seen on the
 * north façade in [PHOTO 2015]. Not detected on the other façades, so not modelled there.
 */
export const BALUSTRADE = { top: 23.6, thickness: 0.45 };

/**
 * Courtyard blocks between the side wings, from the [OSM] footprint notches and [LIDAR] heights.
 * Tall middle block: eave 30.6 at u ±7.25, ridge 36.1 along v at u ≈ −0.5 from v −9.5 to −14.5,
 * hipped towards the south (30.8 at v −20.5) ([LIDAR] surface grid; the middleNorth section's median,
 * 33.2, is the hip).
 * Strips/flanks beside it: flat at 19.7 ([LIDAR] u 7.75–9.25). Hall to the south: eave 10.3,
 * ridge 12.1 ([LIDAR] middleSouth section).
 */
export const MIDDLE = {
  tall: { u0: -7.4, u1: 7.4, v0: -21.1, v1: -15.1, eave: 30.6, ridge: 36.1 },
  strips: { top: 19.7 },
  hall: { u0: -6.85, u1: 7.63, v0: -28.57, v1: -21.1, eave: 10.3, ridge: 12.1 },
};
/**
 * Courtyard projections of the side wings ([OSM] notches) carry cross gables ([LIDAR] surface grid:
 * west 29.5–30.1 m at v −24.5…−27.5, falling to ≈ 27 m at its east end; east 29.4–30.0 m at
 * v −29.5…−34.5). Ridge along u, hipped at the courtyard end; the other end runs to the wing's ridge
 * (hidden in the wing roof).
 */
export const PROJECTIONS = {
  west: { u0: -26.5, u1: -16.6, v0: -29.45, v1: -23.95, ridge: 29.6, hippedEnd: 'u1' as const },
  east: { u0: 19.45, u1: 27.9, v0: -36.98, v1: -27.8, ridge: 29.8, hippedEnd: 'u0' as const },
};

/**
 * Small roof features (chimney stacks / ventilators) at their [LIDAR] positions and heights
 * (cells ≥ 1 m above the surrounding roof, mirrored pairs). Shape (1.2 × 1.2 m stacks, 1.6 × 4 m
 * stacks) and copper colour are [EST]/[PHOTO].
 */
export const ROOF_FEATURES = {
  /** On the north wing ridge, v −5.5: top 39.2. */
  ridge: { v: -5.5, top: 39.2, u: [-24, -16.5, -9, 9, 16.5, 24] },
  /** Stacks behind the tower, v −8.5 … −13.5: top 38.6 (cells u −10…−9 and 8…10). */
  rear: { v0: -13.5, v1: -8.5, top: 38.6, u: [-9.5, 8.9] },
  /** Stacks at the middle block's corners, v −18.5 … −21.5: top 37.1 (cells u −12…−10 and 9…11). */
  middle: { v0: -21.5, v1: -18.5, top: 37.1, u: [-11.0, 10.0] },
  /** Side-wing ridge ventilators: top 31.5 at v −16.5, −24, −32.5, −40.5. */
  wings: { top: 31.5, v: [-16.5, -24, -32.5, -40.5], u: [-26.5, 27.5] },
};

/**
 * The tower. [LIDAR] shaft faces at u −5.3 / +5.25 and v −5.6 / +5.0 (returns on the walls 40–54 m);
 * cornice top 58.0–58.5 m with half-width 5.75; roof half-widths per slice 59 → 69 m; highest return
 * 73.15 m (the statue). Total height above the ground in front (4.47 m): 68.7 m — [KOMMUN] 68 m.
 * Below the main roof the tower is the [OSM] entrance projection (u −5.3…5.8, to v 6.0).
 */
export const TOWER = {
  shaft: { u0: -5.3, u1: 5.25, v0: -5.6, v1: 5.0 },
  /** [OSM] projection of the north façade under the tower (to the eave). */
  base: { u0: -5.25, u1: 5.75, v0: 4.8, v1: 6.03 },
  cornice: { bottom: 57.3, top: 58.3, half: 5.75 },
  /** Roof rings [height RH2000, half-width] from the [LIDAR] slices (both axes averaged). */
  roof: [
    [58.3, 5.0],
    [60.0, 4.5],
    [62.0, 3.75],
    [64.0, 3.1],
    [66.0, 2.3],
    [68.0, 1.6],
    [68.65, 1.1],
  ] as [number, number][],
  /** [EST from PHOTO 2016, scale = 10.6 m shaft width]: three arched openings per side. */
  openings: { bottom: 52.2, top: 56.0, width: 1.1, count: 3, spacing: 2.2 },
  /**
   * [EST from PHOTO 2016]: dial ≈ 3.6 m across, centre ≈ 10.5 m below the cornice. Seen on two faces
   * in each photograph (2015 north + west, 2016 and 2025 two faces); all four faces assumed.
   */
  clock: { centre: 47.5, diameter: 3.6 },
  /** [EST from PHOTO 2015/2016]: light stone string courses on the shaft. */
  bands: [24.2, 28.7, 33.2, 37.7, 42.2, 44.9, 51.5, 56.6],
};

/**
 * Gull-Olle: top [LIDAR] 73.15 m, height [KOMMUN] 4.5 m → base 68.65 m (the roof's top ring above).
 * Silhouette (standing robed figure with crown), width ([LIDAR] ≤ 1.6 m at 69–70.5 m) and the gilded
 * colour [PHOTO]; attributes, pose and facing are not documented and not modelled [EST].
 */
export const GULL_OLLE = { top: 73.15, height: 4.5 };

/**
 * Façade [PHOTO/WIKI]: Helsingborg brick (brown), light stone bands and plinth, slate-grey roofs,
 * green copper on roof features; gilded statue. Floor lines and window rhythm are [EST].
 */
export const FACADE = {
  plinthTop: 6.0,
  bands: [10.2, 15.6],
  cornice: { bottom: 21.6, projection: 0.5 },
  windows: { rows: [7.9, 12.9, 18.1], width: 1.5, height: 2.6, spacing: 3.6, margin: 1.4 },
};
export const COLOURS = {
  brick: '#6e4b3c',
  towerBrick: '#62433a',
  stone: '#cdc5b3',
  plinth: '#a7a299',
  roof: '#4a4f52',
  towerRoof: '#575a58',
  copper: '#5f8a79',
  window: '#262b30',
  opening: '#1b1917',
  gold: '#e8b84a',
};
