// Lighting Phase L2d: downloads the raw OSM input once and records what was fetched.
//
//   node scripts/lighting-l2d/fetch-source.mjs
//
// The raw response goes to work/lighting-city-l2d/raw/osm-sites.json (ignored scratch, untrusted
// data, only parsed as JSON). The request (url, query, retrieval time, osm_base, SHA-256) is appended
// to work/lighting-city-l2d/raw/requests.json. A later run is a NEW snapshot: extract-source.mjs
// refuses any file whose SHA-256 differs from scripts/lighting-l2d/sources.json.
import crypto from 'node:crypto';
import fs from 'node:fs';

const RAW = 'work/lighting-city-l2d/raw';
fs.mkdirSync(RAW, { recursive: true });
/** Same WGS84 box as the map importer and Phase L0. */
const BBOX = { south: 58.555, west: 16.065, north: 58.65, east: 16.295 };
export const OSM_QUERY = `[out:json][timeout:300][bbox:${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}];
(
nwr[amenity=parking];
nwr[landuse~"^(railway|industrial|port|retail|commercial)$"];
way[railway][service~"^(yard|siding|spur)$"];
way[highway=service];
node[railway~"^(station|halt)$"];
nwr[man_made=mast];
nwr["tower:type"=lighting];
nwr[light_source];
node[highway=street_lamp];
);
out meta geom;`;
const UA = { 'user-agent': 'norrkoping-simulator-ui lighting research (local, non-commercial)', accept: '*/*' };
const url = 'https://overpass-api.de/api/interpreter';
const started = new Date().toISOString();
const res = await fetch(url, {
  method: 'POST',
  headers: { ...UA, 'content-type': 'application/x-www-form-urlencoded' },
  body: 'data=' + encodeURIComponent(OSM_QUERY),
});
if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
const buf = Buffer.from(await res.arrayBuffer());
const file = `${RAW}/osm-sites.json`;
fs.writeFileSync(file, buf);
const osm = JSON.parse(buf.toString('utf8'));
const entry = {
  file,
  url,
  method: 'POST',
  query: OSM_QUERY,
  retrievedAt: started,
  osmBase: osm.osm3s?.timestamp_osm_base ?? null,
  contentType: res.headers.get('content-type'),
  bytes: buf.length,
  sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  elements: osm.elements.length,
};
const log = fs.existsSync(`${RAW}/requests.json`) ? JSON.parse(fs.readFileSync(`${RAW}/requests.json`, 'utf8')) : [];
log.push(entry);
fs.writeFileSync(`${RAW}/requests.json`, JSON.stringify(log, null, 2) + '\n');
console.log(JSON.stringify(entry, null, 2));
