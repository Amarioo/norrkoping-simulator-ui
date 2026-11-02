// Phase P2c (adapted from scripts/perf-p2b/layer-identity.mjs): proves the map details (airfield
// pavements and edge lights, churches, police complex, ...) draw the same triangles as on main. For
// every build it reads every visible mesh under the landmark details group of the running app, in
// world space (instances expanded), grouped by material look (type, colour, maps, polygon offset,
// shadow flags), and records per look: meshes, triangles and an order-independent fingerprint over
// each triangle's world positions and uvs (rounded to 1e-5 scene units = 0.25 mm). Equal triangles
// and fingerprints = the same pieces in the same places, only grouped into other meshes. It also takes
// fullscreen views from each build (traffic off) and counts differing pixels against main.
//   node scripts/perf-p2c/details-identity.mjs <out.json> <shotDir> name=url [name=url ...]
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
  process.env.SHOTS ?? 'day/airport,night/airport,day/f13,night/f13,day/overview,night/overview'
).split(',');

const readDetails = () => {
  const scene = globalThis.__perfP1.scene;
  const tower = scene.getObjectByName('police-tower');
  if (!tower) throw new Error('police-tower not found');
  const details = tower.parent;
  details.updateMatrixWorld(true);
  const r5 = (v) => Math.round(v * 1e5);
  const groups = new Map();
  let meshes = 0;
  const p = { x: 0, y: 0, z: 0 };
  const apply = (m, x, y, z) => {
    const e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    p.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    p.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    p.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return p;
  };
  const instance = new details.matrixWorld.constructor();
  const world = new details.matrixWorld.constructor();
  details.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    meshes++;
    const mat = o.material;
    const sig = (x) =>
      JSON.stringify({
        type: x.type,
        color: x.color?.getHexString(),
        emissive: x.emissive?.getHexString(),
        roughness: x.roughness,
        metalness: x.metalness,
        map: !!x.map,
        emissiveMap: !!x.emissiveMap,
        polygonOffset: x.polygonOffset ? x.polygonOffsetUnits : null,
        side: x.side,
        castShadow: o.castShadow,
        receiveShadow: o.receiveShadow,
      });
    const key = Array.isArray(mat) ? mat.map(sig).join('+') : sig(mat);
    if (!groups.has(key)) groups.set(key, { meshes: 0, triangles: 0, sumA: 0, sumB: 0, xor: 0 });
    const g = groups.get(key);
    g.meshes++;
    const pos = o.geometry.attributes.position,
      uv = o.geometry.attributes.uv,
      index = o.geometry.index;
    const count = index ? index.count : pos.count;
    const copies = o.isInstancedMesh ? o.count : 1;
    for (let c = 0; c < copies; c++) {
      if (o.isInstancedMesh) {
        o.getMatrixAt(c, instance);
        world.multiplyMatrices(o.matrixWorld, instance);
      } else world.copy(o.matrixWorld);
      for (let t = 0; t + 2 < count; t += 3) {
        const words = [];
        for (let k = 0; k < 3; k++) {
          const i = index ? index.getX(t + k) : t + k;
          const q = apply(world, pos.getX(i), pos.getY(i), pos.getZ(i));
          words.push(r5(q.x), r5(q.y), r5(q.z));
          if (uv) words.push(r5(uv.getX(i)), r5(uv.getY(i)));
        }
        let h1 = 0x811c9dc5,
          h2 = 0x01000193,
          h3 = 0x9e3779b9;
        for (let k = 0; k < words.length; k++) {
          const w = words[k] | 0;
          h1 = Math.imul(h1 ^ w, 0x01000193);
          h2 = Math.imul(h2 + w, 0x85ebca6b) ^ (h2 >>> 13);
          h3 = Math.imul(h3 ^ (w + k), 0xc2b2ae35);
          h3 ^= h3 >>> 16;
        }
        g.triangles++;
        g.sumA = (g.sumA + (h1 >>> 0)) >>> 0;
        g.sumB = (g.sumB + (h2 >>> 0)) >>> 0;
        g.xor = (g.xor ^ h3) >>> 0;
      }
    }
  });
  const materials = {};
  for (const [key, g] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1)))
    materials[key] = {
      meshes: g.meshes,
      triangles: g.triangles,
      fingerprint: [g.sumA, g.sumB, g.xor].map((v) => v.toString(16).padStart(8, '0')).join('-'),
    };
  return { meshes, materials };
};

const report = {
  note: 'Phase P2c map details identity: per build, every visible mesh under the landmark details group (traffic off), world-space triangles grouped by material look; order-independent fingerprint over positions and uvs (1e-5). Pixel diff vs the first build, fullscreen 2560x1440: pixels differing by > 8/255 in any channel, and by any amount.',
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
    report.builds[name] = await page.evaluate(readDetails);
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
report.identical = Object.fromEntries(
  others.map((n) => [
    n,
    !!ref &&
      !!report.builds[n] &&
      JSON.stringify(
        Object.fromEntries(
          Object.entries(ref.materials).map(([k, v]) => [k, [v.triangles, v.fingerprint]]),
        ),
      ) ===
        JSON.stringify(
          Object.fromEntries(
            Object.entries(report.builds[n].materials).map(([k, v]) => [
              k,
              [v.triangles, v.fingerprint],
            ]),
          ),
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
