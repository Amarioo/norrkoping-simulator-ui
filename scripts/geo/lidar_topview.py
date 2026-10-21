"""Step 5.1: LiDAR-derived top views with the OSM network drawn on top (stand-in for aerial imagery, which
is not available offline). Three panels, north up, same extent:
  1. LiDAR intensity of the ground (class 2) returns: asphalt dark, markings, kerbs and grass bright;
  2. LiDAR classes: ground grey, bridge (17) red, unclassified (1: vegetation, buildings, vehicles) green;
  3. native 1 m DTM (retained decks corrected) as hillshade with 0.5 m height bands: walls, quays, cuttings.
OSM: drawn road strips (outline at their drawn width) yellow, bridges orange, rails cyan, tram magenta.

Usage (geodata Python): python scripts/geo/lidar_topview.py E0 N0 E1 N1 out.png [pixel m, default 0.25]
"""
import json, math, sys, warnings
warnings.filterwarnings("ignore", category=RuntimeWarning)
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python')); sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from PIL import Image, ImageDraw
import dtm_corrections
from lidar_window import points


def main():
    e0, n0, e1, n1 = map(float, sys.argv[1:5]); out = Path(sys.argv[5]); px = float(sys.argv[6]) if len(sys.argv) > 6 else 0.25
    W, H = int((e1 - e0) / px), int((n1 - n0) / px)
    E, N, Z, C, I = points(e0, n0, e1, n1, intensity=True)
    col = ((E - e0) / px).astype(int).clip(0, W - 1); row = ((n1 - N) / px).astype(int).clip(0, H - 1)
    # 1. intensity of ground returns (mean per pixel, gaps filled from the nearest coarser level)
    g = C == 2
    acc = np.zeros((H, W)); cnt = np.zeros((H, W))
    np.add.at(acc, (row[g], col[g]), I[g].astype(float)); np.add.at(cnt, (row[g], col[g]), 1)
    inten = np.where(cnt > 0, acc / np.maximum(cnt, 1), np.nan)
    for _ in range(6):
        if not np.isnan(inten).any(): break
        pad = np.pad(inten, 1, mode='edge')
        neigh = np.nanmean(np.stack([pad[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)]), 0)
        inten = np.where(np.isnan(inten), neigh, inten)
    inten = np.where(np.isnan(inten), np.nanmedian(inten), inten)
    lo, hi = np.nanpercentile(inten, [2, 98])
    p1 = np.nan_to_num((inten - lo) / max(hi - lo, 1e-6), nan=0).clip(0, 1)
    img1 = np.repeat((p1 * 255).astype(np.uint8)[:, :, None], 3, 2)
    # 2. classes (highest class priority per pixel: 17 > 1 > 2 > other)
    img2 = np.full((H, W, 3), 30, np.uint8)
    for k, rgb in ((9, (40, 70, 140)), (2, (150, 150, 150)), (1, (60, 150, 60)), (17, (220, 40, 40))):
        m = C == k
        for dy in (0, 1):
            for dx in (0, 1): img2[(row[m] + dy).clip(0, H - 1), (col[m] + dx).clip(0, W - 1)] = rgb
    # 3. hillshade of the native DTM
    native, info = dtm_corrections.native_mosaic(); corr = dtm_corrections.corrected_pixels()
    r0 = int(info['top'] - n1); c0 = int(e0 - info['left'])
    blk = dtm_corrections.apply_to_block(np.array(native[r0:r0 + int(n1 - n0) + 1, c0:c0 + int(e1 - e0) + 1]), r0, c0, corr)
    gy, gx = np.gradient(blk)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(315), math.radians(45)
    shade = (np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)).clip(0, 1)
    band = (np.floor(blk / 0.5) % 2) * 0.12
    s3 = (shade * 0.85 + band).clip(0, 1)
    s3 = np.kron(s3, np.ones((int(round(1 / px)), int(round(1 / px)))))[:H, :W]
    img3 = np.repeat((s3 * 255).astype(np.uint8)[:, :, None], 3, 2)
    # OSM overlay
    city = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text(encoding='utf-8-sig'))
    ref = city['meta']['reference']; U = ref['metresPerUnit']; unit = U * ref['gridScaleFactor']
    sw = lambda p: (ref['originEasting'] + p[0] * unit, ref['originNorthing'] - p[1] * unit)
    to_px = lambda e, n: ((e - e0) / px, (n1 - n) / px)
    panels = []
    for arr in (img1, img2, img3):
        im = Image.fromarray(arr); d = ImageDraw.Draw(im)
        for r in city['roads']:
            if r['kind'] not in ('road', 'rail', 'tram'): continue
            A, B = np.array(sw(r['a'])), np.array(sw(r['b']))
            if max(A[0], B[0]) < e0 or min(A[0], B[0]) > e1 or max(A[1], B[1]) < n0 or min(A[1], B[1]) > n1: continue
            dv = B - A; L = math.hypot(*dv)
            if L < 1e-6: continue
            nv = np.array([-dv[1], dv[0]]) / L * (r['width'] * U / 2 if r['kind'] == 'road' else 0.75)
            colr = (255, 140, 0) if r.get('bridge') else {'road': (255, 230, 0), 'rail': (0, 220, 255), 'tram': (255, 0, 220)}[r['kind']]
            quad = [to_px(*(A - nv)), to_px(*(B - nv)), to_px(*(B + nv)), to_px(*(A + nv))]
            d.line(quad + [quad[0]], fill=colr, width=1)
            d.line([to_px(*A), to_px(*B)], fill=colr, width=1)
        panels.append(im)
    gap = 8
    sheet = Image.new('RGB', (W * 3 + gap * 2, H + 22), (255, 255, 255))
    for k, im in enumerate(panels): sheet.paste(im, (k * (W + gap), 22))
    d = ImageDraw.Draw(sheet)
    for k, t in enumerate(('LiDAR ground intensity + OSM', 'LiDAR classes (grey 2, red 17, green 1)', 'native DTM hillshade, 0.5 m bands')):
        d.text((k * (W + gap) + 4, 4), t, fill=(0, 0, 0))
    d.text((4, H + 8), f'E {e0:.0f}-{e1:.0f}  N {n0:.0f}-{n1:.0f}  ({px} m/px)', fill=(255, 255, 255))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print('wrote', out, sheet.size)


if __name__ == '__main__':
    main()
