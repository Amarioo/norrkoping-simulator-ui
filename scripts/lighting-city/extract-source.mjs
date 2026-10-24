// Lighting Phase L0: turns the three pinned raw inputs into one compact, committed source extract.
//
//   node scripts/lighting-city/extract-source.mjs
//
// Input:  the raw files listed in scripts/lighting-city/sources.json (ignored scratch). Each file's
//         SHA-256 must equal the pinned value, otherwise nothing is written.
// Output: scripts/data/lighting-city-source.json
//   - ways:    every OSM highway way: id, lighting-relevant tags, first/last node, geometry as EPSG:3006
//              E/N metres (0.1 m), and marks = vertices that are traffic signals ('s'), crossings ('c')
//              or level crossings ('r'). © OpenStreetMap contributors, ODbL-1.0.
//   - lamps:   highway=street_lamp nodes (E/N). ODbL.
//   - places:  place=suburb/neighbourhood nodes (name, E/N), used only to name districts. ODbL.
//   - tatorter: SCB Statistiska tätorter 2023 polygons (already EPSG:3006). CC0, Källa: SCB.
//   - nightLights: the 56 × 23 Black Marble 2016 pixels as 0–255 luminance (Rec. 709 weights of the
//              8-bit RGB), rows north → south, with the lat/lon grid. NASA, no use restriction.
// Coordinates: OSM WGS84 lat/lon are projected with src/lib/geo/sweref99tm.js (GRS80 Gauss–Krüger,
// SWEREF 99 TM); WGS84 is treated as SWEREF 99 geographic, as by the map importer (sub-metre
// difference, no epoch correction). No timestamps or local paths are written.
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { geodeticToSweref } from '../../src/lib/geo/sweref99tm.js';

const SOURCES = JSON.parse(fs.readFileSync('scripts/lighting-city/sources.json', 'utf8')).sources;
const OUT = 'scripts/data/lighting-city-source.json';

function pinned(key) {
  const s = SOURCES[key];
  const raw = fs.readFileSync(s.file);
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  if (sha !== s.sha256) throw new Error(`${s.file}: SHA-256 ${sha} differs from pinned ${s.sha256}`);
  return raw;
}

const KEEP =
  /^(highway|lit|name|ref|junction|service|footway|cycleway|sidewalk|surface|area|bridge|tunnel|layer|access|foot|bicycle|motor_vehicle|informal|indoor|crossing|segregated|tracktype|bus|psv|oneway)$/;
const tags = (t = {}) =>
  Object.fromEntries(
    Object.keys(t)
      .filter((k) => KEEP.test(k))
      .sort()
      .map((k) => [k, t[k]]),
  );
const r1 = (v) => Math.round(v * 10) / 10;
const en = (lat, lon) => {
  const [e, n] = geodeticToSweref(lat, lon);
  return [r1(e), r1(n)];
};

// --- OSM ---------------------------------------------------------------------------------------
const osm = JSON.parse(pinned('osm').toString('utf8'));
if (osm.osm3s.timestamp_osm_base !== SOURCES.osm.osmBase) throw new Error('OSM base differs');
const markOf = new Map();
for (const e of osm.elements) {
  if (e.type !== 'node' || !e.tags) continue;
  if (e.tags.highway === 'traffic_signals') markOf.set(e.id, 's');
  else if (e.tags.highway === 'crossing') markOf.set(e.id, 'c');
  else if (e.tags.railway === 'crossing') markOf.set(e.id, 'r');
}
const ways = [];
const lamps = [];
const places = [];
for (const e of osm.elements) {
  if (e.type === 'way' && e.tags?.highway && e.geometry?.length >= 2) {
    const g = [];
    for (const p of e.geometry) g.push(...en(p.lat, p.lon));
    const marks = [];
    e.nodes.forEach((id, i) => {
      if (markOf.has(id)) marks.push([i, markOf.get(id)]);
    });
    ways.push([e.id, tags(e.tags), e.nodes[0], e.nodes[e.nodes.length - 1], g, marks]);
  } else if (e.type === 'node' && e.tags?.highway === 'street_lamp') {
    lamps.push([e.id, ...en(e.lat, e.lon)]);
  } else if (
    e.type === 'node' &&
    ['suburb', 'neighbourhood', 'quarter'].includes(e.tags?.place) &&
    e.tags.name
  ) {
    places.push([e.tags.name, e.tags.place, ...en(e.lat, e.lon)]);
  }
}
ways.sort((a, b) => a[0] - b[0]);
lamps.sort((a, b) => a[0] - b[0]);
places.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

// --- SCB tätorter --------------------------------------------------------------------------------
const scb = JSON.parse(pinned('tatorter').toString('utf8'));
if (!/3006/.test(JSON.stringify(scb.crs))) throw new Error('SCB response is not EPSG:3006');
const tatorter = scb.features
  .map((f) => ({
    code: f.properties.tatortskod,
    name: f.properties.tatort,
    population: f.properties.bef,
    year: f.properties.ar,
    polygons: (f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates]
      : f.geometry.coordinates
    ).map((poly) => poly.map((ring) => ring.map(([e, n]) => [r1(e), r1(n)]))),
  }))
  .sort((a, b) => (a.code < b.code ? -1 : 1));

// --- Night lights (minimal PNG decoder: 8-bit, non-interlaced, colour types 0/2/6) ----------------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8,
    w = 0,
    h = 0,
    depth = 0,
    ctype = 0,
    interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 6: 4 }[ctype];
  if (depth !== 8 || !ch || interlace) throw new Error(`unsupported PNG ${depth}/${ctype}/${interlace}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= ch && y ? out[(y - 1) * stride + x - ch] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) {
        const q = a + b - c,
          pa = Math.abs(q - a),
          pb = Math.abs(q - b),
          pc = Math.abs(q - c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = (v + p) & 255;
    }
  }
  return { w, h, ch, px: out };
}
const png = decodePng(pinned('nightLights'));
const box = Object.fromEntries(
  new URL(SOURCES.nightLights.url).searchParams
    .get('BBOX')
    .split(',')
    .map(Number)
    .map((v, i) => [['south', 'west', 'north', 'east'][i], v]),
);
const luminance = [];
for (let i = 0; i < png.w * png.h; i++) {
  const o = i * png.ch;
  const y =
    png.ch === 1
      ? png.px[o]
      : 0.2126 * png.px[o] + 0.7152 * png.px[o + 1] + 0.0722 * png.px[o + 2];
  luminance.push(Math.round(y * 10) / 10);
}

const out = {
  meta: {
    phase: 'lighting-city-l0',
    crs: 'EPSG:3006 (SWEREF 99 TM), E/N metres rounded to 0.1 m',
    sources: Object.fromEntries(
      Object.entries(SOURCES).map(([k, s]) => [
        k,
        {
          dataset: s.dataset,
          sha256: s.sha256,
          license: s.license,
          attribution: s.attribution,
          ...(s.osmBase ? { osmBase: s.osmBase } : {}),
        },
      ]),
    ),
    formats: {
      ways: '[osmWayId, tags, firstNodeId, lastNodeId, [E0,N0,E1,N1,…], [[vertexIndex, s|c|r]]]',
      lamps: '[osmNodeId, E, N]',
      places: '[name, place, E, N]',
      nightLights: 'luminance 0–255 per pixel, row-major from the north-west corner',
    },
    counts: { ways: ways.length, lamps: lamps.length, places: places.length, tatorter: tatorter.length },
  },
  ways,
  lamps,
  places,
  tatorter,
  nightLights: { ...box, width: png.w, height: png.h, luminance },
};
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
const bytes = fs.statSync(OUT).size;
console.log(OUT, out.meta.counts, bytes, crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex'));
