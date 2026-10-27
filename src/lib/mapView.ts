import { treeProfile } from './treeProfile';
import { terrain } from './terrain';
import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  InstancedMesh,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { cityMap, type Point } from './mapModel';
import { createRiverfrontDetails } from './riverfrontDetails';
import { createCityBridges } from './cityBridges';
import { createParkTrees } from './mapVegetation';
import { createLandmarkDetails } from './mapLandmarks';
import { createCityPlaces, isDetailPlantingClear } from './cityPlaces';
import { CITY_LAYERS, type CityLayer } from './cityMesh';
import { requestCityLayers } from './cityMeshClient';
import { layeredGround } from './groundLayers';
import { createIdrottsparken } from './stadium/idrottsparken';
import { createRadhuset } from './landmarks/radhuset/radhuset';

export { Batch, fill, strip } from './cityMesh';

function windowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, 64, 64);
  c.fillStyle = '#d0c8ba';
  c.fillRect(0, 61, 64, 3);
  c.fillRect(0, 2, 64, 1);
  c.fillStyle = '#807d75';
  c.fillRect(17, 12, 30, 43);
  c.fillStyle = '#385461';
  c.fillRect(20, 15, 24, 35);
  c.fillStyle = '#829da0';
  c.fillRect(22, 17, 9, 15);
  c.fillStyle = '#eee8dc';
  c.fillRect(31, 15, 2, 35);
  c.fillRect(20, 32, 24, 2);
  c.fillRect(15, 53, 34, 4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
/** Legacy trunk base (on the flat-scene grass); with the DTM trunks start on the ground. */
const TREE_BASE = 0.025;
/**
 * Performance P2a: trees are drawn per TREE_DRAW_CELL × TREE_DRAW_CELL scene units (25 m per unit),
 * sharing one trunk and one crown material and geometry. A tree's look (size, lobe angle, colour)
 * still depends on its index within its 20-unit (500 m) planting cell, as before, so the picture is
 * unchanged; only the batching changed.
 */
export const TREE_DRAW_CELL = 80;
const TREE_LOOK_CELL = 20;
const CROWN_TONES = ['#527b3b', '#648849', '#719452', '#5b8044'].map((c) => new Color(c));
export function createMappedCity() {
  const group = new Group(),
    resources: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T): T => {
    resources.push(r);
    return r;
  };
  const materials: Record<CityLayer, { material: MeshStandardMaterial; shadows: boolean }> = {
    markings: {
      material: own(
        layeredGround(new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: 2 })),
      ),
      shadows: false,
    },
    banks: {
      material: own(new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: 2 })),
      shadows: true,
    },
    land: {
      material: own(
        layeredGround(new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: 2 })),
      ),
      shadows: false,
    },
    water: {
      material: own(
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.12, side: 2 }),
      ),
      shadows: false,
    },
    roads: {
      material: own(
        layeredGround(new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, side: 2 })),
      ),
      shadows: false,
    },
    surveyed: {
      material: own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: 2 })),
      shadows: true,
    },
    walls: {
      material: own(
        new MeshStandardMaterial({
          vertexColors: true,
          map: own(windowTexture()),
          roughness: 0.83,
          side: 2,
        }),
      ),
      shadows: true,
    },
    roofs: {
      material: own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, side: 2 })),
      shadows: true,
    },
    cornices: {
      material: own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: 2 })),
      shadows: false,
    },
  };
  // One placeholder group per layer keeps the original draw order while meshes arrive later.
  const layerGroups = {} as Record<CityLayer, Group>;
  for (const layer of CITY_LAYERS) {
    layerGroups[layer] = new Group();
    layerGroups[layer].name = 'city-' + layer;
    group.add(layerGroups[layer]);
  }
  let disposed = false;
  const ready = requestCityLayers().then((layers) => {
    for (const layer of CITY_LAYERS)
      for (const geometry of layers[layer] ?? []) {
        if (disposed) {
          geometry.dispose();
          continue;
        }
        const mesh = new Mesh(own(geometry), materials[layer].material);
        mesh.castShadow = materials[layer].shadows;
        mesh.receiveShadow = true;
        layerGroups[layer].add(mesh);
      }
  });
  const positions = [...cityMap.trees, ...createParkTrees()].filter(isDetailPlantingClear);
  // A tree's index within its 500 m planting cell sets its look; draw cells group several of them.
  const lookIndex = new Map<string, number>();
  const treeCells = new Map<string, { point: Point; index: number }[]>();
  for (const point of positions) {
    const look =
      Math.floor(point[0] / TREE_LOOK_CELL) + ',' + Math.floor(point[1] / TREE_LOOK_CELL);
    const index = lookIndex.get(look) ?? 0;
    lookIndex.set(look, index + 1);
    const key = Math.floor(point[0] / TREE_DRAW_CELL) + ',' + Math.floor(point[1] / TREE_DRAW_CELL);
    if (!treeCells.has(key)) treeCells.set(key, []);
    treeCells.get(key)!.push({ point, index });
  }
  // Shared by every draw cell: one material switch per frame for all trunks and one for all crowns.
  const trunkGeometry = own(new CylinderGeometry(0.7, 1, 1, 7));
  const trunkMaterial = own(new MeshStandardMaterial({ color: '#766048' }));
  const crownGeometry = own(new IcosahedronGeometry(1, 0));
  const crownMaterial = own(
    new MeshStandardMaterial({ vertexColors: false, color: '#ffffff', roughness: 1 }),
  );
  // Spatial batches can still be culled instead of drawing every tree in the region.
  for (const localTrees of treeCells.values()) {
    const trunks = own(new InstancedMesh(trunkGeometry, trunkMaterial, localTrees.length));
    const leaves = own(new InstancedMesh(crownGeometry, crownMaterial, localTrees.length * 4));
    const mat = new Matrix4(),
      q = new Quaternion(),
      v = new Vector3(),
      s = new Vector3();
    localTrees.forEach(({ point: [x, z], index: i }, slot) => {
      const profile = treeProfile([x, z], i),
        { radius, crownY, crownHeight, trunkRadius } = profile;
      const trunkHeight = crownY - 0.025;
      mat.compose(
        v.set(x, terrain.placeLegacy(x, z, TREE_BASE + trunkHeight / 2, TREE_BASE), z),
        q,
        s.set(trunkRadius, trunkHeight, trunkRadius),
      );
      trunks.setMatrixAt(slot, mat);
      // Four smaller lobes leave a scalloped outline and visible gaps between neighbouring trees.
      for (let j = 0; j < 4; j++) {
        const angle = (j * Math.PI * 2) / 3 + (i % 7) * 0.4;
        const outer = j < 3;
        mat.compose(
          v.set(
            x + (outer ? Math.cos(angle) * radius * 0.38 : 0),
            terrain.placeLegacy(x, z, crownY + (outer ? -0.012 : crownHeight * 0.45), TREE_BASE),
            z + (outer ? Math.sin(angle) * radius * 0.38 : 0),
          ),
          q,
          s.set(
            radius * (outer ? 0.65 : 0.62),
            crownHeight * (outer ? 0.78 : 0.65),
            radius * (outer ? 0.65 : 0.62),
          ),
        );
        leaves.setMatrixAt(slot * 4 + j, mat);
        leaves.setColorAt(slot * 4 + j, CROWN_TONES[(i + j) % 4]);
      }
    });
    trunks.castShadow = leaves.castShadow = true;
    trunks.receiveShadow = leaves.receiveShadow = true;
    group.add(trunks, leaves);
    trunks.computeBoundingSphere();
    leaves.computeBoundingSphere();
  }
  const riverfront = createRiverfrontDetails();
  group.add(riverfront.group);
  const bridges = createCityBridges();
  group.add(bridges.group);
  const places = createCityPlaces();
  group.add(places.group);
  const details = createLandmarkDetails();
  group.add(details.group);
  // Step 6: Idrottsparken (stands, roofs, masts, floodlight hooks) and its draped turf.
  const stadium = createIdrottsparken(terrain);
  group.add(stadium.group, stadium.turf);
  // Landmark Phase B1: Rådhuset with its tower and Gull-Olle (replaces the OSM walls of way/285809156).
  const radhuset = createRadhuset(terrain);
  group.add(radhuset.group);
  return {
    group,
    labels: details.labels,
    stadium,
    /**
     * Police Signs Phase D1: night level 0…1 (env.artificial) for the self-lit police emblem and the
     * police tower's lit windows.
     */
    setNightLevel(level: number) {
      details.setPoliceNightLevel(level);
    },
    /** Materials of the worker-built layers (their meshes arrive after `ready`). */
    layerMaterials: Object.values(materials).map((m) => m.material),
    /** Resolves when the worker-built ground, roads and buildings are in the scene. */
    ready,
    dispose() {
      disposed = true;
      stadium.dispose();
      radhuset.dispose();
      details.dispose();
      places.dispose();
      bridges.dispose();
      riverfront.dispose();
      resources.forEach((r) => r.dispose());
      group.clear();
    },
    statistics: { buildings: cityMap.buildings.length, trees: positions.length },
  };
}
