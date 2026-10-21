"""Step 5: OSM bridges whose deck the Lantmäteriet DTM kept as ground (retained decks).

Lantmäteriet removes bridges from the DTM (Markhöjdmodell): an underpass is an open trench at the level
of the way below. Where the classifier labelled a deck as ground (LiDAR class 2 instead of 17), the DTM
holds the deck as a plateau with vertical walls, and an at-grade way passing under the bridge is draped
over it. Järngatan under the E4 (Stockholmsvägen), E 567 340 N 6 498 034: class 2 at 14.8-15.1 m over a
27 m plateau, no class 17 return, Järngatan at 9.37 m on both sides; the draped road climbed 5.6 m
(47.7 %), and the generic crossing clearance lifted the E4 deck to 19.6 m.

A crossing of an at-grade way W under an OSM bridge segment B is a retained deck when, along W through
the crossing (native 1 m DTM, median across ±1 m):
  * the DTM at the crossing forms a plateau (within PLATEAU_TOLERANCE of the crossing level) no longer than
    PLATEAU_MAX, with walls at least WALL_DROP high on both sides (W's own level on both sides);
  * at most DECK17_MAX LiDAR class 17 (bridge) returns lie within DECK17_RADIUS of the crossing, i.e. the
    deck was not classified as a bridge.
The correction (scripts/geo/dtm_corrections.py) replaces the plateau inside the deck footprint by W's level,
linear between the two rims along W: the open trench the DTM shows at every other underpass.

Writes scripts/data/dtm-retained-decks.json (evidence per crossing). Geodata Python:
  python scripts/geo/retained_decks.py
"""
import json, math, sys
from collections import defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
import numpy as np

PLATEAU_TOLERANCE = 1.0   # m: the deck surface along W stays within this of the crossing level
PLATEAU_MAX = 60.0        # m: twin motorway decks and their median
WALL_DROP = 2.5           # m: deck level above W's level beyond both walls (clearance + deck)
RIM_WINDOW = (2.0, 6.0)   # m beyond the wall: W's level (median)
DECK17_RADIUS, DECK17_MAX = 6.0, 5
REACH = 60.0              # m along W either side of the crossing
ABUTMENT = 1.0            # m: the footprint stops this far inside the bridge ends

read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))


def main():
    city = read(ROOT / 'src/lib/data/norrkoping-map.json')
    ref = city['meta']['reference']
    unit = ref['metresPerUnit'] * ref['gridScaleFactor']
    sw = lambda p: (ref['originEasting'] + p[0] * unit, ref['originNorthing'] - p[1] * unit)
    info = read(ROOT / 'work/geodata/lantmateriet/step3/native.json')
    native = np.load(ROOT / 'work/geodata/lantmateriet/step3/native.npy', mmap_mode='r')

    def dtm(E, N):
        r = np.clip((info['top'] - np.asarray(N)).astype(int), 0, native.shape[0] - 1)
        c = np.clip((np.asarray(E) - info['left']).astype(int), 0, native.shape[1] - 1)
        return np.asarray(native[r, c], float)

    from scipy.spatial import cKDTree
    deck = []
    for f in sorted((ROOT / 'work/geodata/lantmateriet/deck17').glob('*.npy')):
        if f.name.endswith('.origin.npy'): continue
        a = np.load(f).astype(np.float64); a[:, :2] += np.load(f.with_name(f.name[:-4] + '.origin.npy'))
        deck.append(a[:, :2])
    tree17 = cKDTree(np.concatenate(deck))

    roads = [r for r in city['roads'] if r['kind'] in ('road', 'path', 'rail', 'tram')]
    bridges = [r for r in roads if r.get('bridge')]
    under = [r for r in roads if not r.get('bridge') and not r.get('tunnel')]
    way_nodes = defaultdict(list)
    for r in bridges: way_nodes[r['way']] += [sw(r['a']), sw(r['b'])]
    CELL = 50.0
    grid = defaultdict(list)
    for r in under:
        (ea, na), (eb, nb) = sw(r['a']), sw(r['b'])
        for i in range(int(min(ea, eb) // CELL), int(max(ea, eb) // CELL) + 1):
            for j in range(int(min(na, nb) // CELL), int(max(na, nb) // CELL) + 1):
                grid[(i, j)].append(r)

    def cross(a, b, c, d):
        o = lambda p, q, r: (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
        d1, d2, d3, d4 = o(a, b, c), o(a, b, d), o(c, d, a), o(c, d, b)
        if d1 * d2 < 0 and d3 * d4 < 0: return d3 / (d3 - d4), d1 / (d1 - d2)
        return None

    found = []
    seen = set()
    for B in bridges:
        A0, A1 = sw(B['a']), sw(B['b'])
        cands = {id(r): r for i in range(int(min(A0[0], A1[0]) // CELL), int(max(A0[0], A1[0]) // CELL) + 1)
                 for j in range(int(min(A0[1], A1[1]) // CELL), int(max(A0[1], A1[1]) // CELL) + 1) for r in grid.get((i, j), [])}
        for W in cands.values():
            if {tuple(W['a']), tuple(W['b'])} & {tuple(B['a']), tuple(B['b'])}: continue
            W0, W1 = sw(W['a']), sw(W['b'])
            hit = cross(A0, A1, W0, W1)
            if not hit: continue
            u, v = hit
            C = (A0[0] + (A1[0] - A0[0]) * u, A0[1] + (A1[1] - A0[1]) * u)
            L = math.dist(W0, W1); wx, wy = (W1[0] - W0[0]) / L, (W1[1] - W0[1]) / L
            s = np.arange(-REACH, REACH + .5, 1.0)
            P = np.median(np.stack([dtm(C[0] + wx * s - wy * o, C[1] + wy * s + wx * o) for o in (-1, 0, 1)]), 0)
            k0 = int(REACH)
            P0 = float(np.median(P[k0 - 2:k0 + 3]))
            if not np.isfinite(P0): continue
            # Plateau around the crossing, then the walls.
            l = k0
            while l > 0 and P[l - 1] >= P0 - PLATEAU_TOLERANCE: l -= 1
            r = k0
            while r < len(P) - 1 and P[r + 1] >= P0 - PLATEAU_TOLERANCE: r += 1
            if l == 0 or r == len(P) - 1 or s[r] - s[l] > PLATEAU_MAX: continue
            lw = (s >= s[l] - RIM_WINDOW[1]) & (s <= s[l] - RIM_WINDOW[0])
            rw = (s >= s[r] + RIM_WINDOW[0]) & (s <= s[r] + RIM_WINDOW[1])
            rimL, rimR = float(np.median(P[lw])), float(np.median(P[rw]))
            if P0 - rimL < WALL_DROP or P0 - rimR < WALL_DROP: continue
            n17 = len(tree17.query_ball_point(C, DECK17_RADIUS))
            if n17 > DECK17_MAX: continue
            key = (B['way'], W['way'])
            if key in seen: continue
            seen.add(key)
            # Footprint across W: the extent of B's whole way, ABUTMENT inside its ends.
            nodes = np.array(way_nodes[B['way']])
            across = (nodes[:, 0] - C[0]) * -wy + (nodes[:, 1] - C[1]) * wx
            found.append({
                'bridgeWay': B['way'], 'bridgeName': B.get('name', ''), 'bridgeKind': B['kind'],
                'underWay': W['way'], 'underName': W.get('name', ''), 'underKind': W['kind'], 'underClass': W.get('class', ''),
                'crossing': [round(C[0], 2), round(C[1], 2)], 'axis': [round(wx, 6), round(wy, 6)],
                'plateau': [float(s[l]), float(s[r])], 'deckLevel': round(P0, 2),
                'rims': [[float((s[l] - sum(RIM_WINDOW) / 2)), round(rimL, 2)], [float((s[r] + sum(RIM_WINDOW) / 2)), round(rimR, 2)]],
                'across': [round(float(across.min()) + ABUTMENT, 2), round(float(across.max()) - ABUTMENT, 2)],
                'deck17Returns': n17,
            })
    found.sort(key=lambda f: (f['bridgeWay'], f['underWay']))
    out = {
        'method': __doc__.split('\n\n')[2].strip(),
        'source': 'Lantmäteriet Markhöjdmodell 1 m (native mosaic), Laserdata NH 2020 class 17; OSM bridge/at-grade ways',
        'thresholds': {'plateauToleranceMetres': PLATEAU_TOLERANCE, 'plateauMaxMetres': PLATEAU_MAX, 'wallDropMetres': WALL_DROP,
                       'deck17Radius': DECK17_RADIUS, 'deck17Max': DECK17_MAX},
        'crossings': found,
    }
    (ROOT / 'scripts/data/dtm-retained-decks.json').write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n', encoding='utf8')
    for f in found:
        print(f"{f['bridgeWay']:>11} {f['bridgeName'][:22]:22} over {f['underWay']:>11} {f['underKind']:5} {f['underName'][:18]:18} "
              f"E {f['crossing'][0]:.0f} N {f['crossing'][1]:.0f} deck {f['deckLevel']:.2f} rims {f['rims'][0][1]:.2f}/{f['rims'][1][1]:.2f} "
              f"plateau {f['plateau'][1] - f['plateau'][0]:.0f} m class17 {f['deck17Returns']}")
    print(len(found), 'retained-deck crossings')


if __name__ == '__main__':
    main()
