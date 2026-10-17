import { terrain } from './terrain';
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

  // Concrete foundation plinth & surrounding pitch apron
  box(arena, 0, -0.015, 0, w + 2.6, 0.08, l + 2.5, '#b0aaa0');
  // Artificial turf runoff border
  box(arena, 0, 0.052, 0, w + 0.36, 0.005, l + 0.36, '#3a7d38');

  // Pitch surface with realistic FIFA regulation markings
  const pitch = texture(680, 1050, (c) => {
    for (let i = 0; i < 14; i++) {
      c.fillStyle = i % 2 ? '#418b41' : '#499347';
      c.fillRect(0, i * 75, 680, 75);
    }
    c.strokeStyle = '#f2f6e4';
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
      c.beginPath();
      c.arc(340, 124, 91, 0.65, Math.PI - 0.65);
      c.stroke();
      c.restore();
    }
    c.beginPath();
    c.arc(340, 525, 4, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.fill();
  });
  plane(arena, w, l, pitch, 0.055);

  // Goal posts with 3D depth and netting at both pitch ends
  for (const side of [-1, 1]) {
    // Crossbar and uprights
    box(arena, 0, 0.165, (side * l) / 2, 0.31, 0.012, 0.012, '#ffffff');
    for (const x of [-0.15, 0.15]) {
      box(arena, x, 0.108, (side * l) / 2, 0.012, 0.115, 0.012, '#ffffff');
      // Angled back stanchion
      const backPost = box(arena, x, 0.108, side * (l / 2 + 0.04), 0.008, 0.115, 0.008, '#c2c8c4');
      backPost.rotation.x = side * -0.32;
    }
    // Net backing
    const netTop = box(arena, 0, 0.165, side * (l / 2 + 0.07), 0.3, 0.006, 0.006, '#c5cfc8');
    const netBack = box(arena, 0, 0.105, side * (l / 2 + 0.06), 0.3, 0.11, 0.004, '#cad6ce');
    netBack.rotation.x = side * -0.22;
    // Corner flags on flexible posts
    for (const x of [-w / 2, w / 2]) {
      cylinder(arena, x, 0.08, (side * l) / 2, 0.003, 0.06, '#ffffff');
      box(
        arena,
        x + (x > 0 ? -0.015 : 0.015),
        0.105,
        (side * l) / 2,
        0.025,
        0.018,
        0.002,
        '#e03030',
      );
    }
  }

  // Substitutes' dugouts & player tunnel on the VM-läktaren side (+X touchline)
  for (const z of [-0.48, 0.48]) {
    // Acrylic shelter
    box(arena, 1.44, 0.1, z, 0.08, 0.085, 0.28, '#262a2d');
    box(arena, 1.44, 0.1, z, 0.076, 0.08, 0.27, '#455869');
    // Blue bucket seats
    for (let s = 0; s < 5; s++) {
      box(arena, 1.45, 0.08, z - 0.09 + s * 0.045, 0.03, 0.035, 0.03, '#194b8e');
    }
  }
  // Central player tunnel canopy
  box(arena, 1.46, 0.1, 0, 0.12, 0.09, 0.16, '#143c72');
  box(arena, 1.46, 0.148, 0, 0.124, 0.01, 0.164, '#ffffff');

  // --- 1. VÄSTRA LÄKTAREN (VM-läktaren, +X side) ---
  // Stepped blue seating tiers with white seat accents
  for (let row = 0; row < 14; row++) {
    const rx = 1.52 + row * 0.065;
    const ry = 0.08 + row * 0.033;
    const isAccent = (row === 5 || row === 6) && row % 2 === 0;
    box(
      arena,
      rx,
      ry,
      0.1,
      0.065,
      0.038,
      4.45,
      isAccent ? '#e9eff4' : row % 4 === 0 ? '#15427d' : '#1b549f',
    );
  }
  // Front safety glass balustrade along the touchline
  box(arena, 1.48, 0.085, 0.1, 0.008, 0.045, 4.45, '#567280');
  // Mid-tier concourse walkway vomitories (vomitorier / in- och utgångar)
  for (const z of [-1.3, -0.05, 1.2]) {
    box(arena, 2.15, 0.2, z, 0.2, 0.14, 0.16, '#181b1e');
  }

  // VM-läktaren Building (Multi-story office, VIP suites & restaurant facade)
  // Main exterior facade wall facing Ektorpsgatan - continuous along the entire west flank
  box(arena, 3.2, 0.44, 0.05, 0.12, 0.86, 6.9, '#383e44');
  // Upper ribbon windows: Restaurang Zamora, VIP lounges, media suites
  box(arena, 3.26, 0.68, 0.05, 0.02, 0.18, 5.6, '#1e2d39');
  // Window sill trims
  box(arena, 3.27, 0.775, 0.05, 0.03, 0.02, 5.7, '#747f87');
  box(arena, 3.27, 0.585, 0.05, 0.03, 0.02, 5.7, '#747f87');
  // Vertical architectural pilasters along the exterior
  for (let i = 0; i < 13; i++) {
    const pz = -3.1 + (i * 6.3) / 12;
    box(arena, 3.26, 0.44, pz, 0.04, 0.86, 0.05, '#2b3035');
  }

  // North return facade wall of west wing connecting VM-läktaren directly to Teknikhallen (closing NW hole)
  box(arena, 2.375, 0.44, 3.48, 1.65, 0.86, 0.12, '#383e44');
  // Entrance & clinic windows on the north return facade (LS Pilates Place / Rehabklinik from aerial view)
  box(arena, 2.375, 0.18, 3.55, 1.5, 0.22, 0.02, '#1e2d39');
  box(arena, 2.375, 0.3, 3.56, 1.55, 0.02, 0.04, '#747f87');

  // Cantilevered dark slate roof over VM-läktaren spanning the entire length
  const vmRoof = box(arena, 2.32, 0.83, 0.05, 1.84, 0.055, 6.9, '#282c30');
  vmRoof.rotation.z = -0.06;
  // White/silver fascia trim along the front cantilever edge (no obstruction pillars!)
  box(arena, 1.41, 0.78, 0.05, 0.02, 0.045, 6.9, '#768189');

  // --- 2. NORRA LÄKTAREN (Curva Nordahl, +Z side) ---
  // Home supporter standing terrace (IFK-klacken) with blue rows & silver safety wave-breakers
  for (let row = 0; row < 14; row++) {
    const rz = 2.22 + row * 0.072;
    const ry = 0.08 + row * 0.033;
    box(arena, 0, ry, rz, 2.95, 0.038, 0.072, row % 3 === 0 ? '#15427d' : '#1b549f');
    // Silver crowd safety wave-breaker rails along standing terrace
    if (row % 2 === 1) {
      box(arena, 0, ry + 0.032, rz - 0.015, 2.85, 0.014, 0.005, '#b4bcc2');
    }
  }
  // Enclosed corner grandstands connecting Curva Nordahl with VM-läktaren and Östra läktaren
  for (let c = 0; c < 8; c++) {
    const cy = 0.1 + c * 0.04;
    // NW corner wedge
    const nw = box(arena, 1.65 - c * 0.03, cy, 2.4 + c * 0.06, 0.55, 0.04, 0.55, '#1b549f');
    nw.rotation.y = 0.78;
    // NE corner wedge (Kröken / Sektion K)
    const ne = box(arena, -1.65 + c * 0.03, cy, 2.4 + c * 0.06, 0.55, 0.04, 0.55, '#1b549f');
    ne.rotation.y = -0.78;
  }

  // Solid interior back and corner walls enclosing the bowl behind Curva Nordahl
  box(arena, 0, 0.48, 3.25, 3.1, 0.76, 0.1, '#383e44');
  // NW interior corner backing wall
  const nwWall = box(arena, 1.95, 0.46, 2.8, 1.15, 0.8, 0.1, '#383e44');
  nwWall.rotation.y = 0.78;
  // NE interior corner backing wall
  const neWall = box(arena, -1.95, 0.46, 2.8, 1.15, 0.8, 0.1, '#383e44');
  neWall.rotation.y = -0.78;

  // Curva Nordahl tribute sign on interior wall
  const curvaSign = texture(512, 96, (c) => {
    c.fillStyle = '#10396c';
    c.fillRect(0, 0, 512, 96);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 4;
    c.strokeRect(6, 6, 500, 84);
    c.fillStyle = '#ffffff';
    c.font = 'bold 44px sans-serif';
    c.textAlign = 'center';
    c.fillText('CURVA NORDAHL', 256, 64);
  });
  const curvaSignMesh = new Mesh(
    track(new PlaneGeometry(1.6, 0.3)),
    track(new MeshBasicMaterial({ map: curvaSign, side: 2 })),
  );
  curvaSignMesh.position.set(0, 0.65, 3.2);
  arena.add(curvaSignMesh);

  // Cantilevered dark roof over Curva Nordahl, forming continuous L-canopy with VM-läktaren
  const curvaRoof = box(arena, 0, 0.82, 2.78, 3.1, 0.055, 1.25, '#282c30');
  curvaRoof.rotation.x = 0.06;
  box(arena, 0, 0.78, 2.18, 3.1, 0.045, 0.02, '#768189');
  // East end gable trim on Curva Nordahl roof (where roof terminates above eastern corner)
  box(arena, -1.55, 0.8, 2.78, 0.03, 0.065, 1.25, '#768189');
  // Continuous solid NW corner roof connecting Curva Nordahl to VM-läktaren (L-shaped canopy)
  box(arena, 2.25, 0.825, 2.8, 1.8, 0.065, 1.35, '#282c30');
  // Roof bridge filling the seam between Curva Nordahl and Teknikhallen
  box(arena, 0.02, 0.625, 3.48, 3.05, 0.04, 0.35, '#292d31');

  // --- 3. ÖSTRA LÄKTAREN (East Stand, -X side - facing Matchgatan & bostadshusen) ---
  // Stepped blue seating tiers facing the pitch
  for (let row = 0; row < 13; row++) {
    const rx = -1.52 - row * 0.068;
    const ry = 0.08 + row * 0.033;
    box(arena, rx, ry, 0.1, 0.068, 0.038, 4.45, row % 4 === 0 ? '#15427d' : '#1b549f');
  }
  // Front safety barrier
  box(arena, -1.48, 0.085, 0.1, 0.008, 0.045, 4.45, '#567280');
  // Solid modern rear facade wall facing Matchgatan (terminating at z = -2.20 before open SE corner)
  box(arena, -2.5, 0.44, 0.64, 0.1, 0.86, 5.68, '#3a4046');
  // South gable end facade wall of Östra läktaren terminating the building at z = -2.20
  box(arena, -1.95, 0.44, -2.2, 1.1, 0.86, 0.08, '#3a4046');
  // Vertical architectural pilasters along Matchgatan exterior
  for (let i = 0; i < 9; i++) {
    const pz = -1.9 + (i * 4.9) / 8;
    box(arena, -2.55, 0.44, pz, 0.04, 0.86, 0.05, '#2b3035');
  }
  // North return facade wall connecting Östra läktaren directly to Teknikhallen (closing NE hole)
  box(arena, -2.0, 0.44, 3.48, 1.0, 0.86, 0.1, '#3a4046');

  // Cantilevered dark roof over Östra läktaren - stopping BEFORE the open NE corner!
  // In real life (Google Maps), Östra läktaren has a full roof along the pitch, but the NE corner (Kröken) is uncovered!
  const ostraRoof = box(arena, -1.94, 0.81, -0.075, 1.15, 0.055, 4.25, '#282c30');
  ostraRoof.rotation.z = 0.06;
  // White/silver fascia trim along the front cantilever overhang
  box(arena, -1.39, 0.77, -0.075, 0.02, 0.045, 4.25, '#768189');
  // End gable trims on Östra läktaren's roof:
  // North gable (at z = +2.05, terminating cleanly before the open NE corner)
  box(arena, -1.94, 0.79, 2.05, 1.15, 0.055, 0.02, '#768189');
  // South gable (at z = -2.20, terminating before the open South terrace)
  box(arena, -1.94, 0.79, -2.2, 1.15, 0.055, 0.02, '#768189');

  // --- 4. SÖDRA LÄKTAREN (South Stand / Bortastå / Berget, -Z side) ---
  // KEY ARCHITECTURAL FEATURE: UNCOVERED (NO ROOF)! Exposed stepped concrete terrace.
  for (let row = 0; row < 14; row++) {
    const rz = -2.22 - row * 0.072;
    const ry = 0.08 + row * 0.031;
    // Authentic exposed concrete tones with stair walkways
    box(arena, 0, ry, rz, 2.95, 0.036, 0.072, row % 2 === 0 ? '#9ba09e' : '#8e9492');
    // Safety railings
    if (row % 2 === 1) {
      box(arena, 0, ry + 0.03, rz + 0.015, 2.85, 0.014, 0.005, '#788186');
    }
  }

  // SW corner stepped concrete & seating transition connecting to VM-läktaren
  box(arena, 1.95, 0.28, -2.75, 1.05, 0.48, 1.15, '#929795');
  box(arena, 1.85, 0.35, -2.6, 0.7, 0.3, 0.8, '#1b549f');

  // Solid concrete foundation under Södra läktaren's east cheek (supporting steps, completely flush, no wall sticking up)
  for (let row = 0; row < 14; row++) {
    const rz = -2.22 - row * 0.072;
    const ry = 0.08 + row * 0.031;
    box(arena, -1.47, ry / 2, rz, 0.02, ry, 0.072, '#788186');
  }

  // Rear concourse open-air walkway at top of terrace (stops at east cheek)
  box(arena, 0.75, 0.52, -3.32, 4.5, 0.03, 0.22, '#9ba09e');
  // Rear perimeter enclosure wall behind Södra läktaren (terminating at x = -1.50 before open SE corner)
  box(arena, 0.85, 0.35, -3.44, 4.7, 0.68, 0.12, '#3e444a');
  // Turnstile entrances on south wall
  box(arena, 0, 0.14, -3.51, 1.2, 0.24, 0.04, '#1e242a');
  box(arena, 0, 0.27, -3.52, 1.3, 0.03, 0.1, '#12396b');

  // --- SE CORNER: COMPLETELY OPEN AT GROUND LEVEL (Direct open access to Matchgatan, NO walls, NO grandstand) ---
  // Ground-level dark asphalt apron connecting pitch corner directly to Matchgatan
  box(arena, -2.0, 0.02, -2.8, 1.1, 0.02, 1.25, '#585e64');

  // --- 5. IFK PERFORMANCE CENTER / TEKNIKHALLEN (Integrated behind Curva Nordahl) ---
  // Large indoor training hall connected directly to the northern stand
  box(arena, 0.02, 0.31, 4.58, 3.05, 0.62, 2.06, '#3d4349');
  // Dark flat roof with parapet trims
  box(arena, 0.02, 0.625, 4.58, 3.09, 0.03, 2.1, '#292d31');
  // Training hall glazing & gym windows
  box(arena, 1.54, 0.38, 4.58, 0.02, 0.22, 1.6, '#233442');
  box(arena, 0.02, 0.4, 5.62, 2.4, 0.2, 0.02, '#233442');

  // Performance center exterior sign
  const hallSign = texture(512, 64, (c) => {
    c.fillStyle = '#292d31';
    c.fillRect(0, 0, 512, 64);
    c.fillStyle = '#ffffff';
    c.font = 'bold 30px sans-serif';
    c.textAlign = 'center';
    c.fillText('IFK PERFORMANCE CENTER', 256, 44);
  });
  const hallSignMesh = new Mesh(
    track(new PlaneGeometry(1.6, 0.2)),
    track(new MeshBasicMaterial({ map: hallSign, side: 2 })),
  );
  hallSignMesh.position.set(1.56, 0.54, 4.58);
  hallSignMesh.rotation.y = Math.PI / 2;
  arena.add(hallSignMesh);

  // --- 6. GAMLA TENNISHALLEN (Iconic arched barrel-vault hangar roof) ---
  box(arena, 2.95, 0.2, 4.68, 0.72, 0.4, 1.7, '#887c6e');
  const tennisRoof = new Mesh(
    track(new CylinderGeometry(0.38, 0.38, 1.72, 16, 1, false, 0, Math.PI)),
    mat('#282c30'),
  );
  tennisRoof.position.set(2.95, 0.4, 4.68);
  tennisRoof.rotation.z = Math.PI / 2;
  tennisRoof.rotation.y = Math.PI / 2;
  arena.add(tennisRoof);

  // --- 7. FOUR ICONIC STRUCTURAL STEEL LATTICE FLOODLIGHT MASTS (Fackverksmaster) ---
  const createLatticeMast = (mastX: number, mastZ: number) => {
    const mast = new Group();
    mast.position.set(mastX, 0.05, mastZ);
    arena.add(mast);

    const steelColor = '#7b8389';
    const darkSteel = '#3a3f43';
    const lightColor = '#fefee4';
    const totalH = 1.95;
    const rBase = 0.11;
    const rTop = 0.045;
    const stages = 5;

    // 4 tapered corner steel legs
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x0 = sx * rBase,
          z0 = sz * rBase;
        const x1 = sx * rTop,
          z1 = sz * rTop;
        const leg = box(
          mast,
          (x0 + x1) / 2,
          totalH / 2,
          (z0 + z1) / 2,
          0.012,
          totalH,
          0.012,
          steelColor,
        );
        leg.rotation.z = -Math.atan2(x1 - x0, totalH);
        leg.rotation.x = Math.atan2(z1 - z0, totalH);
      }
    }

    // Horizontal ring frames and diagonal X-braces for each stage
    for (let s = 1; s <= stages; s++) {
      const t = s / stages;
      const tPrev = (s - 1) / stages;
      const yCurr = t * (totalH - 0.15);
      const yPrev = tPrev * (totalH - 0.15);
      const yMid = (yCurr + yPrev) / 2;
      const rCurr = rBase + (rTop - rBase) * t;
      const rPrev = rBase + (rTop - rBase) * tPrev;
      const rMid = (rCurr + rPrev) / 2;
      const hDiff = yCurr - yPrev;

      // Horizontal perimeter beams
      for (const sx of [-1, 1]) {
        box(mast, sx * rCurr, yCurr, 0, 0.008, 0.008, rCurr * 2, steelColor);
      }
      for (const sz of [-1, 1]) {
        box(mast, 0, yCurr, sz * rCurr, rCurr * 2, 0.008, 0.008, steelColor);
      }

      // Diagonal X-bracing on all 4 faces
      const diagLen = Math.hypot(rMid * 2, hDiff);
      const angle = Math.atan2(hDiff, rMid * 2);
      for (const sx of [-1, 1]) {
        const xb1 = box(mast, sx * rMid, yMid, 0, 0.006, 0.006, diagLen, steelColor);
        xb1.rotation.x = angle;
        const xb2 = box(mast, sx * rMid, yMid, 0, 0.006, 0.006, diagLen, steelColor);
        xb2.rotation.x = -angle;
      }
      for (const sz of [-1, 1]) {
        const zb1 = box(mast, 0, yMid, sz * rMid, diagLen, 0.006, 0.006, steelColor);
        zb1.rotation.z = angle;
        const zb2 = box(mast, 0, yMid, sz * rMid, diagLen, 0.006, 0.006, steelColor);
        zb2.rotation.z = -angle;
      }
    }

    // Central access ladder
    box(mast, 0, totalH / 2, 0, 0.012, totalH, 0.006, darkSteel);

    // Maintenance platform / catwalk near top
    box(mast, 0, totalH - 0.12, 0, 0.16, 0.016, 0.16, darkSteel);
    for (const sx of [-1, 1]) {
      box(mast, sx * 0.075, totalH - 0.07, 0, 0.006, 0.08, 0.16, steelColor);
    }
    for (const sz of [-1, 1]) {
      box(mast, 0, totalH - 0.07, sz * 0.075, 0.16, 0.08, 0.006, steelColor);
    }

    // Floodlight rack head pointing toward the pitch center (0, 0)
    const head = new Group();
    head.position.set(0, totalH, 0);
    head.rotation.y = Math.atan2(-mastX, -mastZ);
    mast.add(head);

    const rack = new Group();
    rack.rotation.x = 0.55;
    head.add(rack);

    // Steel backplate / mounting frame
    box(rack, 0, 0.08, 0, 0.32, 0.18, 0.03, darkSteel);
    box(rack, 0, -0.02, -0.04, 0.06, 0.14, 0.06, steelColor);

    // Array of 24 individual high-intensity floodlight projectors (4 rows x 6 columns)
    for (let row = 0; row < 4; row++) {
      const ly = 0.02 + row * 0.04;
      for (let col = 0; col < 6; col++) {
        const lx = -0.125 + col * 0.05;
        box(rack, lx, ly, 0.018, 0.04, 0.03, 0.015, '#25292c');
        box(rack, lx, ly, 0.026, 0.034, 0.024, 0.004, lightColor);
      }
    }
  };

  // 4 iconic masts in exact real-life positions:
  createLatticeMast(2.85, 2.85); // NW mast at Entré 1 / entrance plaza (Image 3)
  createLatticeMast(-2.35, 2.85); // NE mast behind Kröken
  createLatticeMast(-2.3, -3.3); // SE mast behind open south terrace
  createLatticeMast(2.3, -3.3); // SW mast behind open south terrace

  // --- 8. ENTRANCE PLAZA, ENTRÉ 1 & CLUB BRANDING (Image 3) ---
  // Paved entrance courtyard (Läktarplatsen / Ektorpsgatan corner)
  box(arena, 3.1, 0.05, 3.05, 1.4, 0.02, 1.4, '#b3afa4');

  // ENTRÉ 1 Portal canopy with IFK star emblem
  box(arena, 3.25, 0.2, 3.05, 0.16, 0.28, 0.65, '#12437b');
  // Glass entrance doors
  box(arena, 3.34, 0.12, 3.05, 0.02, 0.16, 0.5, '#1c2f3d');

  const entre1Sign = texture(512, 128, (c) => {
    c.fillStyle = '#12437b';
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#f5c400';
    // 5-pointed IFK gold star
    c.beginPath();
    c.arc(70, 64, 28, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.font = 'bold 54px sans-serif';
    c.textAlign = 'center';
    c.fillText('ENTRÉ 1', 300, 84);
  });
  const entre1Mesh = new Mesh(
    track(new PlaneGeometry(0.65, 0.18)),
    track(new MeshBasicMaterial({ map: entre1Sign, side: 2 })),
  );
  entre1Mesh.position.set(3.34, 0.28, 3.05);
  entre1Mesh.rotation.y = Math.PI / 2;
  arena.add(entre1Mesh);

  // Three Flagpoles (visible in Image 3 outside Entré 1)
  const swedishFlag = texture(256, 160, (c) => {
    c.fillStyle = '#005293';
    c.fillRect(0, 0, 256, 160);
    c.fillStyle = '#fecb00';
    c.fillRect(70, 0, 32, 160);
    c.fillRect(0, 64, 256, 32);
  });
  const ifkFlag = texture(256, 160, (c) => {
    c.fillStyle = '#10396c';
    c.fillRect(0, 0, 256, 160);
    c.fillStyle = '#ffffff';
    // White diagonal banner
    c.beginPath();
    c.moveTo(0, 160);
    c.lineTo(40, 160);
    c.lineTo(256, 0);
    c.lineTo(216, 0);
    c.closePath();
    c.fill();
    // Star emblem
    c.beginPath();
    c.arc(70, 50, 20, 0, Math.PI * 2);
    c.fill();
  });
  const clubBanner = texture(256, 160, (c) => {
    c.fillStyle = '#10396c';
    c.fillRect(0, 0, 256, 80);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 80, 256, 80);
  });

  const flags = [swedishFlag, ifkFlag, clubBanner];
  for (let f = 0; f < 3; f++) {
    const fz = 3.2 + f * 0.18;
    // White flagpole
    cylinder(arena, 3.52, 0.25, fz, 0.005, 0.45, '#eef2f5');
    // Gold finial ball
    box(arena, 3.52, 0.48, fz, 0.016, 0.016, 0.016, '#dfb722');
    // Fluttering flag plane
    const flagMesh = new Mesh(
      track(new PlaneGeometry(0.14, 0.088)),
      track(new MeshBasicMaterial({ map: flags[f], side: 2 })),
    );
    flagMesh.position.set(3.52, 0.42, fz + 0.07);
    arena.add(flagMesh);
  }

  // Gunnar Nordahl statue on granite plinth outside Curva Nordahl
  box(arena, 3.35, 0.075, 2.6, 0.06, 0.05, 0.06, '#3a3937');
  box(arena, 3.35, 0.14, 2.6, 0.03, 0.08, 0.03, '#544632');

  // Main stadium exterior sign: IDROTTSPARKEN / IFK NORRKÖPING
  const stadiumBanner = texture(768, 128, (c) => {
    c.fillStyle = '#122c4d';
    c.fillRect(0, 0, 768, 128);
    c.fillStyle = '#ffffff';
    c.font = 'bold 56px sans-serif';
    c.textAlign = 'center';
    c.fillText('IDROTTSPARKEN', 384, 62);
    c.fillStyle = '#9fbcd9';
    c.font = 'bold 28px sans-serif';
    c.fillText('IFK NORRKÖPING', 384, 102);
  });
  const stadiumBannerMesh = new Mesh(
    track(new PlaneGeometry(2.4, 0.4)),
    track(new MeshBasicMaterial({ map: stadiumBanner, side: 2 })),
  );
  stadiumBannerMesh.position.set(3.27, 0.72, 0.1);
  stadiumBannerMesh.rotation.y = Math.PI / 2;
  arena.add(stadiumBannerMesh);

  // North-facing exterior banner above the north entrance wing
  const northBannerMesh = new Mesh(
    track(new PlaneGeometry(1.8, 0.32)),
    track(new MeshBasicMaterial({ map: stadiumBanner, side: 2 })),
  );
  northBannerMesh.position.set(2.38, 0.68, 3.56);
  arena.add(northBannerMesh);

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
  for (const child of group.children) {
    if (child instanceof InstancedMesh) {
      const transform = new Matrix4();
      for (let i = 0; i < child.count; i++) {
        child.getMatrixAt(i, transform);
        transform.elements[13] += terrain.offset(
          transform.elements[12] + child.position.x,
          transform.elements[14] + child.position.z,
        );
        child.setMatrixAt(i, transform);
      }
      child.instanceMatrix.needsUpdate = true;
      child.computeBoundingSphere();
    } else child.position.y += terrain.offset(child.position.x, child.position.z);
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
