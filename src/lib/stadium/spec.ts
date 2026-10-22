/**
 * Idrottsparken (Norrköpings Idrottspark; PlatinumCars Arena 2021–2025): the dimensions the model is
 * built from, in the ARENA FRAME (metres; origin = centre of OSM pitch way/100955051, +x towards the
 * west (main) stand, +z towards the north stand, y above the pitch surface).
 *
 * Evidence (docs/step6/stadium-references.md):
 *   [OSM]   relation 1440621 (outer ways 27210829, 1307904192, 285819773, 1307904193) and building
 *           parts 285819766–285819772, OSM snapshot 2026-10-21 (ODbL). Mapped from aerial imagery,
 *           not surveyed: ±1–2 m.
 *   [LIDAR] Lantmäteriet Laserdata NH 2020, tile 64925_5675 (CC BY 4.0), scripts/geo/stadium_lidar.py:
 *           heights relative to the pitch (27.75 m RH2000, p5–p95 27.65–27.84).
 *   [PHOTO] Wikimedia Commons: Nyaparken.jpg (2011-06-27), Nya_Parken.jpg (2012-05-23),
 *           Football_at_parken.JPG (2012-05-13), Peking_fanz.jpg (2010-09-17),
 *           GAIS_efter_IFK_Norrköping_2025-05-31.jpg, Ove_Kindvalls_hedersläktare.jpg (2024-10-29).
 *           Used for layout, colours and structure only; no photo is copied into the model.
 *   [WIKI]  sv.wikipedia "Norrköpings Idrottspark" (2026-10-21): all stands roofed except the south
 *           standing terrace; three of four corners enclosed; loges at the top of the west stand.
 *   [EST]   visual estimate (no measurement): row counts, rakes, member sizes, colours.
 */
export const PITCH = {
  /** [OSM] artificial-turf area way/100955051 (incl. run-off), metres. */
  turf: { x0: -37.85, x1: 37.6, z0: -61.6, z1: 62.0 },
  /** Standard 105 × 68 m field [EST: the club does not publish its own dimensions]. */
  field: { length: 105, width: 68 },
};
/** [OSM] relation 1440621 outer outline (closed, arena frame). */
export const OUTLINE: [number, number][] = [
  [-38.1, -53.4],
  [-64.0, -53.2],
  [-63.4, 62.2],
  [-63.2, 90.0],
  [-37.8, 89.8],
  [38.2, 88.7],
  [65.3, 89.2],
  [65.4, 51.5],
  [65.5, 28.1],
  [72.4, 27.9],
  [71.7, -19.0],
  [65.5, -19.1],
  [65.7, -81.6],
  [61.9, -81.4],
  [39.9, -80.4],
  [37.9, -80.4],
  [31.2, -80.3],
  [-1.4, -80.0],
  [-40.6, -79.6],
  [-40.4, -61.3],
  [-37.9, -61.6],
];
/** Roof surfaces: [LIDAR] top at the front edge ~16.7 m, ~14.9 m at the back (skillion falling outwards). */
export const ROOF = {
  frontTop: 16.7,
  backTop: 14.9,
  thickness: 0.7,
  /** [LIDAR] first returns > 12 m: west x 40.1, east x −42.8, north z 68.3. */
  westFront: 40.1,
  eastFront: -42.8,
  northFront: 68.3,
  /** [OSM] roof way 285819768: the roofed south-west corner, front edge facing the pitch [EST 1.4 m inset]. */
  southWest: { x0: 31.2, x1: 65.7, z0: -81.6, z1: -63.0 },
};
export const STANDS = {
  /** [OSM] building part 285819772 / outer way 27210829; loges [WIKI]; glazed band [PHOTO 2012]. */
  west: {
    front: 38.0,
    back: 65.6,
    z0: -61.6,
    z1: 61.6,
    lowerRows: 18,
    rowDepth: 0.8,
    rowRise: 0.36,
    frontY: 1.2,
  },
  /** [OSM] part 285819771; roof on front columns [PHOTO Nyaparken 2011]. */
  east: {
    front: -38.3,
    back: -64.0,
    z0: -53.4,
    z1: 62.2,
    rows: 22,
    rowDepth: 0.8,
    rowRise: 0.4,
    frontY: 1.2,
  },
  /** [OSM] part 285819770; standing terrace, grey concrete [PHOTO 2010, 2025]. */
  north: {
    front: 62.4,
    back: 89.0,
    x0: -63.2,
    x1: 65.3,
    rows: 30,
    rowDepth: 0.8,
    rowRise: 0.33,
    frontY: 1.0,
  },
  /** [OSM] way 285819773 + [LIDAR] ground rises 0.66 m (z −64) → 8.6 m (z −80); unroofed [WIKI]. */
  south: {
    front: -62.2,
    back: -80.4,
    x0: -40.5,
    x1: 31.2,
    rows: 18,
    rowDepth: 1.0,
    rowRise: 0.44,
    frontY: 0.7,
  },
  /** Roofed south-west corner ("familjeläktare" signage 2012 [PHOTO]) continuing the south rake. */
  southWest: { x0: 31.2, x1: 65.6, front: -62.2, back: -80.6 },
};
/** [OSM] west projection (outer way 27210829 x 65.5–72.4, z −19.0–27.9); [LIDAR] p90 14.7 m. */
export const WEST_PROJECTION = { x0: 65.5, x1: 72.4, z0: -19.0, z1: 27.9, height: 14.7 };
/** [OSM] way 91908192 footprint; [LIDAR] p50 12.2 m, p90 13.75 m (OSM height 15 not used). */
export const TEKNIKHALLEN = { x0: -37.8, x1: 38.8, z0: 88.7, z1: 141.0, eave: 11.6, ridge: 13.6 };
/** [OSM] way 91908705; [LIDAR] p50 11.0 m, p90 11.95 m: a low vault, not the earlier 19 m barrel. */
export const TENNISHALLEN = { x0: 66.3, x1: 85.2, z0: 96.0, z1: 139.3, eave: 9.6, crest: 12.0 };
/**
 * Floodlight masts [LIDAR]: lamp-head returns 52.3–58.0 m above the pitch; head centroids below.
 * Base ground [LIDAR class 2 within 6 m]: SW +4.35 m (Berget), others +0.8–0.9 m.
 * Lattice, tapering, rectangular head facing the pitch [PHOTO 2011/2012].
 */
export const MASTS = [
  { id: 'SW', x: 56.0, z: -91.5 },
  { id: 'SE', x: -62.0, z: -90.3 },
  { id: 'NE', x: -60.6, z: 99.4 },
  { id: 'NW', x: 55.9, z: 98.3 },
].map((m) => ({ ...m, headBottom: 52.3, headTop: 58.0, headWidth: 4.8 }));
/** [OSM] node 13048742814 (Gunnar Nordahl statue, bronze, Jan Steen). */
export const STATUE = { x: 74.5, z: -10.5 };
