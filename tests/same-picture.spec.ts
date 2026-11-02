import { test, expect, type Page } from '@playwright/test';
import { expectSamePicture, isSamePicture, pictureDiff } from './samePicture';

// Performance P2b: the screenshot comparison used by the lighting tests tolerates only the browser's
// 1/255 screenshot noise and still catches every real change. Synthetic PNGs, no app or backend.

/** A 200×100 PNG with a gradient; `edits` sets [x, y, channel delta] on single pixels. */
const png = (page: Page, edits: [number, number, number][] = [], width = 200, height = 100) =>
  page
    .evaluate(
      async ({ edits, width, height }) => {
        const c = new OffscreenCanvas(width, height);
        const g = c.getContext('2d')!;
        const img = g.createImageData(width, height);
        for (let i = 0; i < width * height; i++) {
          img.data[i * 4] = (i * 7) % 250;
          img.data[i * 4 + 1] = (i * 3) % 250;
          img.data[i * 4 + 2] = 100;
          img.data[i * 4 + 3] = 255;
        }
        for (const [x, y, delta] of edits) img.data[(y * width + x) * 4] += delta;
        g.putImageData(img, 0, 0);
        const bytes = new Uint8Array(
          await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer(),
        );
        let s = '';
        for (const v of bytes) s += String.fromCharCode(v);
        return btoa(s);
      },
      { edits, width, height },
    )
    .then((b64) => Buffer.from(b64, 'base64'));

test('same-picture comparison: tolerates 1/255 noise in a few pixels, catches real changes', async ({
  page,
}) => {
  await page.setContent('<!doctype html><title>same picture</title>');
  const base = await png(page);
  // Byte-identical.
  await expectSamePicture(page, base, await png(page));
  // Screenshot noise: 1/255 in 3 pixels, and in 20 pixels (0.1 % of 20 000 = 20).
  const noise3 = await png(page, [
    [10, 10, 1],
    [11, 10, 1],
    [50, 60, -1],
  ]);
  expect(noise3.equals(base)).toBe(false);
  await expectSamePicture(page, noise3, base);
  const noise20 = await png(
    page,
    Array.from({ length: 20 }, (_, i) => [i * 9, 5, 1] as [number, number, number]),
  );
  await expectSamePicture(page, noise20, base);
  // Real changes: one pixel by 2/255, one by 40/255, 1/255 in 21 pixels, another size.
  const changes = {
    twoLevels: await png(page, [[100, 50, 2]]),
    lamp: await png(page, [[100, 50, 40]]),
    tooMany: await png(
      page,
      Array.from({ length: 21 }, (_, i) => [i * 9, 5, 1] as [number, number, number]),
    ),
    size: await png(page, [], 201, 100),
  };
  for (const [name, changed] of Object.entries(changes)) {
    const diff = await pictureDiff(page, changed, base);
    expect(isSamePicture(diff), name).toBe(false);
    await expect(expectSamePicture(page, changed, base), name).rejects.toThrow(/pictures differ/);
  }
  expect(await pictureDiff(page, changes.lamp, base)).toEqual({
    width: 200,
    height: 100,
    differing: 1,
    maxDiff: 40,
  });
});
