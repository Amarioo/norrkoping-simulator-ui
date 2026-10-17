import { terrain } from './terrain';
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
  local(center: number[], heading = 0, y = 0) {
    const g = new Group();
    g.position.set(center[0], terrain.relativeHeight(center[0], center[1], y), center[1]);
    g.userData.groundOffset = terrain.offset(center[0], center[1]);
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
  surface(parent: Group, w: number, l: number, y: number, mat: MeshStandardMaterial) {
    mat.userData.ground = true;
    const m = this.mesh(parent, new PlaneGeometry(w, l), mat, 0, y, 0);
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  polygon(ring: number[][], y: number, color: string, thickness = 0.012) {
    const shape = new Shape(ring.map((p) => new Vector2(p[0], -p[1])));
    const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    const center = ring.reduce(
      (p, q) => [p[0] + q[0] / ring.length, p[1] + q[1] / ring.length],
      [0, 0],
    );
    const mesh = this.mesh(
      this.group,
      geometry,
      this.mat(color),
      0,
      terrain.relativeHeight(center[0], center[1], y),
      0,
    );
    mesh.userData.groundOffset = terrain.offset(center[0], center[1]);
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
