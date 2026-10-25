"""Landmark B1: measured dimensions of Norrköpings rådhus (town hall) and its tower from LiDAR.

Source: Lantmäteriet point cloud, STAC collection `dsm-skoglig-copc` (called "Laserdata NH 2020" elsewhere in
this project), tile y20c012-64950_5675_25 (scan area 20C012, item date 2020-02-03, nominal 1.2 points/m²),
©Lantmäteriet, CC BY 4.0. The raw tile stays local in work/geodata/lantmateriet/ and is not in Git.

Frame (the BUILDING FRAME used by src/lib/landmarks/radhuset/spec.ts):
  - horizontal: ground metres (scene units × metresPerUnit; scene = (SWEREF 99 TM − origin) / (25 · k),
    k = 0.9996584126, x east, z south), origin = the measured tower centre (stored in scene units),
    +u along the north façade (OSM way/285809156 vertex 0 → vertex 5, i.e. NW → NE corner),
    +v perpendicular to it, pointing out of the north façade (≈ north-north-west);
  - vertical: RH2000 metres (the scene's vertical datum; scene y = RH2000 / 25).

Output (deterministic: no timestamps, no machine paths, fixed rounding, sorted keys):
  docs/landmark-b1/data/radhuset-lidar.json

Usage (codex-runtimes Python 3.12, see docs/claude-progress.md):
  python scripts/landmark-b1/radhuset_lidar.py [out.json]
"""
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/geo'))
from lidar_window import points  # noqa: E402
import numpy as np  # noqa: E402

BUILDING = 'way/285809156'
TILE = 'y20c012-64950_5675_25.copc.laz'
WINDOW = (568940, 6495180, 569080, 6495300)  # SWEREF 99 TM, covers the footprint + 20 m


def r(x, n=2):
    return float(round(float(x), n))


def main(out):
    m = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text(encoding='utf8'))
    ref = m['meta']['reference']
    E0, N0, K, MPU = ref['originEasting'], ref['originNorthing'], ref['gridScaleFactor'], ref['metresPerUnit']
    building = next(b for b in m['buildings'] if b['id'] == BUILDING)
    ring = building['rings'][0]
    # Axis: NW corner (vertex 0) → NE corner (vertex 5) of the north façade, scene units.
    a, b = ring[0], ring[5]
    ux, uz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(ux, uz)
    ux, uz = ux / length, uz / length
    vx, vz = uz, -ux  # out of the north façade

    E, N, Z, C = points(*WINDOW)
    keep = (C != 7) & (C != 18)  # drop low / high noise
    E, N, Z, C = E[keep], N[keep], Z[keep], C[keep]
    X = (E - E0) / (MPU * K)
    S = (N0 - N) / (MPU * K)

    def local(ox, oz):
        dx, dz = X - ox, S - oz
        return (dx * ux + dz * uz) * MPU, (dx * vx + dz * vz) * MPU

    # 1) Tower centre: provisional origin at the highest return, then the mid-points of the tower roof
    #    slices 59–66 m (the pyramid is symmetric; the shaft walls get few returns).
    top = int(np.argmax(Z))
    ox, oz = X[top], S[top]
    for _ in range(2):
        u, v = local(ox, oz)
        mids_u, mids_v = [], []
        for z0 in np.arange(59.0, 66.0, 0.5):
            s = (Z >= z0) & (Z < z0 + 0.5) & (np.abs(u) < 9) & (np.abs(v) < 9)
            if s.sum() < 8:
                continue
            mids_u.append((np.percentile(u[s], 2) + np.percentile(u[s], 98)) / 2)
            mids_v.append((np.percentile(v[s], 2) + np.percentile(v[s], 98)) / 2)
        du, dv = float(np.median(mids_u)), float(np.median(mids_v))
        ox += (du * ux + dv * vx) / MPU
        oz += (du * uz + dv * vz) / MPU
    ox, oz = round(float(ox), 4), round(float(oz), 4)
    u, v = local(ox, oz)

    # 2) Tower slices (0.5 m) above the main roof (> 40 m): extent in u and v.
    slices = []
    for z0 in np.arange(40.0, 74.0, 0.5):
        s = (Z >= z0) & (Z < z0 + 0.5) & (np.abs(u) < 9) & (np.abs(v) < 9)
        n = int(s.sum())
        if n == 0:
            slices.append([r(z0, 1), 0, None, None, None, None])
            continue
        q = (2, 98) if n >= 8 else (0, 100)
        slices.append([
            r(z0, 1), n,
            r(np.percentile(u[s], q[0])), r(np.percentile(u[s], q[1])),
            r(np.percentile(v[s], q[0])), r(np.percentile(v[s], q[1])),
        ])
    near = (np.abs(u) < 9) & (np.abs(v) < 9)
    tower_top = float(Z[near].max())

    # 3) Ground (class 2) around the building, by side.
    g = C == 2
    def ground(sel):
        z = Z[g & sel]
        return {'n': int(z.size), 'p10': r(np.percentile(z, 10)), 'p50': r(np.percentile(z, 50)),
                'p90': r(np.percentile(z, 90))}
    grounds = {
        'towerFront': ground((v > 7) & (v < 14) & (np.abs(u) < 8)),
        'north': ground((v > 7) & (v < 14) & (np.abs(u) < 34)),
        'west': ground((u < -36) & (u > -44) & (v < 4) & (v > -46)),
        'east': ground((u > 36) & (u < 44) & (v < 4) & (v > -46)),
        'courtyard': ground((u > -17) & (u < 17) & (v < -30) & (v > -45)),
    }

    # 4) Footprint in the building frame (OSM vertices).
    footprint = [[r(((p[0] - ox) * ux + (p[1] - oz) * uz) * MPU), r(((p[0] - ox) * vx + (p[1] - oz) * vz) * MPU)]
                 for p in ring]

    # 5) Roof cross-sections of the wings: per (along 1 m × across 0.5 m) cell the highest return, then
    #    per across bin the median over the along positions (robust to dormers, chimneys and gaps).
    def profile(along, across, a0, a1, c0, c1):
        sel = (along >= a0) & (along < a1) & (across >= c0) & (across < c1)
        ai = np.floor(along[sel] - a0).astype(int)
        ci = np.floor((across[sel] - c0) / 0.5).astype(int)
        z = Z[sel]
        cells = {}
        for i, j, h in zip(ai, ci, z):
            key = (i, j)
            if h > cells.get(key, -1e9):
                cells[key] = h
        out = []
        for j in range(int(round((c1 - c0) / 0.5))):
            hs = [h for (i, jj), h in cells.items() if jj == j]
            if len(hs) >= 3:
                out.append([r(c0 + (j + 0.5) * 0.5), r(np.median(hs)), len(hs)])
        return out

    # Wing extents from the OSM footprint (see spec.ts), away from towers and junctions.
    sections = {
        # north wing: across = v, along = u; skip the tower (|u| < 8) and the wing junctions.
        'north': profile(np.where(np.abs(u) < 8, 1e9, u), v, -18, 18, -17, 8),
        'northWestPart': profile(u, v, -18, -8, -17, 8),
        'northEastPart': profile(u, v, 8, 18, -17, 8),
        # west / east wings: across = u, along = −v (south of the north wing).
        'west': profile(-v, u, 20, 44, -36, -17),
        'east': profile(-v, u, 20, 44, 17, 36),
        # courtyard blocks: across = u, along = −v
        'middleNorth': profile(-v, u, 15, 21, -13, 13),
        'middleSouth': profile(-v, u, 21.5, 28, -9, 9),
    }

    # 6) 1 m surface grid (highest non-noise return) over the footprint's bounding box, for the
    #    model-vs-LiDAR check in src/lib/landmarks/radhuset/radhuset.test.ts. Decimetres, -1 = no return.
    fu = [p[0] for p in footprint]
    fv = [p[1] for p in footprint]
    gu0, gv0 = math.floor(min(fu)) - 1, math.floor(min(fv)) - 1
    nu, nv = math.ceil(max(fu)) + 1 - gu0, math.ceil(max(fv)) + 1 - gv0
    grid = np.full((nv, nu), -1, dtype=np.int64)
    iu = np.floor(u - gu0).astype(int)
    iv = np.floor(v - gv0).astype(int)
    ok = (iu >= 0) & (iu < nu) & (iv >= 0) & (iv < nv)
    dm = np.round(Z * 10).astype(np.int64)
    np.maximum.at(grid, (iv[ok], iu[ok]), dm[ok])

    tile = ROOT / 'work/geodata/lantmateriet' / TILE
    sha = hashlib.sha256(tile.read_bytes()).hexdigest()
    result = {
        'source': {
            'collection': 'https://api.lantmateriet.se/stac-hojd/v1/collections/dsm-skoglig-copc',
            'tile': TILE,
            'tileSha256': sha,
            'scanArea': '20C012',
            'itemDate': '2020-02-03',
            'nominalDensityPerM2': 1.2,
            'licence': 'CC-BY-4.0 (©Lantmäteriet)',
            'classesDropped': [7, 18],
            'window': list(WINDOW),
            'script': 'scripts/landmark-b1/radhuset_lidar.py',
        },
        'frame': {
            'building': BUILDING,
            'originScene': [ox, oz],
            'originSweref': [r(E0 + ox * MPU * K, 2), r(N0 - oz * MPU * K, 2)],
            'axisScene': [round(ux, 6), round(uz, 6)],
            'axisFromVertices': [0, 5],
            'units': 'u, v: ground metres (u along the north façade towards NE, v out of it); heights RH2000 m',
        },
        'footprint': footprint,
        'ground': grounds,
        'tower': {
            'topRH2000': r(tower_top),
            'slices': slices,
            'sliceColumns': ['z0', 'count', 'uMin', 'uMax', 'vMin', 'vMax'],
        },
        'sections': sections,
        'sectionColumns': ['across', 'medianMaxZ', 'cells'],
        'surface': {'u0': gu0, 'v0': gv0, 'nu': nu, 'nv': nv, 'cell': 1, 'unit': 'dm RH2000, -1 = none',
                    'rows': grid.tolist()},
        'points': {'total': int(Z.size), 'ground': int(g.sum())},
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(result, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    out.write_text(text + '\n', encoding='utf8', newline='\n')
    print('wrote', out.relative_to(ROOT), len(text), 'bytes; origin', ox, oz, 'top', tower_top)


if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'docs/landmark-b1/data/radhuset-lidar.json')
