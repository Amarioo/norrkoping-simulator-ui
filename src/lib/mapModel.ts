import source from './data/norrkoping-map.json' with { type: 'json' };
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
  yA: number;
  yB: number;
  width: number;
  bridge?: boolean;
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
  buildings: MapBuilding[];
  areas: MapArea[];
  roads: MapRoad[];
  trees: Point[];
  signals: { id: number; position: Point }[];
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
export const cityMap = source as unknown as MapData;
export const METRES_PER_UNIT = 25;
export function project(lat: number, lon: number): Point {
  return [
    ((lon - 16.18747) * 58010) / METRES_PER_UNIT,
    ((58.58981 - lat) * 111133) / METRES_PER_UNIT,
  ];
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
    height: 1.6,
    category: 'stadium',
    description: 'Parken · IFK Norrköpings hemmaarena',
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
const focus = (label: string, p: Point, range: number): CityFocus => ({
  label,
  target: [p[0], 0, p[1]],
  position: [p[0] + range * 0.28, range * 0.95, p[1] + range * 0.75],
});
export const CITY_VIEWS: Record<string, CityFocus> = {
  overview: focus('Hela Norrköping', [-18, -55], 420),
  city: focus('Innerstaden', [-4, 8], 120),
  airport: focus(
    'Norrköpings flygplats',
    [(cityMap.airports[0].start[0] + cityMap.airports[0].end[0]) / 2, 17],
    85,
  ),
  f13: focus('Bråvalla F13', [-195, -92], 95),
  police: focus('Polishuset', centerOf(named('Polishuset')), 10),
  kungsgatan: focus('Kungsgatan', [-22, -14], 14),
  soderleden: focus('Söderleden', [14, 66], 20),
  parken: focus('Parken', stadiumCenter, 16),
  industry: focus('Industrilandskapet', [-17, 3], 22),
  centrum: focus('Centrum', [2, -5], 30),
  ljura: focus('Ljura / Ljuraparken', centerOf(named('Ljuraparken')), 32),
  station: focus('Stationen / Carl Johans park', [-8, -25], 25),
};
