"""LiDAR points in a SWEREF 99 TM window from the local Lantmäteriet COPC tiles (Laserdata NH 2020).

Tiles: work/geodata/lantmateriet/y20cNNN-<N km/10>_<E km/10>_25.copc.laz, 2.5 km squares. Returns float64
arrays E, N, Z (RH2000) and the classification (1 unclassified, 2 ground, 7 low noise, 9 water, 17 bridge,
18 high noise). Withheld points are dropped. Raw survey data stays local (DATA-LICENSE.md).

    from lidar_window import points
    E, N, Z, C = points(567300, 6498000, 567400, 6498080)
"""
import re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
import numpy as np
import laspy
from laspy import CopcReader, Bounds

SRC = ROOT / 'work/geodata/lantmateriet'
_TILES = None


def tiles():
    global _TILES
    if _TILES is None:
        _TILES = []
        for p in sorted(SRC.glob('*.copc.laz')):
            m = re.match(r'y\d+c\d+-(\d+)_(\d+)_25', p.name)
            if not m: continue
            n0, e0 = int(m.group(1)) * 100, int(m.group(2)) * 100
            _TILES.append((e0, n0, e0 + 2500, n0 + 2500, p))
    return _TILES


def points(e0, n0, e1, n1, intensity=False):
    """E, N, Z, class (and intensity when asked) of the non-withheld returns in [e0, e1) x [n0, n1)."""
    parts = []
    for te0, tn0, te1, tn1, path in tiles():
        if te1 <= e0 or te0 >= e1 or tn1 <= n0 or tn0 >= n1: continue
        with CopcReader.open(str(path)) as r:
            pts = r.query(Bounds(mins=np.array([e0, n0]), maxs=np.array([e1, n1])))
        if not len(pts): continue
        keep = ~np.asarray(pts.withheld, bool)
        x, y, z = np.asarray(pts.x), np.asarray(pts.y), np.asarray(pts.z)
        c = np.asarray(pts.classification)
        keep &= (x >= e0) & (x < e1) & (y >= n0) & (y < n1)
        cols = (x[keep], y[keep], z[keep], c[keep])
        if intensity: cols += (np.asarray(pts.intensity)[keep],)
        parts.append(cols)
    k = 5 if intensity else 4
    if not parts: return (np.zeros(0),) * 3 + (np.zeros(0, np.uint8),) + ((np.zeros(0),) if intensity else ())
    return tuple(np.concatenate([p[i] for p in parts]) for i in range(k))
