/**
 * Phase D2 — fuel stations: every value the model uses, with its source tag.
 *
 *   [OSM]   OpenStreetMap (ODbL-1.0): station points (docs/step62/evidence/fuel-stations.json) and the
 *           canopy outlines (building=roof, or building:part=roof on the amenity=fuel way; by the
 *           user's decision of 2026-11-10 also one building=yes outline read as a canopy).
 *   [LIDAR] Lantmäteriet Laserdata NH 2020 (CC BY 4.0): the height of each canopy's top, measured by
 *           scripts/fuel-d2/canopies_lidar.py into src/lib/data/fuel-canopies.json; for one station
 *           (OKQ8 Hagebygatan, user decision 2026-11-10) also the outline (`ringSweref`).
 *   [EST]   This project's estimate. No source documents the depth of the canopies' edge band, the
 *           pump islands, dispensers, columns, the luminaires, their output or colour, or the signs.
 *
 * Signs are generic (a neutral lit band in the canopy edge): the operators' logos are not licensed.
 */
import data from '../data/fuel-canopies.json';

export const FUEL_VERSION = 'fuel-d2-v1';
export const FUEL_DATA = data;

/** [OSM]+[LIDAR] Canopy outlines that pass the LiDAR check (OSM way IDs, or `lidar:<station>`). */
export const FUEL_CANOPY_IDS: readonly string[] = data.canopies
  .filter((c) => c.accepted)
  .map((c) => c.id)
  .sort();
/** The canopies that are OSM buildings: their OSM extrusions are replaced (cityPlaces). */
export const FUEL_REPLACED_IDS: readonly string[] = FUEL_CANOPY_IDS.filter((id) =>
  id.startsWith('way/'),
);

/** [EST] Depth of the canopy's edge band (fascia) below the measured top: typical 0.6–1.2 m. */
export const FASCIA_DEPTH_M = 0.9;
/**
 * [EST] …but never so deep that the underside comes within MIN_UNDERSIDE_M of the LiDAR ground: low
 * canopies (OKQ8 Hagebygatan 3.97 m, Ingo Lindövägen 4.27 m to the top) get a shallower fascia. Every
 * other canopy keeps 0.9 m (their tops are ≥ 4.64 m).
 */
export const MIN_UNDERSIDE_M = 3.5;
/** [EST] Fascia depth of a canopy whose top is `clearanceM` above the LiDAR ground. */
export const fasciaDepth = (clearanceM: number) =>
  Math.min(FASCIA_DEPTH_M, clearanceM - MIN_UNDERSIDE_M);
/** [EST] The generic lit sign band in the middle of the fascia (no logo, neutral white). */
export const SIGN_BAND_M = 0.32;

/** [EST] Pump islands: one per ISLAND_PITCH_M of canopy length, across the canopy (drive-through). */
export const ISLAND = {
  pitchM: 7.5,
  maxCount: 8,
  widthM: 1.2,
  heightM: 0.18,
  /** Island length = canopy width − 2 × clearM, within [minLengthM, maxLengthM]. */
  clearM: 1.2,
  minLengthM: 2.6,
  maxLengthM: 6,
  /** Corners must lie this far inside the outline (non-rectangular outlines). */
  insideM: 0.3,
};
/** [EST] One dispenser in the middle of each island. */
export const DISPENSER = {
  acrossM: 0.5,
  alongM: 1.0,
  heightM: 1.85,
  displayM: [0.42, 0.3] as const,
};
/** [EST] One canopy column per island, near its end. */
export const COLUMN = { sideM: 0.4, fromEndM: 0.45 };

/**
 * [EST] Recessed LED downlights in the canopy: a grid of LAMP.spacingM, LAMP.insetM inside the outline.
 * ≈ 1 200 cd gives ≈ 60 lx below one lamp at 4.7 m and ≈ 100–150 lx where the grid overlaps (a bright
 * forecourt beside 10–20 lx streets). 4 000 K like the site lighting (Phase L2d). Not luminaire data.
 */
export const LAMP = {
  type: 'canopy-downlight',
  spacingM: 5,
  insetM: 1.5,
  edgeM: 0.8,
  cct: 4000,
  candela: 1200,
  rangeM: 16,
  profile: 1,
};

/** [EST] Night glow (× the street lighting's night level): the soffit lit by its lamps, the sign band. */
export const NIGHT_GAIN = { soffit: 0.18, band: 0.85 };

/** [EST] Colours (sRGB hex). */
export const COLOURS = {
  deck: '#8b9095',
  fascia: '#e8ebed',
  soffit: '#dde1e4',
  band: '#f4f6f7',
  column: '#c3c8cc',
  island: '#b8b2a6',
  dispenser: '#d4d8db',
  display: '#2a3036',
};
