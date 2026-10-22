/**
 * CPU reference of the lighting shader in cityLights.ts (same formulas, in lux), for tests and for
 * the calibration figures in docs/step6/lighting-architecture.md. Keep in sync with the GLSL
 * functions cityLampIncident() and stadiumIncident().
 */
import { SECTORS, type ShaderLamp, type StadiumEmitter, type StadiumRoof } from './cityLights';

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/**
 * Illuminance (lux) of a street lamp on a surface point (scene units) with unit normal n
 * (cosine of incidence included, as the shader applies it), before the display scale.
 */
export function lampLux(
  l: ShaderLamp,
  p: [number, number, number],
  n: [number, number, number],
  metres: number,
) {
  const L = [(l.x - p[0]) * metres, (l.y - p[1]) * metres, (l.z - p[2]) * metres];
  const d2 = Math.max(L[0] ** 2 + L[1] ** 2 + L[2] ** 2, 0.09);
  const d = Math.sqrt(d2);
  if (d >= l.rangeM) return 0;
  if (l.clipBelow && p[1] < l.baseY - 0.4 / metres) return 0;
  let fade = 1;
  const hd = Math.hypot(L[0], L[2]);
  if (hd > 0.3) {
    const a = Math.atan2(-L[2], -L[0]);
    const s = ((a + Math.PI) * SECTORS) / (2 * Math.PI) - 0.5;
    const fs = Math.floor(s);
    const s0 = (fs + SECTORS) % SECTORS,
      s1 = (s0 + 1) % SECTORS;
    const occ = l.occlusionM[s0] + (l.occlusionM[s1] - l.occlusionM[s0]) * (s - fs);
    fade = 1 - smoothstep(occ + 0.2, occ + 1.2, hd);
    if (fade <= 0) return 0;
  }
  const c = L[1] / d;
  let profile =
    l.profile < 0.5
      ? (0.75 + 0.55 * Math.sqrt(Math.max(0, 1 - c * c))) * smoothstep(0.17, 0.37, c)
      : (0.85 + 0.25 * c) * smoothstep(-0.12, 0.2, c);
  if (l.profile < 0.5) {
    const h = l.heading ?? 0;
    const across = (-L[0] * Math.sin(h) - L[2] * Math.cos(h)) / d;
    const along = (L[0] * Math.cos(h) - L[2] * Math.sin(h)) / d;
    profile *= 1 + 0.65 * along * along - 0.45 * Math.max(-across, 0);
  }
  const w = 1 - (d / l.rangeM) ** (l.profile < 0.5 ? 4 : 2);
  const cosIncidence = Math.max(0, (L[0] * n[0] + L[1] * n[1] + L[2] * n[2]) / d);
  return (l.candela * profile * w * w * fade * cosIncidence) / d2;
}
/** Illuminance (lux) of one floodlight emitter at an arena-frame point (metres), normal n. */
export function emitterLux(
  e: StadiumEmitter,
  roofs: StadiumRoof[],
  p: [number, number, number],
  n: [number, number, number],
) {
  const L = [e.position[0] - p[0], e.position[1] - p[1], e.position[2] - p[2]];
  const d2 = Math.max(L[0] ** 2 + L[1] ** 2 + L[2] ** 2, 1);
  const d = Math.sqrt(d2);
  const cd = -(L[0] * e.aim[0] + L[1] * e.aim[1] + L[2] * e.aim[2]) / d;
  const spot = smoothstep(e.cosOuter, e.cosInner, cd);
  if (spot <= 0) return 0;
  for (const r of roofs) {
    if (p[1] < r.y - 0.05 === e.position[1] < r.y) continue;
    const t = (r.y - p[1]) / (e.position[1] - p[1]);
    const qx = p[0] + t * L[0],
      qz = p[2] + t * L[2];
    if (qx > r.x0 && qx < r.x1 && qz > r.z0 && qz < r.z1) return 0;
  }
  const cosIncidence = Math.max(0, (L[0] * n[0] + L[1] * n[1] + L[2] * n[2]) / d);
  return (e.candela * spot * cosIncidence) / d2;
}
