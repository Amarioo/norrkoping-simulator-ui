/**
 * Step 5: remaining railway/road grades and road surface integration (docs/claude-progress.md).
 *
 * A   Pendeln, E 567 423 N 6 497 104: the embankment between two underpass bridges was 1.5 m low in the
 *     mesh (rail corridor unrefined: stale class cache with legacy invented decks), 8.5 % for the train.
 * B   Järngatan under the E4, E 567 340 N 6 498 034: the DTM kept the E4 deck as ground (retained deck,
 *     LiDAR class 2, no class 17); Järngatan climbed onto it (47.7 %) and the deck was lifted to 19.6 m.
 * C.1 Hamngatan x Drottninggatan at Saltängsbron's south end, E 568 912 N 6 495 374: two street nodes in
 *     the DTM's removed-bridge gap were drawn at river level (2.5 m hole).
 * C   Road breakline patches (scripts/geo/road_patches.py) and junction fans meeting their strips.
 */
import { describe, expect, it } from 'vitest';
import { cityMap, type MapRoad, type Point } from './mapModel';
import { terrain, ROAD_SURFACE, spanHeight } from './terrain';
import { surfaceAt } from './cityMesh';
import { belowTerrain, crossSections, junctionFans, junctionSteps, profiles, railAlignment, railGrades } from './infraDiagnostics';
import { RouteTrack, trackKindOf } from './trackProfile';
import bridgeProfiles from './data/bridge-profiles.json';
import transport from './data/transport-network.json';

const M = terrain.data.reference.metresPerUnit,
  O = terrain.data.reference.verticalOriginMetres;
const metres = (y: number) => y * M + O;
const within = (E: number, N: number, R: number) => (p: Point) => {
  const [e, n] = terrain.toSweref(p[0], p[1]);
  return Math.hypot(e - E, n - N) < R;
};
const at = (r: MapRoad, t: number): Point => [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];

describe('C.1 Hamngatan x Drottninggatan at Saltängsbron south', () => {
  const near = within(568918, 6495372, 40);
  const site = cityMap.roads.filter((r) => (r.kind === 'road' || r.kind === 'tram') && (near(r.a) || near(r.b)));

  it('covers the junction, the bridge approach and the tram', () => {
    expect(site.filter((r) => r.name === 'Hamngatan').length).toBeGreaterThan(2);
    expect(site.filter((r) => r.name === 'Drottninggatan').length).toBeGreaterThan(5);
    expect(site.filter((r) => r.kind === 'tram').length).toBeGreaterThan(3);
  });

  it('has no hole: every drawn street, approach and deck surface stays at street level (before: 1.06 m)', () => {
    // Within 15 m of the two former hole nodes (Hamngatan falls to 2.4 m 40 m further west, as measured).
    const hole = [within(568911.6, 6495374.1, 15), within(568926.1, 6495378.3, 15)];
    let lowest = Infinity,
      samples = 0;
    for (const r of site.filter((r) => r.kind === 'road'))
      for (let k = 0; k <= 20; k++) {
        const t = k / 20,
          c = at(r, t);
        if (!hole.some((h) => h(c))) continue;
        samples++;
        const
          dx = r.b[0] - r.a[0],
          dz = r.b[1] - r.a[1],
          L = Math.hypot(dx, dz);
        for (const side of [-0.5, 0, 0.5]) {
          const p: Point = [c[0] - (dz / L) * r.width * side, c[1] + (dx / L) * r.width * side];
          lowest = Math.min(lowest, metres(surfaceAt(r, t, p, ROAD_SURFACE)));
        }
      }
    // Street 3.0-3.5 m, Saltängsbron deck 3.7 m (LiDAR class 17).
    expect(samples).toBeGreaterThan(50);
    expect(lowest).toBeGreaterThan(2.9);
  });

  it('levels the two deck-end notch nodes between the deck and the street', () => {
    const notch = [
      [568911.6, 6495374.1],
      [568926.1, 6495378.3],
    ];
    for (const [E, N] of notch) {
      const [x, z] = terrain.fromSweref(E, N);
      const key = Object.keys(bridgeProfiles.points).find((k) => {
        const [px, pz] = k.split(',').map(Number);
        return Math.hypot(px - x, pz - z) * M < 0.2;
      });
      expect(key, `profile point at E ${E} N ${N}`).toBeDefined();
      const level = metres((bridgeProfiles.points as Record<string, number>)[key!] - 0.097 + ROAD_SURFACE);
      expect(level).toBeGreaterThan(3.3);
      expect(level).toBeLessThan(3.75);
    }
  });

  it('joins connected surfaces without steps, fans or sinking pieces', () => {
    expect(junctionSteps(site)).toEqual([]);
    expect(junctionFans(site.filter((r) => r.kind === 'road')).filter((i) => i.value > 0.15)).toEqual([]);
    expect(belowTerrain(site)).toEqual([]);
  });

  it('keeps the street, approach and track gradients plausible', () => {
    const { issues } = profiles(site);
    expect(issues.filter((i) => i.kind !== 'sag')).toEqual([]);
  });

  it('carries cars on the drawn asphalt and trams on the drawn rails', () => {
    const key = (p: number[]) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    const seg = new Map<string, MapRoad>();
    for (const r of site) seg.set(key(r.a) + '|' + key(r.b), r);
    const nodes = transport.nodes as { x: number; y: number; z: number }[];
    let checked = 0;
    for (const e of transport.edges as { from: number; to: number }[]) {
      const a = nodes[e.from],
        b = nodes[e.to];
      const forward = seg.get(key([a.x, a.z]) + '|' + key([b.x, b.z])),
        backward = seg.get(key([b.x, b.z]) + '|' + key([a.x, a.z]));
      const r = forward ?? backward;
      if (!r || r.kind !== 'road') continue;
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const car = terrain.profileHeight([a.x, a.y, a.z], [b.x, b.y, b.z], t) + 0.008;
        const tr = forward ? t : 1 - t;
        // Rides at the centreline 5 cm above the drawn surface (CityTransport.kt), on every piece kind.
        expect((car - surfaceAt(r, tr, at(r, tr), ROAD_SURFACE)) * M).toBeCloseTo(0.05, 4);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
    const trams = railAlignment().samples.filter((s) => near([s.x, s.z]) && s.kind !== 'no-track');
    expect(trams.length).toBeGreaterThan(20);
    for (const s of trams) expect(Math.abs(s.deviation)).toBeLessThan(1e-3);
  });
});

describe('B Järngatan under the E4 (retained bridge deck removed from the DTM)', () => {
  const jarngatan = cityMap.roads.filter((r) => r.way === 1239608192);
  const e4 = cityMap.roads.filter((r) => r.way === 4384899 || r.way === 4384901);

  it('runs through the underpass at its measured level (before: 15 m on the deck, 47.7 %)', () => {
    const { issues } = profiles(jarngatan);
    expect(issues.filter((i) => i.kind === 'steep-grade' || i.kind === 'grade-break')).toEqual([]);
    let highest = -Infinity;
    for (const r of jarngatan) for (let k = 0; k <= 40; k++) highest = Math.max(highest, metres(surfaceAt(r, k / 40, at(r, k / 40), ROAD_SURFACE)));
    // Järngatan's rims under the bridge: 9.37 / 9.38 m (LiDAR class 2); its ends 10.1 / 9.8 m.
    expect(highest).toBeLessThan(10.3);
  });

  it('keeps the E4 deck at its surveyed surface, not 4.5 m above a draped Järngatan (before: 19.6 m)', () => {
    expect(e4.length).toBeGreaterThan(0);
    for (const r of e4)
      for (const t of [0, 0.5, 1]) {
        const h = metres(surfaceAt(r, t, at(r, t), ROAD_SURFACE));
        // LiDAR class 2 returns on the deck: 14.8-15.1 m.
        expect(h).toBeGreaterThan(14.4);
        expect(h).toBeLessThan(15.5);
      }
  });
});

describe('A Pendeln between the underpass bridges at E 567 423 N 6 497 104', () => {
  it('rides the measured embankment (native DTM 22.4-23.1 m, about 0.8 %)', () => {
    const route = cityMap.transitRoutes.find((r) => r.id === 'pendeln')!;
    const track = new RouteTrack(route.points, trackKindOf(route.kind));
    const native: [number, number, number][] = [
      // E, N, native 1 m DTM at the track centre (scripts/geo: native_along, Step 5)
      [567440.9, 6497093.4, 22.56],
      [567432.2, 6497098.3, 22.71],
      [567423.5, 6497103.3, 22.85],
      [567414.7, 6497107.9, 22.86],
    ];
    for (const [E, N, h] of native) {
      const [x, z] = terrain.fromSweref(E, N);
      let best = 0,
        bd = Infinity;
      for (let d = 0; d < track.length; d += 0.5 / M) {
        const p = track.position(d),
          e = Math.hypot(p[0] - x, p[2] - z);
        if (e < bd) [bd, best] = [e, d];
      }
      // Rail top = running surface + 0.18 m (ballasted rail head, trackProfile.ts).
      expect(Math.abs(metres(track.position(best)[1]) - 0.18 - h)).toBeLessThan(0.35);
    }
  });

  it('keeps vehicle grades within mainline limits (before: max 8.5 %, p99 3.0 %)', () => {
    const p = railGrades().routes.find((r) => r.route === 'pendeln')!;
    // Remaining peaks: cuttings at the 5 m grid limit (track breaklines, Step 5 prototype box only).
    expect(p.max).toBeLessThan(4);
    expect(p.p99).toBeLessThan(2.5);
  });
});

describe('C road breakline patches', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const P = (terrain.surface as any).patches;

  it('exists only in the prototype boxes and the Step 5.1 target groups, continuous across every patch edge', () => {
    expect(P).toBeTruthy();
    const boxes = [...Object.values(terrain.data.mesh!.patches!.boxes), ...Object.values(terrain.data.mesh!.patches!.groups ?? {})];
    let worst = 0;
    for (let t = 0; t < P.count; t += 3)
      for (let e = 0; e < 3; e++) {
        const a: Point = P.point(P.tris[t * 3 + e]),
          b: Point = P.point(P.tris[t * 3 + ((e + 1) % 3)]);
        const m: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          L = Math.hypot(b[0] - a[0], b[1] - a[1]),
          n: Point = [(-(b[1] - a[1]) / L) * 1e-7, ((b[0] - a[0]) / L) * 1e-7];
        worst = Math.max(worst, Math.abs(terrain.surfaceHeight(m[0] + n[0], m[1] + n[1]) - terrain.surfaceHeight(m[0] - n[0], m[1] - n[1])));
        const [E, N] = terrain.toSweref(...m);
        expect(boxes.some(([e0, n0, e1, n1]) => E > e0 - 80 && E < e1 + 80 && N > n0 - 80 && N < n1 + 80)).toBe(true);
      }
    // Step 5.1 optimisation (Steiner points removed): up to ~1.2 mm where a road edge meets terrain within 1 cm of a
    // short edge (E 567 369 N 6 498 029); no gap anywhere (step51opt.test.ts watertightness).
    expect(worst * M).toBeLessThan(2e-3);
  });

  it('leaves no twisted cross-section on the integrated asphalt (before: 17 in the four boxes)', () => {
    // The prototype boxes (Step 5.1 target groups elsewhere keep measured relief and are tested in step51.test.ts).
    const boxes = Object.values(terrain.data.mesh!.patches!.boxes);
    const inBox = (i: { x: number; z: number }) => {
      const [E, N] = terrain.toSweref(i.x, i.z);
      return boxes.some(([e0, n0, e1, n1]) => E >= e0 && E <= e1 && N >= n0 && N <= n1);
    };
    const inside = crossSections().filter((i) => terrain.surface!.patchedAt(i.x, i.z) && inBox(i) && Math.abs(i.value) > 0.3);
    // Remaining: Tvåstugubacken's switchbacks, where the OSM centreline cuts across the inside of the bend
    // and the measured ground there is 1.2 m lower (E 571 212 N 6 493 281): OSM geometry, not the surface.
    const tvastugubacken = within(571350, 6493350, 220);
    // Step 5.1: Gamla Övägen (E 568 588 N 6 493 273, Ektorpsgatan box) -0.35 m where a road that is not part of
    // the patch starts at a patched road's end line: the blend from the measured edge to the RTIN (Step 5: -0.24 m).
    const others = inside.filter((i) => !tvastugubacken([i.x, i.z]));
    expect(others.length).toBeLessThanOrEqual(1);
    for (const i of others) expect(Math.abs(i.value)).toBeLessThan(0.4);
    expect(inside.length).toBeLessThanOrEqual(4);
  });

  it('meets every strip at its junction fans (before: 20 fans above 0.3 m, max 1.73 m)', () => {
    const fans = junctionFans().sort((a, b) => b.value - a.value);
    expect(fans.filter((i) => i.value > 0.3)).toEqual([]);
    expect(fans[0]?.value ?? 0).toBeLessThan(0.3);
  });

  it('draws spans and decks on their own levels (span pieces untouched by the patches)', () => {
    let spans = 0;
    for (const r of cityMap.roads.filter((r) => r.spans?.length))
      for (const s of r.spans!) {
        const t = (s.t0 + s.t1) / 2;
        expect(surfaceAt(r, t, at(r, t), 0)).toBeCloseTo(spanHeight(r.spans, t)!, 9);
        spans++;
      }
    expect(spans).toBeGreaterThan(100);
  });
});
