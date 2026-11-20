/** Wire format for city geometry crossing a worker boundary, and its compact vertex format. */
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import type { CityLayer, CityLayers } from './cityMesh';

type VertexArray = Float32Array | Int8Array | Uint8Array;
export interface SerializedGeometry {
  attributes: Record<string, { array: VertexArray; itemSize: number; normalized: boolean }>;
  /** Vertex numbers of an indexed geometry (three per triangle). */
  index: Uint16Array | Uint32Array | null;
  /** Bounding sphere computed in the worker: [x, y, z, radius]. */
  sphere: [number, number, number, number] | null;
}
export type SerializedLayers = Partial<Record<CityLayer, SerializedGeometry[]>>;

/**
 * Interface U4 (memory): the worker-built city is about 26 million vertices. As four float
 * attributes that is 44 bytes per vertex, 1.1 GB, held twice (page and graphics memory), which a
 * phone does not have. The same vertices in 20 bytes:
 * - position: unchanged (3 × float32);
 * - normal: 3 × int8, normalised (a step of 1/127, at most about 0.4° off; the shader renormalises);
 * - color: 3 × uint8, normalised (a step of 1/255 in linear colour);
 * - uv: 2 × uint8 where every value is a whole number 0–255 (the ground layers carry only their
 *   depth rank there, groundLayers.ts); otherwise unchanged (the walls' window texture).
 * Positions, triangles and their order are untouched.
 */
export function compactGeometry(geometry: BufferGeometry) {
  const normal = geometry.getAttribute('normal'),
    color = geometry.getAttribute('color'),
    uv = geometry.getAttribute('uv');
  if (normal?.array instanceof Float32Array) {
    const source = normal.array,
      packed = new Int8Array(source.length);
    for (let i = 0; i < source.length; i++) packed[i] = Math.round(source[i] * 127);
    geometry.setAttribute('normal', new BufferAttribute(packed, normal.itemSize, true));
  }
  if (color?.array instanceof Float32Array) {
    const source = color.array,
      packed = new Uint8Array(source.length);
    for (let i = 0; i < source.length; i++)
      packed[i] = Math.round(Math.min(1, Math.max(0, source[i])) * 255);
    geometry.setAttribute('color', new BufferAttribute(packed, color.itemSize, true));
  }
  if (uv?.array instanceof Float32Array) {
    const source = uv.array;
    let whole = true;
    for (let i = 0; whole && i < source.length; i++) {
      const value = source[i];
      whole = value >= 0 && value <= 255 && value === Math.floor(value);
    }
    if (whole) geometry.setAttribute('uv', new BufferAttribute(Uint8Array.from(source), uv.itemSize));
  }
  return geometry;
}
/** Compacts every geometry of the layers in place (see compactGeometry). */
export function compactLayers(layers: CityLayers) {
  for (const geometries of Object.values(layers)) geometries?.forEach(compactGeometry);
  return layers;
}

/**
 * Interface U4 (memory): once a vertex array is in graphics memory the page's own copy is dropped.
 * Used only where memory is short (cityMeshClient.ts, limitedMemory). The app itself does not read
 * the city layers' vertices afterwards (they are not picked, and their bounding spheres are set),
 * but a lost graphics context can then not be refilled from the page: the app reloads the page in
 * that case (App.svelte).
 */
export function releaseAfterUpload(geometry: BufferGeometry) {
  for (const attribute of [...Object.values(geometry.attributes), geometry.index])
    (attribute as BufferAttribute | null)?.onUpload(function (this: BufferAttribute) {
      (this as { array: unknown }).array = null;
    });
  return geometry;
}

export function serializeLayers(layers: CityLayers) {
  const result: SerializedLayers = {},
    transfer = new Set<ArrayBuffer>();
  for (const [layer, geometries] of Object.entries(layers) as [CityLayer, BufferGeometry[]][]) {
    result[layer] = geometries.map((geometry) => {
      const attributes: SerializedGeometry['attributes'] = {};
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const array = attribute.array as VertexArray;
        attributes[name] = {
          array,
          itemSize: attribute.itemSize,
          normalized: attribute.normalized,
        };
        transfer.add(array.buffer as ArrayBuffer);
      }
      const index = (geometry.index?.array as Uint16Array | Uint32Array | undefined) ?? null;
      if (index) transfer.add(index.buffer as ArrayBuffer);
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const s = geometry.boundingSphere;
      return {
        attributes,
        index,
        sphere: s ? [s.center.x, s.center.y, s.center.z, s.radius] : null,
      };
    });
  }
  return { layers: result, transfer: [...transfer] };
}

export function deserializeLayers(layers: SerializedLayers): CityLayers {
  const result: CityLayers = {};
  for (const [layer, geometries] of Object.entries(layers) as [CityLayer, SerializedGeometry[]][]) {
    result[layer] = geometries.map(({ attributes, index, sphere }) => {
      const geometry = new BufferGeometry();
      if (index) geometry.setIndex(new BufferAttribute(index, 1));
      for (const [name, { array, itemSize, normalized }] of Object.entries(attributes))
        geometry.setAttribute(name, new BufferAttribute(array, itemSize, normalized));
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
