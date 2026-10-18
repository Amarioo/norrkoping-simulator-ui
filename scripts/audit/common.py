import json, math, base64, hashlib, numpy as np, rasterio
from pathlib import Path
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
DTM = ROOT / 'work/geodata/lantmateriet/dtm'
LAS = ROOT / 'work/geodata/lantmateriet'
CACHE = LAS / 'audit'
CACHE.mkdir(exist_ok=True)


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


TERRAIN = read(ROOT / 'src/lib/data/terrain.json')
REF = TERRAIN['reference']
TILE = TERRAIN['tiles'][0]
G = np.frombuffer(base64.b64decode(TILE['heightsBase64']), dtype='<f4').reshape(
    TILE['rows'], TILE['columns']).astype(np.float64)
U = REF['metresPerUnit']
TO_TM = Transformer.from_crs(4326, 3006, always_xy=True)
TO_GEO = Transformer.from_crs(3006, 4326, always_xy=True)


# Scene contract (src/lib/geo/sweref99tm.js); the legacy equirectangular frame is no longer used.
assert REF['crs'] == 'EPSG:3006'
UNIT = U * REF['gridScaleFactor']


def scene_to_tm(x, z):
    return REF['originEasting'] + np.asarray(x) * UNIT, REF['originNorthing'] - np.asarray(z) * UNIT


def tm_to_scene(E, N):
    return (np.asarray(E) - REF['originEasting']) / UNIT, (REF['originNorthing'] - np.asarray(N)) / UNIT


def sample5(x, z):
    """terrain.ts sample(): bilinear on the 5 m grid, metres RH2000."""
    x = np.asarray(x, float); z = np.asarray(z, float)
    u = (x - TILE['x']) / TILE['step']; v = (z - TILE['z']) / TILE['step']
    col = np.clip(np.floor(u).astype(int), 0, TILE['columns'] - 2)
    row = np.clip(np.floor(v).astype(int), 0, TILE['rows'] - 2)
    tx = u - col; tz = v - row
    return (G[row, col] * (1 - tx) * (1 - tz) + G[row, col + 1] * tx * (1 - tz)
            + G[row + 1, col] * (1 - tx) * tz + G[row + 1, col + 1] * tx * tz)


COARSE = 40 / U


def surface_node(x, z):
    x = np.array(x, float, ndmin=1); z = np.array(z, float, ndmin=1)
    y = sample5(x, z)
    ex = (np.abs(np.abs(x) - 64) < 1e-8) & (np.abs(z) <= 64)
    ez = ~ex & (np.abs(np.abs(z) - 64) < 1e-8) & (np.abs(x) <= 64)
    if ex.any():
        z0 = np.floor(z[ex] / COARSE) * COARSE; t = (z[ex] - z0) / COARSE
        y[ex] = sample5(x[ex], z0) * (1 - t) + sample5(x[ex], z0 + COARSE) * t
    if ez.any():
        x0 = np.floor(x[ez] / COARSE) * COARSE; t = (x[ez] - x0) / COARSE
        y[ez] = sample5(x0, z[ez]) * (1 - t) + sample5(x0 + COARSE, z[ez]) * t
    return y


def surface(x, z):
    """terrain.ts surfaceHeight() == groundHeight() for DTM revisions, in metres."""
    x = np.array(x, float, ndmin=1); z = np.array(z, float, ndmin=1)
    step = np.where((np.abs(x) < 64) & (np.abs(z) < 64), COARSE / 4, COARSE)
    x0 = np.floor(x / step) * step; z0 = np.floor(z / step) * step
    u = (x - x0) / step; v = (z - z0) / step
    b = surface_node(x0 + step, z0); c = surface_node(x0, z0 + step)
    lo = u + v <= 1
    return np.where(lo, surface_node(x0, z0) * (1 - u - v) + b * u + c * v,
                    surface_node(x0 + step, z0 + step) * (u + v - 1) + b * (1 - v) + c * (1 - u))


class Native:
    """Native 1 m Lantmäteriet DTM, bilinear at pixel centres (prepare-dtm.py convention)."""

    def __init__(self):
        self.ds = [rasterio.open(p) for p in sorted(DTM.glob('m*.tif'))]
        self.cache = {}

    def sample(self, E, N):
        E = np.asarray(E, float); N = np.asarray(N, float)
        out = np.full(E.shape, np.nan)
        for ds in self.ds:
            b = ds.bounds
            m = (E >= b.left + 1) & (E < b.right - 1) & (N >= b.bottom + 1) & (N < b.top - 1)
            if not m.any():
                continue
            if ds.name not in self.cache:
                self.cache = {ds.name: ds.read(1).astype(np.float32)}
            a = self.cache[ds.name]; aff = ds.transform
            col = (E[m] - aff.c) / aff.a - .5; row = (N[m] - aff.f) / aff.e - .5
            c0 = np.clip(np.floor(col).astype(int), 0, a.shape[1] - 2)
            r0 = np.clip(np.floor(row).astype(int), 0, a.shape[0] - 2)
            tx = col - c0; tz = row - r0
            out[m] = (a[r0, c0] * (1 - tx) * (1 - tz) + a[r0, c0 + 1] * tx * (1 - tz)
                      + a[r0 + 1, c0] * (1 - tx) * tz + a[r0 + 1, c0 + 1] * tx * tz)
        return out


_MAP = None


def city():
    global _MAP
    if _MAP is None:
        _MAP = read(ROOT / 'src/lib/data/norrkoping-map.json')
    return _MAP


def water_mask_fn():
    """f(x, z) -> True inside mapped water polygons (1 m raster in scene space)."""
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    m = city(); x0, z0, x1, z1 = m['meta']['bounds']; res = 0.04
    W = int((x1 - x0) / res) + 2; H = int((z1 - z0) / res) + 2
    tr = from_origin(x0, -z0, res, res)
    shapes = [({'type': 'Polygon', 'coordinates': [[(p[0], -p[1]) for p in r] for r in a['rings']]}, 1)
              for a in m['areas'] if a['kind'] == 'water']
    mask = rasterize(shapes, out_shape=(H, W), transform=tr, fill=0, dtype='uint8')

    def f(x, z):
        c = np.clip(((np.asarray(x) - x0) / res).astype(int), 0, W - 1)
        r = np.clip(((np.asarray(z) - z0) / res).astype(int), 0, H - 1)
        return mask[r, c].astype(bool)
    return f


def stats(d):
    d = np.asarray(d, float); d = d[np.isfinite(d)]
    if not len(d):
        return 'n=0'
    return (f"n={len(d)} mean={d.mean():+.2f} MAE={np.abs(d).mean():.2f} RMSE={np.sqrt((d ** 2).mean()):.2f} "
            f"p95|e|={np.percentile(np.abs(d), 95):.2f} max|e|={np.abs(d).max():.2f} m")
