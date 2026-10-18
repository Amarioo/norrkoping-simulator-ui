"""Scratch: split the mapped water mask at OSM dams/weirs and report class 9 levels per component."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
import numpy as np
from PIL import Image, ImageDraw
from pyproj import Transformer
from scipy import ndimage

d = np.load(ROOT / 'work/step35/water/cells.npz')
E0, N1, STEP = float(d['E0']), float(d['N1']), float(d['step'])
level, mask = d['level'], d['mask']
to_tm = Transformer.from_crs(4326, 3006, always_xy=True)
osm = json.loads((ROOT / 'work/step35/water/osm-dams.json').read_text(encoding='utf-8'))
px = lambda E, N: ((E - E0) / STEP, (N1 - N) / STEP)
bar = Image.new('L', (mask.shape[1], mask.shape[0]), 0); dr = ImageDraw.Draw(bar)
lines = []
for e in osm['elements']:
    t = e.get('tags', {})
    kind = t.get('waterway') or t.get('man_made')
    if e['type'] == 'way' and kind in ('dam', 'weir'):
        pts = [px(*to_tm.transform(g['lon'], g['lat'])) for g in e['geometry']]
        dr.line(pts, fill=255, width=3); lines.append((e['id'], kind, pts))
    if e['type'] == 'node' and kind == 'waterfall':
        E, N = to_tm.transform(e['lon'], e['lat']); print('waterfall', e['id'], round(E, 1), round(N, 1))
barrier = np.asarray(bar) > 0
water = mask & ~barrier
lab, n = ndimage.label(water)
sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
print('components', n)
rows = []
for k in np.argsort(-sizes)[:40]:
    sel = lab == k + 1
    v = level[sel]; v = v[np.isfinite(v)]
    rr, cc = np.nonzero(sel)
    cE = E0 + cc.mean() * STEP; cN = N1 - rr.mean() * STEP
    rows.append((k + 1, int(sizes[k]) * 4, len(v), *(np.percentile(v, [10, 50, 90]).round(2) if len(v) else (np.nan,) * 3), round(cE), round(cN)))
for r in rows: print('comp %4d area %8d m2 class9 cells %7d p10/p50/p90 %6s %6s %6s centre E %d N %d' % r)
np.save(ROOT / 'work/step35/water/labels.npy', lab)
