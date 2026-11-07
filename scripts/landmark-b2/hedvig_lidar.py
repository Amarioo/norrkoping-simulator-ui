"""Landmark B2: measured dimensions of Hedvigs kyrka (Norrköping) and its bell tower from LiDAR.

Source: Lantmäteriet point cloud, STAC collection `dsm-skoglig-copc` (called "Laserdata NH 2020" elsewhere in
this project), tile y20c012-64950_5675_25 (scan area 20C012, item date 2020-02-03, nominal 1.2 points/m²),
©Lantmäteriet, CC BY 4.0. The raw tile stays local in work/geodata/lantmateriet/ and is not in Git.

Frame (the BUILDING FRAME used by src/lib/landmarks/hedvig/spec.ts):
  - horizontal: ground metres (scene units × metresPerUnit; scene = (SWEREF 99 TM − origin) / (25 · k),
    k = 0.9996584126, x east, z south), origin = the measured tower centre (stored in scene units),
    +u along the nave towards the east end (mean direction of the south wall, OSM way/88741182
    vertices 59 → 43, and the north wall, vertices 7 → 19), +v perpendicular to it towards the north;
  - vertical: RH2000 metres (the scene's vertical datum; scene y = RH2000 / 25).

Output (deterministic: no timestamps, no machine paths, fixed rounding, sorted keys):
  docs/landmark-b2/data/hedvig-lidar.json

Usage (codex-runtimes Python 3.12, see docs/claude-progress.md):
  python scripts/landmark-b2/hedvig_lidar.py [out.json]
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

BUILDING = 'way/88741182'
TILE = 'y20c012-64950_5675_25.copc.laz'
WINDOW = (569000, 6495285, 569090, 6495365)  # SWEREF 99 TM, covers the footprint + ≥ 15 m
SOUTH_WALL = (59, 43)
NORTH_WALL = (7, 19)


def r(x, n=2):
    return float(round(float(x), n))


def main(out):
    m = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text(encoding='utf8'))
    ref = m['meta']['reference']
    E0, N0, K, MPU = ref['originEasting'], ref['originNorthing'], ref['gridScaleFactor'], ref['metresPerUnit']
    building = next(b for b in m['buildings'] if b['id'] == BUILDING)
    ring = building['rings'][0]

    # Axis: mean direction of the two long walls (scene x/z; +u east-north-east, +v north).
    def direction(i, j):
        dx, dz = ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]
        n = math.hypot(dx, dz)
        return dx / n, dz / n
    a, b = direction(*SOUTH_WALL), direction(*NORTH_WALL)
    ux, uz = a[0] + b[0], a[1] + b[1]
    n = math.hypot(ux, uz)
    ux, uz = ux / n, uz / n
    vx, vz = uz, -ux  # scene z points south, so +v (north) is (uz, −ux)

    E, N, Z, C = points(*WINDOW)
    keep = (C != 7) & (C != 18)  # drop low / high noise
    E, N, Z, C = E[keep], N[keep], Z[keep], C[keep]
    X = (E - E0) / (MPU * K)
    S = (N0 - N) / (MPU * K)

    def local(ox, oz):
        dx, dz = X - ox, S - oz
        return (dx * ux + dz * uz) * MPU, (dx * vx + dz * vz) * MPU

    # 1) Tower centre: provisional origin at the highest return (the spire), then the mid-points of the
    #    returns above the nave ridge (25.0 m) in the cap and lantern-roof levels 25.25–31.5 m.
    top = int(np.argmax(Z))
    ox, oz = X[top], S[top]
    for _ in range(2):
        u, v = local(ox, oz)
        mids_u, mids_v = [], []
        for z0 in np.arange(25.25, 31.5, 0.5):
            s = (Z >= z0) & (Z < z0 + 0.5) & (np.abs(u) < 6) & (np.abs(v) < 6.5)
            if s.sum() < 8:
                continue
            mids_u.append((np.percentile(u[s], 2) + np.percentile(u[s], 98)) / 2)
            mids_v.append((np.percentile(v[s], 2) + np.percentile(v[s], 98)) / 2)
        du, dv = float(np.median(mids_u)), float(np.median(mids_v))
        ox += (du * ux + dv * vx) / MPU
        oz += (du * uz + dv * vz) / MPU
    ox, oz = round(float(ox), 4), round(float(oz), 4)
    u, v = local(ox, oz)

    # 2) Tower slices (0.5 m) from the west bay's terrace (17 m) to the top: extent in u and v.
    slices = []
    for z0 in np.arange(17.0, 37.5, 0.5):
        s = (Z >= z0) & (Z < z0 + 0.5) & (np.abs(u) < 6) & (np.abs(v) < 6.5)
        if z0 < 25.5:
            s &= u < 1.5  # below the ridge only the tower's west half is clear of the nave roof
        cnt = int(s.sum())
        if cnt == 0:
            slices.append([r(z0, 1), 0, None, None, None, None])
            continue
        q = (2, 98) if cnt >= 8 else (0, 100)
        slices.append([
            r(z0, 1), cnt,
            r(np.percentile(u[s], q[0])), r(np.percentile(u[s], q[1])),
            r(np.percentile(v[s], q[0])), r(np.percentile(v[s], q[1])),
        ])
    near = (np.abs(u) < 3) & (np.abs(v) < 3)
    tower_top = float(Z[near].max())

    # 3) Ground (class 2) around the building, by side.
    g = C == 2

    def ground(sel):
        z = Z[g & sel]
        return {'n': int(z.size), 'p10': r(np.percentile(z, 10)), 'p50': r(np.percentile(z, 50)),
                'p90': r(np.percentile(z, 90))}
    grounds = {
        'west': ground((u < -10) & (u > -17) & (np.abs(v) < 6)),
        'south': ground((v < -12.5) & (v > -18) & (u > 0) & (u < 30)),
        'north': ground((v > 11) & (v < 18) & (u > 0) & (u < 22)),
        'east': ground((u > 38) & (u < 44) & (np.abs(v) < 10)),
    }

    # 4) Footprint in the building frame (OSM vertices).
    footprint = [[r(((p[0] - ox) * ux + (p[1] - oz) * uz) * MPU), r(((p[0] - ox) * vx + (p[1] - oz) * vz) * MPU)]
                 for p in ring]

    # 5) Roof cross-sections: per (along 1 m × across 0.5 m) cell the highest return, then per across
    #    bin the median over the along positions.
    def profile(along, across, a0, a1, c0, c1):
        sel = (along >= a0) & (along < a1) & (across >= c0) & (across < c1)
        ai = np.floor(along[sel] - a0).astype(int)
        ci = np.floor((across[sel] - c0) / 0.5).astype(int)
        z = Z[sel]
        cells = {}
        for i, j, h in zip(ai, ci, z):
            key = (int(i), int(j))
            if h > cells.get(key, -1e9):
                cells[key] = h
        res = []
        for j in range(int(round((c1 - c0) / 0.5))):
            hs = [h for (i, jj), h in cells.items() if jj == j]
            if len(hs) >= 3:
                res.append([r(c0 + (j + 0.5) * 0.5), r(np.median(hs)), len(hs)])
        return res

    sections = {
        # nave: across = v, along = u, between the tower and the east hip, clear of the sacristy
        'nave': profile(u, v, 6, 24, -13.5, 11),
        # east end: along the axis (across = u) near the ridge line
        'eastEnd': profile(v, u, -2.5, 1.5, 20, 40),
        # west bay: along the axis at its centre line and along its sides (u from the west front)
        'westBayCentre': profile(v, u, -2.5, 1.5, -11, -3.5),
        'westBaySouth': profile(v, u, -7, -5, -11, 2),
        'westBayNorth': profile(v, u, 4, 6, -11, 2),
        # sacristy (north annex): across = u, along = v
        'sacristy': profile(v, u, 11, 19, 22, 35),
        'sacristyEnd': profile(u, v, 27, 30, 10, 22),
    }

    # 6) 1 m surface grid (highest non-noise return) over the footprint's bounding box (+2 m), for the
    #    model-vs-LiDAR check in src/lib/landmarks/hedvig/hedvig.test.ts. Decimetres, -1 = no return.
    fu = [p[0] for p in footprint]
    fv = [p[1] for p in footprint]
    gu0, gv0 = math.floor(min(fu)) - 2, math.floor(min(fv)) - 2
    nu, nv = math.ceil(max(fu)) + 2 - gu0, math.ceil(max(fv)) + 2 - gv0
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
            'script': 'scripts/landmark-b2/hedvig_lidar.py',
        },
        'frame': {
            'building': BUILDING,
            'originScene': [ox, oz],
            'originSweref': [r(E0 + ox * MPU * K, 2), r(N0 - oz * MPU * K, 2)],
            'axisScene': [round(ux, 6), round(uz, 6)],
            'axisFromVertices': {'south': list(SOUTH_WALL), 'north': list(NORTH_WALL)},
            'units': 'u, v: ground metres (u along the nave towards the east end, v towards the north); heights RH2000 m',
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
    main(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'docs/landmark-b2/data/hedvig-lidar.json')
