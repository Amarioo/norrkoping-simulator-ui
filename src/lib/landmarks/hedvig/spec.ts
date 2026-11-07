/**
 * Hedvigs kyrka, Norrköping (Nicodemus Tessin the Elder, consecrated 1673; renovated 2013–2014),
 * Landmark Phase B2: the dimensions the model and its floodlights are built from.
 *
 * BUILDING FRAME: horizontal ground metres with the origin at the measured bell-tower centre, +u along
 * the nave towards the east end (mean direction of the long walls of OSM way/88741182), +v towards the
 * north; heights are RH2000 metres (the scene's vertical datum: scene y = RH2000 / metresPerUnit).
 * Scene placement: see `hedvigFrame`.
 *
 * Evidence (docs/landmark-b2/data-provenance.md):
 *   [OSM]    footprint way/88741182, map snapshot 2026-10-16 (ODbL). Mapped from aerial imagery,
 *            typically ±1 m; the pilasters of the long walls are mapped as 1 m notches.
 *   [LIDAR]  Lantmäteriet point cloud (STAC `dsm-skoglig-copc`, "Laserdata NH 2020"), tile
 *            y20c012-64950_5675_25, item date 2020-02-03, CC BY 4.0; scripts/landmark-b2/hedvig_lidar.py
 *            → docs/landmark-b2/data/hedvig-lidar.json. Height ±0.1–0.2 m on roofs; walls and the
 *            timber tower faces get few returns (positions ±0.3–0.5 m).
 *   [PHOTO]  Wikimedia Commons, category "Hedvigs kyrka": "2016-06-13 MV-LISA 942 In Norrköping, Hedvigs
 *            Kyrka.jpg" (Eduard47, 2016, CC BY-SA 4.0; west front and tower), "WTNkpng1 Ainali
 *            Hedvigskyrka 2.JPG" (Jan Ainali, 2012-05-12, CC BY-SA 3.0; south-west, tower close-up),
 *            "Hedvigs kyrka från luften.jpg" (L.G.foto, 2011-04-21, CC BY-SA 4.0; aerial). Inspected
 *            for layout and colour only; nothing is copied into the model.
 *   [RAÄ]    Arkeologerna/RAÄ UV Öst rapport 2015:7, "Hedvigs kyrka – ett ledningsschakt för
 *            fasadbelysning runt kyrkan" (trench dug 25–26 March 2014 for a new façade lighting).
 *   [EST]    estimate (no measurement): marked per value.
 */

/** OSM id of the mapped building this model replaces (its generic OSM walls are no longer drawn). */
export const HEDVIG_ID = 'way/88741182';

/**
 * [LIDAR] frame: tower centre in scene units (mid-points of the returns 25.25–31.5 m, the tower's cap
 * and lantern roof) and the nave axis (unit vector in scene x/z, mean of the [OSM] south wall,
 * vertices 59 → 43, and north wall, vertices 7 → 19).
 */
export const FRAME = {
  originScene: [0.1073, -13.0706] as [number, number],
  axisScene: [0.976882, -0.213781] as [number, number],
};

/** [LIDAR] ground (class 2) medians around the church, RH2000 m. */
export const GROUND = { west: 4.77, south: 5.06, north: 4.66, east: 4.92 };

/**
 * The nave (u 1.3 → the east end), from the [OSM] walls and the [LIDAR] roof sections.
 * The roof is a Swedish "säteritak": a lower slope (≈ 44°) from the eave to a short vertical step,
 * then a flatter upper slope (≈ 39°) to the ridge. [LIDAR] nave section (median over u 6–24):
 * eave edge 15.0 m at v −10.9 / 10.6 (≈ 0.5 m beyond the walls), step between 20.9 and 21.75 m at
 * |v| ≈ 4.5, ridge 25.45 m at v −0.14. The east end is hipped with the same profile
 * ([LIDAR] eastEnd section: ridge ends at u ≈ 26.5, step at u ≈ 30.6, eave 15.0 m at u ≈ 37).
 * Profile: [inset from the eave edge (m), height RH2000 (m)].
 */
export const NAVE = {
  /** West end (the gable behind the tower), [OSM] u of the nave's west corners. */
  u0: 1.3,
  /** Wall lines [OSM]: south −10.4, north 10.07. */
  south: -10.4,
  north: 10.07,
  /** Eave edge beyond the walls [LIDAR]. */
  overhang: 0.5,
  ridgeV: -0.14,
  profile: [
    [0, 15.0],
    [6.25, 20.95],
    [6.25, 21.75],
    [10.74, 25.45],
  ] as [number, number][],
};
/** [LIDAR] the walls' top (cornice) under the eave edge; the stone cornice is [PHOTO]. */
export const EAVE = 15.0;

/**
 * The east end [OSM]: three-sided, with diagonal walls from (32.45, ∓9.8) to (36.35, ∓4.1) and the
 * east wall at u 36.76 (v −3.3 … 2.7); small corner buttresses (in the footprint). Eave outline
 * (0.5 m beyond the walls) used for the hipped roof.
 */
export const EAST_END = { diagonalStart: 32.45, eastWall: 36.76, eastHalf: 4.1 };

/**
 * The west bay [OSM]: u −7.9 … 1.3, v −5.8 … 5.3, corner pilasters at the west corners
 * (u −8.7 … −6.5). [LIDAR] westBayCentre section and surface grid: a single slope rising from the
 * west eave (12.8 m at u ≈ −9.0) to a terrace at 17.4 m (u ≈ −4.6 … 1.3) on which the bell tower
 * stands; its side walls rake up with the slope. [PHOTO] cream-plastered portal frontispiece in the
 * middle of the west front, brick to the sides.
 */
export const WEST_BAY = {
  u0: -7.9,
  u1: 1.3,
  v0: -5.8,
  v1: 5.3,
  eaveU: -9.0,
  eave: 12.8,
  terraceU: -4.6,
  terrace: 17.4,
  /** [PHOTO/EST] portal frontispiece on the west wall, cream plaster. */
  frontispiece: { v0: -2.45, v1: 1.95, top: 12.2 },
  /** [PHOTO/EST] arched oak door, centred on the frontispiece. */
  door: { width: 2.0, height: 4.2 },
};

/**
 * The sacristy (north annex) [OSM] u 24.5 … 33.2, v 10.05 … 20.4. [LIDAR] sacristy sections: eave
 * 10.2 m (u 24.25 / 33.25), ridge 12.2 m along v at u ≈ 28.9, hipped at the north end (ridge ends
 * at v ≈ 16). A small porch on its east side ([OSM] u 33.1 … 34.9, v 11.3 … 13.9; [LIDAR] 8.6–9.4 m).
 */
export const SACRISTY = {
  u0: 24.5,
  u1: 33.2,
  v0: 10.05,
  v1: 20.4,
  eave: 10.2,
  ridge: 12.2,
  overhang: 0.3,
  porchTop: 9.0,
};

/**
 * The bell tower [LIDAR slices + PHOTO]: a dark, panel-clad bell stage standing on the west bay's
 * terrace, wider across the church (v) than along it, with a white balustrade at its foot, two arched
 * louvres per face with gilded swags, a low flared copper cap, an OCTAGONAL dark lantern (clock dials
 * on the four wide faces, gilded diamonds on the four narrow diagonal ones), an octagonal concave
 * copper roof, a gilded ball and a needle with a weathervane (an angel, [PHOTO]; not modelled).
 * The octagon is also what the LiDAR shows at the lantern roof: its returns reach further out at the
 * middle of each side than at the corners. Plan half-widths (u, v) from the returns in height bands
 * (2nd–98th percentile, the nave ridge excluded; they lie slightly inside the true edge, so the model
 * adds ≈ 0.1–0.2 m): cap rim 25.2–25.9 m 7.11 × 8.95 m, cap 25.9–27.6 m 5.46 × 6.71 m, lantern roof
 * rim 29.9–30.8 m 4.67 × 6.30 m, 30.8–31.6 m 3.46 × 4.44 m. The tower is aligned with the nave: the
 * best-fitting rectangle of each band is turned 0–3° (−15° for the sparse top band).
 */
export const TOWER = {
  /** [LIDAR] the stage's west face ≈ −3.4 (balustrade returns at u −4.6 … −3.2, 18–18.7 m). */
  stage: { hu: 3.45, hv: 4.35, bottom: 17.4, top: 25.2 },
  /** [LIDAR 17.5–18.5 m] balustrade on the terrace edge; height [PHOTO/EST] 1.1 m. */
  balustrade: { u0: -4.6, hv: 4.9, top: 18.5, thickness: 0.3 },
  /** [LIDAR 25–27.5 m] cap rings [height, half-width u, half-width v]. */
  cap: [
    [25.2, 3.7, 4.6],
    [25.6, 3.4, 4.25],
    [26.3, 2.9, 3.55],
    [27.0, 2.45, 3.1],
    [27.5, 2.35, 3.0],
  ] as [number, number, number][],
  /**
   * [EST from LIDAR cap top + PHOTO] lantern body (no returns on its walls 27.5–30 m): as wide as the
   * cap where it ends; the roof's eave overhangs it.
   */
  lantern: { hu: 2.3, hv: 2.95, bottom: 27.5, top: 30.1 },
  /** [PHOTO] the lantern and its roof are octagons: corners cut by 0.35 × the smaller half-width. */
  chamfer: 0.35,
  /** [LIDAR 30–34 m] lantern roof rings (octagonal). */
  roof: [
    [30.1, 2.7, 3.5],
    [30.5, 2.2, 2.85],
    [31.0, 1.85, 2.35],
    [31.5, 1.5, 1.8],
    [32.0, 1.05, 1.1],
    [32.5, 0.8, 0.85],
    [33.5, 0.35, 0.35],
    [34.0, 0.12, 0.12],
  ] as [number, number, number][],
  /** [LIDAR] highest return 36.9 m (the needle; the vane above it is not resolved). */
  top: 36.9,
  /** [EST from PHOTO] gilded ball on the needle. */
  ball: { centre: 35.0, radius: 0.3 },
  /** [EST from PHOTO]: two arched louvres per face (spacing on the ±u faces / the ±v faces). */
  louvres: { bottom: 19.4, top: 23.6, width: 1.7, spacingWide: 3.8, spacingNarrow: 3.0 },
  /** [EST from PHOTO] clock dial on each lantern face. */
  clock: { centre: 28.8, diameter: 1.6 },
};

/**
 * Façade [PHOTO]: red brick with pilasters, a light stone plinth and cornice; tall round-arched
 * windows, one per bay between the pilasters; copper roofs. Window size and sill are [EST].
 */
export const FACADE = {
  plinthTop: 6.0,
  cornice: { bottom: 14.3, projection: 0.45 },
  windows: { sill: 7.8, top: 13.2, width: 1.9 },
  /** Pilaster pairs of the long walls ([OSM] notches): window bays lie between them. */
  bayCentres: [5.7, 11.6, 17.4, 23.3, 29.1],
};
export const COLOURS = {
  brick: '#a85a48',
  trim: '#ddd0b2',
  plinth: '#b5afa2',
  plaster: '#e6dbc1',
  copper: '#6f9f8a',
  timber: '#2c2d2b',
  balustrade: '#e9e5dc',
  window: '#262b30',
  door: '#3b2f27',
  louvre: '#18191a',
  gold: '#e0b84a',
  /** [EST] floodlight housings on the ground. */
  fixture: '#3a3c3e',
};

/**
 * Floodlights at night [RAÄ + EST]. The parish installed a new façade lighting in 2014: the cable
 * trench ran along the church's east and west sides, around the tower (north and south of it) and
 * 5 m south-west of it. No document gives fixture types, positions, aiming or colour, and no dated
 * night photograph was found, so everything below is an ESTIMATE consistent with that trench:
 * ground-mounted floodlights at the west front, beside the tower base and at the east end, aimed
 * up at the walls and the tower. Warm white (3000 K, the usual choice for heritage façades) and
 * intensities chosen for ≈ 50–200 lx on the walls (CIE 94-type guidance for a brick façade in a lit
 * town square). Positions: building frame (u, v, height above the ground there); aim: frame point.
 */
export interface Floodlight {
  name: string;
  at: [number, number];
  /** Mounting height above the rendered ground, m. */
  height: number;
  /** Aim point (u, v, h RH2000). */
  aim: [number, number, number];
  /** Beam half-angles, degrees (full intensity inside `inner`, none outside `outer`). */
  inner: number;
  outer: number;
  /** Peak intensity, candela [EST]. */
  candela: number;
  /** Range window, m. */
  rangeM: number;
}
export const FLOOD_COLOR_3000K: [number, number, number] = [1.0, 0.72, 0.46];
export const FLOODLIGHTS: Floodlight[] = [
  // West front: two floods in front of the corner pilasters, washing the front and the bell stage.
  {
    name: 'west-south',
    at: [-12.5, -4.0],
    height: 0.3,
    aim: [-8.0, -2.5, 9.5],
    inner: 24,
    outer: 40,
    candela: 6500,
    rangeM: 40,
  },
  {
    name: 'west-north',
    at: [-12.5, 3.4],
    height: 0.3,
    aim: [-8.0, 2.0, 9.5],
    inner: 24,
    outer: 40,
    candela: 6500,
    rangeM: 40,
  },
  // Tower: one narrow flood 5 m south-west of it [RAÄ] and one each north and south of its base.
  {
    name: 'tower-south-west',
    at: [-10.5, -8.5],
    height: 0.3,
    aim: [-3.3, -1.5, 23],
    inner: 9,
    outer: 16,
    candela: 24000,
    rangeM: 55,
  },
  {
    name: 'tower-south',
    at: [-2.0, -10.0],
    height: 0.3,
    aim: [-0.5, -4.35, 22.5],
    inner: 10,
    outer: 18,
    candela: 20000,
    rangeM: 45,
  },
  {
    name: 'tower-north',
    at: [-2.0, 9.0],
    height: 0.3,
    aim: [-0.5, 4.35, 22.5],
    inner: 10,
    outer: 18,
    candela: 20000,
    rangeM: 45,
  },
  // East end: one flood in front of each wall of the three-sided end.
  {
    name: 'east-south',
    at: [37.5, -10.5],
    height: 0.3,
    aim: [34.4, -7.0, 11],
    inner: 18,
    outer: 30,
    candela: 7000,
    rangeM: 35,
  },
  {
    name: 'east',
    at: [41.0, -0.3],
    height: 0.3,
    aim: [36.8, -0.3, 11],
    inner: 18,
    outer: 30,
    candela: 7000,
    rangeM: 35,
  },
  {
    name: 'east-north',
    at: [37.5, 10.0],
    height: 0.3,
    aim: [34.4, 6.8, 11],
    inner: 18,
    outer: 30,
    candela: 7000,
    rangeM: 35,
  },
];
