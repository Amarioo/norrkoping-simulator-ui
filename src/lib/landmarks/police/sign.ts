import {
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Path,
  Shape,
  ShapeGeometry,
  type Texture,
} from 'three';
import outline from './emblem-outline.json';
import { NIGHT_GAIN, signPlacement } from './spec';

/**
 * Emblem-shaped flat geometry: the painted emblem spans exactly `width` × `height` (scene units),
 * centred on the origin, facing +z. The outline (scripts/police-signs-d1/emblem-outline.mjs) is the
 * artwork's alpha ≥ 50 % contour, so the opaque surface shows only the painted emblem; its UVs are the
 * outline's own image coordinates (the artwork has a transparent margin around the emblem).
 */
export function emblemGeometry(width: number, height: number) {
  const us = outline.outer[0].map((p) => p[0]),
    vs = outline.outer[0].map((p) => p[1]);
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const [su, sv] = [width / (u1 - u0), height / (v1 - v0)];
  const [uc, vc] = [(u0 + u1) / 2, (v0 + v1) / 2];
  const toXY = ([u, v]: number[]) => [(u - uc) * su, (vc - v) * sv] as const;
  const ring = <T extends Path>(target: T, points: number[][]) => {
    points.forEach((p, i) => {
      const [x, y] = toXY(p);
      if (i) target.lineTo(x, y);
      else target.moveTo(x, y);
    });
    target.closePath();
    return target;
  };
  const shapes = outline.outer.map((points) => ring(new Shape(), points));
  // Each hole belongs to the outer contour that contains it (the artwork has one outer contour).
  for (const hole of outline.holes) shapes[0].holes.push(ring(new Path(), hole));
  const geometry = new ShapeGeometry(shapes, 1);
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = uc + position.getX(i) / su;
    uv[i * 2 + 1] = 1 - (vc - position.getY(i) / sv);
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return geometry;
}

/**
 * Police Signs Phase D1: the emblem sign on the police tower's south-south-east gable (spec.ts).
 *
 * An opaque emblem-shaped surface with the official artwork (public/assets/polis-emblem.svg, see
 * DATA-LICENSE.md) as its colour map and, for the night glow, as its emissive map: self-lit by
 * `setNightLevel` (the street lighting's env.artificial), so no three.js light is added. Opaque,
 * front-sided, instanced map + emissiveMap is exactly the material of the tram and bus destination
 * signs (publicTransport.ts), so the sign compiles into an existing shader program. The caller adds `mesh`
 * to the tower group (local frame of TOWER_MODEL).
 */
export function createPoliceSign(crest: Texture, metresPerUnit = 25) {
  const p = signPlacement(metresPerUnit);
  const geometry = emblemGeometry(p.width, p.height);
  const material = new MeshStandardMaterial({
    map: crest,
    emissiveMap: crest,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    roughness: 0.5,
  });
  // One instance: the tram and bus destination signs are instanced, and instancing is part of the
  // shader program's key, so a single-instance InstancedMesh shares their program.
  const mesh = new InstancedMesh(geometry, material, 1);
  mesh.setMatrixAt(0, new Matrix4());
  mesh.computeBoundingSphere();
  mesh.name = 'police-sign';
  mesh.position.set(p.x, p.y, p.z);
  let level = 0;
  return {
    mesh,
    material,
    /** Night level 0…1 (env.artificial): 0 by day (no glow), NIGHT_GAIN at full night. */
    setNightLevel(next: number) {
      level = Math.min(1, Math.max(0, next));
      material.emissiveIntensity = NIGHT_GAIN * level;
    },
    get nightLevel() {
      return level;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
