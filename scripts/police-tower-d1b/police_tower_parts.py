"""Police Tower Phase D1b: the police tower's parts measured from LiDAR (Polishuset, Stinsen 1).

D1 (scripts/police-signs-d1/police_tower_lidar.py) measured the tower's roof as one rectangle,
54.4 × 13.4 m. The roof returns show three parts at two heights, which the photographs confirm
(Hemsö 2023, Commons 2016/2018; docs/police-tower-d1b/data-provenance.md):

  - UPPER block: the full-height slab with the dark SSE gable (the emblem gable), roof ≈ 49.0 m,
    parapet ≈ 49.3–49.5 m RH2000, ≈ 9 m wide;
  - EAST strip: along the east-north-east long side, one storey lower (roof ≈ 45.3 m, a raised
    outer rim ≈ 46.2 m), ending ≈ 4.5 m short of the SSE gable (the recess seen in the photos);
  - NORTH block: the north-north-west end, ≈ 46.3 m.

This script fits the UPPER block's own axis (it differs from D1's whole-roof axis by ≈ 2°) and
reports every part in that frame, plus the rooftop plant and the mast.

Source: Lantmäteriet point cloud, STAC collection `dsm-skoglig-copc` ("Laserdata NH 2020"), tile
y20c012-64950_5675_25 (scan area 20C012, item date 2020-02-03, nominal 1.2 points/m²), ©Lantmäteriet,
CC BY 4.0 — the tile D1 and Landmark B1 used. The raw tile stays local and is not in Git.

Frame (TOWER FRAME, as the scene's tower group):
  - horizontal: SWEREF 99 TM (EPSG:3006) grid metres; origin = centre of the UPPER block's roof
    extent; +a along the UPPER block's long axis towards the SSE gable; +c = +a turned 90°
    counter-clockwise seen from above, i.e. towards the east-north-east façade. In the scene's tower
    group, +a is local +z and +c is local +x (three.js, rotation about +y);
  - vertical: RH2000 metres (the scene's vertical datum: scene y = RH2000 / 25).
  Scene coordinates follow src/lib/data/norrkoping-map.json meta.reference:
  x = (E − E0) / (25·k), z = (N0 − N) / (25·k) (x east, z south, 1 unit = 25 m, k = grid scale factor).
  Grid metres and ground metres differ by k (0.03 %, < 2 cm over the tower): ignored.

Extents use percentiles of the returns (1st/99th along, 2nd/98th across); at 1.2 pt/m² the true
wall can be up to ≈ 0.5 m outside them (`edgeNote`).

Output (deterministic: no timestamps, no machine paths, fixed rounding, sorted keys):
  docs/police-tower-d1b/data/police-tower-parts.json

Usage (codex-runtimes Python 3.12, see CLAUDE.md):
  python -I scripts/police-tower-d1b/police_tower_parts.py [out.json]
The LiDAR tiles and the Python packages are read from <repo>/work/geodata; in a git worktree without
that folder set NKPG_WORK to the main checkout's work/ folder (read only).
"""
import hashlib
import json
import math
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(os.environ.get('NKPG_WORK', ROOT / 'work'))
sys.path.insert(0, str(WORK / 'geodata/python'))
sys.path.insert(0, str(ROOT / 'scripts/geo'))
import numpy as np  # noqa: E402
import lidar_window  # noqa: E402

lidar_window.SRC = WORK / 'geodata/lantmateriet'

BUILDING = 'relation/1356564'  # OSM police complex (tower + low wings, one relation)
TILE = 'y20c012-64950_5675_25.copc.laz'
WINDOW = (568200, 6495580, 568360, 6495700)  # SWEREF 99 TM, complex + ≥ 20 m (as D1)
D1_CENTRE = (568305.61, 6495638.86)  # D1's whole-roof centre (police-tower-lidar.json), a seed only
D1_AXIS = (0.248973, -0.96851)  # D1's whole-roof axis towards the SSE gable, a seed only
UPPER_BAND = (48.5, 50.2)  # RH2000 m: UPPER roof and parapet, below the rooftop plant
LOWER_BAND = (44.5, 48.0)  # RH2000 m: EAST strip and NORTH block roofs
PLANT_MIN = 50.2  # RH2000 m: rooftop plant and masts (≥ 0.8 m above the UPPER roof)
MAST_MIN = 55.0  # RH2000 m: a plant cluster reaching this high is a mast
CELL = 1.5  # m, grid for grouping plant returns into clusters


def r(x, n=2):
    return float(round(float(x), n))


def pct(a, q):
    return float(np.percentile(a, q))


def stats(z):
    if z.size == 0:
        return {'n': 0}
    return {'n': int(z.size), 'p10': r(pct(z, 10)), 'p50': r(pct(z, 50)), 'p90': r(pct(z, 90)),
            'max': r(z.max())}


def main(out):
    m = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text(encoding='utf8'))
    ref = m['meta']['reference']
    E0, N0, K, MPU = ref['originEasting'], ref['originNorthing'], ref['gridScaleFactor'], ref['metresPerUnit']
    building = next(b for b in m['buildings'] if b['id'] == BUILDING)

    E, N, Z, C = lidar_window.points(*WINDOW)
    keep = (C != 7) & (C != 18)  # drop low / high noise
    E, N, Z, C = E[keep], N[keep], Z[keep], C[keep]
    ground_all = C == 2

    # Seed region: D1's frame, |u| < 31, |v| < 10 (the tower and nothing of the low wings above 44 m).
    du, dv = D1_AXIS, (-D1_AXIS[1], D1_AXIS[0])
    su = (E - D1_CENTRE[0]) * du[0] + (N - D1_CENTRE[1]) * du[1]
    sv = (E - D1_CENTRE[0]) * dv[0] + (N - D1_CENTRE[1]) * dv[1]
    region = (np.abs(su) < 31) & (np.abs(sv) < 10) & ~ground_all

    # 1) UPPER block: its own axis from its roof returns.
    up = region & (Z >= UPPER_BAND[0]) & (Z < UPPER_BAND[1])
    P = np.c_[E[up], N[up]]
    c0 = P.mean(axis=0)
    _, _, vt = np.linalg.svd(P - c0, full_matrices=False)
    ax = vt[0]
    if ax[1] > 0:  # towards the SSE gable (southwards)
        ax = -ax
    ae, an = float(ax[0]), float(ax[1])
    ce_, cn_ = -an, ae  # +a turned 90° counter-clockwise: east-north-east
    bearing = (math.degrees(math.atan2(ae, an)) + 360) % 360

    def local(e, n, oe, on):
        de, dn = e - oe, n - on
        return de * ae + dn * an, de * ce_ + dn * cn_

    a, c = local(P[:, 0], P[:, 1], c0[0], c0[1])
    a_lo, a_hi = pct(a, 1), pct(a, 99)
    c_lo, c_hi = pct(c, 2), pct(c, 98)
    oe = c0[0] + (a_lo + a_hi) / 2 * ae + (c_lo + c_hi) / 2 * ce_
    on = c0[1] + (a_lo + a_hi) / 2 * an + (c_lo + c_hi) / 2 * cn_
    A, Cc = local(E, N, oe, on)
    a_up, c_up, z_up = A[up], Cc[up], Z[up]
    upper_ext = {'a0': r(pct(a_up, 1)), 'a1': r(pct(a_up, 99)), 'c0': r(pct(c_up, 2)), 'c1': r(pct(c_up, 98))}
    # Across extent per 4 m slice along the block (checks the fitted axis: no drift along a).
    slices = []
    for s in np.arange(-24, 28, 4):
        sel = (a_up >= s) & (a_up < s + 4)
        if sel.sum() >= 10:
            slices.append([r(s), r(pct(c_up[sel], 2)), r(pct(c_up[sel], 98)), int(sel.sum())])
    inner = (np.abs(a_up - (upper_ext['a0'] + upper_ext['a1']) / 2) < 20) & (c_up > upper_ext['c0'] + 1.5) & (c_up < upper_ext['c1'] - 1.5)
    edge = ((a_up > upper_ext['a1'] - 1.0) | (a_up < upper_ext['a0'] + 1.0) | (c_up < upper_ext['c0'] + 1.0))
    upper = {
        'extent': upper_ext,
        'lengthM': r(upper_ext['a1'] - upper_ext['a0']),
        'widthM': r(upper_ext['c1'] - upper_ext['c0']),
        'acrossBySlice': {'columns': ['a0', 'cP2', 'cP98', 'n'], 'rows': slices},
        'roof': stats(z_up[inner]),
        'edges': stats(z_up[edge]),
        'gableEdge': stats(z_up[a_up > upper_ext['a1'] - 1.0]),
        'returns': int(up.sum()),
    }

    # 2) EAST strip and NORTH block: the lower roofs (44.5–48 m) east of / north of the UPPER block.
    low = region & (Z >= LOWER_BAND[0]) & (Z < LOWER_BAND[1])
    a_lw, c_lw, z_lw = A[low], Cc[low], Z[low]
    east_sel = (c_lw > upper_ext['c1'] - 1.0) & (a_lw > upper_ext['a0'] + 1.0)
    north_sel = a_lw < upper_ext['a0'] - 0.5
    ea, ec, ez = a_lw[east_sel], c_lw[east_sel], z_lw[east_sel]
    east_ext = {'a0': r(pct(ea, 1)), 'a1': r(pct(ea, 99)), 'c0': r(pct(ec, 2)), 'c1': r(pct(ec, 98))}
    # Trough (the roof) and the raised outer rim: the rim's inner edge is where the 1 m column
    # medians (across c) rise above the mid-height between trough and rim.
    mid_a = np.abs(ea - (east_ext['a0'] + east_ext['a1']) / 2) < 18
    trough = stats(ez[mid_a & (ec < east_ext['c0'] + 3.0)])
    rim = stats(ez[mid_a & (ec > east_ext['c1'] - 1.0)])
    cols = []
    for s in np.arange(math.floor(east_ext['c0']), math.ceil(east_ext['c1']), 0.5):
        sel = mid_a & (ec >= s) & (ec < s + 0.5)
        if sel.sum() >= 5:
            cols.append([r(s), r(np.median(ez[sel])), int(sel.sum())])
    half = (trough['p50'] + rim['p50']) / 2
    rim_c0 = next((cv for cv, zm, _ in cols if zm > half and cv > east_ext['c0'] + 1.0), None)
    na_, nc_, nz_ = a_lw[north_sel], c_lw[north_sel], z_lw[north_sel]
    east = {
        'extent': east_ext,
        'trough': trough,
        'rim': rim,
        'rimInnerC': r(rim_c0) if rim_c0 is not None else None,
        'acrossProfile': {'columns': ['c0', 'zP50', 'n'], 'rows': cols},
        'returns': int(east_sel.sum()),
    }
    north = {
        'extent': {'a0': r(pct(na_, 1)), 'a1': r(upper_ext['a0']), 'c0': r(pct(nc_, 2)), 'c1': r(pct(nc_, 98))},
        'roof': stats(nz_),
        'returns': int(north_sel.sum()),
    }
    # Above 13 m nothing stands in the SSE-ENE corner (a > EAST end, c > UPPER edge): the recess.
    corner = region & (A > east_ext['a1'] + 1.0) & (A < upper_ext['a1'] + 1.0) & (Cc > upper_ext['c1'] + 1.0) & (Cc < east_ext['c1']) & (Z > 13.5)
    recess = {'returnsAbove13_5': int(corner.sum())}

    # 3) Rooftop plant and the mast: returns ≥ PLANT_MIN over the tower, grouped by 1.5 m cells
    #    (8-connected) into clusters.
    pl = region & (Z >= PLANT_MIN)
    pa, pc, pz = A[pl], Cc[pl], Z[pl]
    cells = {}
    for i, (x, y) in enumerate(zip(pa, pc)):
        cells.setdefault((math.floor(x / CELL), math.floor(y / CELL)), []).append(i)
    seen, clusters = set(), []
    for start in sorted(cells):
        if start in seen:
            continue
        stack, members = [start], []
        seen.add(start)
        while stack:
            cell = stack.pop()
            members += cells[cell]
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nb = (cell[0] + dx, cell[1] + dy)
                    if nb in cells and nb not in seen:
                        seen.add(nb)
                        stack.append(nb)
        idx = np.array(sorted(members))
        za = pz[idx]
        item = {
            'a0': r(pa[idx].min()), 'a1': r(pa[idx].max()),
            'c0': r(pc[idx].min()), 'c1': r(pc[idx].max()),
            'top': r(za.max()), 'p50': r(np.median(za)), 'n': int(idx.size),
            'mast': bool(za.max() >= MAST_MIN),
        }
        if item['mast']:
            # The mast stands at its highest return; the equipment at its foot is the rest.
            hi = idx[np.argmax(za)]
            item['mastAt'] = [r(pa[hi]), r(pc[hi])]
            item['baseTop'] = r(za[za < MAST_MIN].max()) if (za < MAST_MIN).any() else None
        clusters.append(item)
    clusters.sort(key=lambda k: (k['a0'], k['c0']))

    # 4) Ground (class 2) in front of the SSE gable: 5–25 m out, across the UPPER width (as D1).
    fa, fc = A[ground_all], Cc[ground_all]
    front = (fa > upper_ext['a1'] + 5) & (fa < upper_ext['a1'] + 25) & (fc > upper_ext['c0']) & (fc < upper_ext['c1'])

    def scene(e, n):
        return [round((e - E0) / (MPU * K), 4), round((N0 - n) / (MPU * K), 4)]

    gable_e = oe + upper_ext['a1'] * ae
    gable_n = on + upper_ext['a1'] * an
    tile = WORK / 'geodata/lantmateriet' / TILE
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
            'bandsRH2000': {'upper': list(UPPER_BAND), 'lower': list(LOWER_BAND), 'plant': PLANT_MIN,
                            'mast': MAST_MIN},
            'seedFrame': {'centreSweref': list(D1_CENTRE), 'axisSweref': list(D1_AXIS),
                          'from': 'docs/police-signs-d1/data/police-tower-lidar.json'},
            'script': 'scripts/police-tower-d1b/police_tower_parts.py',
            'osmBuilding': BUILDING,
            'osmBuildingName': building['name'],
        },
        'frame': {
            'centreSweref': [r(oe), r(on)],
            'centreScene': scene(oe, on),
            'axisSweref': [round(ae, 6), round(an, 6)],
            'axisBearingDeg': r(bearing, 2),
            'gableCentreSweref': [r(gable_e), r(gable_n)],
            'gableCentreScene': scene(gable_e, gable_n),
            'units': 'a along the UPPER block towards the SSE gable (scene local +z), c towards ENE '
                     '(local +x); metres; heights RH2000 m',
        },
        'upper': upper,
        'east': east,
        'north': north,
        'recess': recess,
        'plant': clusters,
        'ground': {'gableFront': stats(Z[ground_all][front])},
        'edgeNote': 'extents are percentiles of roof returns (1/99 along, 2/98 across); at 1.2 pt/m² '
                    'the true wall can be up to ~0.5 m outside them',
        'points': {'total': int(Z.size), 'ground': int(ground_all.sum())},
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(result, sort_keys=True, ensure_ascii=False, separators=(',', ':'), indent=1)
    out.write_text(text + '\n', encoding='utf8', newline='\n')
    print(json.dumps({'out': out.name, 'frame': result['frame'], 'upper': {k: upper[k] for k in
                      ('extent', 'roof', 'edges', 'gableEdge')}, 'east': {k: east[k] for k in
                      ('extent', 'trough', 'rim', 'rimInnerC')}, 'north': north, 'recess': recess,
                      'plant': clusters, 'ground': result['ground']}, indent=1))


if __name__ == '__main__':
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs/police-tower-d1b/data/police-tower-parts.json')
