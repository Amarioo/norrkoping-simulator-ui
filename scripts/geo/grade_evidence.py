"""Step 5: remaining steep road grades against the native 1 m DTM (evidence for the report).

For each steep-grade issue of a diagnostics report (scripts/geo/infra-diagnose.test.ts, INFRA_OUT), the native
DTM grade over the same 10 m window along the way (median across ±1 m) is compared with the drawn grade.
'DTM as steep' = the DTM is at least as steep (within 3 percentage points): measured ground, or a structure
OSM/the DTM do not model; 'pipeline' = the DTM is much flatter, so the grade comes from our profiles or mesh.
A DTM grade can itself be an artefact (a retained deck, Järngatan), so 'measured' is evidence, not proof.
Usage (geodata Python): python scripts/geo/grade_evidence.py work/step5/diagnose-after.json [top]
"""
import json, math, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python')); sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import dtm_corrections

report = json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
top = int(sys.argv[2]) if len(sys.argv) > 2 else 30
city = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text(encoding='utf8'))
ref = city['meta']['reference']; unit = ref['metresPerUnit'] * ref['gridScaleFactor']
sw = lambda p: (ref['originEasting'] + p[0] * unit, ref['originNorthing'] - p[1] * unit)
native, info = dtm_corrections.native_mosaic(); corr = dtm_corrections.corrected_pixels()


def dtm(E, N):
    r, c = int(info['top'] - N), int(E - info['left'])
    return float(dtm_corrections.apply_to_block(native[r:r + 1, c:c + 1], r, c, corr)[0, 0])


ways = {}
for r in city['roads']: ways.setdefault(r['way'], []).append(r)
issues = sorted([i for i in report['issues'] if i['kind'] == 'steep-grade' and not i.get('exception')
                 and not i['detail'].startswith(('path', 'pendeln', 'tram-'))], key=lambda i: -i['value'])[:top]
rows = []
for i in issues:
    best = None
    for r in ways.get(i['way'], []):
        A, B = np.array(sw(r['a'])), np.array(sw(r['b'])); d = B - A; L = math.hypot(*d)
        if L < 1e-6: continue
        t = max(0, min(1, float((np.array([i['E'], i['N']]) - A) @ d / (L * L))))
        dist = math.hypot(*(A + d * t - [i['E'], i['N']]))
        if best is None or dist < best[0]: best = (dist, A + d * t, d / L, r)
    if best is None: continue
    _, P, u, r = best
    n = np.array([-u[1], u[0]])
    h = lambda s: float(np.median([dtm(*(P + u * s + n * o)) for o in (-1, 0, 1)]))
    # the issue point is the window start (infraDiagnostics.profiles): try both directions, take the steeper
    g = max(abs(h(10) - h(0)), abs(h(0) - h(-10))) / 10 * 100
    rows.append({'E': i['E'], 'N': i['N'], 'name': r.get('name', ''), 'class': r.get('class', ''), 'way': i['way'],
                 'drawnPercent': round(i['value'], 1), 'nativeDtmPercent': round(g, 1),
                 'verdict': 'DTM as steep' if g >= i['value'] - 3 else 'pipeline'})
out = ROOT / 'work/step5/grade-evidence.json'
out.write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding='utf8')
for r in rows:
    print(f"{r['drawnPercent']:5.1f} % drawn  {r['nativeDtmPercent']:5.1f} % DTM  {r['verdict']:12}  {r['class']:13} {r['name'][:24]:24} E {r['E']} N {r['N']} way {r['way']}")
print(sum(r['verdict'] == 'DTM as steep' for r in rows), 'of', len(rows), 'as steep in the native DTM')
