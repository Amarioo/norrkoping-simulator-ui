import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Landmark Phase B2: Hedvigs kyrka in the running app. The model is in the scene at its measured
// height (needle 36.9 m RH2000), its eight floodlights (estimates) are off by day and on at night, the
// floodlit west front is clearly brighter at night than the unlit south wall, and the shader program
// count is the same by day and at night. No backend needed.
const lidar = JSON.parse(fs.readFileSync('docs/landmark-b2/data/hedvig-lidar.json', 'utf8'));
const [ox, oz] = lidar.frame.originScene as [number, number],
  [ux, uz] = lidar.frame.axisScene as [number, number];
const M = 25;
/** Building frame (u, v metres; h RH2000 m) → scene. */
const scene = (u: number, v: number, h: number) => [
  ox + (u * ux + v * uz) / M,
  h / M,
  oz + (u * uz - v * ux) / M,
];
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
const setTime = (page: Page, minutes: number) =>
  page.$eval(
    '#light-time',
    (el, v) => {
      (el as HTMLInputElement).value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    minutes,
  );
type Describe = {
  programs: number;
  facadeLights: { emitters: number; active: number; level: number };
};
const describe = (page: Page) =>
  page.evaluate(() =>
    (
      globalThis as unknown as { __cityLighting: { describe(): Describe } }
    ).__cityLighting.describe(),
  );

test('Hedvigs kyrka: measured model in the scene, floodlights at night only, programs unchanged', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/?date=2026-10-21&time=12:39&stadium=off');
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 150000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await frames(page);

  const found = await page.evaluate((metres) => {
    type O = {
      name: string;
      parent: O | null;
      children: O[];
      geometry?: { boundingBox: unknown; computeBoundingBox(): void };
      matrixWorld: unknown;
      traverse(f: (o: O) => void): void;
    };
    const l = (globalThis as unknown as { __cityLighting: { group: O } }).__cityLighting;
    let root = l.group;
    while (root.parent) root = root.parent;
    let hedvig: O | null = null;
    root.traverse((o) => {
      if (o.name === 'hedvig') hedvig = o;
    });
    if (!hedvig) return null;
    const h = hedvig as O;
    let top = -Infinity;
    for (const c of h.children) {
      c.geometry!.computeBoundingBox();
      const box = (
        c.geometry!.boundingBox as {
          clone(): { applyMatrix4(m: unknown): { max: { y: number } } };
        }
      )
        .clone()
        .applyMatrix4(c.matrixWorld);
      top = Math.max(top, box.max.y * metres);
    }
    return { children: h.children.length, names: h.children.map((c) => c.name), top };
  }, M);
  expect(found).not.toBeNull();
  expect(found!.children).toBe(5);
  expect(found!.top).toBeCloseTo(lidar.tower.topRH2000, 1);

  const day = await describe(page);
  expect(day.facadeLights.emitters).toBe(8);
  expect(day.facadeLights.active).toBe(0);

  // Camera west-south-west of the church, at the height of the west front, looking at it.
  await page.evaluate(
    ({ c, t }) => {
      const { camera, controls } = (
        globalThis as unknown as {
          __cityCamera: {
            camera: { position: { set(...v: number[]): void } };
            controls: { target: { set(...v: number[]): void }; update(): void };
          };
        }
      ).__cityCamera;
      camera.position.set(...c);
      controls.target.set(...t);
      controls.update();
    },
    { c: scene(-26, -20, 9), t: scene(4, -3, 11) },
  );
  const project = (p: number[]) =>
    page.evaluate((p) => {
      const { camera } = (
        globalThis as unknown as {
          __cityCamera: {
            camera: {
              position: {
                clone(): {
                  set(
                    x: number,
                    y: number,
                    z: number,
                  ): { project(c: unknown): { x: number; y: number } };
                };
              };
              updateMatrixWorld(): void;
            };
          };
        }
      ).__cityCamera;
      camera.updateMatrixWorld();
      const v = camera.position.clone().set(p[0], p[1], p[2]).project(camera);
      const canvas = document.querySelector('.map-panel canvas') as HTMLCanvasElement;
      const r = canvas.getBoundingClientRect(),
        panel = (document.querySelector('.map-panel') as HTMLElement).getBoundingClientRect();
      return {
        x: r.left - panel.left + ((v.x + 1) / 2) * r.width,
        y: r.top - panel.top + ((1 - v.y) / 2) * r.height,
      };
    }, p);
  const luma = async (png: Buffer, x: number, y: number) =>
    page.evaluate(
      async ({ b64, x, y }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const d = g.getImageData(Math.round(x) - 3, Math.round(y) - 3, 6, 6).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4)
          s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        return s / (d.length / 4);
      },
      { b64: png.toString('base64'), x, y },
    );

  const dayPrograms = day.programs;
  await setTime(page, 1290);
  await page.evaluate(() =>
    (globalThis as unknown as { __cityLighting: { settle(): void } }).__cityLighting.settle(),
  );
  await page.waitForTimeout(800);
  await frames(page);
  const night = await describe(page);
  expect(night.facadeLights.active).toBe(8);
  expect(night.facadeLights.level).toBeGreaterThan(0.9);
  expect(night.programs).toBe(dayPrograms);

  // The floodlit west front (cream frontispiece beside the door, ≈ 8 m up) against the unlit south
  // wall (between two windows, the same height): no floodlight reaches the long walls.
  const front = await project(scene(-8.0, -1.9, 8)),
    south = await project(scene(14.5, -10.5, 9));
  const png = await page.locator('.map-panel').screenshot();
  const frontLuma = await luma(png, front.x, front.y),
    southLuma = await luma(png, south.x, south.y);
  console.log(
    `[hedvig] night luma: west front ${frontLuma.toFixed(1)}, south wall ${southLuma.toFixed(1)}`,
  );
  expect(frontLuma - southLuma).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});
