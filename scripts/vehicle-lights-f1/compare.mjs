// Vehicle Lights Phase F1: before/after comparison of capture.mjs output. For each capture: number of
// changed pixels, mean luma before/after, draw calls/triangles from the DEV metadata, and a side-by-
// side picture (before | after | difference × 4) as JPEG.
//
//   node scripts/vehicle-lights-f1/compare.mjs <beforeDir> <afterDir> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [beforeDir, afterDir, out] = process.argv.slice(2);
if (!out) throw new Error('usage: compare.mjs <beforeDir> <afterDir> <outDir>');
if (out.includes('docs') && fs.existsSync(out) && fs.readdirSync(out).length)
  throw new Error(`${out} already holds evidence; refusing to overwrite`);
fs.mkdirSync(out, { recursive: true });
const before = JSON.parse(fs.readFileSync(path.join(beforeDir, 'metadata.json'), 'utf8'));
const after = JSON.parse(fs.readFileSync(path.join(afterDir, 'metadata.json'), 'utf8'));
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const report = { beforeDir, afterDir, captures: {} };
for (const [key, a] of Object.entries(after.captures)) {
  const b = before.captures[key];
  const png = (dir, file) => fs.readFileSync(path.join(dir, file)).toString('base64');
  const result = await page.evaluate(
    async ({ b64a, b64b }) => {
      const load = async (s) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + s;
        await img.decode();
        return img;
      };
      const [ib, ia] = [await load(b64b), await load(b64a)];
      const w = ib.width,
        h = ib.height;
      const read = (img) => {
        const c = new OffscreenCanvas(w, h);
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, w, h);
      };
      const db = read(ib),
        da = read(ia);
      const diff = new ImageData(w, h);
      let changed = 0,
        lb = 0,
        la = 0;
      for (let i = 0; i < db.data.length; i += 4) {
        const yb = 0.2126 * db.data[i] + 0.7152 * db.data[i + 1] + 0.0722 * db.data[i + 2];
        const ya = 0.2126 * da.data[i] + 0.7152 * da.data[i + 1] + 0.0722 * da.data[i + 2];
        lb += yb;
        la += ya;
        let any = false;
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(da.data[i + k] - db.data[i + k]);
          if (d) any = true;
          diff.data[i + k] = Math.min(255, d * 4);
        }
        diff.data[i + 3] = 255;
        if (any) changed++;
      }
      const scale = 0.5;
      const c = new OffscreenCanvas(Math.round(w * scale) * 3, Math.round(h * scale));
      const g = c.getContext('2d');
      const dc = new OffscreenCanvas(w, h);
      dc.getContext('2d').putImageData(diff, 0, 0);
      g.drawImage(ib, 0, 0, w * scale, h * scale);
      g.drawImage(ia, w * scale, 0, w * scale, h * scale);
      g.drawImage(dc, 2 * w * scale, 0, w * scale, h * scale);
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { changed, pixels: w * h, lumaBefore: lb / (w * h), lumaAfter: la / (w * h), jpeg: btoa(s) };
    },
    { b64a: png(afterDir, a.file), b64b: png(beforeDir, b.file) },
  );
  fs.writeFileSync(path.join(out, `diff-${key}.jpg`), Buffer.from(result.jpeg, 'base64'));
  report.captures[key] = {
    changedPixels: result.changed,
    pixels: result.pixels,
    lumaBefore: Math.round(result.lumaBefore * 100) / 100,
    lumaAfter: Math.round(result.lumaAfter * 100) / 100,
    calls: { before: b.perf?.calls, after: a.perf?.calls },
    triangles: { before: b.perf?.triangles, after: a.perf?.triangles },
    programs: { before: b.programs, after: a.programs },
    beams: a.vehicleLights?.active ?? null,
  };
}
await browser.close();
fs.writeFileSync(path.join(out, 'diff-before-after.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.captures, null, 1));
