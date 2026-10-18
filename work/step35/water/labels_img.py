import sys, json, numpy as np
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path('.').resolve()
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
from pyproj import Transformer
d = np.load('work/step35/water/cells.npz'); lab = np.load('work/step35/water/labels.npy')
E0, N1, step = float(d['E0']), float(d['N1']), float(d['step'])
cE0, cE1, cN0, cN1, scale = [float(v) for v in sys.argv[1:6]]; scale = int(scale)
c0 = int((cE0 - E0) / step); c1 = int((cE1 - E0) / step); r0 = int((N1 - cN1) / step); r1 = int((N1 - cN0) / step)
L = lab[r0:r1, c0:c1]; lv = d['level'][r0:r1, c0:c1]
rng = np.random.default_rng(3); pal = rng.integers(60, 230, (lab.max() + 1, 3)); pal[0] = (235, 235, 230)
rgb = pal[L].astype(np.uint8)
has = np.isfinite(lv) & (L > 0); rgb[has] = (rgb[has] * 0.6).astype(np.uint8)
img = Image.fromarray(rgb).resize(((c1 - c0) * scale, (r1 - r0) * scale), Image.NEAREST); dr = ImageDraw.Draw(img)
to_tm = Transformer.from_crs(4326, 3006, always_xy=True)
osm = json.loads(Path('work/step35/water/osm-dams.json').read_text(encoding='utf-8'))
P = lambda E, N: ((E - cE0) / step * scale, (cN1 - N) / step * scale)
for e in osm['elements']:
    t = e.get('tags', {}); k = t.get('waterway') or t.get('man_made')
    if e['type'] == 'way' and k in ('dam', 'weir'):
        dr.line([P(*to_tm.transform(g['lon'], g['lat'])) for g in e['geometry']], fill=(255, 0, 0), width=2)
    if e['type'] == 'node' and k == 'waterfall':
        x, y = P(*to_tm.transform(e['lon'], e['lat'])); dr.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 0, 0), width=2)
# label medians
for k in np.unique(L):
    if k == 0: continue
    sel = L == k
    if sel.sum() < 30: continue
    v = lv[sel]; v = v[np.isfinite(v)]
    rr, cc = np.nonzero(sel); i = len(rr) // 2
    dr.text((cc[i] * scale, rr[i] * scale), f'{k}:{np.median(v):.2f}' if len(v) else f'{k}:-', fill=(0, 0, 0))
for E in range(int(cE0 // 100 * 100 + 100), int(cE1), 100):
    x = (E - cE0) / step * scale; dr.text((x + 2, 0), str(E)[-4:], fill=(0, 0, 0)); dr.line([(x, 0), (x, 6)], fill=0)
for N in range(int(cN0 // 100 * 100 + 100), int(cN1), 100):
    y = (cN1 - N) / step * scale; dr.text((2, y), str(N)[-4:], fill=(0, 0, 0)); dr.line([(0, y), (6, y)], fill=0)
img.save(sys.argv[6])
