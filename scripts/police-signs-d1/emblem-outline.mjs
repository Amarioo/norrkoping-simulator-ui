/**
 * Police Signs Phase D1: the outline of the police emblem artwork (public/assets/polis-emblem.svg),
 * so the sign can be an opaque emblem-shaped surface instead of an alpha-tested rectangle. An opaque,
 * front-sided, map + emissiveMap material compiles into the shader program the tram and bus
 * destination signs already use (publicTransport.ts), so the sign adds no program.
 *
 * Method: the browser rasterises the SVG at its own size (512 × 668 px, the texture three.js gets);
 * pixels with alpha ≥ THRESHOLD are inside; pixel-edge boundary tracing gives closed contours, which
 * Douglas–Peucker simplifies (TOLERANCE px). Contours below MIN_AREA px² are dropped. Each contour is
 * shrunk by nothing: the threshold sits mid-edge, the shader samples inside the opaque artwork.
 *
 * Output (deterministic for the same SVG and browser version; no timestamps or machine paths):
 *   src/lib/landmarks/police/emblem-outline.json — coordinates as fractions of the image (u right,
 *   v down from the top), rounded to 1e-4.
 *
 * Usage: node scripts/police-signs-d1/emblem-outline.mjs [out.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SVG = 'public/assets/polis-emblem.svg';
const THRESHOLD = 128;
const TOLERANCE = 1.0;
const MIN_AREA = 40;

const svgBytes = fs.readFileSync(path.join(ROOT, SVG));
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
const page = await browser.newPage();
const raster = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/svg+xml;base64,' + b64;
  await img.decode();
  const w = img.width,
    h = img.height;
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const alpha = new Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = d[i * 4 + 3];
  return { w, h, alpha, ua: navigator.userAgent };
}, svgBytes.toString('base64'));
const version = browser.version();
await browser.close();

const { w, h, alpha } = raster;
const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && alpha[y * w + x] >= THRESHOLD;

// Directed boundary edges with the inside on the left (outer contours counter-clockwise in image
// coordinates with y down → negative shoelace area; holes positive). Vertices are pixel corners.
const edges = new Map(); // "x,y" → list of [x2, y2]
const add = (x1, y1, x2, y2) => {
  const k = x1 + ',' + y1;
  if (!edges.has(k)) edges.set(k, []);
  edges.get(k).push([x2, y2]);
};
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x, y - 1)) add(x + 1, y, x, y); // top edge, walk left
    if (!inside(x, y + 1)) add(x, y + 1, x + 1, y + 1); // bottom edge, walk right
    if (!inside(x - 1, y)) add(x, y, x, y + 1); // left edge, walk down
    if (!inside(x + 1, y)) add(x + 1, y + 1, x + 1, y); // right edge, walk up
  }
const contours = [];
const keys = [...edges.keys()].sort((a, b) => {
  const [ax, ay] = a.split(',').map(Number),
    [bx, by] = b.split(',').map(Number);
  return ay - by || ax - bx;
});
for (const start of keys) {
  while (edges.get(start)?.length) {
    const ring = [];
    let [x, y] = start.split(',').map(Number);
    let prev = null;
    for (;;) {
      const k = x + ',' + y;
      const out = edges.get(k);
      if (!out || !out.length) break;
      // At a pixel-corner touch (two outgoing edges) turn right of the incoming direction first.
      let i = 0;
      if (out.length > 1 && prev) {
        const din = [x - prev[0], y - prev[1]];
        const score = (e) => {
          const d = [e[0] - x, e[1] - y];
          return din[0] * d[1] - din[1] * d[0]; // cross > 0: right turn in y-down coordinates
        };
        i = out.map(score).indexOf(Math.max(...out.map(score)));
      }
      const [nx, ny] = out.splice(i, 1)[0];
      ring.push([x, y]);
      prev = [x, y];
      x = nx;
      y = ny;
      if (x + ',' + y === start && !(edges.get(start)?.length && ring.length < 2)) break;
    }
    if (ring.length >= 4) contours.push(ring);
  }
}
const area = (r) => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i],
      b = r[(i + 1) % r.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};
function simplify(points, tol) {
  // Douglas–Peucker on a closed ring: split at the two farthest-apart vertices.
  const far = (a) =>
    points.reduce(
      (best, p, i) => {
        const d = (p[0] - points[a][0]) ** 2 + (p[1] - points[a][1]) ** 2;
        return d > best[0] ? [d, i] : best;
      },
      [-1, 0],
    )[1];
  const i0 = 0,
    i1 = far(0);
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      l = Math.hypot(dx, dy) || 1;
    let best = -1,
      idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / l;
      if (d > best) [best, idx] = [d, i];
    }
    if (best <= tol) return [a, b];
    const left = dp(pts.slice(0, idx + 1)),
      right = dp(pts.slice(idx));
    return left.slice(0, -1).concat(right);
  };
  const first = dp(points.slice(i0, i1 + 1));
  const second = dp(points.slice(i1).concat([points[0]]));
  return first.slice(0, -1).concat(second.slice(0, -1));
}
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const outer = [],
  holes = [];
for (const ring of contours) {
  const a = area(ring);
  if (Math.abs(a) < MIN_AREA) continue;
  const s = simplify(ring, TOLERANCE).map(([x, y]) => [r4(x / w), r4(y / h)]);
  (a < 0 ? outer : holes).push(s);
}
const order = (rings) =>
  rings.sort(
    (p, q) =>
      Math.min(...p.map((v) => v[1])) - Math.min(...q.map((v) => v[1])) || p[0][0] - q[0][0],
  );
order(outer);
order(holes);
const kept = (rings) => rings.reduce((s, r) => s + r.length, 0);
const result = {
  source: SVG,
  sourceSha256: crypto.createHash('sha256').update(svgBytes).digest('hex'),
  script: 'scripts/police-signs-d1/emblem-outline.mjs',
  rasteriser: { browser: 'msedge (Playwright channel)', version },
  raster: [w, h],
  alphaThreshold: THRESHOLD,
  simplifyTolerancePx: TOLERANCE,
  minAreaPx2: MIN_AREA,
  units: 'fractions of the image: u right, v down from the top',
  outer,
  holes,
  vertices: kept(outer) + kept(holes),
};
const out = process.argv[2] || path.join(ROOT, 'src/lib/landmarks/police/emblem-outline.json');
fs.writeFileSync(out, JSON.stringify(result) + '\n');
console.log(
  JSON.stringify({
    out: path.basename(out),
    version,
    raster: [w, h],
    outer: outer.map((r) => r.length),
    holes: holes.map((r) => r.length),
    vertices: result.vertices,
  }),
);
