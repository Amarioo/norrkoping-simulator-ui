"""Triangle counts for budget-oriented tolerance families (Step 3 study); needs cached split errors."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import terrain_mesh_study as s
import rtin

if __name__ == '__main__':
    s.init()
    err, L = s.W['err'], s.W['layout']
    rows = []
    for t in [.5, .75, 1., 1.25, 1.5, 2., 2.5, 3., 4., 5.]:
        for name, tol in {'equal': dict(feature=t, urban=t, open=t, water=t),
                          'feature-first': dict(feature=t, urban=1.5 * t, open=3 * t, water=3 * t)}.items():
            rows.append({'family': name, **tol, 'triangles': rtin.leaves(L, s.split_nodes(err, tol))})
            print(json.dumps(rows[-1]), flush=True)
    (s.OUT / 'counts-budget.json').write_text(json.dumps(rows, indent=1), encoding='utf8')
