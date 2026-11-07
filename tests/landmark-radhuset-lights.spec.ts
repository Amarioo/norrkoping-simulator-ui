import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Landmark Phase B1 part 2: Rådhuset's tower floodlights in the running app. By day they are off; at
// night the tower's north face is floodlit while the town hall's north façade below stays dark (as
// in the 2017 night photograph); the shader program count is the same by day and at night. No
// backend needed.
const lidar = JSON.parse(fs.readFileSync('docs/landmark-b1/data/radhuset-lidar.json', 'utf8'));
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
type Describe = {
  programs: number;
  facadeLights: { emitters: number; active: number; names: string[] };
};
const describe = (page: Page) =>
  page.evaluate(() =>
    (
      globalThis as unknown as { __cityLighting: { describe(): Describe } }
    ).__cityLighting.describe(),
  );
const project = (page: Page, p: number[]) =>
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
const luma = (page: Page, png: Buffer, x: number, y: number) =>
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

test('Rådhuset: tower floodlit at night only, façades below dark, programs unchanged', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/?date=2026-11-30&time=12:00&stadium=off');
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 150000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await frames(page);

  const day = await describe(page);
  const tower = day.facadeLights.names.filter((n) => n.startsWith('radhuset-'));
  expect(tower).toHaveLength(8);
  expect(day.facadeLights.emitters).toBe(16);
  expect(day.facadeLights.active).toBe(0);

  // Night, camera on Tyska torget looking at the tower (the north-square view of B1's evidence).
  await page.$eval('#light-time', (el) => {
    (el as HTMLInputElement).value = '1218';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(
    ({ c, t }) => {
      const g = globalThis as unknown as {
        __cityLighting: { settle(): void };
        __cityCamera: {
          camera: { position: { set(...v: number[]): void } };
          controls: { target: { set(...v: number[]): void }; update(): void };
        };
      };
      g.__cityLighting.settle();
      g.__cityCamera.camera.position.set(...c);
      g.__cityCamera.controls.target.set(...t);
      g.__cityCamera.controls.update();
    },
    { c: scene(-25, 95, 22), t: scene(0, -10, 36) },
  );
  await page.waitForTimeout(800);
  await frames(page);
  const night = await describe(page);
  expect(night.facadeLights.active).toBe(16);
  expect(night.programs).toBe(day.programs);

  // The shaft's north face between the bands at 37.7 and 42.2 m, the cornice-lit roof, and the
  // north façade beside the tower (eye height of the upper windows).
  const shaft = await project(page, scene(-2.5, 5.0, 40)),
    roof = await project(page, scene(0, 3.0, 62)),
    facade = await project(page, scene(-20, 5.0, 16));
  const png = await page.locator('.map-panel').screenshot();
  const [shaftLuma, roofLuma, facadeLuma] = await Promise.all(
    [shaft, roof, facade].map((p) => luma(page, png, p.x, p.y)),
  );
  console.log(
    `[radhuset] night luma: shaft ${shaftLuma.toFixed(1)}, roof ${roofLuma.toFixed(1)}, façade ${facadeLuma.toFixed(1)}`,
  );
  expect(shaftLuma - facadeLuma).toBeGreaterThan(40);
  expect(roofLuma - facadeLuma).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});
