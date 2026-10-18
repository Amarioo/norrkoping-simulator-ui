"""Native Lantmäteriet 1 m DTM reference heights for the Step 2 elevation checks.

Samples, in the SWEREF 99 TM scene frame (see src/lib/geo/sweref99tm.js):
  * every road/path/rail/tram centreline every 0.2 units (5 m), plus the rail positions of tracks;
  * random points in every land-cover kind and in plain ground (away from roads, buildings, water);
  * every building footprint: DTM min / median / max over the 1 m pixels inside the footprint.

The DTM height at a point is the bilinear interpolation of the four nearest 1 m pixel centres.
Writes work/elevation-step2/samples.json (full set, for scripts/geo/measure-elevation.mjs) and the
regression fixture src/lib/geo/elevation-control.json (deterministic subsample).
Usage: python scripts/geo/elevation_samples.py
"""
import json, math, sys
from pathlib import Path
import numpy as np
import rasterio
from rasterio.merge import merge
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'work/elevation-step2'
OUT.mkdir(parents=True, exist_ok=True)
read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
city = read(ROOT / 'src/lib/data/norrkoping-map.json')
profiles = read(ROOT / 'src/lib/data/bridge-profiles.json')['points']
ref = city['meta']['reference']
assert ref['crs'] == 'EPSG:3006'
UNIT = ref['metresPerUnit'] * ref['gridScaleFactor']
E0, N0 = ref['originEasting'], ref['originNorthing']
tiles = [rasterio.open(p) for p in sorted((ROOT / 'work/geodata/lantmateriet/dtm').glob('m*.tif'))]


def dtm(x, z):
    """Bilinear native-DTM height (metres RH2000) at scene points; NaN outside data."""
    x = np.asarray(x, float); z = np.asarray(z, float)
    E = E0 + x * UNIT; N = N0 - z * UNIT
    out = np.full(len(x), np.nan)
    for t in tiles:
        b = t.bounds
        inside = (E >= b.left) & (E < b.right) & (N > b.bottom) & (N <= b.top)
        if not inside.any():
            continue
        # A 2 m margin from the neighbouring tiles keeps bilinear samples continuous across seams.
        mosaic, aff = merge(tiles, bounds=(b.left - 2, b.bottom - 2, b.right + 2, b.top + 2), nodata=-9999,
                            dtype='float32')
        grid = mosaic[0].astype(np.float64)
        grid[grid == -9999] = np.nan
        col = (E[inside] - aff.c) / aff.a - .5
        row = (N[inside] - aff.f) / aff.e - .5
        out[inside] = map_coordinates(grid, [row, col], order=1, mode='constant', cval=np.nan, prefilter=False)
        del mosaic, grid
    return out


def key(x, z, y):
    return f'{x:.3f},{z:.3f},{y:.3f}'


roads = city['roads']
# ---- 1. Network centrelines
seg_index, ts, xs, zs, lateral = [], [], [], [], []
for i, r in enumerate(roads):
    if r['kind'] == 'stream':
        continue
    (ax, az), (bx, bz) = r['a'], r['b']
    length = math.hypot(bx - ax, bz - az)
    n = max(1, math.ceil(length / .2))
    nx, nz = -(bz - az) / length, (bx - ax) / length
    for k in range(n + 1):
        t = k / n
        offsets = [0.0] + ([.028] if r['kind'] in ('rail', 'tram') else [])
        for o in offsets:
            seg_index.append(i); ts.append(t); lateral.append(o)
            xs.append(ax + (bx - ax) * t + nx * o); zs.append(az + (bz - az) * t + nz * o)
xs = np.array(xs); zs = np.array(zs)
print('network samples', len(xs), flush=True)
net_dtm = dtm(xs, zs)

# Segments that are not ordinary ground-level infrastructure: mapped bridges, tunnels, legacy lifts and
# bridge-profile (linear deck) segments. Samples within 1 unit (25 m) of any of them are flagged.
def special(r):
    return (r.get('bridge') or r.get('tunnel') or r['yA'] > .0711 or r['yB'] > .0711 or r['yA'] < .0709
            or r['yB'] < .0709 or key(*r['a'], r['yA']) in profiles or key(*r['b'], r['yB']) in profiles)


sp = []
for r in roads:
    if r['kind'] != 'stream' and special(r):
        (ax, az), (bx, bz) = r['a'], r['b']
        n = max(1, math.ceil(math.hypot(bx - ax, bz - az) / .1))
        sp += [(ax + (bx - ax) * k / n, az + (bz - az) * k / n) for k in range(n + 1)]
sp_tree = cKDTree(np.array(sp))
near_special = sp_tree.query(np.c_[xs, zs], distance_upper_bound=1.0)[0] < 1.0
ordinary_seg = np.array([not special(roads[i]) for i in seg_index])

# ---- 2. Land cover and plain ground
def pip(px, pz, ring):
    """Vectorised even-odd point-in-ring test."""
    ring = np.asarray(ring, float)
    inside = np.zeros(len(px), bool)
    x1, z1 = ring[:-1, 0], ring[:-1, 1]
    x2, z2 = ring[1:, 0], ring[1:, 1]
    for a, b, c, d in zip(x1, z1, x2, z2):
        cross = (b > pz) != (d > pz)
        with np.errstate(divide='ignore', invalid='ignore'):
            xi = (c - a) * (pz - b) / (d - b) + a
        inside ^= cross & (px < xi)
    return inside


def in_polygon(px, pz, rings):
    m = pip(px, pz, rings[0])
    for hole in rings[1:]:
        m &= ~pip(px, pz, hole)
    return m


def area(ring):
    r = np.asarray(ring)
    return abs(np.dot(r[:-1, 0], r[1:, 1]) - np.dot(r[1:, 0], r[:-1, 1])) / 2


rng = np.random.default_rng(20261018)
road_pts = []
for r in roads:
    if r['kind'] == 'stream':
        continue
    (ax, az), (bx, bz) = r['a'], r['b']
    n = max(1, math.ceil(math.hypot(bx - ax, bz - az) / .05))
    road_pts += [(ax + (bx - ax) * k / n, az + (bz - az) * k / n) for k in range(n + 1)]
road_tree = cKDTree(np.array(road_pts))
building_boxes = [(np.min(np.array(b['rings'][0]), axis=0), np.max(np.array(b['rings'][0]), axis=0), b)
                  for b in city['buildings']]
bb_centres = cKDTree(np.array([(lo + hi) / 2 for lo, hi, _ in building_boxes]))
bb_radius = max(float(np.hypot(*(hi - lo)) / 2) for lo, hi, _ in building_boxes)
water = [a for a in city['areas'] if a['kind'] == 'water']


def clear(px, pz):
    """Away from roads (> 0.5 units = 12.5 m), buildings and water."""
    ok = road_tree.query(np.c_[px, pz], distance_upper_bound=.5)[0] >= .5
    for i in np.flatnonzero(ok):
        for j in bb_centres.query_ball_point([px[i], pz[i]], bb_radius + .01):
            lo, hi, b = building_boxes[j]
            if lo[0] <= px[i] <= hi[0] and lo[1] <= pz[i] <= hi[1] and in_polygon(px[i:i + 1], pz[i:i + 1], b['rings'])[0]:
                ok[i] = False
                break
    for w in water:
        lo, hi = np.min(np.array(w['rings'][0]), axis=0), np.max(np.array(w['rings'][0]), axis=0)
        sel = ok & (px >= lo[0]) & (px <= hi[0]) & (pz >= lo[1]) & (pz <= hi[1])
        if sel.any():
            ok[np.flatnonzero(sel)[in_polygon(px[sel], pz[sel], w['rings'])]] = False
    return ok


cover = []
for kind in ['farmland', 'apron', 'residential', 'industrial', 'square', 'grass', 'cemetery', 'wood', 'pitch']:
    polys = [a for a in city['areas'] if a['kind'] == kind]
    weights = np.array([area(p['rings'][0]) for p in polys])
    picks = rng.choice(len(polys), size=4000, p=weights / weights.sum())
    px, pz = [], []
    for i in picks:
        p = polys[i]
        lo, hi = np.min(np.array(p['rings'][0]), axis=0), np.max(np.array(p['rings'][0]), axis=0)
        for _ in range(30):
            x, z = rng.uniform(lo[0], hi[0]), rng.uniform(lo[1], hi[1])
            if in_polygon(np.array([x]), np.array([z]), p['rings'])[0]:
                px.append(x); pz.append(z)
                break
    px = np.array(px); pz = np.array(pz)
    ok = clear(px, pz)
    cover += [{'kind': kind, 'x': float(x), 'z': float(z)} for x, z in zip(px[ok], pz[ok])]
    print(kind, int(ok.sum()), flush=True)
# Plain ground: inside the clip but outside every mapped area.
bx = rng.uniform(city['meta']['bounds'][0], city['meta']['bounds'][2], 30000)
bz = rng.uniform(city['meta']['bounds'][1], city['meta']['bounds'][3], 30000)
outside = np.ones(len(bx), bool)
for a in city['areas']:
    lo, hi = np.min(np.array(a['rings'][0]), axis=0), np.max(np.array(a['rings'][0]), axis=0)
    sel = outside & (bx >= lo[0]) & (bx <= hi[0]) & (bz >= lo[1]) & (bz <= hi[1])
    if sel.any():
        outside[np.flatnonzero(sel)[in_polygon(bx[sel], bz[sel], a['rings'])]] = False
inground = np.zeros(len(bx), bool)
for g in city['ground']:
    lo, hi = np.min(np.array(g['rings'][0]), axis=0), np.max(np.array(g['rings'][0]), axis=0)
    sel = outside & ~inground & (bx >= lo[0]) & (bx <= hi[0]) & (bz >= lo[1]) & (bz <= hi[1])
    if sel.any():
        inground[np.flatnonzero(sel)[in_polygon(bx[sel], bz[sel], g['rings'])]] = True
sel = outside & inground
sel[sel] = clear(bx[sel], bz[sel])
idx = np.flatnonzero(sel)[:4000]
cover += [{'kind': 'ground', 'x': float(bx[i]), 'z': float(bz[i])} for i in idx]
print('ground', len(idx), flush=True)
cover_dtm = dtm(np.array([c['x'] for c in cover]), np.array([c['z'] for c in cover]))

# ---- 3. Buildings: native DTM over the footprint (1 m pixel centres inside the outer ring minus holes)
merged, aff = merge(tiles, bounds=(E0 + city['meta']['bounds'][0] * UNIT - 5, N0 - city['meta']['bounds'][3] * UNIT - 5,
                                   E0 + city['meta']['bounds'][2] * UNIT + 5, N0 - city['meta']['bounds'][1] * UNIT + 5),
                    nodata=-9999, dtype='float32')
G = merged[0].astype(np.float64)
G[G == -9999] = np.nan


def dtm_merged(x, z):
    E = E0 + np.asarray(x, float) * UNIT; N = N0 - np.asarray(z, float) * UNIT
    return map_coordinates(G, [(N - aff.f) / aff.e - .5, (E - aff.c) / aff.a - .5], order=1, mode='constant',
                           cval=np.nan, prefilter=False)


buildings = []
for b in city['buildings']:
    ring = np.array(b['rings'][0])
    E = E0 + ring[:, 0] * UNIT; N = N0 - ring[:, 1] * UNIT
    c0 = int(math.floor((E.min() - aff.c) / aff.a)); c1 = int(math.ceil((E.max() - aff.c) / aff.a))
    r0 = int(math.floor((N.max() - aff.f) / aff.e)); r1 = int(math.ceil((N.min() - aff.f) / aff.e))
    cc, rr = np.meshgrid(np.arange(c0, c1 + 1), np.arange(r0, r1 + 1))
    pe = aff.c + (cc.ravel() + .5) * aff.a; pn = aff.f + (rr.ravel() + .5) * aff.e
    m = in_polygon((pe - E0) / UNIT, (N0 - pn) / UNIT, b['rings'])
    h = G[rr.ravel()[m], cc.ravel()[m]]
    h = h[np.isfinite(h)]
    vert = dtm_merged(ring[:-1, 0], ring[:-1, 1])
    if not len(h):
        h = vert[np.isfinite(vert)]
    if not len(h):
        continue
    buildings.append({'id': b['id'], 'pixels': int(m.sum()), 'dtmMin': float(h.min()), 'dtmMedian': float(np.median(h)),
                      'dtmMax': float(h.max()), 'dtmFirstVertex': float(vert[0])})
print('buildings', len(buildings), flush=True)

samples = {
    'note': 'Native Lantmäteriet 1 m DTM (bilinear at pixel centres), metres RH2000. Generated by '
            'scripts/geo/elevation_samples.py.',
    'network': {'segment': seg_index, 't': ts, 'lateral': lateral, 'x': xs.tolist(), 'z': zs.tolist(),
                'dtm': [None if not np.isfinite(v) else round(float(v), 3) for v in net_dtm],
                'ordinary': (ordinary_seg & ~near_special).tolist()},
    'cover': [dict(c, dtm=round(float(h), 3)) for c, h in zip(cover, cover_dtm) if np.isfinite(h)],
    'buildings': buildings,
}
(OUT / 'samples.json').write_text(json.dumps(samples, separators=(',', ':')), encoding='utf8')

# ---- 4. Deterministic regression fixture
fix = {'note': samples['note'] + ' Subsample for src/lib/elevation.test.ts.', 'network': [], 'cover': [], 'buildings': []}
net = samples['network']
for kind, count in [('road', 1500), ('path', 1000), ('rail', 400), ('tram', 400)]:
    idx = [i for i in range(len(net['x'])) if roads[net['segment'][i]]['kind'] == kind and net['ordinary'][i]
           and net['lateral'][i] == 0 and net['dtm'][i] is not None]
    for i in rng.choice(idx, size=min(count, len(idx)), replace=False):
        fix['network'].append({'kind': kind, 'x': round(net['x'][i], 4), 'z': round(net['z'][i], 4), 'dtm': net['dtm'][i]})
by_kind = {}
for c in samples['cover']:
    by_kind.setdefault(c['kind'], []).append(c)
for kind, items in by_kind.items():
    for i in rng.choice(len(items), size=min(200, len(items)), replace=False):
        c = items[i]
        fix['cover'].append({'kind': kind, 'x': round(c['x'], 4), 'z': round(c['z'], 4), 'dtm': c['dtm']})
for i in rng.choice(len(buildings), size=600, replace=False):
    b = buildings[i]
    fix['buildings'].append({k: (round(v, 3) if isinstance(v, float) else v) for k, v in b.items()})
(ROOT / 'src/lib/geo/elevation-control.json').write_text(json.dumps(fix, separators=(',', ':')) + '\n', encoding='utf8')
print('fixture', len(fix['network']), len(fix['cover']), len(fix['buildings']))
