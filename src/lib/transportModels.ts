import {
  Group,
  Mesh,
  InstancedMesh,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  CanvasTexture,
  SRGBColorSpace,
  Matrix4,
  Quaternion,
  Vector3,
  Color,
  Shape,
  ExtrudeGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Vehicle, Aircraft } from './city.svelte';

type Part = { mesh: InstancedMesh; local: Matrix4; tint: boolean; wheel: boolean };
/** Vehicle dimensions are in metres, converted once to the map's 1:25 scale. */
export function createTransportModels() {
  const group = new Group(),
    owned: { dispose(): void }[] = [],
    types = new Map<string, Part[]>();
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  const materials = new Map<string, MeshStandardMaterial>();
  const mat = (color: string, metal = 0.15, rough = 0.5) => {
    const key = color + metal + rough;
    if (!materials.has(key))
      materials.set(
        key,
        own(new MeshStandardMaterial({ color, metalness: metal, roughness: rough })),
      );
    return materials.get(key)!;
  };
  const rubber = mat('#202629', 0.05, 0.85),
    glass = mat('#29414d', 0.35, 0.22),
    chrome = mat('#aab4b9', 0.8, 0.25),
    body = mat('#ffffff', 0.32, 0.35),
    white = mat('#e4e5df'),
    black = mat('#30383d');
  const lamp = (color: string) =>
    own(
      new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.3 }),
    );
  const headlamp = lamp('#fff1ca'),
    tailLamp = lamp('#a32722');
  function local(x: number, y: number, z: number, ry = 0, rz = 0) {
    return new Matrix4().compose(
      new Vector3(x, y, z),
      new Quaternion()
        .setFromAxisAngle(new Vector3(0, 1, 0), ry)
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rz)),
      new Vector3(1, 1, 1),
    );
  }
  function profile(points: number[][], width: number) {
    const shape = new Shape();
    points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    const g = own(
      new ExtrudeGeometry(shape, {
        depth: width,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.035,
        bevelThickness: 0.035,
      }),
    );
    g.translate(0, 0, -width / 2);
    g.rotateY(-Math.PI / 2);
    return g;
  }
  for (const kind of ['compact', 'estate', 'truck']) {
    const parts: Part[] = [];
    types.set(kind, parts);
    function part(
      geometry: BufferGeometry,
      material: MeshStandardMaterial,
      matrix: Matrix4,
      tint = false,
      wheel = false,
    ) {
      const mesh = own(new InstancedMesh(geometry, material, kind === 'truck' ? 150 : 600));
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.kind = kind;
      group.add(mesh);
      parts.push({ mesh, local: matrix, tint, wheel });
    }
    const box = (
      w: number,
      h: number,
      l: number,
      x: number,
      y: number,
      z: number,
      material = body,
      tint = false,
      rounded = false,
    ) =>
      part(
        own(rounded ? new RoundedBoxGeometry(w, h, l, 2, 0.045) : new BoxGeometry(w, h, l)),
        material,
        local(x, y, z),
        tint,
      );
    const truck = kind === 'truck',
      estate = kind === 'estate',
      width = truck ? 2.45 : estate ? 1.88 : 1.72,
      length = truck ? 12.2 : estate ? 4.75 : 4.05;
    box(width * 0.82, 0.18, length * 0.94, 0, 0.43, 0, black);
    if (!truck) {
      box(width, 0.65, length, 0, 0.72, 0, body, true, true);
      const profilePoints = estate
        ? [
            [-1.8, 1.0],
            [-1.55, 1.56],
            [0.55, 1.56],
            [1.2, 1.0],
          ]
        : [
            [-1.3, 1.0],
            [-0.85, 1.48],
            [0.35, 1.48],
            [1.05, 1.0],
          ];
      part(profile(profilePoints, width * 0.88), glass, local(0, 0, 0));
      box(
        width * 0.91,
        0.075,
        estate ? 2.15 : 1.3,
        0,
        estate ? 1.59 : 1.51,
        estate ? -0.5 : -0.25,
        body,
        true,
        true,
      );
      for (const side of [-1, 1]) {
        box(0.07, 0.53, 0.09, side * width * 0.44, 1.3, -0.15, body, true);
        box(0.09, 0.035, estate ? 1.9 : 1.45, side * width * 0.48, 1.02, -0.3, chrome);
        box(0.22, 0.13, 0.19, side * (width / 2 + 0.05), 1.12, 0.72, body, true, true);
        box(0.42, 0.16, 0.04, side * width * 0.31, 0.82, length / 2 + 0.02, headlamp);
        box(0.22, 0.22, 0.04, side * width * 0.37, 0.83, -length / 2 - 0.02, tailLamp);
        box(0.19, 0.025, 0.04, side * width * 0.506, 1.03, -0.45, chrome);
      }
      box(width * 0.55, 0.18, 0.045, 0, 0.57, length / 2 + 0.025, black);
      box(0.48, 0.12, 0.025, 0, 0.7, -length / 2 - 0.04, white);
    } else {
      part(
        profile(
          [
            [2.85, 0.65],
            [2.85, 3.05],
            [4.9, 3.05],
            [5.3, 2.5],
            [5.3, 0.65],
          ],
          2.4,
        ),
        body,
        local(0, 0, 0),
        true,
      );
      box(2.13, 0.75, 0.03, 0, 2.43, 5.12, glass);
      box(1.65, 0.4, 0.03, 0, 1.22, 5.33, black);
      box(2.5, 0.26, 0.13, 0, 0.7, 5.39, chrome);
      box(2.5, 3.0, 8.1, 0, 2.12, -1.65, white, false, true);
      for (let z = -5.5; z < 2.3; z += 0.38)
        for (const side of [-1, 1]) box(0.018, 2.8, 0.025, side * 1.26, 2.12, z, mat('#b7c0bf'));
      for (const side of [-1, 1]) {
        box(0.25, 0.18, 0.25, side * 1.36, 2.55, 4.45, black);
        box(0.54, 0.2, 0.04, side * 0.86, 0.93, 5.36, headlamp);
        box(0.35, 0.17, 0.04, side * 0.91, 0.6, -5.75, tailLamp);
        box(0.04, 1.4, 1.4, side * 1.21, 2.3, 3.85, glass);
      }
      box(0.05, 2.75, 0.04, 0, 2.1, -5.72, chrome);
    }
    for (const z of truck ? [3.9, 1.7, -4.1, -4.9] : estate ? [-1.48, 1.45] : [-1.25, 1.24])
      for (const side of [-1, 1]) {
        const radius = truck ? 0.48 : 0.31,
          x = side * (width / 2 - 0.04);
        part(
          own(new CylinderGeometry(radius, radius, truck ? 0.3 : 0.2, 16)),
          rubber,
          local(x, radius, z, 0, Math.PI / 2),
          false,
          true,
        );
        part(
          own(new CylinderGeometry(radius * 0.58, radius * 0.58, 0.012, 10)),
          chrome,
          local(x + side * (truck ? 0.155 : 0.105), radius, z, 0, Math.PI / 2),
          false,
          true,
        );
      }
  }
  const airplane = new Group();
  group.add(airplane);
  const aircraftScale = 1 / 25;
  airplane.scale.setScalar(aircraftScale);
  const planeParts: Mesh[] = [];
  function pmesh(
    geo: BufferGeometry,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
  ) {
    const m = new Mesh(own(geo), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    airplane.add(m);
    planeParts.push(m);
    return m;
  }
  function pbox(
    w: number,
    h: number,
    l: number,
    x: number,
    y: number,
    z: number,
    material: MeshStandardMaterial,
  ) {
    return pmesh(new BoxGeometry(w, h, l), material, x, y, z);
  }
  const fuselageProfile = [
    new Vector2(0, -9.5),
    new Vector2(0.32, -8.2),
    new Vector2(0.85, -5.8),
    new Vector2(1.02, -3),
    new Vector2(1.02, 5.6),
    new Vector2(0.77, 7.5),
    new Vector2(0.3, 9),
    new Vector2(0, 9.45),
  ];
  const fuselageGeo = new LatheGeometry(fuselageProfile, 24);
  fuselageGeo.rotateX(Math.PI / 2);
  pmesh(fuselageGeo, white, 0, 2, 0);
  // Closed swept wing volumes with leading/trailing edge thickness.
  function wing(span: number, chord: number, z: number, y: number, material: MeshStandardMaterial) {
    const vertices: number[] = [],
      indices: number[] = [];
    for (const side of [-1, 1]) {
      const start = vertices.length / 3;
      vertices.push(
        0,
        y - 0.08,
        z - chord * 0.5,
        0,
        y + 0.18,
        z - chord * 0.5,
        0,
        y + 0.18,
        z + chord * 0.5,
        0,
        y - 0.08,
        z + chord * 0.5,
        side * span,
        y + 0.25,
        z - chord * 0.35,
        side * span,
        y + 0.34,
        z - chord * 0.35,
        side * span,
        y + 0.34,
        z + chord * 0.05,
        side * span,
        y + 0.25,
        z + chord * 0.05,
      );
      for (const [a, b, c, d] of [
        [0, 1, 2, 3],
        [4, 7, 6, 5],
        [0, 4, 5, 1],
        [1, 5, 6, 2],
        [2, 6, 7, 3],
        [3, 7, 4, 0],
      ]) {
        if (side < 0)
          indices.push(start + a, start + b, start + c, start + a, start + c, start + d);
        else indices.push(start + a, start + c, start + b, start + a, start + d, start + c);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return pmesh(geo, material, 0, 0, 0);
  }
  wing(11.5, 3.7, -0.4, 2.6, white);
  wing(4.2, 2, -7.1, 3.0, white);
  const fin = profile(
    [
      [-8.3, 2.5],
      [-8.1, 6.1],
      [-6.8, 6.1],
      [-4.7, 2.5],
    ],
    0.22,
  );
  pmesh(fin, mat('#315b6a'), 0, 0, 0);
  const cockpit = pmesh(new SphereGeometry(0.87, 16, 10), glass, 0, 2.35, 6.95);
  cockpit.scale.set(1, 0.65, 1.4);
  for (const side of [-1, 1])
    for (let z = -4.8; z < 5; z += 0.85) {
      const window = pmesh(new SphereGeometry(0.19, 8, 6), glass, side * 1.01, 2.3, z);
      window.scale.set(0.1, 1.18, 1);
    }
  const props: Group[] = [];
  for (const side of [-1, 1]) {
    const engine = pmesh(
      new CylinderGeometry(0.47, 0.64, 3.7, 16),
      mat('#d8dddb'),
      side * 3.4,
      2.15,
      0.35,
    );
    engine.rotation.x = Math.PI / 2;
    const prop = new Group();
    prop.position.set(side * 3.4, 2.15, 2.3);
    airplane.add(prop);
    props.push(prop);
    for (let i = 0; i < 4; i++) {
      const blade = new Mesh(own(new BoxGeometry(0.16, 2.9, 0.06)), black);
      blade.rotation.z = (i * Math.PI) / 4;
      prop.add(blade);
    }
    pmesh(new SphereGeometry(0.25, 12, 8), white, side * 3.4, 2.15, 2.4);
    pmesh(
      new SphereGeometry(0.1, 8, 6),
      side === -1 ? lamp('#ce3229') : lamp('#4fb27e'),
      side * 11.45,
      2.9,
      -0.55,
    );
  }
  const gear = new Group();
  airplane.add(gear);
  for (const [x, z] of [
    [0, 5.5],
    [-1.3, -0.9],
    [1.3, -0.9],
  ]) {
    const strut = new Mesh(own(new CylinderGeometry(0.07, 0.07, 1.6, 8)), chrome);
    strut.position.set(x, 1.05, z);
    gear.add(strut);
    for (const side of [-1, 1]) {
      const wheel = new Mesh(own(new CylinderGeometry(0.35, 0.35, 0.18, 12)), rubber);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x + side * 0.18, 0.35, z);
      gear.add(wheel);
    }
  }
  const matrix = new Matrix4(),
    worldMatrix = new Matrix4(),
    q = new Quaternion(),
    pos = new Vector3(),
    scale = new Vector3(0.04, 0.04, 0.04),
    axis = new Vector3(0, 1, 0);
  const smoothed = new Map<number, { pos: Vector3; heading: number }>(),
    palette = ['#dce0de', '#343b40', '#667f91', '#aeb6ba', '#963f3c', '#bba27d', '#213b55'].map(
      (c) => new Color(c),
    );
  let planePosition: Vector3 | undefined;
  return {
    group,
    airplane,
    update(vehicles: Vehicle[], aircraft: Aircraft[], dt: number, time: number) {
      const live = new Set(vehicles.map((v) => v.id));
      for (const id of smoothed.keys()) if (!live.has(id)) smoothed.delete(id);
      for (const [kind, parts] of types) {
        const list = vehicles.filter((v) => v.kind === kind);
        for (const part of parts) {
          part.mesh.count = list.length;
          part.mesh.userData.ids = list.map((v) => v.id);
        }
        list.forEach((v, i) => {
          let state = smoothed.get(v.id);
          if (!state) {
            state = { pos: new Vector3(...v.pos), heading: v.heading };
            smoothed.set(v.id, state);
          }
          state.pos.lerp(pos.fromArray(v.pos), 1 - Math.exp(-dt * 16));
          state.heading +=
            Math.atan2(Math.sin(v.heading - state.heading), Math.cos(v.heading - state.heading)) *
            (1 - Math.exp(-dt * 14));
          worldMatrix.compose(state.pos, q.setFromAxisAngle(axis, state.heading), scale);
          for (const part of parts) {
            matrix.multiplyMatrices(worldMatrix, part.local);
            part.mesh.setMatrixAt(i, matrix);
            if (part.tint) part.mesh.setColorAt(i, palette[v.id % palette.length]);
          }
        });
        for (const part of parts) {
          part.mesh.instanceMatrix.needsUpdate = true;
          // Moving instances invalidate the cached raycast bounds.
          part.mesh.boundingSphere = null;
          if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
        }
      }
      const a = aircraft[0];
      airplane.visible = !!a;
      if (a) {
        if (!planePosition) planePosition = new Vector3(...a.pos);
        planePosition.lerp(pos.fromArray(a.pos), 1 - Math.exp(-dt * 12));
        airplane.position.copy(planePosition);
        airplane.rotation.set(-a.pitch, a.heading, a.bank, 'YXZ');
        gear.visible = a.gear;
        for (const prop of props) prop.rotation.z = time * 45;
      }
    },
    positionOf(id: number) {
      return smoothed.get(id)?.pos;
    },
    dispose() {
      owned.forEach((r) => r.dispose());
      group.clear();
    },
  };
}
