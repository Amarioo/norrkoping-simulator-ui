"""Step 5.1: reproducible refinement report - every candidate with coordinates, defect category, measured
magnitude, selected correction, before/after value and remaining uncertainty.

Inputs: scripts/data/geometry-refinement-targets.json (refinement_targets.py), work/step51/measure-before.json
and measure-after.json (infra-step51-measure.test.ts on the Step 5 baseline and on this tree).
Outputs: docs/step51/refinement-report.json (all candidates) and docs/step51/refinement-report.md (summary,
every corrected location, and the larger reported ones).
Usage: python scripts/geo/refinement_report.py
"""
import json
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
# Limits as in infraDiagnostics.ts LIMITS (road kind) and RAIL_GRADE_LIMIT.
LIMIT = {'cross-section': 0.3, 'steep-grade': 12.0, 'grade-break': 10.0, 'below-terrain': 0.05, 'junction-fan': 0.05, 'rail-grade': 2.5}
UNIT = {'cross-section': 'm', 'below-terrain': 'm', 'junction-fan': 'm', 'steep-grade': '%', 'grade-break': 'pp', 'rail-grade': '%'}


def uncertainty(c):
    ev = c.get('evidence', {}); k = c['kind']; cat = c['category']
    if k == 'cross-section':
        notes = []
        if cat == 'mesh': notes.append(f"measured crease {ev['nativeCrease']:+.2f} m (1 m DTM, median of 3 lines, ±0.05 m)")
        if c.get('secondary') or cat in ('alignment', 'width', 'measured'):
            sec = c.get('secondary') or cat
            if sec == 'alignment': notes.append(f"horizontal: OSM centreline about {abs(ev['bestShift'][0]):.1f} m beside the carriageway")
            elif sec == 'width': notes.append(f"horizontal: drawn width {ev['widthMetres']} m covers a verge/wall (planar at 60 %)")
            else: notes.append('measured relief inside the drawn footprint (kerb, wall or ditch)')
        if abs(ev.get('stripResidual', 1) - 0.15) < 0.03 or abs(ev.get('meshPart', 1) - 0.3) < 0.05: notes.append('classification marginal')
        if ev.get('widthMetres') in (6.6, 4.5): notes.append('OSM width is the class default')
        return '; '.join(notes)
    if k in ('steep-grade', 'grade-break'):
        if cat == 'measured': return f"native DTM {ev['nativeDtmPercent']} %: real slope or an unmodelled structure (ramp, retaining wall)"
        if cat == 'profile': return 'linear piece (deck/approach profile), not a terrain defect'
        return f"native DTM {ev['nativeDtmPercent']} % over the same window"
    if k == 'below-terrain': return ev.get('detail', '')
    if k == 'junction-fan': return 'fan geometry rule; exact on both shared edges'
    if k == 'rail-grade':
        return (f"native DTM {ev.get('nativeDtmGradeMaxInWindowPercent')} % / LiDAR ground {ev.get('lidarGroundGradePercent')} % over 20 m; "
                'no Trafikverket profile offline (line maximum 25 ‰)')
    return ''


def correction(c):
    if c['seeds'] and c.get('priority') != 'A': return 'patch (priority B, not applied)'
    # road_patches.py STRIP_MAX: no measured surface over a non-planar footprint (wall, terrace)
    if c['seeds'] and c['kind'] in ('cross-section', 'steep-grade', 'grade-break') and c.get('evidence', {}).get('stripResidual', 0) > 0.5:
        return 'none (measured footprint not planar)'
    return c['correction']


def main():
    t = read(ROOT / 'scripts/data/geometry-refinement-targets.json')
    before = {v['i']: v['value'] for v in read(ROOT / 'work/step51/measure-before.json')['values']}
    after_doc = read(ROOT / 'work/step51/measure-after.json')
    after = {v['i']: v['value'] for v in after_doc['values']}
    rows = []
    for i, c in enumerate(t['candidates']):
        b, a = before.get(i), after.get(i)
        lim = LIMIT.get(c['kind'])
        if a is None or b is None or lim is None: status = 'n/a'
        elif abs(a) <= lim: status = 'within limit' if abs(b) > lim else 'was within limit'
        elif c['kind'] == 'cross-section' and 'nativeCrease' in c.get('evidence', {}) and abs(a) <= abs(c['evidence']['nativeCrease']) + 0.15:
            status = 'at measured value'
        elif abs(a) < abs(b) - 0.25 * lim: status = 'improved'
        elif abs(a) > abs(b) + 0.25 * lim: status = 'worse'
        else: status = 'unchanged'
        rows.append({'id': i, 'kind': c['kind'], 'E': round(c['E']), 'N': round(c['N']), 'way': c.get('way'), 'name': c.get('name', ''),
                     'category': c['category'], 'secondary': c.get('secondary'), 'priority': c.get('priority'),
                     'magnitude': c['drawn'], 'unit': UNIT[c['kind']], 'before': b, 'after': a,
                     'correction': correction(c),
                     'status': status, 'uncertainty': uncertainty(c), 'evidence': c.get('evidence', {})})
    out = ROOT / 'docs/step51'; out.mkdir(parents=True, exist_ok=True)
    (out / 'refinement-report.json').write_text(json.dumps({'source': t['source'], 'afterRevision': after_doc['revision'],
                                                           'thresholds': t['thresholds'], 'rows': rows}, indent=1, ensure_ascii=False), encoding='utf8')
    cnt = Counter((r['kind'], r['category'], r['correction'], r['status']) for r in rows)
    md = ['# Step 5.1 geometric refinement report', '',
          f"Generated by `scripts/geo/refinement_report.py` from `scripts/data/geometry-refinement-targets.json`; after = surface revision `{after_doc['revision']}`.",
          'Values are re-measured at each location with the diagnostics\' own rules (`scripts/geo/infra-step51-measure.test.ts`).', '',
          '## Summary', '', '| Defect | Category | Correction | Status | Count |', '|---|---|---|---|---|']
    for (k, cat, corr, st), n in sorted(cnt.items()): md.append(f'| {k} | {cat} | {corr} | {st} | {n} |')
    fmt = lambda v: '–' if v is None else f'{v:.2f}'
    sel = [r for r in rows if r['priority'] == 'A' or r['kind'] in ('rail-grade', 'junction-fan')
           or (r['category'] in ('alignment', 'width', 'measured') and r['kind'] == 'cross-section' and abs(r['magnitude']) > 0.5)
           or (r['category'] == 'structure')]
    md += ['', '## Corrected locations (priority A) and the larger reported ones', '',
           '| # | Defect | E | N | Way / name | Category | Before | After | Unit | Correction | Status | Uncertainty |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for r in sorted(sel, key=lambda r: (r['kind'], -abs(r['before'] or 0))):
        cat = r['category'] + (f" + {r['secondary']}" if r['secondary'] else '')
        md.append(f"| {r['id']} | {r['kind']} | {r['E']} | {r['N']} | {r['way']} {r['name']} | {cat} | {fmt(r['before'])} | {fmt(r['after'])} | {r['unit']} | {r['correction']} | {r['status']} | {r['uncertainty']} |")
    (out / 'refinement-report.md').write_text('\n'.join(md) + '\n', encoding='utf8')
    for (k, cat, corr, st), n in sorted(cnt.items()): print(f'{k:14} {cat:10} {corr:32} {st:16} {n}')


if __name__ == '__main__':
    main()
