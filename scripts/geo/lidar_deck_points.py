"""Batch C: LiDAR bridge-deck returns (Lantmäteriet Laserdata NH 2020, class 17 "bro") for the whole map.

Reads every local COPC tile (work/geodata/lantmateriet/*.copc.laz, SWEREF 99 TM / RH2000) once and caches
the class 17 points that are not withheld as float32 [E, N, Z] per tile in
work/geodata/lantmateriet/deck17/<tile>.npy (ignored by Git; raw survey data stays local, see DATA-LICENSE.md).
prepare-bridge-profiles.py uses them for measured deck heights.
Usage (geodata Python):  python scripts/geo/lidar_deck_points.py
"""
import sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
import numpy as np
import laspy

SRC = ROOT / 'work/geodata/lantmateriet'
OUT = SRC / 'deck17'

if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    t0 = time.time(); total = 0
    for path in sorted(SRC.glob('*.copc.laz')):
        target = OUT / (path.name.split('.')[0] + '.npy')
        if target.exists():
            total += len(np.load(target)); continue
        parts = []
        with laspy.open(path, laz_backend=laspy.LazBackend.LazrsParallel) as r:
            for ch in r.chunk_iterator(3_000_000):
                keep = (np.asarray(ch.classification) == 17) & ~np.asarray(ch.withheld, bool)
                if keep.any():
                    parts.append(np.c_[np.asarray(ch.x)[keep], np.asarray(ch.y)[keep], np.asarray(ch.z)[keep]].astype(np.float64))
        a = np.concatenate(parts) if parts else np.zeros((0, 3))
        # float32 loses mm on 6.5e6 northings: store relative to the tile's lower-left corner.
        origin = np.floor(a.min(0)[:2]) if len(a) else np.zeros(2)
        np.save(target, np.c_[a[:, :2] - origin, a[:, 2]].astype(np.float32))
        np.save(OUT / (path.name.split('.')[0] + '.origin.npy'), origin)
        total += len(a)
        print(f'{path.name}: {len(a)} deck points, {time.time() - t0:.0f} s', flush=True)
    print('total', total)
