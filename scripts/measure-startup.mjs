// Startup, GPU upload and frame-time benchmark (Step 3 before/after comparison).
// Usage: E2E_BASE_URL=http://127.0.0.1:5173/ [VIEWS=city,campus] [FRAMES=120] [UNCAPPED=1] node scripts/measure-startup.mjs <out.json>
// Records: time until the map geometry is in the scene (data-map-ready), the dev-only scene build
// split (__cityPerformance), JS heap, the frames right after the geometry arrives (their sum and
// maximum is the GPU upload of the static city), and settled frame times per fixed camera preset.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const out = process.argv[2] ?? 'test-results/startup.json';
const views = (process.env.VIEWS ?? 'overview,city,campus,industry,parken,kungsgatan').split(',');
const frames = Number(process.env.FRAMES ?? 120);
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: [
    '--enable-unsafe-swiftshader',
    ...(process.env.UNCAPPED ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
  ],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  // Frame timestamps from the very start, so the upload frames after map-ready are captured.
  await page.addInitScript(() => {
    const times = [];
    globalThis.__frames = times;
    const tick = (t) => {
      times.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new MutationObserver(() => {
      if (!globalThis.__mapReadyAt && document.querySelector('[data-map-ready="true"]'))
        globalThis.__mapReadyAt = performance.now();
    }).observe(document, { subtree: true, attributes: true, childList: true });
  });
  const started = Date.now();
  await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:5173/', { timeout: 120000 });
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 240000 });
  const readyMs = Date.now() - started;
  await page.waitForTimeout(4000);
  const upload = await page.evaluate(() => {
    const t = globalThis.__frames,
      at = globalThis.__mapReadyAt;
    const after = [];
    for (let i = 1; i < t.length; i++)
      if (t[i] > at && t[i] < at + 3000) after.push(t[i] - t[i - 1]);
    return {
      mapReadyAt: at,
      maxFrameMs: Math.max(...after),
      // Time beyond a 16.7 ms frame budget in the 3 s after the geometry arrived.
      excessMs: after.reduce((s, d) => s + Math.max(0, d - 16.7), 0),
      frames: after.length,
    };
  });
  const perf = await page.evaluate(() => globalThis.__cityPerformance ?? null);
  const results = {};
  for (const view of views) {
    await page.selectOption('#city-focus', view);
    await page.waitForTimeout(2500);
    results[view] = await page.evaluate(async (n) => {
      const d = [];
      let last = await new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < n; i++) {
        const t = await new Promise((r) => requestAnimationFrame(r));
        d.push(t - last);
        last = t;
      }
      d.sort((a, b) => a - b);
      const p = globalThis.__cityPerformance;
      return {
        median: d[Math.floor(n / 2)],
        p90: d[Math.floor(n * 0.9)],
        mean: d.reduce((s, x) => s + x, 0) / n,
        triangles: p?.triangles ?? null,
        calls: p?.calls ?? null,
      };
    }, frames);
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics
      .filter((m) => ['JSHeapUsedSize', 'JSHeapTotalSize'].includes(m.name))
      .map((m) => [m.name, m.value]),
  );
  const report = { readyMs, upload, perf, views: results, metrics, errors };
  fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, '') || '.', { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(
    JSON.stringify({
      readyMs,
      upload,
      heapMB: metrics.JSHeapUsedSize / 1e6,
      errors: errors.length,
    }),
  );
} finally {
  await browser.close();
}
if (errors.length) process.exitCode = 1;
