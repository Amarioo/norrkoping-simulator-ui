// Alternating production baselines, same GPU/browser/viewport, no simulation. Browser frame intervals,
// not isolated GPU time. Dev-only draw calls are recorded separately by capture.mjs.
import fs from 'node:fs';
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? 'docs/step61/measurements/frontend-performance.json';
const report = { viewport: { width: 1280, height: 900 }, runs: [], errors: [] };
const stats = a => {
  const sorted = [...a].sort((a, b) => a - b);
  return { median: sorted[Math.floor(a.length / 2)], p95: sorted[Math.floor(a.length * .95)], max: sorted.at(-1) };
};
for (let round = 1; round <= 3; round++) for (const [label, port] of [['before', 5186], ['after', 5187]]) {
  const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try {
    const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
    page.on('pageerror', e => report.errors.push(e.message));
    await page.route('**/api/**', r => r.abort());
    await page.addInitScript(() => new MutationObserver(() => {
      if (!globalThis.__mapReadyAt && document.querySelector('[data-map-ready="true"]')) globalThis.__mapReadyAt = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true }));
    const start = Date.now();
    await page.goto(`http://127.0.0.1:${port}/?date=2026-10-21&time=12:39&stadium=off`);
    await page.locator('[data-map-ready="true"]').waitFor({ timeout: 120000 });
    const run = { label, round, pageReadyMs: Date.now() - start, mapReadyMs: await page.evaluate(() => __mapReadyAt), frames: {} };
    await page.waitForTimeout(3500);
    for (const [condition, minutes, mode] of [['day',759,'off'], ['night-off',1290,'off'], ['night-match',1290,'event']]) {
      await page.$eval('#light-time', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, minutes);
      await page.selectOption('#stadium-lights', mode);
      await page.waitForTimeout(1600);
      run.frames[condition] = {};
      for (const view of ['kungsgatan', 'stromparken', 'idrottsparkenPitch', 'parken']) {
        await page.selectOption('#city-focus', view);
        await page.waitForTimeout(1200);
        const intervals = await page.evaluate(async () => {
          const samples = [];
          let previous = await new Promise(r => requestAnimationFrame(r));
          for (let i = 0; i < 180; i++) {
            const now = await new Promise(r => requestAnimationFrame(r));
            samples.push(now - previous); previous = now;
          }
          return samples;
        });
        run.frames[condition][view] = stats(intervals);
      }
    }
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('Performance.enable');
    run.heapMB = (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value / 1e6;
    run.gpu = await page.evaluate(() => {
      const gl = document.querySelector('.map-panel canvas').getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    report.runs.push(run);
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ label, round, mapReadyMs: run.mapReadyMs, heapMB: run.heapMB }));
  } finally { await browser.close(); }
}
if (report.errors.length) process.exitCode = 1;
