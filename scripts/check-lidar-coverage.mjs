import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'polygon-clipping';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(
  root,
  'work/geodata/lantmateriet',
  process.argv[2] === 'Terrain' ? 'dtm' : '',
);
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const map = read(path.join(root, 'src/lib/data/norrkoping-map.json'));
const catalog = read(path.join(directory, 'catalog.json'));
const [s, w, n, e] = map.meta.bbox;
const rectangle = [
  [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ],
];
let union = [];
for (const f of catalog.features) {
  if (!['Polygon', 'MultiPolygon'].includes(f.geometry?.type))
    throw new Error('Unsupported coverage geometry');
  union = pc.union(union, f.geometry.coordinates);
}
const missing = pc.difference(rectangle, union);
const tiles = catalog.features.map((f) => {
  const filename = path.basename(new URL(f.assets.data.href).pathname);
  const file = path.join(directory, filename);
  return {
    id: f.id,
    filename,
    acquired: f.properties.datetime,
    bytes: f.assets.data['file:size'],
    // Size check is only an availability report. The PowerShell downloader verifies SHA-256.
    present: fs.existsSync(file) && fs.statSync(file).size === f.assets.data['file:size'],
  };
});
const report = {
  mapBbox: [s, w, n, e],
  catalogCoversMap: missing.length === 0,
  uncoveredGeometry: { type: 'MultiPolygon', coordinates: missing },
  tiles,
  available: tiles.filter((t) => t.present).length,
  expected: tiles.length,
  allFilesPresent: tiles.every((t) => t.present),
  note: 'Catalog footprint coverage is not point-level ground coverage. DTM holes, water and classification require separate checks.',
};
fs.writeFileSync(
  path.join(directory, 'coverage-report.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  `Catalog covers full map: ${report.catalogCoversMap}. Local tiles: ${report.available}/${report.expected}.`,
);
if (!report.catalogCoversMap) process.exitCode = 1;
