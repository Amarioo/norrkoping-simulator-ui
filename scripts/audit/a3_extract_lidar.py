"""Extract class 2 (ground, thinned), 9 (water) and 17 (bridge deck) points for central tiles."""
import sys, numpy as np, laspy
from common import LAS
tiles = sys.argv[1:] or ['y20c012-64925_5675_25', 'y20c012-64950_5675_25']
for t in tiles:
    out = []
    with laspy.open(LAS / f'{t}.copc.laz') as r:
        print(t, r.header.point_count, r.header.parse_crs().to_string(), flush=True)
        for ch in r.chunk_iterator(2_000_000):
            c = np.asarray(ch.classification); keep = ((c == 9) | (c == 17) | ((c == 2) & (np.random.rand(len(c)) < .15)))
            keep &= ~np.asarray(ch.withheld, bool)
            out.append(np.c_[np.asarray(ch.x)[keep], np.asarray(ch.y)[keep], np.asarray(ch.z)[keep], c[keep],
                             np.asarray(ch.gps_time)[keep]])
    a = np.concatenate(out)
    np.save(CACHE / f'lidar_{t}.npy', a)
    for k in (2, 9, 17):
        m = a[:, 3] == k
        print('  class', k, int(m.sum()), 'z range', np.round(np.percentile(a[m, 2], [1, 50, 99]), 2) if m.any() else '-')
    import datetime
    gt = a[:, 4]; print('  gps_time range (adjusted standard GPS s):', gt.min(), gt.max())
