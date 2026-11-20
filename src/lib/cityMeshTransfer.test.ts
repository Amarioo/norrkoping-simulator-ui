import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Color } from 'three';
import { Batch } from './cityMesh';
import {
  compactGeometry,
  deserializeLayers,
  releaseAfterUpload,
  serializeLayers,
} from './cityMeshTransfer';

function triangleGeometry(uv: number[]) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0.5, 0, 0, 0.25, 1]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0.6, 0.8, 0, -1, 0, 0]), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array([0, 0.5, 1, 0.2, 0.4, 0.6, 1.2, -0.1, 0.999]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  return g;
}

describe('Interface U4: compact city vertices', () => {
  it('keeps positions and packs normals, colours and whole-number uv', () => {
    const g = compactGeometry(triangleGeometry([11, 0, 11, 0, 15, 0]));
    const position = g.getAttribute('position'),
      normal = g.getAttribute('normal'),
      color = g.getAttribute('color'),
      uv = g.getAttribute('uv');
    expect(position.array).toBeInstanceOf(Float32Array);
    expect([...position.array]).toEqual([0, 0, 0, 1, 0.5, 0, 0, 0.25, 1]);
    expect(normal.array).toBeInstanceOf(Int8Array);
    expect(normal.normalized).toBe(true);
    expect([...normal.array]).toEqual([0, 127, 0, 76, 102, 0, -127, 0, 0]);
    expect(color.array).toBeInstanceOf(Uint8Array);
    expect(color.normalized).toBe(true);
    expect([...color.array]).toEqual([0, 128, 255, 51, 102, 153, 255, 0, 255]);
    expect(uv.array).toBeInstanceOf(Uint8Array);
    expect(uv.normalized).toBe(false);
    expect([...uv.array]).toEqual([11, 0, 11, 0, 15, 0]);
    // What the shader reads back is within one step of the source.
    for (let i = 0; i < 3; i++) expect(Math.abs(normal.getX(i) - [0, 0.6, -1][i])).toBeLessThan(1 / 127);
    expect(Math.abs(color.getY(1) - 0.4)).toBeLessThan(1 / 255);
  });

  it('leaves a texture uv with fractions or large values as floats', () => {
    for (const uv of [
      [0, 0, 2.5, 0, 2.5, 1],
      [0, 0, 300, 0, 300, 1],
      [0, 0, -1, 0, 1, 1],
    ]) {
      const attribute = compactGeometry(triangleGeometry(uv)).getAttribute('uv');
      expect(attribute.array).toBeInstanceOf(Float32Array);
      expect([...attribute.array]).toEqual(uv);
    }
  });

  it('is unchanged by a second pass and survives the worker wire format', () => {
    const g = compactGeometry(compactGeometry(triangleGeometry([1, 0, 1, 0, 1, 0])));
    const { layers, transfer } = serializeLayers({ land: [g] });
    expect(transfer).toHaveLength(4);
    const back = deserializeLayers(layers).land![0];
    for (const name of ['position', 'normal', 'color', 'uv']) {
      const a = g.getAttribute(name),
        b = back.getAttribute(name);
      expect(b.array.constructor).toBe(a.array.constructor);
      expect(b.normalized).toBe(a.normalized);
      expect(b.itemSize).toBe(a.itemSize);
      expect([...b.array]).toEqual([...a.array]);
    }
    expect(back.boundingSphere!.radius).toBeCloseTo(g.boundingSphere!.radius, 6);
  });

  it('a compact batch collects the same vertices as compacting a float batch', () => {
    const emit = (batch: Batch) => {
      batch.triangle([0, 0, 0], [1, 0.1, 0], [0, 0.2, 1], new Color('#a7ac80'), [[3, 0], [3, 0], [3, 0]]);
      batch.triangle([2, 0, 0], [2, 1, 0], [2, 0, 1], new Color('#41494e'));
      return batch.geometries()[0];
    };
    const floats = compactGeometry(emit(new Batch(0)));
    Batch.compact = true;
    let packed: BufferGeometry;
    try {
      packed = emit(new Batch(0));
    } finally {
      Batch.compact = false;
    }
    for (const name of ['position', 'normal', 'color']) {
      expect(packed.getAttribute(name).array.constructor).toBe(floats.getAttribute(name).array.constructor);
      expect(packed.getAttribute(name).normalized).toBe(floats.getAttribute(name).normalized);
      expect([...packed.getAttribute(name).array]).toEqual([...floats.getAttribute(name).array]);
    }
  });

  it('drops the page copy of an array once it is uploaded, keeping the vertex count', () => {
    const g = releaseAfterUpload(compactGeometry(triangleGeometry([0, 0, 0, 0, 0, 0])));
    const position = g.getAttribute('position') as BufferAttribute;
    expect(position.array).not.toBeNull();
    position.onUploadCallback(); // What the renderer calls after the upload.
    expect(position.array).toBeNull();
    expect(position.count).toBe(3);
  });
});

describe('Interface U4: one geometry worker where memory is short', () => {
  it('a finger as main pointer or at most 4 GB reported means limited memory', async () => {
    const { vi } = await import('vitest');
    const { limitedMemory } = await import('./cityMeshClient');
    const media = (coarse: boolean) => () => ({ matches: coarse });
    try {
      vi.stubGlobal('navigator', { hardwareConcurrency: 6 });
      vi.stubGlobal('matchMedia', media(false));
      expect(limitedMemory()).toBe(false);
      vi.stubGlobal('matchMedia', media(true));
      expect(limitedMemory()).toBe(true);
      vi.stubGlobal('matchMedia', media(false));
      vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 4 });
      expect(limitedMemory()).toBe(true);
      vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 8 });
      expect(limitedMemory()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
