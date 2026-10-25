"""Police Signs Phase D1: measured dimensions of the police tower (Polishuset, Stinsen 1) from LiDAR.

The emblem sign hangs on the tower's south-south-east gable. Its size and height were measured in a
photograph (docs/police-signs-d1/data-provenance.md) using the gable WIDTH as the scale, and its
position below the parapet; this script supplies that width, the parapet height, the ground and the
gable's position and bearing, so the photo ratios can be turned into metres.

Source: Lantmäteriet point cloud, STAC collection `dsm-skoglig-copc` ("Laserdata NH 2020"), tile
y20c012-64950_5675_25 (scan area 20C012, item date 2020-02-03, nominal 1.2 points/m²), ©Lantmäteriet,
CC BY 4.0 — the same tile Landmark B1 used. The raw tile stays local and is not in Git.

Frame (TOWER FRAME):
  - horizontal: SWEREF 99 TM (EPSG:3006) metres; origin = centre of the tower roof's extent;
    +u along the long axis towards the south-south-east gable (the gable with the emblem),
    +v = +u turned 90° counter-clockwise seen from above (towards the east-north-east façade);
  - vertical: RH2000 metres (the scene's vertical datum: scene y = RH2000 / 25).
  Scene coordinates follow src/lib/data/norrkoping-map.json meta.reference:
  x = (E − E0) / (25·k), z = (N0 − N) / (25·k) (x east, z south, 1 unit = 25 m, k = grid scale factor).

Output (deterministic: no timestamps, no machine paths, fixed rounding, sorted keys):
  docs/police-signs-d1/data/police-tower-lidar.json

Usage (codex-runtimes Python 3.12, see CLAUDE.md):
  python -I scripts/police-signs-d1/police_tower_lidar.py [out.json]
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

BUILDING = 'relation/1356564'  # OSM police complex (footprint of tower + low wings, one relation)
TILE = 'y20c012-64950_5675_25.copc.laz'
WINDOW = (568200, 6495580, 568360, 6495700)  # SWEREF 99 TM, complex + ≥ 20 m
ROOF_BAND = (44.0, 51.0)  # RH2000 m: tower roof and parapet, below rooftop plant and masts


def r(x, n=2):
    return float(round(float(x), n))


def main(out):
    m = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text(encoding='utf8'))
    ref = m['meta']['reference']
    E0, N0, K, MPU = ref['originEasting'], ref['originNorthing'], ref['gridScaleFactor'], ref['metresPerUnit']
    building = next(b for b in m['buildings'] if b['id'] == BUILDING)

    E, N, Z, C = lidar_window.points(*WINDOW)
    keep = (C != 7) & (C != 18)  # drop low / high noise
    E, N, Z, C = E[keep], N[keep], Z[keep], C[keep]
    ground_all = C == 2

    # 1) Tower roof returns: everything in the roof band (the low wings are below 31 m RH2000).
    roof = (Z >= ROOF_BAND[0]) & (Z < ROOF_BAND[1])
    P = np.c_[E[roof], N[roof]]
    c0 = P.mean(axis=0)
    _, _, vt = np.linalg.svd(P - c0, full_matrices=False)
    ax = vt[0]
    if ax[1] > 0:  # point the long axis to the south-south-east gable
        ax = -ax
    ux_e, ux_n = float(ax[0]), float(ax[1])
    vx_e, vx_n = -ux_n, ux_e  # +u turned 90° counter-clockwise (seen from above): towards ENE
    # Bearing clockwise from grid north (degrees).
    bearing = (math.degrees(math.atan2(ux_e, ux_n)) + 360) % 360

    def local(e, n, ce, cn):
        de, dn = e - ce, n - cn
        return de * ux_e + dn * ux_n, de * vx_e + dn * vx_n

    u, v = local(P[:, 0], P[:, 1], c0[0], c0[1])
    # Centre of the extent (2nd/98th percentile edges are robust to stray returns; edges of a
    # 1.2 pt/m² scan sit up to ~0.5 m inside the true wall, see `edgeNote`).
    lo_u, hi_u = np.percentile(u, [1, 99])
    lo_v, hi_v = np.percentile(v, [1, 99])
    cu, cv = (lo_u + hi_u) / 2, (lo_v + hi_v) / 2
    ce = c0[0] + cu * ux_e + cv * vx_e
    cn = c0[1] + cu * ux_n + cv * vx_n
    u, v = local(P[:, 0], P[:, 1], ce, cn)
    zr = Z[roof]
    extent = {
        'uP1': r(np.percentile(u, 1)), 'uP99': r(np.percentile(u, 99)),
        'uMin': r(u.min()), 'uMax': r(u.max()),
        'vP1': r(np.percentile(v, 1)), 'vP99': r(np.percentile(v, 99)),
        'vMin': r(v.min()), 'vMax': r(v.max()),
    }
    length = float(np.percentile(u, 99) - np.percentile(u, 1))
    width = float(np.percentile(v, 99) - np.percentile(v, 1))

    # 2) Roof and parapet heights. The parapet is the top of the gable seen in the photographs:
    #    take the highest returns within 1.5 m of the SSE gable edge.
    gable_edge = u > np.percentile(u, 99) - 1.5
    heights = {
        'roofP50': r(np.median(zr)),
        'roofP90': r(np.percentile(zr, 90)),
        'roofP98': r(np.percentile(zr, 98)),
        'gableEdgeCount': int(gable_edge.sum()),
        'gableEdgeP50': r(np.median(zr[gable_edge])),
        'gableEdgeP90': r(np.percentile(zr[gable_edge], 90)),
        'gableEdgeMax': r(zr[gable_edge].max()),
    }
    # Rooftop plant and masts (above the band), only reported.
    ea, na = local(E, N, ce, cn)
    over = (Z >= ROOF_BAND[1]) & (np.abs(ea) < 35) & (np.abs(na) < 12)
    plant = {'count': int(over.sum()), 'maxRH2000': r(Z[over].max()) if over.any() else None}

    # 3) Ground (class 2) in front of the SSE gable (5–25 m out, across the gable width) and all
    #    round the tower; the gable foot ground sets the sign's height above the ground.
    def ground(sel):
        z = Z[ground_all & sel]
        if z.size == 0:
            return {'n': 0}
        return {'n': int(z.size), 'p10': r(np.percentile(z, 10)), 'p50': r(np.percentile(z, 50)),
                'p90': r(np.percentile(z, 90))}
    half_l = length / 2
    grounds = {
        'gableFront': ground((ea > half_l + 5) & (ea < half_l + 25) & (np.abs(na) < 10)),
        'aroundTower': ground((np.abs(ea) < half_l + 30) & (np.abs(na) < 40)),
    }

    # 3b) The SSE gable is NOT the full tower width: the tall dark part (roof ≈ 49 m) is narrower,
    #     with a lower strip (roof ≈ 45–46.5 m) on the ENE side (+v). Within 8 m of the SSE end,
    #     the across-extent (1st/99th percentile of v) of the returns of each height band. The tall
    #     part's width is the scale of the photograph (its corner strips bound the dark gable).
    end = u > extent['uP99'] - 8
    def across(sel):
        vv = v[sel]
        return {'n': int(vv.size), 'vP1': r(np.percentile(vv, 1)), 'vP99': r(np.percentile(vv, 99)),
                'widthP1P99': r(np.percentile(vv, 99) - np.percentile(vv, 1)),
                'roofP50': r(np.median(zr[sel]))}
    gable_parts = {
        'tallPart': across(end & (zr >= 47.5)),
        'lowerStripEne': across(end & (zr >= 44.0) & (zr < 47.0)),
        'bands': {'tallPartRH2000': [47.5, ROOF_BAND[1]], 'lowerStripRH2000': [44.0, 47.0]},
        'window': 'u > uP99 − 8 m (SSE end)',
    }

    # 4) The gable: centre of its outer face at roof level, its outward normal (bearing) and width.
    gable = {
        'centreSweref': [r(ce + extent['uP99'] * ux_e), r(cn + extent['uP99'] * ux_n)],
        'normalBearingDeg': r(bearing, 1),
        'widthM': r(width),
        'widthNote': 'full tower width; the dark gable with the emblem is only the tall part, see gableParts',
    }

    def scene(e, n):
        return [round((e - E0) / (MPU * K), 4), round((N0 - n) / (MPU * K), 4)]

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
            'roofBandRH2000': list(ROOF_BAND),
            'script': 'scripts/police-signs-d1/police_tower_lidar.py',
            'osmBuilding': BUILDING,
            'osmBuildingName': building['name'],
        },
        'frame': {
            'centreSweref': [r(ce), r(cn)],
            'centreScene': scene(ce, cn),
            'axisSweref': [round(ux_e, 6), round(ux_n, 6)],
            'axisBearingDeg': r(bearing, 1),
            'units': 'u along the long axis towards the SSE gable, v towards ENE; metres; heights RH2000 m',
        },
        'tower': {
            'roofReturns': int(roof.sum()),
            'extent': extent,
            'lengthM': r(length),
            'widthM': r(width),
            'heights': heights,
            'plantAndMasts': plant,
            'edgeNote': 'extents use the 1st/99th percentile of roof returns; at 1.2 pt/m² the true wall '
                        'can be up to ~0.5 m outside them',
        },
        'gable': gable,
        'gableParts': gable_parts,
        'ground': grounds,
        'points': {'total': int(Z.size), 'ground': int(ground_all.sum())},
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(result, sort_keys=True, ensure_ascii=False, separators=(',', ':'), indent=1)
    out.write_text(text + '\n', encoding='utf8', newline='\n')
    print(json.dumps({'out': out.name, 'length': result['tower']['lengthM'], 'width': width,
                      'heights': heights, 'ground': grounds, 'bearing': bearing}, indent=1))


if __name__ == '__main__':
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs/police-signs-d1/data/police-tower-lidar.json')
