import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Step 6: time of day, presets, floodlights and pilot views (dev server: __cityLighting is DEV-only).
type Lighting = {
  settle(): void;
  describe(): {
    date: string;
    elevation: number;
    artificial: number;
    stadium: string;
    floodlights: { masts: number; roofs: number };
    programs: number;
    realtimeLights: Record<string, number>;
    grid: { overflow: number; maxPerCell: number };
    fixtures: number;
  };
};
const describe = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const l = (globalThis as unknown as { __cityLighting: Lighting }).__cityLighting;
    l.settle();
    return l.describe();
  });

const setTime = (page: import('@playwright/test').Page, minutes: number) =>
  page.$eval(
    '#light-time',
    (el, v) => {
      (el as HTMLInputElement).value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    minutes,
  );

test('time of day, presets and independent floodlights work without shader recompiles', async ({
  page,
  request,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // No vehicles: models first drawn later would compile programs unrelated to lighting.
  await request.post('/api/simulator/settings', {
    data: {
      compact: 0,
      estate: 0,
      trucks: 0,
      buses: 0,
      trams: 0,
      trains: 0,
      flights: false,
      timeScale: 3,
    },
  });
  await request.post('/api/simulator/reset', { data: {} });
  await page.goto('/?date=2026-10-21&time=12:39&stadium=off');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  await expect(page.locator('.lighting-card')).toBeVisible();
  const elevation = async () =>
    Number(await page.locator('[data-sun-elevation]').getAttribute('data-sun-elevation'));
  expect(await elevation()).toBeCloseTo(20.7, 0);
  let d = await describe(page);
  expect(d.artificial).toBe(0);
  expect(d.realtimeLights).toEqual({
    directional: 1,
    hemisphere: 1,
    ambient: 1,
    point: 0,
    spot: 0,
    shadowMaps: 0,
  });
  expect(d.fixtures).toBeGreaterThan(100);
  expect(d.grid.overflow).toBe(0);

  // Presets come from the sun on this date.
  await page.locator('[data-preset="sunset"]').click();
  expect(await elevation()).toBeCloseTo(-0.83, 1);
  await page.locator('[data-preset="twilight"]').click();
  expect(await elevation()).toBeCloseTo(-3, 1);
  await page.locator('[data-preset="night"]').click();
  expect(await elevation()).toBeLessThan(-40); // solar midnight, 00:40 on the next day
  await expect(page.locator('#light-date')).toHaveValue('2026-10-22');
  d = await describe(page);
  expect(d.artificial).toBe(1);
  expect(d.stadium).toBe('off');
  expect(d.floodlights).toEqual({ masts: 0, roofs: 0 });

  // Visit the pilot views so every program is compiled, then count programs.
  for (const view of ['kungsgatan', 'stromparken', 'idrottsparkenPitch', 'parken']) {
    await page.selectOption('#city-focus', view);
    await page.waitForTimeout(1200);
  }
  const programs = (await describe(page)).programs;
  expect(programs).toBeGreaterThan(5);

  // Floodlights are independent of the time; toggling and time scrubbing compile nothing new.
  for (const mode of ['event', 'training', 'off', 'event']) {
    await page.selectOption('#stadium-lights', mode);
    await page.waitForTimeout(300);
  }
  for (let m = 0; m < 1440; m += 60) await setTime(page, m);
  d = await describe(page);
  expect(d.stadium).toBe('event');
  expect(d.floodlights).toEqual({ masts: 1, roofs: 1 });
  expect(d.programs).toBe(programs);
  await page.locator('[data-preset="day"]').click();
  d = await describe(page);
  expect(d.artificial).toBe(0);
  expect(d.floodlights).toEqual({ masts: 1, roofs: 1 }); // a daytime match keeps its floodlights
  expect(d.programs).toBe(programs);

  // Time-lapse rolls over midnight into the next date.
  await setTime(page, 1438);
  await page.selectOption('#light-play', '600');
  await expect(page.locator('#light-date')).toHaveValue('2026-10-23', { timeout: 5000 });
  await page.selectOption('#light-play', '0');
  expect(errors).toEqual([]);
});

test('stadium and lighting recover after WebGL context loss', async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?date=2026-10-21&time=21:30&stadium=event');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  await page.selectOption('#city-focus', 'parken');
  await page.waitForTimeout(2500);
  await describe(page);
  await page.evaluate(async () => {
    const canvas = document.querySelector('.map-panel canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context required for this regression test');
    const lost = new Promise<void>((resolve) =>
      canvas.addEventListener('webglcontextlost', () => resolve(), { once: true }),
    );
    const restored = new Promise<void>((resolve) =>
      canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true }),
    );
    extension.loseContext();
    await lost;
    await new Promise((resolve) => setTimeout(resolve, 200));
    extension.restoreContext();
    await restored;
  });
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
  const d = await describe(page);
  expect(d.stadium).toBe('event');
  expect(d.programs).toBeGreaterThan(5);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __cityPerformance: { triangles: number } }).__cityPerformance
            .triangles,
      ),
    )
    .toBeGreaterThan(500000);
});

// Lighting Phase 0: real-scene lifecycle. Ten complete street-lighting rebuilds (atomic swaps), ten
// full controller recreations (shared scene materials rebound to the new uniforms) and a WebGL
// context loss/restore on the live map. GPU resource counts must return to their plateau, no shader
// program may be added, and the rendered night view must stay pixel-identical. Traffic is disabled
// (API aborted) so the frame is static.
test('street lighting survives rebuilds, controller recreation and context restoration', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (route) => route.abort());
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/?date=2026-10-21&time=21:30&stadium=event');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  type Hooks = {
    settle(): void;
    describe(): {
      fixtures: number;
      programs: number;
      reboundMaterials: number;
      streetLighting: { status: string; builds: number };
    };
    recreate(): unknown;
    reloadStreetLighting(): boolean;
    renderer: { info: { memory: { geometries: number; textures: number }; programs: unknown[] } };
  };
  const pose = async () =>
    page.evaluate(() => {
      const { camera, controls } = (globalThis as any).__cityCamera;
      camera.position.fromArray([-21.86, 0.8894, -6.4]); // docs/step6/poses.json kungsgatan-street
      controls.target.fromArray([-23.3, 0.7587, -11.5]);
      controls.update();
      (globalThis as any).__cityLighting.settle();
    });
  const frames = (n = 4) =>
    page.evaluate(
      (k) =>
        new Promise<void>((resolve) => {
          const step = (i: number) => (i ? requestAnimationFrame(() => step(i - 1)) : resolve());
          step(k);
        }),
      n,
    );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('Performance.enable');
  const heapMB = async () => {
    for (let i = 0; i < 2; i++) await cdp.send('HeapProfiler.collectGarbage');
    const m = await cdp.send('Performance.getMetrics');
    return m.metrics.find((x) => x.name === 'JSHeapUsedSize')!.value / 1e6;
  };
  const resources = async () => ({
    ...(await page.evaluate(() => {
      const l = (globalThis as unknown as { __cityLighting: Hooks }).__cityLighting;
      const d = l.describe();
      return {
        geometries: l.renderer.info.memory.geometries,
        textures: l.renderer.info.memory.textures,
        programs: l.renderer.info.programs.length,
        fixtures: d.fixtures,
        rebound: d.reboundMaterials,
        status: d.streetLighting.status,
      };
    })),
    heapMB: await heapMB(),
  });
  const shot = async () => {
    await pose();
    await page.waitForTimeout(800);
    await frames();
    return page.locator('.map-panel').screenshot();
  };
  await pose();
  await page.waitForTimeout(3000);
  const before = await shot();
  const base = await resources();
  expect(base).toMatchObject({ fixtures: 105, status: 'ok' });
  const series: Awaited<ReturnType<typeof resources>>[] = [];
  for (let i = 0; i < 10; i++) {
    expect(
      await page.evaluate(() =>
        (globalThis as unknown as { __cityLighting: Hooks }).__cityLighting.reloadStreetLighting(),
      ),
    ).toBe(true);
    await frames();
    series.push(await resources());
  }
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() =>
      (globalThis as unknown as { __cityLighting: Hooks }).__cityLighting.recreate(),
    );
    await frames();
    series.push(await resources());
  }
  fs.mkdirSync('test-results/lighting-phase0', { recursive: true });
  fs.writeFileSync(
    'test-results/lighting-phase0/lifecycle-series.json',
    JSON.stringify({ base, series }, null, 1),
  );
  // Plateau: every cycle ends with the same GPU object counts as the first cycle, never above the
  // start (the initial precompile also uploaded geometry of detail-hidden fixture meshes, which a
  // rebuilt set uploads only when drawn), and no program is added.
  for (const s of series) {
    expect(s.geometries).toBe(series[0].geometries);
    expect(s.textures).toBe(series[0].textures);
    expect(s.geometries).toBeLessThanOrEqual(base.geometries);
    expect(s.textures).toBeLessThanOrEqual(base.textures);
    expect(s.programs).toBe(base.programs);
    expect(s.fixtures).toBe(105);
  }
  // Post-GC JS heap: no growth trend across the 20 cycles (first vs last cycle within 2 MB).
  expect(Math.abs(series.at(-1)!.heapMB - series[0].heapMB)).toBeLessThan(2);
  // The recreated controller rebound the shared map/stadium materials patched by its predecessor.
  expect(series.at(-1)!.rebound).toBeGreaterThan(100);
  const afterCycles = await shot();
  expect(afterCycles.equals(before)).toBe(true);
  await page.evaluate(async () => {
    const canvas = document.querySelector('.map-panel canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context')!;
    const lost = new Promise((r) => canvas.addEventListener('webglcontextlost', r, { once: true }));
    const restored = new Promise((r) =>
      canvas.addEventListener('webglcontextrestored', r, { once: true }),
    );
    extension.loseContext();
    await lost;
    await new Promise((r) => setTimeout(r, 200));
    extension.restoreContext();
    await restored;
  });
  await page.waitForTimeout(3000);
  const afterRestore = await shot();
  expect(afterRestore.equals(before)).toBe(true);
  expect((await resources()).status).toBe('ok');
  fs.mkdirSync('test-results/lighting-phase0', { recursive: true });
  fs.writeFileSync(
    'test-results/lighting-phase0/lifecycle.json',
    JSON.stringify({ base, series, afterRestore: await resources() }, null, 1),
  );
  expect(errors).toEqual([]);
});
