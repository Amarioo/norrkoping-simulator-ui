// Lighting Phase L0: runs the citywide rule (src/lib/lighting/cityRule.ts) on the pinned extract and
// produces the review data, statistics, capacity and satellite checks, and the 2D lighting map.
// Pure: returns file contents; write.test.ts writes them (WRITE=1) or checks them byte for byte.
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  CITY_RULE,
  REASONS,
  STATION_TYPES,
  classifyCity,
  type EN,
  type Polygon,
  type SourceWay,
  type StationType,
  type WayResult,
} from '../../src/lib/lighting/cityRule';
import { buildLightIndex, type IndexStats } from './phase0LightIndex';
import { A1_ZONES } from '../../src/lib/lighting/corridorA1';
import { A2_ZONES } from '../../src/lib/lighting/corridorA2';
import { A3_ZONES } from '../../src/lib/lighting/corridorA3';
import {
  SCENE_REFERENCE,
  geodeticToSweref,
  sceneToSweref,
  swerefToGeodetic,
  swerefToScene,
} from '../../src/lib/geo/sweref99tm.js';
import { renderMap } from './map-html';

export const L0_INPUT_FILES = {
  source: 'scripts/data/lighting-city-source.json',
  sources: 'scripts/lighting-city/sources.json',
  map: 'src/lib/data/norrkoping-map.json',
  pilot: 'src/lib/data/streetlights.json',
  a1: 'src/lib/data/streetlights-a1.json',
  a2: 'src/lib/data/streetlights-a2.json',
  a3: 'src/lib/data/streetlights-a3.json',
  rule: 'src/lib/lighting/cityRule.ts',
  corridors: 'src/lib/lighting/corridorA1.ts',
} as const;
const OUT_DIR = 'docs/lighting-city-l0';
export const L0_OUTPUT_FILES = {
  result: `${OUT_DIR}/data/city-lighting-l0.json`,
  stats: `${OUT_DIR}/data/stats.json`,
  capacity: `${OUT_DIR}/data/capacity.json`,
  satellite: `${OUT_DIR}/data/satellite-check.json`,
  provenance: `${OUT_DIR}/data/lighting-city-l0-provenance.json`,
  map: `${OUT_DIR}/lighting-map.html`,
} as const;

/** Map clip quadrilateral (docs/step62/coverage-audit.md), EPSG:3006, NW NE SE SW. */
export const MAP_CLIP: EN[] = [
  [561804.869, 6501570.951],
  [575151.458, 6501805.721],
  [575355.539, 6491229.31],
  [561972.712, 6490994.115],
];

/** Norra Promenaden pieces at Norrtull left unlit in A2/A3 (docs/lighting-phase-a3/remaining-gaps.md §1). */
export const NORRTULL_WAYS = [286445696, 300186798, 1050773512];

const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const km = (m: number) => Math.round(m / 100) / 10;

interface Fixture {
  id: string;
  x: number;
  z: number;
  rangeM: number;
  type: string;
}

export interface L0Input {
  source: {
    ways: SourceWay[];
    lamps: [number, number, number][];
    places: [string, string, number, number][];
    tatorter: { code: string; name: string; population: number; polygons: Polygon[] }[];
    nightLights: {
      south: number;
      west: number;
      north: number;
      east: number;
      width: number;
      height: number;
      luminance: number[];
    };
    meta: { sources: Record<string, unknown> };
  };
  forest: Polygon[];
  existingZones: { id: string; polygon: Polygon }[];
  existingFixtures: Fixture[];
}

const sceneRing = (x0: number, x1: number, z0: number, z1: number): EN[] =>
  [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ].map(([x, z]) => sceneToSweref(SCENE_REFERENCE, x, z) as EN);

export function loadL0Inputs(): L0Input {
  const source = read(L0_INPUT_FILES.source);
  const map = read(L0_INPUT_FILES.map);
  const forest: Polygon[] = map.areas
    .filter((a: { kind: string }) => a.kind === 'wood')
    .map((a: { rings: [number, number][][] }) =>
      a.rings.map((ring) => ring.map(([x, z]) => sceneToSweref(SCENE_REFERENCE, x, z) as EN)),
    );
  const pilot = read(L0_INPUT_FILES.pilot);
  const existingZones: L0Input['existingZones'] = [
    ...pilot.meta.pilots.map(
      (p: { id: string; bounds: { x0: number; x1: number; z0: number; z1: number } }) => ({
        id: `pilot:${p.id}`,
        polygon: [sceneRing(p.bounds.x0, p.bounds.x1, p.bounds.z0, p.bounds.z1)],
      }),
    ),
    ...Object.entries({ ...A1_ZONES, ...A2_ZONES, ...A3_ZONES }).map(([k, z]) => ({
      id: `zone:${k}`,
      polygon: [z.ring as EN[]],
    })),
  ];
  const existingFixtures: Fixture[] = [];
  for (const f of [L0_INPUT_FILES.pilot, L0_INPUT_FILES.a1, L0_INPUT_FILES.a2, L0_INPUT_FILES.a3])
    for (const x of read(f).fixtures)
      existingFixtures.push({ id: x.id, x: x.x, z: x.z, rangeM: x.rangeM, type: x.type });
  return { source, forest, existingZones, existingFixtures };
}

function pointAlong(flat: number[], s: number): EN {
  let acc = 0;
  for (let i = 2; i < flat.length; i += 2) {
    const l = Math.hypot(flat[i] - flat[i - 2], flat[i + 1] - flat[i - 1]);
    if (acc + l >= s || i === flat.length - 2) {
      const t = l ? Math.min(1, Math.max(0, (s - acc) / l)) : 0;
      return [flat[i - 2] + t * (flat[i] - flat[i - 2]), flat[i - 1] + t * (flat[i + 1] - flat[i - 1])];
    }
    acc += l;
  }
  return [flat[0], flat[1]];
}

/** Split a way's geometry at metre positions into [from, to] pieces (flat E/N). */
function slice(flat: number[], a: number, b: number): number[] {
  const out: number[] = [];
  let acc = 0;
  const push = (p: EN) => {
    if (out.length && out[out.length - 2] === p[0] && out[out.length - 1] === p[1]) return;
    out.push(p[0], p[1]);
  };
  for (let i = 2; i < flat.length; i += 2) {
    const l = Math.hypot(flat[i] - flat[i - 2], flat[i + 1] - flat[i - 1]);
    const s0 = acc,
      s1 = acc + l;
    if (s1 >= a && s0 <= b) {
      const at = (s: number): EN => {
        const t = l ? Math.min(1, Math.max(0, (s - s0) / l)) : 0;
        return [flat[i - 2] + t * (flat[i] - flat[i - 2]), flat[i - 1] + t * (flat[i + 1] - flat[i - 1])];
      };
      push(at(Math.max(a, s0)));
      push(at(Math.min(b, s1)));
    }
    acc = s1;
  }
  return out;
}

function inQuad(p: EN, q: EN[]) {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++)
    if (q[i][1] > p[1] !== q[j][1] > p[1] && p[0] < q[i][0] + ((p[1] - q[i][1]) * (q[j][0] - q[i][0])) / (q[j][1] - q[i][1]))
      inside = !inside;
  return inside;
}

function spearman(a: number[], b: number[]) {
  const rank = (v: number[]) => {
    const idx = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array(v.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r as number[];
  };
  const ra = rank(a),
    rb = rank(b);
  const n = a.length,
    ma = ra.reduce((s, x) => s + x, 0) / n,
    mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return { rho: num / Math.sqrt(da * db), ranks: [ra, rb] };
}

export function buildL0(input: L0Input = loadL0Inputs()) {
  const { source } = input;
  const raw = classifyCity({
    ways: source.ways,
    tatorter: source.tatorter.flatMap((t) => t.polygons),
    forest: input.forest,
    existingZones: input.existingZones.map((z) => z.polygon),
  });
  const srcById = new Map(source.ways.map((w) => [w[0], w]));
  // Overpass returns whole ways that cross the query box: count only what lies inside the map clip.
  const inMap = (p: EN) => inQuad(p, MAP_CLIP);
  const result = { ...raw, stations: raw.stations.filter((st) => inMap([st.e, st.n])) };
  const droppedOutsideMap = raw.stations.length - result.stations.length;
  const CLIP_STEP = 5;
  const clip = new Map<number, { len: number; lit: number }>();
  for (const w of raw.ways) {
    const flat = srcById.get(w.id)![4];
    let len = 0,
      lit = 0;
    for (let s0 = 0; s0 < w.lengthM; s0 += CLIP_STEP) {
      const seg = Math.min(CLIP_STEP, w.lengthM - s0),
        mid = s0 + seg / 2;
      if (!inMap(pointAlong(flat, mid))) continue;
      len += seg;
      if (w.ranges.some(([a, b]) => mid >= a && mid < b)) lit += seg;
    }
    clip.set(w.id, { len, lit });
  }
  const resById = new Map(result.ways.map((w) => [w.id, w]));

  // Districts: nearest place name to the way's midpoint (approximation, not official boundaries).
  const places = source.places.filter((p) => p[1] === 'suburb' || p[1] === 'neighbourhood');
  const districtOf = (p: EN) => {
    let best = 0,
      d = Infinity;
    places.forEach((q, i) => {
      const dd = Math.hypot(q[2] - p[0], q[3] - p[1]);
      if (dd < d) {
        d = dd;
        best = i;
      }
    });
    return best;
  };
  const midOf = (w: WayResult) => pointAlong(srcById.get(w.id)![4], w.lengthM / 2);
  const wayDistrict = new Map(result.ways.map((w) => [w.id, districtOf(midOf(w))]));

  // --- statistics ---
  const byReason: Record<string, { ways: number; km: number; litKm: number }> = {};
  for (const r of REASONS) byReason[r] = { ways: 0, km: 0, litKm: 0 };
  const byStatus: Record<string, { ways: number; km: number }> = {
    lit: { ways: 0, km: 0 },
    partial: { ways: 0, km: 0 },
    dark: { ways: 0, km: 0 },
  };
  const byGroup: Record<string, { km: number; litKm: number; tagKm: number; gapKm: number; ruleKm: number }> = {};
  const byEvidenceLitKm = { tag: 0, gap: 0, rule: 0 };
  let coveredKm = 0;
  for (const w of result.ways) {
    const { len: L, lit } = clip.get(w.id)!;
    if (!L) continue;
    byReason[w.reason].ways++;
    byReason[w.reason].km += L;
    byReason[w.reason].litKm += lit;
    byStatus[w.status].ways++;
    byStatus[w.status].km += L;
    const g = (byGroup[w.group] ??= { km: 0, litKm: 0, tagKm: 0, gapKm: 0, ruleKm: 0 });
    g.km += L;
    g.litKm += lit;
    g[`${w.evidence}Km` as 'tagKm'] += lit;
    byEvidenceLitKm[w.evidence] += lit;
    if (w.covered) coveredKm += lit;
  }
  const kmify = <T extends Record<string, number>>(o: T) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'ways' ? v : km(v)]));

  const stationsByType: Record<string, number> = {};
  const stationsByEvidence: Record<string, number> = { tag: 0, gap: 0, rule: 0 };
  for (const s of result.stations) {
    stationsByType[s.type] = (stationsByType[s.type] ?? 0) + 1;
    stationsByEvidence[s.evidence]++;
  }

  const districts = places.map((p) => ({
    name: p[0],
    place: p[1],
    e: p[2],
    n: p[3],
    km: 0,
    litKm: 0,
    tagKm: 0,
    gapKm: 0,
    ruleKm: 0,
    stations: 0,
    existing: 0,
    tatortKm: 0,
  }));
  for (const w of result.ways) {
    const { len: L, lit } = clip.get(w.id)!;
    if (!L) continue;
    const d = districts[wayDistrict.get(w.id)!];
    d.km += L;
    d.litKm += lit;
    d[`${w.evidence}Km` as 'tagKm'] += lit;
    if (w.inTatort) d.tatortKm += L;
  }
  for (const s of result.stations) districts[districtOf([s.e, s.n])].stations++;
  const existingEN = input.existingFixtures.map((f) => sceneToSweref(SCENE_REFERENCE, f.x, f.z) as EN);
  for (const p of existingEN) districts[districtOf(p)].existing++;

  // Lit ways inside the existing rollouts whose would-be station slot is empty: no existing fixture
  // within half a spacing of it. Candidates for Phase L2 seam work (existing fixtures stay unchanged).
  const uncoveredInZones = raw.dropped
    .filter((st) => {
      const r = STATION_TYPES[st.type].spacingM / 2;
      return !existingEN.some(([e, n]) => Math.hypot(e - st.e, n - st.n) <= r);
    })
    .map((st) => ({ way: st.way, name: srcById.get(st.way)![1].name ?? '', highway: srcById.get(st.way)![1].highway, e: st.e, n: st.n, evidence: st.evidence }));
  const norrtull = NORRTULL_WAYS.map((id) => {
    const w = resById.get(id);
    return w
      ? {
          id,
          status: w.status,
          reason: w.reason,
          evidence: w.evidence,
          lengthM: w.lengthM,
          covered: w.covered,
          stationsPendingInsideZone: uncoveredInZones.filter((u) => u.way === id).length,
        }
      : { id, missing: true };
  });

  const stats = {
    rule: CITY_RULE,
    note: 'Lengths are way centreline lengths in km inside the map clip (dual carriageways count twice); ways count = ways with any length inside the clip. Stations are preliminary centreline estimates for counting/capacity only.',
    ways: result.ways.filter((w) => clip.get(w.id)!.len > 0).length,
    byStatus: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, kmify(v)])),
    byReason: Object.fromEntries(Object.entries(byReason).map(([k, v]) => [k, kmify(v)])),
    byGroup: Object.fromEntries(Object.entries(byGroup).sort().map(([k, v]) => [k, kmify(v)])),
    litKmByEvidence: kmify(byEvidenceLitKm),
    coveredLitKm: km(coveredKm),
    stations: {
      total: result.stations.length,
      byType: Object.fromEntries(Object.entries(stationsByType).sort()),
      byEvidence: stationsByEvidence,
      droppedInsideExistingZones: result.droppedInExisting,
      droppedOutsideMap,
      insideZonesWithoutExistingFixtureInRange: uncoveredInZones.length,
      existingFixtures: input.existingFixtures.length,
    },
    norrtull,
    uncoveredInsideExistingZones: uncoveredInZones,
    districts: districts
      .map((d) => ({
        name: d.name,
        place: d.place,
        km: km(d.km),
        litKm: km(d.litKm),
        litShare: d.km ? Math.round((1000 * d.litKm) / d.km) / 1000 : 0,
        tagKm: km(d.tagKm),
        gapKm: km(d.gapKm),
        ruleKm: km(d.ruleKm),
        tatortKm: km(d.tatortKm),
        stations: d.stations,
        existingFixtures: d.existing,
      }))
      .sort((a, b) => (a.name < b.name ? -1 : 1)),
  };

  // --- capacity with the renderer's real index (stations + existing fixtures) ---
  const M = SCENE_REFERENCE.metresPerUnit;
  const lampsForIndex = [
    ...input.existingFixtures.map((f) => ({ id: `existing:${f.id}`, x: f.x, z: f.z, rangeM: f.rangeM })),
    ...result.stations.map((s, i) => {
      const [x, z] = swerefToScene(SCENE_REFERENCE, s.e, s.n);
      return { id: `l0:${String(i).padStart(6, '0')}`, x, z, rangeM: STATION_TYPES[s.type].rangeM };
    }),
  ];
  const built = buildLightIndex(lampsForIndex, { metresPerUnit: M, maxTextureSize: 16384 });
  const ist: IndexStats | null = built.ok ? built.index.stats : built.stats;
  const histogram = ist?.histogram ?? [];
  const conflicts = (built.conflicts ?? []).map((c) => {
    const [e, n] = sceneToSweref(SCENE_REFERENCE, c.centre[0], c.centre[1]);
    return {
      cell: c.cell,
      centreEN: [r1(e), r1(n)],
      district: places[districtOf([e, n])][0],
      contributors: c.raw.length,
      existing: c.raw.filter((id) => id.startsWith('existing:')).length,
    };
  });
  const capacity = {
    note: 'Preliminary L0 stations (centreline) + the 273 existing fixtures through src/lib/lighting/lightIndex.ts (25 m cells, 16 slots). Input for Phase L1, not a runtime build.',
    ok: built.ok,
    errors: built.ok ? [] : built.errors.slice(0, 5),
    lamps: lampsForIndex.length,
    stats: ist
      ? {
          cellEntries: ist.cellEntries,
          nonEmptyCells: ist.nonEmptyCells,
          maxRawOccupancy: ist.maxRawOccupancy,
          overflowCells: ist.overflowCells,
          pages: ist.pages,
          payloadBytes: ist.payload.bytes,
          directoryBytes: ist.directory.bytes,
          denseEquivalentBytes: ist.denseEquivalent.bytes,
        }
      : null,
    histogram: histogram.map((count, k) => ({ contributors: k, cells: count })).filter((h) => h.cells),
    conflictCount: built.ok ? 0 : built.conflictCount,
    conflictsReported: conflicts.length,
    conflictsByDistrict: Object.entries(
      conflicts.reduce<Record<string, number>>((m, c) => ((m[c.district] = (m[c.district] ?? 0) + 1), m), {}),
    ).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
    conflicts: conflicts.slice(0, 50),
  };

  // --- satellite plausibility check ---
  const nl = source.nightLights;
  const G = nl.width / (nl.east - nl.west);
  const pix = (lat: number, lon: number) => {
    const col = Math.floor((lon - nl.west) * G),
      row = Math.floor((nl.north - lat) * G);
    return col >= 0 && col < nl.width && row >= 0 && row < nl.height ? row * nl.width + col : -1;
  };
  const litKmPix = new Array(nl.width * nl.height).fill(0);
  for (const w of result.ways) {
    const flat = srcById.get(w.id)![4];
    for (const [a, b] of w.ranges)
      for (let s = a + 5; s < b; s += 10) {
        const p = pointAlong(flat, s);
        const [lat, lon] = swerefToGeodetic(p[0], p[1]);
        const i = pix(lat, lon);
        if (i >= 0) litKmPix[i] += Math.min(10, b - s + 5) / 1000;
      }
  }
  const pixels: { i: number; row: number; col: number; centre: EN; lum: number; litKm: number }[] = [];
  for (let row = 0; row < nl.height; row++)
    for (let col = 0; col < nl.width; col++) {
      const lat = nl.north - (row + 0.5) / G,
        lon = nl.west + (col + 0.5) / G;
      const c = geodeticToSweref(lat, lon) as EN;
      if (!inQuad(c, MAP_CLIP)) continue;
      const i = row * nl.width + col;
      pixels.push({ i, row, col, centre: [r1(c[0]), r1(c[1])], lum: nl.luminance[i], litKm: r3(litKmPix[i]) });
    }
  const { rho, ranks } = spearman(
    pixels.map((p) => p.lum),
    pixels.map((p) => p.litKm),
  );
  const n = pixels.length;
  const diff = pixels.map((p, k) => ({
    ...p,
    district: places[districtOf(p.centre)][0],
    satPct: Math.round((100 * ranks[0][k]) / (n - 1)),
    modelPct: Math.round((100 * ranks[1][k]) / (n - 1)),
  }));
  const BRIGHT = 128;
  const satellite = {
    note: 'Black Marble 2016 (visualised 8-bit, saturates at 255 in the core) vs modelled lit centreline km per 15″ pixel inside the map clip. Percentiles are ranks among these pixels. District = nearest place name to the pixel centre.',
    pixels: n,
    saturatedPixels: pixels.filter((p) => p.lum >= 254.5).length,
    spearmanRho: Math.round(rho * 1000) / 1000,
    brightThreshold: BRIGHT,
    brightButModelDark: diff.filter((p) => p.lum >= BRIGHT && p.litKm === 0).length,
    darkButModelLit: diff.filter((p) => p.lum < 40 && p.litKm >= 1).length,
    satelliteBrighterThanModel: [...diff]
      .sort((a, b) => b.satPct - b.modelPct - (a.satPct - a.modelPct) || a.i - b.i)
      .slice(0, 15)
      .map(({ i: _i, ...p }) => p),
    modelBrighterThanSatellite: [...diff]
      .sort((a, b) => b.modelPct - b.satPct - (a.modelPct - a.satPct) || a.i - b.i)
      .slice(0, 15)
      .map(({ i: _i, ...p }) => p),
  };

  // --- compact result for later phases ---
  const typeIdx = Object.keys(STATION_TYPES) as StationType[];
  const evIdx = ['tag', 'gap', 'rule'] as const;
  const resultFile = {
    meta: {
      rule: CITY_RULE,
      crs: 'EPSG:3006 E/N metres',
      formats: {
        statuses: ['lit', 'partial', 'dark'],
        reasons: REASONS,
        evidence: evIdx,
        stationTypes: typeIdx,
        ways: '[osmWayId, statusIndex, reasonIndex, evidenceIndex, covered 0|1, inTatort 0|1, lengthM, lengthInsideMapM, [[fromM, toM] lit ranges]]',
        stationsScope: 'only stations inside the map clip (MAP_CLIP, docs/step62/coverage-audit.md)',
        stations: '[E, N, stationTypeIndex, osmWayId, evidenceIndex]',
      },
      inputs: Object.fromEntries(Object.entries(L0_INPUT_FILES).map(([k, f]) => [k, { file: f, sha256: sha(f) }])),
      sources: source.meta.sources,
      licence:
        'Derived from OpenStreetMap (© OpenStreetMap contributors, ODbL-1.0) and SCB Statistiska tätorter 2023 (CC0, Källa: SCB, bearbetad).',
    },
    ways: result.ways.map((w) => [
      w.id,
      ['lit', 'partial', 'dark'].indexOf(w.status),
      REASONS.indexOf(w.reason),
      evIdx.indexOf(w.evidence),
      w.covered ? 1 : 0,
      w.inTatort ? 1 : 0,
      w.lengthM,
      r1(clip.get(w.id)!.len),
      w.ranges,
    ]),
    stations: result.stations.map((s) => [s.e, s.n, typeIdx.indexOf(s.type), s.way, evIdx.indexOf(s.evidence)]),
  };

  // --- the 2D map ---
  const E0 = 561700,
    N0 = 6490900;
  const ip = (flat: number[]) => flat.map((v, i) => Math.round(v - (i % 2 ? N0 : E0)));
  const pieces: [number, number, number[]][] = []; // [reasonIndex (or -1 = dark rest of partial), wayIndex, coords]
  result.ways.forEach((w, wi) => {
    const flat = srcById.get(w.id)![4];
    const ri = REASONS.indexOf(w.reason);
    if (w.status !== 'partial') {
      pieces.push([w.covered ? REASONS.length : ri, wi, ip(flat)]);
      return;
    }
    let s = 0;
    const darkReason = REASONS.indexOf(w.group === 'motorway' ? 'dark-motorway-untagged' : 'dark-outside-tatort');
    for (const [a, b] of w.ranges) {
      if (a > s) pieces.push([darkReason, wi, ip(slice(flat, s, a))]);
      pieces.push([ri, wi, ip(slice(flat, a, b))]);
      s = b;
    }
    if (s < w.lengthM) pieces.push([darkReason, wi, ip(slice(flat, s, w.lengthM))]);
  });
  const mapData = {
    origin: [E0, N0],
    reasons: [...REASONS, 'covered'],
    ways: result.ways.map((w) => {
      const t = srcById.get(w.id)![1];
      return [
        w.id,
        t.name ?? '',
        t.highway,
        t.lit ?? '',
        REASONS.indexOf(w.reason),
        w.evidence,
        w.covered ? 1 : 0,
        w.inTatort ? 1 : 0,
        Math.round(w.lengthM),
        places[wayDistrict.get(w.id)!][0],
      ];
    }),
    pieces,
    stations: result.stations.map((s) => [Math.round(s.e - E0), Math.round(s.n - N0), typeIdx.indexOf(s.type), evIdx.indexOf(s.evidence)]),
    existing: existingEN.map(([e, n]) => [Math.round(e - E0), Math.round(n - N0)]),
    pending: uncoveredInZones.map((u) => [Math.round(u.e - E0), Math.round(u.n - N0)]),
    lamps: source.lamps.map(([, e, n]) => [Math.round(e - E0), Math.round(n - N0)]),
    tatorter: source.tatorter.map((t) => ({
      name: t.name,
      population: t.population,
      rings: t.polygons.flatMap((p) => p.map((ring) => ip(ring.flat()))),
    })),
    zones: input.existingZones.map((z) => ({ id: z.id, ring: ip(z.polygon[0].flat()) })),
    clip: ip(MAP_CLIP.flat()),
    nightLights: (() => {
      const cells: [number[], number][] = [];
      for (let row = 0; row < nl.height; row++)
        for (let col = 0; col < nl.width; col++) {
          const lat0 = nl.north - row / G,
            lat1 = nl.north - (row + 1) / G,
            lon0 = nl.west + col / G,
            lon1 = nl.west + (col + 1) / G;
          const q = [
            geodeticToSweref(lat0, lon0),
            geodeticToSweref(lat0, lon1),
            geodeticToSweref(lat1, lon1),
            geodeticToSweref(lat1, lon0),
          ].flat() as number[];
          cells.push([ip(q), nl.luminance[row * nl.width + col]]);
        }
      return cells;
    })(),
    districts: stats.districts.map((d) => {
      const p = places.find((q) => q[0] === d.name)!;
      return { ...d, x: Math.round(p[2] - E0), y: Math.round(p[3] - N0) };
    }),
    summary: {
      stations: result.stations.length,
      existing: input.existingFixtures.length,
      litKm: km(byStatus.lit.km) + 0,
      byEvidenceLitKm: kmify(byEvidenceLitKm),
      totalKm: km(byStatus.lit.km + byStatus.partial.km + byStatus.dark.km),
      byReason: Object.fromEntries(Object.entries(byReason).map(([k, v]) => [k, kmify(v)])),
      coveredKm: km(coveredKm),
      capacity: { overflowCells: capacity.stats?.overflowCells ?? null, maxRaw: capacity.stats?.maxRawOccupancy ?? null },
      satellite: { rho: satellite.spearmanRho, pixels: n },
      norrtull,
      osmBase: (source.meta.sources as any).osm.osmBase,
      rule: CITY_RULE.version,
    },
  };

  const files: Record<keyof typeof L0_OUTPUT_FILES, string> = {
    result: JSON.stringify(resultFile) + '\n',
    stats: JSON.stringify(stats, null, 2) + '\n',
    capacity: JSON.stringify(capacity, null, 2) + '\n',
    satellite: JSON.stringify(satellite, null, 2) + '\n',
    map: renderMap(mapData),
    provenance: '',
  };
  const outHash = (k: keyof typeof files) => crypto.createHash('sha256').update(files[k]).digest('hex');
  files.provenance =
    JSON.stringify(
      {
        phase: 'lighting-city-l0',
        rule: CITY_RULE,
        reproducibility:
          'node scripts/lighting-city/extract-source.mjs, then WRITE=1 vitest -c scripts/lighting-city/vitest.config.ts write. Same inputs and tool versions give byte-identical files (checked by write.test.ts).',
        tools: { node: process.versions.node, typescript: 'type-stripped by vitest' },
        coordinates: {
          horizontal: 'EPSG:3006 SWEREF 99 TM, metres; OSM WGS84 projected with src/lib/geo/sweref99tm.js (WGS84 treated as SWEREF 99 geographic)',
          scene: 'scene x = (E − 569030) / (25 × 0.9996584126), z = (6494989 − N) / (25 × 0.9996584126) (SCENE_REFERENCE); used only to read existing fixtures and for the capacity check',
          vertical: 'none (2D classification)',
        },
        sources: JSON.parse(fs.readFileSync(L0_INPUT_FILES.sources, 'utf8')).sources,
        derivedFrom: resultFile.meta.inputs,
        outputs: Object.fromEntries(
          (Object.keys(L0_OUTPUT_FILES) as (keyof typeof L0_OUTPUT_FILES)[])
            .filter((k) => k !== 'provenance')
            .map((k) => [k, { file: L0_OUTPUT_FILES[k], sha256: outHash(k) }]),
        ),
        estimates:
          'Every way lit by rule or gap fill, every station position, type and spacing, the district assignment (nearest place name) and the tätort-as-lighting-boundary assumption are estimates. Only lit=yes/no tags and street_lamp nodes are mapped source data. No municipal IDs, photometry or schedules.',
      },
      null,
      2,
    ) + '\n';
  return { result, stats, capacity, satellite, files };
}
