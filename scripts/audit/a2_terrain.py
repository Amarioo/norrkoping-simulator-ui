import hashlib, numpy as np
from common import *

staged = np.fromfile(DTM / 'prepared/ground.f32', dtype='<f4').reshape(TILE['rows'], TILE['columns'])
print('active grid == staged prepare-dtm grid:', np.array_equal(staged.astype(np.float64), G, equal_nan=True))
print('revision hash matches grid:', TERRAIN['revision'].startswith('lm-dtm-' + hashlib.sha256(staged.tobytes()).hexdigest()[:16]))
print('NaN cells:', int(np.isnan(G).sum()), '| range m:', round(float(np.nanmin(G)), 2), round(float(np.nanmax(G)), 2))
i = np.unravel_index(np.nanargmin(G), G.shape)
xm, zm = TILE['x'] + i[1] * TILE['step'], TILE['z'] + i[0] * TILE['step']
print('lowest cell at scene', round(xm, 1), round(zm, 1), 'TM', [round(v) for v in scene_to_tm(xm, zm)])

nat = Native()
rng = np.random.default_rng(1)
water = water_mask_fn()
x0, z0, x1, z1 = city()['meta']['bounds']
gx, gz = np.gradient(G, 5.0); SLOPE = np.hypot(gx, gz)
for label, box, n in [('whole map', (x0 + 1, z0 + 1, x1 - 1, z1 - 1), 400000),
                      ('fine zone |x|,|z|<64 (10 m mesh)', (-64, -64, 64, 64), 300000),
                      ('Industrilandskapet + Campus test area', None, 300000)]:
    if box is None:
        E = rng.uniform(568150, 569300, n); N = rng.uniform(6494800, 6495500, n); x, z = tm_to_scene(E, N)
    else:
        x = rng.uniform(box[0], box[2], n); z = rng.uniform(box[1], box[3], n); E, N = scene_to_tm(x, z)
    ref = nat.sample(E, N); g5 = sample5(x, z); s = surface(x, z); w = water(x, z)
    ok = np.isfinite(ref)
    print(f'\n== {label}')
    print('  5 m grid vs native 1 m, land :', stats((g5 - ref)[ok & ~w]))
    print('  rendered vs native 1 m, land :', stats((s - ref)[ok & ~w]))
    print('  rendered vs native 1 m, water:', stats((s - ref)[ok & w]))
    u = ((x - TILE['x']) / TILE['step']).astype(int); v = ((z - TILE['z']) / TILE['step']).astype(int)
    sl = SLOPE[np.clip(v, 0, G.shape[0] - 1), np.clip(u, 0, G.shape[1] - 1)]
    for lo, hi in [(0, .05), (.05, .15), (.15, .3), (.3, 9)]:
        m = ok & ~w & (sl >= lo) & (sl < hi)
        print(f'    land slope {lo:.2f}-{hi:.2f}:', stats((s - ref)[m]))
