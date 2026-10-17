import source from './data/buildings-3d.json';
import { terrain } from './terrain';

export interface BuildingMesh {
  id: string;
  /** Explicit OSM matches to suppress the corresponding fallback volumes. */
  replaces: string[];
  source: string;
  sourceUrl: string;
  licence: string;
  acquired: string;
  method: 'LOD2' | 'LiDAR';
  verticalDatum: 'RH2000';
  processing: string;
  /** Local scene X/Z; absolute RH2000 metres for the middle component. */
  vertices: [number, number, number][];
  triangles: [number, number, number][];
}
export interface BuildingDataset {
  version: number;
  terrainRevision: string;
  buildings: BuildingMesh[];
}
export function validateBuildings(data: BuildingDataset, revision: string) {
  if (data.version !== 1 || data.terrainRevision !== revision)
    throw new Error('Building/terrain reference mismatch');
  const ids = new Set<string>(),
    replaced = new Set<string>();
  for (const b of data.buildings) {
    if (
      !b.id ||
      ids.has(b.id) ||
      !b.source ||
      !b.sourceUrl ||
      !b.licence ||
      !b.acquired ||
      !b.processing ||
      !['LOD2', 'LiDAR'].includes(b.method) ||
      b.verticalDatum !== 'RH2000' ||
      b.vertices.length < 3 ||
      !b.triangles.length ||
      !b.vertices.every((v) => v.length === 3 && v.every(Number.isFinite)) ||
      !b.triangles.every(
        (t) =>
          t.length === 3 &&
          new Set(t).size === 3 &&
          t.every((i) => Number.isInteger(i) && i >= 0 && i < b.vertices.length),
      ) ||
      b.replaces.some((id) => replaced.has(id))
    )
      throw new Error(`Invalid 3D building ${b.id}`);
    ids.add(b.id);
    b.replaces.forEach((id) => replaced.add(id));
  }
}
export const buildingDataset = source as BuildingDataset;
validateBuildings(buildingDataset, terrain.data.revision);
export const measuredBuildings = buildingDataset.buildings;
export const replacedBuildings = new Set(measuredBuildings.flatMap((b) => b.replaces));
export function buildingVertices(b: BuildingMesh) {
  // Surveyed roof and facade heights must NEVER be draped on or added to the DTM.
  return b.vertices.map(([x, y, z]) => [x, terrain.toSceneHeight(y), z]);
}
