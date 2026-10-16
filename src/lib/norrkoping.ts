/**
 * Hand-authored layout of central Norrköping at 1:15 scale.
 *
 * Positions derive from real coordinates (Wikipedia datum for Drottninggatan:
 * 58.58981 N, 16.18747 E — see the backend README mapping table). Motala
 * ström enters at Himmelstalund, falls past the Holmen mill island and
 * Laxholmen (Strykjärnet), squeezes through Gamlebro on the west side of
 * Gamla stan, and a northern arm runs between the old town and the central
 * station out to the harbour and Bråviken. Outlying places (Himmelstalund,
 * Vrinnevi, Nya Parken, the harbour) are pulled closer than their true
 * distances so everything fits the 160 m stage.
 */
import { PLINTH_TOP, type Building, type BuildingKind, type CityModel, type RoofKind, type Strip, type Tree, type WaterSegment } from './city';

type Point = [number, number];

/** Converts a polyline into flat ground strips (streets or water). */
function strips(points: Point[], width: number, kind: Strip['kind'] | 'water', rapids = false) {
  const out: { x: number; z: number; len: number; angle: number; width: number; kind?: Strip['kind']; rapids?: boolean }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[i + 1];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const item: typeof out[number] = {
      x: (x1 + x2) / 2,
      z: (z1 + z2) / 2,
      len: Math.hypot(dx, dz) + width,
      angle: Math.atan2(-dz, dx),
      width,
    };
    if (kind === 'water') item.rapids = rapids;
    else item.kind = kind;
    out.push(item);
  }
  return out;
}

function water(points: Point[], width: number, rapids = false): WaterSegment[] {
  return strips(points, width, 'water', rapids) as WaterSegment[];
}

function streets(points: Point[], width: number, kind: Strip['kind']): Strip[] {
  return strips(points, width, kind) as Strip[];
}

function bridgeBetween(x1: number, z1: number, x2: number, z2: number, width: number) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return {
    x: (x1 + x2) / 2,
    z: (z1 + z2) / 2,
    len: Math.hypot(dx, dz) + 1,
    angle: Math.atan2(-dz, dx),
    width,
  };
}

/** Walks a polyline, placing trees (or lamps via mapLamps) at even spacing. */
function along(points: Point[], spacing: number, offset: number, s0: number, start = 0): Tree[] {
  const trees: Tree[] = [];
  let travelled = start;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[i + 1];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const nx = (-dz / len) * offset;
    const nz = (dx / len) * offset;
    for (let next = Math.ceil(travelled / spacing) * spacing; next <= travelled + len; next += spacing) {
      const t = (next - travelled) / len;
      trees.push({
        x: x1 + dx * t + nx,
        z: z1 + dz * t + nz,
        y: 0,
        s: s0 + (trees.length % 3) * 0.15,
        tone: trees.length % 4,
      });
    }
    travelled += len;
  }
  return trees;
}

const STYLE: Record<BuildingKind, { roughness: number; metalness: number; emissive: number }> = {
  tower: { roughness: 0.5, metalness: 0.3, emissive: 2.4 },
  cylinder: { roughness: 0.45, metalness: 0.35, emissive: 2.6 },
  midrise: { roughness: 0.8, metalness: 0.05, emissive: 1.9 },
  lowrise: { roughness: 0.85, metalness: 0.05, emissive: 1.8 },
  house: { roughness: 0.9, metalness: 0, emissive: 1.6 },
  iron: { roughness: 0.85, metalness: 0.05, emissive: 1.9 },
};

interface MakeOpts {
  roofH?: number;
  roofColor?: string;
  props?: Building['props'];
  antenna?: number;
  quarter?: 0 | 1;
  lit?: number;
  warm?: number;
  name?: string;
}

function make(
  id: number,
  x: number,
  z: number,
  kind: BuildingKind,
  w: number,
  d: number,
  h: number,
  wall: string,
  roof: RoofKind,
  opts: MakeOpts = {},
): Building {
  const style = STYLE[kind];
  return {
    id,
    x,
    z,
    quarter: opts.quarter ?? 0,
    kind,
    tiers: [{ w, d, h, y: 0 }],
    wall,
    lit: opts.lit ?? 0.35,
    warm: opts.warm ?? 0.6,
    roughness: style.roughness,
    metalness: style.metalness,
    emissive: style.emissive,
    roof,
    roofH: opts.roofH ?? 0,
    roofColor: opts.roofColor ?? '#4e423b',
    props: opts.props ?? [],
    antenna: opts.antenna ?? 0,
    name: opts.name,
  };
}

// ---------------------------------------------------------------------------
// Motala ström: upstream, the falls, the old-town channel and the north arm.
// ---------------------------------------------------------------------------

const MAIN_UPSTREAM: Point[] = [
  [-74, -15],
  [-66, -12],
  [-56, -8],
  [-47, -3],
  [-42, -1],
  [-38, -0.5],
];
const MAIN_FALLS: Point[] = [
  [-38, -0.5],
  [-34, 0.3],
  [-30, 0.6],
  [-26, 0.9],
  [-22, 2],
  [-17, 3.5],
];
const MAIN_TOWN: Point[] = [
  [-17, 3.5],
  [-12, 5],
  [-9, 5.3],
  [-7.8, 5.8],
  [-7.2, 8],
  [-6.8, 11],
  [-6.2, 14],
  [-4, 18],
  [-1, 21],
  [3, 24],
  [8, 25],
  [13, 23.5],
  [18, 19.5],
  [23, 15],
  [27, 9],
  [30, 2],
  [33, -6],
  [36, -14],
  [40, -23],
  [44, -32],
  [49, -40],
  [54, -46],
  [60, -51],
  [74, -60],
];
/** The channel south of Laxholmen, rejoining the main stem before Gamlebro. */
const LAXHOLMEN_CHANNEL: Point[] = [
  [-30, 1.2],
  [-28, 9],
  [-23.5, 10],
  [-18, 8.5],
  [-14, 6.3],
  [-12, 5.2],
];
/** The northern arm: falls → past Carl Johans park and the station → Bråviken. */
const NORTH_ARM: Point[] = [
  [-24, 1.8],
  [-21, -3],
  [-18, -8],
  [-16, -15],
  [-14.8, -24],
  [-13.8, -36],
  [-13, -44],
  [-11.5, -48],
  [-8, -50],
  [0, -50.5],
  [8, -50.5],
  [16, -50.5],
  [24, -52],
  [32, -54],
  [40, -56.5],
  [48, -58],
  [55, -56],
  [60, -52.5],
];

// ---------------------------------------------------------------------------
// Streets: Drottninggatan carries the tram from Norrköping C to Söder Tull.
// ---------------------------------------------------------------------------

const DROTTNINGGATAN: Point[] = [
  [-14.7, -45.5],
  [-13.5, -40],
  [-11.5, -30],
  [-8, -18],
  [-6, -8],
  [-2, 0],
  [1, 8],
  [2.5, 16],
  [4.5, 28],
];
const OSTRA_STORGATAN: Point[] = [
  [-6, 5.5],
  [2, 4.8],
  [10, 3.6],
  [18, 2],
  [26, -0.5],
];
const SANKT_PERSGATAN: Point[] = [
  [-13, -26],
  [-12.5, -14],
  [-12, -2],
  [-11.5, 10],
  [-11, 16],
];
const REPBROGATAN: Point[] = [
  [3, -20],
  [3.5, -8],
  [4, 4],
];
const KRISTINAGATAN: Point[] = [
  [11, -26],
  [11.5, -12],
  [12, 2],
];
const SODRA_PROMENADEN: Point[] = [
  [-30, 14.5],
  [-15, 15.5],
  [0, 16],
  [15, 16],
  [26, 15],
];
const OSTRA_PROMENADEN: Point[] = [
  [26, 15],
  [27, 2],
  [28.5, -8],
  [28.5, -16],
  [29.5, -24],
  [30, -32],
  [30.5, -40],
];
const NORRA_PROMENADEN: Point[] = [
  [-34, -56],
  [-18, -56],
  [-2, -56],
  [12, -55.5],
  [24, -54],
];
const VASTRA_PROMENADEN: Point[] = [
  [-49, -24],
  [-50, -8],
  [-49, 6],
  [-46, 16],
  [-42, 22],
];

// ---------------------------------------------------------------------------
// Buildings. Landmarks keep their real names; filler blocks carry Gamla
// stan's plaster palette, the mill island's red brick and the 1900s south.
// ---------------------------------------------------------------------------

function buildings(): Building[] {
  const b: Building[] = [];
  const add = (
    x: number,
    z: number,
    kind: BuildingKind,
    w: number,
    d: number,
    h: number,
    wall: string,
    roof: RoofKind,
    opts: MakeOpts = {},
  ) => {
    b.push(make(b.length + 1, x, z, kind, w, d, h, wall, roof, opts));
  };

  // — Gamla stan: churches, rådhuset, the hotel and the plaster grid —
  add(4.8, -1.4, 'cylinder', 2.6, 2.6, 5, '#9aa5ad', 'spire', {
    roofH: 3.2, roofColor: '#5a7a6a', lit: 0.08, warm: 0.2, name: 'Sankt Olai kyrka',
  });
  add(7.8, -1.6, 'midrise', 5.5, 3, 3, '#8f9aa3', 'parapet', { quarter: 1, lit: 0.12, warm: 0.3 });
  add(-2, -17.9, 'midrise', 7, 4.5, 4.6, '#b39263', 'parapet', {
    props: [{ kind: 'ac', x: 1.5, z: 0.8 }], lit: 0.35, warm: 0.7, name: 'Norrköpings rådhus',
  });
  add(-4.5, -17.3, 'cylinder', 2.2, 2.2, 6.5, '#b39263', 'spire', {
    roofH: 2.6, roofColor: '#5a7a6a', lit: 0.3, warm: 0.7,
  });
  add(5.5, 8, 'midrise', 6, 4.5, 3.8, '#c8b490', 'parapet', {
    lit: 0.5, warm: 0.8, name: 'Stora hotellet',
  });
  add(8, 17.5, 'midrise', 6, 4, 3.6, '#b5977d', 'parapet', { antenna: 1, lit: 0.45, warm: 0.75 });
  add(-9.3, -8, 'lowrise', 4, 4, 3, '#c4ae8a', 'parapet');
  add(-7.5, -2, 'lowrise', 5, 4, 3.6, '#b99a6b', 'parapet');
  add(-2.5, -16, 'lowrise', 5, 4.5, 3.2, '#b5977d', 'parapet');
  add(-0.5, -9, 'lowrise', 5, 4, 3.4, '#c8a97e', 'parapet');
  add(-1.5, 13, 'lowrise', 4.5, 3.5, 2.6, '#9b7f5e', 'parapet');
  add(6, 13, 'lowrise', 4.5, 4, 3, '#b99a6b', 'parapet');
  add(-5.8, -24, 'lowrise', 5, 4, 3.4, '#a9835f', 'parapet');
  add(2.5, -24, 'lowrise', 5.5, 4.5, 3.6, '#c8a97e', 'parapet');
  add(-2, -30, 'lowrise', 5, 4, 3, '#b5977d', 'parapet');
  add(10, -30, 'lowrise', 5, 4, 3.2, '#9b7f5e', 'parapet');
  add(9, -20, 'lowrise', 5, 4, 3.4, '#c4ae8a', 'parapet');
  add(11, -25.5, 'lowrise', 5, 4.5, 3, '#a9835f', 'parapet');
  add(15, -21, 'lowrise', 5, 4, 3, '#c4ae8a', 'parapet');
  add(16, -1.5, 'lowrise', 5, 4, 2.6, '#9b7f5e', 'parapet');
  add(16, -6, 'lowrise', 5, 4, 3, '#c8a97e', 'parapet');
  add(17, -14, 'lowrise', 5, 4, 3.2, '#b99a6b', 'parapet');
  add(16, 6, 'lowrise', 5, 4, 2.6, '#a9835f', 'parapet');

  // — Industrilandskapet: the Holmen mill island, Laxholmen and campus —
  add(-31.5, -3.5, 'cylinder', 3, 3, 7, '#7a4437', 'cap', {
    lit: 0.3, warm: 0.85, name: 'Holmentornet',
  });
  add(-35, -8.3, 'lowrise', 6.5, 3.5, 3, '#6e4034', 'parapet', {
    props: [{ kind: 'ac', x: -1.5, z: 0.6 }], lit: 0.3, warm: 0.85,
  });
  add(-25.8, -3, 'cylinder', 1.2, 1.2, 13, '#8a4a3c', 'cap', {
    lit: 0.05, warm: 0.5, name: 'Holmens skorsten',
  });
  add(-25.5, 5, 'iron', 3.6, 3.6, 3, '#7a4437', 'cap', {
    lit: 0.4, warm: 0.9, name: 'Strykjärnet',
  });
  add(-23.5, 5, 'lowrise', 2.4, 1.6, 2.2, '#6e4034', 'parapet', {
    lit: 0.3, warm: 0.85, name: 'Strykbrädan',
  });
  add(-43, -7.2, 'lowrise', 7, 3.5, 3.4, '#83504a', 'parapet', {
    props: [{ kind: 'ac', x: 2, z: 0.5 }], lit: 0.45, warm: 0.6, name: 'Tryckeriet',
  });
  add(-34, -4.5, 'midrise', 6, 3.5, 3, '#46586a', 'dome', {
    roofH: 2, roofColor: '#93a7b0', lit: 0.55, warm: 0.25, name: 'Visualiseringscenter C',
  });
  add(-16.5, 16, 'lowrise', 8, 4, 3.8, '#83504a', 'parapet', {
    props: [{ kind: 'tank', x: -2.5, z: 0.8 }], lit: 0.4, warm: 0.8, name: 'Louis De Geer-hallen',
  });
  add(-20.5, 12.5, 'house', 3, 2.5, 2, '#5d6470', 'parapet', {
    lit: 0.25, warm: 0.9, name: 'Drags kraftstation',
  });

  // — Station, Nordantill and Saltängen (north of the ström) —
  add(-19, -48.7, 'midrise', 8, 4.5, 3.8, '#4a5560', 'parapet', {
    antenna: 0.8, lit: 0.5, warm: 0.4, name: 'Norrköpings centralstation',
  });
  add(26.5, -58, 'lowrise', 6, 4.5, 4, '#b5977d', 'parapet');
  add(32.6, -59.5, 'lowrise', 6, 4.5, 4.4, '#a9835f', 'parapet');
  add(30, -65, 'lowrise', 6, 4, 3.6, '#c4ae8a', 'parapet');
  add(22, -57, 'lowrise', 5, 4, 3.2, '#b5977d', 'parapet');
  add(18, -56.5, 'house', 5, 4, 2.6, '#c4ae8a', 'pyramid', { roofH: 1.2 });
  add(-24, -54, 'house', 5, 4, 2.8, '#b99a6b', 'pyramid', { roofH: 1.3 });
  add(4, -31, 'lowrise', 5, 4, 3, '#a9835f', 'parapet');

  // — The harbour at Bråviken —
  add(47.5, -46.5, 'cylinder', 3.6, 3.6, 6.5, '#a89582', 'cap', {
    lit: 0.15, warm: 0.5, name: 'Hamnens silo',
  });
  add(52, -49.5, 'cylinder', 3, 3, 5.5, '#a89582', 'cap', { lit: 0.15, warm: 0.5 });
  add(60, -42, 'lowrise', 8, 3.5, 3, '#4a5560', 'parapet', { lit: 0.4, warm: 0.4 });
  add(53, -33.5, 'lowrise', 7, 4, 3.5, '#83504a', 'parapet', {
    lit: 0.3, warm: 0.8, name: 'Holmen Paper',
  });
  add(48, -32.5, 'cylinder', 1.4, 1.4, 14, '#8a4a3c', 'cap', { lit: 0.05, warm: 0.5 });

  // — Söderstaden, Johannes kyrka and Vrinnevi —
  add(-15.5, 51.5, 'midrise', 10, 5, 4.5, '#9fa8b2', 'parapet', {
    lit: 0.5, warm: 0.4, name: 'Vrinnevisjukhuset',
  });
  add(-27, 54, 'lowrise', 5, 4, 3, '#8f9aa3', 'parapet', { lit: 0.45, warm: 0.5 });
  add(36.2, 50.8, 'cylinder', 2, 2, 4.5, '#8f9aa3', 'spire', {
    roofH: 2.4, roofColor: '#5a7a6a', lit: 0.1, warm: 0.2, name: 'Sankt Johannes kyrka',
  });
  add(38.5, 51.8, 'midrise', 4.5, 3, 3, '#8f9aa3', 'parapet', { quarter: 1, lit: 0.15, warm: 0.3 });
  add(6, 30, 'lowrise', 5, 4, 3, '#b99a6b', 'parapet');
  add(12, 32, 'lowrise', 5, 4, 3.2, '#c4ae8a', 'parapet');
  add(18, 28, 'lowrise', 5, 4, 2.8, '#a9835f', 'parapet');
  add(-3, 28, 'lowrise', 5, 4, 3, '#b5977d', 'parapet');
  add(24, 24, 'lowrise', 5, 4, 2.6, '#9b7f5e', 'parapet');
  add(10, 38, 'lowrise', 5, 4, 3.4, '#c8a97e', 'parapet');
  add(-8, 38, 'lowrise', 5.5, 4, 3.2, '#b99a6b', 'parapet');
  add(2, 44, 'lowrise', 5, 4, 3, '#a9835f', 'parapet');
  add(16, 44, 'lowrise', 5, 4, 3.2, '#b5977d', 'parapet');
  add(-60.5, -14.5, 'house', 4, 3.5, 2.4, '#c8b490', 'pyramid', {
    roofH: 1.4, name: 'Himmelstalund',
  });

  // — Nya Parken, IFK Norrköping's home —
  add(38, -60.5, 'lowrise', 7, 1.8, 2.6, '#4a5560', 'parapet', {
    antenna: 1.5, lit: 0.4, warm: 0.3, name: 'Nya Parken',
  });
  add(38, -65.2, 'lowrise', 7, 1.8, 2.2, '#4a5560', 'parapet', { antenna: 1.5, lit: 0.4, warm: 0.3 });

  return b;
}

export function buildNorrkoping(): CityModel {
  const trees: Tree[] = [
    ...along(DROTTNINGGATAN, 6, 2.4, 0.9, 5),
    ...along(SODRA_PROMENADEN, 7, 1.2, 1.05),
    ...along(OSTRA_PROMENADEN, 7, 1.2, 1.05),
    ...along(NORRA_PROMENADEN, 8, -1.3, 0.95),
    ...along(VASTRA_PROMENADEN, 8, -1.3, 0.95),
    // Himmelstalund's park and the rock-carving meadow, on the grass plinth.
    { x: -62, z: -14, y: PLINTH_TOP, s: 1.25, tone: 0 },
    { x: -64, z: -16, y: PLINTH_TOP, s: 1.1, tone: 1 },
    { x: -56.5, z: -15.5, y: 0, s: 1.2, tone: 2 },
    { x: -63, z: -18, y: PLINTH_TOP, s: 1.15, tone: 3 },
    { x: -58, z: -17.5, y: PLINTH_TOP, s: 1.3, tone: 1 },
    { x: -61, z: -19, y: PLINTH_TOP, s: 1, tone: 2 },
    { x: -55.5, z: -13, y: 0, s: 1.1, tone: 0 },
    // Carl Johans park frames the Kaktusplanteringen beds.
    { x: -8, z: -28.5, y: PLINTH_TOP, s: 1, tone: 1 },
    { x: -10.8, z: -33.6, y: PLINTH_TOP, s: 1.05, tone: 2 },
  ];

  const lamps = [
    ...along(DROTTNINGGATAN, 9, -1.5, 0, 6).map((t) => ({ x: t.x, z: t.z })),
    { x: -30, z: 14.5 },
    { x: -15, z: 15.5 },
    { x: 15, z: 16 },
    { x: 26, z: 15 },
    { x: 28, z: -8 },
    { x: 30, z: -32 },
    { x: -34, z: -56 },
    { x: -12, z: -56 },
    { x: 12, z: -55.5 },
    { x: 24, z: -54 },
    { x: -50, z: -8 },
    { x: -46, z: 16 },
    { x: -14.9, z: -51.5 },
    { x: -38, z: -3 },
  ];

  return {
    buildings: buildings(),
    trees,
    lamps,
    plinths: [
      { x: -1.5, z: 11, kind: 'stone', size: 0.4 }, // Gamla torget
      { x: -3, z: -16, kind: 'stone', size: 0.55 }, // Rådhustorget
      { x: -13.7, z: -45, kind: 'stone', size: 0.6 }, // Drottningtorget
      { x: 5, z: 29, kind: 'stone', size: 0.4 }, // Söder Tull
      { x: -18, z: 58, kind: 'stone', size: 0.5 }, // Vrinnevi forecourt
      { x: -9.5, z: -31, kind: 'grass', size: 0.55 }, // Carl Johans park
      { x: -60, z: -16.8, kind: 'grass', size: 0.7 }, // Himmelstalund
      { x: 28, z: -8, kind: 'grass', size: 0.5 }, // Östra promenaden
      { x: 28.5, z: -22, kind: 'grass', size: 0.5 },
      { x: 37.5, z: -64, kind: 'grass', size: 0.7 }, // Nya Parken pitch
      { x: -37.5, z: -5.5, kind: 'pavement', size: 0.4 }, // campus courtyard
    ],
    water: [
      ...water(MAIN_UPSTREAM, 3.4),
      ...water(MAIN_FALLS, 4.2, true),
      ...water(MAIN_TOWN, 3.4),
      ...water(LAXHOLMEN_CHANNEL, 2.2, true),
      ...water(NORTH_ARM.slice(0, 3), 2.8, true),
      ...water(NORTH_ARM.slice(2), 2.8),
    ],
    streets: [
      ...streets(DROTTNINGGATAN, 2.6, 'tram'),
      ...streets(OSTRA_STORGATAN, 2.2, 'street'),
      ...streets(SANKT_PERSGATAN, 1.8, 'street'),
      ...streets(REPBROGATAN, 1.6, 'street'),
      ...streets(KRISTINAGATAN, 1.8, 'street'),
      ...streets(SODRA_PROMENADEN, 1.6, 'walk'),
      ...streets(OSTRA_PROMENADEN, 1.6, 'walk'),
      ...streets(NORRA_PROMENADEN, 1.6, 'walk'),
      ...streets(VASTRA_PROMENADEN, 1.6, 'walk'),
      ...streets(
        [
          [-8, 25],
          [20, 25],
        ],
        1.6,
        'street',
      ),
      ...streets(
        [
          [-19, -46],
          [-14.6, -46],
        ],
        1.6,
        'walk',
      ),
    ],
    bridges: [
      bridgeBetween(-10.5, 5.5, -6, 5.5, 3), // Gamlebro
      bridgeBetween(3.7, 20.5, 4.6, 27, 3), // Söderbron
      bridgeBetween(-14.2, -43.5, -12.7, -36, 2.6), // Drottningbron
      bridgeBetween(-12.4, 8.4, -12, 2, 2.4), // S:t Persbron
      bridgeBetween(-30, 2.5, -30, -3.5, 1.8), // Campusbron
    ],
    cacti: [
      { x: -10.3, z: -32.8, s: 1 },
      { x: -9.3, z: -33.6, s: 1.2 },
      { x: -8.1, z: -33.9, s: 1.35 },
      { x: -6.9, z: -33.6, s: 1.2 },
      { x: -6.2, z: -32.8, s: 1 },
      { x: -9.7, z: -31.6, s: 0.8 },
      { x: -6.5, z: -31.6, s: 0.8 },
      { x: -8.1, z: -30.4, s: 0.95 },
      { x: -9.9, z: -29.6, s: 0.7 },
    ],
  };
}