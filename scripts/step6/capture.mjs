// Step 6 evidence captures: fixed absolute cameras, fixed viewport, labels off, optional time/lighting.
// Usage:
//   BASE=http://127.0.0.1:5182/ [QUERY="date=2026-10-21&time=21:30&stadium=event"] [ONLY=a,b]
//     node scripts/step6/capture.mjs docs/step6/poses.json <outDir> [suffix]
// Needs a dev server (FreeCamera.svelte exposes __cityCamera in DEV only). The backend is not needed;
// the connection banner is hidden. Writes <outDir>/<pose><suffix>.png and <outDir>/capture-meta.json.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [posesFile, out, suffix = ''] = process.argv.slice(2);
const poses = JSON.parse(fs.readFileSync(posesFile, 'utf8'));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const base = process.env.BASE ?? 'http://127.0.0.1:5173/';
const query = process.env.QUERY ?? '';
const viewport = { width: 1400, height: 1000 };
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + (query ? '?' + query : ''), { timeout: 120000 });
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 240000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  const labels = page.locator('.label-toggle input');
  if (await labels.isChecked()) await labels.uncheck();
  await page.waitForTimeout(3000);
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('.map-panel canvas')?.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  for (const [name, pose] of Object.entries(poses)) {
    if (only && !only.has(name)) continue;
    await page.evaluate((pose) => {
      const { camera, controls } = globalThis.__cityCamera;
      camera.position.fromArray(pose.position);
      controls.target.fromArray(pose.target);
      controls.update();
      // Step 6 lighting: settle any temporal smoothing at once (no-op on the baseline build).
      globalThis.__cityLighting?.settle?.();
    }, pose);
    await page.waitForTimeout(2200);
    await page.locator('.map-panel').screenshot({ path: `${out}/${name}${suffix}.png` });
  }
  const meta = {
    base,
    query,
    viewport,
    deviceScaleFactor: 1,
    canvasDpr: 1,
    gpu,
    browser: 'msedge headless (Playwright channel), --enable-unsafe-swiftshader',
    captured: new Date().toISOString(),
    lighting: await page.evaluate(() => globalThis.__cityLighting?.describe?.() ?? null),
  };
  const metaFile = `${out}/capture-meta${suffix}.json`;
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, errors }));
if (errors.length) process.exitCode = 1;
