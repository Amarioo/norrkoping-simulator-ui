import { LEGACY_LEVELS, terrain } from './terrain';
import { LAYER_RANK, layeredSurface } from './groundLayers';
import {
  Group,
  Mesh,
  BoxGeometry,
  CylinderGeometry,
  PlaneGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  CanvasTexture,
  SRGBColorSpace,
  Vector3,
  Vector2,
  Shape,
  ExtrudeGeometry,
  DoubleSide,
  Matrix4,
  Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * A w × l rectangle (local x across, z along; rotation `heading` like Object3D.rotation.y) laid
 * exactly on the rendered terrain: clipped to the same surface mesh triangles as the land cover, so
 * the two are coplanar in every triangle and only depth rank orders them. UVs match a PlaneGeometry(w, l)
 * rotated flat (rotation.x = −π/2). `lift` raises it (scene units) above the ground.
 */
export function groundRectangle(
  cx: number,
  cz: number,
  heading: number,
  w: number,
  l: number,
  lift = 0,
) {
  const cos = Math.cos(heading),
    sin = Math.sin(heading);
  const world = (u: number, v: number): [number, number] => [
    cx + u * cos + v * sin,
    cz - u * sin + v * cos,
  ];
  const corners = [
    world(-w / 2, -l / 2),
    world(w / 2, -l / 2),
    world(w / 2, l / 2),
    world(-w / 2, l / 2),
  ];
  const position: number[] = [],
    uv: number[] = [];
  const vertex = ([x, z]: [number, number], ground: { at(x: number, z: number): number }) => {
    const dx = x - cx,
      dz = z - cz;
    position.push(x, ground.at(x, z) + lift, z);
    uv.push((dx * cos - dz * sin) / w + 0.5, -(dx * sin + dz * cos) / l + 0.5);
  };
  for (const [a, b, c] of [
    [0, 1, 2],
    [0, 2, 3],
  ])
    terrain.drape(corners[a], corners[b], corners[c], (p, q, r, ground) => {
      // Counter-clockwise seen from above, so single-sided materials face up.
      const up = (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]) > 0;
      vertex(p, ground);
      vertex(up ? q : r, ground);
      vertex(up ? r : q, ground);
    });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
/** Build in local coordinates, then merge static geometry by material to keep draw calls bounded. */
export class PlaceBuilder {
  group = new Group();
  private owned = new Set<{ dispose(): void }>();
  private materials = new Map<string, MeshStandardMaterial>();
  own<T extends { dispose(): void }>(r: T): T {
    this.owned.add(r);
    return r;
  }
  mat(color: string) {
    if (!this.materials.has(color))
      this.materials.set(color, this.own(new MeshStandardMaterial({ color, roughness: 0.72 })));
    return this.materials.get(color)!;
  }
  glass = this.own(
    new MeshStandardMaterial({
      color: '#8cbac2',
      transparent: true,
      opacity: 0.34,
      roughness: 0.2,
      metalness: 0.2,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  mesh(
    parent: Group,
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const m = new Mesh(this.own(geometry), material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  box(
    parent: Group,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string | MeshStandardMaterial,
  ) {
    return this.mesh(
      parent,
      new BoxGeometry(w, h, d),
      typeof color === 'string' ? this.mat(color) : color,
      x,
      y,
      z,
    );
  }
  pole(parent: Group, x: number, y: number, z: number, r: number, h: number, color = '#3b4345') {
    return this.mesh(parent, new CylinderGeometry(r, r, h, 8), this.mat(color), x, y, z);
  }
  beam(parent: Group, a: number[], b: number[], r: number, color: string) {
    const v = new Vector3(...b).sub(new Vector3(...a));
    const m = this.mesh(
      parent,
      new CylinderGeometry(r, r, v.length(), 6),
      this.mat(color),
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2,
    );
    m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), v.normalize());
    return m;
  }
  /**
   * A local frame for a hand-made model. `y` is its legacy height and `standsOn` the legacy level
   * of the surface it was built on (default: the legacy street); with the DTM that surface is the
   * ground at the centre, or `base` (e.g. a building's footprint minimum). See placeLegacy().
   */
  local(
    center: number[],
    heading = 0,
    y = 0,
    standsOn: number = LEGACY_LEVELS.street,
    base?: number,
  ) {
    const g = new Group();
    const offset = terrain.placeLegacy(center[0], center[1], 0, standsOn, base);
    g.position.set(center[0], y + offset, center[1]);
    g.userData.groundOffset = offset;
    g.userData.groundAt = base ?? terrain.groundHeight(center[0], center[1]);
    g.rotation.y = heading;
    this.group.add(g);
    return g;
  }
  canvas(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!);
    const t = this.own(new CanvasTexture(c));
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return this.own(new MeshStandardMaterial({ map: t, roughness: 0.8, side: DoubleSide }));
  }
  sign(
    parent: Group,
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    rotation = 0,
    bg = '#202c31',
    fg = '#f8d178',
  ) {
    const material = this.canvas(1024, 160, (c) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, 1024, 160);
      c.fillStyle = fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = 'bold 70px Segoe UI';
      c.fillText(text, 512, 80, 980);
    });
    const m = this.mesh(parent, new PlaneGeometry(w, h), material, x, y, z);
    m.rotation.y = rotation;
    return m;
  }
  /** A playing surface on the ground: drawn over the mapped land cover by depth rank, not height. */
  surface(parent: Group, w: number, l: number, y: number, mat: MeshStandardMaterial) {
    mat.userData.ground = true;
    layeredSurface(mat, LAYER_RANK.kerb);
    if (terrain.measured) {
      // On the DTM the playing surface is the measured ground itself, built in world space.
      const m = this.mesh(
        this.group,
        groundRectangle(parent.position.x, parent.position.z, parent.rotation.y, w, l),
        mat,
      );
      m.castShadow = false;
      return m;
    }
    const m = this.mesh(parent, new PlaneGeometry(w, l), mat, 0, y, 0);
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  polygon(
    ring: number[][],
    y: number,
    color: string,
    thickness = 0.012,
    standsOn: number = LEGACY_LEVELS.street,
    base?: number,
  ) {
    const shape = new Shape(ring.map((p) => new Vector2(p[0], -p[1])));
    const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    const center = ring.reduce(
      (p, q) => [p[0] + q[0] / ring.length, p[1] + q[1] / ring.length],
      [0, 0],
    );
    const offset = terrain.placeLegacy(center[0], center[1], 0, standsOn, base);
    const mesh = this.mesh(this.group, geometry, this.mat(color), 0, y + offset, 0);
    mesh.userData.groundOffset = offset;
    mesh.userData.groundAt = base ?? terrain.groundHeight(center[0], center[1]);
    return mesh;
  }
  roof(
    parent: Group,
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    rise: number,
    color = '#4d555b',
  ) {
    const a = [-w / 2, 0, -d / 2],
      b = [w / 2, 0, -d / 2],
      c = [w / 2, 0, d / 2],
      e = [-w / 2, 0, d / 2],
      u = [-w / 2, rise, 0],
      v = [w / 2, rise, 0];
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([a, u, v, a, v, b, e, c, v, e, v, u, a, e, u, b, v, c].flat(), 3),
    );
    geometry.computeVertexNormals();
    return this.mesh(parent, geometry, this.mat(color), x, y, z);
  }
  /**
   * Lay a ground-level model (pitch, platform) on the measured terrain: each vertex moves by the
   * ground change between the model's anchor and its own position, so vertical parts move as a
   * unit and long surfaces follow the DTM instead of cutting into it. No effect without the DTM.
   */
  drape(root: Object3D) {
    if (!terrain.measured) return;
    root.updateMatrixWorld(true);
    const at = root.userData.groundAt as number;
    const point = new Vector3();
    root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const inverse = new Matrix4().copy(o.matrixWorld).invert();
      const positions = o.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
        point.y += terrain.groundHeight(point.x, point.z) - at;
        point.applyMatrix4(inverse);
        positions.setXYZ(i, point.x, point.y, point.z);
      }
      positions.needsUpdate = true;
      o.geometry.computeVertexNormals();
      o.geometry.computeBoundingSphere();
    });
  }
  /** Rebase a detailed structure to its roadway profile, once, in world coordinates. */
  reprojectTerrain(roots: Object3D[], heightAt: (x: number, z: number, legacyY: number) => number) {
    this.group.updateMatrixWorld(true);
    const point = new Vector3();
    for (const root of roots) {
      const offset = root.userData.groundOffset as number | undefined;
      if (offset === undefined) continue;
      root.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const inverse = new Matrix4().copy(o.matrixWorld).invert();
        const positions = o.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
          point.y = heightAt(point.x, point.z, point.y - offset);
          point.applyMatrix4(inverse);
          positions.setXYZ(i, point.x, point.y, point.z);
        }
        positions.needsUpdate = true;
        o.geometry.computeVertexNormals();
        o.geometry.computeBoundingSphere();
      });
    }
  }
  finish() {
    this.group.updateMatrixWorld(true);
    const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
    this.group.traverse((o) => {
      if (o instanceof Mesh) {
        const material = o.material as MeshStandardMaterial;
        if (!batches.has(material)) batches.set(material, []);
        const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        // Custom roofs have no UVs; normalize the vertex layout before merging with boxes.
        if (!geo.getAttribute('uv'))
          geo.setAttribute(
            'uv',
            new Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2),
          );
        geo.applyMatrix4(o.matrixWorld);
        batches.get(material)!.push(geo);
      }
    });
    // Merged meshes own their buffers; release the original per-detail geometries.
    this.group.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        this.owned.delete(o.geometry);
      }
    });
    this.group.clear();
    for (const [material, geos] of batches) {
      const merged = this.own(mergeGeometries(geos, false)!);
      geos.forEach((g) => g.dispose());
      const mesh = new Mesh(merged, material);
      mesh.castShadow = !material.transparent && !material.userData.ground;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    return {
      group: this.group,
      dispose: () => {
        this.owned.forEach((r) => r.dispose());
        this.group.clear();
      },
    };
  }
}
