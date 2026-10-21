"""Step 5.1: diagnostic-driven selection of the places that need geometric refinement.

Reads the map-wide diagnostics (scripts/geo/infra-diagnose.test.ts, INFRA_OUT) and the rail grade evidence
(scripts/geo/rail_grade_evidence.py). Every candidate is checked against the native 1 m DTM (retained-deck
corrections applied) before anything is changed. The rule is to correct a vertical defect made by our own
geometry. Measured relief stays as it is, and a horizontal (OSM alignment/width) problem cannot be fixed
by heights.

Road cross-sections (crease > LIMITS.crease): the native DTM across the drawn strip (three lines ±1 m along the
road, median), at the issue point:
  * mesh       the measured strip is planar (line-fit residual <= PLANAR) and has no crease of its own
               (|native crease| <= NATIVE_CREASE): the twist comes from the 5 m mesh -> breakline patch;
  * alignment  the measured strip holds a step (residual > PLANAR) but the same width shifted sideways by
               SHIFTS is planar: the OSM centreline runs beside the carriageway (e.g. across the inside of a
               hairpin) -> reported, not patched (heights cannot fix a horizontal error);
  * width      not planar at full width, planar at NARROW of it: the OSM/default width covers a verge, wall or
               embankment -> reported;
  * measured   the measured surface itself is creased like the drawn one, or no planar strip exists nearby
               (steps, ramps, kerbs inside the footprint) -> reported.
Junction fans (> LIMITS.junctionStep): mid-edge creases of draped fans -> patch (vertical by construction).
Road grades (steep-grade, grade-break; not paths, not documented exceptions): the native DTM grade over the
same 10 m window along the way; much flatter (by GRADE_MARGIN points), within the road limit itself
(GRADE_LIMIT) and with a planar measured strip (GRADE_STRIP) on a draped piece -> mesh -> patch; on a linear
piece -> profile (reported); otherwise -> measured (a genuinely steep road or a wall in the footprint).
Below-terrain (roads and rails, > BELOW_MIN): linear non-bridge pieces -> grounded patch; bridges and ways with
an underpass span -> abutment
(reported: the deck edge meets an embankment).
Rail vehicle grade peaks: verdict 'mesh' of rail_grade_evidence.py -> rail-bed patch over the stretch where the
rendered bed departs from the measured one by more than RAIL_DEV (at most RAIL_REACH either side).

Output: scripts/data/geometry-refinement-targets.json (targets with evidence; consumed by road_patches.py).
Usage (geodata Python): python scripts/geo/refinement_targets.py [diagnose.json] [rail-evidence.json]
"""
import json, math, sys
from collections import defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python')); sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import dtm_corrections

PLANAR = 0.15          # m: max |residual| of a line fit across a carriageway (crown + gutters stay below)
NATIVE_CREASE = 0.15   # m
MESH_PART = 0.30       # m: drawn crease beyond the measured one that the mesh adds (LIMITS.crease)
SHIFTS = np.arange(-3.0, 3.01, 0.5)
NARROW = 0.6
GRADE_MARGIN = 3.0     # percentage points
GRADE_LIMIT = {'steep-grade': 12.0, 'grade-break': 10.0}   # road limits (infraDiagnostics.ts LIMITS)
GRADE_STRIP = 0.30     # m: max line-fit residual across the measured strip for a grade correction
BELOW_MIN = 0.2        # m
SEED_REACH = 15.0      # m along the way from the issue point: seed segments
RAIL_DEV = 0.10        # m
RAIL_REACH = 80.0      # m
PRIORITY_CREASE = 0.5  # m
RAIL_NEAR = 6.0        # m: parallel tracks of a double-track line are 4.5-5 m apart
OUT = ROOT / 'scripts/data/geometry-refinement-targets.json'
read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))


def main():
    diag = read(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'work/step51/diagnose-before.json')
    rail = read(sys.argv[2] if len(sys.argv) > 2 else ROOT / 'work/step51/rail-grade-evidence.json')
    rail_rows = read(sys.argv[3] if len(sys.argv) > 3 else ROOT / 'work/step51/rail-profile.json')['routes'][rail['route']]['rows']
    city = read(ROOT / 'src/lib/data/norrkoping-map.json')
    ref = city['meta']['reference']; U = ref['metresPerUnit']; unit = U * ref['gridScaleFactor']
    sw = lambda p: (ref['originEasting'] + p[0] * unit, ref['originNorthing'] - p[1] * unit)
    native, info = dtm_corrections.native_mosaic(); corr = dtm_corrections.corrected_pixels()

    def window(E, N, R):
        r0 = int(info['top'] - N - R); c0 = int(E - R - info['left'])
        n = int(2 * R) + 2
        return dtm_corrections.apply_to_block(np.array(native[r0:r0 + n, c0:c0 + n]), r0, c0, corr), r0, c0

    def sampler(E, N, R):
        blk, r0, c0 = window(E, N, R)
        def f(e, n):
            r = (info['top'] - np.asarray(n) - r0).astype(int); c = (np.asarray(e) - info['left'] - c0).astype(int)
            ok = (r >= 0) & (r < blk.shape[0]) & (c >= 0) & (c < blk.shape[1])
            out = np.full(np.shape(r), np.nan); out[ok] = blk[r[ok], c[ok]]
            return out
        return f

    by_way = defaultdict(list)
    for r in city['roads']: by_way[r['way']].append(r)
    skey = lambda r: f"{r['a'][0]:.3f},{r['a'][1]:.3f}|{r['b'][0]:.3f},{r['b'][1]:.3f}"

    def nearest(way, E, N, kinds=('road',)):
        best = None
        for r in by_way.get(way, []):
            if r['kind'] not in kinds: continue
            A, B = np.array(sw(r['a'])), np.array(sw(r['b'])); d = B - A; L = math.hypot(*d)
            if L < 1e-6: continue
            t = max(0.0, min(1.0, float((np.array([E, N]) - A) @ d / (L * L))))
            dist = math.hypot(*(A + d * t - [E, N]))
            if best is None or dist < best[0]: best = (dist, r, A, d / L, t * L, L)
        return best

    def seeds(way, E, N, reach=SEED_REACH, keep=None):
        """Segments of `way` within `reach` m of (E, N) along the ground (the issue's neighbourhood)."""
        out = []
        for r in by_way.get(way, []):
            if r['kind'] != 'road': continue
            A, B = np.array(sw(r['a'])), np.array(sw(r['b'])); d = B - A; L = math.hypot(*d)
            if L < 1e-6: continue
            t = max(0.0, min(1.0, float((np.array([E, N]) - A) @ d / (L * L))))
            if math.hypot(*(A + d * t - [E, N])) <= reach and (keep or patchable)(r): out.append(skey(r))
        return out

    # The patcher's rule (road_patches.py ordinary()): only draped road pieces take a measured surface.
    profiles = read(ROOT / 'src/lib/data/bridge-profiles.json')
    pkey = lambda p, y: f'{p[0]:.3f},{p[1]:.3f},{y:.3f}'
    span_ways = {w for si in profiles.get('spanInfo', []) for w in si['ways']}
    # Seeds: any non-bridge, non-tunnel segment; road_patches.py takes its draped parts (whole, between spans,
    # or a tapered approach) and leaves fully linear pieces alone.
    patchable = lambda r: not r.get('bridge') and not r.get('tunnel')

    def draped(r):
        return (not r.get('bridge') and not r.get('tunnel') and skey(r) not in profiles['spans']
                and pkey(r['a'], r['yA']) not in profiles['points'] and pkey(r['b'], r['yB']) not in profiles['points'])

    def line_residual(o, h):
        ok = np.isfinite(h)
        if ok.sum() < 4: return np.inf
        c = np.polyfit(o[ok], h[ok], 1)
        return float(np.abs(np.polyval(c, o[ok]) - h[ok]).max())

    rows = []
    issues = [i for i in diag['issues'] if not i.get('exception')]
    for i in issues:
        k = i['kind']; E, N = i['E'], i['N']
        if k == 'cross-section':
            nb = nearest(i.get('way'), E, N)
            if nb is None: continue
            _, r, A, u, along, L = nb
            n_ = np.array([-u[1], u[0]]); half = r['width'] * U / 2
            P = A + u * along
            f = sampler(P[0], P[1], half + 8)
            o = np.arange(-half - 4, half + 4.01, 0.5)
            prof = np.nanmedian(np.stack([f(P[0] + u[0] * a + n_[0] * o, P[1] + u[1] * a + n_[1] * o) for a in (-1, 0, 1)]), 0)
            at = lambda x: float(np.nanmedian(prof[np.abs(o - x) <= 0.5]))
            native_crease = (at(-half) + at(half)) / 2 - at(0)
            inside = np.abs(o) <= half + 1e-9
            res = line_residual(o[inside], prof[inside])
            shifted = [(abs(s), s, line_residual(o[np.abs(o - s) <= half], prof[np.abs(o - s) <= half])) for s in SHIFTS]
            best_shift = min((x for x in shifted if x[0] >= 1.0), key=lambda x: x[2])
            narrow = line_residual(o[np.abs(o) <= half * NARROW], prof[np.abs(o) <= half * NARROW])
            if res <= PLANAR and abs(native_crease) <= NATIVE_CREASE: cat = 'mesh'
            elif res > PLANAR and best_shift[2] <= PLANAR: cat = 'alignment'
            elif res > PLANAR and narrow <= PLANAR: cat = 'width'
            else: cat = 'measured'
            # The mesh's own share: the drawn crease beyond the measured one. Where it exceeds the crease limit
            # the patch is applied (it brings the surface to the measured shape); a horizontal or measured
            # remainder stays reported as the secondary category.
            mesh_part = abs(i['value'] - native_crease)
            patch = cat == 'mesh' or mesh_part > MESH_PART
            secondary = cat if cat != 'mesh' else None
            if patch and cat != 'mesh': cat = 'mesh'
            rows.append({'kind': k, 'E': E, 'N': N, 'way': i.get('way'), 'name': r.get('name', ''), 'class': r.get('class', ''),
                         'drawn': round(i['value'], 3), 'severity': i['severity'], 'category': cat, 'secondary': secondary,
                         'evidence': {'widthMetres': round(half * 2, 1), 'nativeCrease': round(native_crease, 3), 'meshPart': round(mesh_part, 3),
                                      'stripResidual': round(res, 3), 'bestShift': [best_shift[1], round(best_shift[2], 3)],
                                      'narrowResidual': round(narrow, 3)},
                         'expectedAfter': round(native_crease, 3) if patch else round(i['value'], 3),
                         'correction': 'breakline-patch' if patch else 'none (reported)',
                         'seeds': seeds(r['way'], E, N) if patch else []})
        elif k == 'junction-fan':
            # The node: the fan's position is a corner/edge midpoint; its node is the nearest incident end.
            ws = [int(w) for w in i['detail'].split('ways ')[1].split(', ') if w.strip().isdigit()]
            sd = sorted({s for w in ws for s in seeds(w, E, N, 10.0)})
            rows.append({'kind': k, 'E': E, 'N': N, 'way': i.get('way'), 'drawn': round(i['value'], 3), 'severity': i['severity'],
                         'category': 'fan-rule', 'evidence': {'detail': i['detail']},
                         'correction': 'fan wedge blend (cityMesh.ts fanWedge)', 'seeds': []})
        elif k in ('steep-grade', 'grade-break') and not i['detail'].startswith(('path', 'pendeln', 'tram-', 'rail', 'tram')):
            nb = nearest(i.get('way'), E, N)
            if nb is None: continue
            _, r, A, u, along, L = nb
            f = sampler(E, N, 25)
            n_ = np.array([-u[1], u[0]])
            P = A + u * along
            h = lambda s: float(np.nanmedian([f(P[0] + u[0] * s + n_[0] * q, P[1] + u[1] * s + n_[1] * q) for q in (-1, 0, 1)]))
            g = [abs(h(10) - h(0)) / 10 * 100, abs(h(0) - h(-10)) / 10 * 100]
            if k == 'steep-grade': ng = max(g)
            else: ng = abs((h(10) - h(0)) - (h(0) - h(-10))) / 10 * 100
            is_draped = draped(r)
            # Step 5.1: the measured strip across the road at the point (as for cross-sections).
            half = r['width'] * U / 2; o = np.arange(-half, half + 1e-9, 0.5)
            res = line_residual(o, np.nanmedian(np.stack([f(P[0] + u[0] * a + n_[0] * o, P[1] + u[1] * a + n_[1] * o) for a in (-1, 0, 1)]), 0))
            # A grade is ours only if the measured one is within the limit (a genuinely steep road is not
            # 'corrected' towards a still-steep measurement) and the measured strip is planar enough for a fit.
            limit = GRADE_LIMIT[k]
            if ng >= i['value'] - GRADE_MARGIN or ng > limit: cat = 'measured'
            elif not is_draped: cat = 'profile'
            elif res > GRADE_STRIP: cat = 'measured'
            else: cat = 'mesh'
            rows.append({'kind': k, 'E': E, 'N': N, 'way': i.get('way'), 'name': r.get('name', ''), 'class': r.get('class', ''),
                         'drawn': round(i['value'], 2), 'severity': i['severity'], 'category': cat,
                         'evidence': {'nativeDtmPercent': round(ng, 2), 'stripResidual': round(res, 3)},
                         'correction': 'breakline-patch' if cat == 'mesh' else 'none (reported)',
                         'seeds': seeds(r['way'], E, N) if cat == 'mesh' else []})
        elif k == 'below-terrain' and i['value'] > BELOW_MIN and not i['detail'].startswith('path'):
            # A bridge, or a way carrying an engineered span over an underpass (bridge-profiles spanInfo): the deck
            # edge meets its embankment; a terrain patch never fills under a span (Lidaleden, E 571 559 N 6 492 809).
            bridge = ' bridge' in i['detail'] or i.get('way') in span_ways
            nb = nearest(i.get('way'), E, N, ('road', 'rail', 'tram'))
            cat = 'abutment' if bridge else 'grounded'
            rows.append({'kind': k, 'E': E, 'N': N, 'way': i.get('way'), 'drawn': round(i['value'], 3), 'severity': i['severity'],
                         'category': cat, 'evidence': {'detail': i['detail']},
                         'correction': 'grounded-patch' if cat == 'grounded' else 'none (reported)',
                         'seeds': seeds(i['way'], E, N, keep=lambda r: not r.get('bridge')) if cat == 'grounded' and nb and nb[1]['kind'] == 'road' else []})
    # Rail: peaks the evidence calls 'mesh' -> the stretch where the rendered bed departs from the measured one.
    rail_targets = []
    for p in rail['peaks']:
        rows.append({'kind': 'rail-grade', 'E': p['E'], 'N': p['N'], 'way': p['ways'][0] if p['ways'] else None,
                     'drawn': p['vehicleGradePercent'], 'severity': 'warning', 'category': p['verdict'],
                     'evidence': {k: p[k] for k in ('nativeDtmGradePercent', 'nativeDtmGradeMaxInWindowPercent', 'lidarGroundGradePercent',
                                                    'renderedMinusNative', 'lidarClass2Returns', 'lidarClass17Returns', 'segments')},
                     'correction': 'rail-bed-patch' if p['verdict'] == 'mesh' else 'none (reported)', 'seeds': []})
        if p['verdict'] != 'mesh': continue
        prof = p['profile']; s = np.array(prof['s']); d = np.abs(np.array(prof['terrain']) - np.array(prof['nativeDtm']))
        k0 = int(np.argmin(np.abs(s - p['s'])))
        lo = k0
        while lo > 0 and (d[lo - 1] > RAIL_DEV / 2 or p['s'] - s[lo] < 10): lo -= 1
        hi = k0
        while hi < len(s) - 1 and (d[hi + 1] > RAIL_DEV / 2 or s[hi] - p['s'] < 10): hi += 1
        s0, s1 = float(s[lo]) - 10, float(s[hi]) + 10
        # Track-bed segments: every draped rail (running line or parallel track) within RAIL_NEAR of the stretch.
        pts = np.array([(r[1], r[2]) for r in rail_rows if s0 <= r[0] <= s1])
        keys = set()
        for r in city['roads']:
            # draped or partly spanned track (road_patches.py integrates the draped intervals)
            if r['kind'] != 'rail' or r.get('bridge') or r.get('tunnel'): continue
            A, B = np.array(sw(r['a'])), np.array(sw(r['b'])); d = B - A; L2 = float(d @ d)
            if L2 < 1e-9: continue
            t = np.clip(((pts - A) @ d) / L2, 0, 1)
            if (np.hypot(*(A + np.outer(t, d) - pts).T) <= RAIL_NEAR).any(): keys.add(skey(r))
        rail_targets.append({'E': p['E'], 'N': p['N'], 'sFrom': s0, 'sTo': s1, 'seeds': sorted(keys)})
    # Priority (Step 5.1 budget): A = vehicle-relevant or clearly visible -> patched; B = reported, patched only
    # with road_patches.py --priority=B. A: rail grade peaks, below-terrain pieces, mesh grade errors (> 1.5x the
    # limit), twists where the mesh adds more than PRIORITY_CREASE to the measured crease.
    for r in rows:
        if r['correction'] in ('breakline-patch', 'grounded-patch') and not r['seeds']: r['correction'] = 'none (no draped piece to patch)'
        if not r['seeds']: r['priority'] = None; continue
        a = (r['kind'] == 'below-terrain' or (r['kind'] in ('steep-grade', 'grade-break') and r['severity'] == 'error')
             or (r['kind'] == 'cross-section' and r['evidence'].get('meshPart', 0) > PRIORITY_CREASE))
        r['priority'] = 'A' if a else 'B'
    for r in rail_targets: r['priority'] = 'A'
    # summary
    cnt = defaultdict(int)
    for r in rows: cnt[(r['kind'], r['category'])] += 1
    out = {
        'method': __doc__.split('\n\n')[1].strip(),
        'thresholds': {'planarResidual': PLANAR, 'nativeCrease': NATIVE_CREASE, 'shifts': [float(SHIFTS[0]), float(SHIFTS[-1])],
                       'narrow': NARROW, 'gradeMargin': GRADE_MARGIN, 'belowMin': BELOW_MIN, 'seedReach': SEED_REACH, 'railDev': RAIL_DEV},
        'source': {'diagnostics': diag['revision'], 'dtm': 'Lantmäteriet Markhöjdmodell 1 m (native, retained decks corrected)'},
        'counts': {f'{a} {b}': n for (a, b), n in sorted(cnt.items())},
        'candidates': rows,
        'railStretches': rail_targets,
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding='utf8')
    for k, n in sorted(cnt.items()): print(f'{k[0]:14} {k[1]:10} {n}')
    print('patch seeds (segments):', len({s for r in rows for s in r['seeds']}), 'priority A:', len({s for r in rows if r['priority'] == 'A' for s in r['seeds']}),
          'rail stretches:', len(rail_targets))


if __name__ == '__main__':
    main()
