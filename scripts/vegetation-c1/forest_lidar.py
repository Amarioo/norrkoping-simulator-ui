"""Phase C1 (Vrinneviskogen vegetation): trees of 250 m tiles measured from the LiDAR.

Tiles: every 250 m square that the northern trail loop passes (within TRAIL_BUFFER_M of it) and that
lies at least MIN_RESERVE_SHARE inside the reserve and wholly inside the map (the user's decision of
2026-11-13: roll the pilot out around the loop). Only ground inside the reserve and outside buildings
is measured.

Sources
  - Lantmäteriet point cloud "Laserdata NH 2020" (STAC collection dsm-skoglig-copc, 2020),
    ©Lantmäteriet, CC BY 4.0. Raw tiles stay local in work/geodata/lantmateriet/.
  - Reserve outline (only for the statistics in `reserve`): OpenStreetMap way/102865465 version 13
    ("Vrinneviskogen Naturreservat", source tag: Länsstyrelsen i Östergötlands län), © OpenStreetMap
    contributors, ODbL-1.0, fetched 2026-11-13 (OSM base 2026-11-13T15:32:20Z); stored in
    scripts/vegetation-c1/reserve-osm.json. Also the limit of what is measured.
  - Trail loop (only to choose the tiles; its alignment is NOT verified against the municipality's
    2.4 km illuminated loop, see docs/step62/vrinneviskogen-plan.md): OpenStreetMap relation/5703856
    version 2 (route=running, colour=black), ODbL-1.0, fetched 2026-11-13 (OSM base
    2026-11-13T16:49:35Z); stored in scripts/vegetation-c1/trail-osm.json.
  - Buildings (masked out): the runtime map's OSM buildings, widened by BUILDING_MARGIN_M.
  - Map clip: src/lib/data/norrkoping-map.json meta.clip.

Method (the tile plus a BUFFER_M margin, so trees at the edge are found like the others)
  1. Ground: mean of the class-2 (ground) returns per 1 m cell; empty cells take the nearest cell;
     smoothed (Gaussian, 1 m).
  2. Canopy height model (CHM), 1 m cells: highest return that is not ground, noise (7, 18) or water
     (9), minus the ground. Cells without such a return take the highest of their 8 neighbours, else 0.
     Cells outside the reserve or on a building (plus margin) are set to 0: nothing is measured there.
  3. Tree tops: local maxima of the smoothed CHM (Gaussian SMOOTH_M) at least MIN_TREE_M high. Taken
     from the tallest down; a top is dropped when a taller accepted top lies within
     WINDOW_A + WINDOW_B × height metres. A tree's height is the highest unsmoothed CHM cell within
     1 m of its top.
  4. Crowns: watershed of the smoothed CHM from the tops; a tree's crown is its cells at least
     CROWN_CUT × its height high. Crown radius = radius of the circle with the crown's area.
  5. Crown base: the 10th percentile of the heights of the returns ≥ 1.5 m above ground inside the
     crown, limited to 20–80 % of the tree height. With fewer than MIN_BASE_RETURNS returns it is
     0.5 × height and the tree is flagged (flag 1).
  A tree belongs to the tile when its top lies inside the tile.
  6. Canopy mask (the forest floor): FLOOR_CELL_M cells of the tile in which at least FLOOR_SHARE of
     the 1 m CHM cells are CANOPY_MIN_M high or more. Rows run from north to south, characters from
     west to east, "1" = under canopy.

What is measured and what is not
  - DERIVED from the LiDAR: top position (≈ ±1 m: 1 m cells, 2–3 returns per m²), height (top
    return minus ground, ≈ ±0.5 m, tends to be a little low because a pulse rarely hits the very
    tip), crown area.
  - Method assumptions (not properties of the forest): the window and cut constants below. In dense
    stands neighbouring crowns merge into one top and small trees under the canopy are not seen, so
    the count is a count of visible tree tops, not of stems.
  - NOT measured: species, trunk diameter, the stem's position under a leaning or wide crown. The
    scan is from 2020; storm damage or felling since then is not in the data.

Frame: SWEREF 99 TM (EPSG:3006) metres. Heights are metres above the LiDAR ground at the tree
(the runtime puts the stem on the rendered ground). Scene transform: map meta.reference
(scene = (SWEREF − origin) / (25 · k), x east, z south).

Output (deterministic: no timestamps, no machine paths, fixed rounding, sorted)
  src/lib/data/forest-c1.json
  [optional] a contact sheet PNG (CHM, tree tops, crown radii)

Usage (codex-runtimes Python 3.12, see docs/claude-progress.md):
  python scripts/vegetation-c1/forest_lidar.py <out.json> [sheet.png]
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/geo'))
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
from lidar_window import points, tiles  # noqa: E402
import numpy as np  # noqa: E402
from scipy import ndimage  # noqa: E402

VERSION = 'forest-c1-v2'
TILE_M = 250
# The pilot tile (v1), the first evidence of the method; select_tiles() must include it.
PILOT_TILE = (569250, 6492500)
TRAIL_BUFFER_M = 60
MIN_RESERVE_SHARE = 0.1
BUILDING_MARGIN_M = 2
BUFFER_M = 15
CELL_M = 1.0
SMOOTH_M = 1.0
MIN_TREE_M = 3.0
WINDOW_A, WINDOW_B = 1.2, 0.07
CROWN_CUT = 0.35
CANOPY_MIN_M = 2.0
BASE_MIN_RETURN_M = 1.5
MIN_BASE_RETURNS = 5
RADIUS_LIMIT_M = (0.8, 8.0)
EXCLUDED = (7, 9, 18)
FLOOR_CELL_M = 5
FLOOR_SHARE = 0.5


def r(x, n=1):
    return round(float(x), n)


def inside(px, py, ring):
    c = np.zeros(px.shape, bool)
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        if y0 == y1:
            continue
        c ^= ((y0 > py) != (y1 > py)) & (px < (x1 - x0) * (py - y0) / (y1 - y0) + x0)
    return c


_GEO = None


def geo():
    """Reserve ring, trail segments, building rings and map clip in SWEREF 99 TM (loaded once)."""
    global _GEO
    if _GEO is None:
        from pyproj import Transformer
        t = Transformer.from_crs(4326, 3006, always_xy=True)
        way = json.loads((ROOT / 'scripts/vegetation-c1/reserve-osm.json').read_text('utf8'))['elements'][0]
        ring = [t.transform(g['lon'], g['lat']) for g in way['geometry']]
        rel = json.loads((ROOT / 'scripts/vegetation-c1/trail-osm.json').read_text('utf8'))['elements'][0]
        trail = []
        for member in rel['members']:
            pts = [t.transform(g['lon'], g['lat']) for g in member.get('geometry', [])]
            trail += list(zip(pts[:-1], pts[1:]))
        m = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text('utf8'))
        ref = m['meta']['reference']
        u = ref['metresPerUnit'] * ref['gridScaleFactor']
        sw = lambda x, z: (ref['originEasting'] + x * u, ref['originNorthing'] - z * u)
        buildings = []
        for b in m['buildings']:
            rr = [sw(x, z) for x, z in b['rings'][0]]
            if rr[0] != rr[-1]:
                rr.append(rr[0])
            buildings.append(rr)
        clip = [sw(x, z) for x, z in m['meta']['clip']]
        _GEO = {'ring': ring, 'trail': trail, 'buildings': buildings, 'clip': clip}
    return _GEO


def trail_length():
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in geo()['trail'])


def select_tiles():
    """South-west corners of the tiles along the trail loop, sorted by (N, E)."""
    g = geo()
    ax = np.array([a[0] for a, _ in g['trail']])
    ay = np.array([a[1] for a, _ in g['trail']])
    bx = np.array([b[0] for _, b in g['trail']])
    by = np.array([b[1] for _, b in g['trail']])
    xs = np.concatenate([ax, bx])
    ys = np.concatenate([ay, by])
    lo = lambda v: int(math.floor((v - TRAIL_BUFFER_M) / TILE_M)) * TILE_M
    out = []
    sample = (np.arange(50) + 0.5) * (TILE_M / 50)
    for n0 in range(lo(ys.min()), int(ys.max() + TRAIL_BUFFER_M) + 1, TILE_M):
        for e0 in range(lo(xs.min()), int(xs.max() + TRAIL_BUFFER_M) + 1, TILE_M):
            # Distance from the tile rectangle to points along each trail segment (11 per segment).
            near = False
            for k in range(11):
                px = ax + (bx - ax) * k / 10
                py = ay + (by - ay) * k / 10
                dx = np.maximum(np.maximum(e0 - px, px - (e0 + TILE_M)), 0)
                dy = np.maximum(np.maximum(n0 - py, py - (n0 + TILE_M)), 0)
                if (np.hypot(dx, dy) <= TRAIL_BUFFER_M).any():
                    near = True
                    break
            if not near:
                continue
            X, Y = np.meshgrid(e0 + sample, n0 + sample)
            if inside(X, Y, g['ring']).mean() < MIN_RESERVE_SHARE:
                continue
            if not inside(X, Y, g['clip']).all():
                continue
            out.append((e0, n0))
    if PILOT_TILE not in out:
        raise SystemExit('the pilot tile is not among the selected tiles')
    return out


def allowed_mask(w0, s0, size):
    """Cells inside the reserve and not on a building (plus margin); also the two parts."""
    g = geo()
    X, Y = np.meshgrid(w0 + (np.arange(size) + 0.5) * CELL_M, s0 + (np.arange(size) + 0.5) * CELL_M)
    ok = inside(X, Y, g['ring'])
    built = np.zeros(ok.shape, bool)
    e1, n1 = w0 + size * CELL_M, s0 + size * CELL_M
    for rr in g['buildings']:
        bx = [q[0] for q in rr]
        by = [q[1] for q in rr]
        if max(bx) < w0 or min(bx) > e1 or max(by) < s0 or min(by) > n1:
            continue
        built |= inside(X, Y, rr)
    if built.any():
        built = ndimage.binary_dilation(built, iterations=int(round(BUILDING_MARGIN_M / CELL_M)))
    return ok & ~built, ok, built


def measure(e0, n0):
    """Trees of the tile with south-west corner (e0, n0): list of [E, N, height, radius, base, flag]."""
    b = BUFFER_M
    w0, s0 = e0 - b, n0 - b
    size = int((TILE_M + 2 * b) / CELL_M)
    E, N, Z, C = points(w0, s0, w0 + size * CELL_M, s0 + size * CELL_M)
    ix = ((E - w0) / CELL_M).astype(int)
    iy = ((N - s0) / CELL_M).astype(int)
    k = iy * size + ix
    # 1. ground
    gm = C == 2
    total = np.bincount(k[gm], Z[gm], size * size)
    count = np.bincount(k[gm], minlength=size * size)
    ground = np.where(count > 0, total / np.maximum(count, 1), np.nan).reshape(size, size)
    missing = np.isnan(ground)
    idx = ndimage.distance_transform_edt(missing, return_distances=False, return_indices=True)
    ground = ndimage.gaussian_filter(ground[tuple(idx)], 1.0 / CELL_M, mode='nearest')
    # 2. canopy height model
    vm = ~gm & ~np.isin(C, EXCLUDED)
    top = np.full(size * size, -np.inf)
    np.maximum.at(top, k[vm], Z[vm])
    top = top.reshape(size, size)
    filled = ndimage.maximum_filter(top, 3, mode='nearest')
    top = np.where(np.isfinite(top), top, filled)
    chm = np.where(np.isfinite(top), top - ground, 0.0).clip(0, None)
    allowed, in_reserve, built = allowed_mask(w0, s0, size)
    chm[~allowed] = 0.0
    smooth = ndimage.gaussian_filter(chm, SMOOTH_M / CELL_M, mode='nearest')
    smooth[~allowed] = 0.0
    # 3. tree tops, tallest first
    peak = (smooth == ndimage.maximum_filter(smooth, 3, mode='nearest')) & (smooth >= MIN_TREE_M)
    py, px = np.nonzero(peak)
    order = np.lexsort((px, py, -smooth[py, px]))
    accepted = []
    bins = {}
    reach = int(math.ceil((WINDOW_A + WINDOW_B * 60) / 4)) + 1
    for i in order:
        y, x, h = int(py[i]), int(px[i]), float(smooth[py[i], px[i]])
        by, bx = y // 4, x // 4
        clash = False
        for yy in range(by - reach, by + reach + 1):
            for xx in range(bx - reach, bx + reach + 1):
                for ay, ax, ah in bins.get((yy, xx), ()):
                    if math.hypot(ay - y, ax - x) * CELL_M < WINDOW_A + WINDOW_B * ah:
                        clash = True
        if clash:
            continue
        accepted.append((y, x, h))
        bins.setdefault((by, bx), []).append((y, x, h))
    # 4. crowns
    markers = np.zeros((size, size), np.int32)
    for n, (y, x, _) in enumerate(accepted):
        markers[y, x] = n + 1
    markers[smooth < CANOPY_MIN_M] = -1
    cost = ((smooth.max() - smooth) * 100).round().astype(np.uint16)
    labels = ndimage.watershed_ift(cost, markers, structure=np.ones((3, 3), int))
    raw_max = ndimage.maximum_filter(chm, 3, mode='nearest')
    hag = Z - ground[iy, ix]
    veg = vm & (hag >= BASE_MIN_RETURN_M)
    point_label = labels[iy[veg], ix[veg]]
    point_height = hag[veg]
    by_label = np.argsort(point_label, kind='stable')
    starts = np.searchsorted(point_label[by_label], np.arange(1, len(accepted) + 2))
    trees = []
    for n, (y, x, h_smooth) in enumerate(accepted):
        e, nn = w0 + (x + 0.5) * CELL_M, s0 + (y + 0.5) * CELL_M
        if not (e0 <= e < e0 + TILE_M and n0 <= nn < n0 + TILE_M):
            continue
        height = float(raw_max[y, x])
        crown = (labels == n + 1) & (smooth >= CROWN_CUT * height)
        area = float(crown.sum()) * CELL_M * CELL_M
        radius = min(max(math.sqrt(area / math.pi), RADIUS_LIMIT_M[0]), RADIUS_LIMIT_M[1])
        sel = by_label[starts[n]:starts[n + 1]]
        inside_crown = crown[iy[veg][sel], ix[veg][sel]]
        heights = point_height[sel][inside_crown]
        if len(heights) >= MIN_BASE_RETURNS:
            base, flag = float(np.percentile(heights, 10)), 0
            base = min(max(base, 0.2 * height), 0.8 * height)
        else:
            base, flag = 0.5 * height, 1
        trees.append([r(e), r(nn), r(height), r(radius), r(base), flag])
    trees.sort(key=lambda t: (t[1], t[0]))
    core = slice(b, b + TILE_M)
    c = chm[core, core]
    stats = {
        'returns': int(((E >= e0) & (E < e0 + TILE_M) & (N >= n0) & (N < n0 + TILE_M)).sum()),
        'canopyShareAbove2m': r((c >= 2).mean(), 3),
        'canopyShareAbove5m': r((c >= 5).mean(), 3),
        'canopyHeightP50': r(np.percentile(c[c >= 2], 50)) if (c >= 2).any() else 0.0,
        'canopyHeightP90': r(np.percentile(c[c >= 2], 90)) if (c >= 2).any() else 0.0,
        'canopyHeightMax': r(c.max()),
        'reserveShare': r(in_reserve[core, core].mean(), 3),
        'buildingShare': r((built & in_reserve)[core, core].mean(), 3),
    }
    f = int(FLOOR_CELL_M / CELL_M)
    share = (c >= CANOPY_MIN_M).reshape(TILE_M // FLOOR_CELL_M, f, TILE_M // FLOOR_CELL_M, f).mean(axis=(1, 3))
    rows = [''.join('1' if v >= FLOOR_SHARE else '0' for v in row) for row in share[::-1]]
    stats['canopyMaskShare'] = r((share >= FLOOR_SHARE).mean(), 3)
    return trees, stats, (chm, smooth, w0, s0, size), rows


def reserve_stats():
    """Share of the reserve inside the map clip, and its canopy, on a 4 m grid of the LiDAR."""
    ring = geo()['ring']
    m = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text('utf8'))['meta']
    ref = m['reference']
    u = ref['metresPerUnit'] * ref['gridScaleFactor']
    clip = [(ref['originEasting'] + x * u, ref['originNorthing'] - z * u) for x, z in m['clip']]
    s = 4.0
    ra = np.array(ring)
    w0, s0 = np.floor(ra.min(0) / 100) * 100
    e1, n1 = np.ceil(ra.max(0) / 100) * 100
    W, H = int((e1 - w0) / s), int((n1 - s0) / s)
    X, Y = np.meshgrid(w0 + (np.arange(W) + 0.5) * s, s0 + (np.arange(H) + 0.5) * s)
    in_reserve, in_map = inside(X, Y, ring), inside(X, Y, clip)
    E, N, Z, C = points(w0, s0, e1, n1)
    k = ((N - s0) / s).astype(int) * W + ((E - w0) / s).astype(int)
    ground = np.full(W * H, np.inf)
    np.minimum.at(ground, k[C == 2], Z[C == 2])
    top = np.full(W * H, -np.inf)
    vm = ~np.isin(C, EXCLUDED)
    np.maximum.at(top, k[vm], Z[vm])
    ground = ground.reshape(H, W)
    idx = ndimage.distance_transform_edt(~np.isfinite(ground), return_distances=False, return_indices=True)
    ground = ground[tuple(idx)]
    chm = np.where(np.isfinite(top.reshape(H, W)), top.reshape(H, W) - ground, 0.0).clip(0, None)
    ha = lambda mask: r(mask.sum() * s * s / 1e4)
    shoelace = abs(sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1))) / 2
    return {
        'source': 'OpenStreetMap way/102865465 v13 (source tag: Länsstyrelsen i Östergötlands län), ODbL-1.0, OSM base 2026-11-13T15:32:20Z',
        'areaHa': r(shoelace / 1e4),
        'insideMapHa': ha(in_reserve & in_map),
        'outsideMapHa': ha(in_reserve & ~in_map),
        'outsideMapShare': r((in_reserve & ~in_map).sum() / in_reserve.sum(), 3),
        'southernmostNorthing': r(ra[:, 1].min(), 0),
        'lidarSouthLimitNorthing': min(t[1] for t in tiles()),
        'canopyShareAbove5m': r((chm[in_reserve] >= 5).mean(), 3),
        'canopyShareAbove5mInsideMap': r((chm[in_reserve & in_map] >= 5).mean(), 3),
        'canopyHeightP50': r(np.percentile(chm[in_reserve & (chm >= 2)], 50)),
        'canopyHeightP90': r(np.percentile(chm[in_reserve & (chm >= 2)], 90)),
        'gridM': s,
    }


def sheet(path, grids, all_trees):
    """One map of all tiles: canopy height, tree tops (red), crown circles, the reserve (yellow),
    the trail loop (white) and the tile grid."""
    from PIL import Image, ImageDraw
    scale = 2
    g = geo()
    es = [e for e, _ in grids]
    ns = [n for _, n in grids]
    w0, s0, e1, n1 = min(es), min(ns), max(es) + TILE_M, max(ns) + TILE_M
    out = Image.new('RGB', (int((e1 - w0) * scale), int((n1 - s0) * scale)), (30, 30, 30))
    P = lambda e, n: ((e - w0) * scale, (n1 - n) * scale)
    for (e0, n0), (chm, _, _, _, size) in grids.items():
        core = chm[BUFFER_M:BUFFER_M + TILE_M, BUFFER_M:BUFFER_M + TILE_M]
        v = (core / 30).clip(0, 1)
        img = np.zeros((TILE_M, TILE_M, 3), np.uint8)
        img[..., 0] = (40 + 60 * v).astype(np.uint8)
        img[..., 1] = (50 + 190 * v).astype(np.uint8)
        img[..., 2] = (40 + 30 * v).astype(np.uint8)
        img[core < CANOPY_MIN_M] = (92, 80, 66)
        im = Image.fromarray(img[::-1]).resize((TILE_M * scale, TILE_M * scale), Image.NEAREST)
        out.paste(im, tuple(int(q) for q in P(e0, n0 + TILE_M)))
    d = ImageDraw.Draw(out)
    for (e0, n0), trees in all_trees.items():
        for e, n, h, rad, base, flag in trees:
            x, y = P(e, n)
            q = rad * scale
            d.ellipse([x - q, y - q, x + q, y + q], outline=(255, 230, 120) if not flag else (255, 120, 120))
            d.point((x, y), fill=(255, 40, 40))
        d.rectangle([P(e0, n0 + TILE_M), P(e0 + TILE_M, n0)], outline=(200, 200, 200))
    d.line([P(e, n) for e, n in g['ring']], fill=(255, 255, 0), width=2)
    for (ax, ay), (bx, by) in g['trail']:
        d.line([P(ax, ay), P(bx, by)], fill=(255, 255, 255), width=2)
    out.save(path)


def main(out, sheet_path=None):
    tile_out, grids, all_trees = [], {}, {}
    used = set()
    for e0, n0 in select_tiles():
        trees, stats, grid, rows = measure(e0, n0)
        grids[(e0, n0)], all_trees[(e0, n0)] = grid, trees
        b = BUFFER_M
        for te0, tn0, te1, tn1, path in tiles():
            if te1 > e0 - b and te0 < e0 + TILE_M + b and tn1 > n0 - b and tn0 < n0 + TILE_M + b:
                used.add(path.name)
        heights = np.array([t[2] for t in trees] or [0.0])
        stats.update({
            'trees': len(trees),
            'treesPerHa': r(len(trees) / (TILE_M * TILE_M / 1e4)),
            'treeHeightP10': r(np.percentile(heights, 10)),
            'treeHeightP50': r(np.percentile(heights, 50)),
            'treeHeightP90': r(np.percentile(heights, 90)),
            'treeHeightMax': r(heights.max()),
            'crownRadiusP50': r(np.percentile([t[3] for t in trees] or [0.0], 50)),
            'crownBaseEstimated': int(sum(t[5] for t in trees)),
        })
        tile_out.append({
            'e0': e0, 'n0': n0, 'sizeM': TILE_M, 'stats': stats, 'trees': trees,
            'canopyMask': {'cellM': FLOOR_CELL_M, 'minShare': FLOOR_SHARE, 'rows': rows},
        })
    data = {
        'version': VERSION,
        'crs': 'EPSG:3006',
        'heights': 'metres above the LiDAR ground at the tree',
        'source': {
            'name': 'Lantmäteriet Laserdata NH 2020 (STAC dsm-skoglig-copc)',
            'licence': 'CC BY 4.0, ©Lantmäteriet',
            'acquired': '2020',
            'tiles': sorted(used),
        },
        'method': {
            'cellM': CELL_M, 'smoothM': SMOOTH_M, 'minTreeM': MIN_TREE_M,
            'windowM': f'{WINDOW_A} + {WINDOW_B} × height', 'crownCut': CROWN_CUT,
            'canopyMinM': CANOPY_MIN_M, 'bufferM': BUFFER_M,
            'crownBase': f'p10 of returns ≥ {BASE_MIN_RETURN_M} m in the crown, 20–80 % of height; flag 1 = fewer than {MIN_BASE_RETURNS} returns, 0.5 × height (estimate)',
        },
        'selection': {
            'rule': f'250 m tiles within {TRAIL_BUFFER_M} m of the trail loop, at least {MIN_RESERVE_SHARE:.0%} inside the reserve, wholly inside the map',
            'trail': 'OpenStreetMap relation/5703856 v2 (route=running, colour=black), ODbL-1.0, OSM base 2026-11-13T16:49:35Z; alignment not verified against the municipal 2.4 km loop',
            'trailLengthM': r(trail_length(), 0),
            'pilotTile': list(PILOT_TILE),
            'measuredOnlyInsideReserve': True,
            'buildingMarginM': BUILDING_MARGIN_M,
        },
        'treeFields': ['E', 'N', 'heightM', 'crownRadiusM', 'crownBaseM', 'flag'],
        'kinds': {
            'derivedFromLidar': ['E', 'N', 'heightM', 'crownRadiusM', 'crownBaseM (flag 0)', 'canopyMask'],
            'estimate': ['crownBaseM (flag 1)'],
            'notMeasured': ['species', 'trunk diameter', 'changes after 2020'],
        },
        'reserve': reserve_stats(),
        'tiles': tile_out,
    }
    text = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n'
    Path(out).write_text(text, encoding='utf8', newline='\n')
    if sheet_path:
        sheet(sheet_path, grids, all_trees)
    print(json.dumps({'reserve': data['reserve'], 'tiles': [t['stats'] for t in tile_out]}, indent=1))


if __name__ == '__main__':
    main(*sys.argv[1:3])
