import {
  Group,
  InstancedMesh,
  CylinderGeometry,
  BoxGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Matrix4,
  Quaternion,
  Vector3,
  Color,
} from 'three';
import { cityMap, type Point } from './mapModel';
import { distanceToSegment } from './mapVegetation';
export function createTrafficSignals() {
  const group = new Group(),
    owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  const roads = cityMap.roads.filter((r) => r.kind === 'road');
  const placements = cityMap.signals.map((signal) => {
    let nearest = roads[0],
      distance = Infinity;
    for (const r of roads) {
      const d = distanceToSegment(signal.position, r.a, r.b);
      if (d < distance) {
        nearest = r;
        distance = d;
      }
    }
    const dx = nearest.b[0] - nearest.a[0],
      dz = nearest.b[1] - nearest.a[1],
      len = Math.hypot(dx, dz),
      side = nearest.width * 0.6;
    return {
      p: [signal.position[0] - (dz / len) * side, signal.position[1] + (dx / len) * side] as Point,
      y: nearest.yA,
      heading: Math.atan2(dx, dz),
      horizontal: signal.horizontal ?? Math.abs(dx) > Math.abs(dz),
    };
  });
  const poles = own(
    new InstancedMesh(
      own(new CylinderGeometry(0.003, 0.004, 0.14, 6)),
      own(new MeshStandardMaterial({ color: '#555c5b', metalness: 0.5 })),
      placements.length,
    ),
  );
  const heads = own(
    new InstancedMesh(
      own(new BoxGeometry(0.022, 0.052, 0.018)),
      own(new MeshStandardMaterial({ color: '#222b2d' })),
      placements.length,
    ),
  );
  const lamps = own(
    new InstancedMesh(
      own(new SphereGeometry(0.005, 6, 5)),
      own(new MeshBasicMaterial({ color: '#ffffff' })),
      placements.length * 6,
    ),
  );
  const m = new Matrix4(),
    q = new Quaternion(),
    s = new Vector3(1, 1, 1),
    p = new Vector3();
  placements.forEach((a, i) => {
    q.setFromAxisAngle(new Vector3(0, 1, 0), a.heading);
    m.compose(p.set(a.p[0], a.y + 0.07, a.p[1]), q, s);
    poles.setMatrixAt(i, m);
    m.compose(p.set(a.p[0], a.y + 0.135, a.p[1]), q, s);
    heads.setMatrixAt(i, m);
    for (let face = 0; face < 2; face++)
      for (let c = 0; c < 3; c++) {
        m.compose(
          p.set(
            a.p[0] + Math.sin(a.heading) * (face ? -0.011 : 0.011),
            a.y + 0.15 - c * 0.015,
            a.p[1] + Math.cos(a.heading) * (face ? -0.011 : 0.011),
          ),
          q,
          s,
        );
        lamps.setMatrixAt(i * 6 + face * 3 + c, m);
      }
  });
  group.add(poles, heads, lamps);
  let last = -1;
  return {
    group,
    update(time: number) {
      const tick = Math.floor(time * 2);
      if (tick === last) return;
      last = tick;
      const phase = time % 48;
      placements.forEach((a, i) => {
        const green = a.horizontal ? phase < 20 : phase >= 24 && phase < 44;
        const amber = a.horizontal ? phase >= 20 && phase < 24 : phase >= 44;
        for (let f = 0; f < 2; f++)
          for (let c = 0; c < 3; c++)
            lamps.setColorAt(
              i * 6 + f * 3 + c,
              new Color(
                c === 0
                  ? !green && !amber
                    ? '#ff4e38'
                    : '#471f1b'
                  : c === 1
                    ? amber
                      ? '#ffd66a'
                      : '#453c20'
                    : green
                      ? '#67ed99'
                      : '#1d3c2c',
              ),
            );
      });
      lamps.instanceColor!.needsUpdate = true;
    },
    dispose() {
      owned.forEach((r) => r.dispose());
      group.clear();
    },
  };
}
