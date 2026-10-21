/**
 * Step 5.1: targeted infrastructure geometry corrections (docs/claude-progress.md, docs/step51/).
 *
 * A  Pendeln (Södra stambanan, Trafikverket mainline; steepest gradient anywhere on the line 25 ‰): the
 *    remaining ridden grade peaks (max 4.80 % at 1 m sampling) were rendered-bed artefacts: native DTM and
 *    LiDAR ground stay at or below 1.6 %. Rail-bed breakline patches over those stretches; a 0.65 m deck-end
 *    notch at E 567 452 N 6 497 087 (prepare-bridge-profiles.py 1c, track depth 0.3 m).
 * B  Junction fans with one linear and one draped edge meet both strips exactly (cityMesh.ts fanWedge).
 * C  Road refinement only where the native DTM shows the defect is ours (scripts/geo/refinement_targets.py):
 *    priority-A breakline patches; horizontal (OSM alignment/width) problems are reported, not patched.
 * D  Järngatan under the E4: deck and road below are separate levels; the LiDAR has no class 17 there.
 */
import { describe, expect, it } from 'vitest';
import { cityMap, type MapRoad, type Point } from './mapModel';
import { terrain, ROAD_SURFACE, spanHeight } from './terrain';
import { surfaceAt, fanWedge, networkPieces } from './cityMesh';
import { crossSections, junctionFans, railGrades, refinementCandidates, belowTerrain } from './infraDiagnostics';
import { RouteTrack, trackKindOf } from './trackProfile';
import bridgeProfiles from './data/bridge-profiles.json';
import targets from '../../scripts/data/geometry-refinement-targets.json';

const M = terrain.data.reference.metresPerUnit,
  O = terrain.data.reference.verticalOriginMetres;
const metres = (y: number) => y * M + O;
const at = (r: MapRoad, t: number): Point => [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];
const pendeln = cityMap.transitRoutes.find((r) => r.id === 'pendeln')!;
const track = new RouteTrack(pendeln.points, trackKindOf(pendeln.kind));
/** Ridden 20 m chord grades (percent) every metre near SWEREF (E, N). */
function riddenGrades(E: number, N: number, R: number) {
  const [x, z] = terrain.fromSweref(E, N),
    out: { d: number; g: number; top: number }[] = [];
  for (let d = 0; d < track.length; d += 1 / M) {
    const p = track.position(d);
    if (Math.hypot(p[0] - x, p[2] - z) * M > R) continue;
    const a = track.position(d - 10 / M),
      b = track.position(d + 10 / M);
    out.push({ d, g: (Math.abs(b[1] - a[1]) / (20 / M)) * 100, top: metres(p[1]) }); // along the track
  }
  return out;
}

describe('A Pendeln grade peaks', () => {
  it('keeps every ridden 20 m chord within the line maximum of 25 ‰ (before: max 4.80 %)', () => {
    const p = railGrades().routes.find((r) => r.route === 'pendeln')!;
    expect(p.max).toBeLessThanOrEqual(2.5);
    expect(p.p99).toBeLessThan(2.0);
  });

  it('rides the measured bed at the former 4.8 % site (native DTM and LiDAR ground 25.0-25.1 m)', () => {
    // E 564 464 N 6 494 524: double track beside a cutting slope; 5 m grid nodes on the slope lifted the
    // rendered bed by up to 1.1 m in 4 m bumps.
    const near = riddenGrades(564464, 6494524, 25);
    expect(near.length).toBeGreaterThan(40);
    for (const s of near) {
      // Running surface = rail top - 0.18 m.
      expect(s.top - 0.18).toBeGreaterThan(24.85);
      expect(s.top - 0.18).toBeLessThan(25.35);
      expect(s.g).toBeLessThan(2.5);
    }
  });

  it('lifts the deck-end notch past the first underpass bridge (before: 0.65 m dip, 4.2 % ridden)', () => {
    const [x, z] = terrain.fromSweref(567452.4, 6497087.1);
    const key = Object.keys(bridgeProfiles.points).find((k) => {
      const [px, pz] = k.split(',').map(Number);
      return Math.hypot(px - x, pz - z) * M < 0.3;
    });
    expect(key).toBeDefined();
    const level = metres((bridgeProfiles.points as Record<string, number>)[key!] - 0.097 + ROAD_SURFACE);
    // Deck ends 22.2-22.5 m, LiDAR ground on the embankment 22.53-22.55 m.
    expect(level).toBeGreaterThan(22.2);
    expect(level).toBeLessThan(22.7);
    for (const s of riddenGrades(567452, 6497087, 30)) expect(s.g).toBeLessThan(2.5);
  });
});

describe('B junction fans', () => {
  it('meets every strip within 5 cm map-wide (before: 20 fans 0.05-0.27 m)', () => {
    expect(junctionFans()).toEqual([]);
  });

  it('equals both strips along their shared edges where one edge is linear and one draped', () => {
    // Every mixed wedge of the map, five points along each shared edge.
    type End = { r: MapRoad; t: number; linear: boolean };
    const nodes = new Map<string, { point: Point; y: number; ends: End[] }>();
    for (const r of cityMap.roads) {
      if (r.kind !== 'road') continue;
      for (const [point, node, t] of [
        [r.a, r.yA, 0],
        [r.b, r.yB, 1],
      ] as [Point, number, number][]) {
        // As infraDiagnostics.junctionFans: a span end is at the span's level.
        const span = spanHeight(r.spans, t),
          y = span ?? node,
          k = point.join(',') + ',' + y;
        if (!nodes.has(k)) nodes.set(k, { point, y, ends: [] });
        nodes.get(k)!.ends.push({ r, t, linear: !!r.linearProfile || span !== undefined });
      }
    }
    let checked = 0,
      worst = 0;
    for (const { point, y, ends } of nodes.values()) {
      if (ends.length < 2 || !ends.some((e) => e.linear) || ends.every((e) => e.linear)) continue;
      const g = terrain.groundHeight(...point);
      const corners = ends
        .flatMap((e) => {
          const dx = e.r.b[0] - e.r.a[0],
            dz = e.r.b[1] - e.r.a[1],
            len = Math.hypot(dx, dz) || 1;
          return [-1, 1].map((side) => ({ x: ((-dz / len) * e.r.width * side) / 2, z: ((dx / len) * e.r.width * side) / 2, e }));
        })
        .sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
      for (let i = 0; i < corners.length; i++) {
        const A = corners[i],
          B = corners[(i + 1) % corners.length];
        if (A.e.linear === B.e.linear || Math.abs(A.x * B.z - A.z * B.x) < 1e-8) continue;
        const wedge = fanWedge(point, y, g, A, B);
        for (const C of [A, B])
          for (const f of [0.2, 0.4, 0.6, 0.8, 1]) {
            const p: Point = [point[0] + C.x * f, point[1] + C.z * f];
            const step = Math.abs(wedge.at(...p) - surfaceAt(C.e.r, C.e.t, p, ROAD_SURFACE)) * M;
            // A residual equals the junction step at the node (scaled towards the corner): none above 5 cm.
            worst = Math.max(worst, step);
            checked++;
          }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(worst).toBeLessThan(0.05);
  });
});

describe('C targeted road refinement', () => {
  type Candidate = (typeof targets.candidates)[number];
  const priorityA = (targets.candidates as Candidate[]).filter((c) => c.priority === 'A' && c.kind === 'cross-section');
  // road_patches.py takes the measured surface only where the measured footprint is planar (STRIP_MAX 0.5 m); a
  // twist over a wall or terrace (Vattenverksvägen, strip residual 0.95 m) stays on the RTIN and is reported
  // (docs/step51/refinement-report.md). patches.members lists the segments that took the measured surface.
  const members = new Set(terrain.data.mesh!.patches!.members ?? []);
  const segKey = (r: MapRoad) => `${r.a[0].toFixed(3)},${r.a[1].toFixed(3)}|${r.b[0].toFixed(3)},${r.b[1].toFixed(3)}`;
  // Group-boundary nodes (a member road meets a draped road kept on the RTIN): the surface is feathered into the RTIN
  // there for continuity (road_patches.py FEATHER), so a twist site on such a node keeps the RTIN's shape (reported).
  const boundary: Point[] = [];
  {
    const atNode = new Map<string, MapRoad[]>();
    for (const r of cityMap.roads) if (r.kind === 'road') for (const q of [r.a, r.b]) atNode.set(q.join(','), [...(atNode.get(q.join(',')) ?? []), r]);
    for (const [k, rs] of atNode)
      if (rs.some((r) => members.has(segKey(r))) && rs.some((r) => !members.has(segKey(r)) && !r.bridge && !r.tunnel))
        boundary.push(k.split(',').map(Number) as Point);
  }
  const nearBoundary = (c: Candidate) => {
    const [x, z] = terrain.fromSweref(c.E, c.N);
    return boundary.some((q) => Math.hypot(q[0] - x, q[1] - z) * M < 8);
  };
  const patchedA = priorityA.filter((c) => c.seeds.some((k) => members.has(k)) && !nearBoundary(c));

  it('selected priority-A sites from the native-DTM evidence only', () => {
    expect(priorityA.length).toBeGreaterThan(80);
    expect(patchedA.length).toBeGreaterThan(60);
    for (const c of priorityA) expect((c.evidence as { meshPart: number }).meshPart).toBeGreaterThan(0.5);
    // Horizontal problems are never selected for a height correction on their own.
    for (const c of targets.candidates as Candidate[])
      if (c.kind === 'cross-section' && ['alignment', 'width', 'measured'].includes(c.category)) expect(c.seeds).toEqual([]);
  });

  it('brings every patched twist down to the measured cross-section', () => {
    // Within 5 m of the point where the native crease was measured (the evidence window), 2 m sampling as
    // infraDiagnostics.crossSections.
    for (const c of patchedA) {
      const [x, z] = terrain.fromSweref(c.E, c.N);
      let worst = 0;
      for (const whole of cityMap.roads.filter((r) => r.way === c.way && r.kind === 'road' && members.has(segKey(r))))
        for (const r of networkPieces(whole)) {
          if (r.linearProfile) continue;
          const dx = r.b[0] - r.a[0],
            dz = r.b[1] - r.a[1],
            len = Math.hypot(dx, dz),
            n = Math.max(1, Math.ceil((len * M) / 2));
          for (let k = 0; k <= n && len > 1e-9; k++) {
            const q = at(r, k / n);
            if (Math.hypot(q[0] - x, q[1] - z) * M > 5) continue;
            const side = (s: number): Point => [q[0] - (dz / len) * (r.width / 2) * s, q[1] + (dx / len) * (r.width / 2) * s];
            const crease = ((surfaceAt(r, k / n, side(1), 0) + surfaceAt(r, k / n, side(-1), 0)) / 2 - surfaceAt(r, k / n, q, 0)) * M;
            worst = Math.max(worst, Math.abs(crease));
          }
        }
      const native = Math.abs((c.evidence as { nativeCrease: number }).nativeCrease);
      // Brought to the measured shape: the crease limit or the measured crease + 0.2 m, plus 5 cm for the noise of a
      // 2.5 m local plane fit (Linköpingsvägen, E 566 311: -0.54 -> 0.32 m beside its trench span, measured 0.03 m).
      expect(worst, `crease at E ${c.E} N ${c.N}`).toBeLessThan(Math.max(0.3, native + 0.2) + 0.05);
    }
  });

  it('marks refinement sites inside patches for the inspection overlay', () => {
    const sites = refinementCandidates();
    expect(sites.some((s) => s.patched)).toBe(true);
    expect(sites.some((s) => !s.patched)).toBe(true);
    for (const s of sites) expect(['cross-section', 'steep-grade', 'grade-break', 'below-terrain', 'junction-fan']).toContain(s.kind);
  }, 60_000);

  it('draws no road piece of a patched target below the terrain', () => {
    const below = (targets.candidates as Candidate[]).filter((c) => c.kind === 'below-terrain' && c.priority === 'A');
    for (const c of below) {
      const [x, z] = terrain.fromSweref(c.E, c.N);
      const roads = cityMap.roads.filter((r) => r.way === c.way);
      const left = belowTerrain(roads).filter((i) => Math.hypot(i.x - x, i.z - z) * M < 15);
      for (const i of left) expect(i.value, `E ${c.E} N ${c.N}`).toBeLessThan(0.2);
    }
  });
});

describe('D Järngatan under the E4: two separate infrastructure levels', () => {
  it('keeps the E4 deck on its surveyed surface and Järngatan on the corrected ground beneath it', () => {
    const e4 = cityMap.roads.filter((r) => r.way === 4384899 || r.way === 4384901);
    const jarn = cityMap.roads.filter((r) => r.way === 1239608192);
    const [cx, cz] = terrain.fromSweref(567363.44, 6498035.62);
    // E4 deck at the crossing (LiDAR returns on the deck: class 2 at 14.8-15.0 m, no class 17).
    let deck = -Infinity;
    for (const r of e4)
      for (const p of networkPieces(r))
        for (let k = 0; k <= 20; k++) {
          const q = at(p, k / 20);
          if (Math.hypot(q[0] - cx, q[1] - cz) * M < 6) deck = Math.max(deck, metres(surfaceAt(p, k / 20, q, ROAD_SURFACE)));
        }
    let road = Infinity;
    for (const r of jarn)
      for (let k = 0; k <= 40; k++) {
        const q = at(r, k / 40);
        if (Math.hypot(q[0] - cx, q[1] - cz) * M < 6) road = Math.min(road, metres(surfaceAt(r, k / 40, q, ROAD_SURFACE)));
      }
    expect(deck).toBeGreaterThan(14.4);
    expect(deck).toBeLessThan(15.5);
    // Järngatan's class 2 rims 9.39 / 9.35 m: the trench, not the deck.
    expect(road).toBeGreaterThan(9.1);
    expect(road).toBeLessThan(9.8);
    expect(deck - road).toBeGreaterThan(4.5);
    // The ground under the deck is the trench floor (the deck is not bare earth).
    expect(metres(terrain.surfaceHeight(cx, cz))).toBeLessThan(10);
  });
});
