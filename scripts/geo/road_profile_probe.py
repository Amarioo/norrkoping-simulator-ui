"""Batch B probe: native 1 m DTM along a mapped way near a point (2 m steps), for profile defects.
Usage: python scripts/geo/road_profile_probe.py <way> <E> <N> [radius_m]"""
import json, math, sys
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
info = json.loads((ROOT / 'work/geodata/lantmateriet/step3/native.json').read_text())
nat = np.load(ROOT / 'work/geodata/lantmateriet/step3/native.npy', mmap_mode='r')
city = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text(encoding='utf-8'))
ref = city['meta']['reference']; unit = ref['metresPerUnit'] * ref['gridScaleFactor']
way, E0, N0 = int(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]); R = float(sys.argv[4]) if len(sys.argv) > 4 else 70
def h(E, N):
    return float(nat[int(info['top'] - N), int(E - info['left'])])
segs = [r for r in city['roads'] if r['way'] == way]
pts = []
for r in segs:
    for p in (r['a'], r['b']):
        E = ref['originEasting'] + p[0] * unit; N = ref['originNorthing'] - p[1] * unit
        pts.append((E, N))
# ordered chain as stored
chain = [(ref['originEasting'] + segs[0]['a'][0] * unit, ref['originNorthing'] - segs[0]['a'][1] * unit)]
for r in segs:
    chain.append((ref['originEasting'] + r['b'][0] * unit, ref['originNorthing'] - r['b'][1] * unit))
s = 0; out = []
for (ea, na), (eb, nb) in zip(chain, chain[1:]):
    L = math.hypot(eb - ea, nb - na); n = max(1, int(L // 2))
    for k in range(n):
        E = ea + (eb - ea) * k / n; N = na + (nb - na) * k / n
        if math.hypot(E - E0, N - N0) < R:
            # cross profile: min/max within ±4 m across
            dx, dy = (eb - ea) / L, (nb - na) / L
            across = [h(E - dy * o, N + dx * o) for o in (-4, 0, 4)]
            out.append((s + L * k / n, E, N, across))
    s += L
print(segs[0].get('name'), segs[0]['class'], 'bridge' if any(r.get('bridge') for r in segs) else '')
for d, E, N, a in out[::2]:
    print(f'{d:7.1f} {E:9.0f} {N:9.0f}  L{a[0]:6.2f} C{a[1]:6.2f} R{a[2]:6.2f}')
