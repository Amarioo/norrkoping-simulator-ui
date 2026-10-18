"""LiDAR bridge-deck reference points (Lantmäteriet Laserdata, class 17, 2020) for the Step 2 checks.

Class 17 points of the two central tiles (cached by scripts/audit/a3_extract_lidar.py) are reduced to
the median height per 2 m cell and labelled with the detailed bridge whose OSM outline contains them.
Writes work/elevation-step2/deck-points.json (scene x/z, metres RH2000).
"""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
ref = read(ROOT / 'src/lib/data/norrkoping-map.json')['meta']['reference']
UNIT = ref['metresPerUnit'] * ref['gridScaleFactor']
cache = ROOT / 'work/geodata/lantmateriet/audit'
pts = np.concatenate([np.load(cache / f'lidar_{t}.npy') for t in ('y20c012-64925_5675_25', 'y20c012-64950_5675_25')])
deck = pts[pts[:, 3] == 17]
cells = {}
for e, n, h in zip(deck[:, 0], deck[:, 1], deck[:, 2]):
    cells.setdefault((int(e // 2), int(n // 2)), []).append(h)
bridges = read(ROOT / 'src/lib/data/city-bridges.json')['bridges']


def inside(x, z, ring):
    r, ok = ring, False
    for i in range(len(r)):
        (ax, az), (bx, bz) = r[i - 1], r[i]
        if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax:
            ok = not ok
    return ok


out = []
for (ce, cn), hs in cells.items():
    if len(hs) < 3:
        continue
    E, N = ce * 2 + 1, cn * 2 + 1
    x, z = (E - ref['originEasting']) / UNIT, (ref['originNorthing'] - N) / UNIT
    name = next((b['name'] for b in bridges if inside(x, z, b['ring'])), 'other')
    out.append({'x': round(x, 4), 'z': round(z, 4), 'metres': round(float(np.median(hs)), 3), 'bridge': name})
(ROOT / 'work/elevation-step2/deck-points.json').write_text(json.dumps(out), encoding='utf8')
from collections import Counter
print(len(out), Counter(o['bridge'] for o in out))
