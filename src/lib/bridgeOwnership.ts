import { cityMap, pointInRing, type MapRoad } from './mapModel';
import bridges from './data/city-bridges.json';
/** Structure ownership must come from mapped bridge tags, never absolute elevation. */
export function hasDetailedBridge(segment: MapRoad) {
  if (segment.way === 536359154) return true; // Ingelstagatan has its own model.
  const midpoint: [number, number] = [
    (segment.a[0] + segment.b[0]) / 2,
    (segment.a[1] + segment.b[1]) / 2,
  ];
  return bridges.bridges.some(
    (bridge) =>
      segment.way === bridge.id || (pointInRing(midpoint, bridge.ring as [number, number][]) &&
        (segment.kind !== 'path' || Math.abs((segment.b[0] - segment.a[0]) * Math.cos(bridge.rotation) - (segment.b[1] - segment.a[1]) * Math.sin(bridge.rotation)) / (Math.hypot(segment.b[0] - segment.a[0], segment.b[1] - segment.a[1]) || 1) > 0.7)),
  );
}
export function needsGenericBridge(segment: MapRoad) {
  return (
    segment.bridge === true &&
    ['road', 'rail', 'tram', 'path'].includes(segment.kind) &&
    !hasDetailedBridge(segment)
  );
}
export const genericBridgeSegments = cityMap.roads.filter(needsGenericBridge);

/** Interpolate the same mapped deck used by the road mesh and traffic. */
export function deckProfile(ring: number[][], fallback: (x: number, z: number) => number) {
  const all = cityMap.roads.filter(
    (segment) =>
      segment.bridge &&
      pointInRing(
        [(segment.a[0] + segment.b[0]) / 2, (segment.a[1] + segment.b[1]) / 2],
        ring as [number, number][],
      ),
  );
  const roads = all.filter((s) => s.kind === 'road');
  const candidates = roads.length ? roads : all;
  return (x: number, z: number) => {
    let best = Infinity,
      height = fallback(x, z);
    for (const segment of candidates) {
      const dx = segment.b[0] - segment.a[0],
        dz = segment.b[1] - segment.a[1];
      const t = Math.max(
        0,
        Math.min(1, ((x - segment.a[0]) * dx + (z - segment.a[1]) * dz) / (dx * dx + dz * dz || 1)),
      );
      const distance = (x - segment.a[0] - dx * t) ** 2 + (z - segment.a[1] - dz * t) ** 2;
      if (distance < best) {
        best = distance;
        height = segment.yA + (segment.yB - segment.yA) * t;
      }
    }
    return height;
  };
}
