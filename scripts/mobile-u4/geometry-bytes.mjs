// Interface U4: where the geometry memory sits. Sums the bytes of every vertex attribute and index
// in the scene (each counted once), grouped by the top-level scene part. Needs a dev or hook server
// (the `__perfP1` hook).   node scripts/mobile-u4/geometry-bytes.mjs <url> [out.json]
import fs from 'node:fs';
import { chromium, devices } from '@playwright/test';

const [url, out] = process.argv.slice(2);
if (!url) throw new Error('usage: <url> [out.json]');
if (out && fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-precise-memory-info'] });
const context = await browser.newContext({ ...devices['iPhone 14'], defaultBrowserType: undefined });
const page = await context.newPage();
await page.goto(url);
await page.waitForSelector('[data-map-ready="true"]', { timeout: 180_000 });
await page.waitForTimeout(8000);
const result = await page.evaluate(() => {
  const { scene, renderer } = globalThis.__perfP1;
  const seen = new Set();
  const parts = {};
  let total = 0;
  const label = (object) => {
    const names = [];
    for (let o = object; o && o !== scene; o = o.parent) names.unshift(o.name || o.type);
    return names.slice(0, 3).join(' / ');
  };
  scene.traverse((object) => {
    const geometry = object.geometry;
    if (!geometry) return;
    const arrays = [...Object.values(geometry.attributes), geometry.index].filter(Boolean);
    let bytes = 0,
      kept = 0;
    for (const attribute of arrays) {
      const array = (attribute.data ?? attribute).array;
      if (!array || seen.has(array.buffer)) continue;
      seen.add(array.buffer);
      bytes += array.byteLength;
      kept += array.byteLength;
    }
    if (!bytes) return;
    const key = label(object);
    const part = (parts[key] ??= { MB: 0, meshes: 0, vertices: 0, attributes: '' });
    part.MB += bytes / 1048576;
    part.meshes++;
    part.vertices += geometry.attributes.position?.count ?? 0;
    part.attributes = Object.entries(geometry.attributes)
      .map(([name, a]) => `${name}:${(a.data ?? a).array.constructor.name.replace('Array', '')}x${a.itemSize}`)
      .join(' ') + (geometry.index ? ' index:' + geometry.index.array.constructor.name.replace('Array', '') : '');
    total += bytes;
  });
  const rows = Object.entries(parts)
    .map(([part, v]) => ({ part, ...v, MB: +v.MB.toFixed(1) }))
    .sort((a, b) => b.MB - a.MB);
  return {
    geometryMB: +(total / 1048576).toFixed(1),
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    jsHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
    rows: rows.slice(0, 40),
  };
});
if (out) fs.writeFileSync(out, JSON.stringify({ url, ...result }, null, 2) + '\n');
console.log(`geometry ${result.geometryMB} MB in ${result.geometries} geometries, ${result.textures} textures, JS heap ${result.jsHeapMB} MB`);
for (const r of result.rows) console.log(String(r.MB).padStart(8), String(r.meshes).padStart(5), String(r.vertices).padStart(9), r.part, '|', r.attributes);
await browser.close();
