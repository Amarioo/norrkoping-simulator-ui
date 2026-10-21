import bridgeProfiles from './data/bridge-profiles.json';
import { ShapeUtils, Vector2 } from 'three';
import { cityJson } from './cityData';
import { Plane, SurfaceMesh, decodeBits, type Point, type SurfaceMeshData } from './surfaceMesh';
import {
  geodeticToScene,
  sceneToGeodetic,
  sceneToSweref,
  swerefToScene,
  trueNorth,
} from './geo/sweref99tm.js';

/**
 * Horizontal scene contract (dataset version 2, shared with TerrainService.kt):
 * scene = (SWEREF 99 TM − origin) / (metresPerUnit · gridScaleFactor); x east, z south.
 * See src/lib/geo/sweref99tm.js.
 */
export interface GeoReference {
  crs: 'EPSG:3006';
  originEasting: number;
  originNorthing: number;
  /** SWEREF 99 TM point scale factor at the origin; makes one unit `metresPerUnit` ground metres. */
  gridScaleFactor: number;
  /** True north relative to grid north at the origin, degrees, positive east. */
  gridConvergenceDegrees: number;
  metresPerUnit: number;
  verticalDatum: 'RH2000';
  verticalOriginMetres: number;
}
export const TERRAIN_DATASET_VERSION = 2;
/** Part [t0, t1] of a network segment that bridges a trench linearly (reference heights y0 → y1). */
export interface SpanPiece {
  t0: number;
  t1: number;
  y0: number;
  y1: number;
}
/** Reference height of a segment at t inside one of its spans, else undefined. */
export function spanHeight(spans: SpanPiece[] | undefined, t: number) {
  if (!spans) return undefined;
  for (const s of spans)
    if (t >= s.t0 - 1e-9 && t <= s.t1 + 1e-9)
      return s.t1 - s.t0 < 1e-12 ? s.y0 : s.y0 + ((s.y1 - s.y0) * (t - s.t0)) / (s.t1 - s.t0);
  return undefined;
}
/**
 * Levels of the pre-DTM flat scene, in scene units (src/lib/data/terrain-levels.json and the
 * hand-made models). That scene stacked its layers above a ground plane at −0.02: land cover
 * 0.003–0.04, building bases 0.045, roads 0.071 with asphalt on top (+0.006). On the DTM those
 * stacks were 0.5–2.4 m of artificial lift. With the measured terrain every layer at or below the
 * legacy street surface rests on the DTM; see ELEVATION.md.
 */
export const LEGACY_LEVELS = {
  ground: -0.02,
  buildingBase: 0.045,
  road: 0.071,
  /** Top of the legacy asphalt (road + 0.006): the street surface the city was modelled on. */
  street: 0.077,
} as const;
/** Height of the drawn road surface above a network reference height (yA/yB). */
export const ROAD_SURFACE = LEGACY_LEVELS.street - LEGACY_LEVELS.road;
export interface TerrainTile {
  id: string;
  source: string;
  sourceUrl: string;
  licence: string;
  acquired: string;
  kind: 'DTM' | 'DSM-fallback' | 'water';
  resolutionMetres: number;
  verticalAccuracyMetres: number | null;
  verticalDatum: 'RH2000';
  /** Audit trail for reprojection and any vertical datum conversion. */
  processing: string;
  x: number;
  z: number;
  step: number;
  columns: number;
  rows: number;
  /** RH2000 metres, row-major, increasing local X/east and Z/south. null = no data. */
  heights: (number | null)[] | Float32Array;
  heightsBase64?: string;
}
export interface TerrainDataset {
  version: number;
  revision: string;
  reference: GeoReference;
  tiles: TerrainTile[];
  /** Rendered ground surface of a DTM revision (scripts/prepare-terrain-mesh.py). */
  mesh?: SurfaceMeshData;
}
export interface GroundSample {
  sceneY: number;
  metresRH2000: number;
  sourceId: string;
  resolutionMetres: number;
  quality: 'measured-ground' | 'surface-fallback';
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export function validateTerrain(data: TerrainDataset) {
  const r = data.reference;
  if (
    data.version !== TERRAIN_DATASET_VERSION ||
    !data.revision ||
    !r ||
    r.crs !== 'EPSG:3006' ||
    r.verticalDatum !== 'RH2000' ||
    !Object.values(r)
      .filter((v) => typeof v === 'number')
      .every(finite) ||
    ![r.originEasting, r.originNorthing, r.gridConvergenceDegrees, r.verticalOriginMetres].every(
      finite,
    ) ||
    ![r.metresPerUnit, r.gridScaleFactor].every((v) => finite(v) && v > 0) ||
    // SWEREF 99 TM point scale factors lie between 0.9996 and ~1.0012 within Sweden.
    r.gridScaleFactor < 0.9995 ||
    r.gridScaleFactor > 1.002
  )
    throw new Error('Invalid terrain coordinate/height reference');
  const ids = new Set<string>();
  for (const t of data.tiles) {
    if (
      !t.id ||
      ids.has(t.id) ||
      !t.source ||
      !t.sourceUrl ||
      !t.licence ||
      !t.acquired ||
      !t.processing ||
      !['DTM', 'DSM-fallback', 'water'].includes(t.kind) ||
      t.verticalDatum !== r.verticalDatum ||
      ![t.x, t.z].every(finite) ||
      !finite(t.step) ||
      t.step <= 0 ||
      !finite(t.resolutionMetres) ||
      t.resolutionMetres <= 0 ||
      !(
        t.verticalAccuracyMetres === null ||
        (finite(t.verticalAccuracyMetres) && t.verticalAccuracyMetres >= 0)
      ) ||
      !Number.isInteger(t.columns) ||
      !Number.isInteger(t.rows) ||
      t.columns < 2 ||
      t.rows < 2 ||
      t.heights.length !== t.columns * t.rows ||
      !t.heights.every(
        (h) => h === null || finite(h) || (t.heights instanceof Float32Array && Number.isNaN(h)),
      )
    )
      throw new Error(`Invalid terrain tile: ${t.id}`);
    ids.add(t.id);
  }
  if (!data.revision.startsWith('lm-dtm-')) return;
  const m = data.mesh,
    tile = data.tiles.find((t) => t.id === m?.tile);
  if (
    !m ||
    m.kind !== 'rtin' ||
    !tile ||
    tile.kind !== 'DTM' ||
    Math.abs(m.step - tile.step) > 1e-12 ||
    ![m.x, m.z, ...Object.values(m.tolerancesMetres ?? {})].every(finite) ||
    !Object.keys(m.tolerancesMetres ?? {}).length ||
    !Number.isInteger(m.depth) ||
    m.depth < 1 ||
    m.depth > 12 ||
    !Number.isInteger(m.columns) ||
    !Number.isInteger(m.rows) ||
    (m.columns - 1) % 2 ** m.depth !== 0 ||
    (m.rows - 1) % 2 ** m.depth !== 0 ||
    m.columns < 2 ||
    m.rows < 2 ||
    // Mesh nodes are tile nodes: whole-node offset, covering the tile.
    Math.abs(Math.round((tile.x - m.x) / m.step) - (tile.x - m.x) / m.step) > 1e-6 ||
    Math.abs(Math.round((tile.z - m.z) / m.step) - (tile.z - m.z) / m.step) > 1e-6 ||
    m.x > tile.x + 1e-9 ||
    m.z > tile.z + 1e-9 ||
    m.x + (m.columns - 1) * m.step < tile.x + (tile.columns - 1) * tile.step - 1e-9 ||
    m.z + (m.rows - 1) * m.step < tile.z + (tile.rows - 1) * tile.step - 1e-9
  )
    throw new Error('Invalid terrain surface mesh');
}
/** Shared contract with TerrainService.kt. No vertical exaggeration or procedural terrain. */
/** A tile without its base64 source grid, once that has been decoded into `heights`. */
function withoutSourceGrid(t: TerrainTile): TerrainTile {
  if (t.heightsBase64 === undefined) return t;
  const tile = { ...t };
  delete tile.heightsBase64;
  return tile;
}
export class TerrainService {
  readonly tiles: TerrainTile[];
  /** The dataset as loaded, except for base64 grids, which `tiles` hold decoded. */
  readonly data: TerrainDataset;
  private readonly dtm: boolean;
  /** The rendered ground of a DTM revision; null for the legacy preview data. */
  readonly surface: SurfaceMesh | null = null;
  constructor(data: TerrainDataset) {
    this.dtm = data.revision.startsWith('lm-dtm-');
    const hydrated = data.tiles.map((t) => {
      if (!t.heightsBase64) return t;
      const raw = atob(t.heightsBase64);
      if (raw.length !== t.rows * t.columns * 4) throw new Error(`Invalid binary grid ${t.id}`);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const view = new DataView(bytes.buffer),
        heights = new Float32Array(t.rows * t.columns);
      for (let i = 0; i < heights.length; i++) heights[i] = view.getFloat32(i * 4, true);
      return withoutSourceGrid({ ...t, heights });
    });
    // Keeping the base64 strings as well would hold every grid twice (30 MB for the DTM).
    this.data = { ...data, tiles: data.tiles.map(withoutSourceGrid) };
    if (data.mesh) {
      const mesh = { ...data.mesh };
      delete mesh.activeBase64;
      if (mesh.patches) {
        // Decoded by SurfaceMesh; the strings are not kept twice.
        const patches = { ...mesh.patches };
        delete patches.leavesBase64;
        delete patches.verticesBase64;
        delete patches.trianglesBase64;
        mesh.patches = patches;
      }
      this.data.mesh = mesh;
    }
    validateTerrain({ ...data, tiles: hydrated });
    if (this.dtm) {
      const mesh = data.mesh!;
      this.surface = new SurfaceMesh(
        mesh,
        decodeBits(mesh),
        hydrated.find((t) => t.id === mesh.tile)!,
        (metres) => this.toSceneHeight(metres),
      );
    }
    this.tiles = hydrated.sort(
      (a, b) =>
        Number(a.kind !== 'DTM') - Number(b.kind !== 'DTM') ||
        a.resolutionMetres - b.resolutionMetres ||
        (a.verticalAccuracyMetres ?? Infinity) - (b.verticalAccuracyMetres ?? Infinity) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  }
  /** Geodetic SWEREF 99 / WGS84 degrees → scene [x, z]. */
  project(lat: number, lon: number): [number, number] {
    return geodeticToScene(this.data.reference, lat, lon);
  }
  /** Scene [x, z] → geodetic [lat, lon] degrees. */
  unproject(x: number, z: number): [number, number] {
    return sceneToGeodetic(this.data.reference, x, z);
  }
  /** SWEREF 99 TM [easting, northing] → scene [x, z]. */
  fromSweref(easting: number, northing: number): [number, number] {
    return swerefToScene(this.data.reference, easting, northing);
  }
  /** Scene [x, z] → SWEREF 99 TM [easting, northing]. */
  toSweref(x: number, z: number): [number, number] {
    return sceneToSweref(this.data.reference, x, z);
  }
  /** True for the measured Lantmäteriet DTM; false for the legacy flat preview data. */
  get measured() {
    return this.dtm;
  }
  /** Unit vector of true north in scene (x, z); grid north is (0, −1). */
  get trueNorth(): [number, number] {
    return trueNorth(this.data.reference);
  }
  toSceneHeight(metres: number) {
    return (metres - this.data.reference.verticalOriginMetres) / this.data.reference.metresPerUnit;
  }
  /** Tile that produced the latest successful sampleMetres() call. */
  private lastTile: TerrainTile | null = null;
  /**
   * Allocation-free bilinear sample in RH2000 metres, NaN when no tile covers the point.
   * Called millions of times while the city mesh is built, so it avoids temporary arrays.
   */
  private sampleMetres(x: number, z: number, water: boolean) {
    for (const tile of this.tiles) {
      if ((tile.kind === 'water') !== water) continue;
      const u = (x - tile.x) / tile.step,
        v = (z - tile.z) / tile.step;
      if (u < 0 || v < 0 || u > tile.columns - 1 || v > tile.rows - 1) continue;
      const col = Math.min(Math.floor(u), tile.columns - 2),
        row = Math.min(Math.floor(v), tile.rows - 2);
      const tx = u - col,
        tz = v - row;
      const i0 = row * tile.columns + col,
        i2 = (row + 1) * tile.columns + col,
        heights = tile.heights;
      const h0 = heights[i0],
        h1 = heights[i0 + 1],
        h2 = heights[i2],
        h3 = heights[i2 + 1];
      const w0 = (1 - tx) * (1 - tz),
        w1 = tx * (1 - tz),
        w2 = (1 - tx) * tz,
        w3 = tx * tz;
      const f0 = finite(h0),
        f1 = finite(h1),
        f2 = finite(h2),
        f3 = finite(h3);
      // A hole never becomes a zero-height peak or borrows an unrelated edge value.
      if ((w0 > 0 && !f0) || (w1 > 0 && !f1) || (w2 > 0 && !f2) || (w3 > 0 && !f3)) continue;
      this.lastTile = tile;
      return (
        0 +
        (f0 ? (h0 as number) : 0) * w0 +
        (f1 ? (h1 as number) : 0) * w1 +
        (f2 ? (h2 as number) : 0) * w2 +
        (f3 ? (h3 as number) : 0) * w3
      );
    }
    return NaN;
  }
  sample(x: number, z: number, water = false): GroundSample | null {
    if (!finite(x) || !finite(z)) throw new Error('Non-finite ground coordinates');
    const metresRH2000 = this.sampleMetres(x, z, water);
    if (Number.isNaN(metresRH2000)) return null;
    const tile = this.lastTile!;
    return {
      metresRH2000,
      sceneY: this.toSceneHeight(metresRH2000),
      sourceId: tile.id,
      resolutionMetres: tile.resolutionMetres,
      quality: tile.kind === 'DTM' ? 'measured-ground' : 'surface-fallback',
    };
  }
  /** Explicit legacy preview plane; this is NOT an RH2000 observation. */
  waterHeight(x: number, z: number) {
    if (!finite(x) || !finite(z)) throw new Error('Non-finite ground coordinates');
    const water = this.sampleMetres(x, z, true);
    if (!Number.isNaN(water)) return this.toSceneHeight(water);
    return Number.isNaN(this.sampleMetres(x, z, false)) ? -0.197 : this.groundHeight(x, z);
  }
  /**
   * The rendered ground: the adaptive mesh shared by terrain, land cover, roads and ground-level
   * models (surfaceMesh.ts). Planar within each mesh triangle.
   */
  surfaceHeight(x: number, z: number) {
    return this.surface ? this.surface.height(x, z) : (this.sample(x, z)?.sceneY ?? -0.02);
  }
  /**
   * Clips a ground-bound triangle (scene x, z) to the surface mesh. Each piece comes with the plane
   * of the mesh triangle under it, so draped layers are coplanar with the terrain.
   */
  drape(a: Point, b: Point, c: Point, emit: (a: Point, b: Point, c: Point, ground: Plane) => void) {
    if (this.surface) return this.surface.triangles(a, b, c, emit);
    emit(
      a,
      b,
      c,
      Plane.through(
        a,
        this.groundHeight(...a),
        b,
        this.groundHeight(...b),
        c,
        this.groundHeight(...c),
      ),
    );
  }
  /**
   * Parameters 0 = t0 < … < tn = 1 along a→b between which the rendered ground is linear (the mesh
   * edge crossings of the line). A centreline profile built from these breaks is exact.
   */
  lineBreaks(a: Point, b: Point): number[] {
    return [0, ...(this.surface?.crossings(a, b) ?? []), 1];
  }
  private groundCache = new Map<string, number>();
  groundHeight(x: number, z: number) {
    if (!finite(x) || !finite(z)) throw new Error('Non-finite ground coordinates');
    const observed = this.sampleMetres(x, z, false);
    if (!Number.isNaN(observed))
      return this.dtm ? this.surfaceHeight(x, z) : this.toSceneHeight(observed);
    const key = `${x},${z}`;
    const cached = this.groundCache.get(key);
    if (cached !== undefined) return cached;
    // Placement over gaps (e.g. under a building/bridge) is an estimate, not a sample.
    // Use at most four nearby valid DTM cells, never DSM roofs or the water grid.
    for (const tile of this.tiles.filter((t) => t.kind === 'DTM')) {
      const u = (x - tile.x) / tile.step,
        v = (z - tile.z) / tile.step;
      if (u < 0 || v < 0 || u > tile.columns - 1 || v > tile.rows - 1) continue;
      for (const radius of [2, 4, 8, 16, 32]) {
        const candidates: { d: number; h: number }[] = [];
        for (
          let r = Math.max(0, Math.floor(v) - radius);
          r <= Math.min(tile.rows - 1, Math.ceil(v) + radius);
          r++
        )
          for (
            let c = Math.max(0, Math.floor(u) - radius);
            c <= Math.min(tile.columns - 1, Math.ceil(u) + radius);
            c++
          ) {
            const h = tile.heights[r * tile.columns + c];
            if (finite(h)) candidates.push({ d: (u - c) ** 2 + (v - r) ** 2, h });
          }
        candidates.sort((a, b) => a.d - b.d);
        if (candidates.length) {
          let sum = 0,
            weight = 0;
          for (const { d, h } of candidates.slice(0, 4)) {
            const w = 1 / Math.max(d, 1e-9);
            sum += h * w;
            weight += w;
          }
          const y = this.toSceneHeight(sum / weight);
          if (this.groundCache.size < 100000) this.groundCache.set(key, y);
          return y;
        }
      }
    }
    return -0.02;
  }
  /**
   * Legacy flat-scene conversion: ground + 0.02 maps the legacy ground plane (−0.02) onto the
   * terrain. Used for camera presets and the non-DTM preview; DTM geometry uses placeLegacy().
   */
  offset(x: number, z: number) {
    return this.groundHeight(x, z) + 0.02;
  }
  relativeHeight(x: number, z: number, legacyY: number) {
    return legacyY + this.offset(x, z);
  }
  /**
   * Height of a hand-made legacy model point. `standsOn` is the legacy level of the surface the
   * model was built on (e.g. LEGACY_LEVELS.street for platforms); with the DTM that surface is the
   * terrain at `base` (default: the ground at x, z), so the model keeps its own vertical design
   * relative to its support and loses only the old layer lift.
   */
  placeLegacy(x: number, z: number, legacyY: number, standsOn: number, base?: number) {
    if (!this.dtm) return this.relativeHeight(x, z, legacyY);
    return (base ?? this.groundHeight(x, z)) + legacyY - standsOn;
  }
  bridgeHeight(x: number, z: number, legacyY: number): number | undefined {
    if (!this.data.revision.startsWith('lm-dtm-')) return undefined;
    return (bridgeProfiles.points as Record<string, number>)[
      [x, z, legacyY].map((v) => v.toFixed(3)).join(',')
    ];
  }
  /**
   * Engineered spans of the segment a→b (bridge-profiles.json `spans`, rules v4): parameter ranges where
   * an at-grade way crosses an underpass or culvert and its surface bridges the open DTM trench
   * linearly. Reference heights; oriented a→b whichever way the data stores the segment.
   */
  spans(a: Point, b: Point): SpanPiece[] | undefined {
    if (!this.dtm) return undefined;
    const key = (p: Point) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    const data = bridgeProfiles.spans as Record<string, number[][]>;
    const forward = data[key(a) + '|' + key(b)];
    if (forward) return forward.map(([t0, t1, y0, y1]) => ({ t0, t1, y0, y1 }));
    const reverse = data[key(b) + '|' + key(a)];
    return reverse?.map(([t0, t1, y0, y1]) => ({ t0: 1 - t1, t1: 1 - t0, y0: y1, y1: y0 })).reverse();
  }
  private integratedKeys: Set<string> | null = null;
  /**
   * True for a grounded linear road segment absorbed into a road breakline patch (Step 5): it is then an
   * ordinary draped segment on the patch surface, which was built from its profile (road_patches.py).
   */
  integrated(a: Point, b: Point) {
    const list = this.data.mesh?.patches?.integrated;
    if (!this.dtm || !list?.length) return false;
    this.integratedKeys ??= new Set(list);
    const key = (p: Point) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    return this.integratedKeys.has(key(a) + '|' + key(b)) || this.integratedKeys.has(key(b) + '|' + key(a));
  }
  /**
   * Network reference heights follow a straight line only between two profiled ends (a bridge deck);
   * a segment with one profiled end (an approach) follows the terrain with its end offsets tapered.
   * Identical to TerrainService.kt.
   */
  linearBetween(a: number[], b: number[]) {
    if (!this.dtm) return true;
    return (
      this.bridgeHeight(a[0], a[2], a[1]) !== undefined &&
      this.bridgeHeight(b[0], b[2], b[1]) !== undefined
    );
  }
  /**
   * Reference height of the road/rail network at an endpoint; the drawn surface is ROAD_SURFACE
   * above it. With the DTM the legacy street surface (0.077 above the −0.02 ground, 2.43 m) is
   * removed from every network height, including the estimated bridge deck profiles, which are
   * anchored to the same approach-road heights. Legacy rises above the road level (layer lifts of
   * land bridges, rail ramps at underpasses) are kept: they are elevated structures (Step 4).
   * Legacy dips below it (the flat-scene Ingelsta cut) are dropped because the DTM has the cut.
   */
  roadHeight(x: number, z: number, legacyY: number) {
    if (!this.dtm) return this.bridgeHeight(x, z, legacyY) ?? this.relativeHeight(x, z, legacyY);
    return (
      (this.bridgeHeight(x, z, legacyY) ??
        this.relativeHeight(x, z, Math.max(LEGACY_LEVELS.road, legacyY))) -
      (LEGACY_LEVELS.street - LEGACY_LEVELS.ground)
    );
  }
  /**
   * Lowest rendered ground under a footprint (outer ring), exact for the piecewise-planar surface:
   * the footprint is triangulated and clipped to the mesh, and the minimum of a plane over each piece
   * lies at one of its vertices. OSM/Simple 3D Buildings heights are measured from this lowest ground
   * contact.
   */
  footprintGround(rings: number[][][]) {
    const ring = rings[0].slice();
    if (ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1])
      ring.pop();
    let min = Infinity;
    for (const [x, z] of ring) min = Math.min(min, this.groundHeight(x, z));
    if (!this.surface || ring.length < 3) return min;
    const contour = ring.map(([x, z]) => new Vector2(x, z));
    for (const [i, j, k] of ShapeUtils.triangulateShape(contour, []))
      this.surface.pieces(
        [ring[i], ring[j], ring[k]].map(([x, z]) => [x, z] as Point),
        (piece, plane) => {
          for (const [x, z] of piece) min = Math.min(min, plane.at(x, z));
        },
      );
    return min;
  }
  /**
   * Network reference height between two network points [x, legacyY, z] (vehicles, rails). A surveyed
   * deck wins; then engineered spans; then a linear deck between two profiled ends; otherwise the
   * terrain with the end offsets tapered (rules v4, shared with TerrainService.kt).
   */
  profileHeight(a: number[], b: number[], t: number, absoluteRH2000?: [number, number]) {
    const u = Math.max(0, Math.min(1, t));
    if (absoluteRH2000)
      return this.toSceneHeight(absoluteRH2000[0] * (1 - u) + absoluteRH2000[1] * u);
    if (!this.dtm)
      return this.bridgeHeight(a[0], a[2], a[1]) !== undefined ||
        this.bridgeHeight(b[0], b[2], b[1]) !== undefined
        ? this.roadHeight(a[0], a[2], a[1]) * (1 - u) + this.roadHeight(b[0], b[2], b[1]) * u
        : this.roadHeight(a[0] * (1 - u) + b[0] * u, a[2] * (1 - u) + b[2] * u, a[1] * (1 - u) + b[1] * u);
    // Absorbed into a breakline patch: draped on the surface it shaped, zero offset (Step 5).
    if (this.integrated([a[0], a[2]], [b[0], b[2]]))
      return this.groundHeight(a[0] * (1 - u) + b[0] * u, a[2] * (1 - u) + b[2] * u) - ROAD_SURFACE;
    // A span carries the network reference itself, exactly as drawn (cityMesh surfaceAt). Vehicle
    // offsets above it (rail head, ride height) belong to the vehicle contracts, not to the points.
    const span = spanHeight(this.spans([a[0], a[2]], [b[0], b[2]]), u);
    if (span !== undefined) return span;
    const ya = this.roadHeight(a[0], a[2], a[1]),
      yb = this.roadHeight(b[0], b[2], b[1]);
    if (this.linearBetween(a, b)) return ya * (1 - u) + yb * u;
    const x = a[0] * (1 - u) + b[0] * u,
      z = a[2] * (1 - u) + b[2] * u;
    return (
      this.groundHeight(x, z) +
      (ya - this.groundHeight(a[0], a[2])) * (1 - u) +
      (yb - this.groundHeight(b[0], b[2])) * u
    );
  }
}
const source = await cityJson<TerrainDataset>('terrain'),
  hydrationStarted = performance.now();
export const terrain = new TerrainService(source);
performance.measure?.('city-data:hydrate-terrain', { start: hydrationStarted });
