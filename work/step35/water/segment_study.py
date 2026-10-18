"""Scratch: hydro-flattened DTM regions inside the OSM water mask, class 9 level per region, and
how many OSM water polygons span more than one region."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

d = np.load(ROOT / 'work/step35/water/cells.npz'); D = np.load(ROOT / 'work/step35/water/dtm2.npy')
E0, N1, STEP = float(d['E0']), float(d['N1']), float(d['step'])
mask, c9 = d['mask'], d['level']
H, W = mask.shape
# 1. flat regions: 4-neighbour edges inside the mask with |dDTM| < tol
tol = 0.03
same_r = mask[:, 1:] & mask[:, :-1] & (np.abs(D[:, 1:] - D[:, :-1]) < tol)
same_d = mask[1:, :] & mask[:-1, :] & (np.abs(D[1:, :] - D[:-1, :]) < tol)
# union-find via scipy: build graph labels with connected components on a sparse graph
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
idx = np.arange(H * W).reshape(H, W)
r1 = np.concatenate([idx[:, :-1][same_r], idx[:-1, :][same_d]])
r2 = np.concatenate([idx[:, 1:][same_r], idx[1:, :][same_d]])
g = coo_matrix((np.ones(len(r1), np.int8), (r1, r2)), shape=(H * W, H * W))
n, lab = connected_components(g, directed=False)
lab = lab.reshape(H, W); lab[~mask] = -1
ids, counts = np.unique(lab[mask], return_counts=True)
big = ids[counts * 4 >= 400]  # >= 400 m2 flat regions
print('flat regions', len(ids), 'big', len(big))
keep = np.isin(lab, big)
# 2. assign remaining mask cells to nearest big region (within the mask)
dist, (ri, ci) = ndimage.distance_transform_edt(~keep, return_indices=True)
reach = np.where(mask, lab[ri, ci], -1)
# 3. per reach: DTM level and class 9 stats
rows = []
for k in big:
    sel = reach == k
    v = c9[sel]; v = v[np.isfinite(v)]
    dl = float(np.median(D[lab == k]))
    rr, cc = np.nonzero(sel)
    rows.append((int(k), int(sel.sum()) * 4, dl, len(v), *(np.percentile(v, [10, 50, 90]) if len(v) else (np.nan,) * 3),
                 E0 + cc.mean() * STEP, N1 - rr.mean() * STEP))
rows.sort(key=lambda r: -r[1])
for r in rows[:45]:
    print('reach %8d area %9d m2 dtm %7.2f class9 n %7d p10/50/90 %6.2f %6.2f %6.2f  d %5.2f  E %d N %d' % (*r[:7], r[5] - r[2], r[7], r[8]))
print('reaches with class9 >= 25 cells:', sum(1 for r in rows if r[3] >= 25), 'of', len(rows))
np.save(ROOT / 'work/step35/water/reach.npy', reach)
# 4. OSM water polygons spanning several reaches
REF = json.loads((ROOT / 'src/lib/data/terrain.json').read_text(encoding='utf-8'))['reference']
UNIT = REF['metresPerUnit'] * REF['gridScaleFactor']
city = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text(encoding='utf-8'))
multi = 0; areas = [a for a in city['areas'] if a['kind'] == 'water']
for a in areas:
    img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
    for i, ring in enumerate(a['rings']):
        dr.polygon([((REF['originEasting'] + x * UNIT - E0) / STEP, (N1 - (REF['originNorthing'] - z * UNIT)) / STEP) for x, z in ring], fill=0 if i else 255)
    m = np.asarray(img) > 0
    labs, cnt = np.unique(reach[m & (reach >= 0)], return_counts=True)
    if len(cnt) and cnt.max() < 0.98 * cnt.sum():
        multi += 1
        top = sorted(zip(cnt, labs), reverse=True)[:5]
        print('multi', a['id'], sum(len(r) for r in a['rings']), 'verts', [(int(l), int(c) * 4) for c, l in top])
print('water areas', len(areas), 'spanning >1 reach', multi)
