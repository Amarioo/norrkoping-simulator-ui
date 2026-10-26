// Phase P1 shared helpers: the fixed set-up of P0's fullscreen baseline (production build made with
// VITE_LIGHTING_HOOK=1, Edge headless with vsync and the frame-rate limit off, DPR 1, fullscreen via
// the map's own button, Europe/Stockholm 2026-10-21, stadium off) plus the P1 hook globalThis.__perfP1.
import os from 'node:os';
import { chromium } from '@playwright/test';

export const DATE = '2026-10-21';
/** Day 12:39 and night 21:30, as in P0 (minutes after midnight for the #light-time slider). */
export const CONDITIONS = { day: 759, night: 1290 };
export const P0_VIEWS = [
  'overview',
  'city',
  'kungsgatan',
  'stromparken',
  'police',
  'idrottsparkenPitch',
];

export const host = () => ({
  cpu: os.cpus()[0]?.model?.trim(),
  cores: os.cpus().length,
  memoryGB: Math.round(os.totalmem() / 1e9),
  platform: `${os.platform()} ${os.release()}`,
});

export const stats = (values) => {
  const s = values.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y);
  if (!s.length) return null;
  const mean = s.reduce((x, y) => x + y, 0) / s.length;
  return {
    n: s.length,
    mean,
    median: s[Math.floor(s.length / 2)],
    p95: s[Math.ceil(s.length * 0.95) - 1],
    max: s.at(-1),
  };
};

export const median = (values) => {
  const s = values.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Opens the app fullscreen at `width`×`height`. `traffic: false` aborts every /api request (no
 * simulator stream: no vehicles, buses, trams, trains or aircraft), as the earlier phases' gates did.
 */
export async function openApp({ base, width = 2560, height = 1440, traffic = true, args = [] }) {
  const browser = await chromium.launch({
    channel: 'msedge',
    args: [
      '--enable-unsafe-swiftshader',
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
      ...args,
    ],
  });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    timezoneId: 'Europe/Stockholm',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (!traffic) await page.route('**/api/**', (route) => route.abort());
  await page.goto(new URL(`?date=${DATE}&time=12:39&stadium=off`, base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.locator('.fullscreen-toggle').click();
  await page.waitForFunction(
    () => document.fullscreenElement?.classList.contains('map-panel'),
    undefined,
    { timeout: 10000 },
  );
  await page.waitForTimeout(4000);
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('.map-panel canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  return { browser, context, page, errors, gpu };
}

export async function setCondition(page, condition) {
  await page.$eval(
    '#light-time',
    (el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    CONDITIONS[condition],
  );
  await page.waitForTimeout(1600);
}

export async function setView(page, view, settleMs = 2500) {
  await page.selectOption('#city-focus', view);
  await page.waitForTimeout(settleMs);
}

export const vehicleCount = (page) =>
  page.evaluate(() => document.querySelector('#vehicle-select')?.options.length - 1);

/**
 * Measures `n` frames: requestAnimationFrame intervals (what the viewer sees, CPU + GPU + browser)
 * and the hook's per-frame log (CPU time of the Threlte tasks and of renderer.render(), GPU time when
 * the timer is on, traffic-snapshot frames).
 */
export async function measureFrames(page, n = 300, { gpu = false } = {}) {
  const raw = await page.evaluate(
    async ({ n, gpu }) => {
      const p = globalThis.__perfP1;
      if (gpu) p.gpu.enable();
      p.gpu.reset();
      // Let the first queries of the timer drain before the window starts.
      for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(r));
      p.frames.start();
      const intervals = [];
      let previous = await new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < n; i++) {
        const now = await new Promise((r) => requestAnimationFrame(r));
        intervals.push(now - previous);
        previous = now;
      }
      p.frames.stop();
      // GPU results arrive a few frames late.
      if (gpu) for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
      const frames = p.frames.collect();
      if (gpu) p.gpu.disable();
      return { intervals, frames };
    },
    { n, gpu },
  );
  return summarizeFrames(raw);
}

export function summarizeFrames({ intervals, frames }) {
  const iv = stats(intervals);
  const real = frames.filter((f) => f.interval != null);
  const snap = real.filter((f) => f.snapshot);
  const noSnap = real.filter((f) => !f.snapshot);
  const fpsOver = intervals.filter((v) => v > 1000 / 60).length / intervals.length;
  return {
    fps: 1000 / iv.mean,
    meanMs: iv.mean,
    medianMs: iv.median,
    p95Ms: iv.p95,
    maxMs: iv.max,
    over16_7: fpsOver,
    cpu: stats(real.map((f) => f.cpuMs)),
    tasks: stats(real.map((f) => f.tasksMs)),
    render: stats(real.map((f) => f.renderMs)),
    gpu: stats(real.map((f) => f.gpuMs)),
    snapshotFrames: snap.length,
    cpuSnapshotFrames: stats(snap.map((f) => f.cpuMs)),
    cpuOtherFrames: stats(noSnap.map((f) => f.cpuMs)),
    tasksSnapshotFrames: stats(snap.map((f) => f.tasksMs)),
    tasksOtherFrames: stats(noSnap.map((f) => f.tasksMs)),
    /** Frame-start intervals minus CPU time: time the main thread spent outside the Threlte frame. */
    outsideFrame: stats(real.map((f) => f.interval - f.cpuMs)),
    calls: stats(real.map((f) => f.calls))?.median ?? null,
    triangles: stats(real.map((f) => f.triangles))?.median ?? null,
  };
}

/** Round to 3 decimals for compact JSON (keeps the raw data readable and diff-friendly). */
export const round = (value) =>
  JSON.parse(
    JSON.stringify(value, (_, v) =>
      typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v,
    ),
  );
