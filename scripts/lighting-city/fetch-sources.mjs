// Lighting Phase L0: downloads the three raw inputs once and records what was fetched.
//
//   node scripts/lighting-city/fetch-sources.mjs [osm|scb|nightlights|all]
//
// Raw responses go to work/lighting-city-l0/raw/ (ignored scratch, treated as untrusted data and only
// parsed as JSON / PNG). Each download appends url, query, retrieval time and SHA-256 to
// work/lighting-city-l0/raw/requests.json. A later run is a NEW snapshot; the extractor
// (extract-source.mjs) refuses any file whose hash differs from the one pinned in
// scripts/lighting-city/sources.json.
import crypto from 'node:crypto';
import fs from 'node:fs';

const RAW = 'work/lighting-city-l0/raw';
fs.mkdirSync(RAW, { recursive: true });
const which = process.argv[2] ?? 'all';

/** Same WGS84 box as the map importer (scripts/import-norrkoping.mjs). */
const BBOX = { south: 58.555, west: 16.065, north: 58.65, east: 16.295 };

export const OSM_QUERY = `[out:json][timeout:300][bbox:${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}];
(
way[highway];
node[highway~"^(street_lamp|traffic_signals|crossing)$"];
node[railway=crossing];
node[place~"^(suburb|quarter|neighbourhood)$"];
);
out meta geom;`;

/** SCB statistical urban areas 2023, clipped by WFS to the map envelope, in EPSG:3006. */
const SCB_URL =
  'https://geodata.scb.se/geoserver/stat/wfs?service=WFS&REQUEST=GetFeature&version=1.1.0' +
  '&TYPENAMES=stat:Tatorter_2023&outputFormat=application/json&srsName=EPSG:3006' +
  '&bbox=561700,6490900,575460,6501900,EPSG:3006';

/**
 * NASA GIBS WMS, layer VIIRS_Black_Marble (2016 annual composite, 500 m). The bbox is snapped
 * outwards to the 15 arc-second grid (1/240°) so one image pixel = one VIIRS grid cell.
 */
const G = 240;
const NL_BOX = {
  south: Math.floor(BBOX.south * G) / G,
  west: Math.floor(BBOX.west * G) / G,
  north: Math.ceil(BBOX.north * G) / G,
  east: Math.ceil(BBOX.east * G) / G,
};
const NL_W = Math.round((NL_BOX.east - NL_BOX.west) * G);
const NL_H = Math.round((NL_BOX.north - NL_BOX.south) * G);
const NL_URL =
  'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0' +
  '&REQUEST=GetMap&LAYERS=VIIRS_Black_Marble&STYLES=&CRS=EPSG:4326&FORMAT=image/png' +
  `&BBOX=${NL_BOX.south},${NL_BOX.west},${NL_BOX.north},${NL_BOX.east}` +
  `&WIDTH=${NL_W}&HEIGHT=${NL_H}&TIME=2016-01-01`;

const UA = { "user-agent": "norrkoping-simulator-ui lighting research (local, non-commercial)", accept: "*/*" };
async function get(name, url, init) {
  const started = new Date().toISOString();
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = `${RAW}/${name}`;
  fs.writeFileSync(file, buf);
  const entry = {
    file,
    url,
    method: init?.method ?? 'GET',
    query: init?.body ? decodeURIComponent(String(init.body).replace(/^data=/, '')) : null,
    retrievedAt: started,
    contentType: res.headers.get('content-type'),
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  };
  const log = fs.existsSync(`${RAW}/requests.json`)
    ? JSON.parse(fs.readFileSync(`${RAW}/requests.json`, 'utf8'))
    : [];
  log.push(entry);
  fs.writeFileSync(`${RAW}/requests.json`, JSON.stringify(log, null, 2) + '\n');
  console.log(name, entry.bytes, entry.sha256);
  return buf;
}

if (which === 'osm' || which === 'all') {
  const buf = await get('osm-city.json', 'https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(OSM_QUERY),
  });
  console.log('osm base', JSON.parse(buf.toString('utf8')).osm3s?.timestamp_osm_base);
}
if (which === 'scb' || which === 'all') await get('scb-tatorter-2023.json', SCB_URL);
if (which === 'nightlights' || which === 'all') {
  console.log('night-light grid', NL_W, 'x', NL_H, NL_BOX);
  await get('viirs-black-marble-2016.png', NL_URL);
}
