import { PlaneGeometry } from 'three';
import { PlaceBuilder } from './placeBuilder';
import { cityMap } from './mapModel';

export const RIVERFRONT_IDS = ['way/92413289', 'way/93313347'];
/** Surveyed footprints with facade proportions interpreted from the user's street photographs. */
export function createRiverfrontDetails() {
  const b = new PlaceBuilder();
  function letters(
    parent: ReturnType<PlaceBuilder['local']>,
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    rotation: number,
    color: string,
  ) {
    const mat = b.canvas(512, 128, (c) => {
      c.clearRect(0, 0, 512, 128);
      c.fillStyle = color;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = 'bold 112px Arial';
      c.fillText(text, 256, 64, 495);
    });
    mat.transparent = true;
    mat.alphaTest = 0.2;
    const mesh = b.mesh(parent, new PlaneGeometry(w, h), mat, x, y, z);
    mesh.rotation.y = rotation;
  }
  const hotel = cityMap.buildings.find((b) => b.id === RIVERFRONT_IDS[0])!;
  const [a, c, d] = hotel.rings[0];
  const width = Math.hypot(c[0] - a[0], c[1] - a[1]),
    depth = Math.hypot(d[0] - c[0], d[1] - c[1]);
  const g = b.local(
    [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2],
    -Math.atan2(c[1] - a[1], c[0] - a[0]),
    0.075,
  );
  b.box(g, 0, 0.39, 0, width, 0.78, depth, '#cb9668');
  b.box(g, 0, 0.805, 0, width + 0.025, 0.04, depth + 0.025, '#68645a');
  b.roof(g, 0, 0.83, 0, width - 0.05, depth - 0.05, 0.07, '#4b4d4c');
  const arch = b.canvas(128, 192, (ctx) => {
    ctx.clearRect(0, 0, 128, 192);
    ctx.fillStyle = '#77786b';
    ctx.beginPath();
    ctx.moveTo(5, 192);
    ctx.lineTo(5, 65);
    ctx.arc(64, 65, 59, Math.PI, 0);
    ctx.lineTo(123, 192);
    ctx.fill();
    ctx.fillStyle = '#253839';
    ctx.beginPath();
    ctx.moveTo(14, 186);
    ctx.lineTo(14, 65);
    ctx.arc(64, 65, 50, Math.PI, 0);
    ctx.lineTo(114, 186);
    ctx.fill();
    ctx.strokeStyle = '#ad9980';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(64, 15);
    ctx.lineTo(64, 190);
    ctx.moveTo(10, 90);
    ctx.lineTo(118, 90);
    ctx.stroke();
  });
  arch.transparent = true;
  arch.alphaTest = 0.3;
  for (const [rotation, length, z] of [
    [0, width, depth / 2],
    [Math.PI, width, depth / 2],
    [Math.PI / 2, depth, width / 2],
    [-Math.PI / 2, depth, width / 2],
  ]) {
    const face = b.local([g.position.x, g.position.z], g.rotation.y + rotation, 0.075);
    const n = Math.max(5, Math.round(length / 0.2));
    for (const y of [0.035, 0.19, 0.69, 0.755, 0.79])
      b.box(face, 0, y, z + 0.006, length + 0.02, 0.012, 0.022, '#a5a08b');
    for (let i = 0; i < n; i++) {
      const x = -length / 2 + ((i + 0.5) * length) / n;
      b.mesh(face, new PlaneGeometry(0.115, 0.15), arch, x, 0.105, z + 0.012);
      for (let floor = 1; floor <= 4; floor++) {
        const y = 0.2 + floor * 0.112;
        b.box(face, x, y, z + 0.006, 0.071, 0.088, 0.014, '#9a7d60');
        b.box(face, x, y, z + 0.015, 0.051, 0.075, 0.009, '#354345');
        b.box(face, x, y, z + 0.021, 0.004, 0.076, 0.004, '#c8bca0');
        b.box(face, x, y - 0.049, z + 0.018, 0.086, 0.007, 0.025, '#b6ab91');
        if (i % 3 === 1 && floor < 4) {
          b.box(face, x, y - 0.049, z + 0.045, 0.13, 0.009, 0.08, '#79766b');
          b.box(face, x, y - 0.022, z + 0.083, 0.13, 0.003, 0.004, '#3e4240');
          for (let k = 0; k < 6; k++)
            b.pole(face, x - 0.06 + k * 0.024, y - 0.035, z + 0.083, 0.0015, 0.027, '#414642');
        }
      }
      b.box(face, x, 0.74, z + 0.013, 0.057, 0.037, 0.012, '#374548');
    }
  }
  // Corner attic rises above the roof, carrying the two-line lettering from the reference.
  b.box(g, -width / 2 + 0.27, 0.855, -depth / 2 + 0.15, 0.54, 0.16, 0.3, '#c99469');
  for (const y of [0.79, 0.91, 0.935])
    b.box(g, -width / 2 + 0.27, y, -depth / 2 + 0.15, 0.57, 0.012, 0.33, '#9e9986');
  letters(
    g,
    'GRAND',
    -width / 2 + 0.27,
    0.872,
    -depth / 2 - 0.019,
    0.46,
    0.073,
    Math.PI,
    '#f1eee0',
  );
  letters(
    g,
    'HOTEL',
    -width / 2 + 0.27,
    0.812,
    -depth / 2 - 0.019,
    0.44,
    0.068,
    Math.PI,
    '#f1eee0',
  );
  b.pole(g, -width / 2 + 0.56, 1.03, -depth / 2 + 0.16, 0.003, 0.25, '#ddd9c6');
  b.box(g, -width / 2 + 0.62, 1.12, -depth / 2 + 0.16, 0.12, 0.07, 0.002, '#8e3e40');

  const holmen = cityMap.buildings.find((b) => b.id === RIVERFRONT_IDS[1])!;
  const ring = holmen.rings[0],
    h = holmen.height;
  b.polygon(ring, 0.025, '#d3d0c4', h);
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1],
      c = ring[i],
      len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const face = b.local(
      [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2],
      -Math.atan2(c[1] - a[1], c[0] - a[0]),
    );
    for (let floor = 0; floor < 8; floor++) {
      const y = 0.105 + floor * 0.105;
      b.box(face, 0, y, 0, len + 0.006, 0.047, 0.012, '#3a484b');
      for (let x = -len / 2 + 0.035; x < len / 2; x += 0.045)
        b.box(face, x, y, 0, 0.002, 0.049, 0.016, '#b8b9ac');
      b.box(face, 0, y + 0.046, 0, len + 0.012, 0.012, 0.025, '#e0ddd0');
    }
  }
  // River-facing facade of the mapped office block, facing Saltängsbron.
  const ha = ring[1],
    hc = ring[2],
    len = Math.hypot(hc[0] - ha[0], hc[1] - ha[1]);
  const sign = b.local(
    [(ha[0] + hc[0]) / 2, (ha[1] + hc[1]) / 2],
    -Math.atan2(hc[1] - ha[1], hc[0] - ha[0]),
  );
  letters(sign, 'HOLMEN', 0, 0.944, -0.014, len * 0.9, 0.09, Math.PI, '#17487b');
  const xs = ring.map((p) => p[0]),
    zs = ring.map((p) => p[1]);
  const roof = b.local([
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...zs) + Math.max(...zs)) / 2,
  ]);
  b.box(roof, 0, h + 0.06, 0, 0.34, 0.07, 0.25, '#616865');
  return b.finish();
}
