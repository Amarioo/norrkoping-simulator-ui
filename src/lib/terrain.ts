import bridgeProfiles from './data/bridge-profiles.json';
import source from './data/terrain.json';

export interface GeoReference {
  originLatitude: number;
  originLongitude: number;
  metresPerDegreeLongitude: number;
  metresPerDegreeLatitude: number;
  metresPerUnit: number;
  verticalDatum: 'RH2000';
  verticalOriginMetres: number;
}
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
    data.version !== 1 ||
    !data.revision ||
    !r ||
    r.verticalDatum !== 'RH2000' ||
    !Object.values(r)
      .filter((v) => typeof v === 'number')
      .every(finite) ||
    ![r.originLatitude, r.originLongitude, r.verticalOriginMetres].every(finite) ||
    ![r.metresPerUnit, r.metresPerDegreeLatitude, r.metresPerDegreeLongitude].every(
      (v) => finite(v) && v > 0,
    )
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
}
/** Shared contract with TerrainService.kt. No vertical exaggeration or procedural terrain. */
export class TerrainService {
  readonly tiles: TerrainTile[];
  constructor(readonly data: TerrainDataset) {
    const hydrated = data.tiles.map((t) => {
      if (!t.heightsBase64) return t;
      const raw = atob(t.heightsBase64);
      if (raw.length !== t.rows * t.columns * 4) throw new Error(`Invalid binary grid ${t.id}`);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const view = new DataView(bytes.buffer),
        heights = new Float32Array(t.rows * t.columns);
      for (let i = 0; i < heights.length; i++) heights[i] = view.getFloat32(i * 4, true);
      return { ...t, heights };
    });
    validateTerrain({ ...data, tiles: hydrated });
    this.tiles = hydrated.sort(
      (a, b) =>
        Number(a.kind !== 'DTM') - Number(b.kind !== 'DTM') ||
        a.resolutionMetres - b.resolutionMetres ||
        (a.verticalAccuracyMetres ?? Infinity) - (b.verticalAccuracyMetres ?? Infinity) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  }
  project(lat: number, lon: number): [number, number] {
    const r = this.data.reference;
    return [
      ((lon - r.originLongitude) * r.metresPerDegreeLongitude) / r.metresPerUnit,
      ((r.originLatitude - lat) * r.metresPerDegreeLatitude) / r.metresPerUnit,
    ];
  }
  unproject(x: number, z: number): [number, number] {
    const r = this.data.reference;
    return [
      r.originLatitude - (z * r.metresPerUnit) / r.metresPerDegreeLatitude,
      r.originLongitude + (x * r.metresPerUnit) / r.metresPerDegreeLongitude,
    ];
  }
  toSceneHeight(metres: number) {
    return (metres - this.data.reference.verticalOriginMetres) / this.data.reference.metresPerUnit;
  }
  sample(x: number, z: number, water = false): GroundSample | null {
    if (!finite(x) || !finite(z)) throw new Error('Non-finite ground coordinates');
    for (const tile of this.tiles) {
      if ((tile.kind === 'water') !== water) continue;
      const u = (x - tile.x) / tile.step,
        v = (z - tile.z) / tile.step;
      if (u < 0 || v < 0 || u > tile.columns - 1 || v > tile.rows - 1) continue;
      const col = Math.min(Math.floor(u), tile.columns - 2),
        row = Math.min(Math.floor(v), tile.rows - 2);
      const tx = u - col,
        tz = v - row;
      const indices = [
        row * tile.columns + col,
        row * tile.columns + col + 1,
        (row + 1) * tile.columns + col,
        (row + 1) * tile.columns + col + 1,
      ];
      const weights = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
      // A hole never becomes a zero-height peak or borrows an unrelated edge value.
      if (indices.some((i, n) => weights[n] > 0 && !finite(tile.heights[i]))) continue;
      const metresRH2000 = indices.reduce(
        (h, i, n) => h + (finite(tile.heights[i]) ? tile.heights[i]! : 0) * weights[n],
        0,
      );
      return {
        metresRH2000,
        sceneY: this.toSceneHeight(metresRH2000),
        sourceId: tile.id,
        resolutionMetres: tile.resolutionMetres,
        quality: tile.kind === 'DTM' ? 'measured-ground' : 'surface-fallback',
      };
    }
    return null;
  }
  /** Explicit legacy preview plane; this is NOT an RH2000 observation. */
  waterHeight(x: number, z: number) {
    return (
      this.sample(x, z, true)?.sceneY ?? (this.sample(x, z) ? this.groundHeight(x, z) : -0.197)
    );
  }
  get surfaceStep() {
    return 40 / this.data.reference.metresPerUnit;
  }
  private surfaceNodes = new Map<string, number>();
  private surfaceNode(x: number, z: number) {
    const key = x + ',' + z;
    let y = this.surfaceNodes.get(key);
    if (y === undefined) {
      const coarse = this.surfaceStep;
      if (Math.abs(Math.abs(x) - 64) < 1e-8 && Math.abs(z) <= 64) {
        const z0 = Math.floor(z / coarse) * coarse,
          t = (z - z0) / coarse;
        y =
          (this.sample(x, z0)?.sceneY ?? -0.02) * (1 - t) +
          (this.sample(x, z0 + coarse)?.sceneY ?? -0.02) * t;
      } else if (Math.abs(Math.abs(z) - 64) < 1e-8 && Math.abs(x) <= 64) {
        const x0 = Math.floor(x / coarse) * coarse,
          t = (x - x0) / coarse;
        y =
          (this.sample(x0, z)?.sceneY ?? -0.02) * (1 - t) +
          (this.sample(x0 + coarse, z)?.sceneY ?? -0.02) * t;
      } else y = this.sample(x, z)?.sceneY ?? -0.02;
      this.surfaceNodes.set(key, y);
    }
    return y;
  }
  /** The same piecewise planar surface used by terrain and ground-bound geometry. */
  surfaceHeight(x: number, z: number) {
    const step = Math.abs(x) < 64 && Math.abs(z) < 64 ? this.surfaceStep / 4 : this.surfaceStep;
    const x0 = Math.floor(x / step) * step,
      z0 = Math.floor(z / step) * step;
    const u = (x - x0) / step,
      v = (z - z0) / step;
    const b = this.surfaceNode(x0 + step, z0),
      c = this.surfaceNode(x0, z0 + step);
    return u + v <= 1
      ? this.surfaceNode(x0, z0) * (1 - u - v) + b * u + c * v
      : this.surfaceNode(x0 + step, z0 + step) * (u + v - 1) + b * (1 - v) + c * (1 - u);
  }
  private groundCache = new Map<string, number>();
  groundHeight(x: number, z: number) {
    const observed = this.sample(x, z);
    if (observed)
      return this.data.revision.startsWith('lm-dtm-') ? this.surfaceHeight(x, z) : observed.sceneY;
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
  /** Lift legacy local geometry without confusing artistic offsets with surveyed elevations. */
  offset(x: number, z: number) {
    return this.groundHeight(x, z) + 0.02;
  }
  relativeHeight(x: number, z: number, legacyY: number) {
    return legacyY + this.offset(x, z);
  }
  bridgeHeight(x: number, z: number, legacyY: number): number | undefined {
    if (!this.data.revision.startsWith('lm-dtm-')) return undefined;
    return (bridgeProfiles.points as Record<string, number>)[
      [x, z, legacyY].map((v) => v.toFixed(3)).join(',')
    ];
  }
  roadHeight(x: number, z: number, legacyY: number) {
    return (
      this.bridgeHeight(x, z, legacyY) ??
      this.relativeHeight(
        x,
        z,
        this.data.revision.startsWith('lm-dtm-') ? Math.max(0.071, legacyY) : legacyY,
      )
    );
  }
  /** Infrastructure profiles are distinct from terrain. A surveyed deck wins over ground. */
  profileHeight(a: number[], b: number[], t: number, absoluteRH2000?: [number, number]) {
    const u = Math.max(0, Math.min(1, t));
    if (absoluteRH2000)
      return this.toSceneHeight(absoluteRH2000[0] * (1 - u) + absoluteRH2000[1] * u);
    if (
      !this.data.revision.startsWith('lm-dtm-') ||
      this.bridgeHeight(a[0], a[2], a[1]) !== undefined ||
      this.bridgeHeight(b[0], b[2], b[1]) !== undefined
    )
      return this.roadHeight(a[0], a[2], a[1]) * (1 - u) + this.roadHeight(b[0], b[2], b[1]) * u;
    return this.roadHeight(
      a[0] * (1 - u) + b[0] * u,
      a[2] * (1 - u) + b[2] * u,
      a[1] * (1 - u) + b[1] * u,
    );
  }
}
export const terrain = new TerrainService(source as TerrainDataset);
