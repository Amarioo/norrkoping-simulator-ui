// Phase P1 (input to P2): how the scene's objects are cut up, and how many draw calls remain if they
// were merged along the lines P2 could take. Counts from the live scene graph (no timing):
// - worker-built layers (terrain, roads, water, buildings): meshes, triangles, 500 m cells (Batch
//   cellSize 20 scene units), pieces per cell (each cell is split into ≤ 3 000-triangle pieces);
// - trees: instanced meshes (one trunk + one crown mesh per 20-unit cell), materials;
// - detail groups (building details, bridges, map details): meshes, materials, distinct material
//   looks (type, colour, texture, transparency, side, emissive) = a lower bound for merged calls;
// - traffic: instanced meshes, their frustumCulled flag, and how many are empty (count 0).
// The merged counts are ESTIMATES of what P2 could reach (whole-scene, before frustum culling).
//
//   node scripts/perf-p1/merge-estimate.mjs <out.json> [baseUrl=http://127.0.0.1:5280]
import fs from 'node:fs';
import path from 'node:path';
import { host, openApp, setView } from './lib.mjs';

const [out = 'docs/perf-p1/data/merge-estimate.json', base = 'http://127.0.0.1:5280'] =
  process.argv.slice(2);
const { browser, page, gpu, errors } = await openApp({ base, traffic: true });
await setView(page, 'overview');
const result = await page.evaluate(() => {
  const p = globalThis.__perfP1;
  p.reclassify();
  const scene = p.scene;
  const view = scene.children.find((c) => c.children.some((x) => x.name === 'city-walls'));
  const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const cellOf = (m, size) => {
    // An instanced mesh's own bounding sphere covers its instances; a plain mesh uses its geometry's.
    let sphere = m.isInstancedMesh ? m.boundingSphere : m.geometry.boundingSphere;
    if (!sphere) {
      if (m.isInstancedMesh) m.computeBoundingSphere();
      else m.geometry.computeBoundingSphere();
      sphere = m.isInstancedMesh ? m.boundingSphere : m.geometry.boundingSphere;
    }
    const c = sphere.center.clone().applyMatrix4(m.matrixWorld);
    return `${Math.floor(c.x / size)},${Math.floor(c.z / size)}`;
  };
  const layers = view.children
    .filter((c) => c.name.startsWith('city-'))
    .map((group) => {
      const cells = new Map();
      let t = 0;
      for (const m of group.children) {
        t += tris(m.geometry);
        const k = cellOf(m, 20);
        cells.set(k, (cells.get(k) ?? 0) + 1);
      }
      const per = [...cells.values()].sort((a, b) => a - b);
      return {
        layer: group.name,
        meshes: group.children.length,
        triangles: t,
        materials: new Set(group.children.map((m) => m.material.uuid)).size,
        cells500m: cells.size,
        piecesPerCellMedian: per[Math.floor(per.length / 2)] ?? 0,
        piecesPerCellMax: per.at(-1) ?? 0,
        // Estimates: one mesh per layer per 500 m / 1 km / 2 km cell (whole scene, before culling).
        mergedPerCellCalls: cells.size,
        merged1kmCalls: new Set(group.children.map((m) => cellOf(m, 40))).size,
        merged2kmCalls: new Set(group.children.map((m) => cellOf(m, 80))).size,
      };
    });
  const trees = view.children.filter((c) => c.isInstancedMesh && !c.name);
  const treeCells2km = new Set(trees.map((m) => cellOf(m, 80)));
  const treeCells1km = new Set(trees.map((m) => cellOf(m, 40)));
  const look = (m) => {
    const x = m.material;
    return [
      x.type,
      x.color?.getHexString(),
      x.map?.uuid ?? '',
      x.transparent,
      x.side,
      x.emissive?.getHexString() ?? '',
      x.vertexColors,
    ].join('|');
  };
  const detail = (name, pred) => {
    const meshes = [];
    scene.traverse((o) => {
      if ((o.isMesh || o.isSprite) && pred(o)) meshes.push(o);
    });
    return {
      group: name,
      meshes: meshes.length,
      instanced: meshes.filter((m) => m.isInstancedMesh).length,
      materials: new Set(meshes.map((m) => m.material.uuid)).size,
      distinctLooks: new Set(meshes.map(look)).size,
      textured: meshes.filter((m) => m.material.map).length,
      triangles: meshes.reduce(
        (a, m) => a + tris(m.geometry) * (m.isInstancedMesh ? m.count : 1),
        0,
      ),
    };
  };
  // Parts via the hook's classification (capture() reclassifies; partOf is internal, so use roots).
  const notes = p.reclassify();
  // Rebuild a light classification: walk up to the view's direct child or the traffic groups.
  const unnamed = view.children.filter((c) => !c.name && c.type === 'Group');
  const details = unnamed.find((g) =>
    g.children.some((x) => x.children?.some?.((y) => y.isSprite)),
  );
  const groups = {
    buildingDetails: [unnamed[0], unnamed[2]],
    bridges: [unnamed[1]],
    mapDetails: [details],
  };
  const under = (o, roots) => {
    for (let q = o; q; q = q.parent) if (roots.includes(q)) return true;
    return false;
  };
  const traffic = [];
  for (const c of scene.children)
    if (
      c !== view &&
      c.children.length &&
      c.children.every((m) => m.isInstancedMesh || m.type === 'Group')
    )
      for (const m of c.children)
        if (m.isInstancedMesh)
          traffic.push({ frustumCulled: m.frustumCulled, empty: m.count === 0 });
  return {
    notes,
    layers,
    trees: {
      instancedMeshes: trees.length,
      cells20units: trees.length / 2,
      materials: new Set(trees.map((m) => m.material.uuid)).size,
      distinctLooks: new Set(trees.map(look)).size,
      instances: trees.reduce((a, m) => a + m.count, 0),
      cells1km: treeCells1km.size,
      mergedPer1kmCalls: treeCells1km.size * 2,
      cells2km: treeCells2km.size,
      mergedPer2kmCalls: treeCells2km.size * 2,
    },
    details: Object.entries(groups).map(([name, roots]) => detail(name, (o) => under(o, roots))),
    trafficInstancedMeshes: {
      total: traffic.length,
      frustumCulledFalse: traffic.filter((t) => !t.frustumCulled).length,
      emptyNow: traffic.filter((t) => t.empty).length,
    },
  };
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      note: 'Phase P1 scene structure and merge estimates (whole scene, counts; merged numbers are estimates for P2, before frustum culling). Overview view, traffic on, hook build.',
      host: host(),
      gpu,
      ...result,
      errors,
    },
    null,
    1,
  ),
);
console.log(JSON.stringify(result, null, 1));
await browser.close();
