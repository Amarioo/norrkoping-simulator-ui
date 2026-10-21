"""Constrained Delaunay triangulation by edge-flip constraint insertion (Sloan 1993), on top of scipy's Delaunay.

Used by road_patches.py (Step 5.1 optimisation): the conforming triangulation recovered constraint edges by inserting
Steiner points (37 % of the patch vertices); a constrained triangulation keeps only the input vertices. No new
dependency: scipy/Qhull gives the initial Delaunay triangulation, constraints are then forced in by flipping the
edges that cross them.

    tris = constrained(X, constraints)   # X: (n, 2) float array, constraints: [(i, j), ...]
    -> (m, 3) int array of counter-clockwise triangles, or None if a constraint cannot be inserted (the caller
       falls back to its conforming triangulation)

Constraints must form a planar straight-line graph: no two cross except at shared vertices, and no vertex lies in a
constraint's interior (road_patches.py splits them so).
"""
import sys
from collections import deque
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "work/geodata/python"))
import numpy as np
from scipy.spatial import Delaunay


def _orient(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _cross(p, q, a, b, eps):
    """Segments pq and ab cross at interior points of both (shared endpoints do not count)."""
    o1, o2 = _orient(p, q, a), _orient(p, q, b)
    o3, o4 = _orient(a, b, p), _orient(a, b, q)
    return ((o1 > eps and o2 < -eps) or (o1 < -eps and o2 > eps)) and ((o3 > eps and o4 < -eps) or (o3 < -eps and o4 > eps))


last_failure = ''


def _fail(why):
    global last_failure
    last_failure = why
    return None


def constrained(X, constraints, max_flips=200000):
    X = np.asarray(X, float)
    if len(X) < 3: return _fail('too few points')
    try:
        dt = Delaunay(X)
    except Exception as e:
        return _fail(f'qhull: {e}')
    # every input point must be a vertex (Qhull may drop exact duplicates or coplanar points)
    if len(np.unique(dt.simplices)) != len(X): return _fail(f'{len(X) - len(np.unique(dt.simplices))} points not in the triangulation')
    tris = []
    for s in dt.simplices:
        a, b, c = (int(v) for v in s)
        o = _orient(X[a], X[b], X[c])
        if abs(o) < 1e-18: continue
        tris.append([a, b, c] if o > 0 else [a, c, b])
    scale = float(np.ptp(X, 0).max()) or 1.0
    eps = 1e-12 * scale * scale
    edge_tris = {}            # directed edge (u, v) -> triangle index whose CCW boundary contains u->v
    vert_tris = [set() for _ in range(len(X))]

    def add(t):
        a, b, c = tris[t]
        for u, v in ((a, b), (b, c), (c, a)): edge_tris[(u, v)] = t
        for v in (a, b, c): vert_tris[v].add(t)

    def remove(t):
        a, b, c = tris[t]
        for u, v in ((a, b), (b, c), (c, a)):
            if edge_tris.get((u, v)) == t: del edge_tris[(u, v)]
        for v in (a, b, c): vert_tris[v].discard(t)
    for t in range(len(tris)): add(t)

    def has_edge(i, j): return (i, j) in edge_tris or (j, i) in edge_tris

    def on_segment(i, j, w):
        """w lies on the open segment ij (within 1e-6 of the coordinate scale)."""
        P, Q, W = X[i], X[j], X[w]; d = Q - P; L2 = float(d @ d)
        if L2 <= 0: return False
        t = float((W - P) @ d) / L2
        return 0 < t < 1 and abs(_orient(P, Q, W)) / L2 ** 0.5 <= 1e-6 * scale

    flips = 0
    stack = [(int(i), int(j)) for i, j in reversed(list(constraints))]
    while stack:
        i, j = stack.pop()
        if i == j or has_edge(i, j): continue
        # A vertex on the constraint splits it there (Sloan: collinear vertices).
        w = next((w for t in vert_tris[i] for w in tris[t] if w != i and w != j and on_segment(i, j, w)), None)
        if w is not None:
            stack.append((w, j)); stack.append((i, w)); continue
        P, Q = X[i], X[j]
        # crossing edges: walk from i towards j
        start = None
        for t in vert_tris[i]:
            a, b, c = tris[t]
            k = (a, b, c).index(i)
            u, v = tris[t][(k + 1) % 3], tris[t][(k + 2) % 3]
            if _cross(P, Q, X[u], X[v], eps): start = (u, v); break
        if start is None:
            nb = sorted({w for t in vert_tris[i] for w in tris[t] if w != i})
            d = Q - P; L = float(d @ d) ** 0.5
            info = [(w, round(abs(_orient(P, Q, X[w])) / L, 9), round(float((X[w] - P) @ d) / L / L, 6)) for w in nb]
            return _fail(f'no crossing edge from {i} to {j}: P {P.tolist()} Q {Q.tolist()} |PQ| {L:.3e} neighbours (w, dist, t) {info}')
        crossing = [start]
        u, v = start
        guard = 0
        split = None
        while True:
            guard += 1
            if guard > 100000: return _fail('walk guard')
            t = edge_tris.get((v, u))
            if t is None: return _fail('walk left the triangulation')
            w = [x for x in tris[t] if x != u and x != v][0]
            if w == j: break
            if _cross(P, Q, X[u], X[w], eps): u, v = u, w
            elif _cross(P, Q, X[w], X[v], eps): u, v = w, v
            elif on_segment(i, j, w): split = w; break
            else:
                d = Q - P; L = float(d @ d) ** 0.5
                return _fail(f'constraint {i}-{j} passes through vertex {w}: P {P.tolist()} Q {Q.tolist()} W {X[w].tolist()} '
                             f'dist {abs(_orient(P, Q, X[w])) / L:.3e} t {float((X[w] - P) @ d) / L / L:.6f} eps {eps:.3e}')
            crossing.append((u, v))
        if split is not None:
            stack.append((split, j)); stack.append((i, split)); continue
        queue = deque(crossing)
        stall = 0
        while queue:
            flips += 1
            if flips > max_flips or stall > 4 * len(queue) + 50: return _fail('flip stall')
            u, v = queue.popleft()
            t1, t2 = edge_tris.get((u, v)), edge_tris.get((v, u))
            if t1 is None or t2 is None: return _fail('flip edge without two triangles')
            c = [x for x in tris[t1] if x != u and x != v][0]
            d = [x for x in tris[t2] if x != u and x != v][0]
            # quad u, d, v, c (CCW): convex if c and d lie on opposite sides of uv and u, v on opposite sides of cd
            if not (_orient(X[c], X[d], X[u]) * _orient(X[c], X[d], X[v]) < -eps * eps and _orient(X[c], X[d], X[u]) != 0):
                queue.append((u, v)); stall += 1; continue
            stall = 0
            remove(t1); remove(t2)
            # t1 had u->v (so c is left of u->v), t2 had v->u. New triangles c, d share edge c-d.
            tris[t1] = [c, u, d] if _orient(X[c], X[u], X[d]) > 0 else [c, d, u]
            tris[t2] = [d, v, c] if _orient(X[d], X[v], X[c]) > 0 else [d, c, v]
            add(t1); add(t2)
            if c != i and c != j and d != i and d != j and _cross(P, Q, X[c], X[d], eps): queue.append((c, d))
        if not has_edge(i, j): return _fail(f'constraint {i}-{j} not recovered')
    out = np.array(tris, np.int64)
    # sanity: positive areas
    a, b, c = X[out[:, 0]], X[out[:, 1]], X[out[:, 2]]
    if np.any((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0]) <= 0): return _fail('degenerate triangle')
    return out


def _ear_clip(X, poly):
    """Triangles (CCW) of a simple polygon given as vertex indices in CCW order (collinear runs allowed)."""
    pts = list(poly)
    out = []
    guard = 0
    while len(pts) > 3:
        guard += 1
        if guard > 10 * len(poly) ** 2 + 100: return None
        n = len(pts); found = False
        for k in range(n):
            a, b, c = pts[k - 1], pts[k], pts[(k + 1) % n]
            # reflex, collinear or a sliver of negligible area relative to its edges
            if _orient(X[a], X[b], X[c]) <= 1e-9 * max(float(np.sum((X[a] - X[b]) ** 2)), float(np.sum((X[c] - X[b]) ** 2))): continue
            if any(_orient(X[a], X[b], X[p]) >= 0 and _orient(X[b], X[c], X[p]) >= 0 and _orient(X[c], X[a], X[p]) >= 0
                   for p in pts if p not in (a, b, c)): continue
            out.append((a, b, c)); del pts[k]; found = True; break
        if not found: return None
    a, b, c = pts
    if _orient(X[a], X[b], X[c]) <= 1e-9 * max(float(np.sum((X[a] - X[b]) ** 2)), float(np.sum((X[c] - X[b]) ** 2))): return None
    out.append(tuple(pts))
    return out


def remove_steiner(X, simplices, segments, n_keep, keep=(), min_width=0.0):
    """Removes the vertices >= n_keep that split a constraint (a conforming triangulation's Steiner points): each
    one's star is re-triangulated on both sides of the restored constraint by ear clipping.
    simplices: (m, 3); segments: [(i, j, kind)]. Returns (triangles (k, 3) CCW, segments) or None."""
    X = np.asarray(X, float)
    tris = {}
    vert_tris = {}
    nid = 0

    def add(t):
        nonlocal nid
        a, b, c = t
        if _orient(X[a], X[b], X[c]) < 0: t = (a, c, b)
        tris[nid] = t
        for v in t: vert_tris.setdefault(v, set()).add(nid)
        nid += 1

    for s in simplices: add(tuple(int(v) for v in s))
    seg_at = {}
    for i, j, k in segments:
        seg_at.setdefault(i, []).append((j, k)); seg_at.setdefault(j, []).append((i, k))
    removed = 0
    for v in sorted({v for v in vert_tris if v >= n_keep and v not in keep}):
        inc = seg_at.get(v, [])
        if len(inc) != 2 or inc[0][1] != inc[1][1]: continue
        (a, kind), (b, _) = inc
        P, Q, V = X[a], X[b], X[v]
        L = float(np.hypot(*(Q - P)))
        if L <= 0 or abs(_orient(P, Q, V)) / L > 1e-6 * L: continue             # not on the chord a-b
        star = list(vert_tris.get(v, ()))
        nxt = {}
        for t in star:
            x, y, z = tris[t]
            k = (x, y, z).index(v)
            u, w = tris[t][(k + 1) % 3], tris[t][(k + 2) % 3]
            nxt[u] = w
        # closed cycle around v
        if len(nxt) != len(star) or a not in nxt or b not in nxt: continue
        cyc = [a]
        while len(cyc) <= len(star):
            cyc.append(nxt[cyc[-1]])
            if cyc[-1] == a: break
        if cyc[-1] != a or len(cyc) != len(star) + 1: continue
        cyc = cyc[:-1]
        # No other star vertex may lie on the restored chord a-b: the edge a-b would pass through it (a T-junction:
        # one side split there, the other not).
        if any(w not in (a, b) and abs(_orient(P, Q, X[w])) / L <= 1e-7 * L and 0 < float((X[w] - P) @ (Q - P)) < L * L for w in cyc):
            continue
        ib = cyc.index(b)
        poly1 = cyc[:ib + 1]             # a ... b (CCW around v), closed by b -> a
        poly2 = cyc[ib:] + [a]           # b ... a, closed by a -> b
        new = []
        ok = True
        for poly in (poly1, poly2):
            if len(poly) < 3: ok = False; break
            t3 = _ear_clip(X, poly)
            if t3 is None: ok = False; break
            new += t3
        if not ok: continue
        # No thin triangle: one narrower than min_width would be a near-vertical micro-wall wherever the heights on
        # its two long sides differ (a 9 mm triangle with 0.22 m across it at Gamla Ovagen).
        if min_width > 0:
            thin = False
            for a_, b_, c_ in new:
                A_, B_, C_ = X[a_], X[b_], X[c_]
                longest = max(float(np.hypot(*(B_ - A_))), float(np.hypot(*(C_ - B_))), float(np.hypot(*(A_ - C_))))
                if longest > 0 and abs(_orient(A_, B_, C_)) / longest < min_width: thin = True; break
            if thin: continue
        for t in star:
            for u in tris[t]: vert_tris[u].discard(t)
            del tris[t]
        for t in new: add(t)
        vert_tris.pop(v, None)
        seg_at[a] = [(j, k) for j, k in seg_at[a] if j != v] + [(b, kind)]
        seg_at[b] = [(j, k) for j, k in seg_at[b] if j != v] + [(a, kind)]
        del seg_at[v]
        removed += 1
    out = np.array(list(tris.values()), np.int64)
    segs = {(min(i, j), max(i, j)): k for i, lst in seg_at.items() for j, k in lst}
    return out, [(i, j, k) for (i, j), k in segs.items()], removed


def t_junctions(X, tris, rel=1e-7):
    """Number of triangle edges with a used vertex strictly inside them (collinear within rel x length)."""
    from scipy.spatial import cKDTree
    X = np.asarray(X, float)
    used = sorted({int(v) for t in tris for v in t})
    if not used: return 0
    tree = cKDTree(X[used])
    edges = {tuple(sorted((int(t[e]), int(t[(e + 1) % 3])))) for t in tris for e in range(3)}
    faces = {frozenset(int(v) for v in t) for t in tris}       # a seam sliver (a, b, w) closes such an edge
    bad = 0
    for a, b in edges:
        P, Q = X[a], X[b]; d = Q - P; L = float(np.hypot(*d))
        if L <= 0: continue
        for k in tree.query_ball_point((P + Q) / 2, L / 2 + 1e-12):
            w = used[k]
            if w in (a, b): continue
            t = float((X[w] - P) @ d) / (L * L)
            if 1e-9 < t < 1 - 1e-9 and abs(_orient(P, Q, X[w])) / L <= rel * L and frozenset((a, b, w)) not in faces: bad += 1; break
    return bad


class Triangulation:
    """The parts of scipy.spatial.Delaunay that road_patches.py uses (simplices, transform, find_simplex)."""

    def __init__(self, X, simplices, cell=2.0):
        self.points = np.asarray(X, float)
        self.simplices = np.asarray(simplices, np.int64)
        P = self.points[self.simplices]
        T = np.zeros((len(P), 3, 2))
        A = np.stack([P[:, 0] - P[:, 2], P[:, 1] - P[:, 2]], axis=2)    # columns: v0 - v2, v1 - v2
        det = A[:, 0, 0] * A[:, 1, 1] - A[:, 0, 1] * A[:, 1, 0]
        ok = np.abs(det) > 1e-300
        T[:, :2] = np.nan                                                 # degenerate simplices are never found
        T[ok, :2] = np.linalg.inv(A[ok])
        T[:, 2] = P[:, 2]
        self.transform = T
        self.cell = cell
        self.grid = {}
        lo, hi = P.min(1), P.max(1)
        for k in range(len(P)):
            for gx in range(int(lo[k, 0] // cell), int(hi[k, 0] // cell) + 1):
                for gz in range(int(lo[k, 1] // cell), int(hi[k, 1] // cell) + 1): self.grid.setdefault((gx, gz), []).append(k)

    def find_simplex(self, pts, tol=1e-9):
        pts = np.atleast_2d(np.asarray(pts, float)); out = np.full(len(pts), -1, np.int64)
        for n, q in enumerate(pts):
            best, bk = -np.inf, -1
            for k in self.grid.get((int(q[0] // self.cell), int(q[1] // self.cell)), ()):
                c = self.transform[k, :2] @ (q - self.transform[k, 2])
                m = min(c[0], c[1], 1 - c[0] - c[1])
                if m > best: best, bk = m, k
            if best >= -tol: out[n] = bk
        return out


if __name__ == '__main__':
    # self-test: random points with a fan of non-crossing constraints through the middle
    rng = np.random.default_rng(1)
    for trial in range(50):
        X = rng.random((300, 2)) * 100
        # constraints: chain along a random polyline of input points sorted by x in a band
        band = np.flatnonzero(np.abs(X[:, 1] - 50) < 3)
        band = band[np.argsort(X[band, 0])]
        cons = list(zip(band[:-1], band[1:]))
        tris = constrained(X, cons)
        assert tris is not None, trial
        es = {tuple(sorted((int(a), int(b)))) for t in tris for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0]))}
        assert all(tuple(sorted(c)) in es for c in cons), trial
        hull = Delaunay(X)
        area = lambda T: np.abs(_orient(X[T[:, 0]].T, X[T[:, 1]].T, X[T[:, 2]].T)).sum() / 2
        assert abs(area(tris) - area(hull.simplices)) < 1e-6, trial
    print('cdt self-test ok')
