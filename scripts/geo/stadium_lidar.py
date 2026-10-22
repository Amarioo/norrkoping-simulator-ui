"""Step 6: measured heights of Idrottsparken from Lantmäteriet Laserdata NH 2020 (CC BY 4.0).

Reads the local COPC delivery around the arena, converts the returns into the arena frame used by
src/lib/stadium/ (origin = centre of OSM pitch way/100955051, +x towards the west stand, +z towards
the north stand, metres) and writes:

  <out>/stadium-lidar.json   height statistics per stand / roof / mast candidate (metres above the
                             pitch ground level and RH2000)
  <out>/height-map.png       1 m grid of the highest non-noise return above the pitch level
  <out>/section-*.png        cross-sections through each stand (all returns within ±2 m)

Usage (codex-runtimes Python 3.12, see docs/claude-progress.md):
  python scripts/geo/stadium_lidar.py work/step6/lidar
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
import laspy  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

# Scene frame (README "Koordinatsystem"); identical to src/lib/geo/sweref99tm.js.
ORIGIN_E, ORIGIN_N, SCALE, MPU = 569030.0, 6494989.0, 0.9996584126, 25.0
# Arena frame (mapLandmarks.ts / stadium/frame.ts): pitch bounding-box centre and longest-edge angle.
CENTRE = (-33.287, 25.3445)
ROTATION = math.radians(171.6824852858716)
EXTENT = 260.0  # metres around the centre


def to_local(e, n):
    x = (e - ORIGIN_E) / (MPU * SCALE)
    z = (ORIGIN_N - n) / (MPU * SCALE)
    dx, dz = x - CENTRE[0], z - CENTRE[1]
    c, s = math.cos(ROTATION), math.sin(ROTATION)
    return (dx * c - dz * s) * MPU, (dx * s + dz * c) * MPU


def load(directory):
    # Arena centre in SWEREF: E 568 198, N 6 494 356 -> tile 64925_5675 (2.5 km tiles).
    xs, ys, zs, cls = [], [], [], []
    for file in sorted(directory.glob('*64925_5675*.copc.laz')):
        with laspy.open(file) as reader:
            for chunk in reader.chunk_iterator(2_000_000):
                e = np.asarray(chunk.x)
                n = np.asarray(chunk.y)
                keep = (np.abs(e - 568198.1) < EXTENT + 40) & (np.abs(n - 6494355.6) < EXTENT + 40)
                if not keep.any():
                    continue
                lx, lz = to_local(e[keep], n[keep])
                xs.append(lx)
                ys.append(lz)
                zs.append(np.asarray(chunk.z)[keep])
                cls.append(np.asarray(chunk.classification)[keep])
    return np.concatenate(xs), np.concatenate(ys), np.concatenate(zs), np.concatenate(cls)


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'work/step6/lidar')
    out.mkdir(parents=True, exist_ok=True)
    x, z, h, c = load(ROOT / 'work/geodata/lantmateriet')
    usable = (c != 7) & (c != 18)  # low/high noise
    x, z, h, c = x[usable], z[usable], h[usable], c[usable]
    on_pitch = (np.abs(x) < 30) & (np.abs(z) < 48) & (c == 2)
    pitch = float(np.median(h[on_pitch]))
    rel = h - pitch
    report = {
        'source': 'Lantmäteriet Laserdata NH 2020 (tile 64925_5675), CC BY 4.0, processed',
        'frame': 'arena local metres: +x west stand, +z north stand; origin OSM pitch way/100955051 centre',
        'pitchGroundRH2000': pitch,
        'pitchGroundSpread': [float(np.percentile(h[on_pitch], q)) for q in (5, 50, 95)],
        'points': int(len(h)),
    }

    def stat(name, x0, x1, z0, z1, classes=(1,), lo=-5.0, hi=80.0):
        m = (x >= x0) & (x < x1) & (z >= z0) & (z < z1) & (rel > lo) & (rel < hi) & np.isin(c, classes)
        if not m.any():
            report[name] = None
            return
        r = rel[m]
        report[name] = {
            'box': [x0, x1, z0, z1],
            'n': int(m.sum()),
            'p50': float(np.percentile(r, 50)),
            'p90': float(np.percentile(r, 90)),
            'p99': float(np.percentile(r, 99)),
            'max': float(r.max()),
        }

    # Stands and roofs (boxes from the OSM building parts, see docs/step6/stadium-references.md).
    stat('westStandRoof', 40, 66, -60, 55, lo=8)
    stat('westProjection', 66, 73, -19, 28)
    stat('northStandRoof', -36, 36, 63, 89, lo=8)
    stat('eastStandRoof', -64, -38, -50, 60, lo=8)
    stat('southTerrace', -38, 30, -80, -62)
    stat('swCornerRoof', 32, 65, -81, -63, lo=8)
    stat('neCorner', -63, -38, 63, 89)
    stat('nwCorner', 38, 65, 63, 89)
    stat('seCornerOpen', -64, -40, -80, -55)
    stat('teknikhallen', -37, 38, 90, 140)
    stat('tennishallen', 67, 85, 97, 139)
    for name, x0, x1 in (('westBand', 38, 66), ('eastBand', -64, -38)):
        # Height profile across the stand (depth from the pitch edge), 1 m bins, p95 of returns.
        prof = []
        for d in range(0, 30):
            xa = 37.6 + d if x0 > 0 else -37.6 - d - 1
            m = (x >= xa) & (x < xa + 1) & (np.abs(z) < 40) & (c == 1)
            prof.append(round(float(np.percentile(rel[m], 95)), 2) if m.sum() > 5 else None)
        report[name + 'ProfileP95'] = prof
    prof = []
    for d in range(0, 30):
        za = 61.6 + d
        m = (z >= za) & (z < za + 1) & (np.abs(x) < 30) & (c == 1)
        prof.append(round(float(np.percentile(rel[m], 95)), 2) if m.sum() > 5 else None)
    report['northBandProfileP95'] = prof
    prof = []
    for d in range(0, 30):
        za = -61.6 - d - 1
        m = (z >= za) & (z < za + 1) & (x > -36) & (x < 28) & np.isin(c, (1, 2))
        prof.append(round(float(np.percentile(rel[m], 95)), 2) if m.sum() > 5 else None)
    report['southBandProfileP95'] = prof

    # Tall slender objects: 2 m cells whose highest return is > 22 m above the pitch and > 6 m above
    # every neighbouring cell's 3x3 median (floodlight masts, the water tower is excluded by size).
    cell = 2.0
    n = int(2 * EXTENT / cell)
    grid = np.full((n, n), -np.inf)
    ix = ((x + EXTENT) / cell).astype(int)
    iz = ((z + EXTENT) / cell).astype(int)
    ok = (ix >= 0) & (ix < n) & (iz >= 0) & (iz < n)
    np.maximum.at(grid, (iz[ok], ix[ok]), rel[ok])
    candidates = []
    for j in range(1, n - 1):
        for i in range(1, n - 1):
            v = grid[j, i]
            if v < 22:
                continue
            ring = np.concatenate([grid[j - 1, i - 1:i + 2], grid[j + 1, i - 1:i + 2], grid[j, [i - 1, i + 1]]])
            ring = ring[np.isfinite(ring)]
            if ring.size and v - np.median(ring) > 6:
                candidates.append((i * cell - EXTENT + cell / 2, j * cell - EXTENT + cell / 2, float(v)))
    # Merge neighbouring cells into one object.
    objects = []
    for px, pz, v in sorted(candidates, key=lambda t: -t[2]):
        for o in objects:
            if math.hypot(o['x'] - px, o['z'] - pz) < 8:
                break
        else:
            m = (np.hypot(x - px, z - pz) < 3) & (rel > 3)
            objects.append({'x': round(px, 1), 'z': round(pz, 1), 'top': round(v, 1),
                            'returnsAbove3m': int(m.sum())})
    report['tallObjects'] = objects

    # Height map image: 1 m pixels, highest return above the pitch level.
    px = 1.0
    n = int(2 * EXTENT / px)
    img = np.full((n, n), np.nan)
    ix = ((x + EXTENT) / px).astype(int)
    iz = ((z + EXTENT) / px).astype(int)
    ok = (ix >= 0) & (ix < n) & (iz >= 0) & (iz < n)
    tmp = np.full((n, n), -np.inf)
    np.maximum.at(tmp, (iz[ok], ix[ok]), rel[ok])
    img = np.where(np.isfinite(tmp), tmp, np.nan)
    norm = np.clip((np.nan_to_num(img, nan=-5) + 5) / 55, 0, 1)
    rgb = np.stack([norm * 255, (1 - abs(norm - 0.5) * 2) * 255, (1 - norm) * 255], -1).astype(np.uint8)
    # Image rows: +z (north) up, +x (west) left, as seen from above with north up.
    rgb = rgb[::-1, ::-1]
    im = Image.fromarray(rgb).resize((n * 2, n * 2), Image.NEAREST)
    d = ImageDraw.Draw(im)
    for o in objects:
        cx, cy = (EXTENT - o['x']) * 2, (EXTENT - o['z']) * 2
        d.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], outline=(255, 255, 255), width=2)
        d.text((cx + 10, cy - 6), f"{o['top']:.0f} m", fill=(255, 255, 255))
    d.text((8, 8), 'Laserdata NH 2020 (c) Lantmateriet CC BY 4.0; height above pitch, blue 0 m - red 50 m; north up', fill=(255, 255, 255))
    im.save(out / 'height-map.png')

    # Sections through the stands (all returns within +-2 m of the section line).
    def section(name, along_x, offset, a0, a1):
        m = (np.abs((z if along_x else x) - offset) < 2) & ((x if along_x else z) > a0) & ((x if along_x else z) < a1)
        a = (x if along_x else z)[m]
        r = rel[m]
        w, hgt = int((a1 - a0) * 6), 70 * 6
        im = Image.new('RGB', (w, hgt), (16, 18, 22))
        d = ImageDraw.Draw(im)
        for gy in range(0, 70, 5):
            d.line([0, hgt - gy * 6, w, hgt - gy * 6], fill=(40, 44, 50))
            d.text((2, hgt - gy * 6 - 11), f'{gy}', fill=(90, 96, 104))
        cols = {1: (240, 200, 90), 2: (90, 200, 120), 17: (120, 160, 255)}
        for aa, rr, cc in zip(a, r, c[m]):
            d.point(((aa - a0) * 6, hgt - (rr + 5) * 6), fill=cols.get(int(cc), (200, 200, 200)))
        d.text((6, 6), f'{name}: offset {offset} m, axis {a0}..{a1} m; height above pitch (m)', fill=(255, 255, 255))
        im.save(out / f'section-{name}.png')

    section('across-west-east', True, 0, -110, 110)
    section('across-west-east-z30', True, 30, -110, 110)
    section('along-north-south', False, 0, -140, 150)
    section('along-north-south-x50', False, 50, -140, 150)
    section('along-north-south-x-50', False, -50, -140, 150)
    (out / 'stadium-lidar.json').write_text(json.dumps(report, indent=1) + '\n', encoding='utf8')
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
