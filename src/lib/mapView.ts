import {
  BufferGeometry,
  Float32BufferAttribute,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  ShapeUtils,
  Vector2,
  InstancedMesh,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { cityMap, type MapPolygon, type MapBuilding, type Point } from './mapModel';
import { trenchPoint, trenchDepth } from './ingelstaTerrain';
import terrainLevels from './data/terrain-levels.json';
import { createRiverfrontDetails } from './riverfrontDetails';
import { createCityBridges } from './cityBridges';
import { treeProfile } from './treeProfile';
import { createParkTrees } from './mapVegetation';
import { createLandmarkDetails } from './mapLandmarks';
import { createCityPlaces, DETAILED_BUILDING_IDS, isDetailPlantingClear } from './cityPlaces';

export class Batch {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  triangle(
    a: number[],
    b: number[],
    c: number[],
    color: Color,
    uv: number[][] = [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  ) {
    const ab = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
      ac = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = ab.cross(ac).normalize();
    for (const [i, p] of [a, b, c].entries()) {
      this.positions.push(...p);
      this.normals.push(n.x, n.y, n.z);
      this.colors.push(color.r, color.g, color.b);
      this.uvs.push(...uv[i]);
    }
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: Color, u = 1, v = 1) {
    this.triangle(a, b, c, color, [
      [0, 0],
      [u, 0],
      [u, v],
    ]);
    this.triangle(a, c, d, color, [
      [0, 0],
      [u, v],
      [0, v],
    ]);
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    g.computeBoundingSphere();
    return g;
  }
}
function contours(poly: MapPolygon) {
  return poly.rings.map((r) => {
    const clean = r.slice();
    if (clean.length > 1 && clean[0][0] === clean.at(-1)![0] && clean[0][1] === clean.at(-1)![1])
      clean.pop();
    return clean.map((p) => new Vector2(p[0], -p[1]));
  });
}
export function fill(batch: Batch, poly: MapPolygon, y: number, color: Color) {
  const rings = contours(poly);
  if (rings[0].length < 3) return;
  const all = rings.flat();
  for (const face of ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
    const p = face.map((i) => [all[i].x, y, -all[i].y]);
    batch.triangle(p[0], p[1], p[2], color);
  }
}
export function strip(
  batch: Batch,
  a: Point,
  b: Point,
  width: number,
  y: number,
  color: Color,
  yB = y,
) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    len = Math.hypot(dx, dz);
  if (len < 1e-6) return;
  const nx = ((-dz / len) * width) / 2,
    nz = ((dx / len) * width) / 2;
  batch.quad(
    [a[0] + nx, y, a[1] + nz],
    [b[0] + nx, yB, b[1] + nz],
    [b[0] - nx, yB, b[1] - nz],
    [a[0] - nx, y, a[1] - nz],
    color,
  );
}
function roof(batch: Batch, b: MapBuilding, y: number, color: Color) {
  let r = b.rings[0].slice(0, -1);
  // Four-sided footprints get an actual ridge and four sloped roof planes.
  if (r.length === 4 && b.rings.length === 1 && b.roofShape !== 'flat' && b.kind !== 'roof') {
    const len = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (len(r[0], r[1]) < len(r[1], r[2])) r = [r[1], r[2], r[3], r[0]];
    const a = [(r[0][0] + r[3][0]) / 2, (r[0][1] + r[3][1]) / 2],
      b1 = [(r[1][0] + r[2][0]) / 2, (r[1][1] + r[2][1]) / 2];
    const h = Math.min(0.22, len(r[0], r[3]) * 0.28),
      p = r.map((q) => [q[0], y, q[1]]);
    const u = [a[0] * 0.8 + b1[0] * 0.2, y + h, a[1] * 0.8 + b1[1] * 0.2],
      v = [a[0] * 0.2 + b1[0] * 0.8, y + h, a[1] * 0.2 + b1[1] * 0.8];
    for (const tri of [
      [p[0], p[1], v],
      [p[0], v, u],
      [p[1], p[2], v],
      [p[2], p[3], u],
      [p[2], u, v],
      [p[3], p[0], u],
    ])
      batch.triangle(...(tri as [number[], number[], number[]]), color);
  } else fill(batch, b, y, color);
}
function windowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, 64, 64);
  c.fillStyle = '#d0c8ba';
  c.fillRect(0, 61, 64, 3);
  c.fillRect(0, 2, 64, 1);
  c.fillStyle = '#807d75';
  c.fillRect(17, 12, 30, 43);
  c.fillStyle = '#385461';
  c.fillRect(20, 15, 24, 35);
  c.fillStyle = '#829da0';
  c.fillRect(22, 17, 9, 15);
  c.fillStyle = '#eee8dc';
  c.fillRect(31, 15, 2, 35);
  c.fillRect(20, 32, 24, 2);
  c.fillRect(15, 53, 34, 4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
export function createMappedCity() {
  const group = new Group(),
    resources: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T): T => {
    resources.push(r);
    return r;
  };
  const add = (batch: Batch, material: MeshStandardMaterial, shadows = true) => {
    const mesh = new Mesh(own(batch.geometry()), material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const land = new Batch(),
    water = new Batch(),
    banks = new Batch(),
    roads = new Batch(),
    walls = new Batch(),
    roofs = new Batch();
  const colors: Record<string, string> = {
    farmland: '#a8ad76',
    apron: '#929a9b',
    residential: '#bdb7a9',
    industrial: '#aaa9a2',
    square: '#c6bcaa',
    grass: '#83a663',
    cemetery: '#6c9560',
    wood: '#648b51',
    pitch: '#559451',
    water: '#4b848c',
  };
  const levels: Record<string, number> = {
    farmland: 0.003,
    apron: 0.04,
    residential: 0.005,
    industrial: 0.007,
    square: 0.014,
    grass: 0.021,
    cemetery: 0.022,
    wood: 0.023,
    pitch: 0.035,
    water: terrainLevels.water,
  };
  // A dry rail cutting under Ingelstagatan. Only the mapped road bridge crosses its open centre.
  for (let u = -6.5; u < 6.49; u += 0.25)
    for (const [v1, v2] of [
      [-1.05, -0.73],
      [-0.73, 0.73],
      [0.73, 1.05],
    ]) {
      const points = [
        trenchPoint(u, v1),
        trenchPoint(u + 0.25, v1),
        trenchPoint(u + 0.25, v2),
        trenchPoint(u, v2),
      ];
      const q = points.map((p) => [p[0], terrainLevels.ground - trenchDepth(p), p[1]]);
      banks.quad(q[0], q[1], q[2], q[3], new Color(v1 === -0.73 ? '#8b887b' : '#7e8b69'));
    }
  for (const poly of cityMap.ground) fill(land, poly, terrainLevels.ground, new Color('#a7ac80'));
  // Actual cut banks down to the lower water; no opaque ground plane beneath the river.
  for (const area of cityMap.areas.filter((a) => a.kind === 'water'))
    for (const ring of area.rings)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i];
        const central =
          (a[0] + b[0]) / 2 > -28 &&
          (a[0] + b[0]) / 2 < 23 &&
          (a[1] + b[1]) / 2 > -25 &&
          (a[1] + b[1]) / 2 < 10;
        const color = new Color(central ? '#89877c' : '#7d8462');
        const bottom = terrainLevels.waterbed,
          top = terrainLevels.bankTop;
        banks.quad(
          [a[0], bottom, a[1]],
          [b[0], bottom, b[1]],
          [b[0], top, b[1]],
          [a[0], top, a[1]],
          color,
        );
        banks.quad(
          [a[0], top, a[1]],
          [b[0], top, b[1]],
          [b[0], bottom, b[1]],
          [a[0], bottom, a[1]],
          color,
        );
      }
  for (const area of [...cityMap.areas].sort((a, b) => levels[a.kind] - levels[b.kind]))
    fill(
      area.kind === 'water' ? water : land,
      area,
      levels[area.kind],
      new Color(colors[area.kind]),
    );
  for (const r of cityMap.roads) {
    const y = r.yA ?? 0.071;
    if (r.kind === 'road') {
      strip(roads, r.a, r.b, r.width + 0.1, y, new Color('#b1b0a8'), r.yB);
      strip(roads, r.a, r.b, r.width, y + 0.006, new Color('#41494e'), r.yB + 0.006);
    } else if (r.kind === 'path') {
      const mid = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
      const inCut = trenchDepth(r.a) > 0 || trenchDepth(r.b) > 0 || trenchDepth(mid) > 0;
      const count = inCut ? Math.ceil(Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) / 0.08) : 1;
      for (let i = 0; i < count; i++) {
        const point = (t: number): Point => [
          r.a[0] + (r.b[0] - r.a[0]) * t,
          r.a[1] + (r.b[1] - r.a[1]) * t,
        ];
        const a = point(i / count),
          b = point((i + 1) / count);
        strip(
          roads,
          a,
          b,
          Math.max(r.width, 0.06),
          y + ((r.yB - y) * i) / count + 0.007 - (r.bridge ? 0 : trenchDepth(a)),
          new Color('#cbbfa4'),
          y + ((r.yB - y) * (i + 1)) / count + 0.007 - (r.bridge ? 0 : trenchDepth(b)),
        );
      }
    } else if (r.kind === 'stream')
      continue; // Open waterways are part of the carved water mask.
    else {
      const dx = r.b[0] - r.a[0],
        dz = r.b[1] - r.a[1],
        len = Math.hypot(dx, dz);
      if (r.kind === 'rail')
        strip(
          roads,
          r.a,
          r.b,
          0.15,
          y - 0.008,
          new Color(r.bridge ? '#777d78' : '#8c8778'),
          r.yB - 0.008,
        );
      if (r.bridge)
        strip(
          roads,
          r.a,
          r.b,
          r.kind === 'rail' ? 0.24 : 0.16,
          y - 0.018,
          new Color('#92978d'),
          r.yB - 0.018,
        );
      for (const offset of [-0.028, 0.028])
        strip(
          roads,
          [r.a[0] - (dz / len) * offset, r.a[1] + (dx / len) * offset],
          [r.b[0] - (dz / len) * offset, r.b[1] + (dx / len) * offset],
          0.012,
          y + 0.016,
          new Color('#b2a484'),
          r.yB + 0.016,
        );
    }
  }
  // Join incident road edges at their shared endpoint. Filling the wedges avoids
  // grass slivers in bends without adding one mesh per street segment.
  const junctions = new Map<
    string,
    { point: Point; y: number; edges: { dx: number; dz: number; width: number }[] }
  >();
  for (const r of cityMap.roads.filter((r) => r.kind === 'road')) {
    const dx = r.b[0] - r.a[0],
      dz = r.b[1] - r.a[1],
      len = Math.hypot(dx, dz);
    for (const [point, y] of [
      [r.a, r.yA],
      [r.b, r.yB],
    ] as [Point, number][]) {
      const key = point.join(',') + ',' + y;
      if (!junctions.has(key)) junctions.set(key, { point, y, edges: [] });
      junctions.get(key)!.edges.push({ dx: dx / len, dz: dz / len, width: r.width });
    }
  }
  for (const { point, y, edges } of junctions.values()) {
    if (edges.length < 2) continue;
    for (const [extra, height, color] of [
      [0.1, 0, '#b1b0a8'],
      [0, 0.006, '#41494e'],
    ] as [number, number, string][]) {
      const offsets = edges
        .flatMap((e) =>
          [-1, 1].map((side) => ({
            x: ((-e.dz * (e.width + extra)) / 2) * side,
            z: ((e.dx * (e.width + extra)) / 2) * side,
          })),
        )
        .sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
      for (let i = 0; i < offsets.length; i++) {
        const a = offsets[i],
          b = offsets[(i + 1) % offsets.length];
        if (Math.abs(a.x * b.z - a.z * b.x) < 1e-8) continue;
        roads.triangle(
          [point[0], y + height, point[1]],
          [point[0] + b.x, y + height, point[1] + b.z],
          [point[0] + a.x, y + height, point[1] + a.z],
          new Color(color),
        );
      }
    }
  }
  // Thin broken centre lines preserve both directions without becoming a white grid.
  const markings = new Batch();
  for (const r of cityMap.roads.filter(
    (r) =>
      r.kind === 'road' && r.width > 0.22 && r.class !== 'service' && (!r.oneway || r.lanes > 1),
  )) {
    const dx = r.b[0] - r.a[0],
      dz = r.b[1] - r.a[1],
      len = Math.hypot(dx, dz);
    if (len < 0.22) continue;
    for (let d = 0.06; d < len - 0.04; d += 0.24) {
      const end = Math.min(d + 0.1, len - 0.03);
      strip(
        markings,
        [r.a[0] + (dx * d) / len, r.a[1] + (dz * d) / len],
        [r.a[0] + (dx * end) / len, r.a[1] + (dz * end) / len],
        0.006,
        r.yA + ((r.yB - r.yA) * d) / len + 0.009,
        new Color('#d4d3bd'),
        r.yA + ((r.yB - r.yA) * end) / len + 0.009,
      );
    }
    if (['motorway', 'trunk', 'primary'].includes(r.class))
      for (const side of [-1, 1]) {
        const ox = (-dz / len) * r.width * 0.45 * side,
          oz = (dx / len) * r.width * 0.45 * side;
        strip(
          markings,
          [r.a[0] + ox, r.a[1] + oz],
          [r.b[0] + ox, r.b[1] + oz],
          0.007,
          r.yA + 0.009,
          new Color('#c7c6b4'),
          r.yB + 0.009,
        );
      }
  }
  add(
    markings,
    own(new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: 2 })),
    false,
  );
  const cornices = new Batch();
  for (const source of cityMap.buildings) {
    const point = source.rings[0][0];
    const airport = point[0] > 96 && point[0] < 123 && point[1] > 24 && point[1] < 40;
    const clubhouse = ['way/1059584509', 'way/1059584510', 'way/1059584511'].includes(source.id);
    const b =
      airport || clubhouse
        ? {
            ...source,
            height: airport ? 0.24 : 0.12,
            roofShape: 'flat',
            wall: airport ? '#a9b6b7' : '#d0c9ad',
            roof: '#515d62',
          }
        : source;
    if (DETAILED_BUILDING_IDS.has(b.id)) continue;
    const y = 0.045 + b.height,
      bottom = 0.045 + b.minHeight,
      color = new Color(b.wall),
      roofColor = new Color(b.roof);
    // Real black roofing still reflects light; avoid a zero-reflectance surface.
    if (roofColor.getHex() === 0) roofColor.set('#34383a');
    for (const ring of b.rings)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          c = ring[i],
          length = Math.hypot(a[0] - c[0], a[1] - c[1]);
        // Double-sided material handles OSM ring winding; UVs retain consistent window spacing.
        walls.quad(
          [a[0], bottom, a[1]],
          [c[0], bottom, c[1]],
          [c[0], y, c[1]],
          [a[0], y, a[1]],
          color,
          Math.max(1, Math.round(length / 0.17)),
          Math.max(1, Math.round((y - bottom) / 0.13)),
        );
        strip(cornices, a, c, 0.035, y + 0.007, new Color('#bcb2a1'));
      }
    roof(roofs, b, y + 0.015, roofColor);
  }
  add(banks, own(new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: 2 })));
  add(land, own(new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: 2 })), false);
  add(
    water,
    own(
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.12, side: 2 }),
    ),
    false,
  );
  add(
    roads,
    own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, side: 2 })),
    false,
  );
  const texture = own(windowTexture());
  add(
    walls,
    own(new MeshStandardMaterial({ vertexColors: true, map: texture, roughness: 0.83, side: 2 })),
  );
  add(roofs, own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, side: 2 })));
  add(
    cornices,
    own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: 2 })),
    false,
  );
  const positions = [...cityMap.trees, ...createParkTrees()].filter(isDetailPlantingClear);
  const trunks = own(
    new InstancedMesh(
      own(new CylinderGeometry(0.7, 1, 1, 7)),
      own(new MeshStandardMaterial({ color: '#766048' })),
      positions.length,
    ),
  );
  const leaves = own(
    new InstancedMesh(
      own(new IcosahedronGeometry(1, 1)),
      own(new MeshStandardMaterial({ vertexColors: false, color: '#ffffff', roughness: 1 })),
      positions.length * 4,
    ),
  );
  const mat = new Matrix4(),
    q = new Quaternion(),
    v = new Vector3(),
    s = new Vector3();
  positions.forEach(([x, z], i) => {
    const profile = treeProfile([x, z], i),
      { radius, crownY, crownHeight, trunkRadius } = profile;
    const trunkHeight = crownY - 0.025;
    mat.compose(
      v.set(x, 0.025 + trunkHeight / 2, z),
      q,
      s.set(trunkRadius, trunkHeight, trunkRadius),
    );
    trunks.setMatrixAt(i, mat);
    // Four smaller lobes leave a scalloped outline and visible gaps between neighbouring trees.
    for (let j = 0; j < 4; j++) {
      const angle = (j * Math.PI * 2) / 3 + (i % 7) * 0.4;
      const outer = j < 3;
      mat.compose(
        v.set(
          x + (outer ? Math.cos(angle) * radius * 0.38 : 0),
          crownY + (outer ? -0.012 : crownHeight * 0.45),
          z + (outer ? Math.sin(angle) * radius * 0.38 : 0),
        ),
        q,
        s.set(
          radius * (outer ? 0.65 : 0.62),
          crownHeight * (outer ? 0.78 : 0.65),
          radius * (outer ? 0.65 : 0.62),
        ),
      );
      leaves.setMatrixAt(i * 4 + j, mat);
      leaves.setColorAt(
        i * 4 + j,
        new Color(['#527b3b', '#648849', '#719452', '#5b8044'][(i + j) % 4]),
      );
    }
  });
  trunks.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = leaves.receiveShadow = true;
  group.add(trunks, leaves);
  const riverfront = createRiverfrontDetails();
  group.add(riverfront.group);
  const bridges = createCityBridges();
  group.add(bridges.group);
  const places = createCityPlaces();
  group.add(places.group);
  const details = createLandmarkDetails();
  group.add(details.group);
  return {
    group,
    labels: details.labels,
    dispose() {
      details.dispose();
      places.dispose();
      bridges.dispose();
      riverfront.dispose();
      resources.forEach((r) => r.dispose());
      group.clear();
    },
    statistics: { buildings: cityMap.buildings.length, trees: positions.length },
  };
}
