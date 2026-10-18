import { describe, expect, it } from 'vitest';
import { TerrainService, terrain, type TerrainTile, type TerrainDataset } from './terrain';
import { validateBuildings, buildingVertices, type BuildingMesh } from './buildingElevation';
import fs from 'node:fs';
const tile: TerrainTile = {
  id: 'test-only',
  source: 'synthetic test fixture, never city data',
  sourceUrl: 'https://example.invalid',
  licence: 'test',
  acquired: '2026-01-01',
  kind: 'DTM',
  resolutionMetres: 1,
  verticalAccuracyMetres: 0.1,
  verticalDatum: 'RH2000',
  processing: 'test fixture',
  x: 0,
  z: 0,
  step: 1,
  columns: 2,
  rows: 2,
  heights: [10, 20, 30, 40],
};
const dataset = (tiles: TerrainTile[]): TerrainDataset => ({
  ...terrain.data,
  revision: 'test',
  tiles,
});
describe('shared elevation reference', () => {
  it('uses metres with unit vertical scale and interpolates tile boundaries', () => {
    const service = new TerrainService(dataset([tile]));
    expect(service.sample(0.5, 0.5)?.metresRH2000).toBe(25);
    expect(service.sample(0.5, 0.5)?.sceneY).toBe(1);
    expect(service.sample(1, 1)?.metresRH2000).toBe(40);
    expect(service.sample(-0.01, 0)).toBeNull();
    expect(service.profileHeight([0, 0.071, 0], [1, 0.071, 1], 0.5)).toBeCloseTo(1.091);
    expect(service.profileHeight([0, 0, 0], [1, 0, 1], 0.5, [100, 150])).toBe(5);
  });
  it('prefers DTM, then resolution, and falls back across actual coverage/no-data', () => {
    const fallback = {
      ...tile,
      id: 'fallback',
      kind: 'DSM-fallback' as const,
      heights: [50, 50, 50, 50],
    };
    const service = new TerrainService(
      dataset([fallback, { ...tile, heights: [10, null, 30, 40] }]),
    );
    expect(service.sample(0, 0)?.sourceId).toBe('test-only');
    expect(service.sample(0.5, 0.5)?.sourceId).toBe('fallback');
    const fine = { ...tile, id: 'fine', resolutionMetres: 0.5 };
    expect(new TerrainService(dataset([tile, fine])).sample(0.5, 0.5)?.sourceId).toBe('fine');
  });
  it('rejects incompatible datums and malformed grids', () => {
    expect(
      () =>
        new TerrainService(
          dataset([{ ...tile, verticalDatum: 'EGM2008' } as unknown as TerrainTile]),
        ),
    ).toThrow();
    expect(() => new TerrainService(dataset([{ ...tile, heights: [NaN] }]))).toThrow();
  });
  it('does not label the legacy preview plane as measured ground', () => {
    const empty = new TerrainService(dataset([]));
    expect(empty.sample(0, 0)).toBeNull();
    expect(empty.offset(0, 0)).toBe(0);
  });
  it('round trips the existing horizontal transform', () => {
    const [x, z] = terrain.project(58.6, 16.2);
    const [lat, lon] = terrain.unproject(x, z);
    expect(lat).toBeCloseTo(58.6, 10);
    expect(lon).toBeCloseTo(16.2, 10);
  });
  it('ships identical elevation input in backend and UI', () => {
    const read = (file: string): TerrainDataset =>
      JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const backend = read('../norrkoping-simulator-backend/src/main/resources/terrain.json'),
      ui = read('src/lib/data/terrain.json');
    expect(ui).toEqual(backend);
    // The service keeps all of it except the base64 grids and mesh bits, which it holds decoded.
    const { activeBase64, ...mesh } = ui.mesh!;
    expect(terrain.data).toEqual({
      ...ui,
      tiles: ui.tiles.map(({ heightsBase64, ...tile }) => (void heightsBase64, tile)),
      mesh,
    });
    const bits = Buffer.from(activeBase64!, 'base64');
    for (const k of [0, 12345, 777777, 2_000_000, ui.mesh!.columns * ui.mesh!.rows - 1])
      expect(terrain.surface!.active(k % ui.mesh!.columns, Math.floor(k / ui.mesh!.columns))).toBe(
        ((bits[k >> 3] >> (k & 7)) & 1) === 1,
      );
    const encoded = ui.tiles.find((t) => t.heightsBase64)!,
      decoded = terrain.tiles.find((t) => t.id === encoded.id)!;
    const grid = Buffer.from((decoded.heights as Float32Array).buffer);
    expect(grid.equals(Buffer.from(encoded.heightsBase64!, 'base64'))).toBe(true);
  });
  it('rejects building meshes using another terrain revision', () => {
    expect(() =>
      validateBuildings({ version: 1, terrainRevision: 'different', buildings: [] }, 'test'),
    ).toThrow();
  });
});

it('preserves distinct absolute roof heights without adding ground a second time', () => {
  const b: BuildingMesh = {
    id: 'roof-test',
    replaces: [],
    source: 'test',
    sourceUrl: 'https://example.invalid',
    licence: 'test',
    acquired: '2026-01-01',
    method: 'LOD2',
    verticalDatum: 'RH2000',
    processing: 'fixture',
    vertices: [
      [0, 25, 0],
      [1, 50, 0],
      [1, 75, 1],
    ],
    triangles: [[0, 1, 2]],
  };
  validateBuildings(
    { version: 1, terrainRevision: terrain.data.revision, buildings: [b] },
    terrain.data.revision,
  );
  expect(buildingVertices(b).map((p) => p[1])).toEqual([1, 2, 3]);
  expect(b.vertices.map((p) => p[1])).toEqual([25, 50, 75]);
});

it('decodes compact grids, preserves no-data and keeps water separate from DTM', () => {
  const bytes = Buffer.alloc(16);
  [10, NaN, 30, 40].forEach((v, i) => bytes.writeFloatLE(v, i * 4));
  const encoded = { ...tile, heights: [], heightsBase64: bytes.toString('base64') };
  const water = { ...tile, id: 'water', kind: 'water' as const, heights: [90, 90, 90, 90] };
  const service = new TerrainService(dataset([encoded, water]));
  expect(service.sample(0, 0)?.metresRH2000).toBe(10);
  expect(service.sample(0.5, 0.5)).toBeNull();
  expect(service.sample(0.5, 0.5, true)?.metresRH2000).toBe(90);
});

it('keeps gap placement estimates separate from observed DTM and water', () => {
  const service = new TerrainService(
    dataset([
      { ...tile, heights: [10, null, 30, 40] },
      { ...tile, id: 'water-gap', kind: 'water', heights: [90, 90, 90, 90] },
    ]),
  );
  expect(service.sample(0.5, 0.5)).toBeNull();
  expect(service.groundHeight(0.5, 0.5) * 25).toBeCloseTo(80 / 3);
  expect(service.groundHeight(0.5, 0.5) * 25).toBeCloseTo(80 / 3);
  expect(service.waterHeight(0.5, 0.5) * 25).toBe(90);
});
