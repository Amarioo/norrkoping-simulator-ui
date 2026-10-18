import sys, numpy as np
from pathlib import Path
ROOT = Path('.').resolve(); sys.path.insert(0, str(ROOT / 'work/geodata/python'))
import rasterio
from rasterio.merge import merge
from PIL import Image, ImageDraw
d = np.load('work/step35/water/cells.npz'); E0, N1, step = float(d['E0']), float(d['N1']), float(d['step'])
srcs = [rasterio.open(p) for p in sorted((ROOT / 'work/geodata/lantmateriet/dtm').glob('m6*.tif'))]
mos, tr = merge(srcs); dtm = mos[0].astype(np.float32)
print('dtm', dtm.shape, tr)
# resample DTM to the 2 m mask grid (nearest pixel centre)
H, W = d['mask'].shape
cols = ((E0 + (np.arange(W) + .5) * step) - tr.c) / tr.a
rows = ((N1 - (np.arange(H) + .5) * step) - tr.f) / tr.e
ci = np.clip(np.round(cols - .5).astype(int), 0, dtm.shape[1] - 1); ri = np.clip(np.round(rows - .5).astype(int), 0, dtm.shape[0] - 1)
ok_c = (cols >= 0) & (cols < dtm.shape[1]); ok_r = (rows >= 0) & (rows < dtm.shape[0])
D = dtm[ri][:, ci]; D[~ok_r] = np.nan; D[:, ~ok_c] = np.nan
np.save('work/step35/water/dtm2.npy', D)
