"""Network profiles (rules v4, Step 3.5): estimated bridge decks and engineered spans.

Shared by the client (terrain.ts) and the backend (TerrainService.kt) through bridge-profiles.json.

1. Bridge decks (`points`, keyed `x,z,legacy` per segment end; value = drawn surface + 0.091 units, the
   legacy network level that terrain.roadHeight reduces by 0.097). Still ESTIMATED linear decks (LiDAR
   deck reconstruction is Step 4), now on the rendered adaptive mesh instead of the pre-Step-3 10/40 m
   grid, and without the flat-scene layer lift (layer x 0.24 units = 6 m per OSM layer):
   * a deck end sits on the highest rendered ground within 10 m outward along the bridge axis (the
     Lantmäteriet DTM has bridges removed, so the ground at the OSM end node is often already on the
     slope down to the gap). Against LiDAR class 17 deck points of the central tiles this changes the
     generic decks from RMSE 3.18 m (mean +0.66) to 0.61 m (mean -0.30) (scripts/geo/infra-*.test.ts);
   * interior nodes are linear between the ends (detailed bridges: along the detail axis); pedestrian
     bridge networks are solved between their land connections (as before);
   * constraints, enforced by raising the nodes of the offending segment: the deck is never below the
     rendered ground, keeps the minimum clearance over every at-grade road/rail/tram/path it crosses
     (road 4.5 m, rail 5.5 m, tram 5.0 m, path 2.5 m; estimates of normal Swedish clearances, not
     surveyed) and stays 0.5 m above measured water (src/lib/data/water-reaches.json).
   A segment is drawn and driven linearly only when BOTH of its ends carry a point; a segment with one
   point (a bridge approach) follows the terrain with its end offsets tapered along it.

2. Engineered spans (`spans`, keyed `ax,az|bx,bz` by the segment's end nodes; [[t0, t1, y0, y1], ...]
   in the segment's a->b direction, y = network reference height). The DTM removes bridge decks, so an
   at-grade way crossing an underpass (OSM tunnel=yes below it) or a stream in a culvert would be draped
   into the open trench. Around such a crossing the way's surface is replaced by the upper hull of its
   own profile (within 40 m either side) when the hull bridges a dip of at least 0.5 m over at most
   80 m. Roads, rails and tram tracks also get a span over a dip with the DTM signature of a removed
   bridge but no mapped structure ('trench': >= 2 m deep, <= 30 m wide, >= 20 % walls on both sides).
   `spanInfo` documents every span (way, crossed ways, rims, depth).

Run with the geodata Python after prepare-terrain-mesh.py and prepare-water-reaches.*; writes the client
and backend copies and bumps the surface revision.
"""
import base64, json, math, os, sys
from collections import defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
sys.path.insert(0, str(ROOT / 'scripts/geo'))
import numpy as np
from scipy.sparse import lil_matrix
from scipy.sparse.linalg import spsolve
import rtin

read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
terrain = read(ROOT / 'src/lib/data/terrain.json')
REF = terrain['reference']
U = REF['metresPerUnit']; VO = REF['verticalOriginMetres']
LEGACY = .091                        # profile value - drawn surface (scene units)
ROAD_SURFACE = .006                  # drawn surface - network reference
M = 1 / U                            # one metre in scene units
ANCHOR_REACH = 10 * M
CLEARANCE = {'road': 4.5, 'rail': 5.5, 'tram': 5.0, 'path': 2.5}
# Crossing clearance is not applied to the detailed bridges: against LiDAR class 17 it lifted Saltängsbron
# 1.5 m too high (the quay paths drawn beneath its ends pass beside it). DETAIL_CLEARANCE=1 restores it.
DETAIL_CLEARANCE = os.environ.get('DETAIL_CLEARANCE', '0') == '1'
CROSSING_CLEARANCE = os.environ.get('CROSSING_CLEARANCE', '1') == '1'
SERVICE_CLEARANCE = 3.0      # service ways below decks are mostly car-park aisles and yards
TUNNEL_REACH = 15            # m: OSM tunnel/culvert ways often stop short of the ways above them
# A road, rail or tram dip with no mapped structure but the DTM signature of a removed bridge: at least
# 2 m deep, at most 30 m wide, walls of 20 % or more on both sides (no road or track is built like that).
TRENCH_DEPTH, TRENCH_WIDTH, TRENCH_WALL = 2.0, 30, .2
SPAN_WINDOWS = (15, 20, 25, 30, 40)
WATER_CLEARANCE = .5
SPAN_MAX, SPAN_MIN_DEPTH = 80, .5

# ---- rendered surface (the adaptive mesh, as surfaceMesh.ts / TerrainService.kt) ----
mesh = terrain['mesh']
tile, g = rtin.load_grid(terrain)
layout = rtin.Layout(tile, mesh['depth'])
bits = np.frombuffer(base64.b64decode(mesh['activeBase64']), np.uint8)
active = np.unpackbits(bits, bitorder='little')[:layout.columns * layout.rows].astype(bool).reshape(layout.rows, layout.columns)
hn = layout.node_heights(g)


def surface(x, z):
    x = np.asarray(x, float); z = np.asarray(z, float)
    h, _ = rtin.leaf_heights(layout, active, (x - layout.x0) / layout.step, (z - layout.z0) / layout.step, hn)
    return (h - VO) / U


def surface1(x, z):
    return float(surface([x], [z])[0])


def anchor(p, d):
    """Highest rendered ground from p up to 10 m along unit direction d."""
    k = np.linspace(0, ANCHOR_REACH, 11)
    return float(surface(p[0] + d[0] * k, p[1] + d[1] * k).max())


city = read(ROOT / 'src/lib/data/norrkoping-map.json')
roads = city['roads']
details = read(ROOT / 'src/lib/data/city-bridges.json')['bridges']


def inside(point, ring):
    x, z = point; result = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]: result = not result
    return result


# ---- measured water (flat reaches) for deck clearance ----
water = read(ROOT / 'src/lib/data/water-reaches.json')
reach_level = {r['id']: (r['levelMetres'] - VO) / U for r in water['reaches']}
water_polys = []
for s in water['surfaces']:
    rings = [np.asarray(r, float) for r in s['rings']]
    lo = rings[0].min(0); hi = rings[0].max(0)
    water_polys.append((lo, hi, rings, reach_level[s['reach']]))


def water_level(x, z):
    for lo, hi, rings, level in water_polys:
        if x < lo[0] or z < lo[1] or x > hi[0] or z > hi[1]: continue
        inside_ = False
        for r in rings:
            a = r; b = np.roll(r, 1, 0)
            cross = ((a[:, 1] > z) != (b[:, 1] > z)) & (x < (b[:, 0] - a[:, 0]) * (z - a[:, 1]) / np.where(b[:, 1] == a[:, 1], 1, b[:, 1] - a[:, 1]) + a[:, 0])
            inside_ ^= bool(cross.sum() % 2)
        if inside_: return level
    return None


# ---- 1. bridge decks ----
groups = {}; owned = set(); detail_of = {}
for detail in details:
    rs = [r for r in roads if r['kind'] in ('road', 'path', 'tram', 'rail') and inside(((r['a'][0] + r['b'][0]) / 2, (r['a'][1] + r['b'][1]) / 2), detail['ring'])
          and (r['kind'] != 'path' or abs((r['b'][0] - r['a'][0]) * math.cos(detail['rotation']) - (r['b'][1] - r['a'][1]) * math.sin(detail['rotation'])) / max(1e-9, math.dist(r['a'], r['b'])) > .7)]
    if rs:
        groups['detail-' + str(detail['id'])] = (rs, detail)
        owned.update(id(r) for r in rs)
        for r in rs: detail_of[id(r)] = 'detail-' + str(detail['id'])
for r in roads:
    if id(r) not in owned and r.get('bridge') and r['kind'] != 'stream':
        groups.setdefault(str(r['way']), ([], None))[0].append(r)

H = {}                       # node -> drawn deck surface (scene units)
group_of = {}
anchors_used = {}
for way, (rs, detail) in groups.items():
    ends = [tuple(r['a']) for r in rs] + [tuple(r['b']) for r in rs]
    if detail:
        cx, cz = detail['center']; dx = math.cos(detail['rotation']); dz = -math.sin(detail['rotation']); length = detail['length']
        a = (cx - dx * length / 2, cz - dz * length / 2); b = (cx + dx * length / 2, cz + dz * length / 2)
    else:
        a, b = max(((p, q) for p in ends for q in ends), key=lambda pq: math.dist(*pq))
        length = math.dist(a, b)
        if length < 1e-6: continue
        dx = (b[0] - a[0]) / length; dz = (b[1] - a[1]) / length
    ha = anchor(a, (-dx, -dz)); hb = anchor(b, (dx, dz))
    anchors_used[way] = (ha, hb)
    for p in ends:
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length))
        h = ha + (hb - ha) * t
        H[p] = max(H.get(p, -1e9), h)
        group_of[p] = way

# Pedestrian bridge networks: solved between their land connections (shared nodes must agree).
paths = [r for r in roads if r['kind'] == 'path' and r.get('bridge') and id(r) not in owned]
adj = defaultdict(dict)
for r in paths:
    a, b = tuple(r['a']), tuple(r['b']); w = 1 / max(.001, math.dist(a, b))
    adj[a][b] = w; adj[b][a] = w
fixed_all = {}
for r in roads:
    if r['kind'] not in ('path', 'road'): continue
    for p, q in ((tuple(r['a']), tuple(r['b'])), (tuple(r['b']), tuple(r['a']))):
        if p not in adj: continue
        if id(r) in owned:
            if p in H: fixed_all[p] = H[p]
        elif not r.get('bridge'):
            # Land connection: highest ground up to 10 m into the at-grade way.
            L = math.dist(p, q)
            d = ((q[0] - p[0]) / L, (q[1] - p[1]) / L) if L > 1e-9 else (0, 0)
            fixed_all[p] = max(fixed_all.get(p, -1e9), anchor(p, d))
remaining = set(adj)
while remaining:
    todo = [next(iter(remaining))]; component = set()
    while todo:
        p = todo.pop()
        if p in component: continue
        component.add(p); remaining.discard(p); todo.extend(q for q in adj[p] if q not in component)
    fixed = {p: fixed_all[p] for p in component if p in fixed_all}
    if not fixed:
        endpoints = [p for p in component if len(adj[p]) == 1] or [min(component)]
        fixed = {p: surface1(*p) for p in endpoints}
    unknown = [p for p in component if p not in fixed]; indices = {p: i for i, p in enumerate(unknown)}
    A = lil_matrix((len(unknown), len(unknown))); rhs = np.zeros(len(unknown))
    for p, i in indices.items():
        for q, w in adj[p].items():
            A[i, i] += w
            if q in fixed: rhs[i] += w * fixed[q]
            else: A[i, indices[q]] -= w
    heights = dict(fixed)
    if unknown: heights.update(zip(unknown, np.atleast_1d(spsolve(A.tocsr(), rhs))))
    for p, h in heights.items(): H[p] = float(h)

# Constraints on every bridge segment: above ground, clearance over crossed at-grade ways, above water.
bridge_segs = [r for r in roads if r['kind'] in ('road', 'path', 'tram', 'rail') and tuple(r['a']) in H and tuple(r['b']) in H
               and (r.get('bridge') or id(r) in owned)]
bridge_ids = set(id(r) for r in bridge_segs)


def seg_cross(a, b, c, d):
    o = lambda p, q, r: (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    d1, d2, d3, d4 = o(a, b, c), o(a, b, d), o(c, d, a), o(c, d, b)
    if d1 * d2 < 0 and d3 * d4 < 0:
        return d3 / (d3 - d4)  # parameter along a-b
    return None


grid = defaultdict(list)
CELL = .5
for r in roads:
    if r['kind'] not in ('road', 'path', 'tram', 'rail') or id(r) in bridge_ids: continue
    x0, x1 = sorted((r['a'][0], r['b'][0])); z0, z1 = sorted((r['a'][1], r['b'][1]))
    for i in range(math.floor(x0 / CELL), math.floor(x1 / CELL) + 1):
        for j in range(math.floor(z0 / CELL), math.floor(z1 / CELL) + 1):
            grid[(i, j)].append(r)
requirements = {}
for r in bridge_segs:
    a, b = tuple(r['a']), tuple(r['b'])
    L = math.dist(a, b)
    n = max(2, math.ceil(L / M))
    t = np.linspace(0, 1, n + 1)
    xs = a[0] + (b[0] - a[0]) * t; zs = a[1] + (b[1] - a[1]) * t
    need = surface(xs, zs).copy(); why = np.zeros(len(t), int)  # 0 ground
    for k, (x, z) in enumerate(zip(xs, zs)):
        lv = water_level(x, z)
        if lv is not None and lv + WATER_CLEARANCE * M > need[k]:
            need[k] = lv + WATER_CLEARANCE * M; why[k] = 1
    seen = set()
    x0, x1 = sorted((a[0], b[0])); z0, z1 = sorted((a[1], b[1]))
    for i in range(math.floor(x0 / CELL), math.floor(x1 / CELL) + 1):
        for j in range(math.floor(z0 / CELL), math.floor(z1 / CELL) + 1):
            for o in grid.get((i, j), []):
                if id(o) in seen: continue
                seen.add(id(o))
                if {tuple(o['a']), tuple(o['b'])} & {a, b}: continue
                u = seg_cross(a, b, tuple(o['a']), tuple(o['b']))
                if u is None: continue
                # Crossings next to the bridge ends are stairs/ramps meeting the deck, not passages below.
                if min(u, 1 - u) * L < 3 * M: continue
                if (id(r) in detail_of and not DETAIL_CLEARANCE) or not CROSSING_CLEARANCE: continue
                gap = SERVICE_CLEARANCE if o['kind'] == 'road' and o.get('class') == 'service' else CLEARANCE[o['kind']]
                lower = surface1(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u) + gap * M
                k = int(round(u * n))
                if lower > need[k]: need[k] = lower; why[k] = 2
    requirements[id(r)] = (a, b, t, need, why)
raised = defaultdict(float); raise_reason = defaultdict(set)
detail_nodes = defaultdict(set)
for r in bridge_segs:
    if id(r) in detail_of: detail_nodes[detail_of[id(r)]].update((tuple(r['a']), tuple(r['b'])))
for it in range(40):
    worst = 0
    for r in bridge_segs:
        a, b, t, need, why = requirements[id(r)]
        line = H[a] + (H[b] - H[a]) * t
        d = need - line; k = int(np.argmax(d))
        if d[k] > .005 * M:
            # A detailed bridge keeps one profile for all its lanes: it is lifted as a whole.
            group = detail_of.get(id(r))
            nodes = detail_nodes[group] if group else (a, b)
            for p in nodes:
                H[p] += d[k]; raised[p] += d[k]; raise_reason[p].add(('ground', 'water', 'clearance')[why[k]])
            worst = max(worst, d[k])
    if worst == 0: break
print('constraint passes', it + 1, 'raised nodes', len(raised), 'max raise m', round(max(raised.values(), default=0) * U, 2))

points = {}
for r in roads:
    if r['kind'] == 'stream': continue
    for p, legacy in ((tuple(r['a']), r['yA']), (tuple(r['b']), r['yB'])):
        if p in H and (id(r) in owned or r.get('bridge') or r['kind'] == 'path' and p in adj):
            points[f'{p[0]:.3f},{p[1]:.3f},{legacy:.3f}'] = round(H[p] + LEGACY, 6)
# Every end of a bridge or detail-owned segment carries a point (the linear-profile contract).
for r in bridge_segs:
    for p, legacy in ((tuple(r['a']), r['yA']), (tuple(r['b']), r['yB'])):
        assert f'{p[0]:.3f},{p[1]:.3f},{legacy:.3f}' in points, (r['way'], p)

# ---- 2. engineered spans over underpasses and culverts ----
profiled = set((float(k.split(',')[0]), float(k.split(',')[1])) for k in points)
at_grade = defaultdict(list)
for i, r in enumerate(roads):
    if r['kind'] not in ('road', 'path', 'tram', 'rail') or r.get('bridge') or r.get('tunnel') or id(r) in owned: continue
    if tuple(r['a']) in profiled or tuple(r['b']) in profiled: continue
    at_grade[r['way']].append(i)
lower = []
for r in roads:
    if (r.get('tunnel') and r['kind'] in ('road', 'path', 'tram', 'rail')) or r['kind'] == 'stream':
        L = math.dist(r['a'], r['b'])
        e = TUNNEL_REACH * M / L if L > 1e-9 else 0
        ea = (r['a'][0] - (r['b'][0] - r['a'][0]) * e, r['a'][1] - (r['b'][1] - r['a'][1]) * e)
        eb = (r['b'][0] + (r['b'][0] - r['a'][0]) * e, r['b'][1] + (r['b'][1] - r['a'][1]) * e)
        lower.append({**r, 'ea': ea, 'eb': eb})
lgrid = defaultdict(list)
for r in lower:
    x0, x1 = sorted((r['ea'][0], r['eb'][0])); z0, z1 = sorted((r['ea'][1], r['eb'][1]))
    for i in range(math.floor(x0 / CELL), math.floor(x1 / CELL) + 1):
        for j in range(math.floor(z0 / CELL), math.floor(z1 / CELL) + 1):
            lgrid[(i, j)].append(r)


def reference(r, x, z, t):
    """Network reference height of an at-grade segment (terrain.ts / TerrainService.kt, rules v4)."""
    ya = surface1(*r['a']) + max(.071, r['yA']) + .02 - .097
    yb = surface1(*r['b']) + max(.071, r['yB']) + .02 - .097
    ga, gb = surface1(*r['a']), surface1(*r['b'])
    return surface(x, z) + (ya - ga) * (1 - t) + (yb - gb) * t


def upper_hull(s, h):
    hull = []
    for i in range(len(s)):
        while len(hull) >= 2:
            i0, i1 = hull[-2], hull[-1]
            if (s[i1] - s[i0]) * (h[i] - h[i0]) - (h[i1] - h[i0]) * (s[i] - s[i0]) >= 0: hull.pop()
            else: break
        hull.append(i)
    return hull


# Ways meeting at a node are at one level there: a span must not contain a junction with another way.
node_ways = defaultdict(set)
for r in roads:
    if r['kind'] in ('road', 'path', 'tram', 'rail'):
        node_ways[tuple(r['a'])].add(r['way']); node_ways[tuple(r['b'])].add(r['way'])
spans = defaultdict(list); span_info = []; rejected_junction = []
for way, idx in at_grade.items():
    # chains of consecutive connected segments
    chains, cur = [], []
    for i in idx:
        if cur and tuple(roads[cur[-1]]['b']) != tuple(roads[i]['a']):
            chains.append(cur); cur = []
        cur.append(i)
    if cur: chains.append(cur)
    for chain in chains:
        # sample the chain every metre
        S, Y, SEG, T = [], [], [], []
        base = 0; starts = {}
        for i in chain:
            r = roads[i]; L = math.dist(r['a'], r['b']) * U
            starts[i] = base
            n = max(1, math.ceil(L))
            t = np.linspace(0, 1, n + 1)[(1 if S else 0):]
            x = r['a'][0] + (r['b'][0] - r['a'][0]) * t; z = r['a'][1] + (r['b'][1] - r['a'][1]) * t
            S.extend(base + L * t); Y.extend(reference(r, x, z, t) * U); SEG.extend([i] * len(t)); T.extend(t)
            base += L
        S = np.array(S); Y = np.array(Y)
        # crossings with tunnels / streams
        found = []
        for i in chain:
            r = roads[i]; a, b = tuple(r['a']), tuple(r['b'])
            x0, x1 = sorted((a[0], b[0])); z0, z1 = sorted((a[1], b[1]))
            cand = {id(o): o for ii in range(math.floor(x0 / CELL), math.floor(x1 / CELL) + 1)
                    for jj in range(math.floor(z0 / CELL), math.floor(z1 / CELL) + 1) for o in lgrid.get((ii, jj), [])}
            for o in cand.values():
                if {tuple(o['a']), tuple(o['b'])} & {a, b}: continue
                u = seg_cross(a, b, o['ea'], o['eb'])
                if u is None: continue
                s_c = starts[i] + u * math.dist(a, b) * U
                found.append((s_c, o))
        if roads[chain[0]]['kind'] != 'path':
            for k in range(1, len(S) - 1):
                if Y[k] > Y[k - 1] or Y[k] > Y[k + 1]: continue
                w = (S >= S[k] - 15) & (S <= S[k] + 15)
                left, right = Y[w & (S < S[k])], Y[w & (S > S[k])]
                if len(left) and len(right) and min(left.max(), right.max()) - Y[k] >= TRENCH_DEPTH:
                    found.append((S[k], None))
        merged = []
        for s_c, o in sorted(found, key=lambda f: f[0]):
            # The narrowest hull edge over the crossing whose rims lie inside the window (growing windows:
            # a way that keeps climbing beyond the trench must not be bridged across the whole slope).
            edge = None
            for W in SPAN_WINDOWS:
                iw = np.flatnonzero((S >= s_c - W) & (S <= s_c + W))
                if len(iw) < 3: continue
                hull = upper_hull(S[iw], Y[iw])
                hs = S[iw][hull]
                j = np.searchsorted(hs, s_c)
                if j == 0 or j >= len(hs): continue
                i0, i1 = iw[hull[j - 1]], iw[hull[j]]
                if (i0 == iw[0] and i0 != 0) or (i1 == iw[-1] and i1 != len(S) - 1): continue
                edge = (i0, i1); break
            if edge is None: continue
            i0, i1 = edge
            s0, s1 = S[i0], S[i1]
            depth = (Y[i0] + (Y[i1] - Y[i0]) * (s_c - s0) / (s1 - s0)) - np.interp(s_c, S, Y)
            if depth < SPAN_MIN_DEPTH or s1 - s0 > SPAN_MAX: continue
            if o is None:
                k = int(np.searchsorted(S, s_c))
                g = np.abs(np.diff(Y[i0:i1 + 1]) / np.maximum(np.diff(S[i0:i1 + 1]), 1e-9))
                wall_l, wall_r = g[:max(k - i0, 1)].max(), g[max(k - i0, 0):].max() if k - i0 < len(g) else 0
                if depth < TRENCH_DEPTH or s1 - s0 > TRENCH_WIDTH or min(wall_l, wall_r) < TRENCH_WALL: continue
            kind = 'trench' if o is None else 'culvert' if o['kind'] == 'stream' else 'overpass'
            if merged and s0 < merged[-1]['s1'] - 1e-6:
                m = merged[-1]
                if i0 < m['i0']: m['i0'], m['s0'] = i0, s0
                if i1 > m['i1']: m['i1'], m['s1'] = i1, s1
                if o: m['under'].add(o['way'])
                m['kinds'].add(kind); m['depth'] = max(m['depth'], depth)
            else:
                merged.append({'i0': i0, 'i1': i1, 's0': s0, 's1': s1, 'under': {o['way']} if o else set(), 'kinds': {kind}, 'depth': depth})
        for m in merged:
            i0, i1 = m['i0'], m['i1']
            inner = [tuple(roads[i]['a']) for i in chain if m['s0'] + 1e-6 < starts[i] < m['s1'] - 1e-6]
            if any(len(node_ways[p] - {way}) for p in inner):
                rejected_junction.append(way); continue
            # merged spans: recompute the hull between the outer rims so the deck never dips below the way
            seg_y0, seg_y1 = Y[i0], Y[i1]
            line = seg_y0 + (seg_y1 - seg_y0) * (S[i0:i1 + 1] - S[i0]) / (S[i1] - S[i0])
            if (Y[i0:i1 + 1] - line).max() > .01: continue
            for i in chain:
                r = roads[i]; L = math.dist(r['a'], r['b']) * U
                s_start = starts[i]; s_end = s_start + L
                lo, hi = max(m['s0'], s_start), min(m['s1'], s_end)
                if hi - lo < 1e-6: continue
                t0, t1 = (lo - s_start) / L, (hi - s_start) / L
                y = lambda s: (seg_y0 + (seg_y1 - seg_y0) * (s - S[i0]) / (S[i1] - S[i0])) / U
                key = f"{r['a'][0]:.3f},{r['a'][1]:.3f}|{r['b'][0]:.3f},{r['b'][1]:.3f}"
                spans[key].append([round(t0, 6), round(t1, 6), round(y(lo), 6), round(y(hi), 6)])
            xa = lambda q: [round(v, 4) for v in (roads[SEG[q]]['a'][0] + (roads[SEG[q]]['b'][0] - roads[SEG[q]]['a'][0]) * T[q],
                                                  roads[SEG[q]]['a'][1] + (roads[SEG[q]]['b'][1] - roads[SEG[q]]['a'][1]) * T[q])]
            span_info.append({'way': way, 'kind': roads[chain[0]]['kind'], 'name': roads[chain[0]].get('name', ''),
                              'structure': '+'.join(sorted(m['kinds'])), 'under': sorted(m['under']),
                              'a': xa(i0), 'b': xa(i1), 'lengthMetres': round(float(S[i1] - S[i0]), 1),
                              'depthMetres': round(float(m['depth']), 2),
                              'rimMetres': [round(float(Y[i0]), 2), round(float(Y[i1]), 2)]})
print('spans rejected (junction inside)', len(rejected_junction), sorted(set(rejected_junction)))
print('spans', len(span_info), 'segments', len(spans), 'max depth', max((s['depthMetres'] for s in span_info), default=0))

data = {
    'method': 'Rules v4 (Step 3.5). Estimated linear decks on the rendered DTM mesh: deck ends on the highest '
              'ground within 10 m outward, no flat-scene layer lift, raised to clear ground, crossed ways and '
              'measured water; engineered spans where at-grade ways cross underpasses or culverts. Not '
              'surveyed bridge heights (LiDAR decks: Step 4). See scripts/prepare-bridge-profiles.py.',
    'points': points,
    'spans': dict(sorted(spans.items())),
    'spanInfo': span_info,
}
content = json.dumps(data, separators=(',', ':')) + '\n'
for p in (ROOT / 'src/lib/data/bridge-profiles.json', ROOT.parent / 'norrkoping-simulator-backend/src/main/resources/bridge-profiles.json'):
    p.write_text(content)
report = {'raisedNodes': len(raised), 'raisedMetres': {f'{p[0]:.3f},{p[1]:.3f}': [round(v * U, 2), sorted(raise_reason[p])] for p, v in raised.items()},
          'anchors': {k: [round(v[0] * U, 2), round(v[1] * U, 2)] for k, v in anchors_used.items()}}
(ROOT / 'work/step35').mkdir(exist_ok=True)
(ROOT / 'work/step35/profiles-report.json').write_text(json.dumps(report, indent=0))
print('Bridge profile nodes:', len(points))

# Bump the revision whenever infrastructure/surface rules change so stale servers are rejected; the rule
# (surface rules, mesh and these profiles) is shared with prepare-dtm.py and prepare-terrain-mesh.py.
path = ROOT / 'src/lib/data/terrain.json'
dataset = read(path)
dataset['revision'] = rtin.surface_revision(dataset, content)
encoded = json.dumps(dataset, ensure_ascii=False, separators=(',', ':')) + '\n'
for target in (path, ROOT.parent / 'norrkoping-simulator-backend/src/main/resources/terrain.json'): target.write_text(encoded, encoding='utf8')
path = ROOT / 'src/lib/data/buildings-3d.json'
buildings = read(path); buildings['terrainRevision'] = dataset['revision']; path.write_text(json.dumps(buildings) + '\n')
print('Surface revision:', dataset['revision'])
