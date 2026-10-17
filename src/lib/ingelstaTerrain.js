import config from './data/ingelsta-bridge.json' with { type: 'json' };
export const centre = [(config.a[0] + config.b[0]) / 2, (config.a[1] + config.b[1]) / 2];
/** @param {number[]} p */
export function trenchCoordinates(p) {
  const x = p[0] - centre[0],
    z = p[1] - centre[1];
  return [x * 0.98 + z * 0.199, z * 0.98 - x * 0.199];
}
/** @param {number} u @param {number} v */
export function trenchPoint(u, v) {
  return [centre[0] + u * 0.98 - v * 0.199, centre[1] + u * 0.199 + v * 0.98];
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
