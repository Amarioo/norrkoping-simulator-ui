import { cityMap, pointInRing, type MapRoad, type Point } from './mapModel';
import bridges from './data/city-bridges.json';

/** Only mapped bridges have bridge structures. Elevation alone never implies a bridge. */
const detailedBridges = bridges.bridges;
const EPSILON = 1e-10;

function bridgeMidpoint(segment: MapRoad): Point {
  return [(segment.a[0] + segment.b[0]) / 2, (segment.a[1] + segment.b[1]) / 2];
}

/**
 * Test orientation in the detail's local coordinate system.
 * A footpath crossing a road bridge diagonally is not owned by that road bridge.
 */
function followsBridgeAxis(segment: MapRoad, rotation: number): boolean {
  const dx = segment.b[0] - segment.a[0];
  const dz = segment.b[1] - segment.a[1];
  const length = Math.hypot(dx, dz);
  return length > EPSILON &&
    Math.abs((dx * Math.cos(rotation) - dz * Math.sin(rotation)) / length) > 0.7;
}

export function hasDetailedBridge(segment: MapRoad): boolean {
  if (segment.way === 536359154) return true; // Ingelstagatan: dedicated model.
  const midpoint = bridgeMidpoint(segment);
  return detailedBridges.some((bridge) => {
    if (segment.way === bridge.id) return true;
    if (!pointInRing(midpoint, bridge.ring as Point[])) return false;
    // Pedestrian paths need their own deck unless they actually follow a detailed bridge.
    return segment.kind !== 'path' || followsBridgeAxis(segment, bridge.rotation);
  });
}

export function needsGenericBridge(segment: MapRoad): boolean {
  return segment.bridge === true &&
    (segment.kind === 'road' || segment.kind === 'rail' || segment.kind === 'tram' || segment.kind === 'path') &&
    !hasDetailedBridge(segment);
}

export const genericBridgeSegments = cityMap.roads.filter(needsGenericBridge);

/**
 * Place a detailed bridge on the nearest tagged bridge deck, not the DTM waterbed.
 * The road mesh, tram/foot traffic and detail geometry must use compatible profiles.
 */
export function deckProfile(ring: number[][], fallback: (x: number, z: number) => number) {
  const segments = cityMap.roads.filter((segment) =>
    segment.bridge === true && pointInRing(bridgeMidpoint(segment), ring as Point[]),
  );
  const roads = segments.filter((segment) => segment.kind === 'road');
  const candidates = roads.length ? roads : segments;

  return (x: number, z: number): number => {
    let best = Infinity;
    let height = fallback(x, z);
    for (const segment of candidates) {
      const dx = segment.b[0] - segment.a[0];
      const dz = segment.b[1] - segment.a[1];
      const lengthSquared = dx * dx + dz * dz;
      if (lengthSquared <= EPSILON) continue;
      const t = Math.max(0, Math.min(1,
        ((x - segment.a[0]) * dx + (z - segment.a[1]) * dz) / lengthSquared,
      ));
      const distanceSquared = (x - segment.a[0] - dx * t) ** 2 +
        (z - segment.a[1] - dz * t) ** 2;
      if (distanceSquared < best) {
        best = distanceSquared;
        height = segment.yA + (segment.yB - segment.yA) * t;
      }
    }
    return height;
  };
}
