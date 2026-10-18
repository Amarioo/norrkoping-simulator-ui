"""Water reaches: flat water surfaces at measured levels (Step 3.5, pass 1 of 2).

Motala ström falls through several dams in the centre, so the river has no single level, and the
rendered water must not be draped on the terrain (sloped facets climbing banks, decks and walls).

Evidence used, per OSM water polygon of the map:
  * Lantmäteriet Markhöjdmodell 1 m (work/geodata/lantmateriet/dtm): over water it is hydro-flattened,
    i.e. each lake or river reach is one flat surface built from the laser water returns, with sharp
    steps at dams and falls. Its flat regions give the EXTENT of each reach.
  * Lantmäteriet Laserdata class 9 (water) returns, flight 2020 (prepared 2 m grids,
    work/geodata/lantmateriet/prepared/*.npz): the measured LEVEL of each reach (median).
  * The sea (Bråviken and the river below the last fall) is drawn at the SMHI 2021-2025 mean sea level
    at Juten-Djurökvarn, +0.14 m RH2000 (user decision 2026-10-18); the scan-day level is recorded.
Polygons without a flat DTM region are narrow streams/ditches whose surface slopes: they keep the
terrain-following surface and are flagged 'unmeasured'. Inside measured polygons, sloping water that
cannot join a reach is 'draped' the same way, and dry sloping banks (DTM > level + 0.5 m) are 'dry':
drawn as land, so the shoreline there is where the DTM meets the water.

Writes work/water-reaches/raw.json for scripts/prepare-water-reaches.mjs (pass 2: exact polygon cuts).
Run with the geodata Python (ELEVATION.md).
"""
import json, sys, math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
import numpy as np
import rasterio
from rasterio.merge import merge
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

SEA_LEVEL = 0.14          # m RH2000, SMHI Juten-Djurökvarn mean 2021-2025 (docs/elevation-audit-2026-10-18.md)
SEA_MAX = 1.0             # flat regions below this level in the sea polygon are sea / tidal river
STEP = 2.0                # analysis grid (m)
FLAT_TOL = 0.03           # neighbouring DTM cells of one hydro-flattened surface differ by less than this
MIN_REACH_M2 = 400        # smaller flat patches are noise (bank pixels, bridge shadows)
MIN_CLASS9_CELLS = 25     # below this the reach level falls back to the flattened DTM level
FALL_TOL = 0.3            # a water cell joins no reach more than this above its own DTM surface
SIMPLIFY_CELLS = 1.5       # reach boundary simplification (cells of 2 m)
DRY = -3                  # label of dry bank inside an OSM water polygon (drawn as land)
DRY_TOL = 0.5             # m above the reach level
DRAPED = -2               # label of water without a measured level inside a measured polygon
OUT = ROOT / 'work/water-reaches'
OUT.mkdir(parents=True, exist_ok=True)

read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
terrain = read(ROOT / 'src/lib/data/terrain.json')
REF = terrain['reference']
UNIT = REF['metresPerUnit'] * REF['gridScaleFactor']
city = read(ROOT / 'src/lib/data/norrkoping-map.json')
areas = [a for a in city['areas'] if a['kind'] == 'water']

# ---- analysis grid over the map (scene bounds of the terrain tile) ----
tile = terrain['tiles'][0]
xs = (tile['x'], tile['x'] + (tile['columns'] - 1) * tile['step'])
zs = (tile['z'], tile['z'] + (tile['rows'] - 1) * tile['step'])
E0 = math.floor((REF['originEasting'] + xs[0] * UNIT) / STEP) * STEP
E1 = math.ceil((REF['originEasting'] + xs[1] * UNIT) / STEP) * STEP
N0 = math.floor((REF['originNorthing'] - zs[1] * UNIT) / STEP) * STEP
N1 = math.ceil((REF['originNorthing'] - zs[0] * UNIT) / STEP) * STEP
W = int((E1 - E0) / STEP); H = int((N1 - N0) / STEP)
cE = E0 + (np.arange(W) + .5) * STEP
cN = N1 - (np.arange(H) + .5) * STEP
print('grid', W, H, 'cells', W * H)

# ---- native DTM, nearest 1 m pixel at each cell centre ----
srcs = [rasterio.open(p) for p in sorted((ROOT / 'work/geodata/lantmateriet/dtm').glob('m6*.tif'))]
mos, tr = merge(srcs)
dtm_native = mos[0]
ci = np.floor((cE - tr.c) / tr.a).astype(int); ri = np.floor((cN - tr.f) / tr.e).astype(int)
okc = (ci >= 0) & (ci < dtm_native.shape[1]); okr = (ri >= 0) & (ri < dtm_native.shape[0])
D = dtm_native[np.clip(ri, 0, dtm_native.shape[0] - 1)][:, np.clip(ci, 0, dtm_native.shape[1] - 1)].astype(np.float32)
D[~okr] = np.nan; D[:, ~okc] = np.nan
nodata = srcs[0].nodata
if nodata is not None: D[D == nodata] = np.nan
del mos, dtm_native

# ---- LiDAR class 9 (mean per 2 m cell, prepared tiles; row 0 = south) ----
C9 = np.full((H, W), np.nan, np.float32)
lidar_tiles = []
for p in sorted((ROOT / 'work/geodata/lantmateriet/prepared').glob('20c*.json')):
    m = read(p); w = np.load(p.with_suffix('.npz'))['water'][::-1]
    lidar_tiles.append({'id': m['id'], 'acquired': m['acquired'], 'checksum': m['checksum']})
    b = m['bounds']; assert abs(m['nativeGridStepMetres'] - STEP) < 1e-9
    c0 = int(round((b[0] - E0) / STEP)); r0 = int(round((N1 - b[3]) / STEP))
    sr0, sc0 = max(0, -r0), max(0, -c0)
    r0c, c0c = max(r0, 0), max(c0, 0)
    hh = min(w.shape[0] - sr0, H - r0c); ww = min(w.shape[1] - sc0, W - c0c)
    if hh > 0 and ww > 0:
        C9[r0c:r0c + hh, c0c:c0c + ww] = w[sr0:sr0 + hh, sc0:sc0 + ww]

def to_px(x, z):
    return ((REF['originEasting'] + x * UNIT - E0) / STEP, (N1 - (REF['originNorthing'] - z * UNIT)) / STEP)

def to_scene(px, py):
    """Grid corner (px, py) -> scene x, z."""
    return ((E0 + px * STEP - REF['originEasting']) / UNIT, (REF['originNorthing'] - (N1 - py * STEP)) / UNIT)

def raster(poly):
    img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
    for i, ring in enumerate(poly['rings']):
        dr.polygon([to_px(x, z) for x, z in ring], fill=0 if i else 255)
    return np.asarray(img) > 0

masks = [raster(a) for a in areas]
mask = np.zeros((H, W), bool)
for m in masks: mask |= m

# ---- hydro-flattened regions of the DTM inside the water mask ----
same_r = mask[:, 1:] & mask[:, :-1] & (np.abs(D[:, 1:] - D[:, :-1]) < FLAT_TOL)
same_d = mask[1:, :] & mask[:-1, :] & (np.abs(D[1:, :] - D[:-1, :]) < FLAT_TOL)
idx = np.arange(H * W).reshape(H, W)
a1 = np.concatenate([idx[:, :-1][same_r], idx[:-1, :][same_d]])
a2 = np.concatenate([idx[:, 1:][same_r], idx[1:, :][same_d]])
_, lab = connected_components(coo_matrix((np.ones(len(a1), np.int8), (a1, a2)), shape=(H * W, H * W)), directed=False)
lab = lab.reshape(H, W).astype(np.int64); lab[~mask] = -1
ids, counts = np.unique(lab[mask], return_counts=True)
big = set(int(i) for i in ids[counts * STEP * STEP >= MIN_REACH_M2])
print('flat regions', len(ids), 'reaches', len(big))
sea_poly = int(np.argmax([m.sum() for m in masks]))

reaches = {}
def reach_info(k):
    if k in reaches: return reaches[k]
    sel = lab == k
    v = C9[sel]; v = v[np.isfinite(v)]
    dl = float(np.median(D[sel]))
    rr, cc = np.nonzero(sel)
    info = {'id': f'r{len(reaches) + 1}', 'dtmLevelMetres': round(dl, 3), 'areaM2': int(sel.sum() * STEP * STEP),
            'class9Cells': int(len(v)),
            'centre': [round(v_, 4) for v_ in to_scene(cc.mean() + .5, rr.mean() + .5)]}
    if len(v):
        info['class9Metres'] = {k_: round(float(q), 3) for k_, q in zip(('p10', 'p50', 'p90'), np.percentile(v, [10, 50, 90]))}
    if len(v) >= MIN_CLASS9_CELLS:
        info['levelMetres'] = info['class9Metres']['p50']; info['source'] = 'lidar-class9'
    else:
        info['levelMetres'] = round(dl, 3); info['source'] = 'dtm-hydroflattened'
    reaches[k] = info
    return info

# ---- per OSM polygon: single reach, split, own level or unmeasured ----
def trace(binary):
    """Outer boundary rings of a binary raster (corner coordinates), holes dropped (see pass 2)."""
    b = np.pad(binary, 1)
    edges = {}
    # directed edges with the region on the left (image y down => clockwise in image = ccw on map)
    r, c = np.nonzero(b[1:-1, 1:-1]); r += 1; c += 1
    for (dr_, dc_, e) in ((-1, 0, lambda r, c: ((c, r), (c + 1, r))),  # top edge, left->right... region below
                          (1, 0, lambda r, c: ((c + 1, r + 1), (c, r + 1))),
                          (0, -1, lambda r, c: ((c, r + 1), (c, r))),
                          (0, 1, lambda r, c: ((c + 1, r), (c + 1, r + 1)))):
        sel = ~b[r + dr_, c + dc_]
        for rr_, cc_ in zip(r[sel], c[sel]):
            s, t = e(rr_ - 1, cc_ - 1)
            edges.setdefault(s, []).append(t)
    rings = []
    while edges:
        start = next(iter(edges)); ring = [start]; cur = start; prev = None
        while True:
            outs = edges[cur]
            if len(outs) == 1: nxt = outs.pop()
            else:
                # pinch vertex: take the sharpest right turn (keeps diagonal cells separate)
                dx0, dy0 = (cur[0] - prev[0], cur[1] - prev[1]) if prev else (1, 0)
                def turn(t):
                    dx, dy = t[0] - cur[0], t[1] - cur[1]
                    return dx0 * dy - dy0 * dx
                nxt = max(outs, key=turn); outs.remove(nxt)
            if not outs: del edges[cur]
            prev, cur = cur, nxt
            if cur == start: break
            ring.append(cur)
        # merge collinear runs
        out = []
        n = len(ring)
        for i in range(n):
            p, q, s = ring[i - 1], ring[i], ring[(i + 1) % n]
            if (q[0] - p[0]) * (s[1] - q[1]) - (q[1] - p[1]) * (s[0] - q[0]) != 0: out.append(q)
        area = sum(out[i - 1][0] * out[i][1] - out[i][0] * out[i - 1][1] for i in range(len(out))) / 2
        if area > 0:  # outer rings only (image coordinates, y down: clockwise on screen)
            rings.append(out)
    return rings

def simplify(ring, tol):
    """Douglas-Peucker on a closed ring (grid corners): reach boundaries become lines, not 2 m stairs.
    The 6 m outline margin keeps the simplified region outside the OSM shoreline."""
    pts = np.asarray(ring, float)
    if len(pts) < 8: return ring
    far = int(np.argmax(((pts - pts[0]) ** 2).sum(1)))
    def dp(p):
        if len(p) < 3: return [tuple(p[0]), tuple(p[-1])]
        a, b = p[0], p[-1]; ab = b - a; L = np.hypot(*ab)
        d = np.abs(ab[0] * (p[:, 1] - a[1]) - ab[1] * (p[:, 0] - a[0])) / L if L > 1e-12 else np.hypot(*(p - a).T)
        k = int(np.argmax(d))
        if d[k] <= tol: return [tuple(a), tuple(b)]
        return dp(p[:k + 1])[:-1] + dp(p[k:])
    loop = np.vstack([pts, pts[:1]])
    out = dp(loop[:far + 1])[:-1] + dp(loop[far:])[:-1]
    return out if len(out) >= 3 else ring

polygons = []
fall_cells = [0]; draped_cells = [0]; dry_cells = [0]
stats = {'single': 0, 'split': 0, 'own': 0, 'unmeasured': 0}
for ai, (a, m) in enumerate(zip(areas, masks)):
    cells = int(m.sum())
    entry = {'area': a['id'], 'cells': cells}
    if cells == 0:
        entry['mode'] = 'unmeasured'; entry['reason'] = 'below grid resolution'; stats['unmeasured'] += 1
        polygons.append(entry); continue
    labs, cnt = np.unique(lab[m], return_counts=True)
    present = [(int(l), int(n)) for l, n in zip(labs, cnt) if int(l) in big and n >= 25]
    if not present:
        v = C9[m]; v = v[np.isfinite(v)]; d = D[m]; d = d[np.isfinite(d)]
        spread = float(np.percentile(d, 90) - np.percentile(d, 10)) if len(d) else 99
        if len(v) >= 10 and spread < 0.5:
            entry.update(mode='own', levelMetres=round(float(np.median(v)), 3), source='lidar-class9',
                         class9Cells=int(len(v)), dtmSpreadMetres=round(spread, 2))
            stats['own'] += 1
        else:
            entry.update(mode='unmeasured', class9Cells=int(len(v)), dtmSpreadMetres=round(spread, 2),
                         reason='no hydro-flattened surface (narrow or sloping water); follows the terrain')
            stats['unmeasured'] += 1
        polygons.append(entry); continue
    for l, _ in present: reach_info(l)
    # Label every cell of the polygon (dilated 6 m so the exact OSM outline lies inside) with the
    # nearest present reach; pass 2 intersects the OSM polygon with these regions.
    keep = np.isin(lab, [l for l, _ in present]) & m
    rr, cc = np.nonzero(ndimage.binary_dilation(m, iterations=3))
    r0, r1, c0, c1 = max(rr.min() - 2, 0), min(rr.max() + 3, H), max(cc.min() - 2, 0), min(cc.max() + 3, W)
    sub_keep = keep[r0:r1, c0:c1]
    _, (ir, ic) = ndimage.distance_transform_edt(~sub_keep, return_indices=True)
    sub_lab = lab[r0:r1, c0:c1][ir, ic]
    region = ndimage.binary_dilation(m[r0:r1, c0:c1], iterations=3)
    # Falls and rapids are not flat. A cell never joins a reach whose level is above its own DTM water
    # surface (+0.3 m): the step between two reaches lies at the top of the fall, not half way down it.
    sub_D = D[r0:r1, c0:c1]
    level_of = {l: reaches[l]['dtmLevelMetres'] for l, _ in present}
    lv = np.vectorize(lambda l: level_of.get(int(l), np.nan), otypes=[float])(sub_lab)
    bad = region & m[r0:r1, c0:c1] & ~sub_keep & np.isfinite(sub_D) & (lv > sub_D + FALL_TOL)
    if bad.any():
        from scipy.spatial import cKDTree
        br, bc = np.nonzero(bad)
        best = np.full(len(br), np.inf); pick = np.full(len(br), -1)
        for l, _ in present:
            ok = level_of[l] <= sub_D[br, bc] + FALL_TOL
            if not ok.any(): continue
            kr, kc = np.nonzero(sub_keep & (lab[r0:r1, c0:c1] == l))
            if len(kr) > 400000:  # large reaches: their outline is enough to find the nearest cell
                edge = sub_keep & (lab[r0:r1, c0:c1] == l) & ~ndimage.binary_erosion(sub_keep & (lab[r0:r1, c0:c1] == l))
                kr, kc = np.nonzero(edge)
            dist, _ = cKDTree(np.c_[kr, kc]).query(np.c_[br[ok], bc[ok]])
            sel = np.flatnonzero(ok)[dist < best[ok]]
            best[sel] = dist[dist < best[ok]]; pick[sel] = l
        lowest = min(present, key=lambda p: level_of[p[0]])[0]
        pick[pick < 0] = lowest
        before = sub_lab.copy()
        sub_lab[br, bc] = pick
        # Keep a reassigned cluster only where it joins the territory of its new reach (the downstream
        # side of a fall); isolated low cells (under bridges, at piers) stay with their surroundings.
        moved = np.zeros_like(bad); moved[br, bc] = True
        for l in np.unique(pick):
            comp, n_comp = ndimage.label(moved & (sub_lab == l), structure=np.ones((3, 3)))
            territory = (sub_lab == l) & ~moved & region
            touch = ndimage.binary_dilation(territory, structure=np.ones((3, 3)))
            hit = np.unique(comp[touch & (comp > 0)])
            revert = np.isin(comp, np.setdiff1d(np.arange(1, n_comp + 1), hit))
            sub_lab[revert] = before[revert]
            fall_cells[0] += int(((comp > 0) & ~revert).sum())
    # Water still far below its reach (a sloping side channel or cascade with no reach it can join)
    # has no measured level: clusters of at least 100 m2 follow the terrain like unmeasured streams.
    lv = np.vectorize(lambda l: level_of.get(int(l), np.nan), otypes=[float])(sub_lab)
    still = region & m[r0:r1, c0:c1] & ~sub_keep & np.isfinite(sub_D) & (lv > sub_D + FALL_TOL)
    comp, n_comp = ndimage.label(still, structure=np.ones((3, 3)))
    if n_comp:
        sizes = ndimage.sum(still, comp, index=np.arange(1, n_comp + 1))
        draped = np.isin(comp, np.flatnonzero(sizes >= 100 / STEP / STEP) + 1)
        # The draped part keeps its 6 m margin over the OSM outline, like the reach regions.
        draped |= ndimage.binary_dilation(draped, iterations=3) & region & ~m[r0:r1, c0:c1]
        sub_lab[draped] = DRAPED; draped_cells[0] += int(draped.sum())
    # Dry banks: OSM water polygons often include the sloping banks above the water. Cells whose DTM is
    # more than DRY_TOL above their reach, in clusters wider than ~4 m (opening), of at least 50 m2 and
    # touching the polygon outline, are land: the shoreline there is where the DTM meets the water.
    # Narrow offsets between the OSM outline and a quay wall stay water (vertical quay face).
    lv = np.vectorize(lambda l: level_of.get(int(l), np.nan), otypes=[float])(sub_lab)
    m_sub = m[r0:r1, c0:c1]
    above = m_sub & np.isfinite(sub_D) & np.isfinite(lv) & (sub_D > lv + DRY_TOL)
    # A sloping channel (a stream rising inland from its reach) fills the polygon from bank to bank: its
    # border is mostly the polygon outline, hardly any water at the reach level. It follows the terrain.
    at_level = m_sub & np.isfinite(sub_D) & np.isfinite(lv) & (np.abs(sub_D - lv) <= DRY_TOL)
    comp, n_comp = ndimage.label(above, structure=np.ones((3, 3)))
    for k, sl in enumerate(ndimage.find_objects(comp), start=1):
        if sl is None: continue
        sl = tuple(slice(max(s.start - 1, 0), s.stop + 1) for s in sl)
        part = comp[sl] == k
        if part.sum() < 100 / STEP / STEP: continue
        border = ndimage.binary_dilation(part, structure=np.ones((3, 3))) & ~part
        if (border & at_level[sl]).sum() < 0.25 * (border & ~m_sub[sl]).sum():
            sub_lab[sl][part] = DRAPED; above[sl][part] = False; draped_cells[0] += int(part.sum())
    dry = above
    dry = ndimage.binary_opening(dry, structure=np.ones((3, 3)))
    comp, n_comp = ndimage.label(dry, structure=np.ones((3, 3)))
    if n_comp:
        sizes = ndimage.sum(dry, comp, index=np.arange(1, n_comp + 1))
        rim = ndimage.binary_dilation(~m_sub, structure=np.ones((3, 3)), iterations=2)
        touching = np.unique(comp[rim & (comp > 0)])
        ok = np.intersect1d(np.flatnonzero(sizes >= 50 / STEP / STEP) + 1, touching)
        dry = np.isin(comp, ok)
        dry |= ndimage.binary_dilation(dry, iterations=3) & region & ~m_sub
        sub_lab[dry] = DRY; dry_cells[0] += int((dry & m_sub).sum())
    labels = [l for l, _ in present if (region & (sub_lab == l)).any()] + [x for x in (DRAPED, DRY) if (sub_lab[region] == x).any()]
    if len(labels) == 1 and labels[0] != DRAPED:
        entry.update(mode='single', reach=reaches[labels[0]]['id']); stats['single'] += 1
        polygons.append(entry); continue
    pieces = []
    for l in labels:
        rings = [simplify(r, SIMPLIFY_CELLS) for r in trace(region & (sub_lab == l))]
        pieces.append({'reach': 'draped' if l == DRAPED else 'dry' if l == DRY else reaches[l]['id'],
                       'rings': [[[round(v_, 5) for v_ in to_scene(c0 + px, r0 + py)] for px, py in ring] for ring in rings]})
    entry.update(mode='split', pieces=pieces); stats['split'] += 1
    polygons.append(entry)

# Sea: flat regions of the largest water polygon below SEA_MAX share the mean sea level.
sea_ids = set()
labs = np.unique(lab[masks[sea_poly]])
for l in labs:
    l = int(l)
    if l in reaches and reaches[l]['dtmLevelMetres'] < SEA_MAX:
        r = reaches[l]
        r['scanDayMetres'] = r['levelMetres']; r['scanDaySource'] = r['source']
        r['levelMetres'] = SEA_LEVEL; r['source'] = 'sea-smhi-mean-2021-2025'
        sea_ids.add(r['id'])
print(stats, 'sea reaches', sorted(sea_ids), 'fall cells reassigned', fall_cells[0], 'draped cells', draped_cells[0], 'dry cells', dry_cells[0])
raw = {
    'sources': {
        'dtm': 'Lantmäteriet Markhöjdmodell Nedladdning 1 m (EPSG:5845, RH2000), hydro-flattened over water',
        'lidar': 'Lantmäteriet Laserdata Nedladdning, class 9 (water) mean per 2 m cell, flight 2020',
        'lidarTiles': lidar_tiles,
        'sea': 'SMHI ocobs Juten-Djurökvarn (35101), mean 2021-2025 = +0.14 m RH2000',
    },
    'parameters': {'gridMetres': STEP, 'flatToleranceMetres': FLAT_TOL, 'minReachM2': MIN_REACH_M2,
                   'minClass9Cells': MIN_CLASS9_CELLS, 'seaLevelMetres': SEA_LEVEL, 'seaBelowMetres': SEA_MAX},
    'reaches': sorted(reaches.values(), key=lambda r: int(r['id'][1:])),
    'polygons': polygons,
}
(OUT / 'raw.json').write_text(json.dumps(raw, separators=(',', ':')), encoding='utf8')
print('wrote', OUT / 'raw.json', 'reaches', len(reaches))
