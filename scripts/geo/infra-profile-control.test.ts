/**
 * Writes src/lib/geo/network-profile-control.json (and the backend's test copy): network reference
 * heights from terrain.ts profileHeight() (rules v4) on transport edges and rail routes, grouped by
 * case. TerrainService.kt (NetworkProfileTest.kt) and infrastructure.test.ts must reproduce them.
 * Also writes src/lib/geo/rail-track-control.json (and the backend copy): rail vehicle section poses from
 * the track contract (trackProfile.ts RouteTrack), which RailTrack in RailTraffic.kt (RailTrackTest.kt)
 * must reproduce.
 * Run:  npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-profile-control.test.ts
 */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { terrain } from '../../src/lib/terrain';
import { cityMap } from '../../src/lib/mapModel';
import transport from '../../src/lib/data/transport-network.json';
import { RouteTrack, VEHICLE_GEOMETRY, RAIL_HEAD_METRES, trackKindOf } from '../../src/lib/trackProfile';

it('writes the network profile fixture', () => {
  const nodes = transport.nodes as { x: number; y: number; z: number }[];
  const groups: Record<string, number[][]> = { span: [], approach: [], deck: [], ordinary: [], railSpan: [], integrated: [] };
  const add = (group: string, a: number[], b: number[]) => {
    if (groups[group].length >= 400) return;
    for (const t of [0, 0.37, 0.81, 1]) groups[group].push([...a, ...b, t, terrain.profileHeight(a, b, t)]);
  };
  const edges = transport.edges as { from: number; to: number }[];
  for (let i = 0; i < edges.length; i += 1) {
    const n = nodes[edges[i].from],
      m = nodes[edges[i].to];
    const a = [n.x, n.y, n.z],
      b = [m.x, m.y, m.z];
    const pa = terrain.bridgeHeight(n.x, n.z, n.y) !== undefined,
      pb = terrain.bridgeHeight(m.x, m.z, m.y) !== undefined;
    if (terrain.integrated([n.x, n.z], [m.x, m.z])) add('integrated', a, b);
    else if (terrain.spans([n.x, n.z], [m.x, m.z])) add('span', a, b);
    else if (pa && pb) add('deck', a, b);
    else if (pa || pb) add('approach', a, b);
    else if (i % 97 === 0) add('ordinary', a, b);
  }
  for (const route of cityMap.transitRoutes)
    for (let i = 1; i < route.points.length; i++)
      if (terrain.spans([route.points[i - 1][0], route.points[i - 1][2]], [route.points[i][0], route.points[i][2]]))
        add('railSpan', route.points[i - 1], route.points[i]);
  const out = {
    note:
      'Network reference heights (scene units) from the UI terrain.ts profileHeight(), rules v4 (Step 3.5): ' +
      '[ax, ay, az, bx, by, bz, t, height]. Written by scripts/geo/infra-profile-control.test.ts.',
    revision: terrain.data.revision,
    groups,
  };
  const text = JSON.stringify(out) + '\n';
  writeFileSync('src/lib/geo/network-profile-control.json', text);
  writeFileSync('../norrkoping-simulator-backend/src/test/resources/network-profile-control.json', text);
});

it('writes the rail track fixture', () => {
  const M = terrain.data.reference.metresPerUnit;
  const routes: Record<string, number[][]> = {};
  for (const route of cityMap.transitRoutes) {
    const kind = route.kind as 'train' | 'tram',
      track = new RouteTrack(route.points, trackKindOf(kind)),
      bogie = VEHICLE_GEOMETRY[kind].bogieHalf / M;
    // 300 poses spread over the loop plus every deck/span node (where the old rule failed).
    const rows: number[][] = [];
    const at = (d: number) => {
      const p = track.pose(d, bogie);
      rows.push([d, ...p.pos, p.heading, p.pitch]);
    };
    for (let k = 0; k < 300; k++) at((track.length * (k + 0.37)) / 300);
    for (let i = 1; i < route.points.length; i++)
      if (terrain.bridgeHeight(route.points[i][0], route.points[i][2], route.points[i][1]) !== undefined)
        at(track.cumulative[i] + 0.013);
    routes[route.id] = rows;
  }
  const out = {
    note:
      'Rail vehicle section poses from the UI trackProfile.ts RouteTrack.pose(distance, bogieHalf): ' +
      '[distance, x, y, z, heading, pitch] in scene units/radians. Written by scripts/geo/infra-profile-control.test.ts.',
    revision: terrain.data.revision,
    railHeadMetres: RAIL_HEAD_METRES,
    vehicles: VEHICLE_GEOMETRY,
    routes,
  };
  const text = JSON.stringify(out) + '\n';
  writeFileSync('src/lib/geo/rail-track-control.json', text);
  writeFileSync('../norrkoping-simulator-backend/src/test/resources/rail-track-control.json', text);
});
