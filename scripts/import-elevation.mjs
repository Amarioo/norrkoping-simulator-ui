import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// GIS preprocessing is intentionally separate: never guess a source CRS or vertical datum.
const root = fileURLToPath(new URL('../', import.meta.url));
const [terrainPath, buildingPath, ...options] = process.argv.slice(2);
if (!terrainPath || !buildingPath || options.some((o) => o !== '--check'))
  throw new Error(
    'Usage: npm run elevation:import -- terrain-normalized.json buildings-normalized.json [--check]',
  );
const read = async (p) => JSON.parse((await fs.readFile(p, 'utf8')).replace(/^\uFEFF/, ''));
const terrainData = await read(terrainPath),
  buildings = await read(buildingPath);
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { TerrainService, terrain } = await server.ssrLoadModule('/src/lib/terrain.ts');
  const { validateBuildings } = await server.ssrLoadModule('/src/lib/buildingElevation.ts');
  const service = new TerrainService(terrainData);
  // The OSM horizontal coordinates are already baked. Changing this reference requires reimporting that map.
  for (const key of Object.keys(terrain.data.reference)) {
    if (
      key !== 'verticalOriginMetres' &&
      terrainData.reference[key] !== terrain.data.reference[key]
    )
      throw new Error(
        `Reference ${key} differs from the existing map. Reproject all datasets together.`,
      );
  }
  validateBuildings(buildings, terrainData.revision);
  const map = await read(path.join(root, 'src/lib/data/norrkoping-map.json'));
  const known = new Set(map.buildings.map((b) => b.id));
  const { DETAILED_BUILDING_IDS } = await server.ssrLoadModule('/src/lib/cityPlaces.ts');
  for (const b of buildings.buildings)
    for (const id of b.replaces)
      if (DETAILED_BUILDING_IDS.has(id))
        throw new Error('Custom building needs explicit procedural replacement support: ' + id);
  for (const b of buildings.buildings)
    for (const id of b.replaces)
      if (!known.has(id)) throw new Error(`Unknown replacement footprint ${id}`);
  const points = map.roads.flatMap((r) => [r.a, r.b]);
  const covered = points.filter((p) => service.sample(...p)).length;
  console.log(
    JSON.stringify(
      {
        revision: terrainData.revision,
        tiles: service.tiles.map((t) => ({
          id: t.id,
          source: t.source,
          kind: t.kind,
          resolutionMetres: t.resolutionMetres,
          verticalAccuracyMetres: t.verticalAccuracyMetres,
          acquired: t.acquired,
          licence: t.licence,
          bounds: [t.x, t.z, t.x + (t.columns - 1) * t.step, t.z + (t.rows - 1) * t.step],
        })),
        roadEndpointCoverage: points.length ? covered / points.length : 0,
        buildings: buildings.buildings.length,
      },
      null,
      2,
    ),
  );
  if (!options.includes('--check')) {
    const targets = [
      [path.join(root, 'src/lib/data/terrain.json'), terrainData],
      [
        path.join(root, '../norrkoping-simulator-backend/src/main/resources/terrain.json'),
        terrainData,
      ],
      [path.join(root, 'src/lib/data/buildings-3d.json'), buildings],
    ];
    // Capture originals before mutation; restore all written files if either repository fails.
    const originals = await Promise.all(targets.map(async ([p]) => [p, await fs.readFile(p)]));
    try {
      for (const [p, data] of targets) await fs.writeFile(p, JSON.stringify(data) + '\n');
    } catch (error) {
      for (const [p, bytes] of originals) await fs.writeFile(p, bytes);
      throw error;
    }
    console.log('Imported shared elevation bundle. Restart both applications.');
  }
} finally {
  await server.close();
}
