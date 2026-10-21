/**
 * Development-only infrastructure inspection overlay (Step 3.5): open the dev server with
 * `?inspect=infra`. Runs infraDiagnostics.ts once the map is ready and marks every issue with a pin
 * (height and thickness grow with the size of the defect), coloured by kind:
 *
 *   red     running surface below the terrain       orange  junction step
 *   yellow  steep grade / grade break               magenta sag (dip into a trench)
 *   blue    deck too close to the water             cyan    land lower than the water at a shoreline
 *   purple  building standing in the water          white   missing terrain / duplicate bridge owner
 *   pink    twisted road cross-section              green   rail vehicle off its drawn track
 *   brown   isolated DTM spike or pit                teal    junction fan off its strips
 * Documented exceptions (EXCEPTIONS: real structures, stairs) are not drawn.
 * Step 5.1: refinement sites (refinementCandidates) whose ground is already a breakline patch get a flat
 * white halo; `globalThis.__refinementSites` lists every site with E/N and the `patched` flag.
 *
 * The issue list is also available as `globalThis.__infraIssues` and printed as a console table.
 * Production builds never load this module (Scene.svelte imports it behind import.meta.env.DEV).
 */
import { Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { diagnoseInfrastructure, refinementCandidates, type InfraIssue, type IssueKind } from './infraDiagnostics';
import { terrain } from './terrain';

const COLORS: Record<IssueKind, string> = {
  'below-terrain': '#ff2d2d',
  'junction-step': '#ff9a1f',
  'junction-fan': '#00897b',
  'steep-grade': '#ffe11f',
  'grade-break': '#d6c21a',
  sag: '#ff3df2',
  'deck-near-water': '#2d6bff',
  'shore-below-water': '#22e3ff',
  'building-in-water': '#9b4dff',
  'missing-terrain': '#ffffff',
  'duplicate-bridge': '#ffffff',
  'cross-section': '#ff6f91',
  'vehicle-off-track': '#00ff6a',
  'terrain-spike': '#8a5a2b',
};
const M = terrain.data.reference.metresPerUnit;

export function createInfraInspector(): { group: Group; issues: InfraIssue[]; dispose(): void } {
  const started = performance.now();
  const issues = diagnoseInfrastructure().issues.filter((i) => !i.exception);
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
    const material = new MeshBasicMaterial({ color: new Color(COLORS[kind]), depthTest: false, transparent: true, opacity: 0.8 });
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
  const sites = refinementCandidates(issues),
    patched = sites.filter((s) => s.patched);
  if (patched.length) {
    const material = new MeshBasicMaterial({ color: new Color('#ffffff'), depthTest: false, transparent: true, opacity: 0.45 });
    materials.push(material);
    const halo = new InstancedMesh(geometry, material, patched.length);
    halo.renderOrder = 9;
    halo.frustumCulled = false;
    patched.forEach((site, n) => {
      position.set(site.x, terrain.groundHeight(site.x, site.z) + 0.5 / M, site.z);
      scale.set(9 / M, 1 / M, 9 / M);
      halo.setMatrixAt(n, matrix.compose(position, rotation, scale));
    });
    halo.name = 'infra-refinement-patched';
    group.add(halo);
  }
  const g = globalThis as unknown as { __infraIssues: unknown; __refinementSites: unknown };
  g.__refinementSites = sites.map((i) => {
    const [E, N] = terrain.toSweref(i.x, i.z);
    return { kind: i.kind, value: +i.value.toFixed(3), way: i.way, rail: i.rail, patched: i.patched, E: Math.round(E), N: Math.round(N) };
  });
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
