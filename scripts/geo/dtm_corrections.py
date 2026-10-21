"""Step 5: corrections of the Lantmäteriet DTM where it kept a bridge deck as ground (retained decks).

The DTM removes bridges, so every underpass is an open trench at the level of the way below
(ELEVATION.md). scripts/geo/retained_decks.py lists OSM bridges where the deck was classified as ground
instead (LiDAR class 2, no class 17): a plateau with vertical walls over the way below, e.g. the E4 over
Järngatan. Here the deck is removed the way the DTM removes it elsewhere:

  along every bridge way in scripts/data/dtm-retained-decks.json, at stations every STATION m (1 m short of
  the way's ends), the native profile ACROSS the bridge axis must show a plateau around the axis (within
  PLATEAU_TOLERANCE of the axis level, at most PLATEAU_MAX wide, so twin decks and their median count as
  one) with steep walls on both sides (WALL_DROP within WALL_RUN). Plateau pixels are replaced by the
  ground beyond the walls, linear across the plateau: the trench floor the DTM shows at other underpasses.

Native deliveries stay unchanged: corrected pixels are recomputed from them on demand and cached in
work/step5/native-corrections.npz. The 5 m runtime grid is resampled (bilinear, prepare-dtm.py's rule)
wherever a corrected pixel contributes.

  python scripts/geo/dtm_corrections.py            report what would change
  python scripts/geo/dtm_corrections.py --apply    write terrain.json (client + backend) with the corrected
                                                    grid and a new grid revision; then rebuild the mesh
                                                    (prepare-terrain-mesh.py --activate --recompute) and the
                                                    network profiles (prepare-bridge-profiles.py)
"""
import base64, hashlib, json, math, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
import numpy as np

STATION = .5              # m along the bridge axis
ACROSS_STEP = .5          # m across it
PLATEAU_TOLERANCE = 1.0   # m
PLATEAU_MAX = 60.0        # m
WALL_DROP, WALL_RUN = 2.5, 4.0
RIM_WINDOW = (1.0, 5.0)   # m beyond the wall foot
SEARCH = PLATEAU_MAX / 2 + WALL_RUN + RIM_WINDOW[1] + 1
END_MARGIN = 1.0          # m inside the bridge way's ends (abutments stay)
SOURCE = ROOT / 'scripts/data/dtm-retained-decks.json'
CACHE = ROOT / 'work/step5/native-corrections.npz'
TARGETS = [ROOT / 'src/lib/data/terrain.json', ROOT.parent / 'norrkoping-simulator-backend/src/main/resources/terrain.json']

read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))


def native_mosaic():
    info = read(ROOT / 'work/geodata/lantmateriet/step3/native.json')
    return np.load(ROOT / 'work/geodata/lantmateriet/step3/native.npy', mmap_mode='r'), info


def corrected_pixels(verbose=False):
    """(rows, cols, values) of corrected native pixels, cached by source list and map."""
    city_path = ROOT / 'src/lib/data/norrkoping-map.json'
    key = hashlib.sha256(SOURCE.read_bytes() + city_path.read_bytes() + Path(__file__).read_bytes()).hexdigest()[:16]
    if CACHE.exists():
        z = np.load(CACHE)
        if str(z['key']) == key:
            return z['rows'], z['cols'], z['values']
    city = read(city_path)
    ref = city['meta']['reference']
    unit = ref['metresPerUnit'] * ref['gridScaleFactor']
    sw = lambda p: (ref['originEasting'] + p[0] * unit, ref['originNorthing'] - p[1] * unit)
    native, info = native_mosaic()
    H, W = native.shape

    def dtm(E, N):
        r = np.floor(info['top'] - np.asarray(N)).astype(int); c = np.floor(np.asarray(E) - info['left']).astype(int)
        ok = (r >= 0) & (r < H) & (c >= 0) & (c < W)
        out = np.full(np.shape(E), np.nan)
        out[ok] = native[r[ok], c[ok]]
        return out, r, c

    ways = sorted({c['bridgeWay'] for c in read(SOURCE)['crossings']})
    best = {}
    report = []
    offs = np.arange(-SEARCH, SEARCH + 1e-9, ACROSS_STEP)
    k0 = int(np.argmin(np.abs(offs)))
    for way in ways:
        segs = [r for r in city['roads'] if r['way'] == way and r.get('bridge')]
        degree = {}
        for r in segs:
            for p in (tuple(r['a']), tuple(r['b'])): degree[p] = degree.get(p, 0) + 1
        stations = corrected = 0
        for r in segs:
            A, B = sw(r['a']), sw(r['b'])
            L = math.dist(A, B)
            if L < 1e-6: continue
            ux, uy = (B[0] - A[0]) / L, (B[1] - A[1]) / L
            s0 = END_MARGIN if degree[tuple(r['a'])] == 1 else 0
            s1 = L - (END_MARGIN if degree[tuple(r['b'])] == 1 else 0)
            for s in np.arange(s0, s1 + 1e-9, STATION):
                stations += 1
                E = A[0] + ux * s - uy * offs; N = A[1] + uy * s + ux * offs
                P, rr, cc = dtm(E, N)
                h0 = np.nanmedian(P[k0 - 2:k0 + 3])
                if not np.isfinite(h0): continue
                l = k0
                while l > 0 and P[l - 1] >= h0 - PLATEAU_TOLERANCE: l -= 1
                q = k0
                while q < len(P) - 1 and P[q + 1] >= h0 - PLATEAU_TOLERANCE: q += 1
                if l == 0 or q == len(P) - 1 or offs[q] - offs[l] > PLATEAU_MAX: continue
                # Wall feet: the first sample WALL_DROP below the plateau, within WALL_RUN of its edge.
                fl = l
                while fl > 0 and P[fl] > h0 - WALL_DROP and offs[l] - offs[fl] <= WALL_RUN: fl -= 1
                fr = q
                while fr < len(P) - 1 and P[fr] > h0 - WALL_DROP and offs[fr] - offs[q] <= WALL_RUN: fr += 1
                if P[fl] > h0 - WALL_DROP or P[fr] > h0 - WALL_DROP: continue
                lw = (offs <= offs[fl] - RIM_WINDOW[0]) & (offs >= offs[fl] - RIM_WINDOW[1])
                rw = (offs >= offs[fr] + RIM_WINDOW[0]) & (offs <= offs[fr] + RIM_WINDOW[1])
                if not lw.any() or not rw.any(): continue
                gl, gr = np.nanmedian(P[lw]), np.nanmedian(P[rw])
                if not (np.isfinite(gl) and np.isfinite(gr)) or h0 - max(gl, gr) < WALL_DROP: continue
                ol, orr = offs[fl] - sum(RIM_WINDOW) / 2, offs[fr] + sum(RIM_WINDOW) / 2
                # The wall itself (down to the rim window) is part of the deck edge: lower every sample above
                # the line between the rims, leave ground below it.
                for k in np.flatnonzero((offs > offs[fl] - RIM_WINDOW[0]) & (offs < offs[fr] + RIM_WINDOW[0])):
                    v = gl + (gr - gl) * (offs[k] - ol) / (orr - ol)
                    if v >= P[k]: continue
                    pix = (int(rr[k]), int(cc[k]))
                    if pix not in best or v < best[pix]: best[pix] = v
                corrected += 1
        report.append((way, segs[0].get('name', '') if segs else '', stations, corrected))
    if verbose:
        for way, name, n, c in report: print(f'bridge way {way} {name}: {c}/{n} stations corrected')
    rows = np.array([p[0] for p in best], int); cols = np.array([p[1] for p in best], int)
    values = np.array([best[p] for p in best], np.float32)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    np.savez(CACHE, key=key, rows=rows, cols=cols, values=values)
    return rows, cols, values


def apply_to_block(block, r0, c0, corrections=None):
    """Corrected copy of a native block whose pixel (0, 0) is mosaic pixel (r0, c0)."""
    rows, cols, values = corrections if corrections is not None else corrected_pixels()
    out = np.array(block, dtype=np.float64, copy=True)
    k = (rows >= r0) & (rows < r0 + out.shape[0]) & (cols >= c0) & (cols < c0 + out.shape[1])
    out[rows[k] - r0, cols[k] - c0] = values[k]
    return out


def corrected_grid(dataset):
    """The dataset's 5 m grid with nodes resampled where corrected pixels contribute (prepare-dtm.py rule)."""
    tile = dataset['tiles'][0]
    g = np.frombuffer(base64.b64decode(tile['heightsBase64']), dtype='<f4').reshape(tile['rows'], tile['columns']).copy()
    rows, cols, values = corrected_pixels(verbose=True)
    if not len(rows): return g, 0
    native, info = native_mosaic()
    ref = dataset['reference']
    unit = ref['metresPerUnit'] * ref['gridScaleFactor']
    # Nodes whose bilinear stencil touches a corrected pixel.
    E = info['left'] + cols + .5; N = info['top'] - rows - .5
    jx = ((E - ref['originEasting']) / unit - tile['x']) / tile['step']
    iz = ((ref['originNorthing'] - N) / unit - tile['z']) / tile['step']
    nodes = set()
    for a, b in zip(np.floor(jx).astype(int), np.floor(iz).astype(int)):
        for dj in (0, 1):
            for di in (0, 1):
                nodes.add((b + di, a + dj))
    changed = 0
    for i, j in nodes:
        if not (0 <= i < tile['rows'] and 0 <= j < tile['columns']): continue
        e = ref['originEasting'] + (tile['x'] + j * tile['step']) * unit
        n = ref['originNorthing'] - (tile['z'] + i * tile['step']) * unit
        c = e - info['left'] - .5; r = info['top'] - n - .5
        c0, r0 = int(math.floor(c)), int(math.floor(r))
        blk = apply_to_block(native[r0:r0 + 2, c0:c0 + 2], r0, c0, (rows, cols, values))
        fc, fr = c - c0, r - r0
        v = (blk[0, 0] * (1 - fc) * (1 - fr) + blk[0, 1] * fc * (1 - fr) + blk[1, 0] * (1 - fc) * fr + blk[1, 1] * fc * fr)
        if np.isfinite(v) and abs(v - g[i, j]) > 1e-4:
            g[i, j] = v; changed += 1
    return g, changed


def main():
    dataset = read(TARGETS[0])
    g, changed = corrected_grid(dataset)
    tile = dataset['tiles'][0]
    old = np.frombuffer(base64.b64decode(tile['heightsBase64']), dtype='<f4').reshape(g.shape)
    d = (g - old)[g != old]
    print(f'grid nodes changed: {changed}; change m: min {d.min() if len(d) else 0:.2f} max {d.max() if len(d) else 0:.2f}')
    if '--apply' not in sys.argv: return
    blob = g.astype('<f4').tobytes()
    tile['heightsBase64'] = base64.b64encode(blob).decode('ascii')
    note = (' Retained bridge decks (classified as ground) removed like other bridges: '
            'scripts/data/dtm-retained-decks.json, scripts/geo/dtm_corrections.py.')
    if note not in tile['processing']: tile['processing'] += note
    surface = dataset['revision'].split('-surface-')[1] if '-surface-' in dataset['revision'] else None
    dataset['revision'] = 'lm-dtm-' + hashlib.sha256(blob).hexdigest()[:16] + (('-surface-' + surface) if surface else '')
    text = json.dumps(dataset, ensure_ascii=False, separators=(',', ':')) + '\n'
    for t in TARGETS: t.write_text(text, encoding='utf8')
    print('grid revision', dataset['revision'].split('-surface-')[0])


if __name__ == '__main__':
    main()
