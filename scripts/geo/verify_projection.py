"""Step 1 verification: source CRS metadata, independent reference points, and the SWEREF 99 TM
scene contract. Writes test fixtures to src/lib/geo/reference-points.json.

Independent references used:
  * Lantmäteriet SWEPOS calculation report (point G5TA): geodetic SWEREF 99 and SWEREF 99 TM, published values.
    https://www.lantmateriet.se/contentassets/507ea11103354da8a30c78372e3e8e2c/berakningsresultat.pdf
  * Lantmäteriet STAC catalogue: tile corners given both as SWEREF 99 TM bbox and WGS84 footprint
    (work/geodata/lantmateriet/{,dtm/}catalog.json, retrieved from api.lantmateriet.se/stac-hojd).
  * PROJ (pyproj) EPSG:4326 -> EPSG:3006 and GRS80 geodesics.
Usage: python scripts/geo/verify_projection.py
"""
import json, math, sys
from pathlib import Path
import numpy as np
import rasterio, laspy
from pyproj import CRS, Geod, Transformer, Proj

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sweref99tm import forward, inverse, scale_and_convergence  # noqa: E402

geod = Geod(ellps='GRS80')
to_tm = Transformer.from_crs(4326, 3006, always_xy=True)
report = {}

# ---- 1. Source metadata
dtm = sorted((ROOT / 'work/geodata/lantmateriet/dtm').glob('m*.tif'))
with rasterio.open(dtm[0]) as ds:
    crs = CRS(ds.crs)
    h = crs.sub_crs_list[0] if crs.is_compound else crs
    params = {p.name: p.value for p in h.coordinate_operation.params}
    report['dtmCrs'] = {'name': crs.name, 'horizontal': h.to_epsg(), 'vertical': crs.sub_crs_list[1].name if crs.is_compound else None,
                        'ellipsoid': h.ellipsoid.name, 'params': params, 'pixel': ds.res, 'transform': list(ds.transform)[:6]}
laz = sorted((ROOT / 'work/geodata/lantmateriet').glob('*.copc.laz'))[0]
with laspy.open(laz) as r:
    report['lidarCrs'] = r.header.parse_crs().name
meta = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text(encoding='utf-8'))['meta']
ref = json.loads((ROOT / 'src/lib/data/terrain.json').read_text(encoding='utf-8'))['reference']
report['currentSceneReference'] = ref
report['osm'] = {k: meta[k] for k in ('bbox', 'origin', 'metresPerUnit', 'source', 'timestamp') if k in meta}

# ---- 2. Implementation vs published / PROJ reference points
points = []
dms = lambda d, m, s: d + m / 60 + s / 3600
g5ta = dict(name='G5TA (Lantmäteriet SWEPOS report 2018-05-04)', lat=dms(60, 39, 59.47023), lon=dms(17, 7, 56.56458),
            E=616524.614, N=6727534.361, source='published')
points.append(g5ta)
seen = set()
for cat in [ROOT / 'work/geodata/lantmateriet/dtm/catalog.json', ROOT / 'work/geodata/lantmateriet/catalog.json']:
    for f in json.loads(cat.read_text(encoding='utf-8-sig'))['features']:
        x0, y0, x1, y1 = f['assets']['data']['proj:bbox']
        ring = f['geometry']['coordinates'][0][:4]
        corners = [(x0, y0), (x0, y1), (x1, y1), (x1, y0)]
        # Vertex order differs between catalogues; label each vertex with the bbox corner it is
        # nearest to (corners are >= 2.5 km apart, so the labelling is unambiguous).
        pairs = []
        for lon, lat in ring:
            pe, pn = to_tm.transform(lon, lat)
            E, N = min(corners, key=lambda c: math.hypot(c[0] - pe, c[1] - pn))
            pairs.append(((lon, lat), (E, N)))
        for (lon, lat), (E, N) in pairs:
            if (E, N) in seen:
                continue
            seen.add((E, N))
            points.append(dict(name=f'STAC corner {f["id"]} {E:.0f},{N:.0f}', lat=lat, lon=lon, E=E, N=N, source='stac'))
worst = {'published': 0, 'stac': 0, 'proj': 0}
for p in points:
    e, n = forward(p['lat'], p['lon'])
    pe, pn = to_tm.transform(p['lon'], p['lat'])
    p['errImplementation'] = math.hypot(e - p['E'], n - p['N'])
    p['errProj'] = math.hypot(pe - p['E'], pn - p['N'])
    p['implVsProj'] = math.hypot(e - pe, n - pn)
    lat, lon = inverse(p['N'], p['E'])
    _, _, back = geod.inv(lon, lat, p['lon'], p['lat'])
    p['inverseErr'] = back
    worst[p['source']] = max(worst[p['source']], p['errImplementation'])
    worst['proj'] = max(worst['proj'], p['implVsProj'])
report['referencePoints'] = {'count': len(points), 'worstImplementationErrorMetres': worst,
                             'worstInverseErrorMetres': max(p['inverseErr'] for p in points)}

# ---- 3. Old equirectangular scene vs truth, using Lantmäteriet's own corner pairs
# Legacy (pre-migration) equirectangular frame, see scripts/geo/legacy-frame.mjs.
o_lat, o_lon = 58.58981, 16.18747
old = lambda lat, lon: ((lon - o_lon) * 58010, (o_lat - lat) * 111133)
stac = [p for p in points if p['source'] == 'stac']
ratios = []
for a in stac:
    for b in stac:
        if a is b or abs(a['E'] - b['E']) + abs(a['N'] - b['N']) < 9000:
            continue
        _, _, true = geod.inv(a['lon'], a['lat'], b['lon'], b['lat'])
        (ax, az), (bx, bz) = old(a['lat'], a['lon']), old(b['lat'], b['lon'])
        ratios.append(math.hypot(bx - ax, bz - az) / true)
report['oldSceneScaleVsGeodesic'] = {'pairs': len(ratios), 'min': min(ratios), 'max': max(ratios)}

# ---- 4. New contract
E0, N0 = 569030.0, 6494989.0
lat0, lon0 = inverse(N0, E0)
k0, gamma = scale_and_convergence(lat0, lon0)
f = Proj('EPSG:3006').get_factors(lon0, lat0)
report['newContract'] = {'crs': 'EPSG:3006', 'originEasting': E0, 'originNorthing': N0, 'originLatitude': lat0,
                         'originLongitude': lon0, 'gridScaleFactor': k0, 'gridConvergenceDegrees': gamma,
                         'projScale': f.meridional_scale, 'projConvergence': f.meridian_convergence}
U = 25 * k0
scene = lambda E, N: ((E - E0) / U, (N0 - N) / U)
ratios = []
for a in stac:
    for b in stac:
        if a is b:
            continue
        _, _, true = geod.inv(a['lon'], a['lat'], b['lon'], b['lat'])
        (ax, az), (bx, bz) = scene(a['E'], a['N']), scene(b['E'], b['N'])
        ratios.append(math.hypot(bx - ax, bz - az) * 25 / true)
report['newSceneScaleVsGeodesic'] = {'pairs': len(ratios), 'min': min(ratios), 'max': max(ratios)}
print(json.dumps(report, indent=1, default=str))

# ---- 5. Independent fixtures for regression tests
# GRS80 geodesic distances between fixed geographic points: independent of the projection code.
landmarks = {
    'Norrköping C': (58.5966, 16.1835), 'Bergsbron': (58.58972, 16.17829), 'Saltängsbron': (58.59369, 16.18546),
    'Hamnbron': (58.59425, 16.19404), 'Gamlebro': (58.58939, 16.18385), 'Ljuraparken': (58.5794, 16.1995),
    'Bollspelaren': (58.6006, 16.1778), 'Map SW corner': (58.555, 16.065), 'Map NE corner': (58.65, 16.295),
}
names = list(landmarks)
pairs = []
for i, a in enumerate(names):
    for b in names[i + 1:]:
        (la, oa), (lb, ob) = landmarks[a], landmarks[b]
        _, _, d = geod.inv(oa, la, ob, lb)
        pairs.append({'a': a, 'b': b, 'metres': d})
# Native 1 m DTM heights at SWEREF 99 TM control points (bilinear at pixel centres, like prepare-dtm.py).
from rasterio.merge import merge
from scipy.ndimage import map_coordinates
rng = np.random.default_rng(20261018)
E = rng.uniform(564000, 574000, 400)
N = rng.uniform(6492000, 6499000, 400)
mosaic, aff = merge([rasterio.open(p) for p in dtm], bounds=(563990, 6491990, 574010, 6499010),
                    nodata=np.nan, dtype='float32')
heights = map_coordinates(mosaic[0], [(N - aff.f) / aff.e - .5, (E - aff.c) / aff.a - .5], order=1, prefilter=False)
control = [{'E': float(e), 'N': float(n), 'metresRH2000': float(h)} for e, n, h in zip(E, N, heights)
           if np.isfinite(h)]
fixture = {
    'note': 'Generated by scripts/geo/verify_projection.py. G5TA is Lantmäteriet-published; STAC corners are '
            'Lantmäteriet catalogue footprints; geodesic distances are GRS80 (PROJ); DTM control heights are '
            'bilinear samples of the native Lantmäteriet 1 m DTM at the given SWEREF 99 TM coordinates.',
    'contract': report['newContract'],
    'points': [{k: p[k] for k in ('name', 'lat', 'lon', 'E', 'N', 'source')} for p in points],
    'landmarks': {k: {'lat': v[0], 'lon': v[1]} for k, v in landmarks.items()},
    'geodesicPairs': pairs,
    'dtmControl': control,
}
(ROOT / 'src/lib/geo/reference-points.json').write_text(json.dumps(fixture, indent=1) + '\n', encoding='utf8')
