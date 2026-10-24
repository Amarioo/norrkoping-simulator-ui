// Lighting Phase A1: clips the pinned Step 6.2 OSM research snapshot to the A1 corridor and writes
// the small committed source extract the generator reads (no network access, no new snapshot).
//
//   node scripts/lighting-a1/extract-source.mjs        # A1 (default)
//   node scripts/lighting-a1/extract-source.mjs a2     # Lighting Phase A2 (corridorA2.ts → lighting-a2-source.json)
//   node scripts/lighting-a1/extract-source.mjs a3     # Lighting Phase A3 (corridorA3.ts → lighting-a3-source.json)
//
// Input:  work/step62/osm-research.json (ignored scratch; base 2026-10-23T09:05:06Z). Its SHA-256 must
//         equal the value pinned in docs/step62/evidence/source-manifest.json, otherwise nothing is
//         written (a re-fetched Overpass response is a NEW snapshot, not this one).
// Output: scripts/data/lighting-a1-source.json — © OpenStreetMap contributors, ODbL-1.0.
//         Every highway way (they all carry a lit tag: the query was way[highway][lit]) with any vertex
//         or segment midpoint within MARGIN_M of the corridor, and every highway=street_lamp node within
//         the same margin. Elements are sorted by (type, id); tags are filtered to lighting-relevant keys.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { geodeticToSweref } from '../../src/lib/geo/sweref99tm.js';
import { A1_ZONES, inRing } from '../../src/lib/lighting/corridorA1.ts';
import { A2_ZONES } from '../../src/lib/lighting/corridorA2.ts';
import { A3_ZONES } from '../../src/lib/lighting/corridorA3.ts';

const SNAPSHOT = 'work/step62/osm-research.json';
const MANIFEST = 'docs/step62/evidence/source-manifest.json';
const CORRIDOR = process.argv[2] ?? 'a1';
const ZONE_SETS = { a1: A1_ZONES, a2: A2_ZONES, a3: A3_ZONES };
if (!(CORRIDOR in ZONE_SETS)) throw new Error(`unknown corridor ${CORRIDOR}`);
const ZONES = ZONE_SETS[CORRIDOR];
const OUT = `scripts/data/lighting-${CORRIDOR}-source.json`;
const MARGIN_M = 60;
const KEEP =
  /^(highway|lit|lit:.*|name|oneway|junction|sidewalk.*|footway|width|est_width|lanes|bridge|layer|tunnel|area|embedded_rails|railway|access|foot|bicycle|motor_vehicle|surface|light_source|lamp_.*|support|man_made|operator|start_date|check_date|segregated)$/;

const raw = fs.readFileSync(SNAPSHOT);
const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
const pinned = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).files.find(
  (f) => f.localPath === SNAPSHOT,
);
if (!pinned || pinned.sha256 !== sha256)
  throw new Error(`${SNAPSHOT} SHA-256 ${sha256} differs from the pinned ${pinned?.sha256}`);
const osm = JSON.parse(raw.toString('utf8'));

const rings = Object.values(ZONES).map((z) => z.ring);
const segDist = (p, a, b) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
/** Distance (m) from an E/N point to the corridor (0 inside). */
const corridorDistance = (p) => {
  if (rings.some((r) => inRing(p, r))) return 0;
  let d = Infinity;
  for (const r of rings)
    for (let i = 0; i < r.length; i++) d = Math.min(d, segDist(p, r[i], r[(i + 1) % r.length]));
  return d;
};
const en = (lat, lon) => geodeticToSweref(lat, lon);
const near = (pts) => {
  for (let i = 0; i < pts.length; i++) {
    if (corridorDistance(pts[i]) <= MARGIN_M) return true;
    if (
      i &&
      corridorDistance([(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2]) <=
        MARGIN_M
    )
      return true;
  }
  return false;
};
const tags = (t = {}) =>
  Object.fromEntries(
    Object.keys(t)
      .filter((k) => KEEP.test(k))
      .sort()
      .map((k) => [k, t[k]]),
  );
const elements = [];
for (const e of osm.elements) {
  if (e.type === 'way' && e.tags?.highway && e.geometry) {
    const pts = e.geometry.map((p) => en(p.lat, p.lon));
    if (!near(pts)) continue;
    elements.push({
      type: 'way',
      id: e.id,
      version: e.version,
      timestamp: e.timestamp,
      tags: tags(e.tags),
      nodes: e.nodes,
      geometry: e.geometry.map((p) => [p.lat, p.lon]),
    });
  } else if (e.type === 'node' && e.tags?.highway === 'street_lamp') {
    if (corridorDistance(en(e.lat, e.lon)) > MARGIN_M) continue;
    elements.push({
      type: 'node',
      id: e.id,
      version: e.version,
      timestamp: e.timestamp,
      tags: tags(e.tags),
      lat: e.lat,
      lon: e.lon,
    });
  }
}
elements.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.id - b.id));
const request = JSON.parse(fs.readFileSync('work/step62/osm-request.json', 'utf8'));
const out = {
  meta: {
    source: 'OpenStreetMap contributors',
    license: 'ODbL-1.0',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
    osmBase: osm.osm3s.timestamp_osm_base,
    snapshot: {
      file: SNAPSHOT,
      sha256,
      retrievedAt: request.retrievedAt,
      url: request.url,
      query: request.query,
      note: 'Step 6.2 research snapshot (docs/step62/evidence/source-manifest.json); not re-fetched.',
    },
    clip: {
      corridor: `src/lib/lighting/corridor${CORRIDOR.toUpperCase()}.ts (${CORRIDOR.toUpperCase()}_ZONES)`,
      marginM: MARGIN_M,
    },
    queryLimits:
      'The query fetched highway ways WITH a lit tag and highway=street_lamp nodes only: a highway way absent here has no lit tag (unknown illumination); man_made=street_lamp, light_source and entrance nodes were not part of the snapshot.',
    counts: {
      ways: elements.filter((e) => e.type === 'way').length,
      lamps: elements.filter((e) => e.type === 'node').length,
    },
  },
  elements,
};
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(OUT, out.meta.counts, out.meta.osmBase, sha256);
