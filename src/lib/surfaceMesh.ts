/**
 * The rendered ground surface: an adaptive right-triangulated irregular network (RTIN, longest-edge
 * bisection) over the 5 m DTM nodes, refined where the native 1 m DTM needs it
 * (scripts/prepare-terrain-mesh.py, scripts/geo/rtin.py). Every ground-bound layer is clipped to its
 * triangles, so terrain, land cover, roads and pavements share one plane per triangle.
 *
 * A triangle is stored by its right-angle vertex R and hypotenuse A–B, in mesh nodes. It is split at
 * the hypotenuse midpoint M when M's bit is set, into (M; R, A) and (M; B, R). Both triangles that
 * share a hypotenuse read the same bit, so the mesh has no cracks or T-junctions. Root cells are
 * 2^depth nodes wide and split by the diagonal from (0,0) to (1,1) when (column + row) is even, else
 * by the other one. Heights of nodes are the DTM grid values (no interpolation, no new heights).
 * TerrainService.kt implements the same surface for the backend.
 */
export type Point = [number, number];

export interface SurfaceMeshData {
  kind: 'rtin';
  /** DTM tile whose nodes are the mesh vertices (same step, offset by whole nodes). */
  tile: string;
  /** Scene position of node (0, 0) and the node spacing (the tile step). */
  x: number;
  z: number;
  step: number;
  /** Root cells are 2^depth nodes wide. */
  depth: number;
  columns: number;
  rows: number;
  /**
   * A triangle is split while a native 1 m DTM pixel centre inside it deviates from its plane by more
   * than the tolerance of the pixel's class (feature, urban, open, water; see prepare-terrain-mesh.py).
   */
  tolerancesMetres: Record<string, number>;
  errorReference: string;
  /** Triangles in the mesh. */
  triangles: number;
  /** Node split bits, row-major, least significant bit first. */
  activeBase64?: string;
}

/** The plane of one mesh triangle (scene units): y = h + gx (x − x0) + gz (z − z0). */
export class Plane {
  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly h: number,
    readonly gx: number,
    readonly gz: number,
  ) {}
  at(x: number, z: number) {
    return this.h + this.gx * (x - this.x0) + this.gz * (z - this.z0);
  }
  /** The plane through three points with heights (flat if they are collinear). */
  static through(a: Point, ha: number, b: Point, hb: number, c: Point, hc: number) {
    const e1x = b[0] - a[0],
      e1z = b[1] - a[1],
      e2x = c[0] - a[0],
      e2z = c[1] - a[1],
      det = e1x * e2z - e1z * e2x;
    if (Math.abs(det) < 1e-18) return new Plane(a[0], a[1], (ha + hb + hc) / 3, 0, 0);
    const d1 = hb - ha,
      d2 = hc - ha;
    return new Plane(a[0], a[1], ha, (d1 * e2z - d2 * e1z) / det, (e1x * d2 - e2x * d1) / det);
  }
}

const EPS = 1e-10;

/** Splits a convex polygon by the line n·p = c into the parts with n·p ≥ c and n·p ≤ c. */
function split(poly: Point[], nx: number, nz: number, c: number): [Point[], Point[]] {
  const above: Point[] = [],
    below: Point[] = [];
  let da = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    if (i === 0) da = nx * a[0] + nz * a[1] - c;
    const db = nx * b[0] + nz * b[1] - c;
    const aUp = da >= -EPS,
      bUp = db >= -EPS,
      aDown = da <= EPS,
      bDown = db <= EPS;
    if (aUp) above.push(a);
    if (aDown) below.push(a);
    if (aUp !== bUp || aDown !== bDown) {
      const t = da / (da - db),
        p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (aUp !== bUp) above.push(p);
      if (aDown !== bDown) below.push(p);
    }
    da = db;
  }
  return [above, below];
}

export class SurfaceMesh {
  readonly x: number;
  readonly z: number;
  readonly step: number;
  readonly root: number;
  readonly rootsX: number;
  readonly rootsZ: number;
  readonly columns: number;
  readonly rows: number;
  private readonly bits: Uint8Array;
  /** Node heights come from the tile grid (scene units), clamped at its edges. */
  private readonly heights: ArrayLike<number | null>;
  private readonly tileColumns: number;
  private readonly tileRows: number;
  private readonly ox: number;
  private readonly oz: number;
  private readonly toScene: (metres: number) => number;

  constructor(
    data: SurfaceMeshData,
    bits: Uint8Array,
    tile: {
      x: number;
      z: number;
      step: number;
      columns: number;
      rows: number;
      heights: ArrayLike<number | null>;
    },
    toScene: (metres: number) => number,
  ) {
    this.x = data.x;
    this.z = data.z;
    this.step = data.step;
    this.root = 2 ** data.depth;
    this.columns = data.columns;
    this.rows = data.rows;
    this.rootsX = (data.columns - 1) / this.root;
    this.rootsZ = (data.rows - 1) / this.root;
    this.bits = bits;
    this.heights = tile.heights;
    this.tileColumns = tile.columns;
    this.tileRows = tile.rows;
    this.ox = Math.round((tile.x - data.x) / data.step);
    this.oz = Math.round((tile.z - data.z) / data.step);
    this.toScene = toScene;
  }

  /** Node split bit. */
  active(i: number, j: number) {
    const k = j * this.columns + i;
    return ((this.bits[k >> 3] >> (k & 7)) & 1) === 1;
  }

  /** Scene height of node (i, j). */
  node(i: number, j: number) {
    const col = Math.min(Math.max(i - this.ox, 0), this.tileColumns - 1),
      row = Math.min(Math.max(j - this.oz, 0), this.tileRows - 1);
    return this.toScene(this.heights[row * this.tileColumns + col] as number);
  }

  /** Height of the rendered ground (scene units) at scene (x, z). */
  height(x: number, z: number) {
    const gx = (x - this.x) / this.step,
      gz = (z - this.z) / this.step,
      R = this.root;
    // Root triangle (the same split as pieces()); points beyond the mesh use the outermost roots.
    const ri = Math.min(Math.max(Math.floor(gx / R), 0), this.rootsX - 1),
      rj = Math.min(Math.max(Math.floor(gz / R), 0), this.rootsZ - 1);
    const i0 = ri * R,
      j0 = rj * R,
      u = gx - i0,
      v = gz - j0;
    let rx: number, rz: number, ax: number, az: number, bx: number, bz: number;
    if ((ri + rj) % 2 === 0) {
      if (u >= v) [rx, rz, ax, az, bx, bz] = [i0 + R, j0, i0, j0, i0 + R, j0 + R];
      else [rx, rz, ax, az, bx, bz] = [i0, j0 + R, i0 + R, j0 + R, i0, j0];
    } else if (u + v <= R) [rx, rz, ax, az, bx, bz] = [i0, j0, i0 + R, j0, i0, j0 + R];
    else [rx, rz, ax, az, bx, bz] = [i0 + R, j0 + R, i0, j0 + R, i0 + R, j0];
    for (;;) {
      const sx = ax + bx,
        sz = az + bz;
      if (sx & 1 || sz & 1) break;
      const mx = sx >> 1,
        mz = sz >> 1;
      if (!this.active(mx, mz)) break;
      const side = (mx - rx) * (gz - rz) - (mz - rz) * (gx - rx),
        sideA = (mx - rx) * (az - rz) - (mz - rz) * (ax - rx);
      if (side >= 0 === sideA >= 0) {
        bx = ax;
        bz = az;
        ax = rx;
        az = rz;
      } else {
        ax = bx;
        az = bz;
        bx = rx;
        bz = rz;
      }
      rx = mx;
      rz = mz;
    }
    const e1x = ax - rx,
      e1z = az - rz,
      e2x = bx - rx,
      e2z = bz - rz,
      px = gx - rx,
      pz = gz - rz,
      det = e1x * e2z - e1z * e2x;
    const wa = (px * e2z - pz * e2x) / det,
      wb = (e1x * pz - e1z * px) / det,
      hr = this.node(rx, rz);
    return hr + wa * (this.node(ax, az) - hr) + wb * (this.node(bx, bz) - hr);
  }

  private plane(rx: number, rz: number, ax: number, az: number, bx: number, bz: number) {
    const s = this.step,
      hr = this.node(rx, rz),
      dha = this.node(ax, az) - hr,
      dhb = this.node(bx, bz) - hr;
    const e1x = (ax - rx) * s,
      e1z = (az - rz) * s,
      e2x = (bx - rx) * s,
      e2z = (bz - rz) * s,
      det = e1x * e2z - e1z * e2x;
    return new Plane(
      this.x + rx * s,
      this.z + rz * s,
      hr,
      (dha * e2z - dhb * e1z) / det,
      (e1x * dhb - e2x * dha) / det,
    );
  }

  private descend(
    poly: Point[],
    rx: number,
    rz: number,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    visit: (piece: Point[], plane: Plane) => void,
  ) {
    const sx = ax + bx,
      sz = az + bz;
    if (sx & 1 || sz & 1 || !this.active(sx >> 1, sz >> 1)) {
      visit(poly, this.plane(rx, rz, ax, az, bx, bz));
      return;
    }
    const mx = sx >> 1,
      mz = sz >> 1;
    // Line through R and M, normalised; A lies on its positive side.
    let nx = -(mz - rz),
      nz = mx - rx;
    const length = Math.hypot(nx, nz);
    nx /= length;
    nz /= length;
    if (nx * (ax - rx) + nz * (az - rz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    const c = nx * (this.x + rx * this.step) + nz * (this.z + rz * this.step);
    const [onA, onB] = split(poly, nx, nz, c);
    if (onA.length >= 3) this.descend(onA, mx, mz, rx, rz, ax, az, visit);
    if (onB.length >= 3) this.descend(onB, mx, mz, bx, bz, rx, rz, visit);
  }

  /** Clips a convex polygon (scene x, z) to the mesh triangles; each piece comes with its plane. */
  pieces(poly: Point[], visit: (piece: Point[], plane: Plane) => void) {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const p of poly) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minZ) minZ = p[1];
      if (p[1] > maxZ) maxZ = p[1];
    }
    const size = this.root * this.step;
    const r0 = Math.max(0, Math.floor((minX - this.x) / size)),
      r1 = Math.min(this.rootsX - 1, Math.floor((maxX - this.x) / size)),
      q0 = Math.max(0, Math.floor((minZ - this.z) / size)),
      q1 = Math.min(this.rootsZ - 1, Math.floor((maxZ - this.z) / size));
    const R = this.root;
    for (let rj = q0; rj <= q1; rj++) {
      const zLow = this.z + rj * R * this.step,
        zHigh = this.z + (rj + 1) * R * this.step;
      // Points beyond the outermost roots belong to them (their planes extend outwards).
      let band = poly;
      if (rj > 0) band = split(band, 0, 1, zLow)[0];
      if (rj < this.rootsZ - 1 && band.length >= 3) band = split(band, 0, 1, zHigh)[1];
      if (band.length < 3) continue;
      for (let ri = r0; ri <= r1; ri++) {
        const xLow = this.x + ri * R * this.step,
          xHigh = this.x + (ri + 1) * R * this.step;
        let cell = band;
        if (ri > 0) cell = split(cell, 1, 0, xLow)[0];
        if (ri < this.rootsX - 1 && cell.length >= 3) cell = split(cell, 1, 0, xHigh)[1];
        if (cell.length < 3) continue;
        const i0 = ri * R,
          j0 = rj * R;
        if ((ri + rj) % 2 === 0) {
          // Diagonal (0,0)–(1,1): u ≥ v holds corner (1,0).
          const [lower, upper] = split(
            cell,
            Math.SQRT1_2,
            -Math.SQRT1_2,
            Math.SQRT1_2 * (xLow - zLow),
          );
          if (lower.length >= 3) this.descend(lower, i0 + R, j0, i0, j0, i0 + R, j0 + R, visit);
          if (upper.length >= 3) this.descend(upper, i0, j0 + R, i0 + R, j0 + R, i0, j0, visit);
        } else {
          // Diagonal (1,0)–(0,1): u + v ≤ 1 holds corner (0,0).
          const [far, near] = split(
            cell,
            Math.SQRT1_2,
            Math.SQRT1_2,
            Math.SQRT1_2 * (xHigh + zLow),
          );
          if (near.length >= 3) this.descend(near, i0, j0, i0 + R, j0, i0, j0 + R, visit);
          if (far.length >= 3) this.descend(far, i0 + R, j0 + R, i0, j0 + R, i0 + R, j0, visit);
        }
      }
    }
  }

  /** Clips a triangle to the mesh and emits the pieces as triangles (fans) with their planes. */
  triangles(
    a: Point,
    b: Point,
    c: Point,
    emit: (a: Point, b: Point, c: Point, plane: Plane) => void,
  ) {
    this.pieces([a, b, c], (poly, plane) => {
      for (let i = 1; i + 1 < poly.length; i++) {
        const p = poly[0],
          q = poly[i],
          r = poly[i + 1];
        if (Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) > EPS)
          emit(p, q, r, plane);
      }
    });
  }

  /** Number of triangles in the mesh (for diagnostics). */
  countTriangles() {
    let count = 0;
    const visit = (
      rx: number,
      rz: number,
      ax: number,
      az: number,
      bx: number,
      bz: number,
    ): void => {
      const sx = ax + bx,
        sz = az + bz;
      if (sx & 1 || sz & 1 || !this.active(sx >> 1, sz >> 1)) {
        count++;
        return;
      }
      visit(sx >> 1, sz >> 1, rx, rz, ax, az);
      visit(sx >> 1, sz >> 1, bx, bz, rx, rz);
    };
    const R = this.root;
    for (let rj = 0; rj < this.rootsZ; rj++)
      for (let ri = 0; ri < this.rootsX; ri++) {
        const i0 = ri * R,
          j0 = rj * R;
        if ((ri + rj) % 2 === 0) {
          visit(i0 + R, j0, i0, j0, i0 + R, j0 + R);
          visit(i0, j0 + R, i0 + R, j0 + R, i0, j0);
        } else {
          visit(i0, j0, i0 + R, j0, i0, j0 + R);
          visit(i0 + R, j0 + R, i0, j0 + R, i0 + R, j0);
        }
      }
    return count;
  }
}

/** Decodes the node split bits of a mesh. */
export function decodeBits(data: SurfaceMeshData): Uint8Array {
  const raw = atob(data.activeBase64 ?? '');
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  if (bytes.length !== Math.ceil((data.columns * data.rows) / 8))
    throw new Error('Invalid terrain mesh bits');
  return bytes;
}
