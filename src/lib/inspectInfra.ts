/**
 * Development-only infrastructure inspection overlay (Step 3.5): open the dev server with
 * `?inspect=infra`. Runs infraDiagnostics.ts once the map is ready and marks every issue with a pin
 * (height and thickness grow with the size of the defect), coloured by kind:
 *
 *   red     running surface below the terrain       orange  junction step
 *   yellow  steep grade / grade break               magenta sag (dip into a trench)
 *   blue    deck too close to the water             cyan    land lower than the water at a shoreline
 *   purple  building standing in the water          white   missing terrain / duplicate bridge owner
 *
 * The issue list is also available as `globalThis.__infraIssues` and printed as a console table.
 * Production builds never load this module (Scene.svelte imports it behind import.meta.env.DEV).
 */
import { Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { diagnoseInfrastructure, type InfraIssue, type IssueKind } from './infraDiagnostics';
import { terrain } from './terrain';

const COLORS: Record<IssueKind, string> = {
  'below-terrain': '#ff2d2d',
  'junction-step': '#ff9a1f',
  'steep-grade': '#ffe11f',
  'grade-break': '#d6c21a',
  sag: '#ff3df2',
  'deck-near-water': '#2d6bff',
  'shore-below-water': '#22e3ff',
  'building-in-water': '#9b4dff',
  'missing-terrain': '#ffffff',
  'duplicate-bridge': '#ffffff',
};
const M = terrain.data.reference.metresPerUnit;

export function createInfraInspector(): { group: Group; issues: InfraIssue[]; dispose(): void } {
  const started = performance.now();
  const { issues } = diagnoseInfrastructure();
  const group = new Group();
  group.name = 'infra-inspector';
  const geometry = new CylinderGeometry(1, 1, 1, 6);
  const materials: MeshBasicMaterial[] = [];
  const byKind = new Map<IssueKind, InfraIssue[]>();
  for (const i of issues) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  const matrix = new Matrix4(),
    position = new Vector3(),
    scale = new Vector3(),
    rotation = new Quaternion();
  for (const [kind, list] of byKind) {
    const material = new MeshBasicMaterial({ color: new Color(COLORS[kind]), depthTest: false, transparent: true, opacity: 0.85 });
    materials.push(material);
    const mesh = new InstancedMesh(geometry, material, list.length);
    mesh.renderOrder = 10;
    mesh.frustumCulled = false;
    list.forEach((issue, n) => {
      // Grades are in percent; everything else in metres.
      const size = kind === 'steep-grade' || kind === 'grade-break' ? issue.value / 10 : Math.abs(issue.value);
      const height = (15 + Math.min(size, 10) * 6) / M,
        radius = (2 + Math.min(size, 6)) / M;
      position.set(issue.x, terrain.groundHeight(issue.x, issue.z) + height / 2, issue.z);
      scale.set(radius, height, radius);
      mesh.setMatrixAt(n, matrix.compose(position, rotation, scale));
    });
    mesh.name = `infra-${kind}`;
    group.add(mesh);
  }
  const g = globalThis as unknown as { __infraIssues: unknown };
  g.__infraIssues = issues.map((i) => {
    const [E, N] = terrain.toSweref(i.x, i.z);
    return { ...i, E: Math.round(E), N: Math.round(N) };
  });
  console.info(`[infra] ${issues.length} issues in ${Math.round(performance.now() - started)} ms`);
  console.table(Object.fromEntries([...byKind].map(([k, v]) => [k, { count: v.length, worst: Math.max(...v.map((i) => i.value)) }])));
  return {
    group,
    issues,
    dispose() {
      geometry.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
