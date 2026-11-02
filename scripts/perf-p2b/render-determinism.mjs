// Phase P2b diagnostic: is the renderer itself deterministic? Opens the app like the Phase A3 test
// (tests/lighting.spec.ts: 1400x1000, /api aborted, A1–A3 lighting set, labels off, A3 ring pose),
// then RENDERS times draws the scene with renderer.render() and reads the whole drawing buffer back
// with gl.readPixels() (no compositor, no screenshot), hashing each image. Compare with
// shot-stability.mjs, which takes page screenshots of the same view.
//   node scripts/perf-p2b/render-determinism.mjs <out.json> name=url [name=url ...]
// Env: RENDERS (30). Needs a dev or hook build (__perfP1, __cityCamera, __cityLighting).
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { host } from '../perf-p1/lib.mjs';

const [out, ...targets] = process.argv.slice(2);
if (!out || !targets.length) throw new Error('usage: <out.json> name=url ...');
if (fs.existsSync(out)) throw new Error(`${out} exists`);
const RENDERS = Number(process.env.RENDERS ?? 30);
const report = {
  note: 'P2b render determinism: FNV-1a hash of the full drawing buffer after each renderer.render()',
  host: host(),
  renders: RENDERS,
  builds: {},
};
for (const target of targets) {
  const [name, base] = target.split('=');
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(new URL('/?date=2026-10-21&time=21:30&stadium=off&lighting=a3', base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 120000 });
  await page.locator('.label-toggle input').uncheck();
  await page.evaluate(() => {
    const { camera, controls } = globalThis.__cityCamera;
    camera.position.fromArray([-28.4, 6.0, -19.2]);
    controls.target.fromArray([-28.5, 0.45, -22.1]);
    controls.update();
    globalThis.__cityLighting.settle();
  });
  await page.waitForTimeout(3000);
  report.builds[name] = await page.evaluate(async (n) => {
    const { renderer, scene, camera } = globalThis.__perfP1;
    const gl = renderer.getContext();
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const hashes = [];
    const w = gl.drawingBufferWidth,
      h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    for (let i = 0; i < n; i++) {
      await raf();
      renderer.render(scene, camera);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let hash = 0x811c9dc5;
      for (let k = 0; k < px.length; k++) hash = Math.imul(hash ^ px[k], 0x01000193);
      hashes.push((hash >>> 0).toString(16).padStart(8, '0'));
    }
    return { size: `${w}x${h}`, distinct: new Set(hashes).size, hashes };
  }, RENDERS);
  console.log(name, report.builds[name].size, 'distinct images', report.builds[name].distinct);
  await browser.close();
}
fs.writeFileSync(out, JSON.stringify(report, null, 1));
