import config from './data/ingelsta-bridge.json' with { type: 'json' };
export const centre = [(config.a[0] + config.b[0]) / 2, (config.a[1] + config.b[1]) / 2];
// Trench axis in the SWEREF 99 TM scene frame. Migrated from the legacy axis (0.98, 0.199) with
// scripts/geo/legacy-frame.mjs: same geographic direction and extent (AXIS_SCALE = local scale).
const AXIS_COS = 0.98334,
  AXIS_SIN = 0.18179,
  AXIS_SCALE = 1.00233;
/** @param {number[]} p */
export function trenchCoordinates(p) {
  const x = p[0] - centre[0],
    z = p[1] - centre[1];
  return [(x * AXIS_COS + z * AXIS_SIN) / AXIS_SCALE, (z * AXIS_COS - x * AXIS_SIN) / AXIS_SCALE];
}
/** @param {number} u @param {number} v */
export function trenchPoint(u, v) {
  return [
    centre[0] + AXIS_SCALE * (u * AXIS_COS - v * AXIS_SIN),
    centre[1] + AXIS_SCALE * (u * AXIS_SIN + v * AXIS_COS),
  ];
}
/** @param {number[]} p */
export function trenchDepth(p) {
  const [u, v] = trenchCoordinates(p);
  const t = Math.max(0, Math.min(1, (6.5 - Math.abs(u)) / 4.7));
  const side = Math.max(0, Math.min(1, (1.05 - Math.abs(v)) / 0.32));
  return 0.32 * t * t * (3 - 2 * t) * side;
}
export const trenchRing = [
  trenchPoint(-6.5, -1.05),
  trenchPoint(6.5, -1.05),
  trenchPoint(6.5, 1.05),
  trenchPoint(-6.5, 1.05),
  trenchPoint(-6.5, -1.05),
];
