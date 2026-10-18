"""Step 3.5 study: measured water levels inside the mapped water polygons.

Mosaics the 2 m LiDAR class 9 grids (work/geodata/lantmateriet/prepared/*.npz: mean of class 9 returns
per 2 m cell, flight 2020), rasterises the OSM water areas of the map, and writes
  work/step35/water/levels.png  - class 9 level (colour) inside mapped water, DTM hillshade elsewhere
  work/step35/water/cells.npz   - the mosaic (E0, N0, step, level, mask)
Run with the geodata Python (see ELEVATION.md).
"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
import numpy as np
from PIL import Image, ImageDraw

PREP = ROOT / 'work/geodata/lantmateriet/prepared'
OUT = ROOT / 'work/step35/water'
OUT.mkdir(parents=True, exist_ok=True)
terrain = json.loads((ROOT / 'src/lib/data/terrain.json').read_text(encoding='utf-8'))
REF = terrain['reference']
UNIT = REF['metresPerUnit'] * REF['gridScaleFactor']
city = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text(encoding='utf-8'))

STEP = 2.0
tiles = sorted(PREP.glob('20c*.json'))
metas = [json.loads(p.read_text()) for p in tiles]
E0 = min(m['bounds'][0] for m in metas); E1 = max(m['bounds'][2] for m in metas)
N0 = min(m['bounds'][1] for m in metas); N1 = max(m['bounds'][3] for m in metas)
W = int(round((E1 - E0) / STEP)); H = int(round((N1 - N0) / STEP))
level = np.full((H, W), np.nan, np.float32); ground = np.full((H, W), np.nan, np.float32)
for p, m in zip(tiles, metas):
    d = np.load(p.with_suffix('.npz'))
    c0 = int(round((m['bounds'][0] - E0) / STEP)); r0 = int(round((N1 - m['bounds'][3]) / STEP))
    w = d['water'][::-1]; g = d['ground'][::-1]  # stored with row 0 = south
    # npz rows: check orientation against bounds (row 0 = north if stored image-style)
    level[r0:r0 + w.shape[0], c0:c0 + w.shape[1]] = w
    ground[r0:r0 + g.shape[0], c0:c0 + g.shape[1]] = g

def to_px(x, z):
    E = REF['originEasting'] + x * UNIT; N = REF['originNorthing'] - z * UNIT
    return (E - E0) / STEP, (N1 - N) / STEP

mask_img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(mask_img)
for a in city['areas']:
    if a['kind'] != 'water': continue
    for k, ring in enumerate(a['rings']):
        dr.polygon([to_px(*p) for p in ring], fill=0 if k else 255)
mask = np.asarray(mask_img) > 0
np.savez_compressed(OUT / 'cells.npz', E0=E0, N1=N1, step=STEP, level=level, ground=ground, mask=mask)
inside = mask & np.isfinite(level)
print('grid', W, H, 'water mask cells', int(mask.sum()), 'with class 9', int(inside.sum()))

# Image: crop to the central river (E 567500-570500, N 6494000-6496500)
cE0, cE1, cN0, cN1 = 567300, 570700, 6493900, 6496600
c0 = int((cE0 - E0) / STEP); c1 = int((cE1 - E0) / STEP); r0 = int((N1 - cN1) / STEP); r1 = int((N1 - cN0) / STEP)
g = ground[r0:r1, c0:c1]; lv = level[r0:r1, c0:c1]; mk = mask[r0:r1, c0:c1]
gy, gx = np.gradient(np.nan_to_num(g, nan=np.nanmean(g)))
shade = np.clip(0.75 + (-gx + gy) * 0.35, 0, 1)
rgb = np.stack([shade * 200, shade * 200, shade * 190], -1)
bands = [(-1, 0.3), (0.3, 0.7), (0.7, 1.5), (1.5, 3), (3, 6), (6, 9), (9, 12), (12, 15), (15, 18), (18, 40)]
cols = [(20, 40, 160), (30, 90, 220), (40, 160, 230), (40, 200, 160), (120, 210, 60), (230, 220, 40),
        (240, 160, 30), (230, 80, 30), (200, 30, 90), (120, 20, 120)]
for (lo, hi), col in zip(bands, cols):
    sel = mk & (lv >= lo) & (lv < hi)
    rgb[sel] = col
rgb[mk & ~np.isfinite(lv)] = (255, 255, 255)
img = Image.fromarray(rgb.astype(np.uint8))
img.save(OUT / 'levels.png')
print('legend (m RH2000):', list(zip(bands, cols)))
