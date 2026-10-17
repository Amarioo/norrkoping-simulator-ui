import { ExtrudeGeometry, Shape, TorusGeometry, PlaneGeometry, RepeatWrapping } from 'three';
import type { Group } from 'three';
import { PlaceBuilder } from './placeBuilder';
import data from './data/city-bridges.json';
import ingelsta from './data/ingelsta-bridge.json';
import levels from './data/terrain-levels.json';

/** Footprints are OSM; construction details and heights are visual approximations. */
export function createCityBridges() {
  const b = new PlaceBuilder();
  const stone = b.canvas(512, 256, (c) => {
    c.fillStyle = '#9c8b80';
    c.fillRect(0, 0, 512, 256);
    for (let row = 0; row < 4; row++)
      for (let col = -1; col < 5; col++) {
        const x = col * 128 + (row % 2) * 64;
        c.fillStyle = ['#a99b90', '#a19287', '#b0a096', '#95867c'][(row + col + 8) % 4];
        c.fillRect(x + 2, row * 64 + 2, 124, 60);
      }
  });
  stone.map!.wrapS = stone.map!.wrapT = RepeatWrapping;
  stone.map!.repeat.set(2, 8);
  const lamp = b.mat('#eee1b7');
  lamp.emissive.set('#b89d62');
  lamp.emissiveIntensity = 0.2;
  function rail(g: Group, length: number, z: number, y: number, style: string) {
    const color = style === 'stone' ? '#303e40' : style === 'wood' ? '#77705d' : '#8e9b9c';
    const h = style === 'wood' ? 0.047 : 0.052,
      panels = Math.max(1, Math.ceil(length / 0.13)),
      step = length / panels;
    for (const level of [0.009, h])
      b.beam(g, [-length / 2, y + level, z], [length / 2, y + level, z], 0.0024, color);
    for (let i = 0; i <= panels; i++)
      b.pole(g, -length / 2 + i * step, y + h / 2, z, 0.0033, h, color);
    for (let i = 0; i < panels; i++) {
      const x = -length / 2 + i * step;
      if (style === 'circle') {
        const ring = b.mesh(
          g,
          new TorusGeometry(0.012, 0.0015, 5, 16),
          b.mat(color),
          x + step / 2,
          y + h / 2,
          z,
        );
        ring.rotation.y = 0;
        for (const s of [-1, 1])
          for (const t of [-1, 1])
            b.beam(
              g,
              [x + step / 2 + s * 0.014, y + h / 2 + t * 0.009, z],
              [x + step / 2 + (s * step) / 2, y + (t > 0 ? h : 0), z],
              0.0012,
              color,
            );
      } else if (style === 'wood') {
        b.beam(g, [x, y + 0.009, z], [x + step, y + h, z], 0.003, color);
      } else {
        for (let k = 1; k < 5; k++)
          b.pole(g, x + (step * k) / 5, y + h / 2, z, 0.0012, h - 0.008, color);
      }
    }
  }
  for (const bridge of data.bridges) {
    const { length: L, width: W, deckY: y, style } = bridge;
    const g = b.local(bridge.center, bridge.rotation);
    const cr = Math.cos(bridge.rotation),
      sr = Math.sin(bridge.rotation);
    const localRing = bridge.ring.map(([x, z]) => {
      const dx = x - bridge.center[0],
        dz = z - bridge.center[1];
      return [cr * dx - sr * dz, sr * dx + cr * dz];
    });
    function edgesAt(x: number) {
      const cuts: number[] = [];
      for (let i = 1; i < localRing.length; i++) {
        const a = localRing[i - 1],
          c = localRing[i];
        if ((a[0] <= x && c[0] > x) || (c[0] <= x && a[0] > x))
          cuts.push(a[1] + ((x - a[0]) / (c[0] - a[0])) * (c[1] - a[1]));
      }
      return cuts.length >= 2 ? [Math.min(...cuts), Math.max(...cuts)] : [-W / 2, W / 2];
    }
    const shaped = style === 'city' || style === 'concrete';
    // Keep the existing road/spoor surfaces and traffic heights above this structural deck.
    b.polygon(bridge.ring, y - 0.035, style === 'wood' ? '#8d8470' : '#a4a49a', 0.028);
    // Solid land abutments connect each end to the bank instead of leaving an open gap.
    for (const side of [-1, 1]) {
      const x = side * (L / 2 - 0.025),
        [left, right] = edgesAt(x);
      b.box(
        g,
        x,
        (levels.waterbed + y - 0.01) / 2,
        (left + right) / 2,
        0.075,
        y - 0.01 - levels.waterbed,
        right - left,
        style === 'stone' ? stone : '#96978b',
      );
    }
    if (style === 'stone') {
      const spring = levels.water - 0.008;
      const count = 3,
        span = L / count,
        opening = span - 0.11;
      for (let i = 0; i < count; i++) {
        const x = -L / 2 + span * (i + 0.5),
          s = new Shape();
        s.moveTo(-span / 2, spring);
        s.lineTo(-span / 2, y - 0.035);
        s.lineTo(span / 2, y - 0.035);
        s.lineTo(span / 2, spring);
        s.lineTo(opening / 2, spring);
        for (let k = 0; k <= 32; k++) {
          const t = (k / 32) * Math.PI;
          s.lineTo((Math.cos(t) * opening) / 2, spring + Math.sin(t) * 0.205);
        }
        s.lineTo(-span / 2, spring);
        b.mesh(
          g,
          new ExtrudeGeometry(s, { depth: W, bevelEnabled: false, curveSegments: 24 }),
          stone,
          x,
          0,
          -W / 2,
        );
        // Individually jointed arch stones outline the three actual openings.
        for (const side of [-1, 1])
          for (let k = 0; k < 28; k++) {
            const a = (k / 28) * Math.PI,
              c = ((k + 1) / 28) * Math.PI,
              shape = new Shape();
            shape.moveTo(x + (Math.cos(a) * opening) / 2, spring + Math.sin(a) * 0.205);
            shape.lineTo(x + (Math.cos(c) * opening) / 2, spring + Math.sin(c) * 0.205);
            shape.lineTo(x + Math.cos(c) * (opening / 2 + 0.018), spring + Math.sin(c) * 0.235);
            shape.lineTo(x + Math.cos(a) * (opening / 2 + 0.018), spring + Math.sin(a) * 0.235);
            shape.closePath();
            b.mesh(
              g,
              new ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false }),
              b.mat(k % 2 ? '#95857b' : '#ab9b8e'),
              0,
              0,
              (side * W) / 2 - 0.003,
            );
          }
      }
      for (const side of [-1, 1]) {
        b.box(g, 0, y - 0.015, (side * W) / 2, L, 0.022, 0.028, '#a79c8e');
        rail(g, L, side * (W / 2 - 0.014), y, 'stone');
        for (let i = 0; i <= 3; i++) {
          const x = -L / 2 + (i * L) / 3,
            z = side * (W / 2 - 0.012);
          b.box(g, x, y + 0.023, z, 0.075, 0.05, 0.065, stone);
          b.box(g, x, y + 0.054, z, 0.086, 0.015, 0.075, '#b4a99a');
          b.pole(g, x, y + 0.13, z, 0.005, 0.16, '#354047');
          for (const dx of [-0.036, 0.036]) {
            b.beam(g, [x, y + 0.18, z], [x + dx, y + 0.21, z], 0.003, '#354047');
            b.box(g, x + dx, y + 0.225, z, 0.024, 0.035, 0.024, lamp);
            b.roof(g, x + dx, y + 0.243, z, 0.034, 0.034, 0.022, '#354047');
            b.pole(g, x + dx, y + 0.269, z, 0.002, 0.015, '#354047');
          }
        }
      }
    } else {
      const spans = style === 'concrete' ? 4 : style === 'city' ? 3 : 2;
      for (let i = 1; i < spans; i++) {
        const x = -L / 2 + (L * i) / spans;
        const [left, right] = edgesAt(x),
          crossWidth = right - left;
        for (const z of W > 0.8 ? [left + crossWidth * 0.25, left + crossWidth * 0.75] : [0]) {
          b.pole(
            g,
            x,
            (y - 0.05 + levels.waterbed) / 2,
            z,
            style === 'concrete' ? 0.045 : 0.028,
            y - 0.05 - levels.waterbed,
            '#90938b',
          );
          b.box(g, x, y - 0.054, z, 0.09, 0.045, Math.min(W, 0.46), '#989b91');
        }
      }
      if (shaped) {
        // Follow the surveyed, tapered deck boundary rather than a bounding rectangle over water.
        for (let i = 1; i < bridge.ring.length; i++) {
          const a = bridge.ring[i - 1],
            c = bridge.ring[i],
            dx = c[0] - a[0],
            dz = c[1] - a[1],
            len = Math.hypot(dx, dz);
          if (len < 0.04 || Math.abs((dx * cr - dz * sr) / len) < 0.65) continue;
          const edge = b.local([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], -Math.atan2(dz, dx));
          rail(edge, len, 0, y, style);
          b.box(edge, 0, y - 0.025, 0, len, 0.035, 0.024, '#979e96');
        }
      } else
        for (const side of [-1, 1]) {
          b.box(
            g,
            0,
            y - 0.045,
            side * W * 0.36,
            L,
            0.045,
            0.035,
            style === 'wood' ? '#655e50' : '#808e87',
          );
          rail(g, L, side * (W / 2 - 0.008), y, style);
        }
      if (style === 'wood') {
        for (let x = -L / 2; x < L / 2; x += 0.025)
          b.box(g, x, y - 0.004, 0, 0.023, 0.006, W - 0.012, '#9a9078');
      }
      if (style === 'city') {
        for (const side of [-1, 1])
          for (let i = 0; i < 6; i++) {
            const x = -L / 2 + 0.15 + (i * (L - 0.3)) / 5,
              z = edgesAt(x)[side < 0 ? 0 : 1] - side * 0.025;
            b.pole(g, x, y + 0.19, z, 0.003, 0.38, '#ccd1c8');
            const flag = b.canvas(120, 80, (c) => {
              c.fillStyle = '#246296';
              c.fillRect(0, 0, 120, 80);
              c.fillStyle = '#edc448';
              c.fillRect(34, 0, 13, 80);
              c.fillRect(0, 32, 120, 13);
            });
            b.mesh(g, new PlaneGeometry(0.095, 0.063), flag, x + 0.047, y + 0.335, z);
          }
        // Tram contact wire across the span and transverse suspension wires.
        for (const z of [-0.07, 0.07])
          b.beam(g, [-L / 2, y + 0.23, z], [L / 2, y + 0.23, z], 0.0009, '#515a59');
        for (const x of [-L * 0.32, 0, L * 0.32])
          b.beam(g, [x, y + 0.25, edgesAt(x)[0]], [x, y + 0.25, edgesAt(x)[1]], 0.001, '#596361');
      }
      if (style === 'concrete') {
        // Open lattice lighting masts and slender vertical safety railing.
        for (const x of [-L * 0.35, L * 0.35]) {
          for (const z of [-0.016, 0.016]) b.pole(g, x, y + 0.23, z, 0.0025, 0.46, '#84928e');
          for (let h = 0.02; h < 0.46; h += 0.04)
            b.beam(g, [x, y + h, -0.016], [x, y + h + 0.04, 0.016], 0.0015, '#84928e');
          b.beam(g, [x, y + 0.46, -0.1], [x, y + 0.46, 0.1], 0.003, '#788682');
          for (const z of [-0.1, 0.1]) b.box(g, x, y + 0.458, z, 0.026, 0.012, 0.045, '#bfc3b4');
        }
      }
    }
  }
  const { a, c } = { a: ingelsta.a, c: ingelsta.b };
  const length = Math.hypot(c[0] - a[0], c[1] - a[1]),
    deck = ingelsta.deck,
    width = ingelsta.width;
  const viaduct = b.local(
    [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2],
    Math.atan2(c[0] - a[0], c[1] - a[1]),
  );
  b.box(viaduct, 0, deck - 0.025, 0, width, 0.05, length, '#92988f');
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.022);
    b.box(viaduct, x, deck + 0.008, 0, 0.055, 0.016, length, '#b7b9ac');
    b.beam(viaduct, [x, deck + 0.06, -length / 2], [x, deck + 0.06, length / 2], 0.0025, '#63716b');
    b.beam(
      viaduct,
      [x, deck + 0.021, -length / 2],
      [x, deck + 0.021, length / 2],
      0.002,
      '#63716b',
    );
    for (let z = -length / 2; z <= length / 2; z += 0.07)
      b.pole(viaduct, x, deck + 0.04, z, 0.0015, 0.052, '#63716b');
    // Solid abutments outside the rail corridor, with wing walls retaining the approaches.
    b.box(
      viaduct,
      0,
      (deck - 0.05 - 0.24) / 2,
      side * (length / 2 - 0.04),
      width,
      deck - 0.05 + 0.24,
      0.09,
      '#8b9289',
    );
    for (const x of [-width / 2, width / 2])
      b.box(
        viaduct,
        x,
        (deck - 0.24) / 2,
        side * (length / 2 + 0.13),
        0.025,
        deck + 0.24,
        0.34,
        '#8b9289',
      );
  }
  return b.finish();
}
