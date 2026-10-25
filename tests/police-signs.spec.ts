import { test, expect, type Page } from '@playwright/test';

// Police Signs Phase D1: the police emblem on the police tower's SSE gable in the running app. One
// sign, self-lit at night with the street lighting's night level (brighter than the gable wall beside
// it), part of the tower's windows lit at night (staffed 24/7), no glow by day, no three.js lights
// added and the shader program count unchanged (20) by day and at night. No backend needed.
const M = 25;
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
  artificial: number;
  programs: number;
  realtimeLights: Record<string, number>;
};
const describe = (page: Page) =>
  page.evaluate(() => {
    const l = (
      globalThis as unknown as { __cityLighting: { settle(): void; describe(): Describe } }
    ).__cityLighting;
    l.settle();
    return l.describe();
  });

test('Phase D1 police sign and windows: emblem on the SSE gable, glow and lit windows at night, not by day, programs unchanged', async ({
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

  // The sign in the scene: exactly one, on the tower group, facing out of the SSE gable.
  const found = await page.evaluate((metres) => {
    type V = { x: number; y: number; z: number; toArray(): number[] };
    type O = {
      name: string;
      parent: O | null;
      position: V;
      rotation: { y: number };
      material: { emissiveIntensity: number; transparent: boolean };
      count?: number;
      updateMatrixWorld(force: boolean): void;
      localToWorld(v: V): V;
      traverse(f: (o: O) => void): void;
    };
    const l = (globalThis as unknown as { __cityLighting: { group: O } }).__cityLighting;
    let root = l.group;
    while (root.parent) root = root.parent;
    const signs: O[] = [];
    root.traverse((o) => {
      if (o.name === 'police-sign') signs.push(o);
    });
    if (signs.length !== 1) return { count: signs.length };
    const sign = signs[0];
    sign.updateMatrixWorld(true);
    const p = sign.position as unknown as { clone(): V & { set(...v: number[]): V } };
    const at = (x: number, y: number, z: number) =>
      sign.localToWorld(p.clone().set(x, y, z)).toArray();
    // Sign centre, a point on the gable wall 4.3 m to the side (sign half-width 1.3 m, drawn gable half-width 6.4 m)
    // just behind the sign's face, and a camera 70 m out of the gable, 8 m to the side.
    return {
      count: 1,
      tower: {
        x: sign.parent!.position.x,
        z: sign.parent!.position.z,
        ry: sign.parent!.rotation.y,
      },
      centre: at(0, 0, 0),
      wall: at(4.3 / metres, 0, -0.2 / metres),
      camera: at(8 / metres, 0, 70 / metres),
      emissive: sign.material.emissiveIntensity,
      transparent: sign.material.transparent,
      instances: sign.count,
    };
  }, M);
  expect(found.count).toBe(1);
  expect(found.tower).toEqual({ x: -29.25, z: -26.22, ry: 0.2775 });
  expect(found.emissive).toBe(0);
  expect(found.transparent).toBe(false);
  expect(found.instances).toBe(1);

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
    { c: found.camera!, t: found.centre! },
  );
  await page.waitForTimeout(600);
  await frames(page);
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
                  ): {
                    project(c: unknown): { x: number; y: number };
                  };
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
  /** Mean luma of a (2·half)² px square around (x, y) of a map-panel screenshot. */
  const luma = async (png: Buffer, x: number, y: number, half = 4) =>
    page.evaluate(
      async ({ b64, x, y, half }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const d = g.getImageData(
          Math.round(x) - half,
          Math.round(y) - half,
          2 * half,
          2 * half,
        ).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4)
          s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        return s / (d.length / 4);
      },
      { b64: png.toString('base64'), x, y, half },
    );
  const sign = await project(found.centre!),
    wall = await project(found.wall!);
  /** emissiveIntensity of a named object's material (`index` into a material array). */
  const emissive = (name = 'police-sign', index = 0) =>
    page.evaluate(
      ({ name, index }) => {
        const l = (globalThis as unknown as { __cityLighting: { group: { parent: unknown } } })
          .__cityLighting;
        type O = {
          name: string;
          parent: O | null;
          material: { emissiveIntensity: number } | { emissiveIntensity: number }[];
          traverse(f: (o: O) => void): void;
        };
        let root = l.group as unknown as O;
        while (root.parent) root = root.parent;
        let e = -1;
        root.traverse((o) => {
          if (o.name === name)
            e = (Array.isArray(o.material) ? o.material[index] : o.material).emissiveIntensity;
        });
        return e;
      },
      { name, index },
    );

  // Day: no glow; programs counted.
  const day = await describe(page);
  expect(day.artificial).toBe(0);
  expect(await emissive()).toBe(0);
  expect(await emissive('police-tower-slab', 0)).toBe(0);
  expect(await emissive('police-tower-slab', 1)).toBe(0);
  const dayPng = await page.locator('.map-panel').screenshot();
  const daySign = await luma(dayPng, sign.x, sign.y);

  // Night: the sign glows at the street lighting's night level and outshines the gable beside it.
  await setTime(page, 1290);
  const night = await describe(page);
  await page.waitForTimeout(400);
  await frames(page);
  expect(night.artificial).toBe(1);
  expect(await emissive()).toBeGreaterThan(0.5);
  const png = await page.locator('.map-panel').screenshot();
  const signLuma = await luma(png, sign.x, sign.y),
    wallLuma = await luma(png, wall.x, wall.y);
  console.log(
    `D1 luma: sign by day ${daySign.toFixed(1)}, at night sign ${signLuma.toFixed(1)}, wall ${wallLuma.toFixed(1)}`,
  );
  expect(signLuma - wallLuma).toBeGreaterThan(40);
  // Night picture of the sign is not darker than the sign by day (self-lit, not lit by the sun).
  expect(signLuma).toBeGreaterThan(daySign * 0.5);
  expect(night.realtimeLights).toEqual({
    directional: 1,
    hemisphere: 1,
    ambient: 1,
    point: 0,
    spot: 0,
    shadowMaps: 0,
  });
  expect(night.programs).toBe(day.programs);
  expect(day.programs).toBe(20);

  // Night: part of the tower's windows are lit (staffed 24/7), on both long façades.
  expect(await emissive('police-tower-slab', 0)).toBeGreaterThan(0.5);
  expect(await emissive('police-tower-slab', 1)).toBeGreaterThan(0.5);
  const side = await page.evaluate((metres) => {
    type V = { toArray(): number[] };
    type O = {
      name: string;
      parent: O | null;
      position: { clone(): V & { set(...v: number[]): V } };
      localToWorld(v: V): V;
      updateMatrixWorld(force: boolean): void;
      traverse(f: (o: O) => void): void;
    };
    let root = (globalThis as unknown as { __cityLighting: { group: O } }).__cityLighting.group;
    while (root.parent) root = root.parent;
    let slab: O | null = null;
    root.traverse((o) => {
      if (o.name === 'police-tower-slab') slab = o;
    });
    const s = slab as unknown as O;
    s.updateMatrixWorld(true);
    const at = (x: number, y: number, z: number) =>
      s.localToWorld(s.position.clone().set(x, y, z)).toArray();
    // The +x long façade (0.255 units from the slab axis): its centre and a camera 190 m out.
    return { centre: at(0.255, 0, 0), camera: at(0.255 + 190 / metres, 0.1, 0.8) };
  }, M);
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
    { c: side.camera, t: side.centre },
  );
  await page.waitForTimeout(600);
  await frames(page);
  const facade = await project(side.centre);
  const facadeLuma = await luma(
    await page.locator('.map-panel').screenshot(),
    facade.x,
    facade.y,
    30,
  );
  console.log(`D1 windows: mean luma of the long façade at night ${facadeLuma.toFixed(1)}`);
  expect(facadeLuma).toBeGreaterThan(10);
  expect((await describe(page)).programs).toBe(20);

  // Back to day: glow off again.
  await setTime(page, 759);
  await describe(page);
  expect(await emissive()).toBe(0);
  expect(await emissive('police-tower-slab', 0)).toBe(0);
  expect(errors).toEqual([]);
});
