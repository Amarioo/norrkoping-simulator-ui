// Phase P2a: proves the trees are unchanged against main. For every build it reads all tree meshes
// (unnamed InstancedMesh children of the map group) and records: mesh, material and geometry counts,
// the material and geometry parameters, and a SHA-256 over every instance's matrix and colour (sorted,
// rounded to 1e-6), separately for trunks and crowns. Equal hashes = the same trees in the same
// places with the same size and colour. It also takes the same fullscreen views from each build
// (traffic off) and counts pixels that differ from main by more than 8/255 in any channel.
//   node scripts/perf-p2a/tree-identity.mjs <out.json> <shotDir> name=url [name=url ...]
// The first name=url is the reference (main).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { host, openApp, setCondition, setView } from '../perf-p1/lib.mjs';

const [out, shotDir, ...targets] = process.argv.slice(2);
if (!out || !shotDir || targets.length < 2)
  throw new Error('usage: <out.json> <shotDir> name=url ...');
if (fs.existsSync(shotDir)) throw new Error(`${shotDir} exists (evidence is never overwritten)`);
fs.mkdirSync(shotDir, { recursive: true });
const SHOTS = (process.env.SHOTS ?? 'day/overview,day/stromparken,night/overview,night/city').split(
  ',',
);

const readTrees = async () => {
  const scene = globalThis.__perfP1.scene;
  let view = null;
  scene.traverse((o) => {
    if (!view && o.children?.some((c) => c.name === 'city-land')) view = o;
  });
  const kinds = { trunks: [], crowns: [] };
  for (const m of view.children) {
    if (!m.isInstancedMesh || m.name) continue;
    const kind = m.geometry.type === 'CylinderGeometry' ? 'trunks' : 'crowns';
    kinds[kind].push(m);
  }
  const r6 = (v) => (Math.round(v * 1e6) / 1e6).toString();
  const result = {};
  for (const [kind, meshes] of Object.entries(kinds)) {
    const rows = [];
    for (const m of meshes) {
      const a = m.instanceMatrix.array,
        c = m.instanceColor?.array;
      for (let i = 0; i < m.count; i++) {
        const mat = Array.from(a.subarray(i * 16, i * 16 + 16), r6).join(',');
        const col = c ? Array.from(c.subarray(i * 3, i * 3 + 3), r6).join(',') : '-';
        rows.push(mat + '|' + col);
      }
    }
    rows.sort();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rows.join('\n')));
    const materials = new Set(meshes.map((m) => m.material));
    const geometries = new Set(meshes.map((m) => m.geometry));
    const sig = (o) => JSON.stringify(o);
    result[kind] = {
      meshes: meshes.length,
      materials: materials.size,
      geometries: geometries.size,
      instances: rows.length,
      maxInstancesPerMesh: Math.max(...meshes.map((m) => m.count)),
      materialLooks: [
        ...new Set(
          [...materials].map((x) =>
            sig({
              type: x.type,
              color: x.color.getHexString(),
              roughness: x.roughness,
              metalness: x.metalness,
              vertexColors: x.vertexColors,
              emissive: x.emissive.getHexString(),
            }),
          ),
        ),
      ],
      geometryShapes: [
        ...new Set([...geometries].map((g) => sig({ type: g.type, ...g.parameters }))),
      ],
      castShadow: [...new Set(meshes.map((m) => m.castShadow))],
      receiveShadow: [...new Set(meshes.map((m) => m.receiveShadow))],
      frustumCulled: [...new Set(meshes.map((m) => m.frustumCulled))],
      maxBoundingRadius: Math.max(...meshes.map((m) => m.boundingSphere?.radius ?? 0)),
      sha256: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''),
    };
  }
  return result;
};

const report = {
  note: 'Phase P2a tree identity: per build, all tree meshes read from the running app (traffic off); sha256 over every instance matrix + colour (sorted, 1e-6). Pixel diff vs the first build: share of pixels differing by > 8/255 in any channel, fullscreen 2560x1440.',
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
    report.builds[name] = await page.evaluate(readTrees);
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
        let diff = 0;
        for (let i = 0; i < x.length; i += 4)
          if (
            Math.abs(x[i] - y[i]) > 8 ||
            Math.abs(x[i + 1] - y[i + 1]) > 8 ||
            Math.abs(x[i + 2] - y[i + 2]) > 8
          )
            diff++;
        return { pixels: x.length / 4, differing: diff, share: diff / (x.length / 4) };
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
      ['trunks', 'crowns'].every(
        (k) =>
          ref[k].sha256 === report.builds[n][k].sha256 &&
          JSON.stringify(ref[k].materialLooks) ===
            JSON.stringify(report.builds[n][k].materialLooks) &&
          JSON.stringify(ref[k].geometryShapes) ===
            JSON.stringify(report.builds[n][k].geometryShapes),
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
