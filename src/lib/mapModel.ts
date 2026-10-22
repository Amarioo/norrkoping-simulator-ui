import { terrain, ROAD_SURFACE, type SpanPiece } from './terrain';
import { cityJson } from './cityData';
export type Point = [number, number];
export interface MapPolygon {
  id: string;
  name?: string;
  rings: Point[][];
}
export interface MapBuilding extends MapPolygon {
  height: number;
  minHeight: number;
  heightSource: 'height' | 'levels' | 'estimated';
  wall: string;
  roof: string;
  roofShape: string;
  kind: string;
}
export interface MapArea extends MapPolygon {
  kind:
    | 'water'
    | 'pitch'
    | 'cemetery'
    | 'wood'
    | 'grass'
    | 'industrial'
    | 'residential'
    | 'square'
    | 'farmland'
    | 'apron';
}
export interface MapRoad {
  a: Point;
  b: Point;
  kind: 'road' | 'path' | 'tram' | 'rail' | 'stream';
  class: string;
  ref: string;
  lanes: number;
  oneway: number;
  linearProfile?: boolean;
  /** Engineered spans over underpasses/culverts (terrain.spans), reference heights. */
  spans?: SpanPiece[];
  yA: number;
  yB: number;
  width: number;
  bridge?: boolean;
  tunnel?: boolean;
  way?: number;
  name?: string;
}
export interface MapData {
  meta: {
    source: string;
    timestamp: string;
    metresPerUnit: number;
    origin: number[];
    bounds: number[];
  };
  transitRoutes: {
    id: string;
    kind: string;
    name: string;
    points: number[][];
    stops: { name: string; distance: number }[];
  }[];
  ground: MapPolygon[];
  buildings: MapBuilding[];
  areas: MapArea[];
  roads: MapRoad[];
  trees: Point[];
  signals: { id: number; position: Point; horizontal?: boolean }[];
  airways: {
    id: number;
    kind: string;
    ref: string;
    name: string;
    width: number;
    points: Point[];
    surface: string;
    historic: boolean;
  }[];
  airports: {
    id: string;
    name: string;
    runway: string;
    start: Point;
    end: Point;
    width: number;
    historic: boolean;
  }[];
}
const source = await cityJson<MapData>('map');
export const cityMap = {
  ...source,
  roads: source.roads.map((r) =>
    // Step 5: absorbed into a road breakline patch: an ordinary draped segment on the surface it shaped.
    terrain.integrated(r.a, r.b)
      ? {
          ...r,
          linearProfile: false,
          spans: undefined,
          yA: terrain.groundHeight(...r.a) - ROAD_SURFACE,
          yB: terrain.groundHeight(...r.b) - ROAD_SURFACE,
        }
      : {
          ...r,
          // DTM: linear decks only between two profiled ends; approaches follow the terrain (terrain.ts).
          linearProfile: terrain.measured
            ? terrain.linearBetween([r.a[0], r.yA, r.a[1]], [r.b[0], r.yB, r.b[1]])
            : !!r.bridge ||
              terrain.bridgeHeight(r.a[0], r.a[1], r.yA) !== undefined ||
              terrain.bridgeHeight(r.b[0], r.b[1], r.yB) !== undefined,
          spans: terrain.spans(r.a, r.b),
          yA: terrain.roadHeight(r.a[0], r.a[1], r.yA),
          yB: terrain.roadHeight(r.b[0], r.b[1], r.yB),
        },
  ),
} as unknown as MapData;
export const METRES_PER_UNIT = terrain.data.reference.metresPerUnit;
export function project(lat: number, lon: number): Point {
  return terrain.project(lat, lon);
}
export function centerOf(p: MapPolygon): Point {
  const xs = p.rings[0].map((p) => p[0]),
    zs = p.rings[0].map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
}
export function pointInRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export interface Landmark {
  name: string;
  position: Point;
  height: number;
  category: 'architecture' | 'park' | 'district' | 'stadium' | 'airport';
  description: string;
}
const named = (name: string): MapPolygon => {
  const p = [...cityMap.buildings, ...cityMap.areas].find((p) => p.name === name);
  if (!p) throw new Error(`Missing mapped landmark ${name}`);
  return p;
};
const landmark = (
  name: string,
  label: string,
  category: Landmark['category'],
  description: string,
  height = 1.5,
): Landmark => ({ name: label, position: centerOf(named(name)), category, description, height });
const pitch = cityMap.areas.find((p) => p.id === 'way/100955051')!;
export const stadiumCenter = centerOf(pitch);
export const LANDMARKS: Landmark[] = [
  landmark(
    'Polishuset',
    'Polishuset',
    'architecture',
    'Stockholmsvägen · högdel och låga flyglar',
    2.1,
  ),
  ...cityMap.airports.map((a) => ({
    name: a.name,
    position: [(a.start[0] + a.end[0]) / 2, (a.start[1] + a.end[1]) / 2] as Point,
    height: 0.5,
    category: 'airport' as const,
    description: a.historic ? 'F13 · simulerad flygtrafik' : 'Kungsängen · bana 09/27',
  })),
  {
    name: 'Idrottsparken',
    position: stadiumCenter,
    height: 1.95,
    category: 'stadium',
    description: 'Norrköpings Idrottspark · IFK Norrköpings hemmaarena',
  },
  landmark('Strykjärnet', 'Strykjärnet', 'architecture', 'Arbetets museum · Laxholmen', 1.8),
  landmark('Rådhuset', 'Rådhuset', 'architecture', 'Rådhustorget · klocktornet', 3.4),
  landmark(
    'Sankt Olai kyrka',
    'Sankt Olai kyrka',
    'architecture',
    'Gamla staden · kyrka och kampanil',
    2.5,
  ),
  landmark('Matteus kyrka', 'Matteus kyrka', 'architecture', 'Nordantill · tegelkyrkan', 3.3),
  landmark(
    'Värmekyrkan',
    'Värmekyrkan',
    'architecture',
    'Industrilandskapet · tegel och skorstenar',
    2.6,
  ),
  landmark(
    'Louis De Geer Konsert & Kongress',
    'Louis De Geer',
    'architecture',
    'Konsert & Kongress vid Strömmen',
    1.6,
  ),
  landmark(
    'Norrköpings centralstation',
    'Norrköping C',
    'architecture',
    'Centralstationen vid Norra Promenaden',
    1.2,
  ),
  landmark(
    'Norrköpings konstmuseum',
    'Konstmuseet',
    'architecture',
    'Kristinaplatsen och Skulpturparken',
    1.4,
  ),
  landmark('Medley Centralbadet', 'Centralbadet', 'architecture', 'Bad- och simanläggning', 1.2),
  landmark(
    'Ljuraparken',
    'Ljuraparken',
    'park',
    'Ljuras gröna rum, gångstråk och bostadskvarter',
    0.5,
  ),
  landmark('Ljuraskolan', 'Ljuraskolan', 'architecture', 'Ljura · skola och skolgård', 1.2),
  landmark(
    'Räddningsstation Ljura',
    'Räddningsstation Ljura',
    'architecture',
    'Dagsbergsvägen',
    1.2,
  ),
  landmark('Karl Johans park', 'Carl Johans park', 'park', 'Kaktusplanteringen och alléerna', 0.5),
  landmark('Folkparken', 'Folkparken', 'park', 'Parkstråk väster om Industrilandskapet', 0.5),
  landmark('Vasaparken', 'Vasaparken', 'park', 'Grönområdet söder om Södra Promenaden', 0.5),
  landmark('Gamla vattentornet', 'Gamla vattentornet', 'architecture', 'Landmärke vid Parken', 3),
  landmark('S:t Johannes kyrka', 'S:t Johannes kyrka', 'architecture', 'Söderstaden', 2.7),
  {
    name: 'Bollspelaren',
    position: project(58.6006, 16.1778),
    height: 0.5,
    category: 'stadium',
    description: 'Ingelstagatan · fotbollsplaner, läktare och isbana',
  },
  {
    name: 'Ljura',
    position: project(58.5794, 16.1995),
    height: 0.3,
    category: 'district',
    description: 'Bostadskvarter, grönska och Ljuraparken',
  },
];
export interface CityFocus {
  label: string;
  target: [number, number, number];
  position: [number, number, number];
}
// Scene axes follow the SWEREF 99 TM grid; overview cameras keep their geographic orientation:
// 0.28·range towards true east and 0.75·range towards true south of the target.
const [northX, northZ] = terrain.trueNorth;
const focus = (label: string, p: Point, range: number): CityFocus => ({
  label,
  target: [p[0], 0, p[1]],
  position: [
    p[0] + range * (0.28 * -northZ - 0.75 * northX),
    range * 0.95,
    p[1] + range * (0.28 * northX - 0.75 * northZ),
  ],
});
/**
 * Camera presets in the SWEREF 99 TM scene frame. Hand-placed values were migrated from the legacy
 * frame with scripts/geo/legacy-frame.mjs (same geographic target and camera position).
 */
export const CITY_VIEWS: Record<string, CityFocus> = {
  overview: focus('Hela Norrköping', [-19, -54.8], 420),
  city: focus('Innerstaden', [-3.86, 8.08], 120),
  airport: focus(
    'Norrköpings flygplats',
    [(cityMap.airports[0].start[0] + cityMap.airports[0].end[0]) / 2, 14.36],
    85,
  ),
  f13: focus('Bråvalla F13', [-196.97, -88.87], 95),
  policeEmblem: {
    label: 'Polishusets emblem',
    target: [-28.88, 1.55, -24.93],
    position: [-28.14, 1.82, -22.54],
  },
  ingelstaBridge: {
    label: 'Ingelstagatans järnvägsbro',
    target: [-25.75, 0.18, -28.02] as [number, number, number],
    position: [-22.29, 1.7, -25.48] as [number, number, number],
  },
  grandHotel: {
    label: 'Grand Hotel',
    target: [-2.65, 0.42, -14.29] as [number, number, number],
    position: [-5.31, 1.1, -17.45] as [number, number, number],
  },
  holmen: {
    label: 'Holmen',
    target: [-11.98, 0.52, -14.83] as [number, number, number],
    position: [-8.73, 1.1, -18.3] as [number, number, number],
  },
  police: focus('Polishuset', centerOf(named('Polishuset')), 10),
  kungsgatan: focus('Kungsgatan', [-22.29, -13.65], 14),
  soderleden: focus('Söderleden', [15.22, 65.89], 20),
  parken: focus('Parken', stadiumCenter, 11),
  // Step 6 pilot views (docs/step6/poses.json; y relative to the ground, see FreeCamera).
  idrottsparkenPitch: {
    label: 'Idrottsparken · planen',
    target: [-33.0555, 0.06, 23.7613],
    position: [-33.7268, 0.5, 28.3525],
  },
  stromparken: {
    label: 'Strömparken · gångstråket',
    target: [-7.25, 0.028, -5.7],
    position: [-6.62, 0.06, -3.7],
  },
  industry: focus('Industrilandskapet', [-16.98, 3.3], 22),
  centrum: focus('Centrum', [1.93, -5.05], 30),
  ljura: focus('Ljura / Ljuraparken', centerOf(named('Ljuraparken')), 32),
  station: focus('Resecentrum / Norrköping C', centerOf(named('Norrköpings centralstation')), 9),
  ljuraStop: focus('Hållplats Ljura centrum', project(58.58016, 16.19743), 3),
  bollspelaren: focus('Bollspelaren / Ingelstagatan', project(58.6006, 16.1778), 13),
  terminal: focus(
    'Flygplatsterminalen',
    centerOf(cityMap.buildings.find((b) => b.id === 'way/101513457')!),
    13,
  ),
  norraPromenaden: {
    label: 'Norra Promenaden · allén',
    target: [-8.49, 0.21, -27.12],
    position: [-1.51, 0.21, -29.12],
  },
  sodraPromenaden: {
    label: 'Södra Promenaden · allén',
    target: [-5.6, 0.21, 23],
    position: [1.44, 0.21, 24.03],
  },
  campus: { label: 'Campus / Industrilandskapet', target: [-24.51, 0.24, 2.63], position: [-18.63, 4.5, -5.19] },
  bergsbron: { label: 'Bergsbron', target: [-21.33, 0.24, 0.77], position: [-17.46, 1.55, 4.21] },
  laxholmsbron: focus('Laxholmsbron', [-17.32, 4.54], 2.8),
  laxtrappan: focus('Spången / laxtrappan', [-10.07, -8.75], 4.5),
  gamlebro: focus('Gamlebro / Järnbron', [-8.38, 2.02], 2.8),
  saltangsbron: {
    label: 'Saltängsbron',
    target: [-5.01, 0.24, -17.26],
    position: [-0.77, 1.4, -15.83],
  },
  hamnbron: { label: 'Hamnbron', target: [15.3, 0.24, -19.72], position: [18.75, 1.3, -17.38] },
  underpass: focus('Ståthögavägen / järnvägsbron', [7.37, -37.23], 12),
};
