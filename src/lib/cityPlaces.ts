import { Group, PlaneGeometry } from 'three';
import { PlaceBuilder } from './placeBuilder';
import data from './data/city-places.json';
import training from './data/training-pitch.json';
import { RIVERFRONT_IDS } from './riverfrontDetails';
import { cityMap } from './mapModel';
export const DETAILED_BUILDING_IDS = new Set([
  ...RIVERFRONT_IDS,
  'way/102030313',
  'way/101513457',
  'way/91908192', // Teknikhallen (IFK Performance Center)
  'way/91908705', // Gamla tennishallen
  ...data.roofs.map((r) => 'way/' + r.id),
]);

export function isDetailPlantingClear(point: number[]) {
  const station = data.buildings.find((p) => p.id === 102030313)!;
  const a = station.heading - Math.PI / 2,
    dx = point[0] - station.center[0],
    dz = point[1] - station.center[1];
  const x = dx * Math.cos(a) - dz * Math.sin(a),
    z = dx * Math.sin(a) + dz * Math.cos(a);
  return !(Math.abs(x) < station.length / 2 + 0.05 && z > -0.5 && z < 0.95);
}

export function createCityPlaces() {
  const b = new PlaceBuilder();
  // Mapped platform outlines take precedence over estimated rectangular furniture placement.
  for (const p of data.platforms) {
    const rail = p.kind === 'rail',
      w = Math.max(0.075, p.width),
      l = p.length;
    const g = b.local(p.center, p.heading, 0.083);
    if (p.polygon) b.polygon(p.ring, 0.077, '#b9b7ab', rail ? 0.022 : 0.014);
    else b.box(g, 0, 0, 0, w, 0.02, l, '#b9b7ab');
    for (const side of [-1, 1]) {
      b.box(g, side * (w / 2 - 0.015), 0.018, 0, 0.012, 0.003, l * 0.94, '#eee9d0');
      // Tactile paving uses a continuous pale edge, not a fictitious zebra crossing.
      b.box(g, side * (w / 2 - 0.035), 0.017, 0, 0.018, 0.003, l * 0.9, '#d6cba9');
    }
    const furnitureX = rail ? 0 : Math.max(-w * 0.15, w / 2 - 0.042),
      shelterLength = Math.min(rail ? 0.42 : 0.22, l * 0.4);
    if (p.shelter) {
      b.box(g, furnitureX, 0.063, 0, 0.072, 0.088, shelterLength, b.glass);
      // Clear panes framed by dark posts, with an arched metal canopy like the Ljura reference.
      for (const z of [-shelterLength / 2, shelterLength / 2])
        for (const x of [-0.04, 0.04]) b.pole(g, furnitureX + x, 0.064, z, 0.003, 0.105);
      for (let i = 0; i < 8; i++) {
        const x = -0.055 + ((i + 0.5) * 0.11) / 8,
          y = 0.119 + 0.012 * Math.sqrt(Math.max(0, 1 - (x / 0.058) ** 2));
        const roof = b.box(g, furnitureX + x, y, 0, 0.015, 0.003, shelterLength + 0.035, '#485154');
        roof.rotation.z = -x * 0.8;
      }
      b.box(g, furnitureX + 0.037, 0.07, 0, 0.002, 0.072, shelterLength, '#667f83');
    }
    if (p.bench) {
      b.box(g, furnitureX, 0.04, 0.015, 0.035, 0.012, 0.12, '#8a7964');
      b.box(g, furnitureX + 0.018, 0.056, 0.015, 0.006, 0.028, 0.12, '#8a7964');
      for (const z of [-0.035, 0.065])
        b.box(g, furnitureX, 0.025, z, 0.025, 0.025, 0.006, '#3b4345');
    }
    const sz = Math.min(l * 0.34, 0.55);
    b.pole(g, furnitureX, 0.1, sz, 0.004, 0.2);
    b.sign(
      g,
      rail ? 'SPÅR ' + p.ref : p.name.toLocaleUpperCase('sv-SE'),
      furnitureX,
      0.205,
      sz + 0.006,
      rail ? 0.22 : 0.24,
      0.035,
    );
    b.sign(
      g,
      rail
        ? 'NORRKÖPING C'
        : cityMap.transitRoutes
            .filter((r) => r.kind === 'tram' && r.stops.some((s) => s.name === p.name))
            .map((r) => r.name.replace('Spårvagn ', 'Linje '))
            .join(' / ') || 'Spårvagn',
      furnitureX,
      0.162,
      sz + 0.009,
      0.22,
      0.04,
      0,
      '#182024',
      '#ffbd35',
    );
    b.box(g, furnitureX, 0.164, sz, 0.23, 0.05, 0.014, '#414b4e');
    if (!rail) {
      // Keep overhead equipment near the platform; supports sit outside the platform edge.
      for (const z of [-l * 0.42, l * 0.42]) {
        b.pole(g, w / 2 + 0.025, 0.15, z, 0.003, 0.3);
        b.beam(g, [w / 2 + 0.025, 0.295, z], [-w / 2 - 0.12, 0.295, z], 0.0015, '#4a5050');
      }
      b.beam(
        g,
        [-w / 2 - 0.07, 0.29, -l * 0.48],
        [-w / 2 - 0.07, 0.29, l * 0.48],
        0.0008,
        '#525653',
      );
    }
  }
  // Norrköping Central: pale masonry, rusticated base, arched windows, slate roofs and central clock pavilion.
  const station = data.buildings.find((x) => x.id === 102030313)!;
  const sg = b.local(station.center, station.heading - Math.PI / 2, 0.06),
    sw = station.length;
  const facade = b.canvas(1536, 512, (c) => {
    c.fillStyle = '#e9dfc8';
    c.fillRect(0, 0, 1536, 512);
    c.fillStyle = '#bcae9a';
    c.fillRect(0, 462, 1536, 50);
    for (const y of [240, 260, 450]) {
      c.fillStyle = '#f6edda';
      c.fillRect(0, y, 1536, 10);
    }
    for (let i = 0; i < 19; i++) {
      const x = i * 80 + 20;
      c.fillStyle = '#a78e7e';
      c.fillRect(x - 5, 53, 48, 125);
      c.fillStyle = '#334750';
      c.fillRect(x, 58, 38, 116);
      c.beginPath();
      c.roundRect(x - 5, 287, 48, 145, [24, 24, 0, 0]);
      c.fillStyle = '#a58c79';
      c.fill();
      c.beginPath();
      c.roundRect(x, 293, 38, 132, [19, 19, 0, 0]);
      c.fillStyle = '#35464d';
      c.fill();
      c.fillStyle = '#d9c9b3';
      for (const yy of [105, 345]) c.fillRect(x, yy, 38, 4);
      c.fillRect(x + 18, 58, 3, 374);
    }
  });
  b.box(sg, 0, 0.19, 0, sw, 0.38, 0.53, '#e7ddc9');
  for (const side of [-1, 1]) {
    const face = b.mesh(sg, new PlaneGeometry(sw, 0.36), facade, 0, 0.2, side * 0.269);
    face.rotation.y = side < 0 ? Math.PI : 0;
  }
  b.roof(sg, 0, 0.4, 0, sw + 0.07, 0.62, 0.16);
  for (const x of [-sw * 0.42, 0, sw * 0.42]) {
    const central = x === 0,
      w = central ? 0.57 : 0.52,
      h = central ? 0.48 : 0.42,
      d = central ? 0.78 : 0.72;
    b.box(sg, x, h / 2, 0.055, w, h, d, '#e8dfcc');
    b.roof(sg, x, h, 0.055, w + 0.04, d + 0.06, central ? 0.21 : 0.16);
    for (const xx of [-0.16, 0, 0.16]) {
      b.box(sg, x + xx, 0.14, 0.055 + d / 2 + 0.004, 0.095, 0.19, 0.008, '#35454a');
      b.box(sg, x + xx, 0.34, 0.055 + d / 2 + 0.004, 0.095, 0.12, 0.008, '#35454a');
    }
    for (const side of [-1, 1])
      b.box(sg, x + side * w * 0.46, h / 2, 0.055 + d / 2, 0.032, h, 0.025, '#f5edda');
  }
  b.box(sg, 0, 0.68, 0.055, 0.18, 0.2, 0.18, '#e8dfcc');
  b.roof(sg, 0, 0.79, 0.055, 0.23, 0.23, 0.13);
  const clock = b.canvas(256, 256, (c) => {
    c.fillStyle = '#eadfc1';
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#414746';
    c.lineWidth = 9;
    c.beginPath();
    c.arc(128, 128, 104, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      c.beginPath();
      c.moveTo(128 + Math.sin(a) * 83, 128 + Math.cos(a) * 83);
      c.lineTo(128 + Math.sin(a) * 96, 128 + Math.cos(a) * 96);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(83, 80);
    c.lineTo(128, 128);
    c.lineTo(183, 105);
    c.stroke();
  });
  b.mesh(sg, new PlaneGeometry(0.14, 0.14), clock, 0, 0.69, 0.148);
  b.sign(sg, 'NORRKÖPING CENTRAL', 0, 0.275, 0.463, 0.5, 0.04, 0, '#e8dfcc', '#3c4648');
  for (const r of data.roofs) {
    const g = b.local(r.center, r.heading, 0.08);
    b.box(g, 0, 0.19, 0, r.width, 0.018, r.length, '#545c60');
    for (let z = -r.length / 2 + 0.15; z < r.length / 2; z += 0.42) {
      b.pole(g, 0, 0.09, z, 0.005, 0.18, '#748487');
      b.beam(g, [-r.width / 2, 0.182, z], [r.width / 2, 0.182, z], 0.004, '#a4aaa5');
    }
  }
  // Airport terminal, blue glazed entrance, low wings, apron parking guidance and landside parking.
  const terminal = data.buildings.find((x) => x.id === 101513457)!;
  const ag = b.local(terminal.center, terminal.heading + Math.PI / 2, 0.065),
    aw = terminal.length;
  b.box(ag, 0, 0.135, 0, aw, 0.27, 1.05, '#aebfc1');
  b.box(ag, 0, 0.285, 0, aw + 0.04, 0.035, 1.1, '#3d484d');
  for (const side of [-1, 1]) {
    b.box(ag, 0, 0.16, side * 0.532, aw - 0.12, 0.17, 0.015, '#4f8d9d');
    for (let x = -aw / 2 + 0.12; x < aw / 2; x += 0.14)
      b.box(ag, x, 0.16, side * 0.55, 0.012, 0.18, 0.02, '#b6d0d5');
  }
  b.box(ag, -aw * 0.38, 0.13, -0.62, 0.58, 0.26, 0.4, '#bcc8c8');
  b.box(ag, aw * 0.39, 0.11, 0.05, 0.75, 0.22, 1.4, '#a4b8ba');
  for (const x of [-1.8, -0.7, 0.4, 1.5]) {
    b.box(ag, x, 0.32, 0, 0.38, 0.09, 0.36, '#65747a');
    for (let z = -0.13; z < 0.14; z += 0.04) b.box(ag, x, 0.37, z, 0.33, 0.004, 0.012, '#8d9999');
  }
  b.box(ag, 0, 0.22, 0.67, 1.65, 0.025, 0.3, '#416976');
  for (const x of [-0.75, 0.75]) b.pole(ag, x, 0.11, 0.77, 0.008, 0.22, '#bdc8c8');
  b.sign(ag, 'NORRKÖPING AIRPORT', 0, 0.235, 0.81, 1.5, 0.1, 0, '#426d7d', '#ffffff');
  b.sign(ag, 'NORRKÖPINGS FLYGPLATS', 0, 0.28, -0.56, 2, 0.1, Math.PI, '#3d484d', '#ffffff');
  // Compact operations tower beside the terminal, as shown at the apron side of the reference.
  b.box(ag, -aw * 0.46, 0.22, -0.68, 0.22, 0.44, 0.24, '#bac3c0');
  b.box(ag, -aw * 0.46, 0.47, -0.68, 0.3, 0.1, 0.29, '#3b6373');
  b.box(ag, -aw * 0.46, 0.535, -0.68, 0.34, 0.018, 0.33, '#414b50');
  b.pole(ag, -aw * 0.46, 0.65, -0.68, 0.003, 0.23, '#a8b4b7');
  for (let stand = 0; stand < 3; stand++) {
    const x = -1.65 + stand * 1.5;
    b.box(ag, x, 0.018, -2.2, 0.008, 0.003, 1.7, '#e3c268');
    b.box(ag, x, 0.018, -1.42, 0.42, 0.003, 0.01, '#e3c268');
    const g = new Group();
    g.position.set(x, 0.022, -2.5);
    ag.add(g);
    const mark = b.canvas(128, 128, (c) => {
      c.fillStyle = '#929a9b';
      c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#ebd183';
      c.font = 'bold 85px sans-serif';
      c.textAlign = 'center';
      c.fillText(String(stand + 1), 64, 94);
    });
    b.surface(g, 0.18, 0.18, 0, mark);
  }
  b.box(ag, 0, -0.018, 2.13, 5.0, 0.008, 2.6, '#8c9492');
  for (const row of [1.5, 2.15, 3.0])
    for (let x = -2.2; x < 2.4; x += 0.12) {
      b.box(ag, x, 0.02, row, 0.004, 0.003, 0.23, '#e8e6d4');
      if (Math.round(x * 100) % 3 === 0) {
        b.box(
          ag,
          x + 0.06,
          0.045,
          row,
          0.065,
          0.05,
          0.15,
          ['#43555e', '#9d9e95', '#6e3e37'][Math.abs(Math.round(x * 100)) % 3],
        );
        b.box(ag, x + 0.06, 0.079, row, 0.054, 0.022, 0.07, '#30414b');
      }
    }
  // Bollspelaren: two mapped football pitches, a small training pitch from the reference and the ice rink.
  function football(center: number[], heading: number, w: number, l: number, training = false) {
    const g = b.local(center, heading, 0.075);
    const pitch = b.canvas(680, 1050, (c) => {
      for (let i = 0; i < 14; i++) {
        c.fillStyle = training ? (i % 2 ? '#496448' : '#536c4b') : i % 2 ? '#3e7c4d' : '#478751';
        c.fillRect(0, i * 75, 680, 75);
      }
      c.strokeStyle = '#e7ecdb';
      c.lineWidth = 3;
      c.strokeRect(12, 12, 656, 1026);
      c.beginPath();
      c.moveTo(12, 525);
      c.lineTo(668, 525);
      c.stroke();
      c.beginPath();
      c.arc(340, 525, 91, 0, Math.PI * 2);
      c.stroke();
      for (const end of [0, 1]) {
        c.save();
        if (end) {
          c.translate(680, 1050);
          c.rotate(Math.PI);
        }
        c.strokeRect(138, 12, 404, 165);
        c.strokeRect(248, 12, 184, 55);
        c.restore();
      }
    });
    b.surface(g, w, l, 0.006, pitch);
    for (const side of [-1, 1]) {
      for (const x of [-0.146, 0.146]) b.pole(g, x, 0.052, (side * l) / 2, 0.004, 0.098, '#e9eddf');
      b.beam(g, [-0.15, 0.1, (side * l) / 2], [0.15, 0.1, (side * l) / 2], 0.004, '#e9eddf');
      for (let x = -0.14; x <= 0.15; x += 0.035)
        b.beam(g, [x, 0.01, side * (l / 2 + 0.06)], [x, 0.1, (side * l) / 2], 0.0009, '#c6d1c6');
    }
    for (const side of [-1, 1])
      for (let z = -l / 2; z <= l / 2; z += 0.3)
        b.pole(g, side * (w / 2 + 0.05), 0.06, z, 0.002, 0.12, '#68766c');
    for (const side of [-1, 1]) {
      b.beam(
        g,
        [side * (w / 2 + 0.05), 0.12, -l / 2],
        [side * (w / 2 + 0.05), 0.12, l / 2],
        0.0015,
        '#68766c',
      );
    }
    if (!training)
      for (const x of [-w / 2 - 0.13, w / 2 + 0.13])
        for (const z of [-l * 0.4, l * 0.4]) {
          b.pole(g, x, 0.35, z, 0.006, 0.7, '#a6b0ac');
          b.box(g, x, 0.71, z, 0.12, 0.035, 0.03, '#e8e9d5');
        }
    return g;
  }
  for (const p of data.pitches) {
    if (p.sport === 'soccer') {
      const g = football(p.center, p.heading, p.width, p.length);
      if (p.id === 91854396) {
        // North long side beside Malmbergs: higher rows face back away from the pitch.
        const x = p.width / 2 + 0.16;
        for (let row = 0; row < 7; row++)
          b.box(
            g,
            x + row * 0.026,
            0.022 + row * 0.018,
            -0.7,
            0.034,
            0.023,
            1.7,
            row % 2 ? '#697e76' : '#b4b7ac',
          );
        b.box(g, x + 0.08, 0.22, -0.7, 0.32, 0.014, 1.8, '#4b5558');
        for (const z of [-1.5, -0.7, 0.1]) b.pole(g, x + 0.23, 0.11, z, 0.004, 0.22, '#596265');
        b.sign(g, 'BOLLSPELAREN', x + 0.08, 0.2, -1.61, 0.3, 0.05, Math.PI, '#294b3c', '#fff4d6');
      }
    } else {
      const g = b.local(p.center, p.heading, 0.075);
      const ice = b.canvas(1024, 512, (c) => {
        c.fillStyle = '#d6ded7';
        c.fillRect(0, 0, 1024, 512);
        c.strokeStyle = '#a44946';
        c.lineWidth = 6;
        c.strokeRect(10, 10, 1004, 492);
        c.beginPath();
        c.moveTo(512, 10);
        c.lineTo(512, 502);
        c.stroke();
        c.beginPath();
        c.arc(512, 256, 80, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = '#60889a';
        for (const x of [320, 704]) {
          c.beginPath();
          c.moveTo(x, 10);
          c.lineTo(x, 502);
          c.stroke();
        }
      });
      b.surface(g, p.width, p.length, 0.005, ice);
      for (const side of [-1, 1])
        b.box(g, (side * p.width) / 2, 0.03, 0, 0.012, 0.06, p.length, '#dfded4');
    }
  }
  football(training.center, training.heading, training.width, training.length, true);
  return b.finish();
}
