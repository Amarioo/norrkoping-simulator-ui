import sys, numpy as np
from pathlib import Path
from PIL import Image, ImageDraw
d = np.load('work/step35/water/cells.npz')
E0, N1, step = float(d['E0']), float(d['N1']), float(d['step'])
lv, mk, gr = d['level'], d['mask'], d['ground']
cE0, cE1, cN0, cN1 = [float(v) for v in sys.argv[1:5]]; scale = int(sys.argv[5]) if len(sys.argv) > 5 else 2
c0 = int((cE0 - E0) / step); c1 = int((cE1 - E0) / step); r0 = int((N1 - cN1) / step); r1 = int((N1 - cN0) / step)
g = gr[r0:r1, c0:c1]; l = lv[r0:r1, c0:c1]; m = mk[r0:r1, c0:c1]
gy, gx = np.gradient(np.nan_to_num(g, nan=np.nanmean(g)))
shade = np.clip(0.75 + (-gx + gy) * 0.3, 0, 1)
rgb = np.stack([shade * 205, shade * 205, shade * 195], -1)
rgb[m] = rgb[m] * 0.55 + np.array([255, 255, 255]) * 0.45
edges = [-1, .35, .6, .9, 1.5, 3, 4.5, 6, 7.5, 9, 10.5, 12, 13.5, 15, 16.5, 18, 21, 40]
pal = [(10,30,120),(20,60,200),(40,120,240),(40,180,230),(30,200,160),(80,210,80),(160,220,40),(230,220,30),(250,180,30),(245,130,30),(235,80,30),(220,40,60),(200,30,120),(160,30,160),(110,30,170),(70,20,120),(30,10,60)]
for i in range(len(edges) - 1):
    sel = m & (l >= edges[i]) & (l < edges[i + 1]); rgb[sel] = pal[i]
img = Image.fromarray(rgb.astype(np.uint8)).resize(((c1 - c0) * scale, (r1 - r0) * scale), Image.NEAREST)
dr = ImageDraw.Draw(img)
for E in range(int(cE0 // 100 * 100 + 100), int(cE1), 100):
    x = (E - cE0) / step * scale; dr.line([(x, 0), (x, 8)], fill=(0, 0, 0)); dr.text((x + 2, 0), str(E)[-4:], fill=(0, 0, 0))
for N in range(int(cN0 // 100 * 100 + 100), int(cN1), 100):
    y = (cN1 - N) / step * scale; dr.line([(0, y), (8, y)], fill=(0, 0, 0)); dr.text((10, y - 5), str(N)[-4:], fill=(0, 0, 0))
for i, (a, b) in enumerate(zip(edges, edges[1:])):
    dr.rectangle([img.width - 90, 10 + i * 14, img.width - 76, 22 + i * 14], fill=pal[i]); dr.text((img.width - 72, 10 + i * 14), f'{a:g}-{b:g}', fill=(0, 0, 0))
img.save(sys.argv[6] if len(sys.argv) > 6 else 'work/step35/water/zoom.png')
