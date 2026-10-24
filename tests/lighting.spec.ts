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
  expect(base).toMatchObject({ fixtures: 273, status: 'ok' }); // pilot 105 + Phase A1 127 + A2 35 + A3 6
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
    expect(s.fixtures).toBe(273);
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

// Lighting Phase A1: the central corridor on the live map. Complete set swaps (pilot only ↔ the runtime
// set, since Phase A3 pilot + A1 + A2 + A3) return to a resource plateau without new programs; a rejected (overflowing) set leaves the
// rendered frame byte-identical; the corridor really lights the ground (measured brightness, pilot-only
// vs pilot + A1 at the same pose); the expanded set survives recreation and context restoration.
test('Phase A1 corridor: illumination, set swaps, rejection, recreation and context restoration', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (route) => route.abort());
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/?date=2026-10-21&time=21:30&stadium=off');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  const hook = 'globalThis.__cityLighting';
  const call = <T>(expr: string) => page.evaluate((e) => (0, eval)(e) as T, expr);
  const pose = () =>
    page.evaluate(() => {
      const { camera, controls } = (globalThis as any).__cityCamera;
      camera.position.fromArray([-3.0, 2.4, -18.0]); // scripts/lighting-a1/poses.json drottninggatan-elevated
      controls.target.fromArray([-7.2, 0.1, -23.8]);
      controls.update();
      (globalThis as any).__cityLighting.settle();
    });
  const frames = () =>
    page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          ),
        ),
    );
  const shot = async () => {
    await pose();
    await page.waitForTimeout(800);
    await frames();
    return page.locator('.map-panel').screenshot();
  };
  /** Mean sRGB luma (0–255) of a PNG, decoded in the page. */
  const luma = (png: Buffer) =>
    page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4)
        s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    }, png.toString('base64'));
  const state = () =>
    call<{
      fixtures: number;
      status: string;
      rollouts: Record<string, unknown>;
      max: number;
      geometries: number;
      textures: number;
      programs: number;
    }>(
      `(() => { const l = ${hook}; const d = l.describe(); return { fixtures: d.fixtures, status: d.streetLighting.status, rollouts: d.streetLighting.rollouts, max: d.streetLighting.index.maxRawOccupancy, geometries: l.renderer.info.memory.geometries, textures: l.renderer.info.memory.textures, programs: l.renderer.info.programs.length }; })()`,
    );
  await pose();
  await page.waitForTimeout(3000);
  const full = await shot();
  const start = await state();
  expect(start).toMatchObject({ fixtures: 273, status: 'ok' });
  expect(start.max).toBeLessThanOrEqual(16);
  expect(start.rollouts).toEqual({
    'lighting-a1-v1': { mapped: 10, estimated: 117 },
    'lighting-a2-v1': { mapped: 0, estimated: 35 },
    'lighting-a3-v1': { mapped: 0, estimated: 6 },
    'step6-pilot-v1': { mapped: 10, estimated: 95 },
  });
  // Pilot only: the corridor goes dark (no ambient compensation), and comes back with the A1 set.
  const swaps: Awaited<ReturnType<typeof state>>[] = [];
  let pilotOnly: Buffer | null = null;
  for (let i = 0; i < 6; i++) {
    const kind = i % 2 ? 'runtime' : 'pilot';
    expect(
      await call<{ ok: boolean }>(`${hook}.replaceStreetLighting(${hook}.registries.${kind}())`),
    ).toEqual({ ok: true });
    await frames();
    swaps.push(await state());
    if (kind === 'pilot' && !pilotOnly) pilotOnly = await shot();
  }
  for (const [i, s] of swaps.entries()) {
    expect(s.fixtures).toBe(i % 2 ? 273 : 105);
    // Never a new program. A rebuilt set's halo program compiles when a halo is first drawn: with the
    // pilot only, no halo is in this view (19 programs); with A1 in view it is back to the start.
    expect(s.programs).toBeLessThanOrEqual(start.programs);
    if (i % 2) expect(s.programs).toBe(start.programs);
    if (i >= 2) {
      expect(s.geometries).toBe(swaps[i - 2].geometries);
      expect(s.textures).toBe(swaps[i - 2].textures);
    }
  }
  const lit = await luma(full),
    dark = await luma(pilotOnly!);
  expect(lit).toBeGreaterThan(dark * 1.15);
  expect((await shot()).equals(full)).toBe(true);
  // A rejected set (33 = MAX_PER_CELL + 1 lamps in one corridor cell, Phase L1) changes nothing on screen.
  const rejected = await call<{ ok: boolean; stage: string }>(`(() => {
    const r = ${hook}.registries.runtime();
    const f = r.fixtures.find((x) => x.id.startsWith('estimate:lighting-a1-v1'));
    const crowd = Array.from({ length: 33 }, (_, k) => ({ ...f, id: 'estimate:lighting-a1-v1:e2e/' + k, runtimeId: 'estimate:lighting-a1-v1:e2e/' + k }));
    return ${hook}.replaceStreetLighting({ ...r, fixtures: [...r.fixtures, ...crowd] });
  })()`);
  expect(rejected).toMatchObject({ ok: false, stage: 'capacity' });
  expect((await state()).status).toBe('rendering-previous');
  expect((await shot()).equals(full)).toBe(true);
  // Recreation and WebGL context restoration with the expanded set.
  await call(`${hook}.recreate()`);
  await frames();
  expect((await shot()).equals(full)).toBe(true);
  await page.evaluate(async () => {
    const canvas = document.querySelector('.map-panel canvas') as HTMLCanvasElement;
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
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
  expect((await shot()).equals(full)).toBe(true);
  // After restoration only the programs this view needs are recompiled (never more than at start).
  const restoredState = await state();
  expect(restoredState).toMatchObject({ fixtures: 273, status: 'ok' });
  expect(restoredState.programs).toBeLessThanOrEqual(start.programs);
  fs.mkdirSync('test-results/lighting-a1', { recursive: true });
  fs.writeFileSync(
    'test-results/lighting-a1/e2e.json',
    JSON.stringify({ start, swaps, luma: { lit, dark } }, null, 1),
  );
  expect(errors).toEqual([]);
});

// Lighting Phase A2: western Norra Promenaden + northern Kungsgatan on the live map. Complete swaps
// between the accepted A1 state (pilot + A1) and pilot + A1 + A2 return to a resource plateau without
// new programs; A2 really lights the ground at the Kungsgatan pose (measured brightness, no ambient
// change); a view facing away from A2 is byte-identical with and without A2; a rejected set changes
// nothing; the combined set survives recreation and context restoration.
test('Phase A2 corridor: illumination, unchanged reference view, swaps, rejection, recreation and context restoration', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (route) => route.abort());
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/?date=2026-10-21&time=21:30&stadium=off');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  const hook = 'globalThis.__cityLighting';
  const call = <T>(expr: string) => page.evaluate((e) => (0, eval)(e) as T, expr);
  // scripts/lighting-a2/poses.json a2-kungsgatan-north-elevated; the reference view looks south over
  // Strömparken with the A2 corridor behind the camera.
  const POSES = {
    a2: { position: [-21.8, 2.6, -12.8], target: [-25.4, 0.35, -19.5] },
    away: { position: [-8.0, 1.5, -6.0], target: [-6.0, 0.3, 0.0] },
  };
  const pose = (p: { position: number[]; target: number[] }) =>
    page.evaluate((p) => {
      const { camera, controls } = (globalThis as any).__cityCamera;
      camera.position.fromArray(p.position);
      controls.target.fromArray(p.target);
      controls.update();
      (globalThis as any).__cityLighting.settle();
    }, p);
  const frames = () =>
    page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          ),
        ),
    );
  const shot = async (p = POSES.a2) => {
    await pose(p);
    await page.waitForTimeout(800);
    await frames();
    return page.locator('.map-panel').screenshot();
  };
  const luma = (png: Buffer) =>
    page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4)
        s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    }, png.toString('base64'));
  const state = () =>
    call<{
      fixtures: number;
      status: string;
      rollouts: Record<string, unknown>;
      max: number;
      pages: number;
      geometries: number;
      textures: number;
      programs: number;
    }>(
      `(() => { const l = ${hook}; const d = l.describe(); return { fixtures: d.fixtures, status: d.streetLighting.status, rollouts: d.streetLighting.rollouts, max: d.streetLighting.index.maxRawOccupancy, pages: d.streetLighting.index.pages.allocated, geometries: l.renderer.info.memory.geometries, textures: l.renderer.info.memory.textures, programs: l.renderer.info.programs.length }; })()`,
    );
  const swap = (kind: 'a1Runtime' | 'runtime') =>
    call<{ ok: boolean }>(`${hook}.replaceStreetLighting(${hook}.registries.${kind}())`);
  await pose(POSES.a2);
  await page.waitForTimeout(3000);
  const full = await shot();
  const awayFull = await shot(POSES.away);
  const start = await state();
  // Since Phase A3 the runtime set also holds A3 (6 ring brackets; +3 index pages).
  expect(start).toMatchObject({ fixtures: 273, status: 'ok', max: 15, pages: 72 });
  expect(start.rollouts).toEqual({
    'lighting-a1-v1': { mapped: 10, estimated: 117 },
    'lighting-a2-v1': { mapped: 0, estimated: 35 },
    'lighting-a3-v1': { mapped: 0, estimated: 6 },
    'step6-pilot-v1': { mapped: 10, estimated: 95 },
  });
  const swaps: Awaited<ReturnType<typeof state>>[] = [];
  let a1Only: Buffer | null = null,
    awayA1: Buffer | null = null;
  for (let i = 0; i < 6; i++) {
    const kind = i % 2 ? 'runtime' : 'a1Runtime';
    expect(await swap(kind)).toEqual({ ok: true });
    await frames();
    // The same pose sequence on every swap, so GPU object counts compare like for like.
    const away = await shot(POSES.away);
    const here = await shot();
    if (kind === 'a1Runtime' && !a1Only) {
      a1Only = here;
      awayA1 = away;
    }
    swaps.push(await state());
  }
  for (const [i, s] of swaps.entries()) {
    expect(s.fixtures).toBe(i % 2 ? 273 : 232);
    expect(s.programs).toBeLessThanOrEqual(start.programs);
    if (i >= 2) {
      expect(s.geometries).toBe(swaps[i - 2].geometries);
      expect(s.textures).toBe(swaps[i - 2].textures);
    }
  }
  // A2 lights the street (no ambient or exposure change); the view facing away is unchanged.
  const lit = await luma(full),
    dark = await luma(a1Only!);
  expect(lit).toBeGreaterThan(dark * 1.15);
  expect(awayA1!.equals(awayFull)).toBe(true);
  expect((await shot()).equals(full)).toBe(true);
  // A rejected set (33 = MAX_PER_CELL + 1 lamps in one A2 cell, Phase L1) changes nothing on screen.
  const rejected = await call<{ ok: boolean; stage: string }>(`(() => {
    const r = ${hook}.registries.runtime();
    const f = r.fixtures.find((x) => x.id.startsWith('estimate:lighting-a2-v1'));
    const crowd = Array.from({ length: 33 }, (_, k) => ({ ...f, id: 'estimate:lighting-a2-v1:e2e/' + k, runtimeId: 'estimate:lighting-a2-v1:e2e/' + k }));
    return ${hook}.replaceStreetLighting({ ...r, fixtures: [...r.fixtures, ...crowd] });
  })()`);
  expect(rejected).toMatchObject({ ok: false, stage: 'capacity' });
  expect((await state()).status).toBe('rendering-previous');
  expect((await shot()).equals(full)).toBe(true);
  // Recreation and WebGL context restoration with the combined set.
  await call(`${hook}.recreate()`);
  await frames();
  expect((await shot()).equals(full)).toBe(true);
  await page.evaluate(async () => {
    const canvas = document.querySelector('.map-panel canvas') as HTMLCanvasElement;
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
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
  expect((await shot()).equals(full)).toBe(true);
  const restoredState = await state();
  expect(restoredState).toMatchObject({ fixtures: 273, status: 'ok' });
  expect(restoredState.programs).toBeLessThanOrEqual(start.programs);
  fs.mkdirSync('test-results/lighting-a2', { recursive: true });
  fs.writeFileSync(
    'test-results/lighting-a2/e2e.json',
    JSON.stringify({ start, swaps, restoredState, luma: { lit, dark } }, null, 1),
  );
  expect(errors).toEqual([]);
});

// Lighting Phase A3: the rest of the Kungstorget ring on the live map. Complete swaps between the
// accepted A2 state (pilot + A1 + A2) and pilot + A1 + A2 + A3 return to a resource plateau without new
// programs; A3 really lights the ring (measured brightness at the overhead ring pose, no ambient
// change); a view facing away from A3 is byte-identical with and without A3; a rejected set changes
// nothing; the combined set survives recreation and context restoration.
test('Phase A3 Kungstorget ring: illumination, unchanged reference view, swaps, rejection, recreation and context restoration', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (route) => route.abort());
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/?date=2026-10-21&time=21:30&stadium=off');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  const hook = 'globalThis.__cityLighting';
  const call = <T>(expr: string) => page.evaluate((e) => (0, eval)(e) as T, expr);
  // scripts/lighting-a3/poses.json a3-ring-overhead; the reference view looks south over Strömparken
  // with the ring behind the camera (the A2 test's reference view).
  const POSES = {
    a3: { position: [-28.4, 6.0, -19.2], target: [-28.5, 0.45, -22.1] },
    away: { position: [-8.0, 1.5, -6.0], target: [-6.0, 0.3, 0.0] },
  };
  const pose = (p: { position: number[]; target: number[] }) =>
    page.evaluate((p) => {
      const { camera, controls } = (globalThis as any).__cityCamera;
      camera.position.fromArray(p.position);
      controls.target.fromArray(p.target);
      controls.update();
      (globalThis as any).__cityLighting.settle();
    }, p);
  const frames = () =>
    page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          ),
        ),
    );
  const shot = async (p = POSES.a3) => {
    await pose(p);
    await page.waitForTimeout(800);
    await frames();
    return page.locator('.map-panel').screenshot();
  };
  const luma = (png: Buffer) =>
    page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4)
        s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    }, png.toString('base64'));
  const state = () =>
    call<{
      fixtures: number;
      status: string;
      rollouts: Record<string, unknown>;
      max: number;
      pages: number;
      geometries: number;
      textures: number;
      programs: number;
    }>(
      `(() => { const l = ${hook}; const d = l.describe(); return { fixtures: d.fixtures, status: d.streetLighting.status, rollouts: d.streetLighting.rollouts, max: d.streetLighting.index.maxRawOccupancy, pages: d.streetLighting.index.pages.allocated, geometries: l.renderer.info.memory.geometries, textures: l.renderer.info.memory.textures, programs: l.renderer.info.programs.length }; })()`,
    );
  const swap = (kind: 'a2Runtime' | 'runtime') =>
    call<{ ok: boolean }>(`${hook}.replaceStreetLighting(${hook}.registries.${kind}())`);
  await pose(POSES.a3);
  await page.waitForTimeout(3000);
  const full = await shot();
  const awayFull = await shot(POSES.away);
  const start = await state();
  expect(start).toMatchObject({ fixtures: 273, status: 'ok', max: 15, pages: 72 });
  expect(start.rollouts).toEqual({
    'lighting-a1-v1': { mapped: 10, estimated: 117 },
    'lighting-a2-v1': { mapped: 0, estimated: 35 },
    'lighting-a3-v1': { mapped: 0, estimated: 6 },
    'step6-pilot-v1': { mapped: 10, estimated: 95 },
  });
  const swaps: Awaited<ReturnType<typeof state>>[] = [];
  let a2Only: Buffer | null = null,
    awayA2: Buffer | null = null;
  for (let i = 0; i < 6; i++) {
    const kind = i % 2 ? 'runtime' : 'a2Runtime';
    expect(await swap(kind)).toEqual({ ok: true });
    await frames();
    // The same pose sequence on every swap, so GPU object counts compare like for like.
    const away = await shot(POSES.away);
    const here = await shot();
    if (kind === 'a2Runtime' && !a2Only) {
      a2Only = here;
      awayA2 = away;
    }
    swaps.push(await state());
  }
  for (const [i, s] of swaps.entries()) {
    expect(s.fixtures).toBe(i % 2 ? 273 : 267);
    expect(s.pages).toBe(i % 2 ? 72 : 69);
    expect(s.programs).toBeLessThanOrEqual(start.programs);
    if (i >= 2) {
      expect(s.geometries).toBe(swaps[i - 2].geometries);
      expect(s.textures).toBe(swaps[i - 2].textures);
    }
  }
  // A3 lights the ring (no ambient or exposure change); the view facing away is unchanged.
  const lit = await luma(full),
    dark = await luma(a2Only!);
  expect(lit).toBeGreaterThan(dark * 1.15);
  expect(awayA2!.equals(awayFull)).toBe(true);
  expect((await shot()).equals(full)).toBe(true);
  // A rejected set (33 = MAX_PER_CELL + 1 lamps in one A3 cell, Phase L1) changes nothing on screen.
  const rejected = await call<{ ok: boolean; stage: string }>(`(() => {
    const r = ${hook}.registries.runtime();
    const f = r.fixtures.find((x) => x.id.startsWith('estimate:lighting-a3-v1'));
    const crowd = Array.from({ length: 33 }, (_, k) => ({ ...f, id: 'estimate:lighting-a3-v1:e2e/' + k, runtimeId: 'estimate:lighting-a3-v1:e2e/' + k }));
    return ${hook}.replaceStreetLighting({ ...r, fixtures: [...r.fixtures, ...crowd] });
  })()`);
  expect(rejected).toMatchObject({ ok: false, stage: 'capacity' });
  expect((await state()).status).toBe('rendering-previous');
  expect((await shot()).equals(full)).toBe(true);
  // Recreation and WebGL context restoration with the combined set.
  await call(`${hook}.recreate()`);
  await frames();
  expect((await shot()).equals(full)).toBe(true);
  await page.evaluate(async () => {
    const canvas = document.querySelector('.map-panel canvas') as HTMLCanvasElement;
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
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
  expect((await shot()).equals(full)).toBe(true);
  const restoredState = await state();
  expect(restoredState).toMatchObject({ fixtures: 273, status: 'ok' });
  expect(restoredState.programs).toBeLessThanOrEqual(start.programs);
  fs.mkdirSync('test-results/lighting-a3', { recursive: true });
  fs.writeFileSync(
    'test-results/lighting-a3/e2e.json',
    JSON.stringify({ start, swaps, restoredState, luma: { lit, dark } }, null, 1),
  );
  expect(errors).toEqual([]);
});
