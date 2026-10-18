"""Rendered road/rail/tram/bridge heights (replicating terrain.ts + mapModel.ts + cityMesh.ts)
compared with the native 1 m DTM and LiDAR class 17 (bridge deck) / class 9 (water) points."""
import json, numpy as np
from collections import defaultdict
from scipy.spatial import cKDTree
from common import *

PROFILES = read(ROOT / 'src/lib/data/bridge-profiles.json')['points']
m = city(); roads = m['roads']
TOP = {'road': .006, 'path': .007, 'tram': .016, 'rail': .016}
lidar = np.concatenate([np.load(CACHE / f'lidar_{t}.npy') for t in ('y20c012-64925_5675_25', 'y20c012-64950_5675_25')])
LB = (567500, 6492500, 570000, 6497500)
deck = lidar[lidar[:, 3] == 17]; wat = lidar[lidar[:, 3] == 9]
deck_tree = cKDTree(deck[:, :2]); nat = Native()


def key(x, z, y):
    return f'{x:.3f},{z:.3f},{y:.3f}'


def road_height(x, z, legacy):
    k = PROFILES.get(key(x, z, legacy))
    if k is not None:
        return k, True
    return float(surface(x, z)[0]) / U + max(.071, legacy) + .02, False


segs = []
for r in roads:
    if r['kind'] == 'stream':
        continue
    ya, ha = road_height(*r['a'], r['yA']); yb, hb = road_height(*r['b'], r['yB'])
    segs.append(dict(r=r, ya=ya, yb=yb, linear=bool(r.get('bridge')) or ha or hb, hitA=ha, hitB=hb))


def rendered(s, t):
    r = s['r']; a, b = np.array(r['a']), np.array(r['b'])
    p = a[None] + (b - a)[None] * t[:, None]
    if s['linear']:
        y = s['ya'] + (s['yb'] - s['ya']) * t
    else:
        ga, gb = surface(*a)[0] / U, surface(*b)[0] / U
        y = surface(p[:, 0], p[:, 1]) / U + (s['ya'] - ga) * (1 - t) + (s['yb'] - gb) * t
    return p, (y + TOP[r['kind']]) * U


# ---- 1. non-bridge network vs native DTM (whole map, sampled every ~5 m)
res = defaultdict(list); res_zone = defaultdict(list)
for s in segs:
    r = s['r']
    if r.get('bridge') or r.get('tunnel'):
        continue
    L = np.hypot(*np.subtract(r['b'], r['a'])) * U
    t = (np.arange(max(1, int(L / 5))) + .5) / max(1, int(L / 5))
    p, y = rendered(s, t)
    E, N = scene_to_tm(p[:, 0], p[:, 1]); ref = nat.sample(E, N)
    fine = (np.abs(p[:, 0]) < 64) & (np.abs(p[:, 1]) < 64)
    res[r['kind']].append(y - ref); res_zone[(r['kind'], 'fine' if fine.all() else 'outer')].append(y - ref)
print('== Rendered top surface minus native DTM, non-bridge, non-tunnel segments')
for k, v in res.items():
    print(f'  {k:5s}', stats(np.concatenate(v)))
for k, v in sorted(res_zone.items()):
    print(f'    {k[0]:5s} {k[1]:5s}', stats(np.concatenate(v)))

# ---- 2. land-cover / building / bank offsets (code constants -> metres above rendered ground)
levels = dict(farmland=.003, apron=.04, residential=.005, industrial=.007, square=.014, grass=.021, cemetery=.022,
              wood=.023, pitch=.035)
print('\n== Constant offsets above the rendered ground surface (metres)')
print('  ', {k: round((v + .02) * U, 2) for k, v in levels.items()},
      '| road kerb', round(.091 * U, 2), '| asphalt', round(.097 * U, 2), '| building base', round(.065 * U, 2),
      '| bank top', round(.044 * U, 2))

# ---- 3. bridges vs LiDAR class 17
print('\n== Bridge segments in LiDAR area: rendered deck top minus LiDAR class-17 median within 2.5 m')
per_way = defaultdict(list)
for s in segs:
    r = s['r']
    if not r.get('bridge'):
        continue
    L = np.hypot(*np.subtract(r['b'], r['a'])) * U
    n = max(2, int(L / 3)); t = np.linspace(0, 1, n)
    p, y = rendered(s, t)
    E, N = scene_to_tm(p[:, 0], p[:, 1])
    if not ((E > LB[0]) & (E < LB[2]) & (N > LB[1]) & (N < LB[3])).all():
        continue
    ref = np.full(n, np.nan); cnt = np.zeros(n)
    for i, idx in enumerate(deck_tree.query_ball_point(np.c_[E, N], 2.5)):
        if len(idx) >= 4:
            ref[i] = np.median(deck[idx, 2]); cnt[i] = len(idx)
    under = nat.sample(E, N)
    per_way[(r['way'], r['name'] or '?', r['kind'])].append(dict(d=y - ref, y=y, ref=ref, under=under,
                                                                    E=E, N=N, hit=(s['hitA'], s['hitB'])))
allD = []
rows = []
for (way, name, kind), parts in per_way.items():
    d = np.concatenate([p['d'] for p in parts]); y = np.concatenate([p['y'] for p in parts])
    ref = np.concatenate([p['ref'] for p in parts]); under = np.concatenate([p['under'] for p in parts])
    E = np.concatenate([p['E'] for p in parts]); N = np.concatenate([p['N'] for p in parts])
    cov = np.isfinite(ref).mean()
    allD.append(d)
    rows.append((way, name, kind, len(parts), cov, np.nanmean(d) if cov else np.nan,
                 np.nanmax(np.abs(d)) if cov else np.nan, np.nanmin(y), np.nanmax(y), np.nanmin(ref) if cov else np.nan,
                 np.nanmax(ref) if cov else np.nan, np.nanmin(under), round(E.mean()), round(N.mean()),
                 all(h for p in parts for h in p['hit'])))
rows.sort(key=lambda r: -abs(r[5]) if np.isfinite(r[5]) else 0)
print(f"  {'way':>10} {'name':22} {'kind':5} segs cov  meanErr maxErr | rendered min-max | lidar min-max | DTM below min | E N | profiled")
for r in rows:
    print(f'  {r[0]:>10} {r[1][:22]:22} {r[2]:5} {r[3]:4} {r[4]:.2f} {r[5]:+7.2f} {r[6]:6.2f} | {r[7]:6.2f}-{r[8]:6.2f} | '
          f'{r[9]:6.2f}-{r[10]:6.2f} | {r[11]:6.2f} | {r[12]} {r[13]} | {r[14]}')
print('  ALL bridge samples with LiDAR deck reference:', stats(np.concatenate(allD)))
json.dump([dict(way=r[0], name=r[1], kind=r[2], cover=r[4], meanErr=r[5], maxErr=r[6], renderedMin=r[7], renderedMax=r[8],
                lidarMin=r[9], lidarMax=r[10], dtmBelowMin=r[11], E=r[12], N=r[13]) for r in rows],
          open(CACHE / 'bridges.json', 'w'), default=float, indent=1)

# ---- 4. vertical discontinuities at shared nodes
print('\n== Vertical jumps at shared segment endpoints (same kind), metres')
nodes = defaultdict(list)
for s in segs:
    r = s['r']
    nodes[(r['kind'], round(r['a'][0], 3), round(r['a'][1], 3))].append((s['ya'], bool(r.get('bridge'))))
    nodes[(r['kind'], round(r['b'][0], 3), round(r['b'][1], 3))].append((s['yb'], bool(r.get('bridge'))))
jumps = []
for (kind, x, z), v in nodes.items():
    if len(v) < 2:
        continue
    ys = [a for a, _ in v]; j = (max(ys) - min(ys)) * U
    jumps.append((j, kind, x, z, any(b for _, b in v)))
for kind in ('road', 'path', 'tram', 'rail'):
    js = np.array([j for j, k, *_ in jumps if k == kind]); jb = np.array([j for j, k, x, z, b in jumps if k == kind and b])
    print(f'  {kind:5s} nodes={len(js)} >0.25m: {(js > .25).sum()} >1m: {(js > 1).sum()} >3m: {(js > 3).sum()} max={js.max():.2f} | at bridge ends: '
          f'{len(jb)} nodes, >1m: {(jb > 1).sum()}, max {jb.max() if len(jb) else 0:.2f}')
top = sorted(jumps, reverse=True)[:25]
for j, kind, x, z, b in top:
    E, N = scene_to_tm(x, z); lon, lat = TO_GEO.transform(E, N)
    print(f'    {j:6.2f} m {kind:5s} bridge={b} scene=({x:.2f},{z:.2f}) WGS84=({lat:.5f},{lon:.5f})')
json.dump([dict(jump=j, kind=k, x=x, z=z, bridge=b) for j, k, x, z, b in sorted(jumps, reverse=True)[:400]],
          open(CACHE / 'jumps.json', 'w'), indent=1)

# ---- 5. water: rendered water surface vs LiDAR class 9
print('\n== Rendered water surface (DTM-draped) minus LiDAR class-9 water returns')
wx, wz = tm_to_scene(wat[:, 0], wat[:, 1]); wm = water_mask_fn()(wx, wz)
dw = surface(wx, wz) - wat[:, 2]
print('  inside mapped water polygons:', stats(dw[wm]))
dtm_w = nat.sample(wat[:, 0], wat[:, 1])
print('  native DTM minus class-9 (DTM water flattening check):', stats((dtm_w - wat[:, 2])[wm]))
# reach levels along Motala ström
for lab, (E0, N0, E1, N1) in {'upstream of Holmen dam (S tile)': (568000, 6494200, 568800, 6494900),
                              'harbour / Bråviken side': (569300, 6495500, 570000, 6497500)}.items():
    mm = (wat[:, 0] > E0) & (wat[:, 0] < E1) & (wat[:, 1] > N0) & (wat[:, 1] < N1) & wm
    if mm.any():
        print(f'  {lab}: LiDAR water median {np.median(wat[mm, 2]):.2f} m, rendered median {np.median(surface(wx[mm], wz[mm])):.2f} m, n={mm.sum()}')
