"""Step 5 prototype: road edges as breaklines of the rendered surface (geographically bounded patches).

The rendered ground is an RTIN over the 5 m DTM nodes (surfaceMesh.ts). Draped roads follow its triangles,
which are larger than the road: where a triangle reaches over a wall, terrace or verge, the asphalt is
twisted (Batch B: 829 cross-sections with a crease > 0.3 m). Here, inside prototype boxes, every RTIN leaf
touched by the drawn asphalt of an ordinary (draped) road is re-triangulated so that the asphalt outline
(the union of road strips and junction fans, exactly as cityMesh.ts draws them) consists of mesh edges:

  * road surface: vertices on the outline and on the centrelines take the measured road surface, a robust
    local plane fit (FIT_RADIUS, trimmed at FIT_TRIM) of the native 1 m DTM pixels inside the asphalt, so the
    long profile, crown and crossfall are the DTM's and kerbs/walls beside the road no longer tilt it;
  * terrain: the RTIN leaf corners keep their DTM node heights; terrain triangles meet the road at its edge
    (a wall or verge becomes the slope between the road edge and the leaf corner), so terrain cannot pass
    through the asphalt and nothing outside the touched leaves changes;
  * conformity: every leaf edge is a constraint, points on the patch boundary are linear on the RTIN edge
    (no cracks), so every patch triangle lies in exactly one leaf (lookup: leaf, then its triangles);
  * network contract: where an ordinary road meets a span/approach/join piece, the surface is pinned to that
    piece's end height (PIN_RADIUS blend), so vehicles and drawn pieces meet without a step.

Triangulation: conforming Delaunay (scipy/Qhull), splitting every constraint sub-segment that is not a
Delaunay edge at its midpoint until all are; verified per leaf by area. No new dependency.

Output: terrain.json `mesh.patches` (client + backend), new surface revision. Run after
prepare-bridge-profiles.py (pins come from its spans). Geodata Python:
  python scripts/geo/road_patches.py [--apply] [--boxes=E0,N0,E1,N1;...]
"""
import base64, json, math, sys, time
from collections import defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from scipy.spatial import Delaunay, cKDTree
import rtin
import cdt
import dtm_corrections

# Prototype boxes (SWEREF 99 TM): Hamngatan x Drottninggatan at Saltängsbron's south end; Ektorpsgatan /
# Söderleden; Tvåstugubacken (hilly residential).
BOXES = {
    'saltangsbron-south': (568800, 6495250, 569100, 6495450),
    'ektorpsgatan': (568500, 6493200, 568800, 6493500),
    'tvastugubacken': (571200, 6493200, 571500, 6493500),
    # Järngatan under the E4 (retained-deck correction, scripts/geo/dtm_corrections.py): trench walls.
    'jarngatan-e4': (567280, 6497990, 567440, 6498080),
    # Södra stambanan in a cutting (Pendeln 4.1 %, E 565 795 N 6 497 442): a 5 m grid node on the cut slope
    # 3 m from the track. Track beds are integrated like asphalt in RAIL_BOXES.
    'rail-pendeln-cutting': (565740, 6497400, 565870, 6497495),
}
RAIL_BOXES = {'rail-pendeln-cutting'}
TRACK_BED = 5.0          # m: ballasted track bed integrated as a surface in RAIL_BOXES
FIT_RADIUS, FIT_RADIUS_WIDE, FIT_MIN, FIT_TRIM = 2.5, 5.0, 8, .12   # m, m, pixels, m
STEEP_FIT = .25          # a fitted plane steeper than this (walls inside the outline) is refitted wider
EDGE_SPACING = float(__import__('os').environ.get('PATCH_EDGE_SPACING', 5.0))   # m: outline and centreline sample spacing (study: 2.5 m costs +39 % triangles for the same p95)
OUTLINE_PADS = (0.0, 0.03, 0.08, -0.03)   # m, Step 5.1 retries (wider first: the kerb starts at the outline)
DETAIL_TOL = 0.25        # m: patched terrain this far from the native DTM gets a detail vertex (Step 5.1)
DETAIL_WORSE = 0.10      # m: ... and this much worse than the RTIN was at that pixel
DETAIL_CLEAR = 0.5       # m from leaf edges
DETAIL_ROAD_CLEAR = 1.5  # m from the asphalt outline (a detail vertex at the kerb made a cliff there)
DETAIL_SPACING = 2.0     # m between detail vertices
DETAIL_PER_LEAF = 6
DETAIL_PASSES = 1
CLOSURE_MIN_AREA = float(__import__('os').environ.get('CLOSURE_MIN_AREA', 0.001))   # m², Step 5.1 closure: any overlap (4 m² saved only 2 % segments and left partly draped roads creased)
STEINER_MIN_WIDTH = 0.02  # m: Steiner removal never creates a triangle narrower than this
GHOST_CLEAR = 0.5         # m: ghost outlines (RTIN heights) keep this clearance from member asphalt (no micro-walls)
THIN = 0.01              # m: Step 5.1 thin-triangle levelling distance
FEATHER = 8.0            # m: Step 5.1 group-boundary feathering into the RTIN
DECK_END_REACH = 6.0     # m: Step 5.1 deck-end cross-section rule
STRIP_MAX = 0.5          # m: Step 5.1 measured-footprint planarity for a measured road surface
LEAF_BUFFER = .5         # m: leaves this close to the asphalt are re-triangulated
PIN_RADIUS = 4.0         # m
TRAM_HALF = 0.9          # m: tram corridor half width (gauge 1.435 m + rail heads + margin), level across
SNAP = .01               # m: vertices closer than this are one vertex
PLAN_ONLY = '--plan-only' in sys.argv
USE_CDT = '--conforming' not in sys.argv   # Step 5.1 optimisation: constrained triangulation
# Step 5.1 density: free centreline samples between the nodes (Step 5 prototype: yes).
CENTRELINE = __import__('os').environ.get('PATCH_CENTRELINE', '0') == '1'
TARGET_EDGE_SPACING = float(__import__('os').environ.get('PATCH_TARGET_SPACING', 10.0))   # m
TARGETS_FILE = ROOT / 'scripts/data/geometry-refinement-targets.json'   # Step 5.1
TARGETS = [ROOT / 'src/lib/data/terrain.json', ROOT.parent / 'norrkoping-simulator-backend/src/main/resources/terrain.json']
read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))


class Mesh:
    def __init__(self, dataset):
        self.dataset = dataset
        m = dataset['mesh']
        tile, g = rtin.load_grid(dataset)
        self.layout = rtin.Layout(tile, m['depth'])
        bits = np.frombuffer(base64.b64decode(m['activeBase64']), np.uint8)
        L = self.layout
        self.active = np.unpackbits(bits, bitorder='little')[:L.columns * L.rows].astype(bool).reshape(L.rows, L.columns)
        self.hn = L.node_heights(g)            # metres, [row z, column x]
        self.x0, self.z0, self.step, self.R = L.x0, L.z0, L.step, L.root

    def root(self, gx, gz):
        L, R = self.layout, self.R
        ri = min(max(math.floor(gx / R), 0), L.roots_x - 1); rj = min(max(math.floor(gz / R), 0), L.roots_z - 1)
        i0, j0 = ri * R, rj * R; u, v = gx - i0, gz - j0
        if (ri + rj) % 2 == 0:
            return (i0 + R, j0, i0, j0, i0 + R, j0 + R) if u >= v else (i0, j0 + R, i0 + R, j0 + R, i0, j0)
        return (i0, j0, i0 + R, j0, i0, j0 + R) if u + v <= R else (i0 + R, j0 + R, i0, j0 + R, i0 + R, j0)

    def split(self, t):
        rx, rz, ax, az, bx, bz = t
        sx, sz = ax + bx, az + bz
        if sx % 2 or sz % 2 or not self.active[sz // 2, sx // 2]: return None
        mx, mz = sx // 2, sz // 2
        return (mx, mz, rx, rz, ax, az), (mx, mz, bx, bz, rx, rz)

    def leaf(self, gx, gz):
        """Leaf (rx, rz, ax, az, bx, bz) containing node-space point, as surfaceMesh.ts height()."""
        rx, rz, ax, az, bx, bz = self.root(gx, gz)
        while True:
            sx, sz = ax + bx, az + bz
            if sx % 2 or sz % 2 or not self.active[sz // 2, sx // 2]: return rx, rz, ax, az, bx, bz
            mx, mz = sx // 2, sz // 2
            side = (mx - rx) * (gz - rz) - (mz - rz) * (gx - rx); side_a = (mx - rx) * (az - rz) - (mz - rz) * (ax - rx)
            if (side >= 0) == (side_a >= 0): ax, az, bx, bz = rx, rz, ax, az
            else: ax, az, bx, bz = bx, bz, rx, rz
            rx, rz = mx, mz

    def leaves_in(self, g0, g1):
        """All leaves whose bounding box meets the node-space box g0..g1."""
        L, R = self.layout, self.R
        out = []

        def visit(t):
            xs, zs = (t[0], t[2], t[4]), (t[1], t[3], t[5])
            if max(xs) < g0[0] or min(xs) > g1[0] or max(zs) < g0[1] or min(zs) > g1[1]: return
            s = self.split(t)
            if s is None: out.append(t)
            else: visit(s[0]); visit(s[1])
        for rj in range(max(0, int(g0[1] // R)), min(L.roots_z - 1, int(g1[1] // R)) + 1):
            for ri in range(max(0, int(g0[0] // R)), min(L.roots_x - 1, int(g1[0] // R)) + 1):
                i0, j0 = ri * R, rj * R
                if (ri + rj) % 2 == 0:
                    visit((i0 + R, j0, i0, j0, i0 + R, j0 + R)); visit((i0, j0 + R, i0 + R, j0 + R, i0, j0))
                else:
                    visit((i0, j0, i0 + R, j0, i0, j0 + R)); visit((i0 + R, j0 + R, i0, j0 + R, i0 + R, j0))
        return out


def leaf_key(t, columns):
    """Shared with surfaceMesh.ts / TerrainService.kt: right-angle node and the direction to the hypotenuse."""
    rx, rz, ax, az, bx, bz = t
    dx = int(np.sign(ax + bx - 2 * rx)); dz = int(np.sign(az + bz - 2 * rz))
    return (rz * columns + rx) * 9 + (dx + 1) * 3 + (dz + 1)


def convex_overlap(p, q):
    """Separating-axis test for two convex polygons (n x 2 arrays)."""
    for poly in (p, q):
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            n = np.array([a[1] - b[1], b[0] - a[0]])
            pa, qa = p @ n, q @ n
            if pa.max() < qa.min() - 1e-12 or qa.max() < pa.min() - 1e-12: return False
    return True


def inside_convex(poly, pts, eps=0.0):
    """Points inside a CCW convex polygon (eps > 0 shrinks it)."""
    ok = np.ones(len(pts), bool)
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        e = b - a; L = math.hypot(*e)
        ok &= (e[0] * (pts[:, 1] - a[1]) - e[1] * (pts[:, 0] - a[0])) / L > eps
    return ok


def seg_intersections(a, b, c, d):
    """Parameters (t on ab, u on cd) of a proper intersection, else None."""
    r = b - a; s = d - c; den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-15: return None
    w = c - a
    t = (w[0] * s[1] - w[1] * s[0]) / den; u = (w[0] * r[1] - w[1] * r[0]) / den
    if 1e-9 < t < 1 - 1e-9 and -1e-9 <= u <= 1 + 1e-9: return t, u
    return None


def detail_candidates(mesh, tri, X, h, patched, patched_set, in_union, step_m, node_to_sw, sw_to_node, native, info, corrections, ghosts=()):
    """Native pixels where the patched terrain departs from the measured ground by more than DETAIL_TOL."""
    bl = np.array([[t[0], t[1]] for t in patched] + [[t[2], t[3]] for t in patched] + [[t[4], t[5]] for t in patched], float)
    e0, n1_ = node_to_sw(bl[:, 0].min(), bl[:, 1].min()); e1, n0_ = node_to_sw(bl[:, 0].max(), bl[:, 1].max())
    q0 = int(info['top'] - n1_); q1 = int(info['top'] - n0_) + 1; k0 = int(e0 - info['left']); k1 = int(e1 - info['left']) + 1
    nb = dtm_corrections.apply_to_block(native[q0:q1, k0:k1], q0, k0, corrections)
    qq, kk = np.mgrid[q0:q1, k0:k1]
    qe = info['left'] + kk.ravel() + .5; qn = info['top'] - qq.ravel() - .5; qh = nb.ravel()
    qx, qz = sw_to_node(qe, qn)
    simplex = tri.find_simplex(np.c_[qx, qz])
    ok = np.flatnonzero((simplex >= 0) & np.isfinite(qh))
    T = tri.transform[simplex[ok]]
    bary = np.einsum('ijk,ik->ij', T[:, :2], np.c_[qx[ok], qz[ok]] - T[:, 2])
    after = (np.c_[bary, 1 - bary.sum(1)] * h[tri.simplices[simplex[ok]]]).sum(1)
    before, _ = rtin.leaf_heights(mesh.layout, mesh.active, qx[ok], qz[ok], mesh.hn)
    err = np.abs(after - qh[ok])
    # Only errors the patch introduced: the RTIN's own 5 m error is left as it is (no general refinement).
    bad = (err > DETAIL_TOL) & (err > np.abs(before - qh[ok]) + DETAIL_WORSE)
    cand = ok[bad]; cerr = err[bad]
    if not len(cand): return []
    cand = cand[np.argsort(-cerr)]
    kd = cKDTree(X); cols = mesh.layout.columns
    clear = DETAIL_CLEAR / step_m; spacing = DETAIL_SPACING / step_m
    chosen, cells, per_leaf = [], defaultdict(list), defaultdict(int)
    for j in cand:
        q = np.array([qx[j], qz[j]])
        if kd.query(q)[0] < spacing / 2: continue
        cx, cz = int(q[0] // spacing), int(q[1] // spacing)
        if any(math.hypot(q[0] - c[0], q[1] - c[1]) < spacing for i in (cx - 1, cx, cx + 1) for k in (cz - 1, cz, cz + 1) for c in cells[(i, k)]): continue
        t = mesh.leaf(*q); lk = leaf_key(t, cols)
        if lk not in patched_set or per_leaf[lk] >= DETAIL_PER_LEAF: continue
        cs = np.array([[t[0], t[1]], [t[2], t[3]], [t[4], t[5]]], float)
        if min(abs((cs[(e + 1) % 3, 0] - cs[e, 0]) * (q[1] - cs[e, 1]) - (cs[(e + 1) % 3, 1] - cs[e, 1]) * (q[0] - cs[e, 0]))
               / math.hypot(*(cs[(e + 1) % 3] - cs[e])) for e in range(3)) < clear: continue
        if in_union(q[None], -DETAIL_ROAD_CLEAR / step_m)[0]: continue
        if any(inside_convex(g, q[None], -DETAIL_ROAD_CLEAR / step_m)[0] for g in ghosts): continue
        chosen.append((float(q[0]), float(q[1]), float(qh[j]))); cells[(cx, cz)].append(q); per_leaf[lk] += 1
    return chosen


def plan_groups(boxes, targets, mesh, city, to_node, node_to_sw, sw_to_node, skey, ordinary, grounded, width_of, verbose=True, parts=None):
    """Step 5.1: patch groups from the prototype boxes and the diagnostic targets.

    A target is a set of seed segments (scripts/geo/refinement_targets.py). Its patch covers every RTIN leaf
    the seeds' asphalt touches, and then (closure, depth 1) every ordinary road - and for rail targets every
    ordinary running rail - whose strip enters one of those leaves: a patched leaf never carries a road that
    is not part of its outline, apart from the far ends of those closure roads. Groups whose leaves are
    shared or adjacent (a common leaf edge) are merged, so a patch boundary never cuts asphalt.
    Returns [(name, box E0,N0,E1,N1, segment keys, boxed=False, box_rails=False)].
    """
    step_m = mesh.step * city['meta']['reference']['metresPerUnit']
    buf = LEAF_BUFFER / step_m
    roads = [r for r in city['roads'] if r['kind'] in ('road', 'rail')]
    by_key = defaultdict(list)
    for r in roads: by_key[skey(r)].append(r)
    cache = {}

    def polys(r):
        a, b = np.array(to_node(r['a'])), np.array(to_node(r['b'])); d = b - a; L = math.hypot(*d)
        if L < 1e-9: return []
        hw = width_of(r) / mesh.step / 2
        n = np.array([-d[1], d[0]]) / L * hw
        sq = lambda c: np.array([c + (-hw, -hw), c + (hw, -hw), c + (hw, hw), c + (-hw, hw)])
        return [np.array([a - n, b - n, b + n, a + n]), sq(a), sq(b)]     # strip and the fan zones at its nodes

    def touched(r):
        k = (skey(r), r['kind'])
        if k in cache: return cache[k]
        out = {}
        for poly in [pl for q in ((parts(r) or [r]) if parts else [r]) for pl in polys(q)]:
            lo, hi = poly.min(0) - 1, poly.max(0) + 1
            for t in mesh.leaves_in(lo, hi):
                tri = np.array([[t[0], t[1]], [t[2], t[3]], [t[4], t[5]]], float)
                c = tri.mean(0); grown = c + (tri - c) * (1 + buf / max(1e-9, np.linalg.norm(tri - c, axis=1).min()))
                if convex_overlap(grown, poly): out[leaf_key(t, mesh.layout.columns)] = t
        cache[k] = out
        return out

    CELL = 8.0
    grid = defaultdict(list)
    for r in roads:
        if not (parts(r) if parts else ordinary(r, True)): continue
        a, b = to_node(r['a']), to_node(r['b'])
        for i in range(int(min(a[0], b[0]) // CELL) - 1, int(max(a[0], b[0]) // CELL) + 2):
            for j in range(int(min(a[1], b[1]) // CELL) - 1, int(max(a[1], b[1]) // CELL) + 2): grid[(i, j)].append(r)

    def overlap_area(r, leaves):
        """m² of r's strip inside the given leaves (Sutherland-Hodgman, convex pieces)."""
        strips = [polys(q)[0] for q in ((parts(r) or [r]) if parts else [r]) if polys(q)]
        area = 0.0
        for lk in touched(r):
            if lk not in leaves: continue
            t = leaves[lk]
            for strip in strips: area += clip_area(strip, t)
        return area * step_m * step_m

    def clip_area(strip, t):
        """Area of a convex strip inside leaf triangle t (Sutherland-Hodgman), node units."""
        out = [tuple(v) for v in strip]
        tri = [(t[0], t[1]), (t[2], t[3]), (t[4], t[5])]
        sgn = 1 if (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[1][1] - tri[0][1]) * (tri[2][0] - tri[0][0]) > 0 else -1
        for e in range(3):
            a, b = tri[e], tri[(e + 1) % 3]
            side = lambda q: sgn * ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]))
            nxt = []
            for i in range(len(out)):
                P, Q = out[i], out[(i + 1) % len(out)]
                sp, sq = side(P), side(Q)
                if sp >= 0: nxt.append(P)
                if (sp >= 0) != (sq >= 0):
                    u = sp / (sp - sq); nxt.append((P[0] + (Q[0] - P[0]) * u, P[1] + (Q[1] - P[1]) * u))
            out = nxt
            if not out: break
        if len(out) < 3: return 0.0
        return abs(sum(out[i][0] * out[(i + 1) % len(out)][1] - out[(i + 1) % len(out)][0] * out[i][1] for i in range(len(out)))) / 2

    def leaf_edges(leaves):
        es = set()
        for t in leaves.values():
            for p, q in (((t[0], t[1]), (t[2], t[3])), ((t[2], t[3]), (t[4], t[5])), ((t[4], t[5]), (t[0], t[1]))): es.add(tuple(sorted((p, q))))
        return es

    def bbox(keys, margin=10.0):
        pts = [node_to_sw(*to_node(p)) for k in keys for r in by_key[k] for p in (r['a'], r['b'])]
        E = [p[0] for p in pts]; N = [p[1] for p in pts]
        return (min(E) - margin, min(N) - margin, max(E) + margin, max(N) + margin)

    plans = []   # [name, keys, leaves]
    for name, box in boxes.items():
        rails = name in RAIL_BOXES
        g0 = sw_to_node(box[0], box[3]); g1 = sw_to_node(box[2], box[1])
        mid_in = lambda r: g0[0] <= (to_node(r['a'])[0] + to_node(r['b'])[0]) / 2 <= g1[0] and g0[1] <= (to_node(r['a'])[1] + to_node(r['b'])[1]) / 2 <= g1[1]
        keys = {skey(r) for r in city['roads'] if mid_in(r) and (ordinary(r, rails) or (r['kind'] == 'road' and grounded(r)))}
        leaves = {}
        for k in keys:
            for r in by_key[k]: leaves.update(touched(r))
        plans.append([name, keys, leaves, box])
    for name, t in targets.items():
        seeds = {k for k in t['keys'] if any((parts(r) if parts else ordinary(r, True)) or (r['kind'] == 'road' and grounded(r)) for r in by_key[k])}
        if not seeds: continue
        leaves = {}
        for k in seeds:
            for r in by_key[k]: leaves.update(touched(r))
        keys = set(seeds)
        # closure (depth 1): ordinary roads (and running rails of rail targets) entering the touched leaves
        tris = [np.array([[v[0], v[1]], [v[2], v[3]], [v[4], v[5]]], float) for v in leaves.values()]
        near = {}
        cells = {(i, j) for tri in tris for i in range(int(tri[:, 0].min() // CELL), int(tri[:, 0].max() // CELL) + 1)
                 for j in range(int(tri[:, 1].min() // CELL), int(tri[:, 1].max() // CELL) + 1)}
        for cell in cells:
            for r in grid.get(cell, ()):
                if r['kind'] == 'rail' and not t.get('rails'): continue
                k = skey(r)
                if k in keys or k in near: continue
                if overlap_area(r, leaves) >= CLOSURE_MIN_AREA: near[k] = r
        for k, r in near.items():
            keys.add(k); leaves.update(touched(r))
        plans.append([name, keys, leaves, None])
    # merge groups sharing a leaf or a leaf edge (union-find)
    parent = list(range(len(plans)))
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    owner = {}
    for i, (_, _, leaves, _) in enumerate(plans):
        for e in leaf_edges(leaves) | {('leaf', k) for k in leaves}:
            if e in owner: parent[find(i)] = find(owner[e])
            else: owner[e] = i
    merged = defaultdict(list)
    for i in range(len(plans)): merged[find(i)].append(i)
    groups = []
    for members in merged.values():
        names = [plans[i][0] for i in members]
        keys = set().union(*(plans[i][1] for i in members))
        boxes_ = [plans[i][3] for i in members if plans[i][3] is not None] + [bbox(plans[i][1]) for i in members if plans[i][3] is None]
        box = (min(b[0] for b in boxes_), min(b[1] for b in boxes_), max(b[2] for b in boxes_), max(b[3] for b in boxes_))
        proto = [n for n in names if n in boxes]
        label = '+'.join(proto) if proto else names[0]
        if len(names) > len(proto) + (0 if proto else 1): label += f'+{len(names) - len(proto) - (0 if proto else 1)}'
        groups.append((label, box, keys, False, False))
    if verbose: print(f'plan: {len(plans)} targets/boxes -> {len(groups)} patch groups, {sum(len(g[2]) for g in groups)} segments', flush=True)
    return groups


def build(boxes, verbose=True, targets=None):
    t_start = time.time()
    dataset = read(TARGETS[0])
    mesh = Mesh(dataset)
    ref = dataset['reference']; U = ref['metresPerUnit']; unit = U * ref['gridScaleFactor']; VO = ref['verticalOriginMetres']
    step_m = mesh.step * U                              # metres per node unit (5)
    profiles = read(ROOT / 'src/lib/data/bridge-profiles.json')
    points = profiles['points']; spans = profiles['spans']
    city = read(ROOT / 'src/lib/data/norrkoping-map.json')
    native, info = dtm_corrections.native_mosaic()
    corrections = dtm_corrections.corrected_pixels()

    to_node = lambda p: ((p[0] - mesh.x0) / mesh.step, (p[1] - mesh.z0) / mesh.step)
    sw_to_node = lambda E, N: (((E - ref['originEasting']) / unit - mesh.x0) / mesh.step, ((ref['originNorthing'] - N) / unit - mesh.z0) / mesh.step)
    node_to_sw = lambda gx, gz: (ref['originEasting'] + (mesh.x0 + gx * mesh.step) * unit, ref['originNorthing'] - (mesh.z0 + gz * mesh.step) * unit)
    pkey = lambda p, y: f'{p[0]:.3f},{p[1]:.3f},{y:.3f}'
    skey = lambda r: f"{r['a'][0]:.3f},{r['a'][1]:.3f}|{r['b'][0]:.3f},{r['b'][1]:.3f}"

    def ordinary(r, rails=False):
        return (r['kind'] in (('road', 'rail') if rails else ('road',)) and not r.get('bridge') and not r.get('tunnel')
                and skey(r) not in spans and pkey(r['a'], r['yA']) not in points and pkey(r['b'], r['yB']) not in points)
    width_of = lambda r: TRACK_BED / U if r['kind'] == 'rail' else r['width']

    def draped_parts(r, rails=True):
        """Step 5.1: the draped pieces of a segment. An ordinary segment is one piece; a road/rail segment with
        engineered spans over part of its length (approaches) contributes the intervals between them, longer than
        2 m, as sub-segments whose ends are pinned to the adjoining span (or profile point) level. Before, such a
        segment was left out and its draped part lay on terrain triangles shaped by its neighbours (Södra
        stambanan at E 567 318 N 6 497 155: 0.2 m dips beside the parallel track's integrated bed)."""
        if ordinary(r, rails): return [r]
        if r['kind'] not in (('road', 'rail') if rails else ('road',)) or r.get('bridge') or r.get('tunnel'): return []
        pcs = spans.get(skey(r))
        ka, kb = pkey(r['a'], r['yA']) in points, pkey(r['b'], r['yB']) in points
        if not pcs and ka != kb:
            # A tapered approach (one end on a deck profile point, no spans): draped, pinned at that end; the pin
            # makes the surface at the node the deck level, so the taper offset there becomes zero.
            end = 'a' if ka else 'b'
            sub = dict(r); sub['_key'] = skey(r); sub['_pins'] = [(r[end], (points[pkey(r[end], r['y' + end.upper()])] - .097 + .006) * U + VO)]
            return [sub]
        if not pcs: return []
        L = math.dist(r['a'], r['b']) * U
        if L < 2: return []
        gaps, t = [], 0.0
        for t0, t1 in sorted((q[0], q[1]) for q in pcs):
            if t0 - t > 2 / L: gaps.append((t, t0))
            t = max(t, t1)
        if 1 - t > 2 / L: gaps.append((t, 1.0))
        lerp = lambda tt: [r['a'][0] + (r['b'][0] - r['a'][0]) * tt, r['a'][1] + (r['b'][1] - r['a'][1]) * tt]

        def level(tt):
            if 1e-9 < tt < 1 - 1e-9:
                for q in pcs:
                    if q[0] - 1e-9 <= tt <= q[1] + 1e-9:
                        y = q[2] if q[1] - q[0] < 1e-12 else q[2] + (q[3] - q[2]) * (tt - q[0]) / (q[1] - q[0])
                        return (y + .006) * U + VO
                return None
            end = 'a' if tt < .5 else 'b'
            k = pkey(r[end], r['y' + end.upper()])
            return (points[k] - .097 + .006) * U + VO if k in points else None
        out = []
        for t0, t1 in gaps:
            sub = dict(r); sub['_key'] = skey(r); sub['a'] = lerp(t0); sub['b'] = lerp(t1); sub['_t'] = (t0, t1)
            sub['_pins'] = [(sub[e], lv) for e, tt in (('a', t0), ('b', t1)) for lv in [level(tt)] if lv is not None]
            out.append(sub)
        return out

    # Grounded linear pieces (Step 5, C.1): non-bridge road segments whose drawn profile is fully defined by
    # the network data (deck-end notches, approach hulls, join pieces) and under which nothing passes. They
    # join the asphalt with their own drawn heights, so road, approach and bridge end are one surface.
    # Engineered spans over underpasses, culverts and trenches (spanInfo) stay apart: a way passes below.
    details = read(ROOT / 'src/lib/data/city-bridges.json')['bridges']
    def in_ring(pt, ring):
        x, z = pt; inside = False
        for (ax, az), (bx, bz) in zip(ring, ring[1:] + ring[:1]):
            if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax: inside = not inside
        return inside
    span_rims = [(set(si['ways']), np.array(to_node(si['a'])), np.array(to_node(si['b']))) for si in profiles.get('spanInfo', [])]

    def structure_span(r):
        c = np.array(to_node(((r['a'][0] + r['b'][0]) / 2, (r['a'][1] + r['b'][1]) / 2)))
        for ways, A, B in span_rims:
            if r['way'] not in ways: continue
            d = B - A; L2 = d @ d
            if L2 < 1e-12: continue
            t = ((c - A) @ d) / L2
            if -0.05 <= t <= 1.05 and abs((c[0] - A[0]) * d[1] - (c[1] - A[1]) * d[0]) / math.sqrt(L2) * step_m < 3: return True
        return False

    def drawn_profile(r):
        """Drawn height (RH2000 m) at t of a segment whose profile is data-defined (spans or two points)."""
        ka, kb = pkey(r['a'], r['yA']), pkey(r['b'], r['yB'])
        pcs = spans.get(skey(r))
        if pcs:
            covered = 0.0
            for t0, t1 in sorted((q[0], q[1]) for q in pcs):
                if t0 > covered + 1e-6: return None
                covered = max(covered, t1)
            if covered < 1 - 1e-6: return None
            def f(t):
                for q in pcs:
                    if q[0] - 1e-9 <= t <= q[1] + 1e-9:
                        y = q[2] if q[1] - q[0] < 1e-12 else q[2] + (q[3] - q[2]) * (t - q[0]) / (q[1] - q[0])
                        return (y + .006) * U + VO
                return (pcs[-1][3] + .006) * U + VO
            return f
        if ka in points and kb in points:
            ya, yb = points[ka] - .097, points[kb] - .097
            return lambda t: (ya + (yb - ya) * t + .006) * U + VO
        return None

    crossing_grid = defaultdict(list)
    for r in city['roads']:
        if r['kind'] not in ('road', 'path', 'rail', 'tram', 'stream'): continue
        for i in range(int(min(r['a'][0], r['b'][0]) // .5), int(max(r['a'][0], r['b'][0]) // .5) + 1):
            for j in range(int(min(r['a'][1], r['b'][1]) // .5), int(max(r['a'][1], r['b'][1]) // .5) + 1):
                crossing_grid[(i, j)].append(r)

    def crossed(r):
        """A way passes below: a tunnel or stream, or a way whose ground at the crossing is 2 m below the piece
        (at-grade crossings of streets, tram and rail lines do not count)."""
        a, b = np.array(r['a'], float), np.array(r['b'], float)
        f = drawn_profile(r)
        for i in range(int(min(a[0], b[0]) // .5), int(max(a[0], b[0]) // .5) + 1):
            for j in range(int(min(a[1], b[1]) // .5), int(max(a[1], b[1]) // .5) + 1):
                for o in crossing_grid[(i, j)]:
                    if o is r or {tuple(o['a']), tuple(o['b'])} & {tuple(r['a']), tuple(r['b'])}: continue
                    hit = seg_intersections(a, b, np.array(o['a'], float), np.array(o['b'], float))
                    if not hit: continue
                    if o.get('tunnel') or o['kind'] == 'stream': return True
                    c = a + (b - a) * hit[0]
                    E, N = node_to_sw(*to_node(c))
                    ground = float(dtm_corrections.apply_to_block(native[int(info['top'] - N):int(info['top'] - N) + 1, int(E - info['left']):int(E - info['left']) + 1],
                                                                  int(info['top'] - N), int(E - info['left']), corrections)[0, 0])
                    if f(hit[0]) - ground > 2.0: return True
        return False

    def grounded(r):
        # Roads only: a tram hull is computed from the track-anchored tram deck, independently of the road
        # hull beside it; averaging both left the surface between them (Step 5 render check).
        if r['kind'] != 'road' or r.get('bridge') or r.get('tunnel') or ordinary(r) or structure_span(r): return False
        if drawn_profile(r) is None or crossed(r): return False
        mid = ((r['a'][0] + r['b'][0]) / 2, (r['a'][1] + r['b'][1]) / 2)
        return not any(in_ring(mid, [tuple(q) for q in d['ring']]) for d in details)

    planar_cache = {}
    walls = defaultdict(list)   # way -> classified sites with their measured strip residual
    if TARGETS_FILE.exists():
        for c in read(TARGETS_FILE)['candidates']:
            res = c.get('evidence', {}).get('stripResidual')
            if res is not None and c.get('way') is not None: walls[c['way']].append((c['E'], c['N'], res))

    def planar(r):
        """Step 5.1: the measured footprint across a road is planar (line-fit residual <= STRIP_MAX at three
        interior stations, and at every classified site of the way within 5 m, refinement_targets.py evidence):
        only then is the measured surface taken for it. (Stations at the segment ends lie in junctions, where the
        cross line meets kerbs and other roads, and excluded planar motorways.) A road over a wall or steps (way 1302054725,
        E 564 511 N 6 495 920: residual 1.39 m) stays on the RTIN (ghost outline) instead of a 1.5 m twist."""
        if r['kind'] != 'road': return True
        k = skey(r)
        if k in planar_cache: return planar_cache[k]
        A, B = np.array(node_to_sw(*to_node(r['a']))), np.array(node_to_sw(*to_node(r['b'])))
        d = B - A; L = math.hypot(*d); ok = True
        for E_, N_, res in walls.get(r['way'], ()):
            t_ = max(0.0, min(1.0, float((np.array([E_, N_]) - A) @ d / max(L * L, 1e-12))))
            if math.hypot(*(A + d * t_ - (E_, N_))) <= 5.0 and res > STRIP_MAX: ok = False
        if L > 1e-6:
            u = d / L; n = np.array([-u[1], u[0]]); half = r['width'] * U / 2; o = np.arange(-half, half + 1e-9, 0.5)
            for f in (0.25, 0.5, 0.75):
                P = A + d * f
                prof = []
                for a in (-1.0, 0.0, 1.0):
                    E = P[0] + u[0] * a + n[0] * o; N = P[1] + u[1] * a + n[1] * o
                    rr = (info['top'] - N).astype(int); cc = (E - info['left']).astype(int)
                    r0, c0 = rr.min(), cc.min()
                    blk = dtm_corrections.apply_to_block(np.array(native[r0:rr.max() + 1, c0:cc.max() + 1]), r0, c0, corrections)
                    prof.append(blk[rr - r0, cc - c0])
                h = np.nanmedian(np.array(prof, float), 0); okm = np.isfinite(h)
                if okm.sum() < 4: continue
                c = np.polyfit(o[okm], h[okm], 1)
                if np.abs(np.polyval(c, o[okm]) - h[okm]).max() > STRIP_MAX: ok = False; break
        planar_cache[k] = ok
        return ok
    parts_planar = lambda r: draped_parts(r) if planar(r) else []
    groups = plan_groups(boxes, targets or {}, mesh, city, to_node, node_to_sw, sw_to_node, skey, ordinary, grounded, width_of, verbose, parts_planar)
    if PLAN_ONLY:
        leaves = set()
        return dataset, None, {'groups': len(groups), 'segments': sum(len(g[2]) for g in groups)}
    group_boxes = {g[0]: [round(v, 1) for v in g[1]] for g in groups if g[0] not in boxes}
    report = {}
    integrated = set()
    members = set()       # Step 5.1: segments whose draped parts take the measured surface
    all_vertices, all_tris, all_leaves, all_classes = [], [], [], []
    only = __import__('os').environ.get('PATCH_ONLY')   # debugging: build only the named group(s) (dry run)
    for name, box, keys, boxed, box_rails in groups:
        if only and name not in only.split(','): continue
        # Step 5.1: an outline that coincides with a leaf edge to within millimetres cannot be tiled exactly;
        # such a group is retried with the asphalt outline padded by a few centimetres (OUTLINE_PADS).
        # Step 5.1: terrain detail points (node x, z, RH2000 m) found after a first pass, see DETAIL_TOL.
        detail = []; refined = 0; attempt = 0
        # Step 5.1 density: the Step 5 prototype boxes keep their verified density; diagnostic targets use outline
        # vertices only at TARGET_EDGE_SPACING (study, 25 targets: -21 % triangles, asphalt RMSE 0.056 -> 0.064 m).
        proto = any(part in boxes for part in name.split('+'))
        spacing = EDGE_SPACING if proto else TARGET_EDGE_SPACING
        centreline = True if proto else CENTRELINE
        # attempts: outline pads, then (last resort) without ghost outlines
        attempts = [(p_, True) for p_ in OUTLINE_PADS] + [(0.0, False)]
        while attempt < len(attempts):
            pad, use_ghosts = attempts[attempt]
            fixed_segs = []
            try:
                g0 = sw_to_node(box[0], box[3]); g1 = sw_to_node(box[2], box[1])
                inbox = lambda p: g0[0] <= p[0] <= g1[0] and g0[1] <= p[1] <= g1[1]
                # ---- asphalt outline: strips and draped junction fans (cityMesh.ts buildNetwork) ----
                mid_in = lambda r: inbox(to_node(((r['a'][0] + r['b'][0]) / 2, (r['a'][1] + r['b'][1]) / 2)))
                # Prototype boxes (Step 5, boxed): every ordinary road (and running rail in RAIL_BOXES) whose midpoint
                # is in the box. Step 5.1 targets: the planned segment set (plan_groups), merged with any box it touches.
                segs = [r for r in city['roads'] if boxed and mid_in(r) and ordinary(r, box_rails)] +                        [q for r in city['roads'] if skey(r) in keys for q in parts_planar(r)]
                fixed_segs = [r for r in city['roads'] if r['kind'] == 'road' and ((boxed and mid_in(r)) or skey(r) in keys) and grounded(r)]
                fixed_fn = {id(r): drawn_profile(r) for r in fixed_segs}
                integrated.update(skey(r) for r in fixed_segs)
                segs = segs + fixed_segs
                pieces = []; piece_seg = []
                for r in segs:
                    a, b = np.array(to_node(r['a'])), np.array(to_node(r['b']))
                    d = b - a; L = math.hypot(*d)
                    if L < 1e-9: continue
                    n = np.array([-d[1], d[0]]) / L * ((width_of(r) + pad / U) / mesh.step) / 2
                    pieces.append(np.array([a - n, b - n, b + n, a + n]))       # CCW in node space (x right, z down)
                    piece_seg.append(r)
                junctions = defaultdict(list)
                for r in city['roads']:
                    if r['kind'] != 'road': continue
                    for p, y in ((r['a'], r['yA']), (r['b'], r['yB'])):
                        junctions[(p[0], p[1])].append(r)
                # Every network end at a node, all kinds (pins and exact node levels; fans use road junctions only).
                at_node = defaultdict(list)
                for r in city['roads']:
                    if r['kind'] in ('road', 'rail', 'tram', 'path'):
                        for q in (r['a'], r['b']): at_node[(q[0], q[1])].append(r)
                fan_nodes = set()
                for r in segs:
                    for p in (r['a'], r['b']):
                        inc = junctions[(p[0], p[1])]
                        if len(inc) < 2 or not all(ordinary(o) or id(o) in fixed_fn or grounded(o) for o in inc): continue
                        fan_nodes.add((p[0], p[1]))
                # Fans at a node joined by grounded pieces stand at the node's data level (no measured surface there).
                fan_level = {}
                for p in fan_nodes:
                    lv = [fixed_fn[id(o)](0.0 if (o['a'][0], o['a'][1]) == p else 1.0) for o in junctions[p] if id(o) in fixed_fn]
                    if lv: fan_level[p] = max(lv)
                piece_fan = {}
                for p in fan_nodes:
                    c = np.array(to_node(p)); offs = []
                    for o in junctions[p]:
                        d = np.array(to_node(o['b'])) - np.array(to_node(o['a'])); L = math.hypot(*d)
                        if L < 1e-9: continue
                        n = np.array([-d[1], d[0]]) / L * ((o['width'] + pad / U) / mesh.step) / 2
                        offs += [n, -n]
                    offs.sort(key=lambda v: math.atan2(v[1], v[0]))
                    for i in range(len(offs)):
                        u, v = offs[i], offs[(i + 1) % len(offs)]
                        if abs(u[0] * v[1] - u[1] * v[0]) < 1e-12: continue
                        tri = np.array([c, c + u, c + v])
                        if (tri[1, 0] - tri[0, 0]) * (tri[2, 1] - tri[0, 1]) - (tri[1, 1] - tri[0, 1]) * (tri[2, 0] - tri[0, 0]) < 0: tri = tri[[0, 2, 1]]
                        if p in fan_level: piece_fan[len(pieces)] = fan_level[p]
                        pieces.append(tri); piece_seg.append(None)
                if not pieces: break
                P = len(pieces)
                lo = np.array([pc.min(0) for pc in pieces]); hi = np.array([pc.max(0) for pc in pieces])
                CELL = 2.0
                pgrid = defaultdict(list)
                for k in range(P):
                    for i in range(int(lo[k, 0] // CELL), int(hi[k, 0] // CELL) + 1):
                        for j in range(int(lo[k, 1] // CELL), int(hi[k, 1] // CELL) + 1): pgrid[(i, j)].append(k)

                def in_union(pts, eps=0.0, measured_only=False):
                    """Inside the asphalt (measured_only: not inside a grounded linear piece, whose height is data)."""
                    pts = np.atleast_2d(pts); out = np.zeros(len(pts), bool)
                    for idx, q in enumerate(pts):
                        ci, cj = int(q[0] // CELL), int(q[1] // CELL)
                        # a grown test (eps < 0) also reaches pieces registered in the neighbouring cells
                        ks = pgrid.get((ci, cj), ()) if eps >= 0 else {k for i in (ci - 1, ci, ci + 1) for j in (cj - 1, cj, cj + 1) for k in pgrid.get((i, j), ())}
                        if measured_only and any(((piece_seg[k] is not None and id(piece_seg[k]) in fixed_fn) or k in piece_fan)
                                                 and inside_convex(pieces[k], q[None], -1e-9)[0] for k in ks):
                            continue
                        for k in ks:
                            if inside_convex(pieces[k], q[None], eps)[0]: out[idx] = True; break
                    return out

                def fixed_height(q):
                    """Highest drawn height of the grounded linear pieces containing node-space q (level cross-section)."""
                    hs = []
                    for k in pgrid.get((int(q[0] // CELL), int(q[1] // CELL)), ()):
                        r = piece_seg[k]
                        if k in piece_fan and inside_convex(pieces[k], q[None], -1e-6)[0]: hs.append(piece_fan[k]); continue
                        if r is None or id(r) not in fixed_fn or not inside_convex(pieces[k], q[None], -1e-6)[0]: continue
                        a, b = np.array(to_node(r['a'])), np.array(to_node(r['b'])); d = b - a
                        t = min(1.0, max(0.0, float(((q - a) @ d) / (d @ d))))
                        hs.append(fixed_fn[id(r)](t))
                    return float(np.max(hs)) if hs else None

                # Tram corridors in the street (Step 5): embedded rails are level across the gauge at the tram's own
                # drawn height (trackProfile.ts), so inside the asphalt the surface is level across the corridor and
                # its edges are mesh edges. Draped trams take the measured street surface at their centreline; linear
                # ones (approach hulls) their data profile. Off the street (reserved track) nothing changes.
                trams = [r for r in city['roads'] if r['kind'] == 'tram' and not r.get('bridge') and not r.get('tunnel')
                         and mid_in(r) and not structure_span(r)]
                tram_rects = []
                for r in trams:
                    a, b = np.array(to_node(r['a'])), np.array(to_node(r['b']))
                    d = b - a; L = math.hypot(*d)
                    if L < 1e-9: continue
                    n = np.array([-d[1], d[0]]) / L * (TRAM_HALF / step_m)
                    rect = np.array([a - n, b - n, b + n, a + n])
                    if in_union(rect.mean(0)[None])[0] or in_union(rect).any(): tram_rects.append((rect, r))
                tgrid = defaultdict(list)
                for k, (rect, _) in enumerate(tram_rects):
                    tl, th = rect.min(0), rect.max(0)
                    for i in range(int(tl[0] // CELL), int(th[0] // CELL) + 1):
                        for j in range(int(tl[1] // CELL), int(th[1] // CELL) + 1): tgrid[(i, j)].append(k)
                all_edges = [(pc[e], pc[(e + 1) % len(pc)]) for pc in pieces for e in range(len(pc))] + \
                            [(rc[e], rc[(e + 1) % 4]) for rc, _ in tram_rects for e in range(4)]
                egrid = defaultdict(list)
                for k, (a, b) in enumerate(all_edges):
                    for i in range(int(min(a[0], b[0]) // CELL), int(max(a[0], b[0]) // CELL) + 1):
                        for j in range(int(min(a[1], b[1]) // CELL), int(max(a[1], b[1]) // CELL) + 1): egrid[(i, j)].append(k)

                def split_by_edges(a, b):
                    ks = set()
                    for i in range(int(min(a[0], b[0]) // CELL), int(max(a[0], b[0]) // CELL) + 1):
                        for j in range(int(min(a[1], b[1]) // CELL), int(max(a[1], b[1]) // CELL) + 1): ks.update(egrid.get((i, j), ()))
                    ts = [0.0, 1.0]
                    for k in ks:
                        hit = seg_intersections(a, b, all_edges[k][0], all_edges[k][1])
                        if hit: ts.append(hit[0])
                    return sorted(set(round(t, 12) for t in ts))
                tram_edges = []
                for rect, _ in tram_rects:
                    for e in range(4):
                        a, b = rect[e], rect[(e + 1) % 4]
                        ts = split_by_edges(a, b)
                        for t0, t1 in zip(ts, ts[1:]):
                            if (t1 - t0) * math.hypot(*(b - a)) < 1e-6: continue
                            if in_union((a + (b - a) * (t0 + t1) / 2)[None], -1e-9)[0]: tram_edges.append((a + (b - a) * t0, a + (b - a) * t1))

                def tram_height(q, field_at):
                    """Highest tram corridor level at node-space q (level across the gauge), else None."""
                    hs = []
                    for k in tgrid.get((int(q[0] // CELL), int(q[1] // CELL)), ()):
                        rect, r = tram_rects[k]
                        if not inside_convex(rect, q[None], -1e-6)[0]: continue
                        a, b = np.array(to_node(r['a'])), np.array(to_node(r['b'])); d = b - a
                        t = min(1.0, max(0.0, float(((q - a) @ d) / (d @ d))))
                        f = drawn_profile(r)
                        hs.append(f(t) if f else field_at(a + d * t))
                    return max(hs) if hs else None
                # Outline: piece edges split at mutual crossings, kept where exactly one side is asphalt.
                outline = []
                eps = 1e-4
                for k in range(P):
                    near = set()
                    for i in range(int(lo[k, 0] // CELL), int(hi[k, 0] // CELL) + 1):
                        for j in range(int(lo[k, 1] // CELL), int(hi[k, 1] // CELL) + 1): near.update(pgrid[(i, j)])
                    near.discard(k)
                    poly = pieces[k]
                    for e in range(len(poly)):
                        a, b = poly[e], poly[(e + 1) % len(poly)]
                        ts = [0.0, 1.0]
                        for o in near:
                            q = pieces[o]
                            for f in range(len(q)):
                                hit = seg_intersections(a, b, q[f], q[(f + 1) % len(q)])
                                if hit: ts.append(hit[0])
                        for rc, _ in tram_rects:
                            for f in range(4):
                                hit = seg_intersections(a, b, rc[f], rc[(f + 1) % 4])
                                if hit: ts.append(hit[0])
                        ts = sorted(set(round(t, 12) for t in ts))
                        d = b - a; L = math.hypot(*d); nrm = np.array([-d[1], d[0]]) / L
                        for t0, t1 in zip(ts, ts[1:]):
                            if (t1 - t0) * L < 1e-6: continue
                            m = a + d * (t0 + t1) / 2
                            sides = in_union(np.array([m + nrm * eps, m - nrm * eps]))
                            if sides[0] != sides[1]: outline.append((a + d * t0, a + d * t1))
                outline += tram_edges
                if __import__('os').environ.get('PATCH_DEBUG'):
                    qE, qN = map(float, __import__('os').environ['PATCH_DEBUG'].split(','))
                    q = np.array(sw_to_node(qE, qN))
                    print('DEBUG in_union', in_union(q[None])[0], 'pieces containing:',
                          [(k, piece_seg[k]['way'] if piece_seg[k] is not None else 'fan') for k in range(P) if inside_convex(pieces[k], q[None], -1e-6)[0]])
                    for a, b in outline:
                        m = (a + b) / 2
                        if math.hypot(*(m - q)) * step_m < 3:
                            print('  outline', [round(v, 2) for v in node_to_sw(*a)], [round(v, 2) for v in node_to_sw(*b)])
                    for k in range(P):
                        if np.linalg.norm(pieces[k].mean(0) - q) * step_m < 8:
                            print('  piece', k, piece_seg[k]['way'] if piece_seg[k] is not None else 'fan', [[round(v, 2) for v in node_to_sw(*c)] for c in pieces[k]])
                # ---- leaves to re-triangulate ----
                buf = LEAF_BUFFER / step_m
                cand = mesh.leaves_in(lo.min(0) - 1, hi.max(0) + 1)
                patched = []
                for t in cand:
                    tri = np.array([[t[0], t[1]], [t[2], t[3]], [t[4], t[5]]], float)
                    tl, th = tri.min(0) - buf, tri.max(0) + buf
                    ks = set()
                    for i in range(int(tl[0] // CELL), int(th[0] // CELL) + 1):
                        for j in range(int(tl[1] // CELL), int(th[1] // CELL) + 1): ks.update(pgrid.get((i, j), ()))
                    c = tri.mean(0); grown = c + (tri - c) * (1 + buf / max(1e-9, np.linalg.norm(tri - c, axis=1).min()))
                    if any(convex_overlap(grown, pieces[k]) for k in ks): patched.append(t)
                patched_set = {leaf_key(t, mesh.layout.columns) for t in patched}
                # ---- Step 5.1: ghost outlines ----
                # A draped road, track or tram that is not part of this group but crosses its leaves (the far end
                # of a closure road, a road at the group's boundary node) would drape over terrain triangles that
                # slope from the measured asphalt to the leaf corners: new creases where the RTIN had none
                # (Eksundsvägen, E 563 423 N 6 493 362). Its footprint edges become constraints whose vertices keep
                # the RTIN heights, so under it the surface is what it was; only the asphalt boundary changes.
                member_keys = {skey(r) for r in city['roads'] if (boxed and mid_in(r) and ordinary(r, box_rails)) or (skey(r) in keys and (parts_planar(r) or grounded(r)))}
                gb_lo = np.array([[t[0], t[1]] for t in patched] + [[t[2], t[3]] for t in patched] + [[t[4], t[5]] for t in patched], float)
                glo, ghi = gb_lo.min(0) - 1, gb_lo.max(0) + 1
                ghosts = []
                # Step 5.1 optimisation: paths and linear (profiled) pieces too: their drawn height is fixed or draped,
                # and the terrain under them must stay what it was (a path approach at E 570 439 N 6 499 117 went 0.54 m
                # under the terrain once the patch beside it changed shape).
                for r in city['roads']:
                    # bridges too: nothing is filled under a deck, and the terrain under its ends stays as it was
                    if not use_ghosts or r['kind'] not in ('road', 'rail', 'tram', 'path') or skey(r) in member_keys or r.get('tunnel'): continue
                    a0, b0 = to_node(r['a']), to_node(r['b'])
                    if max(a0[0], b0[0]) < glo[0] or min(a0[0], b0[0]) > ghi[0] or max(a0[1], b0[1]) < glo[1] or min(a0[1], b0[1]) > ghi[1]: continue
                    if r['kind'] == 'tram' and not r.get('bridge') and (spans.get(skey(r)) or structure_span(r)): continue
                    for q in ((draped_parts(r) or [r]) if r['kind'] in ('road', 'rail') and not r.get('bridge') else [r]):
                        a, b = np.array(to_node(q['a'])), np.array(to_node(q['b'])); d = b - a; L = math.hypot(*d)
                        if L < 1e-9: continue
                        w_ = TRACK_BED / U if q['kind'] == 'rail' else max(q['width'], 0.06)
                        n = np.array([-d[1], d[0]]) / L * (w_ / mesh.step) / 2
                        rect = np.array([a - n, b - n, b + n, a + n])
                        if any(convex_overlap(rect, np.array([[t[0], t[1]], [t[2], t[3]], [t[4], t[5]]], float)) for t in patched
                               if not (max(t[0], t[2], t[4]) < rect[:, 0].min() or min(t[0], t[2], t[4]) > rect[:, 0].max()
                                       or max(t[1], t[3], t[5]) < rect[:, 1].min() or min(t[1], t[3], t[5]) > rect[:, 1].max())):
                            ghosts.append(rect)
                ghost_raw = [(g[e], g[(e + 1) % 4]) for g in ghosts for e in range(4)]
                # Patched leaf edges near each ghost edge: a long ghost edge is cut there first, so only its pieces
                # inside patched leaves are kept (a 180 m edge whose midpoint lay outside was dropped whole).
                pl_grid = defaultdict(list)
                for t in patched:
                    for p_, q_ in (((t[0], t[1]), (t[2], t[3])), ((t[2], t[3]), (t[4], t[5])), ((t[4], t[5]), (t[0], t[1]))):
                        pa, pb = np.array(p_, float), np.array(q_, float)
                        for i in range(int(min(pa[0], pb[0]) // CELL), int(max(pa[0], pb[0]) // CELL) + 1):
                            for j in range(int(min(pa[1], pb[1]) // CELL), int(max(pa[1], pb[1]) // CELL) + 1): pl_grid[(i, j)].append((pa, pb))
                ghost_edges = []
                for gi, (a, b) in enumerate(ghost_raw):
                    near_leaf = {(tuple(c), tuple(d)): (c, d) for i in range(int(min(a[0], b[0]) // CELL), int(max(a[0], b[0]) // CELL) + 1)
                                 for j in range(int(min(a[1], b[1]) // CELL), int(max(a[1], b[1]) // CELL) + 1) for c, d in pl_grid.get((i, j), ())}
                    ts = [0.0, 1.0] + [h[0] for c, d in all_edges + ghost_raw[:gi] + ghost_raw[gi + 1:] + list(near_leaf.values())
                                       for h in [seg_intersections(a, b, c, d)] if h]
                    ts = sorted(set(round(t, 12) for t in ts))
                    for t0, t1 in zip(ts, ts[1:]):
                        if (t1 - t0) * math.hypot(*(b - a)) * step_m < 0.02: continue   # slivers carry no shape
                        m = a + (b - a) * (t0 + t1) / 2
                        if leaf_key(mesh.leaf(*m), mesh.layout.columns) not in patched_set or in_union(m[None], 1e-9)[0]: continue
                        # Optimisation: a ghost outline keeps GHOST_CLEAR from the member asphalt. A ghost vertex 1 cm
                        # from a member outline vertex (RTIN height beside a measured height up to 2.5 m higher) closed
                        # the step with a vertical micro-wall (E 570 589 N 6 493 307); the clearance spreads it.
                        L = (t1 - t0) * math.hypot(*(b - a)) * step_m
                        us = np.linspace(t0, t1, max(2, math.ceil(L / 0.1) + 1))
                        near = in_union(a + (b - a) * us[:, None], -GHOST_CLEAR / step_m)
                        k = 0
                        while k < len(us):
                            if near[k]: k += 1; continue
                            j = k
                            while j + 1 < len(us) and not near[j + 1]: j += 1
                            s0 = t0 if k == 0 else us[k]; s1 = t1 if j == len(us) - 1 else us[j]
                            if (s1 - s0) * math.hypot(*(b - a)) * step_m >= 0.02: ghost_edges.append((a + (b - a) * s0, a + (b - a) * s1))
                            k = j + 1
                if __import__('os').environ.get('PATCH_DEBUG'):
                    qE, qN = map(float, __import__('os').environ['PATCH_DEBUG'].split(','))
                    q = np.array(sw_to_node(qE, qN))
                    print('DEBUG ghosts', len(ghosts), 'ghost edges', len(ghost_edges), 'raw', len(ghost_raw))
                    for a, b in ghost_raw:
                        if min(math.hypot(*(a - q)), math.hypot(*(b - q))) * step_m < 30: print('  raw', [round(v, 2) for v in node_to_sw(*a)], [round(v, 2) for v in node_to_sw(*b)])
                    for a, b in ghost_edges:
                        if math.hypot(*((a + b) / 2 - q)) * step_m < 15: print('  kept', [round(v, 2) for v in node_to_sw(*a)], [round(v, 2) for v in node_to_sw(*b)])
                # Leaf edges: interior (two patched leaves) and boundary (one).
                edge_count = defaultdict(int)
                for t in patched:
                    for (p, q) in (((t[0], t[1]), (t[2], t[3])), ((t[2], t[3]), (t[4], t[5])), ((t[4], t[5]), (t[0], t[1]))):
                        edge_count[tuple(sorted((p, q)))] += 1
                # ---- planar straight-line graph ----
                pts = []; index = {}; snap = defaultdict(list)
                tol = SNAP / step_m

                def vid(p):
                    """Vertex id; points within SNAP of an existing vertex reuse it (leaf corners come first)."""
                    x, z = float(p[0]), float(p[1])
                    cx, cz = int(math.floor(x / tol)), int(math.floor(z / tol))
                    for i in range(cx - 1, cx + 2):
                        for j in range(cz - 1, cz + 2):
                            for v in snap[(i, j)]:
                                if math.hypot(pts[v][0] - x, pts[v][1] - z) < tol: return v
                    v = len(pts); pts.append((x, z)); snap[(cx, cz)].append(v); index[(round(x, 7), round(z, 7))] = v
                    return v
                for t in patched:
                    for q in ((t[0], t[1]), (t[2], t[3]), (t[4], t[5])): vid(q)
                n_nodes = len(pts)
                locked = set()
                # Network nodes are exact vertices (never snapped or moved): segments meeting there share one height.
                node_vertex = {}
                for r in segs + [r for _, r in tram_rects]:
                    for q in (r['a'], r['b']):
                        v = vid(np.array(to_node(q)))
                        if v >= n_nodes:
                            pts[v] = tuple(float(c) for c in to_node(q)); locked.add(v)
                        node_vertex[(q[0], q[1])] = v

                def end_level(o, q):
                    """Drawn level of segment o at its end q when data-defined (profile point or span end), else None."""
                    end = 'a' if (o['a'][0], o['a'][1]) == q else 'b'
                    k = pkey(o[end], o['y' + end.upper()])
                    if k in points: return (points[k] - .097 + .006) * U + VO
                    hit = [c for c in spans.get(skey(o), []) if (c[0] <= 1e-9 if end == 'a' else c[1] >= 1 - 1e-9)]
                    return ((hit[0][2] if end == 'a' else hit[0][3]) + .006) * U + VO if hit else None
                # Any network node inside the re-triangulated leaves that ends a span or profiled piece is an exact vertex
                # at that level: the triangulation beside it is new, and the draped way next to it reads the surface there.
                node_level = {}
                for q, inc in at_node.items():
                    g = np.array(to_node(q))
                    if not (g0[0] - 20 <= g[0] <= g1[0] + 20 and g0[1] - 20 <= g[1] <= g1[1] + 20): continue
                    if leaf_key(mesh.leaf(*g), mesh.layout.columns) not in patched_set: continue
                    levels = [lv for o in inc if not (o.get('bridge') or id(o) in fixed_fn) for lv in [end_level(o, q)] if lv is not None]
                    if not levels: continue
                    v = vid(g)
                    if v >= n_nodes:
                        pts[v] = tuple(float(c) for c in g); locked.add(v)
                    node_level[v] = max(levels)

                on_edge = set()     # vertices placed exactly on a leaf edge (never moved again)

                def leaf_vid(p):
                    """A vertex exactly on a leaf edge: a reused nearby vertex is moved onto it and locked there."""
                    v = vid(p)
                    if v >= n_nodes and v not in on_edge: pts[v] = (float(p[0]), float(p[1]))
                    locked.add(v); on_edge.add(v)
                    return v
                segments = []        # (i, j, kind) kind: 'leaf' | 'road'
                # outline split at leaf edges
                lgrid = defaultdict(list)
                for e in edge_count:
                    (x1, z1), (x2, z2) = e
                    for i in range(int(min(x1, x2) // CELL), int(max(x1, x2) // CELL) + 1):
                        for j in range(int(min(z1, z2) // CELL), int(max(z1, z2) // CELL) + 1): lgrid[(i, j)].append(e)
                leaf_split = defaultdict(list)
                for a, b in outline:
                    ts = [0.0, 1.0]
                    es = set()
                    for i in range(int(min(a[0], b[0]) // CELL), int(max(a[0], b[0]) // CELL) + 1):
                        for j in range(int(min(a[1], b[1]) // CELL), int(max(a[1], b[1]) // CELL) + 1): es.update(lgrid.get((i, j), ()))
                    for e in es:
                        hit = seg_intersections(a, b, np.array(e[0], float), np.array(e[1], float))
                        if hit:
                            ts.append(hit[0]); leaf_split[e].append(hit[1])
                    ts = sorted(set(ts))
                    # densify to EDGE_SPACING
                    for t0, t1 in zip(ts, ts[1:]):
                        L = math.hypot(*(b - a)) * (t1 - t0) * step_m
                        n = max(1, math.ceil(L / spacing))
                        for k in range(n):
                            p = a + (b - a) * (t0 + (t1 - t0) * k / n); q = a + (b - a) * (t0 + (t1 - t0) * (k + 1) / n)
                            i, j = vid(p), vid(q)
                            if i != j: segments.append((i, j, 'road'))
                # ghost outlines: constraints split at leaf edges, never asphalt
                for a, b in ghost_edges:
                    ts = [0.0, 1.0]
                    es = set()
                    for i in range(int(min(a[0], b[0]) // CELL), int(max(a[0], b[0]) // CELL) + 1):
                        for j in range(int(min(a[1], b[1]) // CELL), int(max(a[1], b[1]) // CELL) + 1): es.update(lgrid.get((i, j), ()))
                    for e in es:
                        hit = seg_intersections(a, b, np.array(e[0], float), np.array(e[1], float))
                        if hit:
                            ts.append(hit[0]); leaf_split[e].append(hit[1])
                    ts = sorted(set(ts))
                    for t0, t1 in zip(ts, ts[1:]):
                        i, j = vid(a + (b - a) * t0), vid(a + (b - a) * t1)
                        if i != j: segments.append((i, j, 'ghost'))
                for e, ts in leaf_split.items():
                    ts = sorted(set([0.0, 1.0] + [min(1.0, max(0.0, u)) for u in ts]))
                    a, b = np.array(e[0], float), np.array(e[1], float)
                    for t0, t1 in zip(ts, ts[1:]):
                        i, j = leaf_vid(a + (b - a) * t0), leaf_vid(a + (b - a) * t1)
                        if i != j: segments.append((i, j, 'leaf'))
                for e in edge_count:
                    if e in leaf_split: continue
                    i, j = vid(e[0]), vid(e[1])
                    segments.append((i, j, 'leaf'))
                # centreline samples (free points); tram centrelines inside the asphalt too
                for rect, r in tram_rects:
                    a, b = np.array(to_node(r['a'])), np.array(to_node(r['b']))
                    n = max(1, math.ceil(math.hypot(*(b - a)) * step_m / spacing))
                    for k in range(n + 1):
                        q = a + (b - a) * k / n
                        if in_union(q[None])[0]: vid(q)
                for r in segs:
                    a, b = np.array(to_node(r['a'])), np.array(to_node(r['b']))
                    L = math.hypot(*(b - a)) * step_m
                    n = max(1, math.ceil(L / spacing)) if centreline else 1
                    for k in range(n + 1): vid(a + (b - a) * k / n)
                # Step 5.1: terrain detail points (free vertices at their native height), from the previous pass.
                detail_v = {}
                for dgx, dgz, dh in detail:
                    v = vid(np.array([dgx, dgz]))
                    if v >= n_nodes and v not in locked: detail_v[v] = dh
                # One kind per edge; an asphalt edge stays asphalt where a ghost outline coincides with it.
                rank = {'road': 0, 'leaf': 1, 'ghost': 2}
                dedup = {}
                for i, j, k in segments:
                    e = (min(i, j), max(i, j))
                    if e not in dedup or rank[k] < rank[dedup[e]]: dedup[e] = k
                segments = list(dedup.items())
                segments = [(i, j, k) for (i, j), k in segments]

                def split_at_vertices(segments):
                    """A vertex on a constraint's interior splits it there (midpoint splits would never reach it)."""
                    X = np.array(pts); tree = cKDTree(X); out = {}
                    for i, j, k in segments:
                        if i == j: continue
                        a, b = X[i], X[j]; d = b - a; L = math.hypot(*d)
                        cand = tree.query_ball_point((a + b) / 2, L / 2 + tol)
                        on = []
                        for v in cand:
                            if v in (i, j): continue
                            t = ((X[v] - a) @ d) / (L * L)
                            if 1e-9 < t < 1 - 1e-9 and abs((X[v, 0] - a[0]) * d[1] - (X[v, 1] - a[1]) * d[0]) / L < tol:
                                # Leaf edges must stay straight (shared with the neighbour leaf): a nearby free point moves
                                # onto a leaf edge and stays there; road outlines just bend through nearby points.
                                # Step 5.1: a locked network node within SNAP of a leaf edge moves onto it too (< 1 cm; its
                                # height is assigned from data afterwards), unless it already sits on another leaf edge.
                                if k == 'leaf' and v >= n_nodes and v not in on_edge:
                                    pts[v] = tuple(a + d * t); locked.add(v); on_edge.add(v)
                                on.append((t, v))
                        chain = [i] + [v for _, v in sorted(on)] + [j]
                        for p, q in zip(chain, chain[1:]):
                            if p != q: out[(min(p, q), max(p, q))] = k
                    return [(i, j, k) for (i, j), k in out.items()]
                segments = split_at_vertices(segments)
                segments0, n_pts0 = list(segments), len(pts)      # the graph before any Steiner point (CDT below)
                # ---- conforming Delaunay ----
                for it in range(60):
                    X = np.array(pts)
                    tri = Delaunay(X)
                    edges = set()
                    for s in tri.simplices:
                        for u, v in ((s[0], s[1]), (s[1], s[2]), (s[2], s[0])): edges.add((min(u, v), max(u, v)))
                    missing = [(i, j, k) for i, j, k in segments if (min(i, j), max(i, j)) not in edges]
                    if verbose: print(f'  {name} pass {it + 1}: {len(pts)} points, {len(missing)} constraints missing', flush=True)
                    if not missing: break
                    # Step 5.1: a constraint shorter than 1 mm joins two vertices that are one point for every purpose
                    # (e.g. a ghost outline ending 36 µm from a leaf-edge split point); it is dropped, and the per-leaf
                    # area check below still guarantees exact tiling.
                    short = {(min(s_[0], s_[1]), max(s_[0], s_[1])) for s_ in missing if math.dist(X[s_[0]], X[s_[1]]) * step_m < 1e-3}
                    if short:
                        segments = [c for c in segments if (min(c[0], c[1]), max(c[0], c[1])) not in short]
                        missing = [c for c in missing if (min(c[0], c[1]), max(c[0], c[1])) not in short]
                        if not missing: break
                    # A ghost outline that cannot be recovered (collinear with and overlapping another constraint, so
                    # midpoint splits make no progress) is dropped: ghosts only keep the RTIN under non-member roads.
                    if it >= 20 and any(k == 'ghost' for _, _, k in missing):
                        gone = {(min(i, j), max(i, j)) for i, j, k in missing if k == 'ghost'}
                        segments = [c for c in segments if (min(c[0], c[1]), max(c[0], c[1])) not in gone]
                        missing = [c for c in missing if c[2] != 'ghost']
                        if not missing: break
                    keep = [(i, j, k) for i, j, k in segments if (min(i, j), max(i, j)) in edges]
                    for i, j, k in missing:
                        m = leaf_vid((X[i] + X[j]) / 2) if k == 'leaf' else vid((X[i] + X[j]) / 2)
                        keep += [(i, m, k), (m, j, k)]
                    segments = split_at_vertices(keep)
                else:
                    raise RuntimeError(f'{name}: constraints not recovered after 60 passes ({len(missing)} missing)')
                X = np.array(pts)
                # ---- triangles per leaf ----
                def assign(tri, verbose=verbose):
                    cent = X[tri.simplices].mean(1)
                    by_leaf = defaultdict(list)
                    for s, c in zip(tri.simplices, cent):
                        t = mesh.leaf(c[0], c[1]); k = leaf_key(t, mesh.layout.columns)
                        if k in patched_set: by_leaf[k].append(s)
                    leaf_area = {leaf_key(t, mesh.layout.columns): abs((t[2] - t[0]) * (t[5] - t[1]) - (t[3] - t[1]) * (t[4] - t[0])) / 2 for t in patched}
                    bad = 0
                    for k, ss in by_leaf.items():
                        area = sum(abs((X[s[1], 0] - X[s[0], 0]) * (X[s[2], 1] - X[s[0], 1]) - (X[s[1], 1] - X[s[0], 1]) * (X[s[2], 0] - X[s[0], 0])) / 2 for s in ss)
                        if abs(area - leaf_area[k]) > 1e-6 * max(1, leaf_area[k]):
                            bad += 1
                            if verbose:
                                print("    leaf", k, "area", leaf_area[k], "tiled", area, "triangles", len(ss))
                                t = next(t for t in patched if leaf_key(t, mesh.layout.columns) == k)
                                corners = np.array([[t[0], t[1]], [t[2], t[3]], [t[4], t[5]]], float)
                                for s in ss:
                                    for v in s:
                                        # signed distance outside the leaf (positive = outside)
                                        out = max(-((corners[(e + 1) % 3, 0] - corners[e, 0]) * (X[v, 1] - corners[e, 1]) - (corners[(e + 1) % 3, 1] - corners[e, 1]) * (X[v, 0] - corners[e, 0])) * (1 if (corners[1, 0] - corners[0, 0]) * (corners[2, 1] - corners[0, 1]) - (corners[1, 1] - corners[0, 1]) * (corners[2, 0] - corners[0, 0]) > 0 else -1) / math.hypot(*(corners[(e + 1) % 3] - corners[e])) for e in range(3))
                                        if out > 1e-7: print('      vertex outside leaf', v, v < n_nodes, v in locked, round(out * step_m, 4), 'm', node_to_sw(*X[v]))
                    return by_leaf, bad
                # Step 5.1 optimisation: the conforming triangulation recovered the constraints by inserting Steiner
                # points (37 % of the vertices). Each one lies on the constraint it split; it is removed again and its
                # star re-triangulated on both sides of the restored constraint (cdt.remove_steiner). Kept only when
                # every leaf is still tiled exactly; otherwise the conforming triangulation is used.
                triangulation, steiner_removed = 'conforming', 0
                if USE_CDT:
                    # Track beds keep their Steiner points: they carry measured bed heights (Pendeln, E 567 972: 1.71 ->
                    # 2.01 % without them).
                    keep = {v for v in range(n_pts0, len(X)) if any(piece_seg[k_] is not None and piece_seg[k_]['kind'] == 'rail'
                                                                     and inside_convex(pieces[k_], X[v][None], -1e-6)[0]
                                                                     for k_ in pgrid.get((int(X[v][0] // CELL), int(X[v][1] // CELL)), ()))}
                    res = cdt.remove_steiner(X, tri.simplices, segments, n_pts0, keep, min_width=STEINER_MIN_WIDTH / step_m)
                    if res is not None and res[2]:
                        tri_c = cdt.Triangulation(X, res[0])
                        by_leaf_c, bad_c = assign(tri_c, verbose=False)
                        # watertight: no vertex inside another triangle's edge (a T-junction would open a crack)
                        bad_c += cdt.t_junctions(X, [s_ for ss in by_leaf_c.values() for s_ in ss])
                        if not bad_c and len(by_leaf_c) == len(patched_set):
                            tri, triangulation, steiner_removed, segments = tri_c, 'reduced', res[2], res[1]
                        elif verbose: print(f'  {name}: Steiner removal does not tile ({bad_c} leaves); conforming kept', flush=True)
                by_leaf, bad = assign(tri)
                if bad or len(by_leaf) != len(patched_set):
                    raise RuntimeError(f'{name}: {bad} leaves not tiled exactly, {len(patched_set) - len(by_leaf)} empty')
                used = sorted({int(v) for ss in by_leaf.values() for s in ss for v in s})
                # ---- heights ----
                on_road = in_union(X, -1e-6)              # on or inside the outline
                # A vertex the outline passes through is asphalt even when snapping left it a few mm outside.
                for i, j, k in segments:
                    if k == 'road': on_road[i] = on_road[j] = True
                # Leaf corners only (the first n_nodes points): a split point can have integer coordinates too.
                node_pt = np.arange(len(X)) < n_nodes
                h = np.full(len(X), np.nan)
                # terrain: RTIN node heights; leaf-edge points linear on their edge
                for i in range(len(X)):
                    if node_pt[i] and not on_road[i]:
                        h[i] = mesh.hn[int(round(X[i, 1])), int(round(X[i, 0]))]
                for i, j, k in segments:
                    pass
                # points on leaf edges (outside asphalt): interpolate along the edge between its nodes
                for e in edge_count:
                    a, b = np.array(e[0], float), np.array(e[1], float); d = b - a; L2 = d @ d
                    ha, hb = mesh.hn[e[0][1], e[0][0]], mesh.hn[e[1][1], e[1][0]]
                    sel = np.flatnonzero(~on_road & np.isnan(h))
                    if not len(sel): break
                    q = X[sel]; t = ((q - a) @ d) / L2
                    off = np.abs((q[:, 0] - a[0]) * d[1] - (q[:, 1] - a[1]) * d[0]) / math.sqrt(L2)
                    on = (t >= -1e-9) & (t <= 1 + 1e-9) & (off < 1e-6)
                    h[sel[on]] = ha + (hb - ha) * t[on]
                # boundary edges must never carry asphalt points (conformity with untouched leaves)
                boundary_nodes = {p for e, c in edge_count.items() if c == 1 for p in e}
                assert not any(on_road[index[(float(p[0]), float(p[1]))]] for p in boundary_nodes if (float(p[0]), float(p[1])) in index), name
                # road surface: robust local plane of native pixels inside the asphalt
                road = np.flatnonzero(on_road)
                E, N = node_to_sw(X[road, 0], X[road, 1])
                r0 = int(info['top'] - N.max() - FIT_RADIUS_WIDE - 2); r1 = int(info['top'] - N.min() + FIT_RADIUS_WIDE + 2)
                c0 = int(E.min() - info['left'] - FIT_RADIUS_WIDE - 2); c1 = int(E.max() - info['left'] + FIT_RADIUS_WIDE + 2)
                blk = dtm_corrections.apply_to_block(native[r0:r1, c0:c1], r0, c0, corrections)
                rr, cc = np.mgrid[r0:r1, c0:c1]
                pe = info['left'] + cc.ravel() + .5; pn = info['top'] - rr.ravel() - .5; ph = blk.ravel()
                pgx, pgz = sw_to_node(pe, pn)
                asph = in_union(np.c_[pgx, pgz], measured_only=True) & np.isfinite(ph)
                tree = cKDTree(np.c_[pe[asph], pn[asph]]); PE, PN, PH = pe[asph], pn[asph], ph[asph]
                steep = 0; sparse = 0

                def fit(e, n):
                    """Measured road surface at SWEREF (e, n): robust local plane of asphalt pixels (None if too few)."""
                    for radius in (FIT_RADIUS, FIT_RADIUS_WIDE):
                        near = tree.query_ball_point((e, n), radius)
                        if len(near) < FIT_MIN: continue
                        A = np.c_[np.ones(len(near)), PE[near] - e, PN[near] - n]; z = PH[near]
                        keep = np.ones(len(near), bool)
                        for _ in range(3):
                            coef = np.linalg.lstsq(A[keep], z[keep], rcond=None)[0]
                            res = np.abs(A @ coef - z)
                            nk = res <= max(FIT_TRIM, np.median(res[keep]) * 2.5)
                            if nk.sum() < FIT_MIN or (nk == keep).all(): break
                            keep = nk
                        if math.hypot(coef[1], coef[2]) > STEEP_FIT and radius == FIT_RADIUS: continue
                        return float(coef[0])
                    return float(blk[int(info['top'] - n) - r0, int(e - info['left']) - c0])
                field_at = lambda q: fit(*node_to_sw(q[0], q[1]))
                for idx, e, n in zip(road, E, N):
                    for radius in (FIT_RADIUS, FIT_RADIUS_WIDE):
                        near = tree.query_ball_point((e, n), radius)
                        if len(near) < FIT_MIN: continue
                        A = np.c_[np.ones(len(near)), PE[near] - e, PN[near] - n]; z = PH[near]
                        keep = np.ones(len(near), bool)
                        for _ in range(3):
                            coef = np.linalg.lstsq(A[keep], z[keep], rcond=None)[0]
                            res = np.abs(A @ coef - z)
                            nk = res <= max(FIT_TRIM, np.median(res[keep]) * 2.5)
                            if nk.sum() < FIT_MIN or (nk == keep).all(): break
                            keep = nk
                        if math.hypot(coef[1], coef[2]) > STEEP_FIT and radius == FIT_RADIUS: steep += 1; continue
                        h[idx] = coef[0]; break
                    if np.isnan(h[idx]):
                        sparse += 1
                        h[idx] = float(blk[int(info['top'] - n) - r0, int(e - info['left']) - c0])
                # ---- pins: span/approach/join pieces ending at an ordinary road's node ----
                pins = []
                for r in segs:
                    for end, p in (('a', r['a']), ('b', r['b'])):
                        for o in at_node[(p[0], p[1])]:
                            if o is r: continue
                            if id(o) in fixed_fn:
                                oend = 0.0 if (o['a'][0], o['a'][1]) == (p[0], p[1]) else 1.0
                                pins.append((to_node(p), fixed_fn[id(o)](oend))); continue
                            pc = spans.get(skey(o))
                            if not pc or id(r) in fixed_fn: continue
                            oend = 'a' if (o['a'][0], o['a'][1]) == (p[0], p[1]) else 'b'
                            hit = [q for q in pc if (q[0] <= 1e-9 if oend == 'a' else q[1] >= 1 - 1e-9)]
                            if hit:
                                y = hit[0][2] if oend == 'a' else hit[0][3]
                                pins.append((to_node(p), (y + .006) * U + VO))
                # Step 5.1: ends of draped sub-segments (beside a span, or a tapered approach's deck end) are pinned with
                # a level cross-section: the whole width shifts to the span level, tapering only along the road over
                # PIN_RADIUS (a radial blend moved the centre 5x more than the edges: a 0.75 m twist on
                # Linköpingsvägen, E 566 430 N 6 494 192).
                if any(r.get('_pins') for r in segs):
                    kd_road = cKDTree(X[road])
                for r in segs:
                    for P, lv in r.get('_pins', []):
                        c = np.array(to_node(P)); other = np.array(to_node(r['b'] if (P[0], P[1]) == (r['a'][0], r['a'][1]) else r['a']))
                        u = other - c; Lu = math.hypot(*u)
                        if Lu < 1e-9: continue
                        u /= Lu; half = (width_of(r) + pad / U) / mesh.step / 2
                        base = h[road[kd_road.query(c)[1]]]
                        rel = X[road] - c
                        along = rel @ u; across = np.abs(rel[:, 0] * u[1] - rel[:, 1] * u[0])
                        sel = (across <= half + 0.5 / step_m) & (along >= -half) & (along <= PIN_RADIUS / step_m)
                        h[road[sel]] += (lv - base) * (1 - np.clip(along[sel] * step_m / PIN_RADIUS, 0, 1))
                pinned = 0
                if pins:
                    kd = cKDTree(X[road])
                    for (gx, gz), target in pins:
                        k = index.get((round(gx, 7), round(gz, 7)))
                        base = h[k] if k is not None else None
                        if base is None:
                            d, j = kd.query((gx, gz)); base = h[road[j]]
                        for j in kd.query_ball_point((gx, gz), PIN_RADIUS / step_m):
                            w = 1 - math.hypot(*(X[road[j]] - (gx, gz))) * step_m / PIN_RADIUS
                            h[road[j]] += (target - base) * max(0.0, w)
                        pinned += 1
                # Step 5.1: deck ends. An ordinary road leaving a bridge deck meets the abutment level across: its
                # measured surface near the deck end includes the DTM's removed-bridge gap (Brännerigatan,
                # E 569 776 N 6 495 652: edges in the stream gap, a 1.1 m twist). Within DECK_END_REACH along
                # the road, asphalt vertices take at least the line from the deck level (at the deck-end cross-
                # section) to their measured height; the street is never lowered.
                deck_ends = 0
                for r in segs:
                    if id(r) in fixed_fn: continue
                    for end in ('a', 'b'):
                        p = r[end]
                        lv = [(points[pkey(o[e], o['y' + e.upper()])] - .097 + .006) * U + VO for o in at_node[(p[0], p[1])]
                              if o.get('bridge') and o['kind'] == 'road' for e in ('a', 'b')
                              if (o[e][0], o[e][1]) == (p[0], p[1]) and pkey(o[e], o['y' + e.upper()]) in points]
                        if not lv: continue
                        level = max(lv)
                        c = np.array(to_node(p)); far = np.array(to_node(r['b' if end == 'a' else 'a']))
                        u = far - c; Lu = math.hypot(*u)
                        if Lu < 1e-9: continue
                        u /= Lu; half = (width_of(r) + pad / U) / mesh.step / 2
                        rel = X[road] - c
                        along = rel @ u; across = np.abs(rel[:, 0] * u[1] - rel[:, 1] * u[0])
                        sel = (across <= half + 0.5 / step_m) & (along <= DECK_END_REACH / step_m) & (along >= -half)
                        w = np.clip(along[sel] * step_m / DECK_END_REACH, 0, 1)
                        idx = road[sel]
                        h[idx] = np.maximum(h[idx], level * (1 - w) + h[idx] * w)
                        deck_ends += 1
                # Step 5.1 optimisation: group-boundary feathering. Where a member road ends at a node shared with a
                # draped road that is not part of the group (a ghost kept on the RTIN), the measured asphalt meets the
                # RTIN surface there: within FEATHER along the member's axis it is blended into the RTIN heights
                # (weight 1 at the node's cross-section, 0 at FEATHER), so both meet on one cross-section and no twist
                # is introduced across the road (Gamla Övägen -0.35 m, Eksundsvägen -0.36 m, Step 5.1).
                member_ids = {id(r) for r in segs}
                feathered = 0
                rtin_road = None
                for r in segs:
                    if r['kind'] != 'road' or id(r) in fixed_fn or r.get('_key'): continue
                    for end in ('a', 'b'):
                        p_ = (r[end][0], r[end][1])
                        others = [o for o in at_node.get(p_, []) if o is not r and o['kind'] == 'road']
                        ghost_here = [o for o in others if skey(o) not in member_keys and not o.get('bridge') and not o.get('tunnel')
                                      and draped_parts(o)]
                        if not ghost_here: continue
                        if any(end_level(o, p_) is not None for o in at_node.get(p_, [])): continue   # a profiled node level
                        if rtin_road is None: rtin_road = rtin.leaf_heights(mesh.layout, mesh.active, X[road, 0], X[road, 1], mesh.hn)[0]
                        c = np.array(to_node(p_)); far = np.array(to_node(r['b' if end == 'a' else 'a']))
                        u = far - c; Lu = math.hypot(*u)
                        if Lu < 1e-9: continue
                        u /= Lu; half = (width_of(r) + pad / U) / mesh.step / 2
                        rel = X[road] - c
                        along = rel @ u; across = np.abs(rel[:, 0] * u[1] - rel[:, 1] * u[0])
                        sel = (across <= half + 0.5 / step_m) & (along >= -half) & (along <= FEATHER / step_m)
                        w = 1 - np.clip(along[sel] * step_m / FEATHER, 0, 1)
                        h[road[sel]] = h[road[sel]] * (1 - w) + rtin_road[sel] * w
                        # The junction fan between the strips (asphalt outside every member strip near the node) joins the
                        # non-member roads too: it takes the RTIN (Ekhöjdsgatan, E 567 535 N 6 496 850: a 4.5 m
                        # non-member piece started against a measured fan).
                        fan_r = max([half] + [(o['width'] + pad / U) / mesh.step / 2 for o in others]) + 0.5 / step_m
                        near = np.hypot(*rel.T) <= fan_r
                        inside_member = np.zeros(len(road), bool)
                        for m_ in segs:
                            if m_['kind'] != 'road' or (m_['a'][0], m_['a'][1]) != p_ and (m_['b'][0], m_['b'][1]) != p_: continue
                            mc = np.array(to_node(p_)); mf = np.array(to_node(m_['b'] if (m_['a'][0], m_['a'][1]) == p_ else m_['a']))
                            mu = mf - mc; ml = math.hypot(*mu)
                            if ml < 1e-9: continue
                            mu /= ml; mh = (width_of(m_) + pad / U) / mesh.step / 2; mr = X[road] - mc
                            inside_member |= (np.abs(mr[:, 0] * mu[1] - mr[:, 1] * mu[0]) <= mh) & ((mr @ mu) >= 0)
                        fan = near & ~inside_member
                        h[road[fan]] = rtin_road[fan]
                        feathered += 1
                # Grounded linear pieces carry their own drawn heights (after the pins, which blend the measured road
                # surface towards them).
                n_fixed = 0
                for idx in road:
                    v = fixed_height(X[idx])
                    if v is not None: h[idx] = v; n_fixed += 1
                # Tram corridors last: level across the gauge, at the tram's own height (rails flush, vehicle contract).
                n_tram = 0
                for idx in road:
                    v = tram_height(X[idx], field_at)
                    if v is not None: h[idx] = v; n_tram += 1
                # A node shared with a profiled piece (deck end, notch, approach) carries that piece's exact level.
                exact = 0
                for (nx_, nz_), v in node_vertex.items():
                    if v not in set(road): continue
                    levels = []
                    for o in at_node.get((nx_, nz_), []):
                        for end, y in (('a', o['yA']), ('b', o['yB'])):
                            if (o[end][0], o[end][1]) != (nx_, nz_): continue
                            k = pkey(o[end], y)
                            if k in points: levels.append((points[k] - .097 + .006) * U + VO)
                    if levels: h[v] = max(levels); exact += 1
                for v, lv in node_level.items():
                    h[v] = lv; exact += 1
                # Other off-asphalt vertices inside a leaf (network nodes beside the street): the RTIN plane there,
                # so the terrain stays exactly what it was.
                for v, dh in detail_v.items():
                    if not on_road[v]: h[v] = dh
                rest = np.flatnonzero(np.isnan(h) & ~on_road)
                if len(rest): h[rest] = rtin.leaf_heights(mesh.layout, mesh.active, X[rest, 0], X[rest, 1], mesh.hn)[0]
                missing_h = np.flatnonzero(np.isnan(h[used]))
                if len(missing_h): raise RuntimeError(f'{name}: {len(missing_h)} vertices without height')
                # ---- Step 5.1: terrain fidelity inside the re-triangulated leaves ----
                # Terrain triangles between the asphalt edge and the leaf corners can depart from the measured
                # ground (a quay or verge next to the road: Saltängsbron's deck-corner facet). Native pixels at
                # least DETAIL_ROAD_CLEAR from the asphalt and DETAIL_CLEAR from leaf edges that are more than
                # DETAIL_TOL off (and DETAIL_WORSE worse than the RTIN was) become vertices at their measured
                # height (greedy, worst first, DETAIL_SPACING apart, at most
                # DETAIL_PER_LEAF per leaf), and the group is triangulated again (DETAIL_PASSES).
                if refined < DETAIL_PASSES:
                    chosen = detail_candidates(mesh, tri, X, h, patched, patched_set, in_union, step_m, node_to_sw, sw_to_node, native, info, corrections, ghosts)
                    if chosen:
                        detail += chosen; refined += 1
                        if verbose: print(f'  {name}: {len(chosen)} terrain detail points, pass {refined}', flush=True)
                        continue
                # Thin triangles: a vertex within THIN of its triangle's opposite edge (a seam where one side was split
                # and the other not) takes the height on that edge, so the near-vertical micro-facet disappears
                # (Ektorpsgatan box, E 568 731 N 6 493 436: 1.5 cm). Only within one surface (all asphalt or all
                # terrain); never vertices on the patch boundary (the RTIN beyond is fixed) or with a data-defined level.
                fixed_v = set(locked) | set(node_level) | {v for v in node_vertex.values()}
                bnd_edges = [(np.array(e[0], float), np.array(e[1], float)) for e, c in edge_count.items() if c == 1]
                def on_boundary(q):
                    for A_, B_ in bnd_edges:
                        d_ = B_ - A_; L2 = float(d_ @ d_); u_ = float((q - A_) @ d_) / L2
                        if -1e-9 <= u_ <= 1 + 1e-9 and abs((q[0] - A_[0]) * d_[1] - (q[1] - A_[1]) * d_[0]) / L2 ** .5 < 1e-6: return True
                    return False
                thin = THIN / step_m
                levelled = 0
                for _ in range(3):
                    moved = 0
                    for ss in by_leaf.values():
                        for t_ in ss:
                            for i_, j_, k_ in ((0, 1, 2), (1, 2, 0), (2, 0, 1)):
                                v = int(t_[k_])
                                if v < n_nodes or v in fixed_v: continue
                                # same surface on both sides of the seam only: a road edge meeting terrain is a real facet
                                if not (on_road[v] == on_road[t_[i_]] == on_road[t_[j_]]): continue
                                A_, B_, V_ = X[t_[i_]], X[t_[j_]], X[v]; d_ = B_ - A_; L2 = float(d_ @ d_)
                                if L2 <= 0: continue
                                u_ = float((V_ - A_) @ d_) / L2
                                if not 0 < u_ < 1 or abs((V_[0] - A_[0]) * d_[1] - (V_[1] - A_[1]) * d_[0]) / L2 ** .5 >= thin: continue
                                target = h[t_[i_]] + (h[t_[j_]] - h[t_[i_]]) * u_
                                if abs(h[v] - target) > 1e-4 and not on_boundary(V_): h[v] = target; moved += 1
                    levelled += moved
                    if not moved: break
                # diagnostics: seam slivers whose middle vertex is off the line a-b in height (a step at the seam)
                seam_list = []
                for ss in by_leaf.values():
                    for t_ in ss:
                        pa, pb, pc = X[t_[0]], X[t_[1]], X[t_[2]]
                        if abs((pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])) > 1e-12: continue
                        for i_, j_, k_ in ((0, 1, 2), (1, 2, 0), (2, 0, 1)):
                            d_ = X[t_[j_]] - X[t_[i_]]; L2 = float(d_ @ d_)
                            if L2 <= 0: continue
                            u_ = float((X[t_[k_]] - X[t_[i_]]) @ d_) / L2
                            if 0 < u_ < 1:
                                step = abs(h[t_[k_]] - (h[t_[i_]] + (h[t_[j_]] - h[t_[i_]]) * u_))
                                if step > 1e-3: seam_list.append((round(step, 4), [round(v, 2) for v in node_to_sw(*X[t_[k_]])], int(t_[k_]) >= n_pts0, triangulation))
                                break
                # ---- stats vs native DTM: re-triangulated leaves, asphalt and terrain pixels ----
                # (computed in node space, triangle by triangle)
                offset = sum(len(v) for v in all_vertices) // 3
                remap = {v: offset + i for i, v in enumerate(used)}
                verts = np.zeros((len(used), 3))
                verts[:, 0] = X[used, 0]; verts[:, 1] = X[used, 1]; verts[:, 2] = h[used]
                all_vertices.append(verts.ravel())
                tri_count = 0
                for k in sorted(by_leaf):
                    ss = by_leaf[k]
                    start = sum(len(t) for t in all_tris) // 3
                    flat = []
                    for s in ss:
                        a, b, c = (remap[int(v)] for v in s)
                        # Step 5.1 optimisation: what the triangle is (0 terrain, 1 road asphalt, 2 track bed): the network
                        # layer draws the asphalt of member roads from these triangles instead of draping strips over them.
                        cen = X[s].mean(0); cls = 0
                        for k_ in pgrid.get((int(cen[0] // CELL), int(cen[1] // CELL)), ()):
                            if inside_convex(pieces[k_], cen[None], 1e-9)[0]:
                                kind_ = piece_seg[k_]['kind'] if piece_seg[k_] is not None else 'road'
                                # a narrowed outline (negative pad) would stop short of the kerb margin: not owned
                                cls = 2 if kind_ == 'rail' else (1 if pad >= 0 else 0)
                                if cls == 1: break
                        all_classes.append(cls)
                        # counter-clockwise in node space (x right, z down -> same handedness as scene x, z)
                        pa, pb, pcn = X[s[0]], X[s[1]], X[s[2]]
                        if (pb[0] - pa[0]) * (pcn[1] - pa[1]) - (pb[1] - pa[1]) * (pcn[0] - pa[0]) < 0: b, c = c, b
                        flat += [a, b, c]
                    all_tris.append(np.array(flat, np.int64)); all_leaves.append((k, start, len(flat) // 3)); tri_count += len(flat) // 3
                # ---- accuracy vs the native DTM (corrected), pixels inside the re-triangulated leaves ----
                bl = np.array([[t[0], t[1]] for t in patched] + [[t[2], t[3]] for t in patched] + [[t[4], t[5]] for t in patched], float)
                e0, n1_ = node_to_sw(bl[:, 0].min(), bl[:, 1].min()); e1, n0_ = node_to_sw(bl[:, 0].max(), bl[:, 1].max())
                q0 = int(info['top'] - n1_); q1 = int(info['top'] - n0_) + 1; k0 = int(e0 - info['left']); k1 = int(e1 - info['left']) + 1
                nb = dtm_corrections.apply_to_block(native[q0:q1, k0:k1], q0, k0, corrections)
                qq, kk = np.mgrid[q0:q1, k0:k1]
                qe = info['left'] + kk.ravel() + .5; qn = info['top'] - qq.ravel() - .5; qh = nb.ravel()
                qx, qz = sw_to_node(qe, qn)
                simplex = tri.find_simplex(np.c_[qx, qz])
                okp = (simplex >= 0) & np.isfinite(qh)
                inleaf = np.zeros(len(qx), bool)
                inleaf[okp] = [leaf_key(mesh.leaf(a, b), mesh.layout.columns) in patched_set for a, b in zip(qx[okp], qz[okp])]
                sel = np.flatnonzero(inleaf)
                T = tri.transform[simplex[sel]]
                bary = np.einsum('ijk,ik->ij', T[:, :2], np.c_[qx[sel], qz[sel]] - T[:, 2])
                w = np.c_[bary, 1 - bary.sum(1)]
                after = (w * h[tri.simplices[simplex[sel]]]).sum(1)
                before, _ = rtin.leaf_heights(mesh.layout, mesh.active, qx[sel], qz[sel], mesh.hn)
                asphalt_px = in_union(np.c_[qx[sel], qz[sel]], measured_only=True)      # measured asphalt only
                grounded_px = in_union(np.c_[qx[sel], qz[sel]]) & ~asphalt_px            # data-defined pieces
                stat = lambda d: {'n': int(len(d)), 'mean': round(float(d.mean()), 3), 'rmse': round(float(np.sqrt((d * d).mean())), 3),
                                  'p95': round(float(np.percentile(np.abs(d), 95)), 3), 'max': round(float(np.abs(d).max()), 3)} if len(d) else {}
                accuracy = {
                    'asphaltBefore': stat(before[asphalt_px] - qh[sel][asphalt_px]), 'asphaltAfter': stat(after[asphalt_px] - qh[sel][asphalt_px]),
                    'terrainBefore': stat(before[~asphalt_px & ~grounded_px] - qh[sel][~asphalt_px & ~grounded_px]),
                    'terrainAfter': stat(after[~asphalt_px & ~grounded_px] - qh[sel][~asphalt_px & ~grounded_px]),
                    'groundedPiecesAboveDtm': stat(after[grounded_px] - qh[sel][grounded_px]),
                    'terrainChange': stat(after[~asphalt_px & ~grounded_px] - before[~asphalt_px & ~grounded_px]),
                }
                report[name] = {'accuracyVsNativeDtm': accuracy, 'box': box, 'roadSegments': len(segs), 'asphaltPieces': P, 'outlineSegments': len(outline),
                                'leaves': len(patched), 'leafTrianglesBefore': len(patched), 'trianglesAfter': tri_count,
                                'vertices': len(used), 'roadVertices': int(on_road[used].sum()), 'steepRefits': steep,
                                'sparseFallbacks': sparse, 'pins': pinned, 'delaunayPasses': it + 1,
                                'groundedLinearSegments': len(fixed_segs), 'groundedVertices': n_fixed,
                                'tramCorridors': len(tram_rects), 'tramVertices': n_tram, 'exactNodes': exact,
                                'outlinePad': pad, 'detailPoints': len(detail_v), 'detailPasses': refined, 'deckEnds': deck_ends,
                                'ghostOutlines': len(ghosts), 'triangulation': triangulation, 'steinerRemoved': steiner_removed,
                                'feathered': feathered,
                                'tJunctions': cdt.t_junctions(X, [s_ for ss in by_leaf.values() for s_ in ss]),
                                'seams': seam_list[:5], 'seamCount': len(seam_list), 'levelled': levelled}
                if verbose: print(name, report[name], f'{time.time() - t_start:.1f} s', flush=True)
                # Road members of a group with a narrowed outline keep their own strips (not owned by the patch).
                members.update(r.get('_key', skey(r)) for r in segs if pad >= 0 or r['kind'] != 'road')
                break
            except (RuntimeError, AssertionError) as err:
                integrated.difference_update(skey(r) for r in fixed_segs)
                attempt += 1
                if attempt < len(attempts):
                    if verbose: print('retry', name, 'outline pad', attempts[attempt][0], 'm, ghosts', attempts[attempt][1], ':', str(err)[:120], flush=True)
                    continue
                # Nothing of a group that cannot be tiled exactly is written; it is reported.
                report[name] = {'failed': str(err)[:300], 'box': box, 'segments': len(keys)}
                if verbose: print('FAILED', name, str(err)[:200], flush=True)
    vertices = np.concatenate(all_vertices) if all_vertices else np.zeros(0)
    tris = np.concatenate(all_tris) if all_tris else np.zeros(0, np.int64)
    leaves = np.array(all_leaves, np.int64).ravel() if all_leaves else np.zeros(0, np.int64)
    patches = {
        'kind': 'road-breaklines-v1',
        'method': __doc__.split('\n\n')[1].strip().replace('\n', ' '),
        'boxes': {k: list(v) for k, v in boxes.items()},
        # Step 5.1: diagnostic-driven patch groups (name -> SWEREF box), from geometry-refinement-targets.json.
        'groups': {g: list(map(float, b)) for g, b in group_boxes.items()},
        'leaves': len(all_leaves), 'triangles': int(len(tris) // 3), 'vertexCount': int(len(vertices) // 3),
        # Grounded linear road segments absorbed into the surface: their data profile shaped it, after which
        # they are draped on it (zero offset) for drawing and vehicles alike (terrain.ts, TerrainService.kt).
        'integrated': sorted(integrated),
        # Step 5.1: ordinary (or partly spanned / approach) road and rail segments ('ax,az|bx,bz') whose draped parts
        # are asphalt or track bed of a patch, i.e. drawn on the measured surface (not ghosts kept on the RTIN).
        'members': sorted(members),
        # Leaf key (int32), first triangle, triangle count; vertices node-space x, z and RH2000 metres
        # (float64); triangles: vertex indices (uint32), counter-clockwise.
        'leavesBase64': base64.b64encode(leaves.astype('<i4').tobytes()).decode('ascii'),
        'verticesBase64': base64.b64encode(vertices.astype('<f8').tobytes()).decode('ascii'),
        'trianglesBase64': base64.b64encode(tris.astype('<u4').tobytes()).decode('ascii'),
        # Step 5.1 optimisation: per triangle 0 terrain, 1 road asphalt (outline union of member strips and fans),
        # 2 track bed (uint8).
        'classesBase64': base64.b64encode(np.array(all_classes, np.uint8).tobytes()).decode('ascii'),
    }
    return dataset, patches, report


def main():
    boxes = BOXES
    for arg in sys.argv[1:]:
        if arg.startswith('--boxes='):
            boxes = {f'box{i}': tuple(map(float, b.split(','))) for i, b in enumerate(arg.split('=', 1)[1].split(';'))}
        if arg == '--none': boxes = {}
    # Step 5.1: diagnostic targets (scripts/geo/refinement_targets.py) unless --no-targets / --none.
    targets = {}
    if TARGETS_FILE.exists() and '--no-targets' not in sys.argv and '--none' not in sys.argv:
        t = read(TARGETS_FILE)
        # Priority A only by default (Step 5.1 budget); --priority=B adds the reported B candidates.
        allowed = {'A', 'B'} if '--priority=B' in sys.argv else {'A'}
        for i, c in enumerate(t['candidates']):
            if c['seeds'] and c.get('priority') in allowed: targets[f"{c['kind']}-{i}"] = {'keys': set(c['seeds']), 'rails': False}
        for i, r in enumerate(t['railStretches']):
            if r['seeds'] and r.get('priority', 'A') in allowed: targets[f'rail-{i}'] = {'keys': set(r['seeds']), 'rails': True}
        for arg in sys.argv:
            if arg.startswith('--limit='): targets = dict(list(targets.items())[:int(arg.split('=')[1])])
    dataset, patches, report = build(boxes, targets=targets)
    if PLAN_ONLY: print(report); return
    out = ROOT / ('work/step51' if targets else 'work/step5')
    out.mkdir(parents=True, exist_ok=True)
    (out / 'road-patches-report.json').write_text(json.dumps(report, indent=1), encoding='utf8')
    print('patch triangles', patches['triangles'], 'leaves', patches['leaves'],
          'bytes', sum(len(patches[k]) for k in ('leavesBase64', 'verticesBase64', 'trianglesBase64')))
    if '--apply' not in sys.argv: return
    if boxes or targets: dataset['mesh']['patches'] = patches
    else: dataset['mesh'].pop('patches', None)
    profiles = (ROOT / 'src/lib/data/bridge-profiles.json').read_text(encoding='utf8')
    dataset['revision'] = rtin.surface_revision(dataset, profiles)
    text = json.dumps(dataset, ensure_ascii=False, separators=(',', ':')) + '\n'
    for t in TARGETS: t.write_text(text, encoding='utf8')
    path = ROOT / 'src/lib/data/buildings-3d.json'
    b = read(path); b['terrainRevision'] = dataset['revision']; path.write_text(json.dumps(b) + '\n', encoding='utf8')
    print('revision', dataset['revision'])


if __name__ == '__main__':
    main()
