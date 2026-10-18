"""Bridge positions: OSM-derived scene centres vs public coordinates; LiDAR deck profile per detailed bridge."""
import numpy as np
from scipy.spatial import cKDTree
from pyproj import Geod
from common import *
g = Geod(ellps='GRS80')
B = read(ROOT / 'src/lib/data/city-bridges.json')['bridges']
pub = {'Bergsbron': (58.594444, 16.200833), 'Saltängsbron': (58.59361, 16.18556), 'Hamnbron': (58.594167, 16.193889)}
lidar = np.concatenate([np.load(CACHE / f'lidar_{t}.npy') for t in ('y20c012-64925_5675_25', 'y20c012-64950_5675_25')])
deck = lidar[lidar[:, 3] == 17]; tree = cKDTree(deck[:, :2]); nat = Native()
PROF = read(ROOT / 'src/lib/data/bridge-profiles.json')['points']
for b in B:
    cx, cz = b['center']; E, N = scene_to_tm(cx, cz); lon, lat = TO_GEO.transform(E, N)
    s = f"{b['name']:24} centre WGS84 {lat:.5f},{lon:.5f} TM {E:.0f},{N:.0f} model length {b['length']*U:.1f} m (scene units are ground metres since the SWEREF 99 TM migration)"
    if b['name'] in pub:
        _, _, d = g.inv(lon, lat, pub[b['name']][1], pub[b['name']][0]); s += f" | Wikipedia coord {d:.0f} m away"
    print(s)
    # LiDAR deck along the axis (rotation convention from prepare-bridge-profiles: dx=cos, dz=-sin)
    dx, dz = np.cos(b['rotation']), -np.sin(b['rotation']); L = b['length']
    ts = np.linspace(-.6, .6, 13)
    xs, zs = cx + dx * L * ts, cz + dz * L * ts
    Es, Ns = scene_to_tm(xs, zs)
    lid = [np.median(deck[i, 2]) if len(i) >= 4 else np.nan for i in tree.query_ball_point(np.c_[Es, Ns], 3)]
    dtm = nat.sample(Es, Ns)
    print('    t      ', ' '.join(f'{t:6.2f}' for t in ts))
    print('    LiDAR17', ' '.join(f'{v:6.2f}' for v in lid))
    print('    DTM    ', ' '.join(f'{v:6.2f}' for v in dtm))
    # model deck: profile = linear between approach ground(+-0.4 beyond end)+0.091
    a = (cx - dx * L / 2, cz - dz * L / 2); bb = (cx + dx * L / 2, cz + dz * L / 2)
    ha = surface(a[0] - .4 * dx, a[1] - .4 * dz)[0] / U + .091; hb = surface(bb[0] + .4 * dx, bb[1] + .4 * dz)[0] / U + .091
    model = [(ha + (hb - ha) * min(1, max(0, t + .5))) * U for t in ts]
    print('    model  ', ' '.join(f'{v:6.2f}' for v in model), ' (deck profile before +0.006 surfacing)')
