import { cityMap, type Point } from './mapModel';
import { distanceToSegment } from './mapVegetation';
const promenades = cityMap.roads.filter((r) => /^(Norra|Södra) Promenaden$/i.test(r.name ?? ''));
/** Metres converted at 25 m/unit; clear trunks and trimmed crowns follow the supplied allée reference. */
export function treeProfile(point: Point, index: number) {
  const avenue = promenades.some((r) => distanceToSegment(point, r.a, r.b) < 1.05);
  const jitter = ((index * 37) % 11) / 10;
  return {
    avenue,
    radius: avenue ? 0.092 + jitter * 0.022 : 0.14 + jitter * 0.045,
    crownY: avenue ? 0.34 + jitter * 0.035 : 0.35 + jitter * 0.04,
    crownHeight: avenue ? 0.13 + jitter * 0.025 : 0.17 + jitter * 0.03,
    trunkRadius: avenue ? 0.008 : 0.012,
  };
}
