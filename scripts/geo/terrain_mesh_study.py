"""Step 3 study: rendered terrain surface vs every native Lantmäteriet 1 m DTM pixel in the map.

Compares the current 10 m / 40 m mesh (terrain.ts surfaceHeight) with uniform and adaptive RTIN
meshes (scripts/geo/rtin.py) at every native pixel centre inside the map bounds, per category:
land, water, roads, paths, rail corridors, tram streets, building footprints, river banks, steep
ground, Industrilandskapet + Campus, and the central and outer zones.

Usage (Python 3.12 + numpy, rasterio, scipy; see work/geodata/python):
  python scripts/geo/terrain_mesh_study.py            # pass 1 (split errors) + pass 2 (stats)
Outputs work/terrain-step3/study.json and the node error grid work/terrain-step3/node-error.npy,
which scripts/prepare-terrain-mesh.py reuses when it is newer than the inputs.
"""
import json, math, sys, time
from pathlib import Path
from multiprocessing import Pool
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import rtin

OUT = ROOT / 'work/terrain-step3'
CACHE = ROOT / 'work/geodata/lantmateriet/step3'
DEPTH = 6                      # root cells 2^6 x 5 m = 320 m
BAND_ROWS = 128
# Industrilandskapet + Campus validation area (same box as the 2026-10-18 audit), SWEREF 99 TM.
TEST_BOX = (568150, 6494800, 569300, 6495500)
BITS = dict(water=1, road=2, path=4, rail=8, tram=16, building=32, bank=64, urban=128, builtUp=256, track=512)
# Step 5: the track bed of at-grade railways (±TRACK_HALF m around each rail segment) is its own error class
# with a tight tolerance. In the 15 m rail corridor ('feature', 0.75 m) a triangle reaching onto a bank beside a
# level track bed lifted the drawn track 0.75 m (Pendeln, E 565 795 N 6 497 442: 4.1 % for the train).
TRACK_HALF = 2.5
BUILT_UP_METRES = 30   # built-up area: within this distance of a mapped building footprint
URBAN = ('residential', 'industrial', 'square', 'pitch', 'apron', 'grass', 'cemetery')
# Error classes of the split criterion (each propagated separately; a node splits if any class
# exceeds its tolerance). feature = road/path/tram surfaces, rail corridors, building footprints and
# 10 m either side of every shoreline; built-up = within BUILT_UP_METRES of a building footprint;
# landBuiltUp = other land in the built-up area; urban = built-up land cover elsewhere; open = other
# land; water = open water.
CLASSES = ('featureBuiltUp', 'feature', 'landBuiltUp', 'urban', 'open', 'water', 'track')
# Batch B study (MESH_NETWORK_CLASS=1, inherited by the worker processes): road and tram running
# surfaces get their own class 'network' (they leave featureBuiltUp/feature), so their split error can
# be bounded separately. Outputs go to work/batchB/mesh; the Step 3 caches are not touched.
NETWORK_CLASS = __import__('os').environ.get('MESH_NETWORK_CLASS') == '1'
if NETWORK_CLASS:
    OUT = ROOT / 'work/batchB/mesh'
    CLASSES = ('network',) + CLASSES


def error_class(cats):
    """Index into CLASSES; `cats` includes the builtUp bit (pixels() / with_built_up())."""
    feature = (cats & (BITS['road'] | BITS['path'] | BITS['rail'] | BITS['tram'] | BITS['building'] | BITS['bank'])) > 0
    built = (cats & BITS['builtUp']) > 0
    water = ((cats & BITS['water']) > 0) & ~feature
    urban = ((cats & BITS['urban']) > 0) & ~feature & ~water
    track = ((cats & BITS['track']) > 0) & ((cats & BITS['water']) == 0)
    if NETWORK_CLASS:
        network = (cats & (BITS['road'] | BITS['tram'])) > 0
        return np.select([track, network, feature & built, feature, water, built, urban], [7, 0, 1, 2, 6, 3, 4], 5)
    return np.select([track, feature & built, feature, water, built, urban], [6, 0, 1, 5, 2, 3], 4)


def map_hash():
    import hashlib
    return hashlib.sha256((ROOT / 'src/lib/data/norrkoping-map.json').read_bytes()).hexdigest()[:12]


def running_lines():
    """OSM ways of running lines: railway=rail without a service tag (siding, spur, yard, crossover), from
    scripts/data/norrkoping-railway-tags-source.json. Sidings and yards carry no simulated vehicle."""
    tags = json.loads((ROOT / 'scripts/data/norrkoping-railway-tags-source.json').read_text(encoding='utf8'))
    return {e['id'] for e in tags['elements'] if not (e.get('tags') or {}).get('service')}


def track_mask(ref, info, city):
    """Bool mask of the at-grade running-line track bed (TRACK_HALF either side of each rail), cached."""
    path = CACHE / f'track-running-{TRACK_HALF}-{map_hash()}.npy'
    lines = running_lines()
    if path.exists():
        return np.load(path, mmap_mode='r')
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    unit = ref['metresPerUnit'] * ref['gridScaleFactor']
    tm = lambda p: (ref['originEasting'] + p[0] * unit, ref['originNorthing'] - p[1] * unit)
    shapes = []
    for r in city['roads']:
        if r['kind'] != 'rail' or r.get('bridge') or r.get('tunnel') or r.get('way') not in lines:
            continue
        (ax, az), (bx, bz) = r['a'], r['b']
        L = math.hypot(bx - ax, bz - az)
        if L < 1e-6:
            continue
        w = TRACK_HALF / unit
        nx, nz = -(bz - az) / L * w, (bx - ax) / L * w
        shapes.append(({'type': 'Polygon', 'coordinates': [[tm(p) for p in ((ax + nx, az + nz), (bx + nx, bz + nz), (bx - nx, bz - nz), (ax - nx, az - nz), (ax + nx, az + nz))]]}, 1))
    mask = rasterize(shapes, out_shape=tuple(info['shape']), transform=from_origin(info['left'], info['top'], 1, 1), fill=0, dtype='uint8')
    np.save(path, mask)
    return np.load(path, mmap_mode='r')


def built_up(cats):
    """Bool mask of the built-up area (cached): building pixels dilated by BUILT_UP_METRES."""
    path = CACHE / f'built-up-{BUILT_UP_METRES}-{map_hash()}.npy'
    if path.exists():
        return np.load(path, mmap_mode='r')
    from scipy.ndimage import maximum_filter
    building = (np.asarray(cats) & BITS['building']) > 0
    mask = maximum_filter(building.astype(np.uint8), size=2 * BUILT_UP_METRES + 1) > 0
    np.save(path, mask)
    return np.load(path, mmap_mode='r')


def with_built_up(cats, built):
    return np.asarray(cats).astype(np.uint16) | (np.asarray(built).astype(np.uint16) << 8)


def inputs_key():
    """Hash of everything the split errors depend on besides the grid: the map (classes are burned from
    it) and the DTM corrections (scripts/geo/dtm_corrections.py). Step 5: the class cache was keyed by a
    fixed name, so 112 rail segments unflagged as invented bridges in the geometry pass kept the coarse
    land tolerance and the Pendeln embankment at E 567 423 N 6 497 104 stayed 1.5 m low in the mesh."""
    import hashlib
    h = hashlib.sha256((ROOT / 'src/lib/data/norrkoping-map.json').read_bytes())
    h.update((ROOT / 'scripts/data/dtm-retained-decks.json').read_bytes())
    h.update((ROOT / 'scripts/geo/dtm_corrections.py').read_bytes())
    h.update(Path(__file__).read_bytes())          # error classes
    h.update((ROOT / 'scripts/data/norrkoping-railway-tags-source.json').read_bytes())   # running lines
    return h.hexdigest()[:16]


def setup():
    terrain = rtin.read(ROOT / 'src/lib/data/terrain.json')
    tile, g = rtin.load_grid(terrain)
    ref = terrain['reference']
    return terrain, tile, g, ref


def mosaic(ref, bounds):
    """Native 1 m mosaic over the map bounds (cached .npy + affine)."""
    import rasterio
    from rasterio.merge import merge
    CACHE.mkdir(parents=True, exist_ok=True)
    path, meta = CACHE / 'native.npy', CACHE / 'native.json'
    unit = ref['metresPerUnit'] * ref['gridScaleFactor']
    E = [ref['originEasting'] + bounds[0] * unit, ref['originEasting'] + bounds[2] * unit]
    N = [ref['originNorthing'] - bounds[3] * unit, ref['originNorthing'] - bounds[1] * unit]
    box = (math.floor(E[0]) - 2, math.floor(N[0]) - 2, math.ceil(E[1]) + 2, math.ceil(N[1]) + 2)
    if path.exists() and meta.exists() and rtin.read(meta)['box'] == list(box):
        return np.load(path, mmap_mode='r'), rtin.read(meta)
    tiles = [rasterio.open(p) for p in sorted((ROOT / 'work/geodata/lantmateriet/dtm').glob('m*.tif'))]
    data, aff = merge(tiles, bounds=box, nodata=np.nan, dtype='float32')
    np.save(path, data[0])
    info = {'box': list(box), 'left': aff.c, 'top': aff.f, 'shape': list(data[0].shape)}
    meta.write_text(json.dumps(info), encoding='utf8')
    return np.load(path, mmap_mode='r'), info


def categories(ref, info, city):
    """uint8 bit mask per native pixel (BITS); cached."""
    import hashlib
    path = CACHE / f"categories-v3-{hashlib.sha256((ROOT / 'src/lib/data/norrkoping-map.json').read_bytes()).hexdigest()[:12]}.npy"
    if path.exists():
        return np.load(path, mmap_mode='r')
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    from scipy.ndimage import binary_dilation
    unit = ref['metresPerUnit'] * ref['gridScaleFactor']
    tm = lambda p: (ref['originEasting'] + p[0] * unit, ref['originNorthing'] - p[1] * unit)
    shape = tuple(info['shape']); tr = from_origin(info['left'], info['top'], 1, 1)
    out = np.zeros(shape, np.uint8)

    def burn(shapes, bit):
        if shapes:
            out[rasterize(shapes, out_shape=shape, transform=tr, fill=0, dtype='uint8') > 0] |= bit

    poly = lambda rings: {'type': 'Polygon', 'coordinates': [[tm(p) for p in r] for r in rings]}
    burn([(poly(a['rings']), 1) for a in city['areas'] if a['kind'] == 'water'], BITS['water'])
    burn([(poly(b['rings']), 1) for b in city['buildings']], BITS['building'])
    burn([(poly(a['rings']), 1) for a in city['areas'] if a['kind'] in URBAN], BITS['urban'])
    widths = {'rail': .6, 'tram': None}
    for kind, bit in (('road', BITS['road']), ('path', BITS['path']), ('rail', BITS['rail']), ('tram', BITS['tram'])):
        shapes = []
        for r in city['roads']:
            if r['kind'] != kind or r.get('bridge') or r.get('tunnel'):
                continue
            (ax, az), (bx, bz) = r['a'], r['b']
            L = math.hypot(bx - ax, bz - az)
            if L < 1e-6:
                continue
            w = widths.get(kind) or (r['width'] if kind != 'path' else max(r['width'], .06))
            if kind == 'tram':
                w = max(r['width'], .3)
            nx, nz = -(bz - az) / L * w / 2, (bx - ax) / L * w / 2
            shapes.append((poly([[(ax + nx, az + nz), (bx + nx, bz + nz), (bx - nx, bz - nz), (ax - nx, az - nz),
                                  (ax + nx, az + nz)]]), 1))
        burn(shapes, bit)
    water = (out & BITS['water']) > 0
    # Both sides of the shoreline: the bank on land and the water surface next to it.
    bank = binary_dilation(water, iterations=10) & ~water
    bank |= water & binary_dilation(~water, iterations=10)
    out[bank] |= BITS['bank']
    np.save(path, out)
    return np.load(path, mmap_mode='r')


def current_surface(tile, g, x, z):
    """terrain.ts surfaceHeight() of the current 10 m / 40 m mesh, metres."""
    def sample(px, pz):
        u = (px - tile['x']) / tile['step']; v = (pz - tile['z']) / tile['step']
        bad = (u < 0) | (v < 0) | (u > tile['columns'] - 1) | (v > tile['rows'] - 1)
        col = np.clip(np.floor(u).astype(np.int64), 0, tile['columns'] - 2)
        row = np.clip(np.floor(v).astype(np.int64), 0, tile['rows'] - 2)
        tx = np.clip(u - col, 0, 1); tz = np.clip(v - row, 0, 1)
        h = (g[row, col] * (1 - tx) * (1 - tz) + g[row, col + 1] * tx * (1 - tz)
             + g[row + 1, col] * (1 - tx) * tz + g[row + 1, col + 1] * tx * tz)
        return np.where(bad, -0.5, h)
    coarse = 1.6

    def node(px, pz):
        y = sample(px, pz)
        ex = (np.abs(np.abs(px) - 64) < 1e-8) & (np.abs(pz) <= 64)
        ez = ~ex & (np.abs(np.abs(pz) - 64) < 1e-8) & (np.abs(px) <= 64)
        if ex.any():
            z0 = np.floor(pz[ex] / coarse) * coarse; t = (pz[ex] - z0) / coarse
            y[ex] = sample(px[ex], z0) * (1 - t) + sample(px[ex], z0 + coarse) * t
        if ez.any():
            x0 = np.floor(px[ez] / coarse) * coarse; t = (px[ez] - x0) / coarse
            y[ez] = sample(x0, pz[ez]) * (1 - t) + sample(x0 + coarse, pz[ez]) * t
        return y
    step = np.where((np.abs(x) < 64) & (np.abs(z) < 64), coarse / 4, coarse)
    x0 = np.floor(x / step) * step; z0 = np.floor(z / step) * step
    u = (x - x0) / step; v = (z - z0) / step
    b = node(x0 + step, z0); c = node(x0, z0 + step)
    lo = u + v <= 1
    return np.where(lo, node(x0, z0) * (1 - u - v) + b * u + c * v,
                    node(x0 + step, z0 + step) * (u + v - 1) + b * (1 - v) + c * (1 - u))


# ---------------------------------------------------------------- worker state
W = {}


def init():
    terrain, tile, g, ref = setup()
    city = rtin.read(ROOT / 'src/lib/data/norrkoping-map.json')
    native, info = mosaic(ref, city['meta']['bounds'])
    layout = rtin.Layout(tile, DEPTH)
    W.update(tile=tile, g=g, ref=ref, native=native, info=info, layout=layout, hn=layout.node_heights(g),
             bounds=city['meta']['bounds'], cats=categories(ref, info, city))
    W['built'] = built_up(W['cats'])
    W['track'] = track_mask(ref, info, city)
    import dtm_corrections
    W['corrections'] = dtm_corrections.corrected_pixels()
    if all((OUT / f'node-error-{c}.npy').exists() for c in CLASSES):
        W['err'] = {c: np.load(OUT / f'node-error-{c}.npy') for c in CLASSES}


def pixels(r0, r1):
    """Scene coordinates, native heights and masks of the native rows r0..r1 inside the map bounds."""
    ref, info, native = W['ref'], W['info'], W['native']
    unit = ref['metresPerUnit'] * ref['gridScaleFactor']
    a0 = max(0, r0 - 1); a1 = min(native.shape[0], r1 + 1)
    import dtm_corrections
    # Native pixels as the runtime grid sees them: retained bridge decks removed (Step 5).
    block = dtm_corrections.apply_to_block(native[a0:a1], a0, 0, W.get('corrections'))
    gy, gx = np.gradient(block)
    slope = np.hypot(gx, gy)[r0 - a0:r0 - a0 + (r1 - r0)]
    h = block[r0 - a0:r0 - a0 + (r1 - r0)]
    cols = np.arange(native.shape[1])
    E = info['left'] + cols + .5
    N = info['top'] - (np.arange(r0, r1) + .5)
    EE, NN = np.meshgrid(E, N)
    x = (EE - ref['originEasting']) / unit; z = (ref['originNorthing'] - NN) / unit
    b = W['bounds']
    ok = np.isfinite(h) & (x >= b[0]) & (x <= b[2]) & (z >= b[1]) & (z <= b[3])
    cats = with_built_up(W['cats'][r0:r1], W['built'][r0:r1]) | (np.asarray(W['track'][r0:r1]).astype(np.uint16) << 9)
    test = (EE >= TEST_BOX[0]) & (EE <= TEST_BOX[2]) & (NN >= TEST_BOX[1]) & (NN <= TEST_BOX[3])
    sel = ok.ravel()
    return (x.ravel()[sel], z.ravel()[sel], h.ravel()[sel], cats.ravel()[sel], slope.ravel()[sel] > .3,
            test.ravel()[sel])


def groups(x, z, cats, steep, test):
    water = (cats & BITS['water']) > 0
    land = ~water
    fine = (np.abs(x) < 64) & (np.abs(z) < 64)
    g = {
        'all': np.ones(len(x), bool), 'land': land, 'water': water,
        'road': (cats & BITS['road']) > 0, 'path': (cats & BITS['path']) > 0,
        'railCorridor': ((cats & BITS['rail']) > 0) & land, 'tramStreet': (cats & BITS['tram']) > 0,
        'building': (cats & BITS['building']) > 0, 'riverbank': (cats & BITS['bank']) > 0,
        'steepLand': steep & land, 'testArea': test & land, 'testAreaRoads': test & ((cats & (BITS['road'] | BITS['path'])) > 0),
        'testAreaWater': test & water,
        'centralLand': fine & land, 'outerLand': ~fine & land,
        'builtUpLand': land & ((cats & BITS['builtUp']) > 0),
    }
    return g


BINS = np.linspace(0, 60, 6001)


def accumulate(stats, name, d, masks):
    for gname, m in masks.items():
        e = d[m]
        if not len(e):
            continue
        s = stats.setdefault(name, {}).setdefault(gname, {'n': 0, 'sum': 0., 'sq': 0., 'max': 0., 'hist': np.zeros(len(BINS) - 1)})
        s['n'] += len(e); s['sum'] += float(e.sum()); s['sq'] += float((e * e).sum())
        a = np.abs(e); s['max'] = max(s['max'], float(a.max()))
        s['hist'] += np.histogram(np.minimum(a, 59.999), BINS)[0]


def pass1(band):
    """Per-triangle max |plane - DTM| for every level, plus current-mesh stats."""
    layout, hn, tile = W['layout'], W['hn'], W['tile']
    levels = layout.levels()
    tri = {c: [np.zeros(n, np.float32) for n in rtin.triangle_counts(layout)] for c in CLASSES}
    stats = {}
    for r0 in range(band[0], band[1], BAND_ROWS):
        x, z, h, cats, steep, test = pixels(r0, min(band[1], r0 + BAND_ROWS))
        if not len(x):
            continue
        gx = (x - layout.x0) / layout.step; gz = (z - layout.z0) / layout.step
        cls = error_class(cats)
        for li, (kind, j, cell) in enumerate(levels):
            t, p, _ = rtin.locate(layout, kind, cell, gx, gz, hn)
            e = np.abs(p - h).astype(np.float32)
            for ci, c in enumerate(CLASSES):
                m = cls == ci
                np.maximum.at(tri[c][li], t[m], e[m])
        accumulate(stats, 'current', current_surface(tile, W['g'], x, z) - h, groups(x, z, cats, steep, test))
    # Sparse: a band touches few triangles, and full arrays for six classes overflow the Windows pipe.
    sparse = {c: [(np.flatnonzero(a), a[a > 0]) for a in levels_] for c, levels_ in tri.items()}
    return sparse, stats


def split_nodes(err, tol):
    """Active nodes for per-class tolerances {class: metres}."""
    active = np.zeros(next(iter(err.values())).shape, bool)
    for c, t in tol.items():
        active |= err[c] > t
    return active


# Candidate tolerance profiles (metres per class). 'equal': one max-error tolerance everywhere;
# 'ff' (feature first): urban 1.5x, open land and open water 3x the feature tolerance.
PROFILES = {
    'bu0.5-0.75': dict(featureBuiltUp=.5, feature=.75, landBuiltUp=.75, urban=1.125, open=2.25, water=2.25),
    'bu0.4-0.75': dict(featureBuiltUp=.4, feature=.75, landBuiltUp=.75, urban=1.125, open=2.25, water=2.25),
    'bu0.4-1.125': dict(featureBuiltUp=.4, feature=.75, landBuiltUp=1.125, urban=1.125, open=2.25, water=2.25),
    'bu0.5-0.6': dict(featureBuiltUp=.5, feature=.75, landBuiltUp=.6, urban=1.125, open=2.25, water=2.25),
    'bu0.35-0.6': dict(featureBuiltUp=.35, feature=.75, landBuiltUp=.6, urban=1.125, open=2.25, water=2.25),
}


def variants(err):
    only = [a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--only=')]
    shape = next(iter(err.values())).shape
    out = {'uniform10': (np.ones(shape, bool), 'u10'), 'uniform5': (np.ones(shape, bool), None)} if '--uniform' in sys.argv else {}
    for name, tol in PROFILES.items():
        if tol and (not only or name in only[0]):
            out[name] = (split_nodes(err, tol), None)
    return out


def pass2(band):
    layout, hn = W['layout'], W['hn']
    levels = layout.levels()
    u10 = [i for i, (k, j, c) in enumerate(levels) if k == 'square' and c == 2][0]
    stats = {}
    var = variants(W['err'])
    for r0 in range(band[0], band[1], BAND_ROWS):
        x, z, h, cats, steep, test = pixels(r0, min(band[1], r0 + BAND_ROWS))
        if not len(x):
            continue
        gx = (x - layout.x0) / layout.step; gz = (z - layout.z0) / layout.step
        masks = groups(x, z, cats, steep, test)
        for name, (active, cap) in var.items():
            y, _ = rtin.leaf_heights(layout, active, gx, gz, hn, max_level=u10 if cap else None)
            accumulate(stats, name, y - h, masks)
    return stats


def merge_stats(total, part):
    for name, gs in part.items():
        for g, s in gs.items():
            t = total.setdefault(name, {}).setdefault(g, {'n': 0, 'sum': 0., 'sq': 0., 'max': 0., 'hist': np.zeros(len(BINS) - 1)})
            t['n'] += s['n']; t['sum'] += s['sum']; t['sq'] += s['sq']; t['max'] = max(t['max'], s['max']); t['hist'] += s['hist']


def summarise(total):
    out = {}
    for name, gs in total.items():
        for g, s in gs.items():
            c = np.cumsum(s['hist']) / max(1, s['n'])
            pct = lambda q: float(BINS[1 + np.searchsorted(c, q)]) if s['n'] else None
            out.setdefault(name, {})[g] = {'n': s['n'], 'mean': round(s['sum'] / s['n'], 4), 'rmse': round(math.sqrt(s['sq'] / s['n']), 4),
                                         'p95': pct(.95), 'p99': pct(.99), 'max': round(s['max'], 3),
                                         'over0.5m': round(float(1 - c[49]), 5), 'over1m': round(float(1 - c[99]), 5)}
    return out


def bands():
    rows = W['native'].shape[0]
    return [(rows * i // 32, rows * (i + 1) // 32) for i in range(32)]


def compute_node_errors():
    """Pass 1 over every native pixel: propagated split error per mesh node (metres)."""
    OUT.mkdir(parents=True, exist_ok=True)
    if 'layout' not in W:
        init()
    t0 = time.time()
    layout = W['layout']
    tri = {c: [np.zeros(n, np.float32) for n in rtin.triangle_counts(layout)] for c in CLASSES}
    total = {}
    with Pool(10, initializer=init) as pool:
        for k, (part, stats) in enumerate(pool.imap_unordered(pass1, bands())):
            for c in CLASSES:
                for a, (idx, val) in zip(tri[c], part[c]):
                    np.maximum.at(a, idx, val)
            merge_stats(total, stats)
            print(f'pass 1: {k + 1}/32 bands, {time.time() - t0:.0f} s', flush=True)
    err = {c: rtin.propagate(layout, tri[c]) for c in CLASSES}
    for c in CLASSES:
        np.save(OUT / f'node-error-{c}.npy', err[c])
    W['err'] = err
    (OUT / 'current-stats.json').write_text(json.dumps(summarise(total), indent=1), encoding='utf8')
    return err


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    init()
    t0 = time.time()
    if 'err' not in W or '--recompute' in sys.argv:
        compute_node_errors()
    current = rtin.read(OUT / 'current-stats.json')
    nb = 32
    total = {}
    with Pool(12, initializer=init) as pool:
        for k, stats in enumerate(pool.imap_unordered(pass2, bands())):
            merge_stats(total, stats)
            print(f'pass 2: {k + 1}/{nb} bands, {time.time() - t0:.0f} s', flush=True)
    result = summarise(total)
    result['current'] = current['current']
    layout, err = W['layout'], W['err']
    counts = {'current': current_triangles(layout)}
    for name, (active, cap) in variants(err).items():
        counts[name] = uniform_count(layout, 2) if cap else (uniform_count(layout, 1) if name == 'uniform5' else rtin.leaves(layout, active))
    (OUT / 'study-classes.json').write_text(json.dumps({'profiles': PROFILES, 'depth': DEPTH, 'testBox': TEST_BOX,
                                                'triangles': counts, 'stats': result}, indent=1), encoding='utf8')
    for name in result:
        r = result[name]
        print(f"{name:10s} tris={counts.get(name, 0):>9,d}  " + '  '.join(
            f"{g}: {r[g]['rmse']:.3f}/{r[g]['p95']:.2f}/{r[g]['max']:.1f}" for g in ('land', 'road', 'path', 'railCorridor', 'riverbank', 'steepLand', 'testArea') if g in r))


def uniform_count(layout, cell):
    return ((layout.columns - 1) // cell) * ((layout.rows - 1) // cell) * 2


def current_triangles(layout):
    """Triangles of the current mesh over the same root extent (10 m in |x|,|z| < 64, else 40 m)."""
    area = (layout.columns - 1) * (layout.rows - 1) * layout.step ** 2
    central = 128 * 128
    return int(central / .4 ** 2 * 2 + (area - central) / 1.6 ** 2 * 2)


if __name__ == '__main__':
    main()
