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
 *            docs/police-signs-d1/data/police-tower-lidar.json (tower width = the photo's scale).
 *   [MODEL]  the existing illustrative police tower in src/lib/mapLandmarks.ts (not measured).
 *   [EST]    estimate (no measurement): marked per value.
 *
 * Nothing documents the sign's construction, lettering or whether it is lit at night: the night glow
 * is an [EST] (the roadmap asks for it; no night photograph was found).
 */

/**
 * [MODEL] the police tower as drawn (scene units, 1 unit = 25 m): slab centre (x, z), rotation about
 * +y, half length of the slab along its local z (the long axis; local +z points to the
 * south-south-east gable, bearing ≈ 164°), and the top of the parapet cap above the tower base.
 * These are the numbers mapLandmarks.ts builds the tower from.
 */
export const TOWER_MODEL = {
  position: [-29.25, -26.22] as [number, number],
  rotation: 0.2775,
  halfLength: 1.325,
  parapetTop: 1.95,
};

/** [LIDAR] the real tower (police-tower-lidar.json): for comparison and documentation only. */
export const TOWER_MEASURED = {
  /** Roof extent, 1st–99th percentile of the roof returns (walls up to ≈ 0.5 m further out). */
  lengthM: 54.38,
  widthM: 13.42,
  /** Highest returns at the SSE gable edge (parapet), RH2000 m (median 49.31, p90 49.61). */
  parapetRH2000: 49.5,
  /** Ground in front of the SSE gable (class 2 median), RH2000 m. */
  groundRH2000: 11.84,
  /** Long axis towards the SSE gable, degrees clockwise from grid north. */
  bearingDeg: 165.6,
};

/**
 * Gable width used as the photo's scale: [LIDAR] 13.42 m roof extent + ≈ 0.5 m for the sparse edge
 * returns ([EST], range 13.4–14.4 m).
 */
export const GABLE_WIDTH_M = 13.9;

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
 * The emblem sign. Size and height from [HEMSO] scaled by [LIDAR] (≈ ±0.3 m size, ±1 m height);
 * mounting depth [EST]. The sign is placed on the [MODEL] gable at the measured distance below the
 * parapet: the model tower is ≈ 10 m taller than the real one (docs/police-signs-d1/remaining-gaps.md),
 * so the sign keeps its real size and its real relation to the parapet, not its RH2000 height.
 */
export const SIGN = {
  /** Width and height of the visible emblem, metres (3.75 × 4.96 m). */
  widthM: Math.round(PHOTO.emblemWidthPx * mPerPxH * 100) / 100,
  heightM: Math.round(PHOTO.emblemHeightPx * mPerPxV * 100) / 100,
  /** Centre below the parapet top, metres (10.9 m). */
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
