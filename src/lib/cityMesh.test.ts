import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { Batch, CITY_LAYERS, CITY_TASKS, type CityLayers } from './cityMesh';
import { deserializeLayers, serializeLayers } from './cityMeshTransfer';

describe('city mesh', () => {
  it('assigns every layer to exactly one task', () => {
    expect(Object.values(CITY_TASKS).flat().sort()).toEqual([...CITY_LAYERS].sort());
  });

  it('seals full buffers and trims partly filled ones to their exact size', () => {
    // Without a cell size a batch is cut every 3 000 triangles.
    const batch = new Batch(0),
      color = new Color('#336699');
    for (let i = 0; i < 3001; i++) {
      const x = (i % 10) * 0.1;
      batch.triangle([x, 0, 1], [x + 1, 0, 1], [x, 1, 2], color);
    }
    const counts = batch.geometries().map((g) => {
      const position = g.attributes.position.array as Float32Array;
      expect(position.buffer.byteLength).toBe(position.byteLength);
      return g.attributes.position.count;
    });
    expect(counts.sort((a, b) => a - b)).toEqual([3, 9000]);
  });

  it('draws each cell as one geometry, in the order its triangles were added (P2b)', () => {
    const batch = new Batch(),
      color = new Color('#336699');
    // 20 001 triangles in one cell (more than six old 3 000-triangle pieces), one in another.
    const xs: number[] = [];
    for (let i = 0; i < 20001; i++) {
      const x = (i % 97) * 0.1;
      xs.push(x);
      batch.triangle([x, 0, 1], [x + 1, 0, 1], [x, 1, 2], color);
    }
    batch.triangle([100, 0, 100], [101, 0, 100], [100, 1, 101], color);
    const geometries = batch.geometries();
    const counts = geometries.map((g) => {
      const position = g.attributes.position.array as Float32Array;
      expect(position.buffer.byteLength).toBe(position.byteLength);
      return g.attributes.position.count;
    });
    expect(counts.sort((a, b) => a - b)).toEqual([3, 60003]);
    const big = geometries.find((g) => g.attributes.position.count === 60003)!;
    const position = big.attributes.position.array as Float32Array;
    xs.forEach((x, i) => expect(position[i * 9]).toBeCloseTo(x, 5));
    expect(big.boundingSphere).not.toBeNull();
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
