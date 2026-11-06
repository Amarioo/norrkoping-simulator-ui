// Aircraft Lights Phase E2: CPU cost of one frame's light update (11 lights, 1 aircraft, and the
// 4-aircraft capacity), measured outside the browser:
//   npx vitest bench --run scripts/aircraft-e2/update.bench.ts   (PowerShell, uppercase C:\ path)
import { bench, describe } from 'vitest';
import { Euler, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import {
  createAircraftLights,
  type AircraftLightPose,
} from '../../src/lib/lighting/aircraftLightsView';

const pose = (i: number): AircraftLightPose => ({
  id: 'NK-0' + i,
  phase: 'APPROACH',
  gear: true,
  matrix: new Matrix4().compose(
    new Vector3(100 + i * 10, 4, -40),
    new Quaternion().setFromEuler(new Euler(-0.05, 0.3 * i, 0.1, 'YXZ')),
    new Vector3(1 / 25, 1 / 25, 1 / 25),
  ),
});
const camera = new PerspectiveCamera(48, 1.5, 0.015, 2400);
camera.position.set(110, 6, -20);
camera.lookAt(100, 4, -40);
camera.updateMatrixWorld();

describe('aircraft lights update per frame', () => {
  for (const n of [1, 4]) {
    const lights = createAircraftLights();
    const poses = Array.from({ length: n }, (_, i) => pose(i));
    let t = 0;
    bench(`${n} aircraft (${n * 11} lights)`, () => {
      t += 0.05;
      lights.update(poses, t - 0.05, t, camera, 1, 'auto', 1440, null);
    });
  }
});
