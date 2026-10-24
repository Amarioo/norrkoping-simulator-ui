import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import {
  GAP_MAX_M,
  JUNCTION_M,
  STATION_TYPES,
  classifyCity,
  litTag,
  type CityInput,
  type EN,
  type Polygon,
  type SourceWay,
  type Tags,
} from './cityRule';

// Synthetic frame: tätort = the square 0..1000 m; forest = 600..800 × 600..800 inside it.
const square = (x0: number, y0: number, x1: number, y1: number): Polygon => [
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
];
const TATORT = square(0, 0, 1000, 1000);
const FOREST = square(600, 600, 800, 800);
let nodeId = 1;
const way = (id: number, tags: Tags, pts: EN[], ends?: [number, number], marks: [number, string][] = []): SourceWay => [
  id,
  { ...tags },
  ends?.[0] ?? nodeId++,
  ends?.[1] ?? nodeId++,
  pts.flat(),
  marks,
];
const run = (ways: SourceWay[], extra: Partial<CityInput> = {}) =>
  classifyCity({ ways, tatorter: [TATORT], forest: [FOREST], existingZones: [], ...extra });
const byId = (out: ReturnType<typeof run>) => new Map(out.ways.map((w) => [w.id, w]));

describe('lit tag', () => {
  test('values', () => {
    expect(litTag({ lit: 'yes' })).toBe('yes');
    expect(litTag({ lit: 'sunset-sunrise' })).toBe('yes');
    expect(litTag({ lit: 'No' })).toBe('no');
    expect(litTag({ lit: 'disused' })).toBe('no');
    expect(litTag({ lit: 'unknown' })).toBeNull();
    expect(litTag({})).toBeNull();
  });
  test('lit=no wins inside a tätort and on a roundabout; lit=yes wins outside', () => {
    const r = byId(
      run([
        way(1, { highway: 'residential', lit: 'no' }, [[100, 100], [200, 100]]),
        way(2, { highway: 'primary', junction: 'roundabout', lit: 'no' }, [[1500, 100], [1520, 100]]),
        way(3, { highway: 'tertiary', lit: 'yes' }, [[2000, 100], [2300, 100]]),
      ]),
    );
    expect(r.get(1)).toMatchObject({ status: 'dark', reason: 'osm-lit-no', evidence: 'tag' });
    expect(r.get(2)).toMatchObject({ status: 'dark', reason: 'osm-lit-no' });
    expect(r.get(3)).toMatchObject({ status: 'lit', reason: 'osm-lit-yes', inTatort: false });
  });
});

describe('guideline rule', () => {
  test('streets lit inside a tätort, dark outside; untagged motorway dark everywhere', () => {
    const r = byId(
      run([
        way(1, { highway: 'residential' }, [[100, 200], [300, 200]]),
        way(2, { highway: 'residential' }, [[1200, 200], [1400, 200]]),
        way(3, { highway: 'motorway' }, [[100, 300], [900, 300]]),
        way(4, { highway: 'service', service: 'driveway' }, [[100, 400], [140, 400]]),
        way(5, { highway: 'service', service: 'alley' }, [[100, 450], [160, 450]]),
        way(6, { highway: 'track' }, [[100, 500], [300, 500]]),
        way(7, { highway: 'construction' }, [[100, 550], [300, 550]]),
      ]),
    );
    expect(r.get(1)).toMatchObject({ status: 'lit', reason: 'rule-street-in-tatort', evidence: 'rule' });
    expect(r.get(2)).toMatchObject({ status: 'dark', reason: 'dark-outside-tatort' });
    expect(r.get(3)).toMatchObject({ status: 'dark', reason: 'dark-motorway-untagged' });
    expect(r.get(4)).toMatchObject({ status: 'dark', reason: 'dark-private-service' });
    expect(r.get(5)).toMatchObject({ status: 'lit', reason: 'rule-street-in-tatort' });
    expect(r.get(6)).toMatchObject({ status: 'dark', reason: 'dark-track' });
    expect(r.get(7)).toMatchObject({ status: 'dark', reason: 'excluded' });
  });

  test('outside a tätort: ±50 m at signals/crossings, roundabouts and their entries', () => {
    // 300 m road with a signal at its middle vertex (150 m); roundabout touching another road's end.
    const ring: EN[] = [[2000, 2000], [2020, 2000], [2020, 2020], [2000, 2020], [2000, 2000]];
    const r = byId(
      run([
        way(1, { highway: 'secondary' }, [[1500, 1500], [1650, 1500], [1800, 1500]], undefined, [[1, 's']]),
        way(2, { highway: 'secondary', junction: 'roundabout' }, ring),
        way(3, { highway: 'secondary' }, [[2020, 2000], [2220, 2000]]),
        way(4, { highway: 'secondary', lit: 'no' }, [[2000, 2020], [2000, 2220]]),
      ]),
    );
    expect(r.get(1)).toMatchObject({ status: 'partial', reason: 'rule-junction', ranges: [[150 - JUNCTION_M, 150 + JUNCTION_M]] });
    expect(r.get(2)).toMatchObject({ status: 'lit', reason: 'rule-roundabout' });
    expect(r.get(3)).toMatchObject({ status: 'partial', ranges: [[0, JUNCTION_M]] });
    expect(r.get(4)).toMatchObject({ status: 'dark', reason: 'osm-lit-no' });
  });
});

describe('gap fill (e.g. Norrtull)', () => {
  // Outside the tätort so the street rule cannot light the pieces by itself.
  const street = (gapLengths: number[]) => {
    const ways: SourceWay[] = [];
    let x = 3000,
      n = 9000;
    ways.push(way(10, { highway: 'secondary', name: 'Gatan', lit: 'yes' }, [[x - 100, 3000], [x, 3000]], [n - 1, n]));
    gapLengths.forEach((L, i) => {
      ways.push(way(20 + i, { highway: 'secondary', name: 'Gatan' }, [[x, 3000], [x + L, 3000]], [n, n + 1]));
      x += L;
      n++;
    });
    ways.push(way(30, { highway: 'secondary', name: 'Gatan', lit: 'yes' }, [[x, 3000], [x + 100, 3000]], [n, n + 1]));
    return ways;
  };
  test('two untagged pieces (21 + 29.5 m) between lit neighbours are lit', () => {
    const r = byId(run(street([21, 29.5])));
    expect(r.get(20)).toMatchObject({ status: 'lit', reason: 'gap-fill', evidence: 'gap' });
    expect(r.get(21)).toMatchObject({ status: 'lit', reason: 'gap-fill' });
  });
  test(`a chain of ${GAP_MAX_M} m or more is not filled`, () => {
    const r = byId(run(street([30, 30])));
    expect(r.get(20)).toMatchObject({ status: 'dark', reason: 'dark-outside-tatort' });
  });
  test('only one lit neighbour → not filled', () => {
    const ways = street([20]).filter((w) => w[0] !== 30);
    expect(byId(run(ways)).get(20)).toMatchObject({ status: 'dark' });
  });
});

describe('paths', () => {
  test('sidewalks and paths beside a lit street are covered; forest, unpaved and simple paths dark', () => {
    const out = run([
      way(1, { highway: 'residential' }, [[100, 100], [400, 100]]),
      way(2, { highway: 'footway', footway: 'sidewalk' }, [[100, 106], [400, 106]]),
      way(3, { highway: 'cycleway' }, [[100, 92], [400, 92]]),
      way(4, { highway: 'footway' }, [[100, 300], [400, 300]]),
      way(5, { highway: 'footway' }, [[620, 700], [780, 700]]),
      way(6, { highway: 'footway', surface: 'gravel' }, [[100, 400], [300, 400]]),
      way(7, { highway: 'path' }, [[100, 500], [300, 500]]),
      way(8, { highway: 'path', surface: 'asphalt', bicycle: 'designated' }, [[100, 550], [300, 550]]),
      way(9, { highway: 'footway', lit: 'yes' }, [[100, 96], [400, 96]]),
    ]);
    const r = byId(out);
    expect(r.get(2)).toMatchObject({ status: 'lit', reason: 'rule-sidewalk', covered: true });
    expect(r.get(3)).toMatchObject({ status: 'lit', reason: 'rule-path-along-street', covered: true });
    expect(r.get(4)).toMatchObject({ status: 'lit', reason: 'rule-path-in-tatort', covered: false });
    expect(r.get(5)).toMatchObject({ status: 'dark', reason: 'dark-forest-path' });
    expect(r.get(6)).toMatchObject({ status: 'dark', reason: 'dark-unpaved-path' });
    expect(r.get(7)).toMatchObject({ status: 'dark', reason: 'dark-minor-path' });
    expect(r.get(8)).toMatchObject({ status: 'lit', reason: 'rule-path-in-tatort' });
    expect(r.get(9)).toMatchObject({ status: 'lit', reason: 'osm-lit-yes', covered: true });
    // Covered ways get no stations of their own.
    expect(out.stations.filter((s) => [2, 3, 9].includes(s.way))).toEqual([]);
  });
});

describe('stations', () => {
  test('count and spacing per type; none inside existing zones', () => {
    const out = run(
      [
        way(1, { highway: 'residential' }, [[0, 100], [270, 100]]),
        way(2, { highway: 'primary' }, [[0, 200], [300, 200]]),
        way(3, { highway: 'footway' }, [[0, 300], [220, 300]]),
        way(4, { highway: 'residential' }, [[0, 400], [10, 400]]),
        way(5, { highway: 'residential' }, [[500, 500], [770, 500]]),
      ],
      { existingZones: [square(450, 450, 900, 550)] },
    );
    const count = (id: number) => out.stations.filter((s) => s.way === id).length;
    expect(count(1)).toBe(270 / STATION_TYPES['street-bracket-6m'].spacingM);
    expect(count(2)).toBe(300 / STATION_TYPES['street-bracket-8m'].spacingM);
    expect(count(3)).toBe(220 / STATION_TYPES['park-lantern-4m'].spacingM);
    expect(count(4)).toBe(0);
    expect(count(5)).toBe(0);
    expect(out.droppedInExisting).toBe(10);
    const s1 = out.stations.filter((s) => s.way === 1).map((s) => s.e);
    expect(s1[0]).toBeCloseTo(13.5, 5);
    expect(s1[1] - s1[0]).toBeCloseTo(27, 5);
  });

  test('deterministic and independent of input order', () => {
    const ways = [
      way(5, { highway: 'residential', name: 'A' }, [[0, 0], [100, 0]]),
      way(3, { highway: 'footway' }, [[0, 50], [200, 50]]),
      way(9, { highway: 'secondary', lit: 'yes' }, [[0, 80], [300, 80]]),
    ];
    const a = JSON.stringify(run(ways));
    const b = JSON.stringify(run([...ways].reverse()));
    expect(b).toBe(a);
  });
});

describe('real data (Lighting Phase L0)', () => {
  test('committed outputs equal a fresh build; Norrtull lit by gap fill', { timeout: 120_000 }, async () => {
    const { buildL0, L0_OUTPUT_FILES, NORRTULL_WAYS } = await import('../../../scripts/lighting-city/build');
    const out = buildL0();
    for (const k of Object.keys(L0_OUTPUT_FILES) as (keyof typeof L0_OUTPUT_FILES)[])
      expect(fs.readFileSync(L0_OUTPUT_FILES[k], 'utf8'), k).toBe(out.files[k]);
    for (const id of NORRTULL_WAYS)
      expect(out.result.ways.find((w) => w.id === id)).toMatchObject({ status: 'lit', reason: 'gap-fill', evidence: 'gap' });
    // Stations never inside the existing rollouts.
    expect(out.stats.stations.droppedInsideExistingZones).toBeGreaterThan(0);
  });
});
