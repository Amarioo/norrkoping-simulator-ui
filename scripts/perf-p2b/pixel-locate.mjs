// Phase P2b: where do two screenshots differ? Lists the pixels differing by more than THRESHOLD
// (default 8/255) in any channel, grouped into clusters, and writes a crop (both images side by
// side, 8× enlarged) around each cluster.
//   node scripts/perf-p2b/pixel-locate.mjs <ref.png> <other.png> <outDir> [threshold=8]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [refFile, otherFile, outDir, thresholdArg = '8'] = process.argv.slice(2);
if (!refFile || !otherFile || !outDir)
  throw new Error('usage: <ref.png> <other.png> <outDir> [threshold]');
if (fs.existsSync(outDir)) throw new Error(`${outDir} exists (evidence is never overwritten)`);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const result = await page.evaluate(
  async ({ a, b, threshold }) => {
    const load = async (s) => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
      const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
      c.drawImage(img, 0, 0);
      return { img, data: c.getImageData(0, 0, img.width, img.height).data };
    };
    const [x, y] = await Promise.all([load(a), load(b)]);
    const w = x.img.width;
    const points = [];
    for (let i = 0; i < x.data.length; i += 4) {
      const d = Math.max(
        Math.abs(x.data[i] - y.data[i]),
        Math.abs(x.data[i + 1] - y.data[i + 1]),
        Math.abs(x.data[i + 2] - y.data[i + 2]),
      );
      if (d > threshold)
        points.push({
          x: (i / 4) % w,
          y: Math.floor(i / 4 / w),
          d,
          ref: [...x.data.subarray(i, i + 3)],
          other: [...y.data.subarray(i, i + 3)],
        });
    }
    const clusters = [];
    for (const p of points) {
      const c = clusters.find((c) => Math.abs(c.x - p.x) < 24 && Math.abs(c.y - p.y) < 24);
      if (c) c.points.push(p);
      else clusters.push({ x: p.x, y: p.y, points: [p] });
    }
    const crops = [];
    for (const c of clusters) {
      const s = 24,
        z = 8;
      const canvas = new OffscreenCanvas(s * z * 2 + 8, s * z);
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#f0f';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(x.img, c.x - s / 2, c.y - s / 2, s, s, 0, 0, s * z, s * z);
      g.drawImage(y.img, c.x - s / 2, c.y - s / 2, s, s, s * z + 8, 0, s * z, s * z);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (const v of bytes) bin += String.fromCharCode(v);
      crops.push(btoa(bin));
    }
    return {
      points: points.length,
      clusters: clusters.map((c) => ({
        x: c.x,
        y: c.y,
        n: c.points.length,
        points: c.points.slice(0, 6),
      })),
      crops,
    };
  },
  {
    a: fs.readFileSync(refFile).toString('base64'),
    b: fs.readFileSync(otherFile).toString('base64'),
    threshold: Number(thresholdArg),
  },
);
await browser.close();
result.crops.forEach((c, i) =>
  fs.writeFileSync(path.join(outDir, `cluster-${i + 1}.png`), Buffer.from(c, 'base64')),
);
delete result.crops;
fs.writeFileSync(path.join(outDir, 'clusters.json'), JSON.stringify(result, null, 1));
console.log(
  JSON.stringify(
    result.clusters.map((c) => ({ x: c.x, y: c.y, n: c.n, d: c.points.map((p) => p.d) })),
  ),
);
