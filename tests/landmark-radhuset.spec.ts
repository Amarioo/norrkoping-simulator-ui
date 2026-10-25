import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Landmark Phase B1: Rådhuset, its tower and Gull-Olle in the running app. The model is in the scene
// at its measured height (Gull-Olle's top 73.15 m RH2000), the earlier illustrative tower is gone,
// the tower is drawn where the LiDAR found it (dark brick against the sky), and the shader program
// count is unchanged by day and at night. No backend needed.
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
const setTime = (page: Page, minutes: number) =>
  page.$eval(
    '#light-time',
    (el, v) => {
      (el as HTMLInputElement).value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    minutes,
  );

test('Rådhuset: measured tower and Gull-Olle in the scene, old tower removed, programs unchanged', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/?date=2026-10-21&time=12:39&stadium=off');
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 150000 });
  // No backend: hide the connection banner, which would cover the sky probe.
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await frames(page);

  const found = await page.evaluate(
    ({ centre, metres }) => {
      type O = {
        name: string;
        parent: O | null;
        children: O[];
        isMesh?: boolean;
        isInstancedMesh?: boolean;
        geometry?: { boundingBox: unknown; computeBoundingBox(): void };
        matrixWorld: unknown;
        traverse(f: (o: O) => void): void;
      };
      const l = (globalThis as unknown as { __cityLighting: { group: O } }).__cityLighting;
      let root = l.group;
      while (root.parent) root = root.parent;
      let radhuset: O | null = null;
      root.traverse((o) => {
        if (o.name === 'radhuset') radhuset = o;
      });
      if (!radhuset) return null;
      const r = radhuset as O;
      // Highest point of the model, and any other mesh reaching above 60 m within 25 m of the tower.
      const topOf = (o: O) => {
        const g = o.geometry!;
        g.computeBoundingBox();
        const box = (
          g.boundingBox as {
            clone(): {
              applyMatrix4(m: unknown): {
                max: { x: number; y: number; z: number };
                min: { x: number; y: number; z: number };
              };
            };
          }
        )
          .clone()
          .applyMatrix4(o.matrixWorld);
        return box;
      };
      let top = -Infinity;
      for (const c of r.children) top = Math.max(top, topOf(c).max.y * metres);
      const intruders: string[] = [];
      root.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
        let p: O | null = o;
        while (p && p !== r) p = p.parent;
        if (p === r) return;
        const box = topOf(o);
        const cx = Math.max(box.min.x, Math.min(centre[0], box.max.x)),
          cz = Math.max(box.min.z, Math.min(centre[1], box.max.z));
        const near = Math.hypot(cx - centre[0], cz - centre[1]) * metres < 25;
        // Ground-spanning city layers (terrain, buildings) have huge boxes; their top is far lower.
        if (near && box.max.y * metres > 60 && (box.max.x - box.min.x) * metres < 2000)
          intruders.push(o.name || '(unnamed)');
      });
      return { children: r.children.length, top, intruders };
    },
    { centre: [ox, oz], metres: M },
  );
  expect(found).not.toBeNull();
  expect(found!.children).toBe(5);
  expect(found!.top).toBeCloseTo(lidar.tower.topRH2000, 1);
  expect(found!.intruders).toEqual([]);

  // Camera on Tyska torget looking at the tower (north-square view of the evidence captures).
  const look = async () => {
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
      { c: scene(-25, 95, 22), t: scene(0, -10, 36) },
    );
    await page.waitForTimeout(600);
    await frames(page);
  };
  /** Screen position (map panel pixels) of a building-frame point. */
  const project = (p: number[]) =>
    page.evaluate((p) => {
      const { camera } = (
        globalThis as unknown as {
          __cityCamera: {
            camera: {
              position: unknown;
              matrixWorldInverse: unknown;
              projectionMatrix: unknown;
              updateMatrixWorld(): void;
            } & { constructor: unknown };
          };
        }
      ).__cityCamera;
      camera.updateMatrixWorld();
      const v = (
        camera.position as {
          clone(): {
            set(x: number, y: number, z: number): { project(c: unknown): { x: number; y: number } };
          };
        }
      )
        .clone()
        .set(p[0], p[1], p[2])
        .project(camera);
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
  await look();
  // On the shaft's north face between the bands at 37.7 and 42.2 m vs the sky 16 m beside the tower.
  const shaft = await project(scene(-2.5, 5.0, 40)),
    sky = await project(scene(-18.5, 5.0, 64));
  const png = await page.locator('.map-panel').screenshot();
  const shaftLuma = await luma(png, shaft.x, shaft.y),
    skyLuma = await luma(png, sky.x, sky.y);
  expect(skyLuma - shaftLuma).toBeGreaterThan(60);

  const programs = () =>
    page.evaluate(
      () =>
        (
          globalThis as unknown as { __cityLighting: { describe(): { programs: number } } }
        ).__cityLighting.describe().programs,
    );
  const dayPrograms = await programs();
  await setTime(page, 1290);
  await page.waitForTimeout(800);
  await frames(page);
  expect(await programs()).toBe(dayPrograms);
  expect(dayPrograms).toBe(20);
  expect(errors).toEqual([]);
});
