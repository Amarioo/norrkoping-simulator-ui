"""Adaptive terrain mesh for the active DTM grid (Step 3, 2026-10-18).

Adds `mesh` to src/lib/data/terrain.json (and the backend copy): a right-triangulated irregular
network over the 5 m DTM nodes (scripts/geo/rtin.py), refined wherever a native Lantmäteriet 1 m DTM
pixel centre deviates from the triangle plane by more than the tolerance of its class (TOLERANCES;
classes in scripts/geo/terrain_mesh_study.py: road/path/tram surfaces, rail corridors, building
footprints and shorelines, stricter within 30 m of buildings; land cover; open water). Vertex heights are the existing grid
values, so heights, RH2000 and SWEREF 99 TM positions are unchanged; only where the surface is
subdivided changes. terrain.ts / surfaceMesh.ts and TerrainService.kt read the mesh.

The split errors are computed by scripts/geo/terrain_mesh_study.py (pass 1 over all native pixels in
the map), one grid per class, cached in work/terrain-step3/node-error-<class>.npy for the DTM grid.

Flags:
  --activate     write terrain.json (client and backend), the new revision and buildings-3d.json
  --recompute    recompute the split errors from the native DTM even if a cache exists
  --tolerances=feature=0.5,urban=0.75,...   override TOLERANCES (study candidates)
"""
import json, sys, base64, hashlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
sys.path.insert(0, str(ROOT / 'scripts/geo'))
import numpy as np
import rtin

# Metres per error class (see docs/terrain-step3.md for the trade-off study).
TOLERANCES = {'featureBuiltUp': 0.4, 'feature': 0.75, 'landBuiltUp': 0.75, 'urban': 1.125, 'open': 2.25,
              'water': 2.25}
DEPTH = 6                 # 320 m root cells
TARGETS = [ROOT / 'src/lib/data/terrain.json',
           ROOT.parent / 'norrkoping-simulator-backend/src/main/resources/terrain.json']


def node_errors(dataset, recompute=False):
    import terrain_mesh_study as study
    stamp = study.OUT / 'node-error.json'
    caches = {c: study.OUT / f'node-error-{c}.npy' for c in study.CLASSES}
    grid = dataset['revision'].split('-surface-')[0]
    if not recompute and all(p.exists() for p in caches.values()) and stamp.exists() \
            and rtin.read(stamp).get('grid') == grid and rtin.read(stamp).get('depth') == DEPTH:
        return {c: np.load(p) for c, p in caches.items()}
    err = study.compute_node_errors()
    stamp.write_text(json.dumps({'grid': grid, 'depth': DEPTH}), encoding='utf8')
    return err


def build(dataset, recompute=False):
    tile, _ = rtin.load_grid(dataset)
    layout = rtin.Layout(tile, DEPTH)
    err = node_errors(dataset, recompute)
    if any(e.shape != (layout.rows, layout.columns) for e in err.values()):
        raise ValueError('Split errors do not match the terrain grid; run with --recompute')
    active = np.zeros((layout.rows, layout.columns), bool)
    for c, tolerance in TOLERANCES.items():
        active |= err[c] > tolerance
    # Conformity: the split errors are propagated, so every split triangle's neighbour across its
    # hypotenuse and every ancestor are split too. Check it rather than trust it.
    check_conforming(layout, active)
    bits = np.packbits(active.ravel(), bitorder='little')
    mesh = {
        'kind': 'rtin', 'tile': tile['id'], 'x': layout.x0, 'z': layout.z0, 'step': tile['step'],
        'depth': DEPTH, 'columns': layout.columns, 'rows': layout.rows, 'tolerancesMetres': TOLERANCES,
        'errorReference': 'Max |plane - DTM| over the native Lantmäteriet 1 m DTM pixel centres (EPSG:5845) '
                          'of each class in each triangle. feature = road/path/tram surfaces, rail '
                          'corridors (15 m), building footprints, 10 m either side of shorelines; built-up '
                          '= within 30 m of a mapped building footprint (featureBuiltUp, landBuiltUp); '
                          'urban = built-up land cover elsewhere; open = other land; water = open water. '
                          'Vertices are the 5 m grid nodes (no new heights).',
        'triangles': rtin.leaves(layout, active),
        'activeBase64': base64.b64encode(bits.tobytes()).decode('ascii'),
    }
    return mesh, layout, active


def check_conforming(layout, active):
    """Martini closure, checked explicitly: every split triangle's parent is split, and so is its
    neighbour across the hypotenuse (both share the midpoint node, so that holds by construction)."""
    rows, cols = active.shape
    bad = 0
    for kind, j, cell in layout.levels():
        half = cell // 2
        if kind == 'square':
            if cell == 1 or j == 0:
                continue
            # A split cell centre: both halves of the cell are children of quarters of the parent cell
            # (twice the size) whose hypotenuses are the two parent edges the cell touches.
            jj, ii = np.nonzero(active[half::cell, half::cell])
            P = 2 * cell
            pi0 = (ii // 2) * P; pj0 = (jj // 2) * P
            bad += int((~active[pj0 + (jj % 2) * P, pi0 + cell]).sum())
            bad += int((~active[pj0 + cell, pi0 + (ii % 2) * P]).sum())
        else:
            # A split edge midpoint: the quarters on both sides are children of the halves of their
            # cells, which are split when the cell centre is.
            jj, ii = np.nonzero(active[0::cell, half::cell])
            mi = ii * cell + half; mj = jj * cell
            for dz in (-half, half):
                cz = mj + dz; ok = (cz >= 0) & (cz < rows)
                bad += int((ok & ~active[np.clip(cz, 0, rows - 1), mi]).sum())
            jj, ii = np.nonzero(active[half::cell, 0::cell])
            mi = ii * cell; mj = jj * cell + half
            for dx in (-half, half):
                cx = mi + dx; ok = (cx >= 0) & (cx < cols)
                bad += int((ok & ~active[mj, np.clip(cx, 0, cols - 1)]).sum())
    if bad:
        raise ValueError(f'Terrain mesh is not conforming: {bad} split nodes without a split parent')


def write(path, data, attempts=5):
    """Write with retries: on Windows a reader (test run, dev server, virus scan) can briefly lock it."""
    import time
    for attempt in range(attempts):
        try:
            path.write_bytes(data)
            return
        except OSError:
            if attempt == attempts - 1:
                raise
            time.sleep(1 + attempt)


def main():
    for arg in sys.argv[1:]:
        if arg.startswith('--tolerances='):
            TOLERANCES.update({k: float(v) for k, v in (p.split('=') for p in arg.split('=', 1)[1].split(','))})
    dataset = rtin.read(TARGETS[0])
    mesh, layout, active = build(dataset, '--recompute' in sys.argv)
    dataset['mesh'] = mesh
    profiles = (ROOT / 'src/lib/data/bridge-profiles.json').read_text(encoding='utf8')
    dataset['revision'] = rtin.surface_revision(dataset, profiles)
    print(json.dumps({'revision': dataset['revision'], 'triangles': mesh['triangles'], 'tolerances': TOLERANCES,
                      'activeNodes': int(active.sum()), 'bytes': len(mesh['activeBase64'])}))
    if '--activate' not in sys.argv:
        return
    content = json.dumps(dataset, ensure_ascii=False, separators=(',', ':')) + '\n'
    building_path = ROOT / 'src/lib/data/buildings-3d.json'
    buildings = rtin.read(building_path)
    if buildings['buildings']:
        raise ValueError('Validate measured buildings before changing terrain revision')
    previous = [p.read_bytes() for p in TARGETS + [building_path]]
    buildings['terrainRevision'] = dataset['revision']
    try:
        for target in TARGETS:
            write(target, content.encode('utf8'))
        write(building_path, (json.dumps(buildings) + '\n').encode('utf8'))
    except Exception:
        for p, old in zip(TARGETS + [building_path], previous):
            write(p, old)
        raise
    print('activated')


if __name__ == '__main__':
    main()
