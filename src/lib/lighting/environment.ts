/**
 * Lighting state as a function of the sun's apparent elevation (degrees), so seasons follow from the
 * solar position without a separate seasonal model.
 *
 * Above ~30° the state is exactly the pre-Step-6 daylight scene (sun #fff3de 2.1, hemisphere
 * #d9efff/#8b9575 1.1, ambient #f3f1e7 0.75, fog #bacbd3 700–1700), so daytime readability and
 * earlier screenshots are preserved. Below that, keyframes follow the standard twilight bands
 * (−0.833° sunset, −6° civil, −12° nautical, −18° astronomical). Colours are interpolated in linear
 * space. Night keeps a dim moonless urban sky glow for navigation instead of a dark overlay.
 *
 * Values are a perceptual calibration (display irradiance), not photometric luminance; see
 * docs/step6/lighting-architecture.md.
 */
import { Color } from 'three';

interface Key {
  h: number;
  sun: string;
  sunI: number;
  sky: string;
  ground: string;
  hemiI: number;
  ambient: string;
  ambientI: number;
  zenith: string;
  horizon: string;
  fog: string;
  exposure: number;
}
/** Keyframes by apparent solar elevation (degrees), ascending. */
const KEYS: Key[] = [
  {
    h: -90,
    sun: '#000000',
    sunI: 0,
    sky: '#1b2335',
    ground: '#0d0f12',
    hemiI: 0.2,
    ambient: '#7f8fb5',
    ambientI: 0.07,
    zenith: '#03060d',
    horizon: '#141a26',
    fog: '#121823',
    exposure: 1.25,
  },
  {
    h: -18,
    sun: '#000000',
    sunI: 0,
    sky: '#1b2335',
    ground: '#0d0f12',
    hemiI: 0.2,
    ambient: '#7f8fb5',
    ambientI: 0.07,
    zenith: '#03060d',
    horizon: '#141a26',
    fog: '#121823',
    exposure: 1.25,
  },
  {
    h: -12,
    sun: '#000000',
    sunI: 0,
    sky: '#22304d',
    ground: '#101317',
    hemiI: 0.24,
    ambient: '#7c8fbf',
    ambientI: 0.085,
    zenith: '#060c1c',
    horizon: '#1f2a40',
    fog: '#1a2233',
    exposure: 1.22,
  },
  {
    h: -6,
    sun: '#000000',
    sunI: 0,
    sky: '#3d5582',
    ground: '#1d2126',
    hemiI: 0.34,
    ambient: '#8a9dcc',
    ambientI: 0.13,
    zenith: '#1a2d55',
    horizon: '#6a6f86',
    fog: '#4a556e',
    exposure: 1.15,
  },
  {
    h: -3,
    sun: '#000000',
    sunI: 0,
    sky: '#6178a8',
    ground: '#3a3a38',
    hemiI: 0.48,
    ambient: '#a9b4d4',
    ambientI: 0.2,
    zenith: '#33508a',
    horizon: '#c08a72',
    fog: '#7c7f8e',
    exposure: 1.08,
  },
  {
    h: -0.833,
    sun: '#ff8a4a',
    sunI: 0,
    sky: '#8aa0c6',
    ground: '#57554c',
    hemiI: 0.66,
    ambient: '#c9c3c6',
    ambientI: 0.32,
    zenith: '#4f6fa6',
    horizon: '#e7a27a',
    fog: '#a59d9c',
    exposure: 1.04,
  },
  {
    h: 2,
    sun: '#ff9d5c',
    sunI: 0.75,
    sky: '#a9bfdc',
    ground: '#6e6d5c',
    hemiI: 0.8,
    ambient: '#e0d3c6',
    ambientI: 0.45,
    zenith: '#6d8fc0',
    horizon: '#ecc09a',
    fog: '#c2b6aa',
    exposure: 1.0,
  },
  {
    h: 8,
    sun: '#ffc896',
    sunI: 1.35,
    sky: '#c6dcf2',
    ground: '#7e8669',
    hemiI: 0.95,
    ambient: '#ece5d8',
    ambientI: 0.62,
    zenith: '#8fb0d4',
    horizon: '#c9c6bf',
    fog: '#bdc3c4',
    exposure: 1.0,
  },
  {
    h: 18,
    sun: '#ffe6c8',
    sunI: 1.8,
    sky: '#d4eaff',
    ground: '#87916f',
    hemiI: 1.05,
    ambient: '#f1ede2',
    ambientI: 0.72,
    zenith: '#9fbcd6',
    horizon: '#bcc8cf',
    fog: '#bac8cf',
    exposure: 1.0,
  },
  {
    h: 30,
    sun: '#fff3de',
    sunI: 2.1,
    sky: '#d9efff',
    ground: '#8b9575',
    hemiI: 1.1,
    ambient: '#f3f1e7',
    ambientI: 0.75,
    zenith: '#a9c2d6',
    horizon: '#bacbd3',
    fog: '#bacbd3',
    exposure: 1.0,
  },
  {
    h: 90,
    sun: '#fff3de',
    sunI: 2.1,
    sky: '#d9efff',
    ground: '#8b9575',
    hemiI: 1.1,
    ambient: '#f3f1e7',
    ambientI: 0.75,
    zenith: '#a9c2d6',
    horizon: '#bacbd3',
    fog: '#bacbd3',
    exposure: 1.0,
  },
];
const COLOR_KEYS = ['sun', 'sky', 'ground', 'ambient', 'zenith', 'horizon', 'fog'] as const;
const linear = KEYS.map((k) =>
  Object.fromEntries(COLOR_KEYS.map((c) => [c, new Color(k[c])])),
) as Record<(typeof COLOR_KEYS)[number], Color>[];

export interface EnvironmentState {
  elevation: number;
  sunColor: Color;
  sunIntensity: number;
  skyColor: Color;
  groundColor: Color;
  hemiIntensity: number;
  ambientColor: Color;
  ambientIntensity: number;
  zenith: Color;
  horizon: Color;
  fog: Color;
  exposure: number;
  /** 0 = street lighting off (day), 1 = fully on. Photocell-like ramp from +2° to −3°. */
  artificial: number;
  /** 0 by day; 1 below −6°: drives bulb glow halos and emissive signs. */
  dark: number;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function createEnvironmentState(): EnvironmentState {
  return {
    elevation: 0,
    sunColor: new Color(),
    sunIntensity: 0,
    skyColor: new Color(),
    groundColor: new Color(),
    hemiIntensity: 0,
    ambientColor: new Color(),
    ambientIntensity: 0,
    zenith: new Color(),
    horizon: new Color(),
    fog: new Color(),
    exposure: 1,
    artificial: 0,
    dark: 0,
  };
}
/** Fills `out` (no allocation) with the state for an apparent solar elevation in degrees. */
export function environmentAt(elevation: number, out = createEnvironmentState()): EnvironmentState {
  const h = Math.max(-90, Math.min(90, elevation));
  let i = 0;
  while (i < KEYS.length - 2 && h > KEYS[i + 1].h) i++;
  const a = KEYS[i],
    b = KEYS[i + 1];
  const t = smooth(0, 1, (h - a.h) / (b.h - a.h));
  const mix = (x: number, y: number) => x + (y - x) * t;
  const ca = linear[i],
    cb = linear[i + 1];
  out.elevation = h;
  out.sunColor.copy(ca.sun).lerp(cb.sun, t);
  out.skyColor.copy(ca.sky).lerp(cb.sky, t);
  out.groundColor.copy(ca.ground).lerp(cb.ground, t);
  out.ambientColor.copy(ca.ambient).lerp(cb.ambient, t);
  out.zenith.copy(ca.zenith).lerp(cb.zenith, t);
  out.horizon.copy(ca.horizon).lerp(cb.horizon, t);
  out.fog.copy(ca.fog).lerp(cb.fog, t);
  out.sunIntensity = mix(a.sunI, b.sunI);
  out.hemiIntensity = mix(a.hemiI, b.hemiI);
  out.ambientIntensity = mix(a.ambientI, b.ambientI);
  out.exposure = mix(a.exposure, b.exposure);
  out.artificial = 1 - smooth(-3, 2, h);
  out.dark = 1 - smooth(-6, -0.833, h);
  return out;
}
/** Linear blend of two states (temporal smoothing of preset jumps). */
export function blendEnvironment(
  from: EnvironmentState,
  to: EnvironmentState,
  t: number,
  out: EnvironmentState,
) {
  const m = (a: number, b: number) => a + (b - a) * t;
  out.elevation = m(from.elevation, to.elevation);
  for (const k of [
    'sunColor',
    'skyColor',
    'groundColor',
    'ambientColor',
    'zenith',
    'horizon',
    'fog',
  ] as const)
    out[k].copy(from[k]).lerp(to[k], t);
  out.sunIntensity = m(from.sunIntensity, to.sunIntensity);
  out.hemiIntensity = m(from.hemiIntensity, to.hemiIntensity);
  out.ambientIntensity = m(from.ambientIntensity, to.ambientIntensity);
  out.exposure = m(from.exposure, to.exposure);
  out.artificial = m(from.artificial, to.artificial);
  out.dark = m(from.dark, to.dark);
  return out;
}
