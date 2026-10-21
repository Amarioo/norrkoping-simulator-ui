"""Batch B study: terrain triangles needed to bound the mesh error on road and tram running surfaces.

Run (geodata Python):  set MESH_NETWORK_CLASS=1 && python scripts/geo/network_mesh_budget.py
Pass 1 (split errors with a separate 'network' class) is cached in work/batchB/mesh; the Step 3 profile
(bu0.4-0.75) is reproduced with network = 0.4 in the built-up area to check the class split, then
tighter network tolerances are counted. Writes work/batchB/mesh/counts-network.json.
"""
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np

if __name__ == '__main__':
    assert os.environ.get('MESH_NETWORK_CLASS') == '1', 'set MESH_NETWORK_CLASS=1'
    import terrain_mesh_study as s
    import rtin
    s.OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    if not all((s.OUT / f'node-error-{c}.npy').exists() for c in s.CLASSES):
        s.compute_node_errors()
    s.init()
    err, L = s.W['err'], s.W['layout']
    base = dict(featureBuiltUp=.4, feature=.75, landBuiltUp=.75, urban=1.125, open=2.25, water=2.25)
    rows = []
    for net in [None, .4, .3, .25, .2, .15, .1]:
        # None: network pixels at the old per-class tolerance of their area (0.4 built-up / 0.75 elsewhere
        # is not separable here, so 0.4 everywhere is an upper bound of the current refinement).
        tol = dict(base, network=net if net is not None else .75)
        rows.append({'network': net, 'triangles': int(rtin.leaves(L, s.split_nodes(err, tol))),
                     'activeNodes': int(s.split_nodes(err, tol).sum())})
        print(json.dumps(rows[-1]), f'{time.time() - t0:.0f} s', flush=True)
    (s.OUT / 'counts-network.json').write_text(json.dumps(rows, indent=1), encoding='utf8')
