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
  /** Road breakline patches (Step 5 prototype, scripts/geo/road_patches.py). */
  patches?: SurfacePatches;
}

/**
 * Leaves of the RTIN re-triangulated with the asphalt outline as mesh edges. Every patch triangle lies in
 * one leaf, so a leaf is looked up as before and then its own triangles replace its plane.
 */
export interface SurfacePatches {
  kind: 'road-breaklines-v1';
  boxes: Record<string, number[]>;
  /** Step 5.1: diagnostic-driven patch groups, name -> SWEREF box (scripts/geo/refinement_targets.py). */
  groups?: Record<string, number[]>;
  /**
   * Step 5.1: segments ('ax,az|bx,bz') whose draped parts are asphalt or track bed of a patch (drawn on the measured
   * surface); other roads crossing a patch keep the RTIN under a ghost outline.
   */
  members?: string[];
  leaves: number;
  triangles: number;
  vertexCount: number;
  /**
   * Grounded linear road segments ('ax,az|bx,bz', bridge-profiles span keys) absorbed into the patches:
   * their data profile shaped the surface; they are draped on it with zero offset (terrain.ts).
   */
  integrated?: string[];
  /** Per leaf: key (leafKey), first triangle, triangle count (int32). */
  leavesBase64?: string;
  /** Per vertex: node-space x, z and RH2000 metres (float64). */
  verticesBase64?: string;
  /** Per triangle: three vertex indices, counter-clockwise in (x, z) (uint32). */
  trianglesBase64?: string;
  /** Step 5.1 optimisation: per triangle 0 terrain, 1 road asphalt, 2 track bed (uint8). */
  classesBase64?: string;
}

/** Key of the leaf with right-angle node R and hypotenuse A-B (shared with road_patches.py and TerrainService.kt). */
export function leafKey(columns: number, rx: number, rz: number, ax: number, az: number, bx: number, bz: number) {
  return (rz * columns + rx) * 9 + (Math.sign(ax + bx - 2 * rx) + 1) * 3 + (Math.sign(az + bz - 2 * rz) + 1);
}

function decodeBase64(text: string) {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new DataView(bytes.buffer);
}

/** Decoded patches: leaf index, vertices in node space with scene heights, triangles. */
class Patches {
  readonly leaves = new Map<number, [number, number]>();
  readonly vx: Float64Array;
  readonly vz: Float64Array;
  readonly vy: Float64Array;
  readonly tris: Uint32Array;
  /** 0 terrain, 1 road asphalt, 2 track bed per triangle (all 0 without classesBase64). */
  readonly classes: Uint8Array;
  readonly count: number;
  /** Scene bounding box per triangle (min x, min z, max x, max z), for clipping. */
  readonly box: Float64Array;
  /** Per triangle, three edge lines (nx, nz, c) in scene units, interior where nx x + nz z >= c (for clipping). */
  readonly edges: Float64Array;
  private readonly planeCache: (Plane | undefined)[];
  constructor(
    data: SurfacePatches,
    private readonly x0: number,
    private readonly z0: number,
    private readonly step: number,
    toScene: (metres: number) => number,
  ) {
    const leaves = decodeBase64(data.leavesBase64 ?? ''),
      vertices = decodeBase64(data.verticesBase64 ?? ''),
      tris = decodeBase64(data.trianglesBase64 ?? '');
    if (
      leaves.byteLength !== data.leaves * 12 ||
      vertices.byteLength !== data.vertexCount * 24 ||
      tris.byteLength !== data.triangles * 12
    )
      throw new Error('Invalid terrain surface patches');
    for (let i = 0; i < data.leaves; i++)
      this.leaves.set(leaves.getInt32(i * 12, true), [
        leaves.getInt32(i * 12 + 4, true),
        leaves.getInt32(i * 12 + 8, true),
      ]);
    const n = data.vertexCount;
    this.vx = new Float64Array(n);
    this.vz = new Float64Array(n);
    this.vy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.vx[i] = vertices.getFloat64(i * 24, true);
      this.vz[i] = vertices.getFloat64(i * 24 + 8, true);
      this.vy[i] = toScene(vertices.getFloat64(i * 24 + 16, true));
    }
    this.tris = new Uint32Array(data.triangles * 3);
    for (let i = 0; i < this.tris.length; i++) {
      this.tris[i] = tris.getUint32(i * 4, true);
      if (this.tris[i] >= n) throw new Error('Invalid terrain surface patches');
    }
    this.count = data.triangles;
    const classes = data.classesBase64 ? decodeBase64(data.classesBase64) : null;
    if (classes && classes.byteLength !== data.triangles) throw new Error('Invalid terrain surface patches');
    this.classes = classes ? new Uint8Array(classes.buffer, classes.byteOffset, classes.byteLength) : new Uint8Array(data.triangles);
    this.planeCache = new Array(data.triangles);
    this.box = new Float64Array(data.triangles * 4);
    for (let t = 0; t < data.triangles; t++) {
      const xs = [0, 1, 2].map((k) => x0 + this.vx[this.tris[t * 3 + k]] * step),
        zs = [0, 1, 2].map((k) => z0 + this.vz[this.tris[t * 3 + k]] * step);
      this.box.set([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], t * 4);
    }
    this.edges = new Float64Array(data.triangles * 9);
    for (let t = 0; t < data.triangles; t++)
      for (let e = 0; e < 3; e++) {
        const a = this.point(this.tris[t * 3 + e]),
          b = this.point(this.tris[t * 3 + ((e + 1) % 3)]);
        // Interior on the left of a -> b: n.p >= n.a with n = (-dz, dx).
        const nx = -(b[1] - a[1]),
          nz = b[0] - a[0],
          length = Math.hypot(nx, nz);
        this.edges.set([nx / length, nz / length, (nx * a[0] + nz * a[1]) / length], t * 9 + e * 3);
      }
  }
  /** Scene (x, z) of a vertex. */
  point(v: number): Point {
    return [this.x0 + this.vx[v] * this.step, this.z0 + this.vz[v] * this.step];
  }
  plane(t: number) {
    let p = this.planeCache[t];
    if (!p) {
      const a = this.tris[t * 3],
        b = this.tris[t * 3 + 1],
        c = this.tris[t * 3 + 2];
      p = this.planeCache[t] = Plane.through(
        this.point(a),
        this.vy[a],
        this.point(b),
        this.vy[b],
        this.point(c),
        this.vy[c],
      );
    }
    return p;
  }
  /** Height at node-space (gx, gz) in a patched leaf: the triangle containing it (best barycentric fit). */
  height(leaf: [number, number], gx: number, gz: number) {
    let best = -Infinity,
      height = NaN;
    for (let t = leaf[0]; t < leaf[0] + leaf[1]; t++) {
      const a = this.tris[t * 3],
        b = this.tris[t * 3 + 1],
        c = this.tris[t * 3 + 2];
      const e1x = this.vx[b] - this.vx[a],
        e1z = this.vz[b] - this.vz[a],
        e2x = this.vx[c] - this.vx[a],
        e2z = this.vz[c] - this.vz[a],
        px = gx - this.vx[a],
        pz = gz - this.vz[a],
        det = e1x * e2z - e1z * e2x;
      const wb = (px * e2z - pz * e2x) / det,
        wc = (e1x * pz - e1z * px) / det,
        inside = Math.min(1 - wb - wc, wb, wc);
      if (inside > best) {
        best = inside;
        height = this.vy[a] + wb * (this.vy[b] - this.vy[a]) + wc * (this.vy[c] - this.vy[a]);
        if (inside >= 0) break;
      }
    }
    return height;
  }
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
/** The part of a convex polygon where nx x + nz z >= c (the `above` half of split(), alone). */
function clipAbove(poly: Point[], nx: number, nz: number, c: number): Point[] {
  const above: Point[] = [];
  let da = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    if (i === 0) da = nx * a[0] + nz * a[1] - c;
    const db = nx * b[0] + nz * b[1] - c;
    const aUp = da >= -EPS,
      bUp = db >= -EPS;
    if (aUp) above.push(a);
    if (aUp !== bUp) {
      const t = da / (da - db);
      above.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    da = db;
  }
  return above;
}
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
  private readonly patches: Patches | null;
  /** Root cells holding patched leaves (leaves never cross root cells): skips the lookup elsewhere. */
  private readonly patchedRoots: Uint8Array | null;

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
    this.patches = data.patches ? new Patches(data.patches, data.x, data.z, data.step, toScene) : null;
    this.patchedRoots = null;
    if (this.patches) {
      const roots = new Uint8Array(this.rootsX * this.rootsZ);
      for (let i = 0; i < this.patches.vx.length; i++) {
        const ri = Math.min(Math.floor(this.patches.vx[i] / this.root), this.rootsX - 1),
          rj = Math.min(Math.floor(this.patches.vz[i] / this.root), this.rootsZ - 1);
        // A vertex on a root cell edge belongs to the cells on both sides.
        for (const [di, dj] of [[0, 0], [-1, 0], [0, -1], [-1, -1]])
          if (ri + di >= 0 && rj + dj >= 0) roots[(rj + dj) * this.rootsX + ri + di] = 1;
      }
      this.patchedRoots = roots;
    }
  }

  /** The patch triangles of a leaf, if it is re-triangulated. */
  private patchLeaf(rx: number, rz: number, ax: number, az: number, bx: number, bz: number) {
    if (!this.patchedRoots) return undefined;
    // The leaf's centroid lies strictly inside its root cell.
    const ri = Math.floor((rx + ax + bx) / 3 / this.root),
      rj = Math.floor((rz + az + bz) / 3 / this.root);
    if (!this.patchedRoots[rj * this.rootsX + ri]) return undefined;
    return this.patches!.leaves.get(leafKey(this.columns, rx, rz, ax, az, bx, bz));
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

  /** Leaf under node-space (gx, gz) as [rx, rz, ax, az, bx, bz], written to `leafScratch` (no allocation). */
  private readonly leafScratch = new Int32Array(6);
  private descendTo(gx: number, gz: number) {
    const R = this.root;
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
    const l = this.leafScratch;
    l[0] = rx;
    l[1] = rz;
    l[2] = ax;
    l[3] = az;
    l[4] = bx;
    l[5] = bz;
    return l;
  }

  /** Height of the rendered ground (scene units) at scene (x, z). */
  height(x: number, z: number) {
    const gx = (x - this.x) / this.step,
      gz = (z - this.z) / this.step;
    const [rx, rz, ax, az, bx, bz] = this.descendTo(gx, gz);
    const patched = this.patches && this.patchLeaf(rx, rz, ax, az, bx, bz);
    if (patched) return this.patches!.height(patched, gx, gz);
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

  /** Step 5.1 optimisation: every patch triangle of a class (1 road asphalt, 2 track bed), scene coordinates. */
  patchTriangles(cls: number, visit: (a: number[], b: number[], c: number[]) => void) {
    const P = this.patches;
    if (!P) return;
    const at = (v: number) => {
      const p = P.point(v);
      return [p[0], P.vy[v], p[1]];
    };
    for (let t = 0; t < P.count; t++)
      if (P.classes[t] === cls) visit(at(P.tris[t * 3]), at(P.tris[t * 3 + 1]), at(P.tris[t * 3 + 2]));
  }

  /** True where the ground is a road breakline patch (Step 5), i.e. not the plain RTIN. */
  patchedAt(x: number, z: number) {
    if (!this.patches) return false;
    const [rx, rz, ax, az, bx, bz] = this.descendTo((x - this.x) / this.step, (z - this.z) / this.step);
    return this.patchLeaf(rx, rz, ax, az, bx, bz) !== undefined;
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
      const patched = this.patches && this.patchLeaf(rx, rz, ax, az, bx, bz);
      if (patched) this.patchPieces(poly, patched, visit);
      else visit(poly, this.plane(rx, rz, ax, az, bx, bz));
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

  /** Clips a convex polygon inside a patched leaf to the leaf's patch triangles (counter-clockwise). */
  private patchPieces(poly: Point[], leaf: [number, number], visit: (piece: Point[], plane: Plane) => void) {
    const P = this.patches!;
    let minX = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxZ = -Infinity;
    for (const [x, z] of poly) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const E = P.edges;
    for (let t = leaf[0]; t < leaf[0] + leaf[1]; t++) {
      const b = t * 4;
      if (P.box[b] > maxX || P.box[b + 2] < minX || P.box[b + 1] > maxZ || P.box[b + 3] < minZ) continue;
      // Step 5.1 optimisation (same pieces as clipping by split()): a polygon wholly outside one edge yields
      // nothing, one wholly inside all three edges is the piece itself; only the rest is clipped.
      let outside = false,
        inside = true;
      for (let e = 0; e < 3 && !outside; e++) {
        const nx = E[t * 9 + e * 3],
          nz = E[t * 9 + e * 3 + 1],
          c = E[t * 9 + e * 3 + 2];
        let all = true,
          none = true;
        for (const p of poly) {
          const d = nx * p[0] + nz * p[1] - c;
          if (d >= -EPS) none = false;
          else all = false;
        }
        if (none) outside = true;
        if (!all) inside = false;
      }
      if (outside) continue;
      let piece = poly;
      if (!inside)
        for (let e = 0; e < 3 && piece.length >= 3; e++)
          piece = clipAbove(piece, E[t * 9 + e * 3], E[t * 9 + e * 3 + 1], E[t * 9 + e * 3 + 2]);
      if (piece.length >= 3) visit(piece, P.plane(t));
    }
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

  /**
   * Parameters t in (0, 1) where the straight line a→b crosses mesh triangle edges, sorted: the
   * surface is linear along the line between consecutive values (a thin strip clipped to the mesh).
   */
  crossings(a: Point, b: Point): number[] {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      l2 = dx * dx + dz * dz;
    if (l2 < 1e-18) return [];
    const w = 1e-5 / Math.sqrt(l2),
      nx = -dz * w,
      nz = dx * w;
    const ts: number[] = [];
    this.pieces(
      [
        [a[0] + nx, a[1] + nz],
        [b[0] + nx, b[1] + nz],
        [b[0] - nx, b[1] - nz],
        [a[0] - nx, a[1] - nz],
      ],
      (piece) => {
        for (const p of piece) {
          const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2;
          if (t > 1e-7 && t < 1 - 1e-7) ts.push(t);
        }
      },
    );
    ts.sort((p, q) => p - q);
    const out: number[] = [];
    for (const t of ts) if (!out.length || t - out[out.length - 1] > 1e-7) out.push(t);
    return out;
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
        count += this.patchLeaf(rx, rz, ax, az, bx, bz)?.[1] ?? 1;
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
