/**
 * Step 6 evidence cameras. Writes docs/step6/poses.json: absolute scene cameras ({position, target}),
 * so the baseline and the new build are captured from exactly the same place
 * (scripts/capture-reference-views.mjs POSES=…, scripts/step6/capture.mjs).
 *
 *   npx vitest run -c scripts/step6/vitest.config.ts scripts/step6/poses.test.ts   (PowerShell, C:\)
 *
 * Stadium poses are given in the arena frame (metres; +x towards the west stand, +z towards the north
 * stand, origin = centre of OSM pitch way/100955051), city poses in scene units. Heights are metres
 * above the rendered ground under the camera / target.
 */
import { test } from 'vitest';
import fs from 'node:fs';
import { terrain } from '../../src/lib/terrain';
import { cityMap, centerOf } from '../../src/lib/mapModel';

const M = terrain.data.reference.metresPerUnit;
const pitch = cityMap.areas.find((a) => a.id === 'way/100955051')!;
const ring = pitch.rings[0];
let longest = [ring[0], ring[1]];
for (let i = 1; i < ring.length; i++)
  if (
    Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]) >
    Math.hypot(longest[1][0] - longest[0][0], longest[1][1] - longest[0][1])
  )
    longest = [ring[i - 1], ring[i]];
const rotation = Math.atan2(longest[1][0] - longest[0][0], longest[1][1] - longest[0][1]);
const [cx, cz] = centerOf(pitch);
/** Arena metres → scene [x, z] (Object3D rotation.y = rotation about the pitch centre). */
const arena = (x: number, z: number): [number, number] => [
  cx + (x * Math.cos(rotation) + z * Math.sin(rotation)) / M,
  cz + (-x * Math.sin(rotation) + z * Math.cos(rotation)) / M,
];
const at = ([x, z]: [number, number], metres: number) =>
  [x, terrain.groundHeight(x, z) + metres / M, z].map((v) => Number(v.toFixed(4)));
const pose = (cam: [number, number], camH: number, tgt: [number, number], tgtH: number) => ({
  position: at(cam, camH),
  target: at(tgt, tgtH),
});

test('step 6 poses', () => {
  const poses = {
    // Idrottsparken (arena frame, metres).
    'stadium-elevated-se': pose(arena(-190, -250), 150, arena(0, 0), 0),
    'stadium-elevated-nw': pose(arena(230, 230), 160, arena(0, -5), 0),
    'stadium-exterior-west': pose(arena(100, -48), 5, arena(66, 4), 8),
    'stadium-exterior-ne': pose(arena(-150, 200), 28, arena(-20, 60), 8),
    'stadium-exterior-se': pose(arena(-140, -190), 22, arena(-30, -60), 8),
    'stadium-pitch-north': pose(arena(0, -76), 13, arena(0, 40), 2),
    'stadium-pitch-west': pose(arena(-52, -20), 10, arena(50, 5), 7),
    // Pilot 1: Kungsgatan, Skvallertorget → south (scene units).
    'kungsgatan-street': pose([-21.86, -6.4], 3, [-23.3, -11.5], 2),
    'kungsgatan-elevated': pose([-18.6, -4.2], 75, [-22.6, -9.0], 0),
    // Pilot 2: Strömparken, mapped lamps along footway 92429395 / 243821537.
    'stromparken-path': pose([-6.62, -3.7], 2.0, [-7.25, -5.7], 1.2),
    'stromparken-elevated': pose([-4.6, -2.4], 70, [-7.6, -5.6], 0),
  };
  const out = 'docs/step6/poses.json';
  fs.mkdirSync('docs/step6', { recursive: true });
  fs.writeFileSync(out, JSON.stringify(poses, null, 1) + '\n');
  console.log(
    JSON.stringify({
      rotationDeg: (rotation * 180) / Math.PI,
      centre: [cx, cz],
      poses: Object.keys(poses),
    }),
  );
});
