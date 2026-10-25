import outline from './emblem-outline.json';

/**
 * Police Signs Phase D1: the police emblem sign on Polishuset (Stinsen 1, Stockholmsvägen 4–6).
 *
 * Evidence (docs/police-signs-d1/data-provenance.md):
 *   [HEMSO]  Hemsö Fastighets AB, "Stinsen 1 – Norrköpings Polisstation" (property page, image
 *            uploaded 2023-10, read 2026-10-25): stated address Stockholmsvägen 4–6; photograph from
 *            a distance, near-frontal to the south-south-east gable, after the 2018 re-cladding.
 *            Inspected and measured only, not copied or redistributed.
 *   [PHOTO]  Wikimedia Commons "Polishuset Norrköping 2008-05-10.jpg" (public domain),
 *            "Polishuset Norrköping.jpg" (2016-10-01, CC BY-SA 4.0), "Norrköping juni 2018 51.jpg"
 *            (2018-06-21, CC BY-SA 4.0): same emblem, same gable, centred near the top; no other
 *            police sign or lettering is visible on the tower or at the entrance.
 *   [LIDAR]  Lantmäteriet point cloud "Laserdata NH 2020", tile y20c012-64950_5675_25 (2020-02-03,
 *            CC BY 4.0): scripts/police-signs-d1/police_tower_lidar.py →
 *            docs/police-signs-d1/data/police-tower-lidar.json (width of the tall dark gable = the photo's scale).
 *   [LIDAR2] the same tile, Police Tower Phase D1b: scripts/police-tower-d1b/police_tower_parts.py →
 *            docs/police-tower-d1b/data/police-tower-parts.json (the tower's parts; see TOWER).
 *   [EST]    estimate (no measurement): marked per value.
 *
 * Nothing documents the sign's construction, lettering or whether it is lit at night: the night glow
 * is an [EST] (the roadmap asks for it; no night photograph was found).
 */

/** Scene units: 1 unit = 25 m, scene y = RH2000 / 25 (terrain.json reference, verticalOriginMetres 0). */
export const METRES_PER_UNIT = 25;

/**
 * Police Tower Phase D1b: the tower as built, from [LIDAR2] and checked against [HEMSO]/[PHOTO]
 * (docs/police-tower-d1b/). The roof returns show three parts:
 *   - UPPER: the full-height slab with the dark SSE gable (the emblem gable), ≈ 9 m wide;
 *   - EAST: a strip along the east-north-east long side, one storey lower, ending 4.5 m short of the
 *     SSE gable (the light, recessed part beside the dark gable in the Hemsö photo; no returns above
 *     13.5 m in that corner);
 *   - NORTH: the north-north-west end, as high as the EAST strip's rim.
 *
 * TOWER FRAME: metres; origin = centre of the UPPER roof's extent (`centreScene`); a along the UPPER
 * block's long axis towards the SSE gable (= the tower group's local +z), c towards east-north-east
 * (= local +x); heights RH2000 m. Extents are percentiles of the roof returns (1st/99th along,
 * 2nd/98th across), so the walls are drawn EDGE_M further out.
 */
export const TOWER = {
  /** UPPER roof-extent centre, scene units (SWEREF E 568 304.05, N 6 495 635.95). */
  centreScene: [-29.0479, -25.8868] as [number, number],
  /** UPPER long axis towards the SSE gable, SWEREF (east, north); bearing 163.71°. */
  axisSweref: [0.280441, -0.959871] as [number, number],
  /** UPPER block. Roof: interior returns p50; parapet: edge returns p90 (p50 49.30, max 49.38). */
  upper: { a0: -25.05, a1: 25.05, c0: -4.28, c1: 4.28, roof: 49.02, parapet: 49.35 },
  /**
   * EAST strip (it starts at the NORTH block). Roof: the trough's returns p50; a raised outer rim
   * from c 7.5 (where the 0.5 m column medians cross the mid-height), returns p50 46.23.
   */
  east: { a1: 20.54, c1: 8.98, roof: 45.32, rimInnerC: 7.5, rimTop: 46.23 },
  /**
   * NORTH block (it ends at the UPPER block). Roof: returns p50. Its ENE face is drawn in line with
   * the EAST strip's: its own 98th percentile (8.59 m, 75 returns) is 0.4 m short, within the edge bias.
   */
  north: { a0: -30.29, c0: 0.49, roof: 46.26 },
  /** Ground (class 2 p50) 5–25 m in front of the SSE gable, across the UPPER width, RH2000 m. */
  ground: 11.74,
};

/**
 * [EST] walls stand this far outside the returns' extents (sparse edge returns at 1.2 pt/m²: up to
 * ≈ 0.5 m; the same allowance D1 used for GABLE_WIDTH_M).
 */
export const EDGE_M = 0.25;

/**
 * [LIDAR2] rooftop plant: clusters of returns ≥ 50.2 m over the tower (TOWER FRAME extents, top
 * RH2000 m). The mast stands at its highest return; `baseTop` is the equipment at its foot.
 */
export const PLANT = [
  { a0: -25.6, a1: -20.81, c0: 0.14, c1: 4.63, top: 52.45 },
  { a0: -24.57, a1: -24.21, c0: -2.34, c1: -2.18, top: 52.44 },
  { a0: -18.99, a1: -18.77, c0: -2.57, c1: -2.34, top: 52.12 },
  { a0: -15.91, a1: -15.73, c0: 4.26, c1: 4.45, top: 50.54 },
  { a0: -7.73, a1: -6.45, c0: 3.98, c1: 4.0, top: 53.5 },
  { a0: -1.74, a1: -1.74, c0: 4.17, c1: 4.17, top: 51.32 },
  { a0: 14.51, a1: 15.96, c0: 1.82, c1: 3.09, top: 64.12, mastAt: [15.24, 2.52], baseTop: 51.89 },
  { a0: 18.88, a1: 19.17, c0: -3.35, c1: -3.34, top: 50.74 },
  { a0: 19.57, a1: 19.85, c0: 4.32, c1: 4.54, top: 51.71 },
  { a0: 22.43, a1: 24.5, c0: -1.14, c1: 2.39, top: 52.03 },
] as {
  a0: number;
  a1: number;
  c0: number;
  c1: number;
  top: number;
  mastAt?: number[];
  baseTop?: number;
}[];

/**
 * [EST] details not measured: parapet thickness, the smallest plant box (single returns), the mast's
 * width, and the façade texture's window rhythm (bay width and storey height; photos show vertical
 * fins and ≈ 11–13 window rows, not countable exactly). The window texture starts at TOWER.ground.
 */
export const DETAIL = { parapetM: 0.3, plantMinM: 1.0, mastM: 0.4, bayM: 3.2, storeyM: 3.4 };

/**
 * The tower group (scene units): origin at the UPPER centre at scene height 0 (so local y = RH2000 /
 * 25), rotation about +y so that local +z points along TOWER.axisSweref (out of the SSE gable),
 * half length of the UPPER block (its SSE gable wall at local z = +halfLength) and the parapet top.
 * mapLandmarks.ts places the tower group and the emblem sign (a child) with these numbers.
 */
export const TOWER_MODEL = {
  position: TOWER.centreScene,
  // Local +z in scene x/z = (sin r, cos r) = (east, −north) of the axis.
  rotation: Math.atan2(TOWER.axisSweref[0], -TOWER.axisSweref[1]),
  halfLength: (TOWER.upper.a1 + EDGE_M) / METRES_PER_UNIT,
  parapetTop: TOWER.upper.parapet / METRES_PER_UNIT,
};

/**
 * [LIDAR] D1's single-rectangle measurement of the whole roof (police-tower-lidar.json), kept for
 * documentation and D1's photo scale. D1b's parts (TOWER) supersede it for the geometry: the
 * whole-roof axis mixes the UPPER block with the lower parts (1.9° off), and the parapet is 49.35 m
 * from the edge returns of the UPPER block alone (D1's 49.5 included plant returns near the gable).
 */
export const TOWER_MEASURED = {
  /** Roof extent, 1st–99th percentile of the roof returns (walls up to ≈ 0.5 m further out). */
  lengthM: 54.38,
  /** Full tower width (tall part + the lower strip on the ENE side). */
  widthM: 13.42,
  /**
   * Width of the TALL part at the SSE end (roof ≈ 49.1 m), i.e. the dark gable carrying the emblem;
   * the lower strip (roof ≈ 45.5 m, ≈ 5 m wide) on the ENE side is a separate white façade.
   */
  gableTallWidthM: 8.82,
  /** Highest returns at the SSE gable edge (parapet), RH2000 m (median 49.31, p90 49.61). */
  parapetRH2000: 49.5,
  /** Ground in front of the SSE gable (class 2 median), RH2000 m. */
  groundRH2000: 11.84,
  /** Long axis towards the SSE gable, degrees clockwise from grid north. */
  bearingDeg: 165.6,
};

/**
 * Gable width used as the photo's scale: the dark gable between its light corner strips is the
 * tower's TALL part, [LIDAR] 8.82 m between the 1st/99th-percentile returns + ≈ 0.5 m for the sparse
 * edge returns ([EST], range 8.8–9.8 m). (D1 first used the full tower width 13.9 m, which made the
 * emblem ≈ 1.5 × too large; corrected 2026-10-25.)
 */
export const GABLE_WIDTH_M = 9.3;

/**
 * Width : height of the painted emblem in the official artwork (its alpha ≥ 50 % outline,
 * emblem-outline.json: 488 × 645 px of the 512 × 668 raster, 0.757).
 */
export const EMBLEM_ASPECT = (() => {
  const [w, h] = outline.raster;
  const us = outline.outer[0].map((p) => p[0]),
    vs = outline.outer[0].map((p) => p[1]);
  return ((Math.max(...us) - Math.min(...us)) * w) / ((Math.max(...vs) - Math.min(...vs)) * h);
})();

/**
 * [HEMSO] photo measurements, pixels of the 1024 × 768 image (±1 px at the edges): gable
 * light-strip to light-strip 157.5 px wide; emblem 42.5 px wide, 57 px tall, its centre 125.7 px
 * below the parapet top and 0.5 px off the gable's centre line. Horizontal lengths on the gable are
 * shortened by the viewing angle (`cosView` ≈ 0.985, ≈ 10° from frontal), found from the emblem's
 * apparent aspect against the artwork's (assumes the sign has the artwork's proportions).
 */
export const PHOTO = {
  gablePx: 157.5,
  emblemWidthPx: 42.5,
  emblemHeightPx: 57,
  centreBelowParapetPx: 125.7,
  centreOffsetPx: 0.5,
  get cosView() {
    return this.emblemWidthPx / this.emblemHeightPx / EMBLEM_ASPECT;
  },
};

const mPerPxH = GABLE_WIDTH_M / PHOTO.gablePx;
const mPerPxV = mPerPxH * PHOTO.cosView;

/**
 * The emblem sign. Size and height from [HEMSO] scaled by [LIDAR] (≈ ±0.25 m size, ±0.7 m height);
 * mounting depth [EST]. Placed on the UPPER block's SSE gable (Police Tower D1b: the tower is drawn
 * from [LIDAR2]) at the measured distance below the parapet, so this is also its RH2000 height:
 * 49.35 − 7.3 = 42.05 m.
 */
export const SIGN = {
  /** Width and height of the visible emblem, metres (2.51 × 3.32 m). */
  widthM: Math.round(PHOTO.emblemWidthPx * mPerPxH * 100) / 100,
  heightM: Math.round(PHOTO.emblemHeightPx * mPerPxV * 100) / 100,
  /** Centre below the parapet top, metres (7.3 m). */
  centreBelowParapetM: Math.round(PHOTO.centreBelowParapetPx * mPerPxV * 10) / 10,
  /** Horizontal offset from the gable's centre line, metres (≈ 0: centred). */
  centreOffsetM: 0,
  /** [EST] distance of the sign's face in front of the gable wall, metres (relief letters/plate). */
  standoffM: 0.25,
  /** Number of emblem signs found on the tower ([PHOTO], [HEMSO]: one, on the SSE gable). */
  count: 1,
};

/**
 * [EST] night glow: emissive gain at full night level (env.artificial = 1), with the artwork's own
 * colours as the emissive map. 0 by day, so the daytime look is the painted sign under daylight only.
 * Chosen to read clearly brighter than the dark gable without washing the colours out (evidence
 * captures in docs/police-signs-d1/evidence/).
 */
export const NIGHT_GAIN = 1.1;

/** Sign plane in the tower's local frame (scene units): centre and size. */
export function signPlacement(metresPerUnit = 25) {
  return {
    x: SIGN.centreOffsetM / metresPerUnit,
    y: TOWER_MODEL.parapetTop - SIGN.centreBelowParapetM / metresPerUnit,
    z: TOWER_MODEL.halfLength + SIGN.standoffM / metresPerUnit,
    width: SIGN.widthM / metresPerUnit,
    height: SIGN.heightM / metresPerUnit,
  };
}
