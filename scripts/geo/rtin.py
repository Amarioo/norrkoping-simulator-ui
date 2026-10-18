"""Adaptive terrain mesh (RTIN) shared by scripts/prepare-terrain-mesh.py and the Step 3 study.

The mesh is a right-triangulated irregular network (longest-edge bisection, "4-8 mesh") over the
5 m terrain node grid of src/lib/data/terrain.json. Its vertices are grid nodes, whose heights are
the bilinear native 1 m DTM at the node (the 5 m grid itself), so the mesh adds no new heights.
Where it is refined is decided by the native 1 m DTM: a triangle is split while some 1 m pixel
centre inside it deviates from its plane by more than the threshold.

Conformity (no cracks or T-junctions): following Martini (Mapbox), the split error is stored per
hypotenuse-midpoint node and propagated from fine to coarse, so both triangles sharing a
hypotenuse make the same decision. Each node is the midpoint of exactly one level, so one bit per
node encodes the whole mesh. src/lib/surfaceMesh.ts and TerrainService.kt decode the same bits.

Levels, coarse to fine (s = root cell size / 2^j in nodes):
  square j  : every cell of size s split by one diagonal; the diagonal runs from (0,0) to (1,1)
              ("main") when (column + row) of the cell is even, else from (1,0) to (0,1).
              Hypotenuse midpoint = cell centre.
  diamond j : the four triangles of each cell between both diagonals (right angle at the centre).
              Hypotenuse midpoint = midpoint of the cell edge.
square 0 is the root (one root cell per ROOT x ROOT nodes); square K (s = 1 node) is never split.
"""
import json, math
from pathlib import Path
import numpy as np

ROOT_DIR = Path(__file__).resolve().parents[2]


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


# Height rules shared by terrain.ts and TerrainService.kt; part of the terrain revision.
# v2 (2026-10-18, Step 2): legacy layer lift removed from the network, land cover, buildings, models.
# v3 (2026-10-18, Step 3): adaptive RTIN surface mesh (dataset `mesh`) instead of the 10 m / 40 m grid.
# v4 (2026-10-18, Step 3.5): network profiles on the mesh (deck anchors, clearances, spans), linear only
#     between two profiled ends, tapered approach offsets.
SURFACE_RULES = 'surface-rtin-v4-network-profiles'


def surface_revision(dataset, profiles_text):
    """Revision of a DTM dataset: grid hash + hash of the surface rules, mesh and bridge profiles.

    Shared by prepare-dtm.py, prepare-terrain-mesh.py and prepare-bridge-profiles.py, so a change to
    any of them is rejected by a client or server still holding the previous one."""
    import hashlib
    base = dataset['revision'].split('-surface-')[0]
    mesh = dataset.get('mesh')
    mesh_key = '' if not mesh else json.dumps({k: v for k, v in mesh.items()}, sort_keys=True)
    digest = hashlib.sha256((SURFACE_RULES + profiles_text + mesh_key).encode()).hexdigest()[:12]
    return base + '-surface-' + digest


def load_grid(terrain):
    import base64
    tile = terrain['tiles'][0]
    g = np.frombuffer(base64.b64decode(tile['heightsBase64']), dtype='<f4').reshape(tile['rows'], tile['columns'])
    return tile, g


class Layout:
    """Node grid of the mesh: aligned to multiples of the root size in scene units."""

    def __init__(self, tile, depth):
        self.depth = depth
        self.root = 2 ** depth                       # root cell size in nodes
        self.step = tile['step']                     # node spacing, scene units (5 m)
        size = self.root * self.step
        x0 = math.floor(tile['x'] / size + 1e-9) * size
        z0 = math.floor(tile['z'] / size + 1e-9) * size
        x1 = tile['x'] + (tile['columns'] - 1) * tile['step']
        z1 = tile['z'] + (tile['rows'] - 1) * tile['step']
        self.roots_x = math.ceil((x1 - x0) / size - 1e-9)
        self.roots_z = math.ceil((z1 - z0) / size - 1e-9)
        self.columns = self.roots_x * self.root + 1
        self.rows = self.roots_z * self.root + 1
        # Integer offset of the tile's first node in mesh nodes (tile.x is a multiple of the step).
        self.ox = round((tile['x'] - x0) / self.step)
        self.oz = round((tile['z'] - z0) / self.step)
        self.x0 = round(x0 / self.step) * self.step
        self.z0 = round(z0 / self.step) * self.step
        self.size = size

    def node_heights(self, g):
        """Height of every mesh node (metres): the tile node, clamped to the tile at its edges."""
        rows = np.clip(np.arange(self.rows) - self.oz, 0, g.shape[0] - 1)
        cols = np.clip(np.arange(self.columns) - self.ox, 0, g.shape[1] - 1)
        return g[np.ix_(rows, cols)].astype(np.float64)

    def levels(self):
        """[(kind, j, cell size in nodes)] coarse to fine."""
        out = []
        for j in range(self.depth + 1):
            out.append(('square', j, self.root >> j))
            if j < self.depth:
                out.append(('diamond', j, self.root >> j))
        return out


def locate(layout, kind, cell, gx, gz, hn):
    """Triangle id, plane height and hypotenuse-midpoint node (flat index, -1 if none) per point.

    gx, gz: positions in node units relative to the mesh origin. hn: node heights [rows, columns].
    """
    C = layout.columns
    ci = np.floor(gx / cell).astype(np.int64)
    cj = np.floor(gz / cell).astype(np.int64)
    ncx = (layout.columns - 1) // cell
    ncz = (layout.rows - 1) // cell
    ci = np.clip(ci, 0, ncx - 1); cj = np.clip(cj, 0, ncz - 1)
    u = gx / cell - ci; v = gz / cell - cj
    i0 = ci * cell; j0 = cj * cell; i1 = i0 + cell; j1 = j0 + cell
    h00 = hn[j0, i0]; h10 = hn[j0, i1]; h01 = hn[j1, i0]; h11 = hn[j1, i1]
    base = cj * ncx + ci
    if kind == 'square':
        main = (ci + cj) % 2 == 0
        a = main & (u >= v)
        b = main & ~(u >= v)
        c = ~main & (u + v <= 1)
        d = ~main & ~(u + v <= 1)
        h = np.empty_like(u)
        h[a] = (h00 + (h10 - h00) * u + (h11 - h10) * v)[a]
        h[b] = (h00 + (h11 - h01) * u + (h01 - h00) * v)[b]
        h[c] = (h00 + (h10 - h00) * u + (h01 - h00) * v)[c]
        h[d] = (h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v))[d]
        half = (a | c).astype(np.int64)  # 1: the half containing (1,0) or (0,0); 0: the other
        tri = base * 2 + half
        mid = (j0 + cell // 2) * C + (i0 + cell // 2) if cell > 1 else np.full_like(base, -1)
        return tri, h, mid
    hc = hn[j0 + cell // 2, i0 + cell // 2]
    bottom = (v <= u) & (v <= 1 - u)
    right = ~bottom & (u >= v) & (u >= 1 - v)
    top = ~bottom & ~right & (v >= u) & (v >= 1 - u)
    left = ~bottom & ~right & ~top
    h = np.empty_like(u)
    h[bottom] = (h00 * (1 - u - v) + h10 * (u - v) + hc * 2 * v)[bottom]
    h[right] = (h10 * (u - v) + h11 * (u + v - 1) + hc * 2 * (1 - u))[right]
    h[top] = (h01 * (v - u) + h11 * (u + v - 1) + hc * 2 * (1 - v))[top]
    h[left] = (h00 * (1 - u - v) + h01 * (v - u) + hc * 2 * u)[left]
    quarter = np.where(bottom, 0, np.where(right, 1, np.where(top, 2, 3)))
    half = cell // 2
    mi = np.select([bottom, right, top], [i0 + half, i1, i0 + half], i0)
    mj = np.select([bottom, right, top], [j0, j0 + half, j1], j0 + half)
    return base * 4 + quarter, h, mj * C + mi


def triangle_counts(layout):
    out = []
    for kind, j, cell in layout.levels():
        n = ((layout.columns - 1) // cell) * ((layout.rows - 1) // cell)
        out.append(n * (2 if kind == 'square' else 4))
    return out


def propagate(layout, tri_error):
    """Node split errors from per-triangle errors (list aligned with layout.levels()), fine to coarse."""
    C, Rr = layout.columns, layout.rows
    err = np.zeros(Rr * C, np.float32)
    levels = layout.levels()
    for (kind, j, cell), e in reversed(list(zip(levels, tri_error))):
        if kind == 'square' and cell == 1:
            continue  # finest triangles never split
        ncx = (C - 1) // cell; ncz = (Rr - 1) // cell
        cj, ci = np.divmod(np.arange(ncx * ncz, dtype=np.int64), ncx)
        i0 = ci * cell; j0 = cj * cell; half = cell // 2
        if kind == 'square':
            e2 = e.reshape(-1, 2).max(axis=1)
            mid = (j0 + half) * C + (i0 + half)
            # The four edge midpoints of the cell are the midpoints of the children (diamond j).
            kids = np.maximum.reduce([err[j0 * C + i0 + half], err[(j0 + cell) * C + i0 + half],
                                      err[(j0 + half) * C + i0], err[(j0 + half) * C + i0 + cell]])
            err[mid] = np.maximum(err[mid], np.maximum(e2, kids))
        else:
            e4 = e.reshape(-1, 4)
            mids = [(j0 * C + i0 + half), ((j0 + half) * C + i0 + cell), ((j0 + cell) * C + i0 + half),
                    ((j0 + half) * C + i0)]
            q = half // 2  # children: squares of size `half`; their centres are q from the edge midpoint
            for k, m in enumerate(mids):
                mj, mi = np.divmod(m, C)
                if half >= 2:
                    # Centres of the two child cells on this side of the edge (the other side's cell adds its own).
                    if k == 0:   kc = [(mj + q) * C + mi - q, (mj + q) * C + mi + q]
                    elif k == 1: kc = [(mj - q) * C + mi - q, (mj + q) * C + mi - q]
                    elif k == 2: kc = [(mj - q) * C + mi - q, (mj - q) * C + mi + q]
                    else:        kc = [(mj - q) * C + mi + q, (mj + q) * C + mi + q]
                    kids = np.maximum(err[kc[0]], err[kc[1]])
                else:
                    kids = 0
                np.maximum.at(err, m, np.maximum(e4[:, k], kids))
    return err.reshape(Rr, C)


def leaves(layout, active):
    """Number of mesh triangles for a boolean node-activity grid (assumed propagated/conforming)."""
    count = 2 * layout.roots_x * layout.roots_z
    C = layout.columns
    for kind, j, cell in layout.levels():
        if kind == 'square' and cell == 1:
            continue
        half = cell // 2
        if kind == 'square':
            # An active cell centre splits both halves of the cell: two more triangles.
            count += 2 * int(active[half::cell, half::cell].sum())
        else:
            # Edge midpoints: horizontal edges (i odd multiple of half, j multiple of cell) and vertical ones.
            hz = active[0::cell, half::cell]; vt = active[half::cell, 0::cell]
            for arr, axis in ((hz, 0), (vt, 1)):
                n_sides = np.full(arr.shape, 2)
                if axis == 0:
                    n_sides[0, :] = 1; n_sides[-1, :] = 1
                else:
                    n_sides[:, 0] = 1; n_sides[:, -1] = 1
                count += int((arr * n_sides).sum())
    return count


def leaf_heights(layout, active, gx, gz, hn, max_level=None):
    """Height of the adaptive mesh and the leaf level index at each point."""
    out = np.full(gx.shape, np.nan)
    level_of = np.full(gx.shape, -1, np.int16)
    todo = np.ones(gx.shape, bool)
    flat = active.ravel()
    levels = layout.levels()
    for li, (kind, j, cell) in enumerate(levels):
        idx = np.flatnonzero(todo)
        if not len(idx):
            break
        _, h, mid = locate(layout, kind, cell, gx[idx], gz[idx], hn)
        last = (kind == 'square' and cell == 1) or (max_level is not None and li == max_level)
        stop = np.ones(len(idx), bool) if last else ~flat[mid]
        out[idx[stop]] = h[stop]
        level_of[idx[stop]] = li
        todo[idx[stop]] = False
    return out, level_of


def descend(layout, active, hn, gx, gz):
    """Scalar leaf search by bisection, as surfaceMesh.ts / TerrainService.kt do it (cross-check of
    leaf_heights): returns the height at node-space point (gx, gz)."""
    R = layout.root
    ri = min(max(math.floor(gx / R), 0), layout.roots_x - 1)
    rj = min(max(math.floor(gz / R), 0), layout.roots_z - 1)
    i0, j0 = ri * R, rj * R
    u, v = gx - i0, gz - j0
    if (ri + rj) % 2 == 0:
        rx, rz, ax, az, bx, bz = (i0 + R, j0, i0, j0, i0 + R, j0 + R) if u >= v else (i0, j0 + R, i0 + R, j0 + R, i0, j0)
    else:
        rx, rz, ax, az, bx, bz = (i0, j0, i0 + R, j0, i0, j0 + R) if u + v <= R else (i0 + R, j0 + R, i0, j0 + R, i0 + R, j0)
    while True:
        sx, sz = ax + bx, az + bz
        if sx % 2 or sz % 2 or not active[sz // 2, sx // 2]:
            break
        mx, mz = sx // 2, sz // 2
        side = (mx - rx) * (gz - rz) - (mz - rz) * (gx - rx)
        side_a = (mx - rx) * (az - rz) - (mz - rz) * (ax - rx)
        if (side >= 0) == (side_a >= 0):
            ax, az, bx, bz = rx, rz, ax, az
        else:
            ax, az, bx, bz = bx, bz, rx, rz
        rx, rz = mx, mz
    e1x, e1z, e2x, e2z = ax - rx, az - rz, bx - rx, bz - rz
    px, pz = gx - rx, gz - rz
    det = e1x * e2z - e1z * e2x
    wa = (px * e2z - pz * e2x) / det; wb = (e1x * pz - e1z * px) / det
    hr = hn[rz, rx]
    return hr + wa * (hn[az, ax] - hr) + wb * (hn[bz, bx] - hr)
