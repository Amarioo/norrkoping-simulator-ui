// Downloads the OSM evidence used by the Step 6 lighting pilot and stores it as a local snapshot:
// scripts/data/norrkoping-lighting-source.json (ODbL, © OpenStreetMap contributors).
// Normal startup never queries live data; scripts/step6/import-streetlights.mjs reads this file.
//
//   node scripts/step6/fetch-lighting-sources.mjs
//
// Contents per pilot bbox: street-lamp nodes (highway=street_lamp, man_made=street_lamp, light_source),
// entrance/gate nodes, and every highway way with the tags relevant to lighting (lit, sidewalk*,
// width, bridge, layer, surface, highway, name) and geometry.
import fs from 'node:fs';
import { sceneToGeodetic } from '../../src/lib/geo/sweref99tm.js';
import { PILOTS } from './pilots.mjs';

const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const reference = { ...map.meta.reference };
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const UA = 'norrkoping-simulator-step6/1.0 (local research snapshot)';
const KEEP =
  /^(highway|lit|lit:.*|sidewalk.*|width|est_width|bridge|layer|surface|name|tunnel|footway|access|light_source|lamp_.*|support|light:.*|man_made|entrance|barrier|ref|description|operator|start_date|check_date)$/;
const out = { meta: {}, pilots: {} };
for (const pilot of PILOTS) {
  const { x0, x1, z0, z1 } = pilot.bounds;
  const corners = [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ].map(([x, z]) => sceneToGeodetic(reference, x, z));
  const s = Math.min(...corners.map((c) => c[0])) - 0.0005,
    n = Math.max(...corners.map((c) => c[0])) + 0.0005,
    w = Math.min(...corners.map((c) => c[1])) - 0.001,
    e = Math.max(...corners.map((c) => c[1])) + 0.001;
  const bbox = [s, w, n, e].map((v) => v.toFixed(6)).join(',');
  const query = `[out:json][timeout:120][bbox:${bbox}];(node[highway=street_lamp];node[man_made=street_lamp];node[light_source];way[light_source];node[entrance];node[barrier=gate];way[highway];);out meta geom;`;
  let json = null;
  for (let attempt = 1; attempt <= 4 && !json; attempt++) {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    });
    const text = await r.text();
    if (text.startsWith('{')) json = JSON.parse(text);
    else await new Promise((res) => setTimeout(res, 5000 * attempt));
  }
  if (!json) throw new Error('Overpass failed for ' + pilot.id);
  const elements = json.elements.map((el) => ({
    type: el.type,
    id: el.id,
    timestamp: el.timestamp,
    version: el.version,
    tags: Object.fromEntries(Object.entries(el.tags ?? {}).filter(([k]) => KEEP.test(k))),
    ...(el.type === 'node' ? { lat: el.lat, lon: el.lon } : {}),
    ...(el.geometry ? { geometry: el.geometry.map((p) => [p.lat, p.lon]), nodes: el.nodes } : {}),
  }));
  out.pilots[pilot.id] = { bbox, query, osmBase: json.osm3s.timestamp_osm_base, elements };
  console.log(pilot.id, bbox, elements.length, json.osm3s.timestamp_osm_base);
}
out.meta = {
  source: 'OpenStreetMap contributors',
  license: 'ODbL-1.0',
  licenseUrl: 'https://www.openstreetmap.org/copyright',
  endpoint: ENDPOINT,
  accessed: new Date().toISOString(),
  note: 'Snapshot for the Step 6 lighting pilot. Lamp nodes are mapped positions (not surveyed); lit=* establishes lighting presence on a way, not pole positions.',
  checkedNotAvailable: [
    'Norrköpings kommun: no street-lighting (gatubelysning/belysningspunkter) dataset found on dataportal.se (organisation store 215, 2026-10-21) or norrkoping.se/oppna-data (HTTP 404).',
    'National: dataportal.se lists lamp datasets only for Stockholm (Belysningsmontage) and Huddinge (Belysningsstolpe); none covers Norrköping.',
  ],
};
fs.writeFileSync('scripts/data/norrkoping-lighting-source.json', JSON.stringify(out));
console.log('written scripts/data/norrkoping-lighting-source.json');
