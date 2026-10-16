/** Frame-rate independent exponential smoothing. Never bind the incoming position to the mesh. */
export function smoothingAlpha(delta: number, rate = 12): number {
  return 1 - Math.exp(-Math.max(0, Math.min(delta, 0.1)) * rate);
}
export function heading(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}
export function shortestAngle(current: number, target: number): number {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}
