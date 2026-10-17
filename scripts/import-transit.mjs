// Build continuous, mapped public-transport paths. No straight-line shortcuts across blocks.
export function buildTransit(raw, extra, project, railHeight) {
  const key = (p) => p[0] + ',' + p[1],
    distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ways = new Map(raw.elements.filter((e) => e.type === 'way').map((e) => [e.id, e]));
  for (const rel of extra.elements.filter((e) => e.type === 'relation'))
    for (const m of rel.members)
      if (m.type === 'way' && !m.role && m.geometry && !ways.has(m.ref))
        ways.set(m.ref, { id: m.ref, tags: { railway: 'tram' }, geometry: m.geometry });
  function graph(kind) {
    const points = [],
      ids = new Map(),
      links = [];
    const node = (p) => {
      const k = key(p);
      if (!ids.has(k)) {
        ids.set(k, points.length);
        points.push(p);
        links.push([]);
      }
      return ids.get(k);
    };
    for (const w of ways.values())
      if (
        w.tags?.railway === kind &&
        w.geometry &&
        (kind === 'tram' ||
          ((!w.tags.service || w.tags.service === 'crossover') && w.tags.usage !== 'industrial'))
      ) {
        const ps = w.geometry.map((p) => project([p.lon, p.lat]));
        for (let i = 1; i < ps.length; i++) {
          if (
            kind === 'rail' &&
            [ps[i - 1], ps[i]].some(
              (p) => p[0] < -284.179 || p[0] > 249.513 || p[1] < -267.564 || p[1] > 154.742,
            )
          )
            continue;
          const a = node(ps[i - 1]),
            b = node(ps[i]),
            d = distance(ps[i - 1], ps[i]);
          if (d > 0.001) {
            links[a].push({ to: b, d });
            links[b].push({ to: a, d });
          }
        }
      }
    const nearest = (p) =>
      points.reduce((best, q, i) => (distance(p, q) < distance(p, points[best]) ? i : best), 0);
    function shortest(from, to, avoid = new Set()) {
      const costs = Array(points.length).fill(Infinity),
        prev = Array(points.length).fill(-1),
        todo = new Set(points.map((_, i) => i));
      costs[from] = 0;
      while (todo.size) {
        let u = -1;
        for (const i of todo) if (u < 0 || costs[i] < costs[u]) u = i;
        if (!Number.isFinite(costs[u])) break;
        todo.delete(u);
        if (u === to) break;
        for (const e of links[u]) {
          const edge = [Math.min(u, e.to), Math.max(u, e.to)].join(':');
          const c = costs[u] + e.d * (avoid.has(edge) ? 1000 : 1);
          if (c < costs[e.to]) {
            costs[e.to] = c;
            prev[e.to] = u;
          }
        }
      }
      if (to === undefined) return { costs };
      if (!Number.isFinite(costs[to])) throw new Error('Disconnected ' + kind + ' route');
      const path = [];
      for (let u = to; u !== -1; u = prev[u]) {
        path.push(u);
        if (u === from) break;
      }
      return path.reverse();
    }
    return { points, links, nearest, shortest };
  }
  const routes = [],
    tram = graph('tram');
  const extras = new Map(extra.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  for (const ref of ['2', '3']) {
    const relations = extra.elements.filter(
      (e) => e.type === 'relation' && e.tags?.route === 'tram' && e.tags.ref === ref,
    );
    const path = [],
      stops = [],
      destinations = [];
    for (const rel of relations) {
      destinations.push({
        pointIndex: Math.max(0, path.length - 1),
        name: rel.tags.to.replace('Klockaretorpets vändplats', 'Klockaretorpet'),
      });
      const members = rel.members.filter((m) => m.type === 'way' && !m.role && m.geometry);
      for (let i = 0; i < members.length; i++) {
        let ps = members[i].geometry.map((p) => project([p.lon, p.lat]));
        if (path.length) {
          if (distance(path.at(-1), ps.at(-1)) < distance(path.at(-1), ps[0])) ps.reverse();
        } else if (members[i + 1]) {
          const next = members[i + 1].geometry.map((p) => project([p.lon, p.lat]));
          if (
            Math.min(distance(ps[0], next[0]), distance(ps[0], next.at(-1))) <
            Math.min(distance(ps.at(-1), next[0]), distance(ps.at(-1), next.at(-1)))
          )
            ps.reverse();
        }
        if (path.length && distance(path.at(-1), ps[0]) > 0.01) {
          const connector = tram.shortest(tram.nearest(path.at(-1)), tram.nearest(ps[0]));
          path.push(...connector.slice(1).map((i) => tram.points[i]));
        }
        for (const p of ps) if (!path.length || distance(path.at(-1), p) > 0.001) path.push(p);
      }
      for (const m of rel.members.filter(
        (m) => m.type === 'node' && m.role.startsWith('stop') && m.lat,
      ))
        stops.push({
          point: project([m.lon, m.lat]),
          name: extras.get(m.ref)?.tags?.name ?? 'Hållplats',
        });
    }
    if (path.length) {
      if (distance(path.at(-1), path[0]) > 0.001)
        path.push(
          ...tram
            .shortest(tram.nearest(path.at(-1)), tram.nearest(path[0]))
            .slice(1)
            .map((i) => tram.points[i]),
        );
      routes.push(make('tram-' + ref, 'tram', 'Spårvagn ' + ref, path, stops, true, destinations));
    }
  }
  const rail = graph('rail'),
    station = project([16.18417, 58.59618]),
    start = rail.nearest(station);
  const { costs } = rail.shortest(start);
  const candidates = rail.points
    .map((_, i) => i)
    .filter((i) => Number.isFinite(costs[i]) && costs[i] > 60 && rail.links[i].length >= 2)
    .sort((a, b) => rail.points[a][0] - rail.points[b][0]);
  let chosen;
  for (const end of candidates.slice(0, 80)) {
    const outward = rail.shortest(start, end),
      avoid = new Set(
        outward
          .slice(1)
          .map((v, i) => [Math.min(v, outward[i]), Math.max(v, outward[i])].join(':')),
      );
    const inward = rail.shortest(end, start, avoid),
      overlap =
        inward
          .slice(1)
          .filter((v, i) => avoid.has([Math.min(v, inward[i]), Math.max(v, inward[i])].join(':')))
          .length / inward.length;
    if (!chosen || overlap < chosen.overlap)
      chosen = { path: [...outward, ...inward.slice(1)], overlap };
    if (overlap < 0.03) break;
  }
  if (!chosen) throw new Error('No connected railway circuit');
  console.log('Rail circuit shared edges:', Math.round(chosen.overlap * 100) + '%');
  routes.push(
    make(
      'pendeln',
      'train',
      'Östgötapendeln',
      chosen.path.map((i) => rail.points[i]),
      [{ point: rail.points[start], name: 'Norrköping C' }],
      true,
    ),
  );
  function make(id, kind, name, path, stops, loop, destinations = []) {
    const cumulative = [0];
    for (let i = 1; i < path.length; i++)
      cumulative.push(cumulative.at(-1) + distance(path[i - 1], path[i]));
    const mappedStops = [];
    for (const stop of stops) {
      let best = Infinity,
        at = 0;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i],
          dx = b[0] - a[0],
          dz = b[1] - a[1],
          l = distance(a, b);
        const t = Math.max(
          0,
          Math.min(1, ((stop.point[0] - a[0]) * dx + (stop.point[1] - a[1]) * dz) / (l * l)),
        );
        const d = distance(stop.point, [a[0] + dx * t, a[1] + dz * t]);
        if (d < best) {
          best = d;
          at = cumulative[i - 1] + l * t;
        }
      }
      if (best < 1.5 && !mappedStops.some((s) => Math.abs(s.distance - at) < 0.3))
        mappedStops.push({ distance: at, name: stop.name });
    }
    return {
      id,
      kind,
      name,
      loop,
      destinations: destinations.map((d) => ({ distance: cumulative[d.pointIndex], name: d.name })),
      points: path.map((p) => [p[0], railHeight(p) + 0.018, p[1]]),
      stops: mappedStops.sort((a, b) => a.distance - b.distance),
    };
  }
  return routes;
}
