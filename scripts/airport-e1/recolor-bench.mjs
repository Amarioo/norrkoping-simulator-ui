// Airport Lighting Phase E1: CPU cost of recolouring all lights for a new camera position (what
// runwayLightsView.ts does every frame while the camera moves): the same loop over the layout with
// faceSeen(), for camera positions along a path over the airport. Node/V8, same engine as the browser.
//   node scripts/airport-e1/recolor-bench.mjs
import fs from 'node:fs';
import { esspRunwayLights, faceSeen, LIGHT_RGB } from '../../src/lib/airport/runwayLights.ts';

const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const lights = esspRunwayLights(map.airways, 25);
const y = lights.map((l) => 0.4 + l.heightM / 25);
const colors = new Float32Array(lights.length * 3);
const recolor = (cx, cy, cz, inUse) => {
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    const dx = cx - l.position[0],
      dz = cz - l.position[1];
    const h = Math.hypot(dx, dz) || 1e-6;
    const view = [dx / h, dz / h];
    const elevation = (Math.atan2(cy - y[i], h) * 180) / Math.PI;
    let r = 0,
      g = 0,
      b = 0;
    for (const face of l.faces) {
      if (face.inUse !== 'both' && face.inUse !== inUse) continue;
      const [w, c] = faceSeen(face, view, elevation);
      if (w <= 0) continue;
      const rgb = LIGHT_RGB[c];
      r += rgb[0] * w;
      g += rgb[1] * w;
      b += rgb[2] * w;
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
};
const N = 20000;
for (let k = 0; k < 2000; k++) recolor(150 + Math.sin(k) * 60, 3, 14 + Math.cos(k) * 30, '27'); // warm-up
const t0 = performance.now();
for (let k = 0; k < N; k++)
  recolor(150 + Math.sin(k) * 60, 3, 14 + Math.cos(k) * 30, k % 2 ? '27' : '09');
const ms = (performance.now() - t0) / N;
console.log(JSON.stringify({ lights: lights.length, recolourMsPerFrame: +ms.toFixed(4) }));
