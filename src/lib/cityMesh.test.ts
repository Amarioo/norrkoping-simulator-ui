import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { Batch, CITY_LAYERS, CITY_TASKS, type CityLayers } from './cityMesh';
import { deserializeLayers, serializeLayers } from './cityMeshTransfer';

describe('city mesh', () => {
  it('assigns every layer to exactly one task', () => {
    expect(Object.values(CITY_TASKS).flat().sort()).toEqual([...CITY_LAYERS].sort());
  });

  it('seals full buffers and trims partly filled ones to their exact size', () => {
    const batch = new Batch(),
      color = new Color('#336699');
    // 3 001 triangles in one cell (one more than a sealed geometry holds), one in another.
    for (let i = 0; i < 3001; i++) {
      const x = (i % 10) * 0.1;
      batch.triangle([x, 0, 1], [x + 1, 0, 1], [x, 1, 2], color);
    }
    batch.triangle([100, 0, 100], [101, 0, 100], [100, 1, 101], color);
    const counts = batch.geometries().map((g) => {
      const position = g.attributes.position.array as Float32Array;
      expect(position.buffer.byteLength).toBe(position.byteLength);
      return g.attributes.position.count;
    });
    expect(counts.sort((a, b) => a - b)).toEqual([3, 3, 9000]);
  });

  it('moves geometry across a worker boundary without copying it', () => {
    const batch = new Batch(),
      color = new Color('#336699');
    batch.quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], color, 2, 3);
    batch.triangle([40, 0, 40], [41, 0, 40], [40, 2, 41], color);
    const layers: CityLayers = { walls: batch.geometries() };
    const expected = layers.walls!.map((g) =>
      Object.fromEntries(
        Object.entries(g.attributes).map(([name, a]) => [name, Array.from(a.array)]),
      ),
    );
    const spheres = layers.walls!.map((g) => g.boundingSphere!.clone());
    const { layers: wire, transfer } = serializeLayers(layers);
    const received = deserializeLayers(structuredClone(wire, { transfer }));
    // The sender's buffers are detached: they were transferred, not copied.
    expect(transfer.length).toBeGreaterThan(0);
    for (const buffer of transfer) expect(buffer.byteLength).toBe(0);
    expect(received.walls).toHaveLength(2);
    received.walls!.forEach((g, i) => {
      for (const [name, values] of Object.entries(expected[i]))
        expect(Array.from(g.attributes[name].array)).toEqual(values);
      expect(g.attributes.uv.itemSize).toBe(2);
      expect(g.boundingSphere!.equals(spheres[i])).toBe(true);
    });
  });
});
