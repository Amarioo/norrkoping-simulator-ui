/**
 * Regressions of the 2026-10-18 geometry pass (docs/claude-progress.md, Batches A–D).
 * A: rail vehicles ride on the drawn rails; B: road widths and cross-sections; C: rail decks, spans,
 * approaches and junction levels; D: the diagnostics themselves.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cityMap } from './mapModel';
import { terrain } from './terrain';
import { buildCityLayers } from './cityMesh';
import { railAlignment, railGrades, junctionSteps, crossSections, diagnoseInfrastructure, classify, EXCEPTIONS } from './infraDiagnostics';
import { RouteTrack, VEHICLE_GEOMETRY, railLift, trackKindOf } from './trackProfile';
import railwayTags from '../../scripts/data/norrkoping-railway-tags-source.json';

const M = terrain.data.reference.metresPerUnit;
const key = (p: number[]) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

describe('Batch A: one canonical track for rails and vehicles', () => {
  it('stores every route point at its drawn track node level (no baked-in vehicle lift)', () => {
    // The stored levels (cityMap.roads holds the converted reference heights).
    const raw = JSON.parse(readFileSync('src/lib/data/norrkoping-map.json', 'utf8')) as {
      roads: { kind: string; a: number[]; b: number[]; yA: number; yB: number }[];
      transitRoutes: { points: number[][] }[];
    };
    const seg = new Map<string, [number, number]>();
    for (const r of raw.roads)
      if (r.kind === 'rail' || r.kind === 'tram') {
        seg.set(key(r.a) + '|' + key(r.b), [r.yA, r.yB]);
        seg.set(key(r.b) + '|' + key(r.a), [r.yB, r.yA]);
      }
    let matched = 0;
    for (const route of raw.transitRoutes)
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1],
          b = route.points[i];
        const s = seg.get(key([a[0], a[2]]) + '|' + key([b[0], b[2]]));
        if (!s) continue;
        expect(a[1]).toBe(s[0]);
        expect(b[1]).toBe(s[1]);
        matched++;
      }
    // Only a ~30 m reversing move at one tram terminus has no drawn track.
    expect(matched).toBeGreaterThan(2500);
  });

  it('keeps wheel contact on the drawn rail top everywhere (before: decks RMSE 3–4 m, max 7 m)', () => {
    const { routes, worst } = railAlignment();
    for (const row of routes as { n: number; max: number; kind: string }[]) if (row.n) expect(row.max).toBeLessThan(1e-6);
    expect(worst).toHaveLength(0);
  });

  it('rests each section on two bogies on the rail top, pitched with the track', () => {
    for (const route of cityMap.transitRoutes) {
      const kind = route.kind as 'train' | 'tram',
        track = new RouteTrack(route.points, trackKindOf(kind)),
        half = VEHICLE_GEOMETRY[kind].bogieHalf / M;
      for (let k = 0; k < 50; k++) {
        const d = (track.length * (k + 0.5)) / 50,
          pose = track.pose(d, half),
          [f, r] = pose.bogies;
        const reach = Math.cos(pose.pitch) * half;
        // The model's bogie centres (±half along the pitched body) land on the track points within 1 cm
        // (on curves the chord is slightly shorter than the arc between the bogies).
        const front = [pose.pos[0] + Math.sin(pose.heading) * reach, pose.pos[1] + Math.sin(pose.pitch) * half, pose.pos[2] + Math.cos(pose.heading) * reach];
        const rear = [pose.pos[0] - Math.sin(pose.heading) * reach, pose.pos[1] - Math.sin(pose.pitch) * half, pose.pos[2] - Math.cos(pose.heading) * reach];
        expect(Math.hypot(front[0] - f[0], front[1] - f[1], front[2] - f[2]) * M).toBeLessThan(0.01);
        expect(Math.hypot(rear[0] - r[0], rear[1] - r[1], rear[2] - r[2]) * M).toBeLessThan(0.01);
      }
    }
  });

  it('uses the documented rail heads: 0.18 m on ballast, flush embedded tram rail', () => {
    expect((railLift('rail') - railLift('tram')) * M).toBeCloseTo(0.18, 9);
  });
});

describe('Batch C: railway and approach profiles', () => {
  it('keeps vehicle grades plausible (before: Pendeln 14.7 % at Ståthögavägen, trams 12–13 %)', () => {
    const { routes } = railGrades();
    const by = Object.fromEntries(routes.map((r) => [r.route, r]));
    expect(by.pendeln.p99).toBeLessThan(3.5);
    expect(by.pendeln.max).toBeLessThan(9);
    expect(by['tram-2'].max).toBeLessThan(8);
    expect(by['tram-3'].max).toBeLessThan(8);
  });

  it('draws no rail or tram deck where OpenStreetMap has no bridge (no flat-scene ramps)', () => {
    const bridge = new Map((railwayTags as unknown as { elements: { id: number; tags: Record<string, string> }[] }).elements.map((e) => [e.id, e.tags.bridge]));
    for (const r of cityMap.roads)
      if ((r.kind === 'rail' || r.kind === 'tram') && r.bridge) expect(bridge.get(r.way!), `way ${r.way}`).toBeTruthy();
  });

  it('carries Södra stambanan level across the Ståthögavägen underpass', () => {
    const route = cityMap.transitRoutes.find((r) => r.id === 'pendeln')!;
    const track = new RouteTrack(route.points, 'rail');
    const [x, z] = terrain.fromSweref(569180, 6495960);
    let best = 0,
      gap = Infinity;
    for (let d = 0; d < track.length; d += 0.04) {
      const p = track.position(d),
        g = Math.hypot(p[0] - x, p[2] - z);
      if (g < gap) [gap, best] = [g, d];
    }
    const heights: number[] = [];
    for (let s = -60; s <= 60; s += 2) heights.push(track.position(best + s / M)[1] * M);
    // Rail top within 0.5 m over 120 m (the DTM floor of the underpass is 5 m lower).
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.5);
  });

  it('meets at one level at every junction, apart from the documented two-level nodes', () => {
    const twoLevel = ['287129602', '59432617', '954899965', '4384861'];
    for (const s of junctionSteps()) expect(twoLevel.some((w) => s.detail.includes(w)), s.detail).toBe(true);
  });
});

describe('Batch B: road cross-sections and widths', () => {
  it('draws untagged service roads at service widths, not 6.6 m', () => {
    const services = cityMap.roads.filter((r) => r.class === 'service');
    const wide = services.filter((r) => Math.abs(r.width * M - 6.6) < 0.01);
    // What remains 6.6 m are parking aisles and service ways tagged lanes=2.
    expect(wide.length / services.length).toBeLessThan(0.2);
  });

  it('keeps twisted cross-sections rare (before: 1 060, 23 above 1 m)', () => {
    const issues = crossSections();
    expect(issues.length).toBeLessThan(900);
    expect(issues.filter((i) => Math.abs(i.value) > 1).length).toBeLessThanOrEqual(15);
  });
});

describe('Batch D: diagnostics', () => {
  it('classifies with physical limits and documented exceptions', () => {
    const spiral = EXCEPTIONS[0].ways[0];
    expect(classify({ kind: 'steep-grade', x: 0, z: 0, value: 40, way: spiral, detail: '' }).exception).toBeTruthy();
    expect(classify({ kind: 'junction-step', x: 0, z: 0, value: 0.4, detail: '' }).severity).toBe('error');
    expect(classify({ kind: 'sag', x: 0, z: 0, value: 2, detail: '' }).severity).toBe('warning');
  });

  it('reports every issue with a location, severity and no vehicle off its track', () => {
    const { issues } = diagnoseInfrastructure();
    for (const i of issues) {
      expect(Number.isFinite(i.x) && Number.isFinite(i.z)).toBe(true);
      expect(['warning', 'error']).toContain(i.severity);
    }
    expect(issues.filter((i) => i.kind === 'vehicle-off-track')).toHaveLength(0);
  }, 60_000);
});

describe('buildings', () => {
  it('runs cornices along the flat roof edge (two triangles per wall edge, not draped on the terrain)', () => {
    const layers = buildCityLayers(['buildings']);
    const count = (name: 'walls' | 'cornices') =>
      layers[name]!.reduce((n, g) => n + g.getAttribute('position').count / 3, 0);
    expect(count('cornices')).toBe(count('walls'));
    for (const g of layers.cornices!.slice(0, 50)) {
      const y = g.getAttribute('position');
      // Every cornice quad is level: its two triangles share one height per edge pair.
      for (let i = 0; i < y.count; i += 6) expect(Math.abs(y.getY(i) - y.getY(i + 1))).toBeLessThan(1e-6);
    }
  }, 60_000);
});
