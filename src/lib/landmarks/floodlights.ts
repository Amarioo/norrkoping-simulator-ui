/**
 * Landmark floodlights (Landmark Phases B2, B1 part 2): fixtures given in a landmark's building frame,
 * converted to scene-space façade emitters for the lighting controller (cityLights.ts).
 */
import type { FacadeEmitter } from '../lighting/cityLights';

export interface Floodlight {
  name: string;
  /** Position in the building frame (u, v metres). */
  at: [number, number];
  /** Mounting height above the rendered ground there, m (ground-mounted fixtures). */
  height?: number;
  /** Absolute mounting height, m RH2000 (fixtures on a roof or a ledge); used when set. */
  z?: number;
  /** Aim point (u, v, h RH2000). */
  aim: [number, number, number];
  /** Beam half-angles, degrees (full intensity inside `inner`, none outside `outer`). */
  inner: number;
  outer: number;
  /** Peak intensity, candela. */
  candela: number;
  /** Range window, m. */
  rangeM: number;
}

/** The part of a landmark frame the conversion needs (radhusetFrame, hedvigFrame). */
export interface LandmarkFrame {
  metres: number;
  toScene(u: number, v: number): [number, number];
  /** Rendered ground at a frame point, RH2000 metres. */
  ground(u: number, v: number): number;
}

/** Mounting height (RH2000 m) of a floodlight. */
export const mountHeight = (frame: LandmarkFrame, f: Floodlight) =>
  f.z ?? frame.ground(f.at[0], f.at[1]) + (f.height ?? 0);

/** Floodlights → scene-space façade emitters (names prefixed). */
export function toFacadeEmitters(
  frame: LandmarkFrame,
  lights: readonly Floodlight[],
  color: [number, number, number],
  prefix: string,
): FacadeEmitter[] {
  const m = frame.metres;
  return lights.map((f) => {
    const [x, z] = frame.toScene(f.at[0], f.at[1]);
    const y = mountHeight(frame, f) / m;
    const [ax, az] = frame.toScene(f.aim[0], f.aim[1]);
    const dx = ax - x,
      dy = f.aim[2] / m - y,
      dz = az - z,
      len = Math.hypot(dx, dy, dz);
    return {
      name: prefix + f.name,
      position: [x, y, z],
      aim: [dx / len, dy / len, dz / len],
      cosInner: Math.cos((f.inner * Math.PI) / 180),
      cosOuter: Math.cos((f.outer * Math.PI) / 180),
      candela: f.candela,
      rangeM: f.rangeM,
      color,
    };
  });
}
