/**
 * Step 5.1 probe: transport edges whose car height (terrain.profileHeight + 0.008) is not 5 cm above the drawn
 * surface (cityMesh surfaceAt), as infrastructure.test.ts checks; writes OUT (work/step51/cars.json).
 */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cityMap } from '../../src/lib/mapModel';
import { terrain, ROAD_SURFACE } from '../../src/lib/terrain';
import { surfaceAt } from '../../src/lib/cityMesh';
import transport from '../../src/lib/data/transport-network.json';

it('finds car height mismatches', () => {
  const M = terrain.data.reference.metresPerUnit;
  const key = (p: number[]) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const seg = new Map(cityMap.roads.map((r) => [key(r.a) + '|' + key(r.b), r]));
  const nodes = transport.nodes as { x: number; y: number; z: number }[];
  const out: unknown[] = [];
  for (const e of transport.edges as { from: number; to: number }[]) {
    const a = nodes[e.from],
      b = nodes[e.to];
    const fwd = seg.get(key([a.x, a.z]) + '|' + key([b.x, b.z])),
      r = fwd ?? seg.get(key([b.x, b.z]) + '|' + key([a.x, a.z]));
    if (!r) continue;
    for (const t of [0, 0.3, 0.5, 0.7, 1]) {
      const tr = fwd ? t : 1 - t,
        p: [number, number] = [r.a[0] + (r.b[0] - r.a[0]) * tr, r.a[1] + (r.b[1] - r.a[1]) * tr];
      const d = (terrain.profileHeight([a.x, a.y, a.z], [b.x, b.y, b.z], t) + 0.008 - surfaceAt(r, tr, p, ROAD_SURFACE)) * M;
      if (Math.abs(d - 0.05) > 1e-4)
        out.push({ way: r.way, t, d: +d.toFixed(4), at: terrain.toSweref(...p).map(Math.round), integrated: terrain.integrated(r.a, r.b), spans: !!r.spans, linear: !!r.linearProfile, fwd: !!fwd });
    }
  }
  writeFileSync(process.env.OUT ?? 'work/step51/cars.json', JSON.stringify(out, null, 1));
});
