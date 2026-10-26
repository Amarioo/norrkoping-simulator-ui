// Lighting Phase L2d: pinned generator inputs and the generated files.
//
// Same map context, deck occluders and Step 6 type table as A1–L2bc (scripts/lighting-a1/inputs.ts);
// the OSM source is the L2d extract (scripts/data/lighting-l2d-source.json, pinned snapshot
// 2026-10-26); L0's classification says which service roads are already street lighting; the
// existing fixtures are the rendered set before L2d (pilot + A1–A3 + L2a + L2bc).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { encodeCompactSet, decodeCompactSet, type CompactSet } from '../../src/lib/lighting/compactSet';
import { corridorRegistry, type A1Data } from '../../src/lib/lighting/corridorRegistry';
import { L2BC_DATASET, L2BC_GENERATOR, type L0Classification } from '../../src/lib/lighting/corridorL2';
import { generateSites, type SiteOutput, type SiteSource, type SiteSpec, type SiteInput } from '../../src/lib/lighting/siteGenerator';
import {
  L2D_DATASET,
  L2D_GENERATOR,
  L2D_POLICY,
  L2D_ROLLOUT,
  L2D_TYPES,
  L2D_ZONE,
} from '../../src/lib/lighting/siteLighting';
import { geodeticToSweref, sceneToSweref, swerefToGeodetic } from '../../src/lib/geo/sweref99tm.js';
import { inRing } from '../../src/lib/lighting/corridorA1';
import { loadL2bcInputs, L2BC_INPUT_FILES, L2BC_OUTPUT_FILES } from '../lighting-l2/inputs';

const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
export const L2D_INPUT_FILES = {
  source: 'scripts/data/lighting-l2d-source.json',
  classification: 'docs/lighting-city-l0/data/city-lighting-l0.json',
  l0Source: 'scripts/data/lighting-city-source.json',
  map: L2BC_INPUT_FILES.map,
  bridges: L2BC_INPUT_FILES.bridges,
  places: L2BC_INPUT_FILES.places,
  pilot: L2BC_INPUT_FILES.pilot,
  a1: L2BC_INPUT_FILES.a1,
  a2: L2BC_INPUT_FILES.a2,
  a3: L2BC_INPUT_FILES.a3,
  l2a: L2BC_INPUT_FILES.l2a,
  l2bc: L2BC_OUTPUT_FILES.runtime,
  generator: 'src/lib/lighting/siteGenerator.ts',
  rule: 'src/lib/lighting/siteLighting.ts',
} as const;
export const L2D_OUTPUT_FILES = {
  runtime: 'src/lib/data/streetlights-l2d.json',
  provenance: 'docs/lighting-city-l2d/data/streetlights-l2d-provenance.json',
  stats: 'docs/lighting-city-l2d/data/stats.json',
} as const;

let cached: { input: SiteInput; l0: L0Classification } | null = null;
export function loadL2dInputs() {
  if (cached) return cached;
  const bc = loadL2bcInputs();
  const l2bc = corridorRegistry(
    decodeCompactSet(read(L2D_INPUT_FILES.l2bc) as CompactSet) as unknown as A1Data,
    bc.input.reference,
    { dataset: L2BC_DATASET, generator: L2BC_GENERATOR },
  ).fixtures.map((r) => ({
    id: r.id,
    x: r.position.scene.x,
    z: r.position.scene.z,
    type: r.photometry.fixtureType,
    placement: r.placement,
    element: r.source.element,
  }));
  const i = bc.input;
  cached = {
    input: {
      reference: i.reference,
      source: read(L2D_INPUT_FILES.source) as SiteSource,
      map: i.map,
      bridges: i.bridges,
      platforms: i.platforms,
      deckOccluders: i.deckOccluders,
      types: { ...i.types, ...L2D_TYPES },
      existing: [...i.existing, ...l2bc],
    },
    l0: bc.l0,
  };
  return cached;
}
export function l2dSpec(l0: L0Classification): SiteSpec {
  const { statuses } = l0.meta.formats;
  const reasons = (l0.meta.formats as unknown as { reasons: string[] }).reasons;
  const map = new Map<number, { status: string; reason: string }>();
  for (const w of l0.ways) map.set(w[0], { status: statuses[w[1]], reason: reasons[w[2]] });
  return {
    generator: L2D_GENERATOR,
    dataset: L2D_DATASET,
    zone: L2D_ZONE,
    policy: L2D_POLICY,
    l0: (way) => map.get(way) ?? null,
  };
}
export const generateL2d = (inputs = loadL2dInputs()) => generateSites(inputs.input, l2dSpec(inputs.l0));

/** Satellite check (L0 method): L2d fixtures per Black Marble 2016 pixel vs L0's lit km. */
export function satelliteCheck(out: SiteOutput, inputs = loadL2dInputs()) {
  const src = read(L2D_INPUT_FILES.l0Source) as {
    ways: [number, unknown, number, number, number[], unknown][];
    nightLights: { south: number; west: number; north: number; east: number; width: number; height: number; luminance: number[] };
    places: [string, string, number, number][];
  };
  const l0 = inputs.l0;
  const nl = src.nightLights;
  const G = nl.width / (nl.east - nl.west);
  const pix = (lat: number, lon: number) => {
    const col = Math.floor((lon - nl.west) * G),
      row = Math.floor((nl.north - lat) * G);
    return col >= 0 && col < nl.width && row >= 0 && row < nl.height ? row * nl.width + col : -1;
  };
  // L0 lit km per pixel (as scripts/lighting-city/build.ts: 10 m samples along each lit range).
  const flat = new Map(src.ways.map((w) => [w[0], w[4]]));
  const along = (f: number[], s: number): [number, number] => {
    let acc = 0;
    for (let i = 2; i < f.length; i += 2) {
      const l = Math.hypot(f[i] - f[i - 2], f[i + 1] - f[i - 1]);
      if (acc + l >= s) {
        const t = l ? (s - acc) / l : 0;
        return [f[i - 2] + t * (f[i] - f[i - 2]), f[i - 1] + t * (f[i + 1] - f[i - 1])];
      }
      acc += l;
    }
    return [f[f.length - 2], f[f.length - 1]];
  };
  const litKm = new Array(nl.width * nl.height).fill(0);
  for (const w of l0.ways) {
    const f = flat.get(w[0]);
    if (!f) continue;
    for (const [a, b] of w[8])
      for (let s = a + 5; s < b; s += 10) {
        const [e, n] = along(f, s);
        const [lat, lon] = swerefToGeodetic(e, n);
        const k = pix(lat, lon);
        if (k >= 0) litKm[k] += Math.min(10, b - s + 5) / 1000;
      }
  }
  const ref = inputs.input.reference as never;
  const l2d = new Array(nl.width * nl.height).fill(0);
  for (const f of out.fixtures) {
    const [e, n] = sceneToSweref(ref, f.x, f.z);
    const [lat, lon] = swerefToGeodetic(e, n);
    const k = pix(lat, lon);
    if (k >= 0) l2d[k]++;
  }
  const clip = L2D_ZONE.ring;
  const district = (c: [number, number]) => {
    let best = src.places[0],
      d = Infinity;
    for (const p of src.places) {
      const dd = Math.hypot(p[2] - c[0], p[3] - c[1]);
      if (dd < d) {
        d = dd;
        best = p;
      }
    }
    return best[0];
  };
  const pixels: { row: number; col: number; centre: [number, number]; lum: number; litKm: number; l2d: number }[] = [];
  for (let row = 0; row < nl.height; row++)
    for (let col = 0; col < nl.width; col++) {
      const lat = nl.north - (row + 0.5) / G,
        lon = nl.west + (col + 0.5) / G;
      const c = geodeticToSweref(lat, lon) as [number, number];
      if (!inRing(c, clip)) continue;
      const k = row * nl.width + col;
      pixels.push({ row, col, centre: [Math.round(c[0] * 10) / 10, Math.round(c[1] * 10) / 10], lum: nl.luminance[k], litKm: Math.round(litKm[k] * 1000) / 1000, l2d: l2d[k] });
    }
  const BRIGHT = 128;
  const brightDark = pixels.filter((p) => p.lum >= BRIGHT && p.litKm === 0);
  const dark = pixels.filter((p) => p.lum < 40);
  const top = [...pixels]
    .filter((p) => p.litKm === 0)
    .sort((a, b) => b.lum - a.lum || a.row - b.row || a.col - b.col)
    .slice(0, 15);
  return {
    note: 'Black Marble 2016 (visualised 8-bit, saturated in the core) per 15″ pixel inside the map clip, with L0 lit centreline km (recomputed as in scripts/lighting-city/build.ts) and the number of L2d fixtures. A plausibility check only: the image predates LED retrofits and cannot separate sites inside a pixel.',
    pixels: pixels.length,
    fixturesInClipPixels: pixels.reduce((s, p) => s + p.l2d, 0),
    brightThreshold: BRIGHT,
    brightButStreetDark: brightDark.length,
    brightButStreetDarkWithL2d: brightDark.filter((p) => p.l2d > 0).length,
    darkPixels: dark.length,
    darkPixelsWithL2d: dark.filter((p) => p.l2d > 0).length,
    darkPixelsL2dFixtures: dark.reduce((s, p) => s + p.l2d, 0),
    meanL2dPerPixelBySatelliteBand: [
      [0, 40],
      [40, 80],
      [80, 128],
      [128, 200],
      [200, 256],
    ].map(([a, b]) => {
      const ps = pixels.filter((p) => p.lum >= a && p.lum < b);
      return { lum: `${a}–${b}`, pixels: ps.length, meanL2d: ps.length ? Math.round((ps.reduce((s, p) => s + p.l2d, 0) / ps.length) * 100) / 100 : 0 };
    }),
    brightestStreetDarkPixels: top.map((p) => ({ ...p, district: district(p.centre) })),
  };
}

export function toL2dFiles(out: SiteOutput, inputs = loadL2dInputs()) {
  const spec = l2dSpec(inputs.l0);
  const meta = inputs.input.source.meta as SiteSource['meta'] & { snapshot: { sha256: string; retrievedAt: string } };
  const used = [...new Set(out.fixtures.map((f) => f.type))].sort();
  const types = Object.fromEntries(
    used.map((k) => {
      const t = inputs.input.types[k];
      return [k, { heightM: t.heightM, cct: t.cct, candela: t.candela, rangeM: t.rangeM, profile: t.profile }];
    }),
  );
  const sources = [
    {
      id: spec.dataset,
      dataset: 'OpenStreetMap (Overpass API), Lighting Phase L2d snapshot: parking lots, rail yard tracks and private site roads of the whole map',
      license: 'ODbL-1.0 © OpenStreetMap contributors',
      osmBase: meta.osmBase,
    },
  ];
  const compact = encodeCompactSet(out.fixtures, {
    generator: spec.generator,
    rollout: L2D_ROLLOUT,
    category: 'site',
    provenance: L2D_OUTPUT_FILES.provenance,
    zone: spec.zone.id,
    sources,
    types,
    corridor: { [spec.zone.id]: { name: spec.zone.name, ringEN: spec.zone.ring } },
    lit: 'Phase L2d rule lighting-l2d-v1 (estimates): open-air parking lots ≥ 500 m², yard and siding tracks on railway land, private service roads on industrial / port / retail / commercial / railway land; lit=no excluded',
    units:
      'x, z: scene units (1 = 25 m, SWEREF 99 TM scene frame) × 1e4; heading: rad × 1e6; occlusion: cm; corridor ring: EPSG:3006 E/N metres',
    counts: out.counts,
  });
  const sourceElements: Record<string, { version: number; timestamp: string; tags: Record<string, string> }> = {};
  const rows = out.provenance.map((p) => {
    sourceElements[p.source.element] ??= { version: p.source.version, timestamp: p.source.timestamp, tags: p.source.tags };
    const s = p.station;
    return [p.id, p.rule, p.site, s.index, s.of, s.chainageM, s.grid, s.spacingM, s.side, s.sideFallback ? 1 : 0, s.shiftM, s.offsetM, p.uncertaintyM, p.observed.join('; ')];
  });
  const inferred = [...new Set(out.provenance.map((p) => p.inferred.join('; ')))].sort();
  const provenance = {
    meta: {
      generator: spec.generator,
      category: 'site lighting (private land), not street lighting',
      policy: spec.policy,
      types: Object.fromEntries(Object.entries(L2D_TYPES).map(([k, t]) => [k, { ...t, status: 'estimate' }])),
      lit: compact.meta.lit,
      format: {
        fixtures:
          '[id, rule, site (lot / land element), station index, stations (perimeter / lattice size), chainage m (null for grid points), grid [i, j] (lot grid only), effective spacing m, side, side fallback 0|1, shift m (grid: [along, across]), offset m (inset / from the centreline), position uncertainty m, observed]',
        sourceElements: 'OSM element → version, timestamp and site-relevant tags of the snapshot',
        sites: '[element, kind, name, decision, size (lot m² / way m), land element, fixtures]',
        inferred: 'every estimate infers these fields',
      },
      inferred,
      inputs: Object.fromEntries(Object.entries(L2D_INPUT_FILES).map(([k, f]) => [k, { file: f, sha256: sha(f) }])),
      source: {
        file: L2D_INPUT_FILES.source,
        osmBase: meta.osmBase,
        snapshotSha256: meta.snapshot.sha256,
        retrievedAt: meta.snapshot.retrievedAt,
        license: 'ODbL-1.0 © OpenStreetMap contributors',
      },
      counts: out.counts,
    },
    fixtures: rows,
    sourceElements: Object.fromEntries(Object.entries(sourceElements).sort(([a], [b]) => (a < b ? -1 : 1))),
    sites: out.sites.map((s) => [s.element, s.kind, s.name, s.status, s.size, s.land, s.fixtures]),
    rejected: out.rejected,
  };
  // Summary statistics for the docs.
  const byKind: Record<string, { decided: number; lit: number; fixtures: number; size: number }> = {};
  for (const s of out.sites) {
    const k = (byKind[s.kind] ??= { decided: 0, lit: 0, fixtures: 0, size: 0 });
    k.decided++;
    if (/^lit /.test(s.status)) {
      k.lit++;
      k.size += s.size;
    }
    k.fixtures += s.fixtures;
  }
  for (const k of Object.values(byKind)) k.size = Math.round(k.size);
  const byLand: Record<string, { name: string; landuse: string; fixtures: number }> = {};
  const landName = new Map(
    inputs.input.source.elements.filter((e) => e.tags.landuse).map((e) => [`${e.type}/${e.id}`, { name: e.tags.name ?? '', landuse: e.tags.landuse }]),
  );
  for (const p of out.provenance) {
    const land = p.rule.startsWith('lot') ? out.sites.find((s) => s.element === p.site)?.land ?? null : p.site;
    if (!land) continue;
    const l = (byLand[land] ??= { ...landName.get(land)!, fixtures: 0 });
    l.fixtures++;
  }
  const stats = {
    rule: spec.generator.version,
    snapshot: { osmBase: meta.osmBase, sha256: meta.snapshot.sha256 },
    counts: out.counts,
    sitesByKind: byKind,
    largestLands: Object.entries(byLand)
      .sort((a, b) => b[1].fixtures - a[1].fixtures || (a[0] < b[0] ? -1 : 1))
      .slice(0, 20)
      .map(([element, v]) => ({ element, ...v })),
    satellite: satelliteCheck(out, inputs),
  };
  return {
    runtime: JSON.stringify(compact) + '\n',
    provenance: JSON.stringify(provenance) + '\n',
    stats: JSON.stringify(stats, null, 1) + '\n',
  };
}
