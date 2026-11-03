import { describe, expect, it } from 'vitest';
import mapData from '../data/norrkoping-map.json';
import { ESSP_RWY, ESTIMATES, esspRunwayLights, faceSeen, type RunwayLight } from './runwayLights';
import type { Point } from '../mapModel';

const airways = (mapData as unknown as { airways: Parameters<typeof esspRunwayLights>[0] }).airways;
const lights = esspRunwayLights(airways);
const runway = airways.find((a) => a.ref === '09/27')!;
const thr09 = runway.points[0] as Point,
  thr27 = runway.points.at(-1)! as Point;
const L = Math.hypot(thr27[0] - thr09[0], thr27[1] - thr09[1]) * 25;
const u: Point = [(thr27[0] - thr09[0]) / (L / 25), (thr27[1] - thr09[1]) / (L / 25)];
/** Metres along the runway from threshold 09 and across it (north positive). */
const local = (p: Point) => {
  const r: Point = [(p[0] - thr09[0]) * 25, (p[1] - thr09[1]) * 25];
  return { along: r[0] * u[0] + r[1] * u[1], across: r[0] * u[1] - r[1] * u[0] };
};
const of = (group: RunwayLight['group']) => lights.filter((l) => l.group === group);

describe('Airport Lighting E1: ESSP RWY 09/27 layout', () => {
  it('uses the mapped runway, which matches the AIP length', () => {
    expect(Math.abs(L - ESSP_RWY.lengthM)).toBeLessThan(1);
    expect(new Set(lights.map((l) => l.id)).size).toBe(lights.length);
  });

  it('places edge lights at most 60 m apart along both edges, white with yellow caution zones', () => {
    const edge = of('edge');
    for (const side of [1, -1]) {
      const row = edge
        .filter((l) => Math.sign(local(l.position).across) === side)
        .map((l) => local(l.position).along)
        .sort((a, b) => a - b);
      const gaps = [row[0], ...row.slice(1).map((d, i) => d - row[i]), L - row.at(-1)!];
      expect(Math.max(...gaps)).toBeLessThanOrEqual(60 + 1e-6);
      expect(Math.min(...gaps)).toBeGreaterThan(55);
    }
    for (const l of edge) {
      const { along, across } = local(l.position);
      expect(Math.abs(across)).toBeCloseTo(ESSP_RWY.widthM / 2 + ESTIMATES.edgeOffsetM, 3);
      // The face seen by pilots landing on 09 (pointing west) is yellow only in the last 600 m.
      const west = l.faces.find((f) => f.towards![0] < 0)!,
        east = l.faces.find((f) => f.towards![0] > 0)!;
      expect(west.color).toBe(along > L - 600 ? 'yellow' : 'white');
      expect(east.color).toBe(along < 600 ? 'yellow' : 'white');
    }
  });

  it('has combined threshold/end rows: green outwards, red inwards, per runway in use', () => {
    const rows = of('threshold');
    expect(rows.length).toBe(2 * (Math.round(45 / 3) + 1));
    for (const l of rows) {
      const { along } = local(l.position);
      const atWest = Math.abs(along) < 1;
      expect(atWest || Math.abs(along - L) < 1).toBe(true);
      const green = l.faces.find((f) => f.color === 'green')!,
        red = l.faces.find((f) => f.color === 'red')!;
      expect(green.inUse).toBe(atWest ? '09' : '27');
      expect(red.inUse).toBe(atWest ? '27' : '09');
      // Green faces away from the runway (towards the approach), red faces along it.
      expect(Math.sign(green.towards![0])).toBe(atWest ? -1 : 1);
      expect(Math.sign(red.towards![0])).toBe(atWest ? 1 : -1);
    }
  });

  it('runs the approach lights 540 m west of 09 and 900 m east of 27', () => {
    const app = of('approach');
    const west = app.filter((l) => l.faces[0].inUse === '09').map((l) => local(l.position).along);
    const east = app.filter((l) => l.faces[0].inUse === '27').map((l) => local(l.position).along);
    expect(Math.min(...west)).toBeCloseTo(-540, 3);
    expect(Math.max(...west)).toBeLessThan(0);
    expect(Math.max(...east)).toBeCloseTo(L + 900, 3);
    expect(Math.min(...east)).toBeGreaterThan(L);
  });

  it('puts four PAPI units on the left of each landing direction, outside the runway', () => {
    const papi = of('papi');
    expect(papi.length).toBe(8);
    for (const l of papi) {
      const { across } = local(l.position);
      expect(Math.abs(across)).toBeGreaterThan(ESSP_RWY.widthM / 2 + 10);
      // 09 lands eastwards: left = north (+across); 27 westwards: left = south.
      expect(Math.sign(across)).toBe(l.faces[0].inUse === '09' ? 1 : -1);
    }
    // MEHT 56 ft at the lowest on-slope angle (2°50'): ≈ 345 m from the threshold (estimate).
    const d09 = local(papi.find((l) => l.faces[0].inUse === '09')!.position).along;
    expect(d09).toBeGreaterThan(330);
    expect(d09).toBeLessThan(360);
  });

  it('lights only taxiways B and C, never inside the runway', () => {
    const taxi = of('taxiway');
    expect(taxi.length).toBeGreaterThan(20);
    for (const l of taxi) {
      const { along, across } = local(l.position);
      expect(along > -5 && along < L + 5 && Math.abs(across) < 27.5).toBe(false);
      expect(l.faces[0].color).toBe('blue');
    }
    expect(new Set(taxi.map((l) => l.id.split(':')[2].split('-')[0]))).toEqual(new Set(['B', 'C']));
  });

  it('has nothing for the grass runway 11/29 or the historic Bråvalla runways', () => {
    const grass = airways.find((a) => a.ref === '11/29')!;
    const near = (p: Point) =>
      grass.points.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) * 25 < 60);
    expect(lights.some((l) => near(l.position) && l.group !== 'taxiway')).toBe(false);
    // Kungsängen lies at x ≈ 80–230 (approach 09 included); Bråvalla far west (x < −160).
    expect(lights.every((l) => l.position[0] > 0)).toBe(true);
    expect(esspRunwayLights(airways.filter((a) => a.ref !== '09/27'))).toEqual([]);
  });

  it('shows PAPI white above and red below each unit angle, only towards its approach', () => {
    const face = {
      towards: [-1, 0] as Point,
      color: 'white' as const,
      inUse: '09' as const,
      papiDeg: 3,
    };
    expect(faceSeen(face, [-1, 0], 3.2)).toEqual([1, 'white']);
    expect(faceSeen(face, [-1, 0], 2.8)).toEqual([1, 'red']);
    expect(faceSeen(face, [1, 0], 3.2)[0]).toBe(0);
    expect(faceSeen(face, [-Math.cos(0.3), Math.sin(0.3)], 3.2)[0]).toBe(0); // 17° off axis
  });

  it('fades directional faces between 30° and 60° off their axis', () => {
    const face = { towards: [1, 0] as Point, color: 'green' as const, inUse: 'both' as const };
    const at = (deg: number) =>
      faceSeen(face, [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)], 1)[0];
    expect(at(0)).toBe(1);
    expect(at(29)).toBe(1);
    expect(at(45)).toBeGreaterThan(0);
    expect(at(45)).toBeLessThan(1);
    expect(at(61)).toBe(0);
    expect(faceSeen({ ...face, towards: null }, [-1, 0], 1)[0]).toBe(1);
  });

  it('gives directional runway lights a side spill (estimate), never PAPI', () => {
    const edge = of('edge')[0].faces[0],
      papi = of('papi')[0].faces[0];
    expect(edge.spill).toBe(ESTIMATES.spill.edge);
    expect(papi.spill).toBeUndefined();
    // Seen from the side (90° off its axis): the spill; from behind: nothing.
    const side: Point = [-edge.towards![1], edge.towards![0]];
    expect(faceSeen(edge, side, 30)[0]).toBeCloseTo(
      ESTIMATES.spill.edge * 0.375 ** 2 * (3 - 0.75),
      6,
    );
    expect(faceSeen(edge, [-edge.towards![0], -edge.towards![1]], 30)[0]).toBe(0);
  });
});
