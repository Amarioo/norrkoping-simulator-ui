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


def write_text(path, text):
    """Write with retries: on Windows a reader (dev server, test run, virus scan) can briefly lock a file."""
    import time
    for attempt in range(6):
        try:
            Path(path).write_text(text, encoding='utf8'); return
        except OSError:
            if attempt == 5: raise
            time.sleep(1 + attempt)
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
# Batch C: a span rim is where the profile leaves the hull edge by more than this (m). Before, rims were
# the hull vertices, which on a uniform grade are the window ends, so trenches in graded roads (e.g.
# Linköpingsvägen, E 566 441 N 6 494 195, 3.5 m deep) were never bridged.
RIM_TOLERANCE = .01
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
# Rail/tram decks (Batch C): track is continuous, so a deck end sits at the level of the track on the
# embankment beyond it: the median rendered ground along the connected at-grade track 4–12 m out (past
# the DTM's removed-bridge gap). The generic anchor (highest ground within 10 m along the group axis)
# sampled terrain beside curved or multi-track decks and left deck ends up to 0.8 m above the track.
track_next = defaultdict(list)
for r in roads:
    if r['kind'] in ('rail', 'tram') and not r.get('bridge') and not r.get('tunnel'):
        track_next[tuple(r['a'])].append(tuple(r['b'])); track_next[tuple(r['b'])].append(tuple(r['a']))


# Step 5.1: the anchor samples the measured track bed (native 1 m DTM, retained-deck corrections applied,
# median across ±1 m of the track) instead of the rendered 5 m mesh, whose embankment error (0.1-0.4 m next
# to Södra stambanan's underpass bridges, E 567 390 N 6 497 125) went into the deck ends and concentrated the
# fall on the deck (2.8 % drawn, 1.25 % in the class 17 returns). TRACK_ANCHOR=rendered restores the old rule.
TRACK_ANCHOR = os.environ.get('TRACK_ANCHOR', 'native')
if TRACK_ANCHOR == 'native':
    import dtm_corrections
    _native, _ninfo = dtm_corrections.native_mosaic(); _ncorr = dtm_corrections.corrected_pixels()
    _unit = U * REF['gridScaleFactor']

    def native_track(xs, zs, dirs):
        E = REF['originEasting'] + xs * _unit; N = REF['originNorthing'] - zs * _unit
        vals = []
        for e, n, (ux, uz) in zip(E, N, dirs):
            # across the track (scene z points south: SWEREF normal of (ux, -uz) is (uz, ux))
            for o in (-1.0, 0.0, 1.0):
                ee, nn = e + uz * o, n + ux * o
                r, c = int(_ninfo['top'] - nn), int(ee - _ninfo['left'])
                vals.append(float(dtm_corrections.apply_to_block(np.array(_native[r:r + 1, c:c + 1]), r, c, _ncorr)[0, 0]))
        v = np.array(vals).reshape(-1, 3)
        return (np.median(v, 1) - VO) / U


def track_anchor(p, near=4.0, far=12.0):
    samples = []; seen = {p}; stack = [(p, 0.0)]
    while stack:
        q, d = stack.pop()
        for n in track_next.get(q, ()):
            if n in seen: continue
            seen.add(n)
            L = math.dist(q, n) * U
            if L < 1e-9: continue
            u = ((n[0] - q[0]) / (L / U), (n[1] - q[1]) / (L / U))
            for s in np.arange(max(near, d), min(d + L, far) + 1e-9, 1.0):
                f = (s - d) / L
                samples.append((q[0] + (n[0] - q[0]) * f, q[1] + (n[1] - q[1]) * f, u[0], u[1]))
            if d + L < far: stack.append((n, d + L))
    if len(samples) < 3: return None
    xs = np.array(samples)
    if TRACK_ANCHOR == 'native':
        return float(np.median(native_track(xs[:, 0], xs[:, 1], xs[:, 2:4])))
    return float(np.median(surface(xs[:, 0], xs[:, 1])))


track_deck_nodes = set()
anchor_compare = {}
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
    if not detail and all(r['kind'] in ('rail', 'tram') for r in rs):
        ta, tb = track_anchor(a), track_anchor(b)
        anchor_compare[way] = (ta, tb)
        ha = ha if ta is None else ta; hb = hb if tb is None else tb
        track_deck_nodes.update(ends)
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

# ---- 1b. measured decks (Batch C): LiDAR class 17 replaces the estimate where the deck was scanned ----
# Lantmäteriet Laserdata NH 2020 class 17 ("bro") returns, cached by scripts/geo/lidar_deck_points.py. At each
# deck node: returns within DECK_RADIUS m; the densest DECK_BAND m height band (the one closest to the
# estimate when two decks overlap, e.g. a lower bridge under an overpass) with at least DECK_MIN returns;
# its median is the deck surface. Measured heights win over the estimated clearances above. Nodes without
# enough returns (deck ends on embankments, tiles without class 17) keep the estimate (recorded below).
DECK_RADIUS, DECK_MIN, DECK_BAND = 2.5, 8, 1.0
deck_dir = ROOT / 'work/geodata/lantmateriet/deck17'
measured = {}
if deck_dir.exists() and os.environ.get('LIDAR_DECKS', '1') == '1':
    from scipy.spatial import cKDTree
    parts = []
    for f in sorted(deck_dir.glob('*.npy')):
        if f.name.endswith('.origin.npy'): continue
        a = np.load(f).astype(np.float64)
        a[:, :2] += np.load(f.with_name(f.name[:-4] + '.origin.npy'))
        parts.append(a)
    D = np.concatenate(parts); tree = cKDTree(D[:, :2])
    unit = U * REF['gridScaleFactor']
    for p in list(H):
        # Rail/tram decks keep the track-continuity anchor: their class 17 returns are dominated by
        # parapets and trough walls about 1 m above the ballast, which a median cannot separate.
        if p in track_deck_nodes: continue
        E = REF['originEasting'] + p[0] * unit; N = REF['originNorthing'] - p[1] * unit
        idx = tree.query_ball_point((E, N), DECK_RADIUS)
        if len(idx) < DECK_MIN: continue
        z = np.sort(D[idx, 2])
        top = np.searchsorted(z, z + DECK_BAND, side='right'); counts = top - np.arange(len(z))
        cand = np.flatnonzero(counts >= max(DECK_MIN, .4 * counts.max()))
        if not len(cand): continue
        estimate = H[p] * U + VO
        k = cand[np.argmin(np.abs(z[cand] + DECK_BAND / 2 - estimate))]
        measured[p] = (float(np.median(z[k:top[k]])) - VO) / U
    delta = np.array([(measured[p] - H[p]) * U for p in measured])
    print('measured deck nodes', len(measured), 'of', len(H),
          'measured - estimate m: mean', round(float(delta.mean()), 2) if len(delta) else None,
          'rmse', round(float(np.sqrt((delta ** 2).mean())), 2) if len(delta) else None,
          'max', round(float(np.abs(delta).max()), 2) if len(delta) else None)
    H.update(measured)

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

def upper_hull(s, h):
    hull = []
    for i in range(len(s)):
        while len(hull) >= 2:
            i0, i1 = hull[-2], hull[-1]
            if (s[i1] - s[i0]) * (h[i] - h[i0]) - (h[i1] - h[i0]) * (s[i] - s[i0]) >= 0: hull.pop()
            else: break
        hull.append(i)
    return hull


# ---- 1c. deck-end notches (Step 5) ----
# The DTM removes a bridge up to its abutment, and OSM often ends the bridge way a few metres short of it
# (or the way's geometry is offset from the DTM by a few metres). The first at-grade nodes beyond the deck
# end then lie in the removed-bridge gap: at Saltängsbron's south end (Hamngatan x Drottninggatan,
# E 568 912 N 6 495 374) two street nodes sat on the river surface of the DTM (0.92 m) between the deck
# (3.71 m) and the street (3.3 m), a 2.5 m hole of draped asphalt, approaches and junction fans. Such a
# node is part of the structure: walking at most NOTCH_REACH along at-grade road/tram/rail ways from a deck
# end, a node whose rendered ground lies NOTCH_DEPTH below both the deck end and the land rim (the upper
# hull of the walk, pinned to the deck) takes the hull level as a profile point. The rim must be within
# NOTCH_RIM of the deck level (the street the bridge lands on), so valleys and stairs are never lifted.
NOTCH_REACH, NOTCH_DEPTH, NOTCH_RIM = 25.0, 1.0, 1.5
# Step 5.1: along track only (rail/tram walks) the notch depth is NOTCH_DEPTH_TRACK. Continuous track has no
# 0.3 m step at an abutment; a road may (valleys, stairs), so roads keep NOTCH_DEPTH. Södra stambanan at
# E 567 452 N 6 497 087: the first node 3.4 m past the deck end lay 0.65 m low in the gap edge (3.1 % ridden).
NOTCH_DEPTH_TRACK = 0.3
at_grade_next = defaultdict(list)
for r in roads:
    if r['kind'] in ('road', 'tram', 'rail') and not r.get('bridge') and not r.get('tunnel') and id(r) not in owned:
        at_grade_next[tuple(r['a'])].append((tuple(r['b']), r)); at_grade_next[tuple(r['b'])].append((tuple(r['a']), r))
deck_ends = {tuple(r[e]) for r in bridge_segs for e in ('a', 'b') if tuple(r[e]) in at_grade_next}
notch = {}
for D in deck_ends:
    stack = [([D], 0.0, True)]
    while stack:
        path, length, track = stack.pop()
        q = path[-1]
        extended = False
        for n, r in at_grade_next[q]:
            if n in path or n in H: continue
            L = math.dist(q, n) * U
            if length + L > NOTCH_REACH: continue
            stack.append((path + [n], length + L, track and r['kind'] in ('rail', 'tram'))); extended = True
        if extended and length < NOTCH_REACH: continue
        if len(path) < 3: continue
        # Drawn profile of the walk (1 m), pinned to the deck end.
        S2, Y2, at = [], [], {}
        base = 0.0
        for p, n in zip(path, path[1:]):
            L = math.dist(p, n) * U; k = max(1, math.ceil(L))
            tt = np.linspace(0, 1, k + 1)[(1 if S2 else 0):]
            S2.extend(base + L * tt)
            Y2.extend(surface(p[0] + (n[0] - p[0]) * tt, p[1] + (n[1] - p[1]) * tt) * U)
            base += L; at[n] = base
        S2 = np.array(S2); Y2 = np.array(Y2); Y2[0] = H[D] * U
        hull = upper_hull(S2, Y2)
        if len(hull) < 2: continue
        k = hull[1]
        if abs(Y2[k] - Y2[0]) > NOTCH_RIM: continue
        for n in path[1:-1]:
            s_n = at[n]
            if s_n >= S2[k] - 1e-6: break
            level = Y2[0] + (Y2[k] - Y2[0]) * s_n / S2[k]
            g = surface1(*n) * U
            depth = NOTCH_DEPTH_TRACK if track else NOTCH_DEPTH
            if g < Y2[0] - depth and g < Y2[k] - depth:
                notch[n] = max(notch.get(n, -1e9), level / U)
for n, h in notch.items():
    H[n] = h
    for r in roads:
        if r['kind'] in ('road', 'path', 'tram', 'rail') and not r.get('tunnel'):
            for e in ('a', 'b'):
                if tuple(r[e]) == n:
                    points[f'{n[0]:.3f},{n[1]:.3f},{r["y" + e.upper()]:.3f}'] = round(h + LEGACY, 6)
notch_report = [{'at': [round(REF['originEasting'] + n[0] * U * REF['gridScaleFactor'], 1),
                        round(REF['originNorthing'] - n[1] * U * REF['gridScaleFactor'], 1)],
                 'levelMetres': round(h * U + VO, 2), 'groundMetres': round(surface1(*n) * U + VO, 2)} for n, h in notch.items()]
print('deck-end notch nodes', len(notch), sorted(notch_report, key=lambda d: d['levelMetres'] - d['groundMetres'])[-5:])

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


# Ways meeting at a node are at one level there (joins inside spans get profile points).
node_segments = defaultdict(list)
for oi, r in enumerate(roads):
    if r['kind'] in ('road', 'path', 'tram', 'rail'):
        node_segments[tuple(r['a'])].append(oi); node_segments[tuple(r['b'])].append(oi)
spans = defaultdict(list); span_info = []; rejected_junction = []; joined = []
# Strokes (Batch C): continuous at-grade lines of one kind across OSM way splits. OSM splits ways at
# arbitrary points (tags, relations), e.g. Södra stambanan changes way inside the Ståthögavägen trench,
# so a per-way chain could start on the trench floor and never find its rim. At every node the two
# straightest ends of the same kind (deviation < 45°) continue each other.
ends = defaultdict(list)
for idx in at_grade.values():
    for i in idx:
        ends[tuple(roads[i]['a'])].append((i, False)); ends[tuple(roads[i]['b'])].append((i, True))


def leaving(i, at_end):
    r = roads[i]; a, b = (r['b'], r['a']) if at_end else (r['a'], r['b'])
    d = math.dist(a, b) or 1e-9
    return (b[0] - a[0]) / d, (b[1] - a[1]) / d


partner = {}
for node, lst in ends.items():
    pairs = []
    for x in range(len(lst)):
        for y in range(x + 1, len(lst)):
            (i, ei), (j, ej) = lst[x], lst[y]
            if i == j or roads[i]['kind'] != roads[j]['kind']: continue
            hi, hj = leaving(i, ei), leaving(j, ej)
            straight = -(hi[0] * hj[0] + hi[1] * hj[1])
            if straight > math.cos(math.radians(45)): pairs.append((straight, lst[x], lst[y]))
    for _, e1, e2 in sorted(pairs, reverse=True):
        if e1 in partner or e2 in partner: continue
        partner[e1] = e2; partner[e2] = e1
seen = set(); strokes = []
for idx in at_grade.values():
    for first in idx:
        if first in seen: continue
        i, rev = first, False; guard = set()
        while (i, rev) not in guard:        # walk back to the start of the stroke
            guard.add((i, rev))
            q = partner.get((i, rev))
            if q is None or q[0] in seen or q[0] == first: break
            i, rev = q[0], not q[1]
        stroke = []
        while i not in seen:                # then forward, collecting oriented segments
            seen.add(i); stroke.append((i, rev))
            q = partner.get((i, not rev))
            if q is None: break
            i, rev = q[0], q[1]
        strokes.append(stroke)
for chain in strokes:
    members = {i for i, _ in chain}
    kind_of_chain = roads[chain[0][0]]['kind']
    orient = dict(chain)
    # sample the stroke every metre (T: parameter along each segment's own a->b)
    S, Y, SEG, T = [], [], [], []
    base = 0; starts = {}
    for i, rev in chain:
        r = roads[i]; L = math.dist(r['a'], r['b']) * U
        starts[i] = base
        n = max(1, math.ceil(L))
        tt = np.linspace(0, 1, n + 1)[(1 if S else 0):]
        t = 1 - tt if rev else tt
        x = r['a'][0] + (r['b'][0] - r['a'][0]) * t; z = r['a'][1] + (r['b'][1] - r['a'][1]) * t
        S.extend(base + L * tt); Y.extend(reference(r, x, z, t) * U); SEG.extend([i] * len(t)); T.extend(t)
        base += L
    S = np.array(S); Y = np.array(Y)
    # crossings with tunnels / streams
    found = []
    for i, rev in chain:
        r = roads[i]; a, b = tuple(r['a']), tuple(r['b'])
        x0, x1 = sorted((a[0], b[0])); z0, z1 = sorted((a[1], b[1]))
        cand = {id(o): o for ii in range(math.floor(x0 / CELL), math.floor(x1 / CELL) + 1)
                for jj in range(math.floor(z0 / CELL), math.floor(z1 / CELL) + 1) for o in lgrid.get((ii, jj), [])}
        for o in cand.values():
            if {tuple(o['a']), tuple(o['b'])} & {a, b}: continue
            u = seg_cross(a, b, o['ea'], o['eb'])
            if u is None: continue
            s_c = starts[i] + (1 - u if rev else u) * math.dist(a, b) * U
            found.append((s_c, o))
    if kind_of_chain != 'path':
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
            # Rims: on a uniform grade every point lies on the hull edge, which then runs to the window
            # ends; move each rim inwards while the profile stays on the edge (within RIM_TOLERANCE).
            k_c = int(np.searchsorted(S, s_c))
            on = lambda q: Y[i0] + (Y[i1] - Y[i0]) * (S[q] - S[i0]) / (S[i1] - S[i0]) - Y[q] < RIM_TOLERANCE
            a, b = i0, i1
            while a + 1 < k_c and on(a + 1): a += 1
            while b - 1 > k_c and on(b - 1): b -= 1
            if (a == iw[0] and a != 0) or (b == iw[-1] and b != len(S) - 1): continue
            edge = (a, b); break
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
        entry = lambda i: tuple(roads[i]['b'] if orient[i] else roads[i]['a'])
        inner = [(entry(i), starts[i]) for i, _ in chain if m['s0'] + 1e-6 < starts[i] < m['s1'] - 1e-6]
        # merged spans: recompute the hull between the outer rims so the deck never dips below the way
        seg_y0, seg_y1 = Y[i0], Y[i1]
        line = seg_y0 + (seg_y1 - seg_y0) * (S[i0:i1 + 1] - S[i0]) / (S[i1] - S[i0])
        if (Y[i0:i1 + 1] - line).max() > .01: continue
        # Ways joining inside the span meet it at its level (a shared node is one level): they get a
        # profile point there, so they become approaches (or decks) instead of the span being dropped.
        # Batch C; before, such spans were rejected (Södra stambanan switches at Ståthögavägen).
        joins = []
        for p, s_p in inner:
            level = (seg_y0 + (seg_y1 - seg_y0) * (s_p - S[i0]) / (S[i1] - S[i0])) / U
            for oi in node_segments.get(p, ()):
                if oi not in members: joins.append((oi, 'a' if tuple(roads[oi]['a']) == p else 'b', level))
        ways = sorted({roads[i]['way'] for i, _ in chain
                       if starts[i] < m['s1'] and starts[i] + math.dist(roads[i]['a'], roads[i]['b']) * U > m['s0']})
        # A joining segment that already ends on a bridge deck there cannot meet the span as well.
        if any(f"{roads[oi]['a' if e == 'a' else 'b'][0]:.3f},{roads[oi][e][1]:.3f},{roads[oi]['y' + e.upper()]:.3f}" in points
               for oi, e, _ in joins):
            rejected_junction.extend(ways); continue
        joined.extend(joins)
        y = lambda s: (seg_y0 + (seg_y1 - seg_y0) * (s - S[i0]) / (S[i1] - S[i0])) / U
        for i, rev in chain:
            r = roads[i]; L = math.dist(r['a'], r['b']) * U
            s_start = starts[i]; s_end = s_start + L
            lo, hi = max(m['s0'], s_start), min(m['s1'], s_end)
            if hi - lo < 1e-6: continue
            u0, u1 = (lo - s_start) / L, (hi - s_start) / L
            piece = [1 - u1, 1 - u0, y(hi), y(lo)] if rev else [u0, u1, y(lo), y(hi)]
            key = f"{r['a'][0]:.3f},{r['a'][1]:.3f}|{r['b'][0]:.3f},{r['b'][1]:.3f}"
            spans[key].append([round(v, 6) for v in piece])
        xa = lambda q: [round(v, 4) for v in (roads[SEG[q]]['a'][0] + (roads[SEG[q]]['b'][0] - roads[SEG[q]]['a'][0]) * T[q],
                                              roads[SEG[q]]['a'][1] + (roads[SEG[q]]['b'][1] - roads[SEG[q]]['a'][1]) * T[q])]
        mid = SEG[min(len(S) - 1, int(np.searchsorted(S, (m['s0'] + m['s1']) / 2)))]
        span_info.append({'way': roads[mid]['way'], 'ways': ways, 'kind': kind_of_chain, 'name': roads[mid].get('name', ''),
                          'structure': '+'.join(sorted(m['kinds'])), 'under': sorted(m['under']),
                          'a': xa(i0), 'b': xa(i1), 'lengthMetres': round(float(S[i1] - S[i0]), 1),
                          'depthMetres': round(float(m['depth']), 2),
                          'rimMetres': [round(float(Y[i0]), 2), round(float(Y[i1]), 2)]})
# Ways joining inside a span: their segment at the junction becomes one linear piece from the span's
# level at the junction to its own draped reference at the other end (or another junction level). A
# piece, not a profile point: points are keyed by (x, z, level), which the spanned way shares.
join_levels = defaultdict(dict)
for oi, end, level in joined: join_levels[oi][end] = max(join_levels[oi].get(end, -1e9), level)
skipped_joins = 0
for oi, lv in join_levels.items():
    o = roads[oi]; key = f"{o['a'][0]:.3f},{o['a'][1]:.3f}|{o['b'][0]:.3f},{o['b'][1]:.3f}"
    if key in spans or o.get('bridge') or o.get('tunnel'): skipped_joins += 1; continue
    ya = lv.get('a', float(reference(o, np.array([o['a'][0]]), np.array([o['a'][1]]), np.array([0.0]))[0]))
    yb = lv.get('b', float(reference(o, np.array([o['b'][0]]), np.array([o['b'][1]]), np.array([1.0]))[0]))
    spans[key].append([0.0, 1.0, round(float(ya), 6), round(float(yb), 6)])
print('segments joining spans (linear join pieces)', len(join_levels) - skipped_joins, 'skipped', skipped_joins)

# ---- 2b. approaches (Batch C) ----
# Rules v4 drew an approach (one end on a deck point) as the terrain plus the deck end's offset tapered
# along it. That offset is measured against the ground at the deck end node, which usually lies in the
# DTM's removed-bridge gap: on a level embankment the taper then builds a hump of the gap depth (tram 2 at
# E 569 870 N 6 493 611: +3.1 m, 13 % for a vehicle). Now an approach follows the terrain (with its far
# end's own offset), is pinned to the deck height at the deck end, and takes the upper hull of that: the
# gap is bridged linearly from the last embankment point, a deck above the ground is reached by a
# straight ramp, and no hump is added. Stored as span pieces, so client and backend use it unchanged.
APPROACH_CHANGE = .1   # m: replace a tapered approach only where the hull differs by more
# Step 5.1: on a long rail/tram approach the taper still dips where the track leaves the deck over the edge of
# the removed-bridge gap (Södra stambanan, E 567 455 N 6 497 086: 0.5 m within 4 m of the deck end, 3.1 % for
# the train; LiDAR ground and class 17 deck both at 22.5 m). Continuous track has no such dip: within
# END_DIP_REACH of the deck end, a dip of END_DIP_DEPTH under the local upper hull is bridged like a trench.
END_DIP_REACH, END_DIP_DEPTH = 15.0, .15
approach_spans = 0
end_dips = []
for r in roads:
    if r['kind'] not in ('road', 'path', 'tram', 'rail') or r.get('bridge') or r.get('tunnel') or id(r) in owned: continue
    ka = f"{r['a'][0]:.3f},{r['a'][1]:.3f},{r['yA']:.3f}"; kb = f"{r['b'][0]:.3f},{r['b'][1]:.3f},{r['yB']:.3f}"
    if (ka in points) == (kb in points): continue
    key = f"{r['a'][0]:.3f},{r['a'][1]:.3f}|{r['b'][0]:.3f},{r['b'][1]:.3f}"
    if key in spans: continue
    L = math.dist(r['a'], r['b']) * U
    if L > SPAN_MAX:
        # A long approach keeps its taper; only a removed-bridge notch in it (TRENCH_* rule) is bridged.
        t = np.linspace(0, 1, max(2, math.ceil(L)) + 1); S2 = t * L
        x = r['a'][0] + (r['b'][0] - r['a'][0]) * t; z = r['a'][1] + (r['b'][1] - r['a'][1]) * t
        ga, gb = surface1(*r['a']), surface1(*r['b'])
        ya = points[ka] - .097 if ka in points else ga + max(.071, r['yA']) + .02 - .097
        yb = points[kb] - .097 if kb in points else gb + max(.071, r['yB']) + .02 - .097
        Y2 = (surface(x, z) + (ya - ga) * (1 - t) + (yb - gb) * t) * U
        pieces = []
        for k in range(1, len(S2) - 1):
            if Y2[k] > Y2[k - 1] or Y2[k] > Y2[k + 1]: continue
            if pieces and pieces[-1][0] <= S2[k] <= pieces[-1][1]: continue
            iw = np.flatnonzero(np.abs(S2 - S2[k]) <= 20)
            hull = upper_hull(S2[iw], Y2[iw]); hs = S2[iw][hull]; j = np.searchsorted(hs, S2[k])
            if j == 0 or j >= len(hs): continue
            i0, i1 = iw[hull[j - 1]], iw[hull[j]]
            on = lambda q: Y2[i0] + (Y2[i1] - Y2[i0]) * (S2[q] - S2[i0]) / (S2[i1] - S2[i0]) - Y2[q] < RIM_TOLERANCE
            while i0 + 1 < k and on(i0 + 1): i0 += 1
            while i1 - 1 > k and on(i1 - 1): i1 -= 1
            depth = Y2[i0] + (Y2[i1] - Y2[i0]) * (S2[k] - S2[i0]) / (S2[i1] - S2[i0]) - Y2[k]
            g = np.abs(np.diff(Y2[i0:i1 + 1]) / np.diff(S2[i0:i1 + 1]))
            walls = min(g[:max(k - i0, 1)].max(), g[max(k - i0, 0):].max() if k - i0 < len(g) else 0)
            deck_end = abs(S2[k] - (0.0 if ka in points else L)) <= END_DIP_REACH and r['kind'] in ('rail', 'tram')
            if S2[i1] - S2[i0] > TRENCH_WIDTH: continue
            if deck_end and depth < END_DIP_DEPTH: continue
            if not deck_end and (depth < TRENCH_DEPTH or walls < TRENCH_WALL): continue
            pieces.append((S2[i0], S2[i1], Y2[i0], Y2[i1]))
            if deck_end and depth < TRENCH_DEPTH: end_dips.append((r['way'], r['kind'], round(float(depth), 2), round(float(S2[k]), 1)))
        if pieces:
            spans[key] = [[round(s0 / L, 6), round(s1 / L, 6), round(y0 / U, 6), round(y1 / U, 6)] for s0, s1, y0, y1 in pieces]
            approach_spans += 1
        continue
    t = np.linspace(0, 1, max(2, math.ceil(L)) + 1)
    x = r['a'][0] + (r['b'][0] - r['a'][0]) * t; z = r['a'][1] + (r['b'][1] - r['a'][1]) * t
    deck_at_a = ka in points
    far = r['b'] if deck_at_a else r['a']; far_y = r['yB'] if deck_at_a else r['yA']
    offset = max(.071, far_y) + .02 - .097           # the far end's own (draped) offset
    Yp = (surface(x, z) + offset) * U
    if deck_at_a: Yp[0] = (points[ka] - .097) * U
    else: Yp[-1] = (points[kb] - .097) * U
    hull = upper_hull(t * L, Yp)
    # Keep the draped (tapered) approach where it already matches: span pieces have a level
    # cross-section, which on side slopes puts the uphill edge a little under the terrain.
    ga, gb = surface1(*r['a']), surface1(*r['b'])
    ya = points[ka] - .097 if ka in points else ga + max(.071, r['yA']) + .02 - .097
    yb = points[kb] - .097 if kb in points else gb + max(.071, r['yB']) + .02 - .097
    taper = (surface(x, z) + (ya - ga) * (1 - t) + (yb - gb) * t) * U
    if np.abs(np.interp(t, t[hull], Yp[hull]) - taper).max() < APPROACH_CHANGE: continue
    spans[key] = [[round(float(t[p]), 6), round(float(t[q]), 6), round(float(Yp[p] / U), 6), round(float(Yp[q] / U), 6)]
                  for p, q in zip(hull, hull[1:])]
    approach_spans += 1
print('approaches (terrain, pinned to the deck, upper hull)', approach_spans)
print('deck-end track dips bridged (Step 5.1)', len(end_dips), end_dips)

# ---- 2c. one level per node (Batch C) ----
# Spans of different strokes (a through road and a side road bridging the same culvert with their own
# hulls), or a span and a draped way, can end at one shared node at different heights. A node is one
# level: everything meeting there takes the highest of them (raising a hull end keeps it above the
# terrain); a draped segment gets a linear join piece to its far end.
seg_by_key = {f"{r['a'][0]:.3f},{r['a'][1]:.3f}|{r['b'][0]:.3f},{r['b'][1]:.3f}": r for r in roads
              if r['kind'] in ('road', 'path', 'tram', 'rail')}
at_node = defaultdict(list)   # node -> [(key, end, height or None)]
for key, r in seg_by_key.items():
    if r.get('bridge') or r.get('tunnel') or id(r) in owned: continue
    ka = f"{r['a'][0]:.3f},{r['a'][1]:.3f},{r['yA']:.3f}"; kb = f"{r['b'][0]:.3f},{r['b'][1]:.3f},{r['yB']:.3f}"
    pieces = spans.get(key, [])
    for end, p, k in (('a', tuple(r['a']), ka), ('b', tuple(r['b']), kb)):
        if k in points: continue                     # deck ends keep their profile
        hit = [pc for pc in pieces if (pc[0] <= 1e-9 if end == 'a' else pc[1] >= 1 - 1e-9)]
        at_node[p].append((key, end, (hit[0][2] if end == 'a' else hit[0][3]) if hit else None))
reconciled = 0
for p, items in at_node.items():
    spanned = [h for _, _, h in items if h is not None]
    if not spanned: continue
    draped = {}
    for key, end, h in items:
        if h is None:
            r = seg_by_key[key]
            draped[key] = float(reference(r, np.array([p[0]]), np.array([p[1]]), np.array([0.0 if end == 'a' else 1.0]))[0])
    target = max(spanned + list(draped.values()))
    if target - min(spanned + list(draped.values())) < .0005: continue   # 1.25 cm
    reconciled += 1
    for key, end, h in items:
        r = seg_by_key[key]
        if h is not None:
            for pc in spans[key]:
                if end == 'a' and pc[0] <= 1e-9: pc[2] = round(target, 6)
                if end == 'b' and pc[1] >= 1 - 1e-9: pc[3] = round(target, 6)
        elif abs(draped[key] - target) > .0005 and key not in spans:
            fa = float(reference(r, np.array([r['a'][0]]), np.array([r['a'][1]]), np.array([0.0]))[0])
            fb = float(reference(r, np.array([r['b'][0]]), np.array([r['b'][1]]), np.array([1.0]))[0])
            spans[key] = [[0.0, 1.0, round(target if end == 'a' else fa, 6), round(target if end == 'b' else fb, 6)]]
print('nodes reconciled to one level', reconciled)
print('spans rejected (junction inside a deck)', len(rejected_junction), sorted(set(rejected_junction)))
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
    write_text(p, content)
report = {'raisedNodes': len(raised), 'raisedMetres': {f'{p[0]:.3f},{p[1]:.3f}': [round(v * U, 2), sorted(raise_reason[p])] for p, v in raised.items()},
          'anchors': {k: [round(v[0] * U, 2), round(v[1] * U, 2)] for k, v in anchors_used.items()},
          'deckEndNotches': notch_report}
(ROOT / 'work/step35').mkdir(exist_ok=True)
(ROOT / 'work/step35/profiles-report.json').write_text(json.dumps(report, indent=0))
print('Bridge profile nodes:', len(points))

# Bump the revision whenever infrastructure/surface rules change so stale servers are rejected; the rule
# (surface rules, mesh and these profiles) is shared with prepare-dtm.py and prepare-terrain-mesh.py.
path = ROOT / 'src/lib/data/terrain.json'
dataset = read(path)
dataset['revision'] = rtin.surface_revision(dataset, content)
encoded = json.dumps(dataset, ensure_ascii=False, separators=(',', ':')) + '\n'
for target in (path, ROOT.parent / 'norrkoping-simulator-backend/src/main/resources/terrain.json'): write_text(target, encoded)
path = ROOT / 'src/lib/data/buildings-3d.json'
buildings = read(path); buildings['terrainRevision'] = dataset['revision']; write_text(path, json.dumps(buildings) + '\n')
print('Surface revision:', dataset['revision'])
