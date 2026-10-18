// The legacy (pre-2026-10-18) equirectangular scene frame and its exact mapping into the SWEREF 99 TM
// scene frame. Used only for migrating stored coordinates and for before/after verification.
import { SCENE_REFERENCE as REF, geodeticToScene } from '../../src/lib/geo/sweref99tm.js';

export const LEGACY = { lat: 58.58981, lon: 16.18747, mLon: 58010, mLat: 111133, unit: 25 };
/** Exact inverse of the legacy importer projection. */
export const legacyToGeodetic = (x, z) => [
  LEGACY.lat - (z * LEGACY.unit) / LEGACY.mLat,
  LEGACY.lon + (x * LEGACY.unit) / LEGACY.mLon,
];
/** Legacy projection (what the old importer did). */
export const geodeticToLegacy = (lat, lon) => [
  ((lon - LEGACY.lon) * LEGACY.mLon) / LEGACY.unit,
  ((LEGACY.lat - lat) * LEGACY.mLat) / LEGACY.unit,
];
export const round3 = (n) => Math.round(n * 1000) / 1000;
/** Legacy scene → new scene, unrounded. */
export const exact = (x, z) => geodeticToScene(REF, ...legacyToGeodetic(x, z));
/** Legacy scene → new scene, rounded to the importer's 0.001 unit (2.5 cm) precision. */
export const point = ([x, z]) => exact(x, z).map(round3);
/** Local Jacobian of the legacy → new mapping (rows: new x, new z; columns: d/dx, d/dz). */
export function jacobian(x, z, h = 0.01) {
  const [ax, az] = exact(x - h, z),
    [bx, bz] = exact(x + h, z),
    [cx, cz] = exact(x, z - h),
    [dx, dz] = exact(x, z + h);
  return [
    [(bx - ax) / (2 * h), (dx - cx) / (2 * h)],
    [(bz - az) / (2 * h), (dz - cz) / (2 * h)],
  ];
}
const apply = (J, [u, v]) => [J[0][0] * u + J[0][1] * v, J[1][0] * u + J[1][1] * v];
/** Three.js rotation.y (local +z → (sinθ, cosθ)) migrated at a legacy position. */
export function heading(x, z, theta) {
  const [u, v] = apply(jacobian(x, z), [Math.sin(theta), Math.cos(theta)]);
  return Math.atan2(u, v);
}
/** Direction vector migrated at a legacy position, keeping its length scaled by the mapping. */
export function direction(x, z, d) {
  return apply(jacobian(x, z), d);
}
/** Local linear scale of the mapping (legacy units → new units). */
export function scaleAt(x, z) {
  const J = jacobian(x, z);
  return Math.sqrt(Math.abs(J[0][0] * J[1][1] - J[0][1] * J[1][0]));
}
