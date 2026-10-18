/**
 * Depth ordering of surfaces that lie on the same measured terrain.
 *
 * Land cover, roads, markings and hand-made pavements (runways, pitches) share the DTM surface, so
 * they are ordered in depth instead of being lifted in metres. Each rank (LAYER_RANK below)
 * moves a vertex LAYER_DEPTH_BIAS in normalised depth towards the camera: about four float steps,
 * which orders coplanar layers without visible parallax. The camera near plane scales with its
 * height (FreeCamera.svelte), keeping this a few centimetres even in the overview.
 */
import type { Material } from 'three';

/** Depth order of coplanar ground layers (uv.x of the worker-built city layers). */
export const LAYER_RANK = {
  ground: 0,
  /** Land-cover kinds take 1–9, in the order of COVER_ORDER. */
  cover: 1,
  kerb: 10,
  asphalt: 11,
  path: 12,
  ballast: 13,
  rail: 14,
  marking: 15,
} as const;
/** Overlapping land cover: later kinds are drawn on top (the legacy flat-scene level order). */
export const COVER_ORDER = [
  'farmland',
  'residential',
  'industrial',
  'square',
  'grass',
  'cemetery',
  'wood',
  'pitch',
  'apron',
] as const;
export const LAYER_DEPTH_BIAS = 2 ** -21;
const bias = LAYER_DEPTH_BIAS.toExponential(12);

/** Rank per vertex from uv.x (the worker-built city layers have no textures). */
export function layeredGround<T extends Material>(material: T) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>\n\tgl_Position.z -= uv.x * ${bias} * gl_Position.w;`,
    );
  };
  material.customProgramCacheKey = () => 'layered-ground';
  return material;
}

/**
 * One rank for a whole (possibly textured) material, e.g. a runway or a pitch surface. Uses the
 * GL polygon offset (a draw state, so no extra shader programs to compile): 4 units of the
 * smallest resolvable depth step per rank, matching LAYER_DEPTH_BIAS (2^-21 in NDC = 4 × 2^-23).
 */
export function layeredSurface<T extends Material>(material: T, rank: number) {
  material.polygonOffset = true;
  material.polygonOffsetFactor = 0;
  material.polygonOffsetUnits = -4 * rank;
  return material;
}
