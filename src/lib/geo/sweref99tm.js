/**
 * SWEREF 99 TM (EPSG:3006) and the simulator's local scene frame.
 *
 * Canonical horizontal reference: SWEREF 99 TM, Gauss–Krüger projection of GRS 80 with central meridian
 * 15° E, scale 0.9996 and false easting 500 000 m. Forward and inverse use Lantmäteriet's Krüger series
 * (accurate to well below a millimetre in Sweden). Verified against Lantmäteriet's published SWEPOS point
 * G5TA, Lantmäteriet STAC tile corners and PROJ (src/lib/data/geo-reference-points.json,
 * scripts/geo/verify_projection.py).
 *
 * Scene frame (shared with TerrainService.kt and the Python data tools):
 *   x = (E − originEasting)  / (metresPerUnit · gridScaleFactor)   (east)
 *   z = (originNorthing − N) / (metresPerUnit · gridScaleFactor)   (south)
 * gridScaleFactor is the SWEREF 99 TM point scale factor at the origin, so one scene unit is
 * `metresPerUnit` ground metres (to ±2·10⁻⁵ over the map). Scene axes follow the SWEREF 99 TM grid;
 * true north differs from grid north by `gridConvergenceDegrees` (see trueNorth()).
 */

const A = 6378137;
const F = 1 / 298.257222101;
export const CENTRAL_MERIDIAN = 15;
export const K0 = 0.9996;
export const FALSE_EASTING = 500000;
const E2 = F * (2 - F);
const N = F / (2 - F);
const AROOF = (A / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64);
const CA = E2,
  CB = (5 * E2 ** 2 - E2 ** 3) / 6,
  CC = (104 * E2 ** 3 - 45 * E2 ** 4) / 120,
  CD = (1237 * E2 ** 4) / 1260;
const BETA = [
  N / 2 - (2 * N ** 2) / 3 + (5 * N ** 3) / 16 + (41 * N ** 4) / 180,
  (13 * N ** 2) / 48 - (3 * N ** 3) / 5 + (557 * N ** 4) / 1440,
  (61 * N ** 3) / 240 - (103 * N ** 4) / 140,
  (49561 * N ** 4) / 161280,
];
const DELTA = [
  N / 2 - (2 * N ** 2) / 3 + (37 * N ** 3) / 96 - N ** 4 / 360,
  N ** 2 / 48 + N ** 3 / 15 - (437 * N ** 4) / 1440,
  (17 * N ** 3) / 480 - (37 * N ** 4) / 840,
  (4397 * N ** 4) / 161280,
];
const AS = E2 + E2 ** 2 + E2 ** 3 + E2 ** 4,
  BS = -(7 * E2 ** 2 + 17 * E2 ** 3 + 30 * E2 ** 4) / 6,
  CS = (224 * E2 ** 3 + 889 * E2 ** 4) / 120,
  DS = (-4279 * E2 ** 4) / 1260;
const RAD = Math.PI / 180;

/**
 * Geodetic SWEREF 99 (≈ WGS84 at map accuracy) → SWEREF 99 TM.
 * @param {number} lat degrees
 * @param {number} lon degrees
 * @returns {[number, number]} [easting, northing] metres
 */
export function geodeticToSweref(lat, lon) {
  const phi = lat * RAD,
    dl = (lon - CENTRAL_MERIDIAN) * RAD,
    s = Math.sin(phi);
  const phis = phi - s * Math.cos(phi) * (CA + CB * s ** 2 + CC * s ** 4 + CD * s ** 6);
  const xi = Math.atan2(Math.tan(phis), Math.cos(dl)),
    eta = Math.atanh(Math.cos(phis) * Math.sin(dl));
  let x = xi,
    y = eta;
  for (let j = 1; j <= 4; j++) {
    x += BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    y += BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  return [K0 * AROOF * y + FALSE_EASTING, K0 * AROOF * x];
}

/**
 * SWEREF 99 TM → geodetic SWEREF 99.
 * @param {number} easting metres
 * @param {number} northing metres
 * @returns {[number, number]} [lat, lon] degrees
 */
export function swerefToGeodetic(easting, northing) {
  const xi = northing / (K0 * AROOF),
    eta = (easting - FALSE_EASTING) / (K0 * AROOF);
  let xip = xi,
    etap = eta;
  for (let j = 1; j <= 4; j++) {
    xip -= DELTA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etap -= DELTA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const phis = Math.asin(Math.sin(xip) / Math.cosh(etap)),
    dl = Math.atan(Math.sinh(etap) / Math.cos(xip)),
    s = Math.sin(phis);
  const phi = phis + s * Math.cos(phis) * (AS + BS * s ** 2 + CS * s ** 4 + DS * s ** 6);
  return [phi / RAD, CENTRAL_MERIDIAN + dl / RAD];
}

/**
 * @typedef {object} SceneReference
 * @property {'EPSG:3006'} crs
 * @property {number} originEasting SWEREF 99 TM metres
 * @property {number} originNorthing SWEREF 99 TM metres
 * @property {number} gridScaleFactor SWEREF 99 TM point scale factor at the origin
 * @property {number} gridConvergenceDegrees true north relative to grid north at the origin (+ = east)
 * @property {number} metresPerUnit ground metres per scene unit
 */

/**
 * @param {SceneReference} r
 * @param {number} easting
 * @param {number} northing
 * @returns {[number, number]} scene [x, z]
 */
export function swerefToScene(r, easting, northing) {
  const unit = r.metresPerUnit * r.gridScaleFactor;
  return [(easting - r.originEasting) / unit, (r.originNorthing - northing) / unit];
}

/**
 * @param {SceneReference} r
 * @param {number} x
 * @param {number} z
 * @returns {[number, number]} [easting, northing]
 */
export function sceneToSweref(r, x, z) {
  const unit = r.metresPerUnit * r.gridScaleFactor;
  return [r.originEasting + x * unit, r.originNorthing - z * unit];
}

/**
 * @param {SceneReference} r
 * @param {number} lat
 * @param {number} lon
 * @returns {[number, number]} scene [x, z]
 */
export function geodeticToScene(r, lat, lon) {
  const [e, n] = geodeticToSweref(lat, lon);
  return swerefToScene(r, e, n);
}

/**
 * @param {SceneReference} r
 * @param {number} x
 * @param {number} z
 * @returns {[number, number]} [lat, lon]
 */
export function sceneToGeodetic(r, x, z) {
  const [e, n] = sceneToSweref(r, x, z);
  return swerefToGeodetic(e, n);
}

/**
 * Unit vector of true north in scene (x, z) at the origin. Grid north is (0, -1).
 * @param {SceneReference} r
 * @returns {[number, number]}
 */
export function trueNorth(r) {
  const g = r.gridConvergenceDegrees * RAD;
  return [Math.sin(g), -Math.cos(g)];
}

/** The fixed scene reference used by every dataset (verified by scripts/geo/verify_projection.py). */
/** @type {SceneReference} */
export const SCENE_REFERENCE = {
  crs: 'EPSG:3006',
  originEasting: 569030,
  originNorthing: 6494989,
  gridScaleFactor: 0.9996584126,
  gridConvergenceDegrees: -1.0134914515,
  metresPerUnit: 25,
};
