/**
 * Phase D2 — the canopy downlights as street-lighting fixtures (lighting/registry.ts), a rollout of
 * their own: `fuel-d2-v1`, IDs `estimate:fuel-d2-v1:way/<canopy way>:s<n>`, dataset `osm-fuel-d2`.
 *
 * Each lamp hangs under its canopy (support `canopy-underside`, y = the measured top − the estimated
 * fascia depth), so it is drawn and lit by the existing shader grid: no new light objects, no new
 * shader program. Position, type, output and colour are ESTIMATES (spec.ts LAMP); the canopy outline
 * is OSM and its height LiDAR. Occlusion: 16 horizontal sectors cut at the nearest OSM building wall
 * (the canopies themselves are open and excluded), like the Step 6 generator.
 */
import { sceneToSweref } from '../geo/sweref99tm.js';
import { groupKey } from '../lighting/corridorA1';
import type { LightingRegistry, RegistryFixture } from '../lighting/registry';
import { SECTORS } from '../lighting/cityLights';
import { cityMap } from '../mapModel';
import type { TerrainService } from '../terrain';
import { renderedGround } from './fuelStations';
import { canopyLayouts, type CanopyLayout, type XZ } from './layout';
import { FUEL_CANOPY_IDS, FUEL_VERSION, LAMP } from './spec';

export const FUEL_DATASET = 'osm-fuel-d2';
export const FUEL_GENERATOR = {
  script: 'src/lib/fuel/fuelLighting.ts',
  version: FUEL_VERSION,
  seed: null,
} as const;

type Edge = [XZ, XZ];
/** Distance along a ray to the first edge, or `max` (as the Step 6 occlusion helper). */
function rayHit(o: XZ, dir: XZ, edges: Edge[], max: number) {
  let best = max;
  for (const [a, b] of edges) {
    const ex = b[0] - a[0],
      ez = b[1] - a[1];
    const den = dir[0] * ez - dir[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - o[0]) * ez - (a[1] - o[1]) * ex) / den;
    const u = ((a[0] - o[0]) * dir[1] - (a[1] - o[1]) * dir[0]) / den;
    if (t > 1e-6 && t < best && u >= 0 && u <= 1) best = t;
  }
  return best;
}
/** 16 sector distances (metres), sector s centred at (s + 0.5)·22.5° − 180° (cityLights.ts). */
export function occlusion(p: XZ, edges: Edge[], rangeM: number) {
  return Array.from({ length: SECTORS }, (_, s) => {
    let m = rangeM;
    for (const f of [-1 / 3, 0, 1 / 3]) {
      const a = ((s + 0.5 + f) / SECTORS) * Math.PI * 2 - Math.PI;
      m = Math.min(m, rayHit(p, [Math.cos(a), Math.sin(a)], edges, rangeM));
    }
    return Number(m.toFixed(2));
  });
}
/** OSM building walls (ground metres) within `reach` of a canopy, the canopies excluded. */
function wallsNear(c: CanopyLayout, metres: number, reach: number): Edge[] {
  const skip = new Set(FUEL_CANOPY_IDS);
  const xs = c.ring.map((p) => p[0]),
    zs = c.ring.map((p) => p[1]);
  const x0 = Math.min(...xs) - reach,
    x1 = Math.max(...xs) + reach,
    z0 = Math.min(...zs) - reach,
    z1 = Math.max(...zs) + reach;
  const edges: Edge[] = [];
  for (const b of cityMap.buildings) {
    if (skip.has(b.id)) continue;
    for (const ring of b.rings) {
      const pts = ring.map(([x, z]) => [x * metres, z * metres] as XZ);
      if (pts.every((p) => p[0] < x0) || pts.every((p) => p[0] > x1)) continue;
      if (pts.every((p) => p[1] < z0) || pts.every((p) => p[1] > z1)) continue;
      for (let i = 1; i < pts.length; i++) edges.push([pts[i - 1], pts[i]]);
      if (pts[0][0] !== pts.at(-1)![0] || pts[0][1] !== pts.at(-1)![1])
        edges.push([pts.at(-1)!, pts[0]]);
    }
  }
  return edges;
}

/** The downlights of every built canopy as a lighting registry (deterministic: canopy, then grid order). */
export function fuelLightingRegistry(
  terrain: TerrainService,
  layouts: CanopyLayout[] = canopyLayouts(terrain.data.reference.metresPerUnit),
): LightingRegistry {
  const reference = terrain.data.reference;
  const metres = reference.metresPerUnit;
  const snapshot = cityMap.meta.timestamp;
  const fixtures: RegistryFixture[] = [];
  for (const c of layouts) {
    const walls = wallsNear(c, metres, LAMP.rangeM);
    c.lamps.forEach((p, k) => {
      const id = `estimate:${FUEL_VERSION}:${c.id}:s${k}`;
      const x = p[0] / metres,
        z = p[1] / metres;
      const [e, n] = sceneToSweref(reference as never, x, z) as [number, number];
      fixtures.push({
        id,
        runtimeId: id,
        role: 'fixture',
        parentId: null,
        group: groupKey(x, z),
        placement: 'estimated',
        illumination: 'estimated',
        // A LiDAR-measured outline (`lidar:node/…`) derives from its station's OSM node.
        source: {
          dataset: FUEL_DATASET,
          element: c.id.replace(/^lidar:/, ''),
          snapshot,
          licence: 'ODbL-1.0',
        },
        generator: {
          script: FUEL_GENERATOR.script,
          version: FUEL_GENERATOR.version,
          seed: null,
          method: 'canopy-grid',
          station: k,
        },
        position: {
          e,
          n,
          heightRh2000M: null,
          meaning: 'fixture-base',
          status: 'estimated',
          scene: { x, z },
        },
        support: {
          kind: 'canopy-underside',
          surface: 'fuel-canopy-underside',
          status: 'derived',
          y: c.undersideY / metres,
        },
        mountingHeightM: {
          value: Number((c.undersideY - renderedGround(terrain, metres, p)).toFixed(2)),
          status: 'estimated',
        },
        orientation: { sceneHeadingRad: null, gridAzimuthDeg: null, status: 'unknown' },
        photometry: {
          fixtureType: LAMP.type,
          cctK: LAMP.cct,
          candela: LAMP.candela,
          rangeM: LAMP.rangeM,
          profile: LAMP.profile,
          status: 'estimated',
        },
        occlusionM: { values: occlusion(p, walls, LAMP.rangeM), status: 'derived' },
        activation: { mode: 'solar-night', schedule: null, status: 'estimated' },
      });
    });
  }
  return {
    version: 1,
    horizontalCrs: 'EPSG:3006',
    verticalDatum: 'RH2000',
    sources: [
      {
        id: FUEL_DATASET,
        dataset: FUEL_DATASET,
        license: 'ODbL-1.0 (outlines); heights from Lantmäteriet LiDAR, CC BY 4.0',
        snapshot,
      },
    ],
    fixtures,
  };
}
