import pc from 'polygon-clipping';

function union(polygons) {
  let result = [];
  // Batches keep clipping's sweep queue bounded for the regional water network.
  for (let i = 0; i < polygons.length; i += 40)
    result = pc.union(result, ...polygons.slice(i, i + 40));
  return result;
}
export function waterFootprints(geo, raw, project, clip) {
  const polygons = [];
  for (const f of geo.features) {
    const p = f.properties,
      g = f.geometry;
    if (!g || !(p.natural === 'water' || p.waterway === 'riverbank')) continue;
    for (const polygon of g.type === 'Polygon'
      ? [g.coordinates]
      : g.type === 'MultiPolygon'
        ? g.coordinates
        : [])
      polygons.push(polygon.map((r) => r.map(project)));
  }
  for (const e of raw.elements) {
    if (
      e.type !== 'way' ||
      !e.geometry ||
      !['river', 'stream', 'canal', 'drain', 'ditch'].includes(e.tags?.waterway) ||
      e.tags.tunnel
    )
      continue;
    const width = (parseFloat(e.tags.width) || 3) / 25;
    const points = e.geometry.map((p) => project([p.lon, p.lat]));
    // Join both banks through bends; separate segment rectangles leave triangular notches.
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1],
        p = points[i],
        b = points[i + 1];
      const before = Math.hypot(p[0] - a[0], p[1] - a[1]),
        after = Math.hypot(b[0] - p[0], b[1] - p[1]);
      if (before < 0.001 || after < 0.001) continue;
      const n1 = [((-(p[1] - a[1]) / before) * width) / 2, (((p[0] - a[0]) / before) * width) / 2];
      const n2 = [((-(b[1] - p[1]) / after) * width) / 2, (((b[0] - p[0]) / after) * width) / 2];
      if (Math.abs(n1[0] * n2[1] - n1[1] * n2[0]) < 1e-10) continue;
      for (const side of [-1, 1])
        polygons.push([
          [
            p,
            [p[0] + side * n1[0], p[1] + side * n1[1]],
            [p[0] + side * n2[0], p[1] + side * n2[1]],
            p,
          ],
        ]);
    }
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len = Math.hypot(dx, dz);
      if (len < 0.001) continue;
      const nx = ((-dz / len) * width) / 2,
        nz = ((dx / len) * width) / 2;
      polygons.push([
        [
          [a[0] + nx, a[1] + nz],
          [b[0] + nx, b[1] + nz],
          [b[0] - nx, b[1] - nz],
          [a[0] - nx, a[1] - nz],
          [a[0] + nx, a[1] + nz],
        ],
      ]);
    }
  }
  return pc.intersection(union(polygons), clip);
}
export function crossesWater(points, water) {
  // Intersect a narrow ribbon, rather than checking endpoints: both bridge ends lie on land.
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz);
    if (len < 0.001) continue;
    const nx = (-dz / len) * 0.001,
      nz = (dx / len) * 0.001;
    const ribbon = [
      [
        [a[0] + nx, a[1] + nz],
        [b[0] + nx, b[1] + nz],
        [b[0] - nx, b[1] - nz],
        [a[0] - nx, a[1] - nz],
        [a[0] + nx, a[1] + nz],
      ],
    ];
    if (pc.intersection(water, ribbon).length) return true;
  }
  return false;
}
export function carveTerrain(areas, water, clip) {
  const mask = union([water, ...areas.filter((a) => a.kind === 'water').map((a) => a.rings)]);
  const ground = pc.difference(clip, mask).map((rings, i) => ({ id: 'terrain/' + i, rings }));
  const surfaces = areas
    .filter((a) => a.kind !== 'water')
    .flatMap((a) => pc.difference(a.rings, mask).map((rings) => ({ ...a, rings })));
  surfaces.push(...mask.map((rings, i) => ({ id: 'water/' + i, kind: 'water', rings })));
  return { ground, surfaces };
}
