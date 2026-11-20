/**
 * Interface U4 (memory): textures painted in the page (signs, liveries, façades) keep their source
 * canvas alive after the picture is in graphics memory: about 270 canvases, some 200 MB in the page
 * and as much again in the browser's graphics process. Where memory is short (cityMeshClient.ts,
 * limitedMemory) a canvas that is painted once is emptied as soon as its texture is uploaded.
 *
 * Only for canvases that are never painted again and belong to one texture. A lost graphics
 * context can then not be refilled from the page; the app reloads in that case (App.svelte).
 */
import type { Texture } from 'three';
import { limitedMemory } from './cityMeshClient';

let limited: boolean | undefined;
export function releaseCanvasAfterUpload<T extends Texture>(texture: T): T {
  limited ??= limitedMemory();
  if (!limited) return texture;
  texture.onUpdate = () => {
    const canvas = texture.image as HTMLCanvasElement | null;
    if (canvas && typeof canvas.getContext === 'function') canvas.width = canvas.height = 1;
    texture.onUpdate = null;
  };
  return texture;
}
