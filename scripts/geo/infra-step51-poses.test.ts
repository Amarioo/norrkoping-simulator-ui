/**
 * Step 5.1: absolute camera poses for the before/after captures (scripts/capture-reference-views.mjs POSES=).
 * Each site: SWEREF E/N, the azimuth the camera looks FROM (degrees, 0 = north, clockwise), elevation angle
 * and distance in metres. The target is the rendered ground at the site; poses are written once and reused
 * for both builds, so both are captured from exactly the same place.
 * Run:  npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-step51-poses.test.ts
 */
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { terrain } from '../../src/lib/terrain';

const SITES: [string, number, number, number, number, number][] = [
  // name, E, N, from azimuth, elevation, distance
  ['pendeln-564464', 564464, 6494524, 340, 40, 55],
  ['pendeln-564926', 564926, 6494770, 330, 40, 55],
  ['pendeln-567768', 567768, 6496730, 250, 40, 55],
  ['pendeln-567524', 567524, 6497045, 200, 40, 55],
  ['fan-570420', 570420, 6499194, 200, 35, 35],
  ['crease-motorway-562963', 562963, 6492795, 120, 20, 60],
  ['crease-motorway-565281', 565281, 6494305, 300, 20, 60],
  ['crease-brannerigatan', 569776, 6495652, 200, 25, 45],
  ['crease-lundatorp', 566761, 6495778, 150, 22, 50],
  ['saltangsbron-corner', 568922, 6495383, 20, 22, 40],
  // Step 5.1 optimisation: patch boundaries and asphalt ownership close-ups
  ['boundary-gamla-ovagen', 568588, 6493273, 210, 30, 35],
  ['boundary-eksundsvagen', 563423, 6493362, 140, 30, 35],
  ['boundary-sandbyhovsgatan', 567540, 6496865, 230, 30, 40],
  ['ownership-ektorpsgatan', 568650, 6493350, 180, 45, 45],
  ['ownership-closeup', 568700, 6493320, 200, 25, 18],
  // ghost outline 1 cm beside a member outline: a 2.5 m micro-wall until GHOST_CLEAR
  ['microwall-570589', 570589, 6493307, 180, 25, 30],
];
it('writes the Step 5.1 camera poses', () => {
  const M = terrain.data.reference.metresPerUnit;
  const step5 = JSON.parse(readFileSync('docs/step5/poses.json', 'utf8'));
  const out: Record<string, { position: number[]; target: number[] }> = {};
  for (const name of ['hamngatan-a-top', 'hamngatan-b-from-river', 'hamngatan-c-low-east', 'hamngatan-d-from-se', 'jarngatan-underpass', 'jarngatan-e4-side', 'tvastugubacken'])
    if (step5[name]) out[name] = step5[name];
  for (const [name, E, N, az, el, dist] of SITES) {
    const [x, z] = terrain.fromSweref(E, N),
      y = terrain.surfaceHeight(x, z);
    // Scene x = east, z = south (grid convergence is applied by fromSweref; the offset uses the same frame).
    const a = (az * Math.PI) / 180,
      e = (el * Math.PI) / 180,
      h = (dist * Math.cos(e)) / M;
    const [px, pz] = terrain.fromSweref(E + Math.sin(a) * h * M, N + Math.cos(a) * h * M);
    out[name] = {
      position: [+px.toFixed(4), +(y + (dist * Math.sin(e)) / M).toFixed(4), +pz.toFixed(4)],
      target: [+x.toFixed(4), +y.toFixed(4), +z.toFixed(4)],
    };
  }
  writeFileSync(process.env.OUT ?? 'docs/step51/poses.json', JSON.stringify(out, null, 1));
});
