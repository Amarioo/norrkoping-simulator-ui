/**
 * Three.js resources for the Norrköping miniature: per-building facade
 * textures with lit windows (baked to small canvases), shared roof/prop
 * materials and instanced streets, water, bridges, plinths, trees, lamps and
 * cacti. Everything is created once per scene mount and freed by
 * CityView.dispose().
 */
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  mulberry32,
  PLINTH_SIZE,
  PLINTH_TOP,
  type Building,
  type CityModel,
  type PlinthKind,
  type RoofPropKind,
  type Strip,
  type WaterSegment,
} from './city';

/** Rooftop unit sizes in metres. */
export const PROP_SIZE: Record<RoofPropKind, { w: number; h: number; d: number }> = {
  ac: { w: 1.6, h: 0.7, d: 1.1 },
  tank: { w: 1, h: 1.3, d: 1 },
  crate: { w: 1.1, h: 1.1, d: 1.1 },
};

/** Window cell size per archetype, in metres of facade. */
const FACADE_CELL: Record<Building['kind'], { w: number; h: number }> = {
  tower: { w: 1.5, h: 1.45 },
  cylinder: { w: 1.5, h: 1.45 },
  midrise: { w: 1.7, h: 1.6 },
  lowrise: { w: 1.85, h: 1.6 },
  house: { w: 2.1, h: 1.8 },
  iron: { w: 1.8, h: 1.7 },
};

const WARM_LIGHTS = ['#ffd9a3', '#ffcf8f', '#ffe3b3'];
const COOL_LIGHTS = ['#b9d3ff', '#a9c7f7', '#c9dcff'];
const CANOPY_TONES = ['#3e6a4d', '#48795a', '#35604a', '#557a5b'];
const CELL_PX = 16;
const WINDOW_PX = 10;
const STOREFRONT_ROW_PX = 22;

/** Ground heights so water, streets and bridge decks layer without z-fighting. */
const WATER_Y = 0.04;
const STREET_Y = 0.07;
const BRIDGE_H = 0.32;

interface Disposable {
  dispose(): void;
}

/** Paints the facade of a single tier; windows keep their real-world size. */
function paintFacade(b: Building, tier: Building['tiers'][number], tierIndex: number) {
  const rand = mulberry32(0x9e37 + b.id * 7919 + tierIndex * 131);
  const cell = FACADE_CELL[b.kind];
  // Cylinders and the triangular Strykjärnet wrap the texture around.
  const wrap = b.kind === 'cylinder' || b.kind === 'iron';
  const faceW = wrap ? Math.PI * tier.w : tier.w;
  const cols = Math.max(2, Math.min(12, Math.round(faceW / cell.w)));
  const rows = Math.max(1, Math.min(12, Math.round(tier.h / cell.h)));
  const storefront = tierIndex === 0 && (b.kind === 'tower' || b.kind === 'midrise' || b.kind === 'cylinder');
  const pad = 3;
  const rowHeight = (row: number) => (row === 0 && storefront ? STOREFRONT_ROW_PX : CELL_PX);
  let contentH = 0;
  for (let row = 0; row < rows; row++) contentH += rowHeight(row);
  const width = cols * CELL_PX + pad * 2;
  const height = contentH + pad * 2;

  const map = document.createElement('canvas');
  map.width = width;
  map.height = height;
  const glow = document.createElement('canvas');
  glow.width = width;
  glow.height = height;
  const wallCtx = map.getContext('2d');
  const glowCtx = glow.getContext('2d');
  if (!wallCtx || !glowCtx) throw new Error('Canvas 2D is unavailable');

  glowCtx.fillStyle = '#000000';
  glowCtx.fillRect(0, 0, width, height);
  wallCtx.fillStyle = b.wall;
  wallCtx.fillRect(0, 0, width, height);
  if (storefront) {
    wallCtx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    wallCtx.fillRect(0, height - pad - STOREFRONT_ROW_PX, width, pad + STOREFRONT_ROW_PX);
  }

  let top = height - pad;
  for (let row = 0; row < rows; row++) {
    const rowPx = rowHeight(row);
    top -= rowPx;
    const windowPx = rowPx - 7;
    const litChance = row === 0 ? Math.min(0.85, b.lit + 0.35) : b.lit;
    for (let col = 0; col < cols; col++) {
      const x = pad + col * CELL_PX + (CELL_PX - WINDOW_PX) / 2;
      const y = top + (rowPx - windowPx) / 2;
      const lit = rand() < litChance;
      const palette = rand() < b.warm ? WARM_LIGHTS : COOL_LIGHTS;
      const color = palette[Math.floor(rand() * palette.length)];
      wallCtx.fillStyle = lit ? color : rand() < 0.5 ? '#151f27' : '#111a21';
      wallCtx.fillRect(x, y, WINDOW_PX, windowPx);
      if (lit) {
        glowCtx.fillStyle = color;
        glowCtx.fillRect(x, y, WINDOW_PX, windowPx);
      }
    }
  }
  return { map, emissive: glow };
}

function facadeTexture(canvas: HTMLCanvasElement, wrap: boolean): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  if (wrap) texture.wrapS = RepeatWrapping;
  return texture;
}

export interface CityView {
  /** Instanced streets, water, bridges, plinths, trees, lamps and cacti; mount with `<T is={view.group} />`. */
  group: Group;
  /** Facade material per building id, one per tier. */
  walls: MeshStandardMaterial[][];
  slab: MeshStandardMaterial;
  mast: MeshStandardMaterial;
  beacon: MeshBasicMaterial;
  props: Record<RoofPropKind, MeshStandardMaterial>;
  /** Flat-shaded pitched-roof material per building id (pyramid, spire and dome). */
  houseRoof(b: Building): MeshStandardMaterial;
  dispose(): void;
}

export function createCityView(model: CityModel): CityView {
  const disposables: Disposable[] = [];
  const track = <T extends Disposable>(resource: T): T => {
    disposables.push(resource);
    return resource;
  };

  // Indexed by building id (ids start at 1) so Scene.svelte can look materials
  // up directly: view.walls[b.id][tierIndex].
  const walls: MeshStandardMaterial[][] = [];
  for (const b of model.buildings) {
    walls[b.id] = b.tiers.map((tier, tierIndex) => {
      const { map, emissive } = paintFacade(b, tier, tierIndex);
      const wrap = b.kind === 'cylinder' || b.kind === 'iron';
      return track(
        new MeshStandardMaterial({
          map: track(facadeTexture(map, wrap)),
          emissiveMap: track(facadeTexture(emissive, wrap)),
          emissive: new Color('#ffffff'),
          emissiveIntensity: b.emissive,
          roughness: b.roughness,
          metalness: b.metalness,
        }),
      );
    });
  }

  const slab = track(new MeshStandardMaterial({ color: '#293a40', roughness: 0.9 }));
  const mast = track(new MeshStandardMaterial({ color: '#5d6c73', roughness: 0.5, metalness: 0.6 }));
  const beacon = track(new MeshBasicMaterial({ color: '#ff6f5e' }));
  const props: Record<RoofPropKind, MeshStandardMaterial> = {
    ac: track(new MeshStandardMaterial({ color: '#98a7ac', roughness: 0.6, metalness: 0.5 })),
    tank: track(new MeshStandardMaterial({ color: '#7e8c92', roughness: 0.55, metalness: 0.45 })),
    crate: track(new MeshStandardMaterial({ color: '#64513d', roughness: 1 })),
  };

  const houseRoofs = new Map<number, MeshStandardMaterial>();
  for (const b of model.buildings) {
    if (b.roof === 'pyramid' || b.roof === 'spire' || b.roof === 'dome')
      houseRoofs.set(
        b.id,
        track(new MeshStandardMaterial({ color: b.roofColor, roughness: 0.95, flatShading: true })),
      );
  }
  const houseRoof = (b: Building): MeshStandardMaterial => houseRoofs.get(b.id) ?? slab;

  const group = new Group();

  // Reusable helpers for instanced flat strips (streets and water) and decks.
  const stripGeo = track(new PlaneGeometry(1, 1));
  const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  const up = new Vector3(0, 1, 0);
  const spin = new Quaternion();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const matrix = new Matrix4();
  const layFlat = (q: WaterSegment | Strip) => {
    spin.setFromAxisAngle(up, q.angle);
    return rotation.multiplyQuaternions(spin, flat);
  };

  // Motala ström: still water and paler rapids.
  const riverMats: Record<'still' | 'rapids', MeshStandardMaterial> = {
    still: track(new MeshStandardMaterial({ color: '#1d4a56', roughness: 0.25, metalness: 0.15 })),
    rapids: track(new MeshStandardMaterial({ color: '#3f7d94', roughness: 0.15, metalness: 0.1 })),
  };
  for (const key of ['still', 'rapids'] as const) {
    const items = model.water.filter((w) => (key === 'rapids' ? w.rapids : !w.rapids));
    if (items.length === 0) continue;
    const mesh = new InstancedMesh(stripGeo, riverMats[key], items.length);
    items.forEach((w, i) => {
      position.set(w.x, WATER_Y, w.z);
      scale.set(w.len, w.width, 1);
      matrix.compose(position, layFlat(w), scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // Streets and walking avenues.
  const streetMats: Record<Strip['kind'], MeshStandardMaterial> = {
    street: track(new MeshStandardMaterial({ color: '#20272d', roughness: 0.95 })),
    tram: track(new MeshStandardMaterial({ color: '#262e34', roughness: 0.9 })),
    walk: track(new MeshStandardMaterial({ color: '#333f46', roughness: 0.98 })),
  };
  for (const kind of Object.keys(streetMats) as Strip['kind'][]) {
    const items = model.streets.filter((s) => s.kind === kind);
    if (items.length === 0) continue;
    const mesh = new InstancedMesh(stripGeo, streetMats[kind], items.length);
    items.forEach((s, i) => {
      position.set(s.x, STREET_Y, s.z);
      scale.set(s.len, s.width, 1);
      matrix.compose(position, layFlat(s), scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // Bridge decks crossing the ström.
  if (model.bridges.length > 0) {
    const deckGeo = track(new BoxGeometry(1, BRIDGE_H, 1));
    const decks = new InstancedMesh(
      deckGeo,
      track(new MeshStandardMaterial({ color: '#5d6c73', roughness: 0.85 })),
      model.bridges.length,
    );
    model.bridges.forEach((br, i) => {
      position.set(br.x, BRIDGE_H / 2, br.z);
      spin.setFromAxisAngle(up, br.angle);
      rotation.copy(spin);
      scale.set(br.len, 1, br.width);
      matrix.compose(position, rotation, scale);
      decks.setMatrixAt(i, matrix);
    });
    decks.castShadow = decks.receiveShadow = true;
    decks.frustumCulled = false;
    group.add(decks);
  }

  // Block plinths: one instanced mesh per surface kind.
  const plinthGeo = track(new BoxGeometry(PLINTH_SIZE, PLINTH_TOP, PLINTH_SIZE));
  const plinthMats: Record<PlinthKind, MeshStandardMaterial> = {
    pavement: track(new MeshStandardMaterial({ color: '#37484e', roughness: 0.95 })),
    grass: track(new MeshStandardMaterial({ color: '#2c4636', roughness: 1 })),
    stone: track(new MeshStandardMaterial({ color: '#3d4d50', roughness: 0.9 })),
  };
  for (const kind of Object.keys(plinthMats) as PlinthKind[]) {
    const items = model.plinths.filter((p) => p.kind === kind);
    if (items.length === 0) continue;
    const mesh = new InstancedMesh(plinthGeo, plinthMats[kind], items.length);
    items.forEach((p, i) => {
      const s = p.size ?? 1;
      position.set(p.x, (PLINTH_TOP * s) / 2, p.z);
      rotation.identity();
      scale.set(s, s, s);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // Trees: one instanced trunk and one instanced low-poly canopy per tree.
  if (model.trees.length > 0) {
    const trunkGeo = track(new CylinderGeometry(0.13, 0.19, 1.3, 6));
    const canopyGeo = track(new IcosahedronGeometry(1, 0));
    const trunks = new InstancedMesh(
      trunkGeo,
      track(new MeshStandardMaterial({ color: '#4a3a2c', roughness: 1 })),
      model.trees.length,
    );
    const canopies = new InstancedMesh(
      canopyGeo,
      track(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true })),
      model.trees.length,
    );
    const tone = new Color();
    model.trees.forEach((tree, i) => {
      scale.setScalar(tree.s);
      position.set(tree.x, tree.y + 0.65 * tree.s, tree.z);
      rotation.setFromAxisAngle(up, (tree.tone / 4) * Math.PI * 2);
      matrix.compose(position, rotation, scale);
      trunks.setMatrixAt(i, matrix);
      rotation.setFromAxisAngle(up, tree.x + tree.z);
      position.set(tree.x, tree.y + tree.s * 2.1, tree.z);
      scale.set(0.95 * tree.s, 0.85 * tree.s, 0.95 * tree.s);
      matrix.compose(position, rotation, scale);
      canopies.setMatrixAt(i, matrix);
      canopies.setColorAt(i, tone.set(CANOPY_TONES[tree.tone]));
    });
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    for (const mesh of [trunks, canopies]) {
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  // Kaktusplanteringen: instanced cactus trunks with rounded heads.
  if (model.cacti.length > 0) {
    const cactusGeo = track(new CylinderGeometry(0.22, 0.3, 1.5, 7));
    const headGeo = track(new SphereGeometry(0.34, 10, 8));
    const cacti = new InstancedMesh(
      cactusGeo,
      track(new MeshStandardMaterial({ color: '#3f7d4a', roughness: 0.9 })),
      model.cacti.length,
    );
    const heads = new InstancedMesh(
      headGeo,
      track(new MeshStandardMaterial({ color: '#4e9a5e', roughness: 0.9 })),
      model.cacti.length,
    );
    model.cacti.forEach((c, i) => {
      position.set(c.x, 0.75 * c.s + PLINTH_TOP, c.z);
      rotation.identity();
      scale.setScalar(c.s);
      matrix.compose(position, rotation, scale);
      cacti.setMatrixAt(i, matrix);
      position.set(c.x, (1.55 + 0.14) * c.s + PLINTH_TOP, c.z);
      matrix.compose(position, rotation, scale);
      heads.setMatrixAt(i, matrix);
    });
    cacti.castShadow = true;
    cacti.frustumCulled = heads.frustumCulled = false;
    group.add(cacti, heads);
  }

  // Street lamps: instanced poles with always-lit heads.
  if (model.lamps.length > 0) {
    const poleGeo = track(new CylinderGeometry(0.055, 0.08, 3.3, 6));
    const headGeo = track(new SphereGeometry(0.18, 10, 8));
    const poles = new InstancedMesh(
      poleGeo,
      track(new MeshStandardMaterial({ color: '#3a4750', roughness: 0.55, metalness: 0.4 })),
      model.lamps.length,
    );
    const heads = new InstancedMesh(headGeo, track(new MeshBasicMaterial({ color: '#ffd9a0' })), model.lamps.length);
    model.lamps.forEach((lamp, i) => {
      matrix.makeTranslation(lamp.x, 1.65, lamp.z);
      poles.setMatrixAt(i, matrix);
      matrix.makeTranslation(lamp.x, 3.42, lamp.z);
      heads.setMatrixAt(i, matrix);
    });
    poles.castShadow = true;
    poles.frustumCulled = heads.frustumCulled = false;
    group.add(poles, heads);
  }

  return {
    group,
    walls,
    slab,
    mast,
    beacon,
    props,
    houseRoof,
    dispose() {
      for (const resource of disposables) resource.dispose();
      group.clear();
    },
  };
}