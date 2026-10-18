"""Approach ramp grades and tram/train vehicle height vs rendered rail top (backend RailTraffic formula)."""
import numpy as np
from collections import defaultdict
from scipy.spatial import cKDTree
from common import *
PROF = read(ROOT / 'src/lib/data/bridge-profiles.json')['points']
m = city(); nat = Native()


def key(x, z, y): return f'{x:.3f},{z:.3f},{y:.3f}'


def road_height(x, z, legacy):
    v = PROF.get(key(x, z, legacy))
    return (v, True) if v is not None else (float(surface(x, z)[0]) / U + max(.071, legacy) + .02, False)


# ---- ramps: rendered grade minus DTM grade along non-bridge segments
print('== Non-bridge segments whose rendered grade departs from the DTM grade')
rows = []
for r in m['roads']:
    if r['kind'] == 'stream' or r.get('bridge') or r.get('tunnel'):
        continue
    L = np.hypot(*np.subtract(r['b'], r['a'])) * U
    if L < 3:
        continue
    ya, ha = road_height(*r['a'], r['yA']); yb, hb = road_height(*r['b'], r['yB'])
    Ea, Na = scene_to_tm(*r['a']); Eb, Nb = scene_to_tm(*r['b'])
    da, db = nat.sample(np.array([Ea, Eb]), np.array([Na, Nb]))
    rg = (yb - ya) * U / L; dg = (db - da) / L
    rows.append((abs(rg - dg), r['kind'], r['way'], r['name'], L, rg, dg, (ya * U - da), (yb * U - db), ha or hb,
                 r['yA'], r['yB'], Ea, Na))
ex = np.array([x[0] for x in rows])
for k in ('road', 'path', 'tram', 'rail'):
    e = np.array([x[0] for x in rows if x[1] == k])
    print(f'  {k:5s} segs={len(e)} excess grade >2%: {(e > .02).sum()}  >5%: {(e > .05).sum()}  >10%: {(e > .10).sum()}  >20%: {(e > .2).sum()}')
print('  worst 20:')
for x in sorted(rows, key=lambda r: -r[0])[:20]:
    E, N = x[12], x[13]; lon, lat = TO_GEO.transform(E, N)
    print(f'    {x[1]:5s} way {x[2]:>10} {x[3][:18]:18} L={x[4]:5.1f} m rendered {x[5]*100:+6.1f}% DTM {x[6]*100:+6.1f}% | '
          f'offset above DTM A {x[7]:+5.2f} B {x[8]:+5.2f} | legacyY {x[10]:.3f}/{x[11]:.3f} | {lat:.5f},{lon:.5f}')
# cause: legacy layer elevation (0.311) or rail rise on non-bridge segments
lay = [x for x in rows if max(x[10], x[11]) > .1]
print(f'  segments carrying legacy elevation >0.1 (layer x 6 m / rail ramps) while not tagged bridge: {len(lay)}; '
      f'excess grade >5%: {sum(1 for x in lay if x[0] > .05)}')

# ---- trams/trains: vehicle Y (RailTraffic -> profileHeight with route legacy y) vs rendered rail top
print('\n== Rail vehicles: backend vehicle origin minus rendered rail top (nearest track segment), metres')
tracks = [r for r in m['roads'] if r['kind'] in ('tram', 'rail')]
mids = []; segdata = []
for r in tracks:
    ya, ha = road_height(*r['a'], r['yA']); yb, hb = road_height(*r['b'], r['yB'])
    linear = bool(r.get('bridge')) or ha or hb
    segdata.append((np.array(r['a']), np.array(r['b']), ya, yb, linear, r['kind'], bool(r.get('bridge'))))
    mids.append(((r['a'][0] + r['b'][0]) / 2, (r['a'][1] + r['b'][1]) / 2))
tree = cKDTree(mids)


def rail_top(p, kind):
    best = None
    for i in tree.query(p, k=12)[1]:
        a, b, ya, yb, lin, k, br = segdata[i]
        if (k == 'tram') != (kind == 'tram'):
            continue
        d = b - a; t = np.clip(np.dot(p - a, d) / max(1e-12, d @ d), 0, 1); dist = np.linalg.norm(a + d * t - p)
        if best is None or dist < best[0]:
            if lin:
                y = ya + (yb - ya) * t
            else:
                y = surface(*p)[0] / U + (ya - surface(*a)[0] / U) * (1 - t) + (yb - surface(*b)[0] / U) * t
            best = (dist, y + .016, br)
    return best


for route in m['transitRoutes']:
    P = np.array(route['points']); diffs = []; onb = []; jumps = []
    prev = None
    for i in range(len(P) - 1):
        a, b = P[i], P[i + 1]
        L = np.hypot(b[0] - a[0], b[2] - a[2])
        for t in np.linspace(0, 1, max(2, int(L * U / 4)), endpoint=False):
            x, z = a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t
            ka, kb = PROF.get(key(a[0], a[2], a[1])), PROF.get(key(b[0], b[2], b[1]))
            if ka is not None or kb is not None:
                y = road_height(a[0], a[2], a[1])[0] * (1 - t) + road_height(b[0], b[2], b[1])[0] * t
            else:
                y = surface(x, z)[0] / U + max(.071, a[1] + (b[1] - a[1]) * t) + .02
            rt = rail_top(np.array([x, z]), route['kind'])
            if rt and rt[0] < .2:
                diffs.append((y - rt[1]) * U); onb.append(rt[2])
            if prev is not None:
                jumps.append(abs(y - prev) * U)
            prev = y
    d = np.array(diffs); ob = np.array(onb, bool)
    print(f"  {route['kind']:5s} {route['id'][:28]:28} off-bridge: {stats(d[~ob])}")
    print(f"  {'':5s} {'':28}  on-bridge: {stats(d[ob])}")
    j = np.array(jumps); print(f"  {'':5s} {'':28}  max height change between 4 m samples: {j.max():.2f} m")
