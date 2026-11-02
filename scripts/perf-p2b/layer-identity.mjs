// Phase P2b: proves the worker-built layers (land, banks, water, roads, markings, surveyed, walls,
// roofs, cornices) draw the same triangles as on main. For every build it reads all meshes under the
// `city-<layer>` groups of the running app and records per layer: mesh, material and triangle
// counts, the largest mesh, and an order-independent fingerprint of the triangle set: every triangle's
// exact float32 bits (positions, normals, colours, uvs: 33 words) are hashed with three different
// 32-bit hashes, and the hashes are summed (two sums mod 2^32) and xor-ed over all triangles. Equal
// fingerprints and counts = the same triangles with the same values, only grouped into other meshes.
// It also takes the same fullscreen views from each build (traffic off) and counts pixels that differ
// from main by more than 8/255 in any channel, and by any amount.
//   node scripts/perf-p2b/layer-identity.mjs <out.json> <shotDir> name=url [name=url ...]
// The first name=url is the reference (main). Env: SHOTS (condition/view list).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { host, openApp, setCondition, setView } from '../perf-p1/lib.mjs';

const [out, shotDir, ...targets] = process.argv.slice(2);
if (!out || !shotDir || targets.length < 2)
  throw new Error('usage: <out.json> <shotDir> name=url ...');
if (fs.existsSync(out)) throw new Error(`${out} exists (raw runs are never overwritten)`);
if (fs.existsSync(shotDir)) throw new Error(`${shotDir} exists (evidence is never overwritten)`);
fs.mkdirSync(shotDir, { recursive: true });
const SHOTS = (
  process.env.SHOTS ??
  'day/overview,night/overview,day/city,night/city,night/kungsgatan,day/norraPromenaden'
).split(',');

const readLayers = () => {
  const scene = globalThis.__perfP1.scene;
  // The nine worker-built layers (CITY_LAYERS in src/lib/cityMesh.ts).
  const LAYERS = [
    'markings',
    'banks',
    'land',
    'water',
    'roads',
    'surveyed',
    'walls',
    'roofs',
    'cornices',
  ];
  const groups = [];
  scene.traverse((o) => {
    if (o.isGroup && LAYERS.some((l) => o.name === 'city-' + l)) groups.push(o);
  });
  if (groups.length !== LAYERS.length) throw new Error(`found ${groups.length} layer groups`);
  const result = {};
  for (const g of groups) {
    const meshes = g.children.filter((m) => m.isMesh);
    let triangles = 0,
      maxTriangles = 0,
      sumA = 0,
      sumB = 0,
      xor = 0,
      maxRadius = 0;
    const words = new Uint32Array(33);
    const f = new Float32Array(words.buffer);
    for (const m of meshes) {
      const a = m.geometry.attributes;
      const p = a.position.array,
        n = a.normal.array,
        c = a.color.array,
        u = a.uv.array;
      const count = a.position.count / 3;
      triangles += count;
      maxTriangles = Math.max(maxTriangles, count);
      maxRadius = Math.max(maxRadius, m.geometry.boundingSphere?.radius ?? 0);
      for (let t = 0; t < count; t++) {
        for (let k = 0; k < 9; k++) {
          f[k] = p[t * 9 + k];
          f[9 + k] = n[t * 9 + k];
          f[18 + k] = c[t * 9 + k];
        }
        for (let k = 0; k < 6; k++) f[27 + k] = u[t * 6 + k];
        let h1 = 0x811c9dc5,
          h2 = 0x01000193,
          h3 = 0x9e3779b9;
        for (let k = 0; k < 33; k++) {
          const w = words[k];
          h1 = Math.imul(h1 ^ w, 0x01000193);
          h2 = Math.imul(h2 + w, 0x85ebca6b) ^ (h2 >>> 13);
          h3 = Math.imul(h3 ^ (w + k), 0xc2b2ae35);
          h3 ^= h3 >>> 16;
        }
        sumA = (sumA + (h1 >>> 0)) >>> 0;
        sumB = (sumB + (h2 >>> 0)) >>> 0;
        xor = (xor ^ h3) >>> 0;
      }
    }
    const materials = new Set(meshes.map((m) => m.material));
    result[g.name.slice(5)] = {
      meshes: meshes.length,
      materials: materials.size,
      triangles,
      maxTrianglesPerMesh: maxTriangles,
      maxBoundingRadius: Math.round(maxRadius * 1000) / 1000,
      castShadow: [...new Set(meshes.map((m) => m.castShadow))],
      receiveShadow: [...new Set(meshes.map((m) => m.receiveShadow))],
      frustumCulled: [...new Set(meshes.map((m) => m.frustumCulled))],
      fingerprint: [sumA, sumB, xor].map((v) => v.toString(16).padStart(8, '0')).join('-'),
    };
  }
  return result;
};

const report = {
  note: "Phase P2b layer identity: per build, all worker-built layer meshes read from the running app (traffic off); order-independent fingerprint over every triangle's exact float32 values (positions, normals, colours, uvs). Pixel diff vs the first build, fullscreen 2560x1440: pixels differing by > 8/255 in any channel, and by any amount.",
  host: host(),
  builds: {},
  pixels: {},
  errors: [],
};
const shots = {};
for (const target of targets) {
  const [name, base] = target.split('=');
  const { browser, page, errors } = await openApp({ base, traffic: false });
  try {
    report.builds[name] = await page.evaluate(readLayers);
    shots[name] = {};
    for (const shot of SHOTS) {
      const [condition, view] = shot.split('/');
      await setCondition(page, condition);
      await setView(page, view, 4000);
      const file = path.join(shotDir, `${name}-${condition}-${view}.png`);
      await page.screenshot({ path: file });
      shots[name][shot] = file;
    }
    console.log(name, JSON.stringify(report.builds[name]));
  } catch (e) {
    report.errors.push(`${name}: ${e.message}`);
  } finally {
    report.errors.push(...errors.map((e) => `${name}: ${e}`));
    await browser.close();
  }
}
// Pixel diff in a blank browser page (no image library in the project).
const [refName, ...others] = Object.keys(shots);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
for (const name of others)
  for (const shot of SHOTS) {
    if (!shots[name]?.[shot] || !shots[refName]?.[shot]) continue;
    const a = fs.readFileSync(shots[refName][shot]).toString('base64');
    const b = fs.readFileSync(shots[name][shot]).toString('base64');
    report.pixels[`${name}/${shot}`] = await page.evaluate(
      async ({ a, b }) => {
        const load = async (s) => {
          const img = await createImageBitmap(
            await (await fetch('data:image/png;base64,' + s)).blob(),
          );
          const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
          c.drawImage(img, 0, 0);
          return c.getImageData(0, 0, img.width, img.height).data;
        };
        const [x, y] = await Promise.all([load(a), load(b)]);
        let over8 = 0,
          any = 0,
          max = 0;
        for (let i = 0; i < x.length; i += 4) {
          const d = Math.max(
            Math.abs(x[i] - y[i]),
            Math.abs(x[i + 1] - y[i + 1]),
            Math.abs(x[i + 2] - y[i + 2]),
          );
          if (d > 0) any++;
          if (d > 8) over8++;
          if (d > max) max = d;
        }
        return { pixels: x.length / 4, differingOver8: over8, differingAny: any, maxDiff: max };
      },
      { a, b },
    );
  }
await browser.close();
// Store shot file names relative to the shot directory only (no machine paths).
report.shots = Object.fromEntries(
  Object.entries(shots).map(([n, s]) => [
    n,
    Object.fromEntries(Object.entries(s).map(([k, f]) => [k, path.basename(f)])),
  ]),
);
const ref = report.builds[refName];
const KEYS = [
  'triangles',
  'materials',
  'fingerprint',
  'castShadow',
  'receiveShadow',
  'frustumCulled',
];
report.identical = Object.fromEntries(
  others.map((n) => [
    n,
    !!ref &&
      !!report.builds[n] &&
      Object.keys(ref).length === Object.keys(report.builds[n]).length &&
      Object.entries(ref).every(([layer, r]) =>
        KEYS.every((k) => JSON.stringify(r[k]) === JSON.stringify(report.builds[n][layer]?.[k])),
      ),
  ]),
);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ identical: report.identical, pixels: report.pixels }, null, 1));
if (report.errors.length) {
  console.error(report.errors);
  process.exitCode = 1;
}
