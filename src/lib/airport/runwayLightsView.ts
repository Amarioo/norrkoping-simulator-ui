/**
 * Airport Lighting Phase E1: draws the ESSP RWY 09/27 lights (layout: runwayLights.ts).
 *
 * - Glow: ONE instanced mesh of camera-facing glare quads, one per light, with the street lights'
 *   halo shader (lighting/fixtures.ts HALO_VERTEX/HALO_FRAGMENT, same material parameters), so no new
 *   shader program is compiled. Each light's colour depends on where it is seen from (green/red
 *   thresholds, white/yellow edges, PAPI white above / red below its angle); that is computed on the
 *   CPU for all ≈ 600 lights only when the camera, the runway in use or the switch changes, and
 *   written into the instance colours.
 * - Housings: small instanced fittings (edge, threshold and taxiway lights, approach light stands,
 *   PAPI boxes) with plain standard materials, sizes ESTIMATE.
 * - Switch (`AirportLightsMode`): its own, independent of the street lighting. 'auto' follows the
 *   darkness (the night level of the street lighting, a simulator rule, not an operational one),
 *   'on' is lit day and night, 'off' is dark.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  type BufferGeometry,
  type Camera,
  type Fog,
} from 'three';
import { HALO_CULL_MARGIN, HALO_FRAGMENT, HALO_VERTEX } from '../lighting/fixtures';
import {
  ESTIMATES,
  esspRunwayLights,
  faceSeen,
  LIGHT_RGB,
  type LightGroup,
  type RunwayLight,
} from './runwayLights';
import type { Point } from '../mapModel';

export type AirportLightsMode = 'auto' | 'on' | 'off';
export type RunwayInUse = '09' | '27';

interface Ground {
  groundHeight(x: number, z: number): number;
}

/** Housing per group: geometry (metres, base at y = 0) and colour. ESTIMATE (typical fittings). */
const HOUSINGS: Record<LightGroup, { geometry: () => BufferGeometry; color: string }> = {
  edge: {
    geometry: () => new CylinderGeometry(0.09, 0.11, 0.35, 8).translate(0, 0.175, 0),
    color: '#d9c96a',
  },
  threshold: {
    geometry: () => new CylinderGeometry(0.1, 0.12, 0.3, 8).translate(0, 0.15, 0),
    color: '#d9c96a',
  },
  taxiway: {
    geometry: () => new CylinderGeometry(0.08, 0.1, 0.3, 8).translate(0, 0.15, 0),
    color: '#d9c96a',
  },
  // Approach lights: the lamp head only (at the light); masts and bars are added per row below.
  approach: {
    geometry: () => new BoxGeometry(0.3, 0.22, 0.26).translate(0, -0.11, 0),
    color: '#4b4b46',
  },
  papi: { geometry: () => new BoxGeometry(1.2, 0.9, 0.7).translate(0, 0.45, 0), color: '#e7e4da' },
};

export function createRunwayLights(
  ground: Ground,
  airways: Parameters<typeof esspRunwayLights>[0],
  metresPerUnit = 25,
) {
  const lights: RunwayLight[] = esspRunwayLights(airways, metresPerUnit);
  const group = new Group();
  group.name = 'airport-lights';
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T) => (owned.push(r), r);
  const n = lights.length;
  const y = lights.map((l) => ground.groundHeight(...l.position));
  const lightY = lights.map((l, i) => y[i] + l.heightM / metresPerUnit);
  // Approach lights: one level per row (barrette or crossbar), in the light plane (its height above the
  // threshold's ground, rising for RWY 09) where the terrain allows, else at least their minimum height
  // above the highest ground under the row.
  const rows = new Map<string, number[]>();
  lights.forEach((l, i) => {
    if (!l.row) return;
    if (!rows.has(l.row)) rows.set(l.row, []);
    rows.get(l.row)!.push(i);
  });
  for (const members of rows.values()) {
    const { plane, planeAboveM } = lights[members[0]];
    const level = Math.max(
      ground.groundHeight(...plane!) + (planeAboveM ?? ESTIMATES.approachPlaneM) / metresPerUnit,
      ...members.map((i) => lightY[i]),
    );
    for (const i of members) lightY[i] = level;
  }

  // Housings: one instanced mesh per group.
  const m = new Matrix4();
  for (const kind of Object.keys(HOUSINGS) as LightGroup[]) {
    const members = lights.map((l, i) => [l, i] as const).filter(([l]) => l.group === kind);
    if (!members.length) continue;
    const spec = HOUSINGS[kind];
    const geometry = own(
      spec.geometry().scale(1 / metresPerUnit, 1 / metresPerUnit, 1 / metresPerUnit),
    );
    const mesh = own(
      new InstancedMesh(
        geometry,
        own(new MeshStandardMaterial({ color: spec.color, roughness: 0.7 })),
        members.length,
      ),
    );
    mesh.name = 'airport-lights-' + kind;
    members.forEach(([l, i], k) => {
      m.makeTranslation(l.position[0], kind === 'approach' ? lightY[i] : y[i], l.position[1]);
      mesh.setMatrixAt(k, m);
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Approach masts and bars (yellow, as on site; sizes ESTIMATE): each row hangs on a bar at its light
  // level, carried by masts from the ground: at the row's centre and, on crossbars, at each end and
  // about every 8 m between.
  const MAST = 0.3,
    BAR = 0.14;
  const mastAt: { x: number; z: number; ground: number; top: number }[] = [];
  const bars: { a: Point; b: Point; level: number }[] = [];
  for (const members of rows.values()) {
    // Order along the row: by offset from its first light, measured across the approach axis.
    const p0 = lights[members[0]].position;
    const far = members.reduce((best, i) =>
      Math.hypot(lights[i].position[0] - p0[0], lights[i].position[1] - p0[1]) >
      Math.hypot(lights[best].position[0] - p0[0], lights[best].position[1] - p0[1])
        ? i
        : best,
    );
    const pf = lights[far].position;
    const dir: Point = [pf[0] - p0[0], pf[1] - p0[1]];
    const sorted = [...members].sort(
      (i, j) =>
        (lights[i].position[0] - p0[0]) * dir[0] +
        (lights[i].position[1] - p0[1]) * dir[1] -
        ((lights[j].position[0] - p0[0]) * dir[0] + (lights[j].position[1] - p0[1]) * dir[1]),
    );
    const first = lights[sorted[0]].position,
      last = lights[sorted.at(-1)!].position,
      level = lightY[sorted[0]];
    bars.push({ a: first, b: last, level });
    const span = Math.hypot(last[0] - first[0], last[1] - first[1]) * metresPerUnit;
    const centre: Point = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
    const posts: Point[] = [centre];
    if (span > 6) {
      const count = Math.max(2, Math.round(span / 8) + 1);
      for (let k = 0; k < count; k++) {
        const t = k / (count - 1);
        posts.push([first[0] + (last[0] - first[0]) * t, first[1] + (last[1] - first[1]) * t]);
      }
    }
    for (const [x, z] of posts) {
      const g = ground.groundHeight(x, z);
      if (level - g > 0.05 / metresPerUnit) mastAt.push({ x, z, ground: g, top: level });
    }
  }
  const yellow = own(new MeshStandardMaterial({ color: '#d9ae2b', roughness: 0.6 }));
  if (mastAt.length) {
    const masts = own(
      new InstancedMesh(
        own(new BoxGeometry(MAST / metresPerUnit, 1, MAST / metresPerUnit).translate(0, 0.5, 0)),
        yellow,
        mastAt.length,
      ),
    );
    masts.name = 'airport-lights-masts';
    mastAt.forEach(({ x, z, ground: g, top }, k) => {
      m.makeScale(1, top - g, 1).setPosition(x, g, z);
      masts.setMatrixAt(k, m);
    });
    masts.computeBoundingSphere();
    group.add(masts);
  }
  const barMesh = own(
    new InstancedMesh(
      own(new BoxGeometry(1, BAR / metresPerUnit, BAR / metresPerUnit)),
      yellow,
      Math.max(1, bars.length),
    ),
  );
  barMesh.name = 'airport-lights-bars';
  barMesh.count = bars.length;
  const rot = new Matrix4();
  bars.forEach(({ a, b, level }, k) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const length = Math.max(Math.hypot(dx, dz), 0.3 / metresPerUnit);
    rot.makeRotationY(-Math.atan2(dz, dx));
    m.makeScale(length, 1, 1)
      .premultiply(rot)
      .setPosition((a[0] + b[0]) / 2, level - (0.22 + BAR / 2) / metresPerUnit, (a[1] + b[1]) / 2);
    barMesh.setMatrixAt(k, m);
  });
  if (bars.length) barMesh.computeBoundingSphere();
  group.add(barMesh);

  // Glow: the street lights' halo program; a slightly larger minimum size so the rows read as lines.
  const haloMaterial = own(
    new ShaderMaterial({
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      uniforms: {
        haloSize: { value: 0.9 / metresPerUnit },
        haloMinPx: { value: 3 },
        viewportHeight: { value: 800 },
        haloLevel: { value: 0 },
        fogNear: { value: 700 },
        fogFar: { value: 1700 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: true,
    }),
  );
  const halo = own(new InstancedMesh(own(new PlaneGeometry(1, 1)), haloMaterial, Math.max(1, n)));
  halo.name = 'airport-lights-glow';
  halo.count = n;
  lights.forEach((l, i) => {
    m.makeTranslation(l.position[0], lightY[i], l.position[1]);
    halo.setMatrixAt(i, m);
  });
  const colors = new Float32Array(Math.max(1, n) * 3);
  halo.instanceColor = new InstancedBufferAttribute(colors, 3);
  if (n) {
    halo.computeBoundingSphere();
    halo.boundingSphere!.radius += HALO_CULL_MARGIN;
  }
  halo.renderOrder = 5;
  halo.visible = false;
  group.add(halo);

  let lastKey = '';
  const lastCamera = new Matrix4();
  let level = 0;
  const seen = new Color();
  const recolor = (camera: Camera, inUse: RunwayInUse) => {
    const cx = camera.matrixWorld.elements[12],
      cy = camera.matrixWorld.elements[13],
      cz = camera.matrixWorld.elements[14];
    let lit = 0;
    for (let i = 0; i < n; i++) {
      const l = lights[i];
      const dx = cx - l.position[0],
        dz = cz - l.position[1];
      const h = Math.hypot(dx, dz) || 1e-6;
      const view: Point = [dx / h, dz / h];
      const elevation = (Math.atan2(cy - lightY[i], h) * 180) / Math.PI;
      seen.setRGB(0, 0, 0);
      for (const face of l.faces) {
        if (face.inUse !== 'both' && face.inUse !== inUse) continue;
        const [w, c] = faceSeen(face, view, elevation);
        if (w <= 0) continue;
        const rgb = LIGHT_RGB[c];
        seen.r += rgb[0] * w;
        seen.g += rgb[1] * w;
        seen.b += rgb[2] * w;
      }
      if (seen.r + seen.g + seen.b > 0) lit++;
      colors[i * 3] = seen.r;
      colors[i * 3 + 1] = seen.g;
      colors[i * 3 + 2] = seen.b;
    }
    halo.instanceColor!.needsUpdate = true;
    return lit;
  };
  let litFromCamera = 0;

  return {
    group,
    lights,
    /**
     * Per frame. `nightLevel` is the street lighting's night level (0…1); the switch decides what it
     * means for the airport. Recolours only when the camera moved or the runway in use changed.
     */
    update(
      camera: Camera,
      nightLevel: number,
      mode: AirportLightsMode,
      inUse: RunwayInUse,
      viewportHeight: number,
      fog: Fog | null,
    ) {
      level = mode === 'off' ? 0 : mode === 'on' ? 1 : nightLevel;
      halo.visible = level > 0.01 && n > 0;
      if (!halo.visible) return;
      const u = haloMaterial.uniforms;
      u.haloLevel.value = level * 0.9;
      u.viewportHeight.value = viewportHeight;
      if (fog) {
        u.fogNear.value = fog.near;
        u.fogFar.value = fog.far;
      }
      const key = inUse;
      if (key !== lastKey || !camera.matrixWorld.equals(lastCamera)) {
        litFromCamera = recolor(camera, inUse);
        lastCamera.copy(camera.matrixWorld);
        lastKey = key;
      }
    },
    /**
     * Development / test hook data: counts, the switch state, and what the camera sees at the last
     * recolouring — lit lights per group (colour components > 0.05 when shown) and each PAPI's four
     * units A–D (A nearest the runway) as W(hite) / R(ed) / -(not seen).
     */
    describe() {
      const byGroup: Record<string, number> = {},
        litByGroup: Record<string, number> = {};
      const papi: Record<string, string> = { '09': '', '27': '' };
      lights.forEach((l, i) => {
        byGroup[l.group] = (byGroup[l.group] ?? 0) + 1;
        const r = colors[i * 3],
          g = colors[i * 3 + 1],
          b = colors[i * 3 + 2];
        const on = halo.visible && r + g + b > 0.05;
        if (on) litByGroup[l.group] = (litByGroup[l.group] ?? 0) + 1;
        if (l.group === 'papi') papi[l.faces[0].inUse] += !on ? '-' : g > 0.5 * r ? 'W' : 'R';
      });
      return {
        lights: n,
        byGroup,
        level,
        visible: halo.visible,
        runwayInUse: lastKey,
        litFromCamera,
        litByGroup,
        papi,
      };
    },
    dispose() {
      owned.forEach((r) => r.dispose());
      group.clear();
    },
  };
}
