/**
 * Static city geometry: ground, water, roads, markings and building volumes.
 *
 * Everything here is pure computation on the bundled map and terrain data (no DOM, no
 * materials), so it runs in Web Workers (cityMesh.worker.ts) as well as on the main thread.
 */
import type { Plane } from './surfaceMesh';
import { terrain, LEGACY_LEVELS, ROAD_SURFACE, spanHeight, type SpanPiece } from './terrain';
import { measuredBuildings, replacedBuildings, buildingVertices } from './buildingElevation';
import { BufferAttribute, BufferGeometry, Color, ShapeUtils, Vector2 } from 'three';
import { cityMap, type MapPolygon, type MapBuilding, type MapRoad, type Point } from './mapModel';
import { trenchPoint, trenchDepth, trenchRing } from './ingelstaTerrain';
import terrainLevels from './data/terrain-levels.json';
import { DETAILED_BUILDING_IDS } from './cityPlaces';
import { LAYER_RANK, COVER_ORDER } from './groundLayers';
import { waterSurfaces, waterFalls, unmeasuredWater, drapedWater, dryBanks, isFallEdge } from './waterReaches';
import { railLift, RAIL_OFFSET } from './trackProfile';

/** Bank, quay and fall faces reach this far below the lower water surface (1 m). */
const BANK_DEPTH = 0.04;

/** Layers in the order their meshes are added to the scene. */
export const CITY_LAYERS = [
  'markings',
  'banks',
  'land',
  'water',
  'roads',
  'surveyed',
  'walls',
  'roofs',
  'cornices',
] as const;
export type CityLayer = (typeof CITY_LAYERS)[number];
/** Independent units of work; each can run in its own worker. */
export const CITY_TASKS = {
  terrain: ['banks', 'land', 'water'],
  network: ['roads'],
  // Road markings are built with the buildings: the draped network is the slowest task.
  buildings: ['surveyed', 'walls', 'roofs', 'cornices', 'markings'],
} as const satisfies Record<string, readonly CityLayer[]>;
export type CityTask = keyof typeof CITY_TASKS;
export type CityLayers = Partial<Record<CityLayer, BufferGeometry[]>>;

export { LAYER_RANK, COVER_ORDER };
const rankUv = (rank: number) => [
  [rank, 0],
  [rank, 0],
  [rank, 0],
];
/** A sealed geometry holds at most this many vertices (3 000 triangles). */
const SEAL_VERTICES = 9000;
const CHUNK_KEY_OFFSET = 32768;
/**
 * Collects non-indexed triangles straight into typed arrays. The city emits millions of
 * triangles, so this avoids per-triangle Vector3/array allocations and number[] growth.
 */
export class Batch {
  private chunks = new Map<number, Batch>();
  private sealed: BufferGeometry[] = [];
  private count = 0;
  private positions = new Float32Array(0);
  private normals = new Float32Array(0);
  private colors = new Float32Array(0);
  private uvs = new Float32Array(0);
  constructor(private cellSize = 20) {}
  geometries(): BufferGeometry[] {
    if (!this.cellSize) {
      const result = [...this.sealed];
      if (this.count) result.push(this.geometry());
      this.sealed = [];
      return result;
    }
    const result = [...this.chunks.values()].flatMap((chunk) => chunk.geometries());
    this.chunks.clear();
    return result;
  }
  private reserve(vertices: number) {
    if (vertices <= this.positions.length / 3) return;
    const capacity = Math.min(SEAL_VERTICES, Math.max(96, (this.positions.length / 3) * 4));
    const grow = (old: Float32Array, size: number) => {
      const next = new Float32Array(capacity * size);
      next.set(old.subarray(0, this.count * size));
      return next;
    };
    this.positions = grow(this.positions, 3);
    this.normals = grow(this.normals, 3);
    this.colors = grow(this.colors, 3);
    this.uvs = grow(this.uvs, 2);
  }
  triangle(
    a: number[],
    b: number[],
    c: number[],
    color: Color,
    uv: number[][] = [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  ) {
    if (this.cellSize) {
      const key =
        (Math.floor((a[0] + b[0] + c[0]) / (3 * this.cellSize)) + CHUNK_KEY_OFFSET) * 65536 +
        (Math.floor((a[2] + b[2] + c[2]) / (3 * this.cellSize)) + CHUNK_KEY_OFFSET);
      let chunk = this.chunks.get(key);
      if (!chunk) {
        chunk = new Batch(0);
        this.chunks.set(key, chunk);
      }
      chunk.triangle(a, b, c, color, uv);
      return;
    }
    const abx = b[0] - a[0],
      aby = b[1] - a[1],
      abz = b[2] - a[2],
      acx = c[0] - a[0],
      acy = c[1] - a[1],
      acz = c[2] - a[2];
    // Same arithmetic as Vector3.cross().normalize().
    let nx = aby * acz - abz * acy,
      ny = abz * acx - abx * acz,
      nz = abx * acy - aby * acx;
    const inverse = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
    nx *= inverse;
    ny *= inverse;
    nz *= inverse;
    this.reserve(this.count + 3);
    const { positions, normals, colors, uvs } = this;
    for (let i = 0; i < 3; i++) {
      const p = i === 0 ? a : i === 1 ? b : c,
        o = (this.count + i) * 3,
        t = (this.count + i) * 2;
      positions[o] = p[0];
      positions[o + 1] = p[1];
      positions[o + 2] = p[2];
      normals[o] = nx;
      normals[o + 1] = ny;
      normals[o + 2] = nz;
      colors[o] = color.r;
      colors[o + 1] = color.g;
      colors[o + 2] = color.b;
      uvs[t] = uv[i][0];
      uvs[t + 1] = uv[i][1];
    }
    this.count += 3;
    if (this.count >= SEAL_VERTICES) this.sealed.push(this.geometry());
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: Color, u = 1, v = 1) {
    this.triangle(a, b, c, color, [
      [0, 0],
      [u, 0],
      [u, v],
    ]);
    this.triangle(a, c, d, color, [
      [0, 0],
      [u, v],
      [0, v],
    ]);
  }
  geometry() {
    const g = new BufferGeometry(),
      n = this.count;
    // A full buffer is used as is once the batch is reset. A partly filled one is copied to
    // its exact size: the city keeps its geometry arrays alive, and the unused growth
    // capacity of every chunk's last buffer would otherwise add ~20% to that memory.
    const exact = (array: Float32Array, size: number) =>
      array.length === n * size ? array : array.slice(0, n * size);
    g.setAttribute('position', new BufferAttribute(exact(this.positions, 3), 3));
    g.setAttribute('normal', new BufferAttribute(exact(this.normals, 3), 3));
    g.setAttribute('color', new BufferAttribute(exact(this.colors, 3), 3));
    g.setAttribute('uv', new BufferAttribute(exact(this.uvs, 2), 2));
    g.computeBoundingSphere();
    this.count = 0;
    this.positions = new Float32Array(0);
    this.normals = new Float32Array(0);
    this.colors = new Float32Array(0);
    this.uvs = new Float32Array(0);
    return g;
  }
}
/** Every draped polygon is clipped to the triangles of the rendered surface mesh (terrain.drape). */
function terrainTriangle(
  batch: Batch,
  a: number[],
  b: number[],
  c: number[],
  color: Color,
  rank = 0,
  waterSurface = false,
) {
  const uv = rankUv(rank);
  if (!terrain.tiles.length) {
    batch.triangle(a, b, c, color, uv);
    return;
  }
  // Legacy layer levels (a[1]) are ground surfaces: with the DTM they lie on the terrain itself.
  const height = (p: Point, ground: Plane) =>
    waterSurface
      ? terrain.waterHeight(...p)
      : terrain.measured
        ? ground.at(...p)
        : terrain.placeLegacy(...p, a[1], a[1]);
  terrain.drape([a[0], a[2]], [b[0], b[2]], [c[0], c[2]], (p, q, r, ground) => {
    batch.triangle(
      [p[0], height(p, ground), p[1]],
      [q[0], height(q, ground), q[1]],
      [r[0], height(r, ground), r[1]],
      color,
      uv,
    );
  });
}
function contours(poly: MapPolygon) {
  return poly.rings.map((r) => {
    const clean = r.slice();
    if (clean.length > 1 && clean[0][0] === clean.at(-1)![0] && clean[0][1] === clean.at(-1)![1])
      clean.pop();
    return clean.map((p) => new Vector2(p[0], -p[1]));
  });
}
export function fill(
  batch: Batch,
  poly: MapPolygon,
  y: number,
  color: Color,
  drape: boolean | 'water' = false,
  rank = 0,
) {
  const rings = contours(poly);
  if (rings[0].length < 3) return;
  const all = rings.flat();
  for (const face of ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
    const p = face.map((i) => [all[i].x, y, -all[i].y]);
    if (drape) terrainTriangle(batch, p[0], p[1], p[2], color, rank, drape === 'water');
    else batch.triangle(p[0], p[1], p[2], color, rankUv(rank));
  }
}
let linearStrip = false;
export function strip(
  batch: Batch,
  a: Point,
  b: Point,
  width: number,
  y: number,
  color: Color,
  yB = y,
  rank = 0,
  hole = 0,
) {
  const uv = rankUv(rank);
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    len = Math.hypot(dx, dz);
  if (len < 1e-6) return;
  if (hole > 0 && !linearStrip && terrain.tiles.length) {
    // Only the two margins outside `hole` (centred): the middle lies under asphalt the patch owns.
    band(batch, a, b, hole / 2, width / 2, y, color, yB, rank);
    band(batch, a, b, -width / 2, -hole / 2, y, color, yB, rank);
    return;
  }
  const nx = ((-dz / len) * width) / 2,
    nz = ((dx / len) * width) / 2;
  if (linearStrip || !terrain.tiles.length) {
    const p = [
      [a[0] + nx, y, a[1] + nz],
      [b[0] + nx, yB, b[1] + nz],
      [b[0] - nx, yB, b[1] - nz],
      [a[0] - nx, y, a[1] - nz],
    ];
    batch.triangle(p[0], p[1], p[2], color, uv);
    batch.triangle(p[0], p[2], p[3], color, uv);
    return;
  }
  const corners: Point[] = [
    [a[0] + nx, a[1] + nz],
    [b[0] + nx, b[1] + nz],
    [b[0] - nx, b[1] - nz],
    [a[0] - nx, a[1] - nz],
  ];
  const offsetA = y - terrain.groundHeight(...a),
    offsetB = yB - terrain.groundHeight(...b);
  const height = (p: Point, ground: Plane) => {
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (len * len)));
    return ground.at(...p) + offsetA * (1 - t) + offsetB * t;
  };
  for (const face of [
    [0, 1, 2],
    [0, 2, 3],
  ])
    terrain.drape(corners[face[0]], corners[face[1]], corners[face[2]], (p, q, r, ground) => {
      batch.triangle(
        [p[0], height(p, ground), p[1]],
        [q[0], height(q, ground), q[1]],
        [r[0], height(r, ground), r[1]],
        color,
        uv,
      );
    });
}
/**
 * A draped band parallel to a segment between lateral offsets `from` and `to` (scene units, + towards
 * (−dz, dx)), with exactly the heights strip() gives the same points: terrain plus the end offsets tapered along it.
 */
function band(batch: Batch, a: Point, b: Point, from: number, to: number, y: number, color: Color, yB: number, rank: number) {
  const uv = rankUv(rank);
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    len = Math.hypot(dx, dz),
    ux = -dz / len,
    uz = dx / len;
  const corners: Point[] = [
    [a[0] + ux * to, a[1] + uz * to],
    [b[0] + ux * to, b[1] + uz * to],
    [b[0] + ux * from, b[1] + uz * from],
    [a[0] + ux * from, a[1] + uz * from],
  ];
  const offsetA = y - terrain.groundHeight(...a),
    offsetB = yB - terrain.groundHeight(...b);
  const height = (p: Point, ground: Plane) => {
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (len * len)));
    return ground.at(...p) + offsetA * (1 - t) + offsetB * t;
  };
  for (const face of [
    [0, 1, 2],
    [0, 2, 3],
  ])
    terrain.drape(corners[face[0]], corners[face[1]], corners[face[2]], (p, q, r, ground) => {
      batch.triangle([p[0], height(p, ground), p[1]], [q[0], height(q, ground), q[1]], [r[0], height(r, ground), r[1]], color, uv);
    });
}
/**
 * Step 5.1 optimisation — asphalt ownership on breakline patches. A member road (terrain.json mesh.patches.members)
 * lies on a patch whose asphalt outline is made of mesh edges, at exactly the drawn road surface (its end offsets
 * are 0). The patch's asphalt triangles (class 1) are drawn once as asphalt; the member's own asphalt strip and its
 * draped junction fans are not drawn over them again, and its kerb draws only the visible margins, starting exactly
 * at the outline (a mesh edge: nothing inside the asphalt is clipped; even 2 cm of overlap cost 38 k triangles).
 * road_patches.py widens an outline (+3/+8 cm) before it narrows one, so the asphalt never stops short of the kerb.
 */
const patchMembers = new Set(terrain.data.mesh?.patches?.classesBase64 ? (terrain.data.mesh.patches.members ?? []) : []);
const segmentKey = (r: MapRoad) => `${r.a[0].toFixed(3)},${r.a[1].toFixed(3)}|${r.b[0].toFixed(3)},${r.b[1].toFixed(3)}`;
export const ownedByPatch = (whole: MapRoad) => patchMembers.size > 0 && patchMembers.has(segmentKey(whole));
function roof(batch: Batch, b: MapBuilding, y: number, color: Color) {
  let r = b.rings[0].slice(0, -1);
  // Four-sided footprints get an actual ridge and four sloped roof planes.
  if (r.length === 4 && b.rings.length === 1 && b.roofShape !== 'flat' && b.kind !== 'roof') {
    const len = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (len(r[0], r[1]) < len(r[1], r[2])) r = [r[1], r[2], r[3], r[0]];
    const a = [(r[0][0] + r[3][0]) / 2, (r[0][1] + r[3][1]) / 2],
      b1 = [(r[1][0] + r[2][0]) / 2, (r[1][1] + r[2][1]) / 2];
    const h = Math.min(0.22, len(r[0], r[3]) * 0.28),
      p = r.map((q) => [q[0], y, q[1]]);
    const u = [a[0] * 0.8 + b1[0] * 0.2, y + h, a[1] * 0.8 + b1[1] * 0.2],
      v = [a[0] * 0.2 + b1[0] * 0.8, y + h, a[1] * 0.2 + b1[1] * 0.8];
    for (const tri of [
      [p[0], p[1], v],
      [p[0], v, u],
      [p[1], p[2], v],
      [p[2], p[3], u],
      [p[2], u, v],
      [p[3], p[0], u],
    ])
      batch.triangle(...(tri as [number[], number[], number[]]), color);
  } else fill(batch, b, y, color);
}

function buildTerrain(): CityLayers {
  const land = new Batch(),
    water = new Batch(),
    banks = new Batch();
  const colors: Record<string, string> = {
    farmland: '#a8ad76',
    apron: '#929a9b',
    residential: '#bdb7a9',
    industrial: '#aaa9a2',
    square: '#c6bcaa',
    grass: '#83a663',
    cemetery: '#6c9560',
    wood: '#648b51',
    pitch: '#559451',
    water: '#4b848c',
  };
  const levels: Record<string, number> = {
    farmland: 0.003,
    apron: 0.04,
    residential: 0.005,
    industrial: 0.007,
    square: 0.014,
    grass: 0.021,
    cemetery: 0.022,
    wood: 0.023,
    pitch: 0.035,
    water: terrainLevels.water,
  };
  if (terrain.tiles.length) {
    fill(
      land,
      { id: 'measured-rail-cut', rings: [trenchRing as Point[]] },
      terrainLevels.ground,
      new Color('#8b887b'),
      true,
      LAYER_RANK.cover,
    );
  } else {
    // A dry rail cutting under Ingelstagatan. Only the mapped road bridge crosses its open centre.
    for (let u = -6.5; u < 6.49; u += 0.25)
      for (const [v1, v2] of [
        [-1.05, -0.73],
        [-0.73, 0.73],
        [0.73, 1.05],
      ]) {
        const points = [
          trenchPoint(u, v1),
          trenchPoint(u + 0.25, v1),
          trenchPoint(u + 0.25, v2),
          trenchPoint(u, v2),
        ];
        const q = points.map((p) => [
          p[0],
          terrain.sample(p[0], p[1])?.sceneY ?? terrainLevels.ground - trenchDepth(p),
          p[1],
        ]);
        banks.quad(q[0], q[1], q[2], q[3], new Color(v1 === -0.73 ? '#8b887b' : '#7e8b69'));
      }
  }
  for (const poly of cityMap.ground)
    fill(land, poly, terrainLevels.ground, new Color('#a7ac80'), true, LAYER_RANK.ground);
  // Dry banks inside OSM water polygons are ground: the shoreline there is where the DTM meets the water.
  if (terrain.measured)
    for (const bank of dryBanks)
      fill(land, { id: bank.area, rings: bank.rings }, terrainLevels.ground, new Color('#a7ac80'), true, LAYER_RANK.ground);
  // Measured water (waterReaches.ts) is flat at its reach level. Its shoreline gets a bank or quay
  // face from just below the water up to the rendered ground (or up to the water, where the ground at
  // the OSM shoreline is lower), so land and water always meet; reaches meet at fall faces.
  const measuredWater = terrain.measured;
  if (measuredWater) {
    const bankColor = (p: Point) =>
      new Color(p[0] > -28.5 && p[0] < 23.2 && p[1] > -25.5 && p[1] < 10.5 ? '#89877c' : '#7d8462');
    for (const surface of waterSurfaces)
      for (const ring of surface.rings)
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          if (isFallEdge(a, b)) continue;
          const gA = terrain.groundHeight(...a),
            gB = terrain.groundHeight(...b);
          const bottomA = Math.min(gA, surface.y) - BANK_DEPTH,
            bottomB = Math.min(gB, surface.y) - BANK_DEPTH,
            topA = Math.max(gA, surface.y),
            topB = Math.max(gB, surface.y);
          banks.quad(
            [a[0], bottomA, a[1]],
            [b[0], bottomB, b[1]],
            [b[0], topB, b[1]],
            [a[0], topA, a[1]],
            bankColor([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]),
          );
        }
    const foam = new Color('#8fb9b9');
    for (const f of waterFalls)
      water.quad(
        [f.a[0], f.lower - BANK_DEPTH, f.a[1]],
        [f.b[0], f.lower - BANK_DEPTH, f.b[1]],
        [f.b[0], f.upper, f.b[1]],
        [f.a[0], f.upper, f.a[1]],
        foam,
      );
  }
  // Actual cut banks down to the lower water; no opaque ground plane beneath the river.
  // Water without a measured level (unmeasured areas; draped parts of measured ones) follows the terrain.
  const closed = (ring: Point[]) => [...ring, ring[0]];
  for (const area of [
    ...cityMap.areas.filter((a) => a.kind === 'water' && (!measuredWater || unmeasuredWater.has(a.id))),
    ...(measuredWater ? drapedWater.map((d) => ({ rings: d.rings.map(closed) })) : []),
  ])
    for (const ring of area.rings)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i];
        const central =
          (a[0] + b[0]) / 2 > -28.5 &&
          (a[0] + b[0]) / 2 < 23.2 &&
          (a[1] + b[1]) / 2 > -25.5 &&
          (a[1] + b[1]) / 2 < 10.5;
        const color = new Color(central ? '#89877c' : '#7d8462');
        // The bank top is the measured ground at the shoreline (legacy: +0.024 above the plane).
        const bottomA = terrain.waterHeight(a[0], a[1]) - 0.04,
          bottomB = terrain.waterHeight(b[0], b[1]) - 0.04,
          topA = terrain.placeLegacy(a[0], a[1], terrainLevels.bankTop, terrainLevels.bankTop),
          topB = terrain.placeLegacy(b[0], b[1], terrainLevels.bankTop, terrainLevels.bankTop);
        banks.quad(
          [a[0], bottomA, a[1]],
          [b[0], bottomB, b[1]],
          [b[0], topB, b[1]],
          [a[0], topA, a[1]],
          color,
        );
        banks.quad(
          [a[0], topA, a[1]],
          [b[0], topB, b[1]],
          [b[0], bottomB, b[1]],
          [a[0], bottomA, a[1]],
          color,
        );
      }
  // Legacy levels only order the flat preview; on the DTM every kind lies on the ground surface and
  // overlapping kinds are ordered by depth rank (COVER_ORDER follows the same legacy level order).
  for (const surface of measuredWater ? waterSurfaces : [])
    fill(water, { id: surface.area, rings: surface.rings }, surface.y, new Color(colors.water));
  for (const part of measuredWater ? drapedWater : [])
    fill(water, { id: part.area, rings: part.rings }, levels.water, new Color(colors.water), 'water');
  for (const area of [...cityMap.areas]
    .filter((a) => a.kind !== 'water' || !measuredWater || unmeasuredWater.has(a.id))
    .sort((a, b) => levels[a.kind] - levels[b.kind]))
    fill(
      area.kind === 'water' ? water : land,
      area,
      levels[area.kind],
      new Color(colors[area.kind]),
      area.kind === 'water' ? 'water' : true,
      area.kind === 'water'
        ? 0
        : LAYER_RANK.cover + COVER_ORDER.indexOf(area.kind as (typeof COVER_ORDER)[number]),
    );
  return { banks: banks.geometries(), land: land.geometries(), water: water.geometries() };
}

/**
 * Network layers relative to the reference heights yA/yB (terrain.roadHeight). Every running
 * surface (kerb edge, asphalt, paths, ballast, markings) is the measured street surface
 * (reference + ROAD_SURFACE); depth ranks order them. Rails follow the rail track contract
 * (trackProfile.ts): rail head above that surface per track kind, at standard gauge. Rail vehicles
 * (RailTraffic.kt) rest on exactly these rail tops.
 */
/**
 * Height of a segment's drawn surface (+ lift above the reference) at parameter t and point p: the
 * same draped surface as its strips (terrain + the segment's own offset, linear along it), so
 * markings and rails beside the centreline stay on the road instead of cutting through it.
 */
export function surfaceAt(r: MapRoad, t: number, p: Point, lift: number) {
  const span = spanHeight(r.spans, t);
  if (span !== undefined) return span + lift;
  if (r.linearProfile || !terrain.tiles.length) return r.yA + (r.yB - r.yA) * t + lift;
  const offsetA = r.yA - terrain.groundHeight(...r.a),
    offsetB = r.yB - terrain.groundHeight(...r.b);
  return terrain.groundHeight(...p) + offsetA * (1 - t) + offsetB * t + lift;
}
/**
 * A band parallel to a segment's centreline, from lateral offset `left` to `right` (scene units, +
 * towards (−dz, dx)), whose height across the band is that of the centreline profile (surfaceAt at the
 * centre + lift): a level cross-section. Breaks at the centreline's mesh edge crossings, so the
 * profile is exactly the one vehicles use (terrain.profileHeight).
 */
export function profileStrip(
  batch: Batch,
  r: MapRoad,
  left: number,
  right: number,
  lift: number,
  color: Color,
  rank = 0,
) {
  const dx = r.b[0] - r.a[0],
    dz = r.b[1] - r.a[1],
    len = Math.hypot(dx, dz);
  if (len < 1e-6) return;
  const nx = -dz / len,
    nz = dx / len,
    uv = rankUv(rank);
  const ts = r.linearProfile || !terrain.tiles.length ? [0, 1] : terrain.lineBreaks(r.a, r.b);
  const at = (t: number) => {
    const c: Point = [r.a[0] + dx * t, r.a[1] + dz * t];
    return { c, h: surfaceAt(r, t, c, lift) };
  };
  let p = at(ts[0]);
  for (let i = 1; i < ts.length; i++) {
    const q = at(ts[i]);
    const corners = [
      [p.c[0] + nx * left, p.h, p.c[1] + nz * left],
      [q.c[0] + nx * left, q.h, q.c[1] + nz * left],
      [q.c[0] + nx * right, q.h, q.c[1] + nz * right],
      [p.c[0] + nx * right, p.h, p.c[1] + nz * right],
    ];
    batch.triangle(corners[0], corners[1], corners[2], color, uv);
    batch.triangle(corners[0], corners[2], corners[3], color, uv);
    p = q;
  }
}
/**
 * A segment as drawn: itself, or (with engineered spans over an underpass or culvert) its draped parts
 * and its linear span parts as sub-segments with their own reference heights.
 */
export function networkPieces(r: MapRoad): MapRoad[] {
  if (!r.spans?.length) return [r];
  const at = (t: number): Point => [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];
  const draped = { ...r, spans: undefined },
    pieces: MapRoad[] = [];
  const part = (t0: number, t1: number, span: SpanPiece | null) => {
    if (t1 - t0 < 1e-9) return;
    const a = at(t0),
      b = at(t1);
    pieces.push({
      ...r,
      a,
      b,
      spans: undefined,
      linearProfile: !!span || !!r.linearProfile,
      yA: span ? span.y0 + ((span.y1 - span.y0) * (t0 - span.t0)) / (span.t1 - span.t0 || 1) : surfaceAt(draped, t0, a, 0),
      yB: span ? span.y0 + ((span.y1 - span.y0) * (t1 - span.t0)) / (span.t1 - span.t0 || 1) : surfaceAt(draped, t1, b, 0),
    });
  };
  let t = 0;
  for (const s of [...r.spans].sort((p, q) => p.t0 - q.t0)) {
    part(t, s.t0, null);
    part(Math.max(t, s.t0), s.t1, s);
    t = Math.max(t, s.t1);
  }
  part(t, 1, null);
  return pieces;
}
/** Largest gap between a flat triangle and the surface `at` at its centroid and edge midpoints. */
function fanDeviation(corners: Point[], at: (x: number, z: number) => number) {
  const h = corners.map((p) => at(...p));
  let worst = 0;
  for (const [wa, wb, wc] of [
    [1 / 3, 1 / 3, 1 / 3],
    [0.5, 0.5, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
  ]) {
    const x = corners[0][0] * wa + corners[1][0] * wb + corners[2][0] * wc,
      z = corners[0][1] * wa + corners[1][1] * wb + corners[2][1] * wc;
    worst = Math.max(worst, Math.abs(at(x, z) - (h[0] * wa + h[1] * wb + h[2] * wc)));
  }
  return worst;
}
/** One end of a road segment at a junction. */
export interface FanEnd {
  r: MapRoad;
  t: number;
  /** Deck, span or other linear piece at this end. */
  linear: boolean;
}
/**
 * A junction wedge at a node where a linear piece meets (Step 5): node at its level, the two outer corners
 * at the drawn heights of the strips they belong to (surfaceAt), so the wedge meets both strips. Between
 * two linear strips it is the plane through those points. Otherwise it is either that plane or the terrain
 * with the node and corner offsets interpolated, whichever deviates less from the strips at the midpoints
 * of its two shared edges (a straight linear strip end vs a terrain-following draped one). `lift` is set
 * for the draped form: height = terrain plane + lift.
 */
export function fanWedge(point: Point, y: number, ground: number, a: { x: number; z: number; e: FanEnd }, b: { x: number; z: number; e: FanEnd }) {
  const S = ROAD_SURFACE;
  const corners: Point[] = [point, [point[0] + b.x, point[1] + b.z], [point[0] + a.x, point[1] + a.z]];
  const heights = [y + S, surfaceAt(b.e.r, b.e.t, corners[1], S), surfaceAt(a.e.r, a.e.t, corners[2], S)];
  const ex1 = corners[1][0] - point[0],
    ez1 = corners[1][1] - point[1],
    ex2 = corners[2][0] - point[0],
    ez2 = corners[2][1] - point[1],
    det = ex1 * ez2 - ez1 * ex2;
  const interpolate = (v: number[]) => (x: number, z: number) => {
    const px = x - point[0],
      pz = z - point[1],
      w1 = (px * ez2 - pz * ex2) / det,
      w2 = (ex1 * pz - ez1 * px) / det;
    return v[0] + (v[1] - v[0]) * w1 + (v[2] - v[0]) * w2;
  };
  const plane = interpolate(heights);
  if (!terrain.tiles.length || (a.e.linear && b.e.linear)) return { corners, at: plane, lift: null };
  if (a.e.linear !== b.e.linear) {
    // Step 5.1: one linear and one draped edge. Neither a plane (exact on the linear edge) nor a lifted drape
    // (exact on the draped one) meets both strips; mid-edge creases up to 0.27 m remained. Blend: the plane
    // plus the terrain's departure from its own corner plane, weighted from 0 on the linear edge to 1 on the
    // draped edge (beta = the draped corner's share of the two outer barycentric weights). On each shared
    // edge the wedge equals its strip exactly; inside a single terrain triangle it is the plane.
    const groundPlane = interpolate([ground, terrain.groundHeight(...corners[1]), terrain.groundHeight(...corners[2])]);
    const at = (x: number, z: number) => {
      const px = x - point[0],
        pz = z - point[1],
        w1 = (px * ez2 - pz * ex2) / det,
        w2 = (ex1 * pz - ez1 * px) / det,
        s = w1 + w2,
        beta = s > 1e-12 ? Math.min(1, Math.max(0, (b.e.linear ? w2 : w1) / s)) : 0;
      return plane(x, z) + beta * (terrain.groundHeight(x, z) - groundPlane(x, z));
    };
    return { corners, at, lift: (x: number, z: number) => at(x, z) - terrain.groundHeight(x, z) };
  }
  const lift = interpolate([
    heights[0] - ground,
    heights[1] - terrain.groundHeight(...corners[1]),
    heights[2] - terrain.groundHeight(...corners[2]),
  ]);
  const draped = (x: number, z: number) => terrain.groundHeight(x, z) + lift(x, z);
  const misfit = (f: (x: number, z: number) => number) => {
    let worst = 0;
    for (const [e, c] of [
      [b.e, corners[1]],
      [a.e, corners[2]],
    ] as [FanEnd, Point][]) {
      const m: Point = [(point[0] + c[0]) / 2, (point[1] + c[1]) / 2];
      worst = Math.max(worst, Math.abs(f(...m) - surfaceAt(e.r, e.t, m, S)));
    }
    return worst;
  };
  return misfit(plane) < misfit(draped) ? { corners, at: plane, lift: null } : { corners, at: draped, lift };
}
function buildNetwork(): CityLayers {
  const roads = new Batch();
  const S = ROAD_SURFACE;
  for (const whole of cityMap.roads)
    for (const r of networkPieces(whole)) {
      linearStrip = !!r.linearProfile;
      const y = r.yA ?? LEGACY_LEVELS.road;
      if (r.kind === 'road') {
        // Asphalt of a patch member is drawn from the patch (ownedByPatch); its kerb only outside it.
        const owned = !r.linearProfile && ownedByPatch(whole);
        strip(roads, r.a, r.b, r.width + 0.1, y + S, new Color('#b1b0a8'), r.yB + S, LAYER_RANK.kerb, owned ? r.width : 0);
        if (!owned) strip(roads, r.a, r.b, r.width, y + S, new Color('#41494e'), r.yB + S, LAYER_RANK.asphalt);
      } else if (r.kind === 'path') {
        const mid = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
        const inCut =
          !terrain.tiles.length &&
          (trenchDepth(r.a) > 0 || trenchDepth(r.b) > 0 || trenchDepth(mid) > 0);
        const count = inCut ? Math.ceil(Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) / 0.08) : 1;
        for (let i = 0; i < count; i++) {
          const point = (t: number): Point => [
            r.a[0] + (r.b[0] - r.a[0]) * t,
            r.a[1] + (r.b[1] - r.a[1]) * t,
          ];
          const a = point(i / count),
            b = point((i + 1) / count);
          strip(
            roads,
            a,
            b,
            Math.max(r.width, 0.06),
            y +
              ((r.yB - y) * i) / count +
              S -
              (r.bridge || terrain.tiles.length ? 0 : trenchDepth(a)),
            new Color('#cbbfa4'),
            y +
              ((r.yB - y) * (i + 1)) / count +
              S -
              (r.bridge || terrain.tiles.length ? 0 : trenchDepth(b)),
            LAYER_RANK.path,
          );
        }
      } else if (r.kind === 'stream')
        continue; // Open waterways are part of the carved water mask.
      else {
        const dx = r.b[0] - r.a[0],
          dz = r.b[1] - r.a[1],
          len = Math.hypot(dx, dz);
        // Ballast lies on the measured ground (legacy: 0.008 below the reference, i.e. 2.2 m up).
        if (r.kind === 'rail')
          strip(
            roads,
            r.a,
            r.b,
            0.15,
            y + S,
            new Color(r.bridge ? '#777d78' : '#8c8778'),
            r.yB + S,
            LAYER_RANK.ballast,
          );
        if (r.bridge)
          strip(
            roads,
            r.a,
            r.b,
            r.kind === 'rail' ? 0.24 : 0.16,
            y - 0.018,
            new Color('#92978d'),
            r.yB - 0.018,
            LAYER_RANK.ballast,
          );
        // Both rails at the centreline's rail-top height (a level track), the surface vehicles ride on.
        const lift = railLift(r.kind === 'rail' ? 'rail' : 'tram');
        for (const offset of [-RAIL_OFFSET, RAIL_OFFSET])
          profileStrip(roads, r, offset + 0.006, offset - 0.006, lift, new Color('#b2a484'), LAYER_RANK.rail);
      }
    }
  // Join incident road edges at their shared endpoint. Filling the wedges avoids
  // grass slivers in bends without adding one mesh per street segment.
  const junctions = new Map<
    string,
    {
      point: Point;
      y: number;
      edges: { dx: number; dz: number; width: number; r: MapRoad; t: number; linear: boolean }[];
    }
  >();
  for (const r of cityMap.roads.filter((r) => r.kind === 'road')) {
    const dx = r.b[0] - r.a[0],
      dz = r.b[1] - r.a[1],
      len = Math.hypot(dx, dz);
    for (const [point, node, t] of [
      [r.a, r.yA, 0],
      [r.b, r.yB, 1],
    ] as [Point, number, number][]) {
      // A node inside an engineered span takes the span's height.
      const span = spanHeight(r.spans, t),
        y = span ?? node;
      const key = point.join(',') + ',' + y;
      if (!junctions.has(key)) junctions.set(key, { point, y, edges: [] });
      junctions.get(key)!.edges.push({
        dx: dx / len,
        dz: dz / len,
        width: r.width,
        r,
        t,
        linear: !!r.linearProfile || span !== undefined,
      });
    }
  }
  const measured = terrain.tiles.length > 0;
  for (const { point, y, edges } of junctions.values()) {
    if (edges.length < 2) continue;
    // Step 5: each wedge meets the strips it joins at their own corners (surfaceAt), and the node at its
    // level. Ordinary junctions are draped as before; a wedge between two linear pieces (decks, spans) is
    // the plane through its corners; a mixed wedge is draped with its corner offsets interpolated. Before,
    // a junction with any linear piece was drawn flat at the node level, so on slopes its corners missed
    // the draped strips beside it (up to 1.7 m, infraDiagnostics junctionFans).
    const ground = measured ? terrain.groundHeight(...point) : 0;
    // Without a linear piece every corner offset equals the node's (surfaceAt of a draped end), so the
    // wedge is the terrain plus that offset: no strip evaluation needed (the common case, and fast).
    const mixed = edges.some((e) => e.linear);
    // A draped junction of patch members lies in the patch's asphalt (drawn from the patch below): its kerb only.
    const ownedFan = measured && !mixed && edges.every((e) => ownedByPatch(e.r));
    for (const [extra, rank, color] of [
      [0.1, LAYER_RANK.kerb, '#b1b0a8'],
      [0, LAYER_RANK.asphalt, '#41494e'],
    ] as [number, number, string][]) {
      if (ownedFan && rank === LAYER_RANK.asphalt) continue;
      const offsets = edges
        .flatMap((e) =>
          [-1, 1].map((side) => ({
            x: ((-e.dz * (e.width + extra)) / 2) * side,
            z: ((e.dx * (e.width + extra)) / 2) * side,
            e,
          })),
        )
        .sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
      for (let i = 0; i < offsets.length; i++) {
        const a = offsets[i],
          b = offsets[(i + 1) % offsets.length];
        if (Math.abs(a.x * b.z - a.z * b.x) < 1e-8) continue;
        const c = new Color(color),
          uv = rankUv(rank),
          corners: Point[] = [
            point,
            [point[0] + b.x, point[1] + b.z],
            [point[0] + a.x, point[1] + a.z],
          ];
        if (measured && !mixed) {
          const at = (x: number, z: number) => y + S + terrain.groundHeight(x, z) - ground;
          if (fanDeviation(corners, at) > 2e-5)
            terrain.drape(corners[0], corners[1], corners[2], (p, q, s, plane) => {
              const on = (r: Point) => y + S + plane.at(...r) - ground;
              roads.triangle([p[0], on(p), p[1]], [q[0], on(q), q[1]], [s[0], on(s), s[1]], c, uv);
            });
          else
            roads.triangle(
              [corners[0][0], at(...corners[0]), corners[0][1]],
              [corners[1][0], at(...corners[1]), corners[1][1]],
              [corners[2][0], at(...corners[2]), corners[2][1]],
              c,
              uv,
            );
          continue;
        }
        const wedge = fanWedge(point, y, ground, a, b);
        if (!wedge.lift) {
          roads.triangle(
            [corners[0][0], wedge.at(...corners[0]), corners[0][1]],
            [corners[1][0], wedge.at(...corners[1]), corners[1][1]],
            [corners[2][0], wedge.at(...corners[2]), corners[2][1]],
            c,
            uv,
          );
          continue;
        }
        const lift = wedge.lift;
        // Most fans lie within one planar mesh triangle; only clip those that would leave the surface.
        if (fanDeviation(corners, wedge.at) > 2e-5)
          terrain.drape(corners[0], corners[1], corners[2], (p, q, s, plane) => {
            const on = (r: Point) => plane.at(...r) + lift(...r);
            roads.triangle([p[0], on(p), p[1]], [q[0], on(q), q[1]], [s[0], on(s), s[1]], c, uv);
          });
        else
          roads.triangle(
            [corners[0][0], wedge.at(...corners[0]), corners[0][1]],
            [corners[1][0], wedge.at(...corners[1]), corners[1][1]],
            [corners[2][0], wedge.at(...corners[2]), corners[2][1]],
            c,
            uv,
          );
      }
    }
  }
  // The asphalt of patch members, once, from the patch's own triangles (exact surface heights).
  const asphalt = new Color('#41494e'),
    asphaltUv = rankUv(LAYER_RANK.asphalt);
  terrain.surface?.patchTriangles(1, (a, b, c) => roads.triangle(a, b, c, asphalt, asphaltUv));
  return { roads: roads.geometries() };
}

/** Thin broken centre lines preserve both directions without becoming a white grid. */
function buildMarkings(): CityLayers {
  const markings = new Batch();
  for (const r of cityMap.roads
    .filter(
      (r) =>
        r.kind === 'road' && r.width > 0.22 && r.class !== 'service' && (!r.oneway || r.lanes > 1),
    )
    .flatMap(networkPieces)) {
    linearStrip = !!r.linearProfile;
    const dx = r.b[0] - r.a[0],
      dz = r.b[1] - r.a[1],
      len = Math.hypot(dx, dz);
    if (len < 0.22) continue;
    for (let d = 0.06; d < len - 0.04; d += 0.24) {
      const end = Math.min(d + 0.1, len - 0.03);
      const a: Point = [r.a[0] + (dx * d) / len, r.a[1] + (dz * d) / len],
        b: Point = [r.a[0] + (dx * end) / len, r.a[1] + (dz * end) / len];
      strip(
        markings,
        a,
        b,
        0.006,
        surfaceAt(r, d / len, a, ROAD_SURFACE),
        new Color('#d4d3bd'),
        surfaceAt(r, end / len, b, ROAD_SURFACE),
        LAYER_RANK.marking,
      );
    }
    if (['motorway', 'trunk', 'primary'].includes(r.class))
      for (const side of [-1, 1]) {
        const ox = (-dz / len) * r.width * 0.45 * side,
          oz = (dx / len) * r.width * 0.45 * side;
        const a: Point = [r.a[0] + ox, r.a[1] + oz],
          b: Point = [r.b[0] + ox, r.b[1] + oz];
        strip(
          markings,
          a,
          b,
          0.007,
          surfaceAt(r, 0, a, ROAD_SURFACE),
          new Color('#c7c6b4'),
          surfaceAt(r, 1, b, ROAD_SURFACE),
          LAYER_RANK.marking,
        );
      }
  }
  return { markings: markings.geometries() };
}

/**
 * Wall bottom of an OSM building before min_height: the lowest rendered ground under the footprint.
 * OSM / Simple 3D Buildings heights are measured from the lowest ground contact, so walls reach the
 * ground on the downhill side and continue below it uphill. (Legacy: ground at the first ring
 * vertex + 0.065 units, i.e. 1.6 m above it.)
 */
export function buildingBase(b: MapPolygon) {
  if (!terrain.measured) {
    const anchor = b.rings[0][0];
    return terrain.relativeHeight(anchor[0], anchor[1], LEGACY_LEVELS.buildingBase);
  }
  return terrain.footprintGround(b.rings);
}
function buildBuildings(): CityLayers {
  const walls = new Batch(),
    roofs = new Batch();
  // A cornice runs along the flat roof edge (wall top + 0.007): a linear strip at that height. It used
  // to be draped, i.e. it copied the terrain relief 10–30 m below the roof and was cut at every mesh
  // triangle (0.9 M triangles for what are ~4 per wall edge).
  linearStrip = true;
  const cornices = new Batch();
  for (const source of cityMap.buildings) {
    const point = source.rings[0][0];
    const airport = point[0] > 96.7 && point[0] < 124 && point[1] > 21.8 && point[1] < 38.3;
    const clubhouse = ['way/1059584509', 'way/1059584510', 'way/1059584511'].includes(source.id);
    const b =
      airport || clubhouse
        ? {
            ...source,
            height: airport ? 0.24 : 0.12,
            roofShape: 'flat',
            wall: airport ? '#a9b6b7' : '#d0c9ad',
            roof: '#515d62',
          }
        : source;
    if (replacedBuildings.has(b.id) || DETAILED_BUILDING_IDS.has(b.id)) continue;
    const base = buildingBase(b);
    const y = base + b.height,
      bottom = base + b.minHeight,
      color = new Color(b.wall),
      roofColor = new Color(b.roof);
    // Real black roofing still reflects light; avoid a zero-reflectance surface.
    if (roofColor.getHex() === 0) roofColor.set('#34383a');
    for (const ring of b.rings)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          c = ring[i],
          length = Math.hypot(a[0] - c[0], a[1] - c[1]);
        // Double-sided material handles OSM ring winding; UVs retain consistent window spacing.
        walls.quad(
          [a[0], bottom, a[1]],
          [c[0], bottom, c[1]],
          [c[0], y, c[1]],
          [a[0], y, a[1]],
          color,
          Math.max(1, Math.round(length / 0.17)),
          Math.max(1, Math.round((y - bottom) / 0.13)),
        );
        strip(cornices, a, c, 0.035, y + 0.007, new Color('#bcb2a1'));
      }
    roof(roofs, b, y + 0.015, roofColor);
  }
  const surveyed = new Batch();
  for (const building of measuredBuildings) {
    const vertices = buildingVertices(building);
    for (const [a, b, c] of building.triangles)
      surveyed.triangle(vertices[a], vertices[b], vertices[c], new Color('#bcb7aa'));
  }
  return {
    surveyed: surveyed.geometries(),
    walls: walls.geometries(),
    roofs: roofs.geometries(),
    cornices: cornices.geometries(),
  };
}

const BUILDERS: Record<CityTask, () => CityLayers> = {
  terrain: buildTerrain,
  network: buildNetwork,
  buildings: () => ({ ...buildBuildings(), ...buildMarkings() }),
};
/** Exposed for timing the task balance (scripts and tests). */
export const LAYER_BUILDERS = { buildTerrain, buildNetwork, buildMarkings, buildBuildings };

/** Build the requested tasks' layers. Geometries come with bounding spheres computed. */
export function buildCityLayers(
  tasks: readonly CityTask[] = Object.keys(CITY_TASKS) as CityTask[],
): CityLayers {
  const layers: CityLayers = {};
  for (const task of tasks) Object.assign(layers, BUILDERS[task]());
  return layers;
}
