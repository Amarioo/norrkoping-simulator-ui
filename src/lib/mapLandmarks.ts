import { LEGACY_LEVELS, terrain } from './terrain';
import { LAYER_RANK, layeredSurface } from './groundLayers';
import { groundRectangle } from './placeBuilder';
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  BoxGeometry,
  CylinderGeometry,
  PlaneGeometry,
  CanvasTexture,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  InstancedMesh,
  Matrix4,
  TextureLoader,
  type Object3D,
} from 'three';
import { cityMap, LANDMARKS, pointInRing, type Point } from './mapModel';

/** Architectural additions are illustrative; every anchor is in the mapped coordinate system. */
export function createLandmarkDetails() {
  const group = new Group(),
    labels = new Group(),
    owned: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T): T => {
    owned.push(item);
    return item;
  };
  const materials = new Map<string, MeshStandardMaterial>();
  const mat = (color: string) => {
    if (!materials.has(color))
      materials.set(color, track(new MeshStandardMaterial({ color, roughness: 0.82 })));
    return materials.get(color)!;
  };
  const box = (
    parent: Group,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    rotation = 0,
  ) => {
    const m = new Mesh(track(new BoxGeometry(w, h, d)), mat(color));
    m.position.set(x, y, z);
    m.rotation.y = rotation;
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cylinder = (
    parent: Group,
    x: number,
    y: number,
    z: number,
    rad: number,
    h: number,
    color: string,
    top = rad,
    segments = 16,
  ) => {
    const m = new Mesh(track(new CylinderGeometry(top, rad, h, segments)), mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const texture = (w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!);
    const t = track(new CanvasTexture(c));
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const at = (name: string) => LANDMARKS.find((p) => p.name === name)!;
  /**
   * Vertical support of the top-level objects added since `start`: the legacy level they were
   * modelled on, and the ground that level now is (default: the ground under each object). Objects
   * attached to a mapped building use its footprint minimum, like the OSM walls (cityMesh).
   */
  const supported = (start: number, standsOn: number, base?: number) => {
    for (const child of group.children.slice(start))
      if (child.userData.standsOn === undefined) Object.assign(child.userData, { standsOn, base });
  };
  /** A pavement laid exactly on the terrain grid (see groundRectangle), ordered by depth rank. */
  const pavement = (
    geometry: ReturnType<typeof groundRectangle>,
    material: MeshStandardMaterial,
  ) => {
    const m = new Mesh(track(geometry), material);
    m.receiveShadow = true;
    m.userData.placed = true;
    group.add(m);
    return m;
  };
  /**
   * Small fittings along kilometre-long pavements (runway edge lights): instead of one height per
   * group, every vertex is laid on the terrain (legacy level `standsOn` = the ground). Bakes the
   * objects added since `start` into world space; the placement loop below leaves them alone.
   */
  const drape = (start: number, standsOn: number) => {
    for (const root of group.children.slice(start)) {
      if (root.userData.placed) continue;
      root.updateMatrixWorld(true);
      const meshes: Mesh[] = [];
      root.traverse((o: Object3D) => {
        if (o instanceof Mesh) meshes.push(o);
      });
      for (const m of meshes) {
        const geometry = track(m.geometry.clone().applyMatrix4(m.matrixWorld));
        const position = geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++)
          position.setY(
            i,
            terrain.placeLegacy(position.getX(i), position.getZ(i), position.getY(i), standsOn),
          );
        geometry.computeBoundingSphere();
        const baked = new Mesh(geometry, m.material);
        baked.receiveShadow = true;
        baked.userData.placed = true;
        group.add(baked);
      }
      root.userData.removed = true;
    }
    for (const root of group.children.filter((c) => c.userData.removed)) group.remove(root);
  };
  const onBuilding = (start: number, name: string) =>
    supported(
      start,
      LEGACY_LEVELS.buildingBase,
      terrain.footprintGround(cityMap.buildings.find((b) => b.name === name)!.rings),
    );

  // Idrottsparken is built by src/lib/stadium/idrottsparken.ts (Step 6), added in mapView.ts.

  // Rådhuset and its tower (with Gull-Olle) are built by src/lib/landmarks/radhuset/ (Landmark Phase
  // B1), added in mapView.ts; the earlier illustrative clock tower that stood here was removed.
  let start = group.children.length;
  // The churches receive recognisable towers/spires rather than generic cylinders.
  for (const [name, color, height] of [
    ['Matteus kyrka', '#985c47', 3.4],
    ['Sankt Olai kyrka', '#d7c78e', 2.4],
    ['S:t Johannes kyrka', '#b1aaa0', 2.8],
    ['Gamla vattentornet', '#a96c4e', 2.8],
  ] as const) {
    const p = at(name).position;
    start = group.children.length;
    if (name === 'Gamla vattentornet') {
      cylinder(group, p[0], 1.4, p[1], 0.53, 2.7, color);
      cylinder(group, p[0], 2.7, p[1], 0.74, 0.5, color);
      cylinder(group, p[0], 3.07, p[1], 0.75, 0.35, '#556468', 0.04);
      onBuilding(start, name);
      continue;
    }
    const z = p[1] + 0.4;
    box(group, p[0], height * 0.36, z, 0.5, height * 0.72, 0.5, color);
    box(group, p[0], height * 0.72, z, 0.6, 0.08, 0.6, '#b1b1a2');
    cylinder(group, p[0], height * 0.86, z, 0.33, height * 0.28, '#5f7d70', 0, 8);
    onBuilding(start, name);
  }
  start = group.children.length;
  const heat = at('Värmekyrkan').position;
  for (const offset of [-0.75, 0.65]) {
    cylinder(group, heat[0] + offset, 1.3, heat[1] - 0.3, 0.11, 2.6, '#9e6651', 0.07);
    cylinder(group, heat[0] + offset, 2.63, heat[1] - 0.3, 0.1, 0.06, '#674b42');
  }

  onBuilding(start, 'Värmekyrkan');
  // Konstmuseet: light portico. Centralbadet: blue outdoor basins in its grounds.
  start = group.children.length;
  const museum = at('Konstmuseet').position;
  for (let i = 0; i < 6; i++)
    cylinder(group, museum[0] - 0.55 + i * 0.22, 0.34, museum[1] + 0.75, 0.045, 0.6, '#d4cdb6');
  box(group, museum[0], 0.67, museum[1] + 0.75, 1.4, 0.1, 0.3, '#b9ae92');
  onBuilding(start, 'Norrköpings konstmuseum');
  start = group.children.length;
  const bath = at('Centralbadet').position;
  box(group, bath[0] + 1.8, 0.07, bath[1] + 1.5, 1, 0.06, 2, '#bad4ce');
  box(group, bath[0] + 1.8, 0.11, bath[1] + 1.5, 0.84, 0.025, 1.85, '#73bac2');

  // Pools and planting beds were modelled from 0.04, on the flat-scene grass: now the ground.
  supported(start, 0.04);
  // Cactus beds are low planting beds rather than oversized desert cacti.
  start = group.children.length;
  const park = at('Carl Johans park').position;
  for (let i = 0; i < 6; i++) {
    const x = park[0] - 0.7 + (i % 3) * 0.7,
      z = park[1] + 0.5 + Math.floor(i / 3) * 0.65;
    box(group, x, 0.08, z, 0.55, 0.08, 0.4, '#b5a47e');
    for (let j = 0; j < 5; j++)
      cylinder(
        group,
        x - 0.19 + j * 0.095,
        0.16,
        z,
        0.04,
        0.15,
        ['#5c824b', '#8c9f55', '#a49557'][j % 3],
      );
  }

  supported(start, 0.04);
  start = group.children.length;
  // Police complex: mapped low wings/courtyards with a taller narrow slab,
  // vertical concrete fins, rooftop plant and solar arrays from the reference.
  const police = cityMap.buildings.find((b) => b.name === 'Polishuset')!;
  const towerPolice = new Group();
  // SWEREF 99 TM scene frame (migrated from legacy -28.72, -26.66 / 0.26 rad).
  towerPolice.position.set(-29.25, 0, -26.22);
  towerPolice.rotation.y = 0.2775;
  group.add(towerPolice);
  const facade = texture(512, 1024, (c) => {
    c.fillStyle = '#b9c0be';
    c.fillRect(0, 0, 512, 1024);
    for (let row = 0; row < 11; row++)
      for (let col = 0; col < 16; col++) {
        c.fillStyle = (row + col) % 4 ? '#52636a' : '#83939a';
        c.fillRect(col * 32 + 7, row * 90 + 12, 19, 64);
        c.fillStyle = '#e0dfd5';
        c.fillRect(col * 32 + 1, row * 90 + 5, 4, 82);
      }
  });
  const slab = box(towerPolice, 0, 0.98, 0, 0.51, 1.82, 2.65, '#b8bdba');
  const slabMat = track(new MeshStandardMaterial({ map: facade, roughness: 0.78 }));
  (slab as Mesh).material = [
    slabMat,
    slabMat,
    mat('#b3b8b6'),
    mat('#b3b8b6'),
    mat('#40515a'),
    mat('#40515a'),
  ];
  box(towerPolice, 0, 1.92, 0, 0.55, 0.06, 2.71, '#e2e1d7');
  for (let i = 0; i < 6; i++)
    box(towerPolice, 0, 1.98, -1.05 + i * 0.4, 0.22, 0.09, 0.2, '#7c8586');
  // Official vector artwork with an emblem-only viewBox and explicit rasterization dimensions.
  const crest = track(new TextureLoader().load('/assets/polis-emblem.svg'));
  crest.colorSpace = SRGBColorSpace;
  const badge = new Mesh(
    track(new PlaneGeometry(0.25, 0.3)),
    track(
      new MeshStandardMaterial({
        map: crest,
        transparent: true,
        alphaTest: 0.02,
        side: 2,
        roughness: 0.5,
      }),
    ),
  );
  badge.position.set(0, 1.55, 1.37);
  towerPolice.add(badge);
  const panelPositions: Point[] = [];
  for (let x = -31.85; x < -27.8; x += 0.22)
    for (let z = -27.48; z < -24.66; z += 0.19) {
      const p: Point = [x, z];
      if (
        pointInRing(p, police.rings[0]) &&
        !police.rings.slice(1).some((r) => pointInRing(p, r)) &&
        Math.abs(x + 29.25) > 0.5
      )
        panelPositions.push(p);
    }
  const panels = track(
    new InstancedMesh(
      track(new BoxGeometry(0.17, 0.012, 0.13)),
      mat('#405967'),
      panelPositions.length,
    ),
  );
  const panelMatrix = new Matrix4();
  panelPositions.forEach(([x, z], i) => {
    panelMatrix.makeRotationY(0.2775);
    panelMatrix.setPosition(x, 0.35, z);
    panels.setMatrixAt(i, panelMatrix);
  });
  group.add(panels);

  onBuilding(start, 'Polishuset');
  // Runways and taxiways use their real mapped orientation and widths. Their pavement (taxiway top
  // 0.0725, runway surface 0.09 in the legacy scene) is the measured ground.
  start = group.children.length;
  for (const taxi of cityMap.airways.filter((a) => a.kind === 'taxiway'))
    for (let i = 1; i < taxi.points.length; i++) {
      const a = taxi.points[i - 1],
        b = taxi.points[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.005) continue;
      const angle = Math.atan2(b[0] - a[0], b[1] - a[1]),
        [cx, cz] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      pavement(groundRectangle(cx, cz, angle, taxi.width, length), mat('#545a5a'));
      pavement(groundRectangle(cx, cz, angle, 0.009, length), mat('#bca85a'));
    }
  // Taxiway pavement, centre lines and runway surface lie on the DTM, above the apron land cover.
  layeredSurface(mat('#545a5a'), LAYER_RANK.asphalt);
  layeredSurface(mat('#bca85a'), LAYER_RANK.marking);
  const taxiJoins = new Map<string, { point: Point; width: number }>();
  for (const taxi of cityMap.airways.filter((a) => a.kind === 'taxiway'))
    for (const point of taxi.points) {
      const key = point.join(',');
      if (!taxiJoins.has(key) || taxiJoins.get(key)!.width < taxi.width)
        taxiJoins.set(key, { point, width: taxi.width });
    }
  const taxiCaps = track(
    new InstancedMesh(
      track(new CylinderGeometry(0.5, 0.5, 0.025, 12)),
      mat('#545a5a'),
      taxiJoins.size,
    ),
  );
  const taxiMatrix = new Matrix4();
  let taxiIndex = 0;
  for (const { point, width } of taxiJoins.values()) {
    taxiMatrix.makeScale(width, 1, width);
    taxiMatrix.setPosition(point[0], 0.06, point[1]);
    taxiCaps.setMatrixAt(taxiIndex++, taxiMatrix);
  }
  taxiCaps.receiveShadow = true;
  group.add(taxiCaps);
  supported(start, 0.0725);
  start = group.children.length;
  for (const runway of cityMap.airways.filter((a) => a.kind === 'runway')) {
    const a = runway.points[0],
      b = runway.points.at(-1)!,
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const air = new Group();
    air.position.set((a[0] + b[0]) / 2, 0.08, (a[1] + b[1]) / 2);
    air.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    group.add(air);
    const markings = texture(512, 4096, (c) => {
      c.fillStyle = runway.surface === 'grass' ? '#6f8650' : '#444c50';
      c.fillRect(0, 0, 512, 4096);
      c.strokeStyle = '#dadbd1';
      c.lineWidth = 4;
      c.strokeRect(20, 8, 472, 4080);
      for (let y = 150; y < 3980; y += 140) {
        c.fillStyle = '#e1e1d5';
        c.fillRect(251, y, 10, 65);
      }
      for (let end = 0; end < 2; end++) {
        c.save();
        if (end) {
          c.translate(512, 4096);
          c.rotate(Math.PI);
        }
        c.fillStyle = '#ecebdc';
        for (let i = 0; i < 5; i++) {
          c.fillRect(40 + i * 38, 35, 24, 180);
          c.fillRect(286 + i * 38, 35, 24, 180);
        }
        c.font = 'bold 125px sans-serif';
        c.textAlign = 'center';
        c.fillText((runway.ref.split('/')[end] ?? '').padStart(2, '0'), 256, 355);
        c.restore();
      }
    });
    const surface = pavement(
      groundRectangle(air.position.x, air.position.z, air.rotation.y, runway.width, length),
      track(new MeshStandardMaterial({ map: markings, roughness: 1 })),
    );
    layeredSurface(surface.material as MeshStandardMaterial, LAYER_RANK.asphalt);
    for (const side of [-1, 1])
      for (let d = -length / 2 + 0.5; d < length / 2; d += 2.4)
        box(air, side * (runway.width / 2 + 0.08), 0.03, d, 0.035, 0.035, 0.035, '#e5e6ca');
  }

  drape(start, 0.09);
  // Landmark names float above the real anchors. Non-primary labels appear on closer views.
  const primary = new Set([
    'Idrottsparken',
    'Strykjärnet',
    'Rådhuset',
    'Ljuraparken',
    'Konstmuseet',
    'Norrköping C',
    'Folkparken',
    'Centralbadet',
  ]);
  for (const poi of LANDMARKS) {
    const label = texture(768, 128, (c) => {
      c.fillStyle = 'rgba(24,42,47,.92)';
      c.beginPath();
      c.roundRect(4, 8, 760, 108, 20);
      c.fill();
      c.strokeStyle = poi.category === 'park' ? '#add78e' : '#d8dfc8';
      c.lineWidth = 3;
      c.stroke();
      c.fillStyle = '#f8f7eb';
      c.font = '600 68px Segoe UI, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(poi.name, 384, 64, 710);
    });
    const m = new Sprite(
      track(
        new SpriteMaterial({
          map: label,
          depthTest: false,
          sizeAttenuation: false,
          transparent: true,
        }),
      ),
    );
    m.position.set(poi.position[0], poi.height + 0.55, poi.position[1]);
    m.scale.set(0.15, 0.025, 1);
    m.renderOrder = 20;
    m.userData = {
      primary: primary.has(poi.name) || poi.category === 'airport',
      landmark: poi.name,
    };
    labels.add(m);
  }
  // Untagged objects (the stadium) were modelled on the legacy street surface.
  for (const child of group.children) {
    if (child.userData.placed) continue;
    const standsOn: number = child.userData.standsOn ?? LEGACY_LEVELS.street,
      base: number | undefined = child.userData.base;
    if (child instanceof InstancedMesh) {
      const transform = new Matrix4();
      for (let i = 0; i < child.count; i++) {
        child.getMatrixAt(i, transform);
        transform.elements[13] += terrain.placeLegacy(
          transform.elements[12] + child.position.x,
          transform.elements[14] + child.position.z,
          0,
          standsOn,
          base,
        );
        child.setMatrixAt(i, transform);
      }
      child.instanceMatrix.needsUpdate = true;
      child.computeBoundingSphere();
    } else
      child.position.y += terrain.placeLegacy(
        child.position.x,
        child.position.z,
        0,
        standsOn,
        base,
      );
  }
  for (const label of labels.children)
    label.position.y += terrain.offset(label.position.x, label.position.z);
  group.add(labels);
  return {
    group,
    labels,
    dispose() {
      owned.forEach((r) => r.dispose());
      group.clear();
    },
  };
}
