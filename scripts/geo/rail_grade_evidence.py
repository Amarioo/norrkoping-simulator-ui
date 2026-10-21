"""Step 5.1: every rail vehicle grade peak against the native DTM and the LiDAR returns.

Input: the ridden profile (scripts/geo/infra-step51-railprofile.test.ts, every 2 m: rail top, running surface,
rendered terrain, segment kind). For every sample the native 1 m DTM along the track centre (median across
±1 m, retained-deck corrections applied) and the LiDAR class 2 returns within LIDAR_RADIUS of the centre
(median) are measured. Grades use the vehicle's own 20 m chord.

A peak is a cluster (100 m) of vehicle grades above the limit; its window is ±WINDOW m. Verdicts:
  * mesh       the measured track bed (native DTM and LiDAR ground) is within the limit over the same chord,
               and the rendered track bed departs from it by more than MESH_DEV: the grade is made by the
               rendered surface (5 m grid / RTIN across a cutting or embankment slope) - correctable;
  * structure  a deck or engineered span lies in the window: the bridge profile decides (checked separately
               against LiDAR class 17);
  * measured   the measured track bed is as steep: a real gradient, or an unmodelled structure; left as is.

Usage (geodata Python): python scripts/geo/rail_grade_evidence.py [profile.json] [out.json] [route]
"""
import json, math, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python')); sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from scipy.spatial import cKDTree
import dtm_corrections
from lidar_window import points

LIMIT = {'pendeln': 2.5}
CHORD = 20.0
WINDOW = 30.0
MESH_DEV = 0.10
LIDAR_RADIUS = 1.0


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'work/step51/rail-profile.json')
    out = Path(sys.argv[2] if len(sys.argv) > 2 else ROOT / 'work/step51/rail-grade-evidence.json')
    route = sys.argv[3] if len(sys.argv) > 3 else 'pendeln'
    data = json.loads(src.read_text(encoding='utf8'))
    cols = data['routes'][route]['columns']; rows = data['routes'][route]['rows']
    col = {c: i for i, c in enumerate(cols)}
    s = np.array([r[col['s']] for r in rows]); E = np.array([r[col['E']] for r in rows]); N = np.array([r[col['N']] for r in rows])
    top = np.array([r[col['railTop']] for r in rows]); run = np.array([r[col['running']] for r in rows])
    ter = np.array([r[col['terrain']] for r in rows]); seg = [r[col['segment']] for r in rows]; way = [r[col['way']] for r in rows]
    patched = np.array([r[col['patched']] for r in rows], bool)
    native, info = dtm_corrections.native_mosaic(); corr = dtm_corrections.corrected_pixels()

    def dtm(e, n):
        r, c = int(info['top'] - n), int(e - info['left'])
        return float(dtm_corrections.apply_to_block(native[r:r + 1, c:c + 1], r, c, corr)[0, 0])
    # track direction per sample
    dE = np.gradient(E); dN = np.gradient(N); L = np.hypot(dE, dN) + 1e-9; ue, un = dE / L, dN / L
    nat = np.array([np.median([dtm(E[i] - un[i] * o, N[i] + ue[i] * o) for o in (-1, 0, 1)]) for i in range(len(s))])
    step = float(np.median(np.diff(s)))
    half = int(round(CHORD / 2 / step))

    def grade(h):
        g = np.full(len(h), np.nan)
        for i in range(half, len(h) - half):
            g[i] = abs(h[i + half] - h[i - half]) / (s[i + half] - s[i - half]) * 100
        return g
    g_vehicle = grade(top); g_native = grade(nat)
    lim = LIMIT.get(route, 2.5)
    # peaks: 100 m clusters of vehicle grade above the limit
    over = np.flatnonzero(g_vehicle > lim)
    peaks = []
    for i in over:
        if peaks and s[i] - s[peaks[-1][-1]] < 100: peaks[-1].append(i)
        else: peaks.append([i])
    w = int(round(WINDOW / step))
    result = []
    for cl in peaks:
        k = max(cl, key=lambda i: g_vehicle[i])
        lo, hi = max(0, k - w), min(len(s) - 1, k + w)
        sl = slice(lo, hi + 1)
        e0, e1 = E[sl].min() - 3, E[sl].max() + 3; n0, n1 = N[sl].min() - 3, N[sl].max() + 3
        pe, pn, pz, pc = points(e0, n0, e1, n1)
        g2 = pc == 2
        tree2 = cKDTree(np.c_[pe[g2], pn[g2]]) if g2.any() else None
        tree17 = cKDTree(np.c_[pe[pc == 17], pn[pc == 17]]) if (pc == 17).any() else None
        lidar = np.full(hi - lo + 1, np.nan); n2 = np.zeros(hi - lo + 1, int); n17 = 0
        for j, i in enumerate(range(lo, hi + 1)):
            if tree2 is not None:
                near = tree2.query_ball_point((E[i], N[i]), LIDAR_RADIUS)
                n2[j] = len(near)
                if len(near) >= 3: lidar[j] = float(np.median(pz[g2][near]))
            if tree17 is not None: n17 += len(tree17.query_ball_point((E[i], N[i]), 3.0))
        # LiDAR grade over the same chord at the peak (robust: linear fit of the half-chords' medians)
        def chord_grade(h, at):
            a, b = at - half, at + half
            if a < lo or b > hi: return None
            ha = np.nanmedian(h[a - lo - 2:a - lo + 3]); hb = np.nanmedian(h[b - lo - 2:b - lo + 3])
            return None if not (np.isfinite(ha) and np.isfinite(hb)) else abs(hb - ha) / (s[b] - s[a]) * 100
        g_lidar = chord_grade(lidar, k)
        dev_mesh = ter[sl] - nat[sl]
        kinds = sorted(set(seg[lo:hi + 1]))
        structure = any(x in ('deck', 'span') for x in kinds)
        gn = float(g_native[k]) if np.isfinite(g_native[k]) else None
        # max native grade in the window (the measured bed can have its own peak a few m away)
        gn_max = float(np.nanmax(g_native[sl]))
        # Ground samples beside a structure are judged on their own (Step 5.1): the native DTM grade there includes
        # the removed-bridge gap, so the LiDAR ground grade over the chord is the measured reference.
        on_ground = np.array([x == 'ground' for x in seg[lo:hi + 1]])
        dev_ground = np.abs(dev_mesh[on_ground]).max() if on_ground.any() else 0.0
        if structure and dev_ground > MESH_DEV and g_lidar is not None and g_lidar <= lim: verdict = 'mesh'
        elif structure: verdict = 'structure'
        elif gn_max <= lim and np.abs(dev_mesh).max() > MESH_DEV: verdict = 'mesh'
        elif gn_max > lim: verdict = 'measured'
        else: verdict = 'other'
        result.append({
            'E': round(float(E[k]), 1), 'N': round(float(N[k]), 1), 's': float(s[k]),
            'vehicleGradePercent': round(float(g_vehicle[k]), 2),
            'nativeDtmGradePercent': round(gn, 2) if gn is not None else None,
            'nativeDtmGradeMaxInWindowPercent': round(gn_max, 2),
            'lidarGroundGradePercent': round(g_lidar, 2) if g_lidar is not None else None,
            'renderedMinusNative': {'max': round(float(np.abs(dev_mesh).max()), 3), 'rmse': round(float(np.sqrt((dev_mesh ** 2).mean())), 3)},
            'lidarClass2Returns': int(n2.sum()), 'lidarClass17Returns': int(n17),
            'nativeMinusLidarGround': round(float(np.nanmedian(nat[sl] - lidar)), 3) if np.isfinite(lidar).any() else None,
            'segments': kinds, 'ways': sorted({x for x in way[lo:hi + 1] if x is not None}),
            'patched': bool(patched[sl].any()), 'verdict': verdict,
            'profile': {'s': s[sl][::2].round(1).tolist(), 'railTop': top[sl][::2].round(3).tolist(), 'terrain': ter[sl][::2].round(3).tolist(),
                        'nativeDtm': nat[sl][::2].round(3).tolist(), 'lidarGround': [None if not np.isfinite(v) else round(float(v), 3) for v in lidar[::2]]},
        })
    stats = lambda g: {k: round(float(np.nanpercentile(g, q)), 3) for k, q in (('p50', 50), ('p95', 95), ('p99', 99), ('max', 100))}
    summary = {'route': route, 'limitPercent': lim, 'chordMetres': CHORD, 'vehicle': stats(g_vehicle), 'nativeDtm': stats(g_native),
               'renderedTerrainMinusNative': {'rmse': round(float(np.sqrt(np.nanmean((ter - nat) ** 2))), 3),
                                              'p95': round(float(np.nanpercentile(np.abs(ter - nat), 95)), 3)},
               'peaks': result}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, indent=1), encoding='utf8')
    print('vehicle', summary['vehicle'], 'native', summary['nativeDtm'], 'terrain-native', summary['renderedTerrainMinusNative'])
    for p in result:
        print(f"{p['vehicleGradePercent']:5.2f} % vehicle  {p['nativeDtmGradePercent']} % DTM (max {p['nativeDtmGradeMaxInWindowPercent']})  "
              f"LiDAR {p['lidarGroundGradePercent']}  dev {p['renderedMinusNative']['max']:.2f}  {p['verdict']:9} {p['segments']} "
              f"E {p['E']:.0f} N {p['N']:.0f} ways {p['ways'][:4]} c17 {p['lidarClass17Returns']} patched {p['patched']}")


if __name__ == '__main__':
    main()
