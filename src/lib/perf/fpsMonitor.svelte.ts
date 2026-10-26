/**
 * Phase P0: the fps counter's shared state, between the probe inside the Threlte canvas
 * (FpsProbe.svelte, which times every frame) and the overlay outside it (FpsCounter.svelte, which
 * reads the statistics twice a second). No DOM work per frame.
 *
 * Off by default (so earlier phases' e2e pictures are unchanged); the choice is stored in
 * localStorage. Development builds and VITE_LIGHTING_HOOK=1 builds also collect while the counter is
 * hidden, and expose `globalThis.__fpsStats` for Playwright and the performance work.
 */
import type { WebGLRenderer } from 'three';
import { FrameStats, RollingWindow } from './frameStats';

export const FPS_STORAGE_KEY = 'norrkoping.fpsCounter';
export const FPS_EXPANDED_KEY = 'norrkoping.fpsCounter.expanded';
/** How often the overlay refreshes its numbers. */
export const FPS_REFRESH_MS = 500;
export const fpsHookEnabled = import.meta.env.DEV || import.meta.env.VITE_LIGHTING_HOOK === '1';

const readFlag = (key: string) => {
  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
};
const writeFlag = (key: string, on: boolean) => {
  try {
    globalThis.localStorage?.setItem(key, on ? '1' : '0');
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
};

export const fpsCounter = $state({
  visible: readFlag(FPS_STORAGE_KEY),
  expanded: readFlag(FPS_EXPANDED_KEY),
});

export function setFpsVisible(on: boolean) {
  fpsCounter.visible = on;
  writeFlag(FPS_STORAGE_KEY, on);
}
export function setFpsExpanded(on: boolean) {
  fpsCounter.expanded = on;
  writeFlag(FPS_EXPANDED_KEY, on);
}
/** Whether the probe times frames. */
export const fpsCollecting = () => fpsCounter.visible || fpsHookEnabled;

/** Frame intervals (frame start to frame start). */
export const frameStats = new FrameStats({ windowMs: 2000 });
/** Main-thread time per frame: Threlte tasks + renderer.render() (command submission, not GPU time). */
export const cpuWindow = new RollingWindow(2000);

let renderer: WebGLRenderer | null = null;
export function attachRenderer(r: WebGLRenderer | null) {
  renderer = r;
}

export interface FpsReading {
  fps: number | null;
  meanMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  /** Frames in the 2 s window. */
  frames: number;
  windowMs: number;
  cpuMeanMs: number | null;
  cpuP95Ms: number | null;
  /** renderer.info.render of the last rendered frame (three.js resets it at each render()). */
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  programs: number;
  geometries: number;
  textures: number;
  /** Drawing-buffer size in pixels, and the CSS size of the canvas. */
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  pixelRatio: number;
  devicePixelRatio: number;
  /** Intervals dropped as pauses (tab hidden etc.). */
  gaps: number;
}

export function readFps(now = performance.now()): FpsReading {
  const f = frameStats.snapshot(now);
  const c = cpuWindow.stats(now);
  const info = renderer?.info;
  const canvas = renderer?.domElement;
  return {
    fps: f?.fps ?? null,
    meanMs: f?.meanMs ?? null,
    p95Ms: f?.p95Ms ?? null,
    maxMs: f?.maxMs ?? null,
    frames: f?.frames ?? 0,
    windowMs: f?.windowMs ?? 2000,
    cpuMeanMs: c?.mean ?? null,
    cpuP95Ms: c?.p95 ?? null,
    calls: info?.render.calls ?? 0,
    triangles: info?.render.triangles ?? 0,
    points: info?.render.points ?? 0,
    lines: info?.render.lines ?? 0,
    programs: info?.programs?.length ?? 0,
    geometries: info?.memory.geometries ?? 0,
    textures: info?.memory.textures ?? 0,
    width: canvas?.width ?? 0,
    height: canvas?.height ?? 0,
    cssWidth: canvas?.clientWidth ?? 0,
    cssHeight: canvas?.clientHeight ?? 0,
    pixelRatio: renderer?.getPixelRatio() ?? 1,
    devicePixelRatio: globalThis.devicePixelRatio ?? 1,
    gaps: frameStats.gaps,
  };
}

export function resetFps() {
  frameStats.reset();
  cpuWindow.clear();
}

if (fpsHookEnabled)
  (globalThis as unknown as { __fpsStats: unknown }).__fpsStats = {
    read: readFps,
    reset: resetFps,
    get collecting() {
      return fpsCollecting();
    },
    get visible() {
      return fpsCounter.visible;
    },
  };
