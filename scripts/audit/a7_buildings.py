"""Building base placement: base = rendered ground at first ring vertex + 0.065 units; walls start there."""
import numpy as np
from common import *
m = city(); gaps = []; sinks = []; names = []
for b in m['buildings']:
    ring = np.array(b['rings'][0])
    if len(ring) < 3:
        continue
    base = surface(*ring[0])[0] + .065 * U + b['minHeight'] * U
    g = surface(ring[:, 0], ring[:, 1])
    gaps.append(base - g.min()); sinks.append(g.max() - base)
gaps = np.array(gaps); sinks = np.array(sinks)
print(f'buildings={len(gaps)}')
print('  wall bottom above lowest footprint ground (visible gap):', stats(gaps))
for t in (1, 2, 3, 5):
    print(f'    gap > {t} m: {(gaps > t).sum()} buildings ({(gaps > t).mean()*100:.1f}%)')
print('  footprint ground above wall bottom (buried part):', f'> 1 m: {(sinks > 1).sum()}  > 3 m: {(sinks > 3).sum()}')
