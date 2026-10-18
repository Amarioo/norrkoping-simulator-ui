"""Triangle counts of the adaptive mesh for a grid of per-class tolerances (Step 3 study).

Usage: python scripts/geo/terrain_mesh_counts.py [--recompute]
Recomputes the per-class split errors (pass 1 of terrain_mesh_study.py) if missing or asked to.
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import terrain_mesh_study as s
import rtin


def main():
    s.OUT.mkdir(parents=True, exist_ok=True)
    s.init()
    err = s.W.get('err') if '--recompute' not in sys.argv else None
    if err is None:
        err = s.compute_node_errors()
    L = s.W['layout']
    rows = []
    for fb in [.3, .35, .4, .5, .6, .75]:
        for lb in [.5, .6, .75, 1.125]:
            for f in [.75, 1.]:
                tol = dict(featureBuiltUp=fb, feature=f, landBuiltUp=lb, urban=1.125, open=2.25, water=2.25)
                rows.append({**tol, 'triangles': rtin.leaves(L, s.split_nodes(err, tol))})
                print(json.dumps(rows[-1]), flush=True)
    (s.OUT / 'counts-classes.json').write_text(json.dumps(rows, indent=1), encoding='utf8')


if __name__ == '__main__':
    main()
