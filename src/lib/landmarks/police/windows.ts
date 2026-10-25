/**
 * Police Signs Phase D1, follow-up: lit windows in the police tower at night.
 *
 * The station (Stinsen 1) is staffed around the clock (user statement 2026-10-25; Polisen works
 * day and night), so at night part of its windows are lit. WHICH windows and how many is not
 * documented anywhere: the lit share, the pattern and the colours are [EST] estimates, chosen
 * deterministically (fixed seeds) so every run and every rebuild shows the same windows.
 *
 * The tower's façade texture (src/lib/mapLandmarks.ts) paints WINDOW_GRID; `paintWindowGlow` paints
 * the same grid's lit windows on black as the emissive map. The emissive gain follows the street
 * lighting's night level (env.artificial): 0 by day, so the daytime picture is unchanged.
 */

/** The window grid of the tower façade texture (512 × 1024 px; mapLandmarks.ts paints the same). */
export const WINDOW_GRID = {
  width: 512,
  height: 1024,
  rows: 11,
  cols: 16,
  x0: 7,
  dx: 32,
  y0: 12,
  dy: 90,
  w: 19,
  h: 64,
};

/** [EST] share of windows lit at night (a staffed 24/7 station, many rooms empty at night). */
export const LIT_FRACTION = 0.3;

/** [EST] interior light colours: warm white, neutral white, cool white (LED office/corridor). */
export const WINDOW_COLOURS = ['#ffd9a3', '#fff0d2', '#e3ecff'] as const;

/** [EST] emissive gain at full night (× env.artificial). */
export const WINDOW_NIGHT_GAIN = 0.9;

/**
 * Resolution of the emissive maps relative to the façade texture: half (256 × 512 px per façade,
 * ≈ 0.7 MB of GPU memory each with mipmaps instead of ≈ 2.8 MB). A glow needs no fine detail.
 */
export const GLOW_SCALE = 0.5;

/** Seeds of the two long façades (WSW and ENE): different patterns on each side. */
export const FACADE_SEEDS = [1, 2] as const;

/** Deterministic 32-bit hash → [0, 1). */
function unit(seed: number, row: number, col: number, salt: number) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(row + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f) ^ Math.imul(col + 1, 0x165667b1) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Lit windows of one façade: `lit[row][col]` (row 0 = top floor), colour index per lit window. */
export function litWindows(seed: number, fraction = LIT_FRACTION) {
  const lit: boolean[][] = [],
    colour: number[][] = [];
  for (let row = 0; row < WINDOW_GRID.rows; row++) {
    lit.push([]);
    colour.push([]);
    for (let col = 0; col < WINDOW_GRID.cols; col++) {
      lit[row].push(unit(seed, row, col, 0x51ed27) < fraction);
      colour[row].push(Math.floor(unit(seed, row, col, 0x2c1b3c) * WINDOW_COLOURS.length));
    }
  }
  return { lit, colour };
}

/**
 * Paints the lit windows of one façade on black (the emissive map of that façade), on a canvas of
 * WINDOW_GRID.width × height scaled by `scale`.
 */
export function paintWindowGlow(c: CanvasRenderingContext2D, seed: number, scale = GLOW_SCALE) {
  const g = WINDOW_GRID;
  const { lit, colour } = litWindows(seed);
  c.fillStyle = '#000000';
  c.fillRect(0, 0, g.width * scale, g.height * scale);
  for (let row = 0; row < g.rows; row++)
    for (let col = 0; col < g.cols; col++) {
      if (!lit[row][col]) continue;
      c.fillStyle = WINDOW_COLOURS[colour[row][col]];
      c.fillRect(
        (g.x0 + col * g.dx) * scale,
        (g.y0 + row * g.dy) * scale,
        g.w * scale,
        g.h * scale,
      );
    }
}

/** Emissive gain of the window glow at night level 0…1. */
export function windowGain(level: number) {
  return WINDOW_NIGHT_GAIN * Math.min(1, Math.max(0, level));
}
