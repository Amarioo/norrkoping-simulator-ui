/**
 * Step 3: the adaptive terrain mesh (surfaceMesh.ts).
 *
 * Structure: conforming (every interior edge shared by exactly two triangles, no T-junctions),
 * continuous, vertices exactly on the DTM grid nodes, clipping area-exact, draped pieces on the
 * planes of the terrain. Accuracy: geo/terrain-mesh-control.json holds heights at random positions
 * that never served as mesh input (bilinear in the native 1 m DTM, scripts/geo/terrain_mesh_samples.py)
 * and the mesh height computed independently by scripts/geo/rtin.py.
 */
import { describe, expect, it } from 'vitest';
import { terrain } from './terrain';
import { SurfaceMesh, type Point } from './surfaceMesh';
import control from './geo/terrain-mesh-control.json';

const mesh = terrain.surface as SurfaceMesh;
const M = terrain.data.reference.metresPerUnit;
const metres = (y: number) => y * M + terrain.data.reference.verticalOriginMetres;
const area = (p: Point, q: Point, r: Point) =>
  Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2;

/** All leaf triangles as node-index triples [rx, rz, ax, az, bx, bz]. */
function leaves() {
  const out: number[][] = [];
  const visit = (rx: number, rz: number, ax: number, az: number, bx: number, bz: number): void => {
    const sx = ax + bx,
      sz = az + bz;
    if (sx & 1 || sz & 1 || !mesh.active(sx >> 1, sz >> 1)) {
      out.push([rx, rz, ax, az, bx, bz]);
      return;
    }
    visit(sx >> 1, sz >> 1, rx, rz, ax, az);
    visit(sx >> 1, sz >> 1, bx, bz, rx, rz);
  };
  const R = mesh.root;
  for (let rj = 0; rj < mesh.rootsZ; rj++)
    for (let ri = 0; ri < mesh.rootsX; ri++) {
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
  return out;
}

describe('adaptive terrain mesh structure', () => {
  const all = leaves();

  it('has the triangle count recorded by the mesh preparation', () => {
    expect(all.length).toBe(terrain.data.mesh!.triangles);
    expect(mesh.countTriangles()).toBe(all.length);
  });

  it('is conforming: every interior edge is shared by two triangles, no T-junctions', () => {
    const edges = new Map<number, number>();
    const W = mesh.columns,
      N = mesh.columns * mesh.rows;
    const key = (i: number, j: number, k: number, l: number) => {
      const a = j * W + i,
        b = l * W + k;
      return a < b ? a * N + b : b * N + a;
    };
    for (const [rx, rz, ax, az, bx, bz] of all)
      for (const k of [key(rx, rz, ax, az), key(rx, rz, bx, bz), key(ax, az, bx, bz)])
        edges.set(k, (edges.get(k) ?? 0) + 1);
    let border = 0;
    for (const [k, n] of edges) {
      expect(n).toBeLessThanOrEqual(2);
      if (n === 2) continue;
      // A once-used edge must lie on the outer border of the mesh; anywhere else it is a T-junction.
      const a = Math.floor(k / N),
        b = k % N;
      const [ai, aj, bi, bj] = [a % W, Math.floor(a / W), b % W, Math.floor(b / W)];
      const onBorder =
        (ai === bi && (ai === 0 || ai === W - 1)) ||
        (aj === bj && (aj === 0 || aj === mesh.rows - 1));
      expect(onBorder).toBe(true);
      border++;
    }
    expect(border).toBeGreaterThan(0);
  }, 120_000);

  it('is continuous across every triangle edge (no cracks or height steps)', () => {
    let worst = 0;
    for (let i = 0; i < all.length; i += 7) {
      const [rx, rz, ax, az, bx, bz] = all[i];
      // Midpoint of each edge, approached from both sides.
      for (const [p, q, o] of [
        [
          [rx, rz],
          [ax, az],
          [bx, bz],
        ],
        [
          [rx, rz],
          [bx, bz],
          [ax, az],
        ],
        [
          [ax, az],
          [bx, bz],
          [rx, rz],
        ],
      ]) {
        const mx = mesh.x + ((p[0] + q[0]) / 2) * mesh.step,
          mz = mesh.z + ((p[1] + q[1]) / 2) * mesh.step,
          ox = mesh.x + o[0] * mesh.step - mx,
          oz = mesh.z + o[1] * mesh.step - mz,
          e = 1e-7 / Math.hypot(ox, oz);
        worst = Math.max(
          worst,
          Math.abs(mesh.height(mx + ox * e, mz + oz * e) - mesh.height(mx - ox * e, mz - oz * e)),
        );
      }
    }
    // 1e-7 units of position on slopes below 100 % is < 1e-7 units of height.
    expect(worst * M).toBeLessThan(1e-4);
  });

  it('puts every vertex at the DTM grid value of its node (no new heights)', () => {
    const tile = terrain.tiles.find((t) => t.id === terrain.data.mesh!.tile)!;
    for (let i = 0; i < all.length; i += 997) {
      const [rx, rz] = all[i];
      const col = rx - Math.round((tile.x - mesh.x) / mesh.step),
        row = rz - Math.round((tile.z - mesh.z) / mesh.step);
      if (col < 0 || row < 0 || col >= tile.columns || row >= tile.rows) continue;
      const x = mesh.x + rx * mesh.step,
        z = mesh.z + rz * mesh.step;
      expect(metres(terrain.surfaceHeight(x, z))).toBeCloseTo(
        tile.heights[row * tile.columns + col] as number,
        6,
      );
    }
  });
});

describe('ground layers on the mesh', () => {
  it('clips triangles without creating holes or overlapping area', () => {
    for (const [a, b, c] of [
      [
        [-2.13, -1.27],
        [2.91, -0.45],
        [0.17, 3.22],
      ],
      [
        [-150.3, 40.1],
        [-90.7, 62.4],
        [-120.2, 95.8],
      ],
      [
        [10.2, 12.1],
        [10.25, 12.1],
        [10.2, 12.13],
      ],
    ] as Point[][]) {
      let sum = 0;
      terrain.drape(a, b, c, (p, q, r) => (sum += area(p, q, r)));
      expect(sum / area(a, b, c)).toBeCloseTo(1, 9);
    }
  });

  it('gives every draped piece the plane of the terrain triangle under it', () => {
    let pieces = 0;
    terrain.drape([-12.4, -8.1], [-6.2, -9.7], [-9.3, -3.9], (p, q, r, plane) => {
      for (const [x, z] of [p, q, r, [(p[0] + q[0] + r[0]) / 3, (p[1] + q[1] + r[1]) / 3]])
        expect(plane.at(x, z)).toBeCloseTo(terrain.surfaceHeight(x, z), 9);
      pieces++;
    });
    expect(pieces).toBeGreaterThan(50);
  });

  it('finds the exact lowest ground of a concave footprint', () => {
    // An L-shaped footprint; brute force over a dense sample of its interior.
    const ring = [
      [-20, -12],
      [-18.2, -12],
      [-18.2, -11.4],
      [-19.3, -11.4],
      [-19.3, -10.1],
      [-20, -10.1],
      [-20, -12],
    ];
    const base = terrain.footprintGround([ring]);
    let min = Infinity;
    for (let x = -20; x <= -18.2; x += 0.002)
      for (let z = -12; z <= -10.1; z += 0.002)
        if (x <= -19.3 || z <= -11.4) min = Math.min(min, terrain.surfaceHeight(x, z));
    expect(base).toBeLessThanOrEqual(min + 1e-12);
    expect(min - base).toBeLessThan(1e-3);
  });
});

describe('terrain mesh accuracy (independent native 1 m DTM samples)', () => {
  it('reproduces the reference implementation (scripts/geo/rtin.py) exactly', () => {
    for (const [x, z, h] of control.mesh)
      expect(metres(terrain.surfaceHeight(x, z))).toBeCloseTo(h, 6);
  });

  for (const [name, limit] of Object.entries(control.limits))
    it(`stays within the measured accuracy for ${name}`, () => {
      const samples = control.native.filter((s) => s.group === name);
      const errors = samples.map((s) => metres(terrain.surfaceHeight(s.x, s.z)) - s.dtm);
      expect(errors.length).toBeGreaterThan(200);
      const mean = errors.reduce((s, e) => s + e, 0) / errors.length,
        rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length),
        sorted = errors.map(Math.abs).sort((a, b) => a - b),
        p95 = sorted[Math.floor(sorted.length * 0.95)];
      expect(Math.abs(mean), 'bias').toBeLessThan(limit.mean);
      expect(rmse, 'RMSE').toBeLessThan(limit.rmse);
      expect(p95, 'p95').toBeLessThan(limit.p95);
    });
});
