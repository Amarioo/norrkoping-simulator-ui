import { expect, type Page } from '@playwright/test';

/**
 * "The picture did not change" for page screenshots of the WebGL map (Performance P2b).
 *
 * The renderer is deterministic (the same scene read back with gl.readPixels() is bit-identical, see
 * docs/perf-p2b), but the browser's screenshot path is not: screenshots of an unchanged view can
 * differ by 1/255 in a few pixels. So two screenshots count as the same picture when they are
 * byte-identical, or when no channel of any pixel differs by more than 1/255 and at most 0.1 % of the
 * pixels differ at all. Any real change (a lamp, a shadow, a missing mesh) differs by far more.
 */
export const PICTURE_NOISE = { maxChannelDiff: 1, maxShare: 0.001 } as const;

export interface PictureDiff {
  width: number;
  height: number;
  /** Pixels with any channel different. */
  differing: number;
  /** Largest difference in any channel, 0–255. */
  maxDiff: number;
}

/** Decodes both PNGs in the page and compares them pixel by pixel (no image library in the project). */
export async function pictureDiff(page: Page, a: Buffer, b: Buffer): Promise<PictureDiff> {
  return page.evaluate(
    async ({ a, b }) => {
      const load = async (b64: string) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
      };
      const [x, y] = await Promise.all([load(a), load(b)]);
      if (x.w !== y.w || x.h !== y.h)
        return { width: x.w, height: x.h, differing: x.w * x.h, maxDiff: 255 };
      let differing = 0,
        maxDiff = 0;
      for (let i = 0; i < x.d.length; i += 4) {
        const d = Math.max(
          Math.abs(x.d[i] - y.d[i]),
          Math.abs(x.d[i + 1] - y.d[i + 1]),
          Math.abs(x.d[i + 2] - y.d[i + 2]),
          Math.abs(x.d[i + 3] - y.d[i + 3]),
        );
        if (d) differing++;
        if (d > maxDiff) maxDiff = d;
      }
      return { width: x.w, height: x.h, differing, maxDiff };
    },
    { a: a.toString('base64'), b: b.toString('base64') },
  );
}

export const isSamePicture = (diff: PictureDiff) =>
  diff.maxDiff <= PICTURE_NOISE.maxChannelDiff &&
  diff.differing <= PICTURE_NOISE.maxShare * diff.width * diff.height;

/** Expects `actual` to show the same picture as `expected` (see PICTURE_NOISE). */
export async function expectSamePicture(page: Page, actual: Buffer, expected: Buffer) {
  if (actual.equals(expected)) return;
  const diff = await pictureDiff(page, actual, expected);
  expect(
    isSamePicture(diff),
    `pictures differ: ${diff.differing} of ${diff.width * diff.height} pixels, by up to ${diff.maxDiff}/255`,
  ).toBe(true);
}
