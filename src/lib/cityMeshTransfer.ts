/** Wire format for city geometry crossing a worker boundary. */
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import type { CityLayer, CityLayers } from './cityMesh';

export interface SerializedGeometry {
  attributes: Record<string, { array: Float32Array; itemSize: number }>;
  /** Bounding sphere computed in the worker: [x, y, z, radius]. */
  sphere: [number, number, number, number] | null;
}
export type SerializedLayers = Partial<Record<CityLayer, SerializedGeometry[]>>;

export function serializeLayers(layers: CityLayers) {
  const result: SerializedLayers = {},
    transfer = new Set<ArrayBuffer>();
  for (const [layer, geometries] of Object.entries(layers) as [CityLayer, BufferGeometry[]][]) {
    result[layer] = geometries.map((geometry) => {
      const attributes: SerializedGeometry['attributes'] = {};
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const array = attribute.array as Float32Array;
        attributes[name] = { array, itemSize: attribute.itemSize };
        transfer.add(array.buffer as ArrayBuffer);
      }
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const s = geometry.boundingSphere;
      return {
        attributes,
        sphere: s ? [s.center.x, s.center.y, s.center.z, s.radius] : null,
      };
    });
  }
  return { layers: result, transfer: [...transfer] };
}

export function deserializeLayers(layers: SerializedLayers): CityLayers {
  const result: CityLayers = {};
  for (const [layer, geometries] of Object.entries(layers) as [CityLayer, SerializedGeometry[]][]) {
    result[layer] = geometries.map(({ attributes, sphere }) => {
      const geometry = new BufferGeometry();
      for (const [name, { array, itemSize }] of Object.entries(attributes))
        geometry.setAttribute(name, new BufferAttribute(array, itemSize));
      if (sphere)
        geometry.boundingSphere = new Sphere(
          new Vector3(sphere[0], sphere[1], sphere[2]),
          sphere[3],
        );
      else geometry.computeBoundingSphere();
      return geometry;
    });
  }
  return result;
}
