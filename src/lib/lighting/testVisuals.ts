/**
 * Test helpers for the gathered fixture visuals (Lighting Phase L1, fixtures.ts). Not used at runtime.
 *
 * Phase 0 – A3 drew one instanced mesh per (area, type); L1 gathers housings and lenses near the
 * camera. These helpers turn the gathered meshes back into per-fixture transforms, so the earlier
 * frozen-transform and "nothing nearby hidden" checks keep their meaning.
 */
import { InstancedMesh, Matrix4, Vector3, type Material, type Object3D } from 'three';

interface LightingLike {
  group: Object3D;
  fixtures: { id: string; x: number; z: number }[];
  lamps: { baseY: number }[];
  set(input: { date: string; minutes: number; stadium: 'off' }): void;
  settle(): void;
  update(dt: number, camera: never, viewportHeight: number): void;
}

export type VisualKind = 'near' | 'lod' | 'lens' | 'halo';
export function kindOf(o: InstancedMesh): VisualKind | null {
  if (o.name === 'lighting-halos') return 'halo';
  if (o.name.startsWith('lighting-body-lod-')) return 'lod';
  if (o.name.startsWith('lighting-body-')) return 'near';
  if (o.name.startsWith('lighting-lens-')) return 'lens';
  return null;
}

/** Fixture IDs per kind drawn after an update with the camera at `position` (night). */
export function shownAt(lighting: LightingLike, position: Vector3) {
  lighting.update(0.016, { position } as never, 800);
  const shown: Record<VisualKind, Set<string>> = {
    near: new Set(),
    lod: new Set(),
    lens: new Set(),
    halo: new Set(),
  };
  lighting.group.traverse((o) => {
    if (!(o instanceof InstancedMesh) || !o.visible) return;
    const k = kindOf(o);
    if (k) for (const id of o.userData.fixtureIds as string[]) shown[k].add(id);
  });
  return shown;
}

/**
 * Every fixture's transforms, gathered with the camera at each fixture in turn (night): per kind,
 * fixture ID → instance matrix (comma-joined elements) and the geometry vertex count / material.
 * Throws if one fixture is drawn with two different transforms of the same kind.
 */
export function gatheredTransforms(lighting: LightingLike) {
  lighting.set({ date: '2026-10-21', minutes: 22 * 60, stadium: 'off' });
  lighting.settle();
  const m = new Matrix4();
  const out: Record<VisualKind, Map<string, { matrix: string; geometry: string }>> = {
    near: new Map(),
    lod: new Map(),
    lens: new Map(),
    halo: new Map(),
  };
  lighting.fixtures.forEach((f, i) => {
    lighting.update(0.016, { position: new Vector3(f.x, lighting.lamps[i].baseY + 0.08, f.z) } as never, 800);
    lighting.group.traverse((o) => {
      if (!(o instanceof InstancedMesh) || !o.visible) return;
      const k = kindOf(o);
      if (!k) return;
      const ids = o.userData.fixtureIds as string[];
      if (ids.length !== o.count) throw new Error(`${o.name}: ${ids.length} ids for ${o.count} instances`);
      const geometry = `${(o.material as Material).type}|${o.geometry.getAttribute('position').count}`;
      for (let j = 0; j < o.count; j++) {
        const matrix = (o.getMatrixAt(j, m), Array.from(m.elements).join(','));
        const prev = out[k].get(ids[j]);
        if (prev && prev.matrix !== matrix) throw new Error(`${ids[j]}: two ${k} transforms`);
        out[k].set(ids[j], { matrix, geometry });
      }
    });
  });
  return out;
}

/** Frozen Step 6.1b visuals (testdata/pilot-baseline.json) as sorted matrix lists per geometry key. */
export function frozenByGeometry(
  visuals: { material: string; vertices: number; instances: number[][] }[],
) {
  const out = new Map<string, string[]>();
  for (const v of visuals) {
    const k = `${v.material}|${v.vertices}`;
    out.set(k, [...(out.get(k) ?? []), ...v.instances.map((i) => i.join(','))]);
  }
  for (const list of out.values()) list.sort();
  return out;
}

/** Gathered transforms of the given fixtures (non-low-detail kinds) as sorted lists per geometry key. */
export function byGeometry(
  gathered: ReturnType<typeof gatheredTransforms>,
  ids: Set<string>,
) {
  const out = new Map<string, string[]>();
  for (const k of ['near', 'lens', 'halo'] as const)
    for (const [id, { matrix, geometry }] of gathered[k])
      if (ids.has(id)) out.set(geometry, [...(out.get(geometry) ?? []), matrix]);
  for (const list of out.values()) list.sort();
  return out;
}
