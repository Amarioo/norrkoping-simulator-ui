// Captures the map panel at fixed camera presets for before/after comparisons.
// Usage: E2E_BASE_URL=http://127.0.0.1:5179/ [VIEWS=a,b] [HIDE_BANNER=1] [CAMERAS_OUT=f.json | CAMERAS_IN=f.json]
//          node scripts/capture-reference-views.mjs <outDir>
// CAMERAS_OUT records the absolute camera of each preset; CAMERAS_IN pins those cameras (dev server
// only, FreeCamera.svelte __cityCamera), so another build is captured from exactly the same place.
// POSES=f.json captures named absolute cameras ({name: {position, target}}) instead of presets.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const out = process.argv[2] ?? 'test-results/reference-views';
const views = (
  process.env.VIEWS ??
  'overview,campus,industry,bergsbron,laxholmsbron,gamlebro,laxtrappan,saltangsbron,hamnbron,station,underpass,ingelstaBridge,police,policeEmblem,parken,airport,f13,ljura'
).split(',');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const errors = [];
const cameras = {};
const poses = process.env.POSES ? JSON.parse(fs.readFileSync(process.env.POSES, 'utf8')) : null;
const pinned = process.env.CAMERAS_IN
  ? JSON.parse(fs.readFileSync(process.env.CAMERAS_IN, 'utf8'))
  : {};
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:5173/', { timeout: 120000 });
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 240000 });
  // HIDE_BANNER=1: static captures without a backend hide the 'connecting' banner.
  if (process.env.HIDE_BANNER)
    await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.waitForTimeout(3000);
  if (poses)
    for (const [name, pose] of Object.entries(poses)) {
      await page.selectOption('#city-focus', 'city');
      await page.waitForTimeout(1500);
      await page.evaluate((pose) => {
        const { camera, controls } = globalThis.__cityCamera;
        camera.position.fromArray(pose.position);
        controls.target.fromArray(pose.target);
        controls.update();
      }, pose);
      await page.waitForTimeout(2500);
      await page.locator('.map-panel').screenshot({ path: `${out}/${name}.png` });
    }
  for (const view of poses ? [] : views) {
    await page.selectOption('#city-focus', view);
    await page.waitForTimeout(2500);
    if (process.env.CAMERAS_OUT)
      cameras[view] = await page.evaluate(() => {
        const { camera, controls } = globalThis.__cityCamera;
        return { position: camera.position.toArray(), target: controls.target.toArray() };
      });
    if (process.env.CAMERAS_IN) {
      await page.evaluate((pose) => {
        const { camera, controls } = globalThis.__cityCamera;
        camera.position.fromArray(pose.position);
        controls.target.fromArray(pose.target);
        controls.update();
      }, pinned[view]);
      await page.waitForTimeout(1500);
    }
    await page.locator('.map-panel').screenshot({ path: `${out}/${view}.png` });
  }
} finally {
  await browser.close();
}
if (process.env.CAMERAS_OUT)
  fs.writeFileSync(process.env.CAMERAS_OUT, JSON.stringify(cameras, null, 1));
console.log(JSON.stringify({ out, views: views.length, errors }));
if (errors.length) process.exitCode = 1;
