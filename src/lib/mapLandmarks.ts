import {
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
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
} from 'three';
import { cityMap, LANDMARKS, stadiumCenter, pointInRing, type Point } from './mapModel';

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
  const plane = (parent: Group, w: number, h: number, texture: CanvasTexture, y: number) => {
    const m = new Mesh(
      track(new PlaneGeometry(w, h)),
      track(new MeshStandardMaterial({ map: texture, roughness: 1 })),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
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

  // Idrottsparken: orientation and centre follow the actual OSM pitch.
  const arena = new Group();
  arena.position.set(stadiumCenter[0], 0.06, stadiumCenter[1]);
  const ring = cityMap.areas.find((p) => p.id === 'way/100955051')!.rings[0];
  let longest: [Point, Point] = [ring[0], ring[1]];
  for (let i = 1; i < ring.length; i++)
    if (
      Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]) >
      Math.hypot(longest[1][0] - longest[0][0], longest[1][1] - longest[0][1])
    )
      longest = [ring[i - 1], ring[i]];
  const dx = longest[1][0] - longest[0][0],
    dz = longest[1][1] - longest[0][1];
  arena.rotation.y = Math.atan2(dx, dz);
  group.add(arena);
  const w = 68 / 25,
    l = 105 / 25;
  box(arena, 0, -0.015, 0, w + 2.5, 0.08, l + 2.3, '#b1aaa0');
  const pitch = texture(680, 1050, (c) => {
    for (let i = 0; i < 14; i++) {
      c.fillStyle = i % 2 ? '#438d43' : '#4d984b';
      c.fillRect(0, i * 75, 680, 75);
    }
    c.strokeStyle = '#eff4df';
    c.lineWidth = 4;
    c.strokeRect(14, 14, 652, 1022);
    c.beginPath();
    c.moveTo(14, 525);
    c.lineTo(666, 525);
    c.stroke();
    c.beginPath();
    c.arc(340, 525, 91, 0, Math.PI * 2);
    c.stroke();
    for (const end of [0, 1]) {
      c.save();
      if (end) {
        c.translate(680, 1050);
        c.rotate(Math.PI);
      }
      c.strokeRect(138, 14, 404, 165);
      c.strokeRect(248, 14, 184, 55);
      c.beginPath();
      c.arc(340, 124, 3, 0, Math.PI * 2);
      c.fillStyle = '#ffffff';
      c.fill();
      c.restore();
    }
    c.beginPath();
    c.arc(340, 525, 4, 0, Math.PI * 2);
    c.fill();
  });
  plane(arena, w, l, pitch, 0.055);
  // Four banks of stepped seating, alternating blue/white IFK sections.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 13; row++) {
      box(
        arena,
        side * (w / 2 + 0.22 + row * 0.053),
        0.08 + row * 0.036,
        0,
        0.06,
        0.045,
        l + 0.5,
        row % 4 === 0 ? '#d6d9da' : '#467bac',
      );
      box(
        arena,
        0,
        0.08 + row * 0.031,
        side * (l / 2 + 0.23 + row * 0.05),
        w + 0.46,
        0.039,
        0.056,
        row % 4 === 0 ? '#d6d9da' : '#467bac',
      );
    }
    const longRoof = box(arena, side * (w / 2 + 0.71), 0.81, 0, 1.13, 0.055, l + 1.6, '#d7dcda');
    longRoof.rotation.z = side * 0.085;
    const endRoof = box(arena, 0, 0.72, side * (l / 2 + 0.65), w + 0.45, 0.055, 0.95, '#bfc7c8');
    endRoof.rotation.x = side * -0.07;
    for (let i = 0; i < 9; i++) {
      const z = -l / 2 - 0.45 + (i * (l + 0.9)) / 8;
      box(arena, side * (w / 2 + 1.14), 0.4, z, 0.035, 0.8, 0.035, '#d6d9d4');
    }
    for (let i = 0; i < 5; i++)
      box(arena, -w / 2 + (i * w) / 4, 0.35, side * (l / 2 + 1.06), 0.03, 0.7, 0.035, '#c7ccca');
    // Goal posts and fine goal net.
    box(arena, 0, 0.16, (side * l) / 2, 0.31, 0.015, 0.015, '#f5f4ee');
    for (const x of [-0.15, 0.15])
      box(arena, x, 0.105, (side * l) / 2, 0.015, 0.12, 0.015, '#f5f4ee');
    for (let j = 0; j < 6; j++)
      box(arena, -0.15 + j * 0.06, 0.11, side * (l / 2 + 0.06), 0.004, 0.12, 0.004, '#cad8ce');
  }
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      cylinder(arena, x * (w / 2 + 1.06), 0.85, z * (l / 2 + 0.93), 0.025, 1.7, '#bdc4c2');
      box(arena, x * (w / 2 + 1.06), 1.72, z * (l / 2 + 0.93), 0.35, 0.14, 0.06, '#f4edd6');
    }
  const sign = texture(768, 128, (c) => {
    c.fillStyle = '#183e66';
    c.fillRect(0, 0, 768, 128);
    c.fillStyle = '#ffffff';
    c.font = 'bold 66px sans-serif';
    c.textAlign = 'center';
    c.fillText('IFK NORRKÖPING', 384, 86);
  });
  const signMesh = new Mesh(
    track(new PlaneGeometry(w, 0.45)),
    track(new MeshBasicMaterial({ map: sign, side: 2 })),
  );
  signMesh.position.set(0, 0.72, l / 2 + 1.08);
  arena.add(signMesh);

  // Rådhusets clock tower and copper spire, anchored within the mapped building.
  const hall = at('Rådhuset').position,
    tower = new Group();
  tower.position.set(hall[0], 0, hall[1]);
  group.add(tower);
  box(tower, 0, 1.5, 0, 0.57, 2.5, 0.57, '#b49a6b');
  box(tower, 0, 2.5, 0, 0.73, 0.1, 0.73, '#bba982');
  cylinder(tower, 0, 2.78, 0, 0.36, 0.5, '#66887b', 0.23, 8);
  cylinder(tower, 0, 3.17, 0, 0.24, 0.4, '#55756a', 0.01, 8);
  const clock = texture(128, 128, (c) => {
    c.fillStyle = '#d6bc70';
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#243d3b';
    c.beginPath();
    c.arc(64, 64, 56, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#e6c97b';
    c.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      c.beginPath();
      c.moveTo(64 + Math.sin(a) * 43, 64 + Math.cos(a) * 43);
      c.lineTo(64 + Math.sin(a) * 49, 64 + Math.cos(a) * 49);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(42, 46);
    c.lineTo(64, 64);
    c.lineTo(87, 37);
    c.stroke();
  });
  for (let side = 0; side < 4; side++) {
    const m = new Mesh(
      track(new PlaneGeometry(0.45, 0.45)),
      track(new MeshBasicMaterial({ map: clock })),
    );
    m.position.set(
      Math.sin((side * Math.PI) / 2) * 0.291,
      2.2,
      Math.cos((side * Math.PI) / 2) * 0.291,
    );
    m.rotation.y = (side * Math.PI) / 2;
    tower.add(m);
  }

  // The churches receive recognisable towers/spires rather than generic cylinders.
  for (const [name, color, height] of [
    ['Matteus kyrka', '#985c47', 3.4],
    ['Sankt Olai kyrka', '#d7c78e', 2.4],
    ['S:t Johannes kyrka', '#b1aaa0', 2.8],
    ['Gamla vattentornet', '#a96c4e', 2.8],
  ] as const) {
    const p = at(name).position;
    if (name === 'Gamla vattentornet') {
      cylinder(group, p[0], 1.4, p[1], 0.53, 2.7, color);
      cylinder(group, p[0], 2.7, p[1], 0.74, 0.5, color);
      cylinder(group, p[0], 3.07, p[1], 0.75, 0.35, '#556468', 0.04);
      continue;
    }
    const z = p[1] + 0.4;
    box(group, p[0], height * 0.36, z, 0.5, height * 0.72, 0.5, color);
    box(group, p[0], height * 0.72, z, 0.6, 0.08, 0.6, '#b1b1a2');
    cylinder(group, p[0], height * 0.86, z, 0.33, height * 0.28, '#5f7d70', 0, 8);
  }
  const heat = at('Värmekyrkan').position;
  for (const offset of [-0.75, 0.65]) {
    cylinder(group, heat[0] + offset, 1.3, heat[1] - 0.3, 0.11, 2.6, '#9e6651', 0.07);
    cylinder(group, heat[0] + offset, 2.63, heat[1] - 0.3, 0.1, 0.06, '#674b42');
  }

  // Konstmuseet: light portico. Centralbadet: blue outdoor basins in its grounds.
  const museum = at('Konstmuseet').position;
  for (let i = 0; i < 6; i++)
    cylinder(group, museum[0] - 0.55 + i * 0.22, 0.34, museum[1] + 0.75, 0.045, 0.6, '#d4cdb6');
  box(group, museum[0], 0.67, museum[1] + 0.75, 1.4, 0.1, 0.3, '#b9ae92');
  const bath = at('Centralbadet').position;
  box(group, bath[0] + 1.8, 0.07, bath[1] + 1.5, 1, 0.06, 2, '#bad4ce');
  box(group, bath[0] + 1.8, 0.11, bath[1] + 1.5, 0.84, 0.025, 1.85, '#73bac2');

  // Cactus beds are low planting beds rather than oversized desert cacti.
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

  // Police complex: mapped low wings/courtyards with a taller narrow slab,
  // vertical concrete fins, rooftop plant and solar arrays from the reference.
  const police = cityMap.buildings.find((b) => b.name === 'Polishuset')!;
  const towerPolice = new Group();
  towerPolice.position.set(-28.72, 0, -26.66);
  towerPolice.rotation.y = 0.26;
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
    track(new MeshBasicMaterial({ map: crest, transparent: true, alphaTest: 0.02, side: 2 })),
  );
  badge.position.set(0, 1.55, 1.37);
  towerPolice.add(badge);
  const panelPositions: Point[] = [];
  for (let x = -31.3; x < -27.3; x += 0.22)
    for (let z = -27.9; z < -25.15; z += 0.19) {
      const p: Point = [x, z];
      if (
        pointInRing(p, police.rings[0]) &&
        !police.rings.slice(1).some((r) => pointInRing(p, r)) &&
        Math.abs(x + 28.72) > 0.5
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
    panelMatrix.makeRotationY(0.26);
    panelMatrix.setPosition(x, 0.35, z);
    panels.setMatrixAt(i, panelMatrix);
  });
  group.add(panels);

  // Runways and taxiways use their real mapped orientation and widths.
  for (const taxi of cityMap.airways.filter((a) => a.kind === 'taxiway'))
    for (let i = 1; i < taxi.points.length; i++) {
      const a = taxi.points[i - 1],
        b = taxi.points[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.005) continue;
      const angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
      box(
        group,
        (a[0] + b[0]) / 2,
        0.06,
        (a[1] + b[1]) / 2,
        taxi.width,
        0.025,
        length,
        '#545a5a',
        angle,
      );
      box(
        group,
        (a[0] + b[0]) / 2,
        0.076,
        (a[1] + b[1]) / 2,
        0.009,
        0.003,
        length,
        '#bca85a',
        angle,
      );
    }
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
  for (const runway of cityMap.airways.filter((a) => a.kind === 'runway')) {
    const a = runway.points[0],
      b = runway.points.at(-1)!,
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const air = new Group();
    air.position.set((a[0] + b[0]) / 2, 0.08, (a[1] + b[1]) / 2);
    air.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    group.add(air);
    const pavement = texture(512, 4096, (c) => {
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
    plane(air, runway.width, length, pavement, 0.01);
    for (const side of [-1, 1])
      for (let d = -length / 2 + 0.5; d < length / 2; d += 2.4)
        box(air, side * (runway.width / 2 + 0.08), 0.03, d, 0.035, 0.035, 0.035, '#e5e6ca');
  }

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
