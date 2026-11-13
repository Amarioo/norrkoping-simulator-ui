import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Vehicle Lights Phase F2: at night a followed tram and a followed train light the track in front of
// them (beam on vs off, same frame otherwise), like the cars and buses of Phase F1; the beams cost no
// shader programs and are off by day. Needs the backend (isolated copy, API_TARGET → port 8095).
type Pose = { id: number; kind: string; x: number; y: number; z: number; heading: number };
type State = {
  artificial: number;
  programs: number;
  realtimeLights: Record<string, number>;
  vehicleLights: {
    enabled: boolean;
    max: number;
    active: number;
    selected: { id: number; kind: string; distanceM: number; weight: number }[];
  };
};
const hook = 'globalThis.__cityLighting';
const call = <T>(page: Page, expr: string) => page.evaluate((e) => (0, eval)(e) as T, expr);
const state = (page: Page) =>
  call<State>(
    page,
    `(() => { const l = ${hook}; const d = l.describe(); return { artificial: d.artificial, programs: d.programs, realtimeLights: d.realtimeLights, vehicleLights: d.vehicleLights }; })()`,
  );
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
/** Mean luma of a square (side 2·half px) around a point of the map panel screenshot. */
const luma = (page: Page, png: Buffer, cx: number, cy: number, half: number) =>
  page.evaluate(
    async ({ b64, cx, cy, half }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const x0 = Math.max(0, Math.round(cx - half)),
        y0 = Math.max(0, Math.round(cy - half));
      const w = Math.min(img.width - x0, 2 * half),
        h = Math.min(img.height - y0, 2 * half);
      const d = g.getImageData(x0, y0, w, h).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4)
        s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    },
    { b64: png.toString('base64'), cx, cy, half },
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
/** Lens front of the leading section from its centre, metres (vehicleLights.ts VEHICLE_LAMPS). */
const LAMP_FRONT = { tram: 6.12 / 2 + 0.085, train: 19.5 / 2 + 0.085 } as const;
const normal = {
  compact: 100,
  estate: 60,
  trucks: 20,
  buses: 12,
  trams: 8,
  trains: 2,
  flights: true,
  timeScale: 3,
};

test('Phase F2 rail lights: beam in front of a followed tram and train at night, off by day, no new programs', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await request.post('/api/simulator/settings', {
      data: {
        compact: 10,
        estate: 0,
        trucks: 0,
        buses: 0,
        trams: 4,
        trains: 2,
        flights: false,
        timeScale: 3,
      },
    });
    await request.post('/api/simulator/reset', { data: {} });
    await request.post('/api/simulator/pause', { data: { paused: true } });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/?date=2026-10-21&time=21:30&stadium=off');
    await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
    await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
    await page.locator('.label-toggle input').uncheck();
    // Every tram and train reports one pose (its leading section), next to the cars.
    await expect
      .poll(
        async () => {
          const poses = await call<Pose[]>(page, `${hook}.vehiclePoses()`);
          return ['compact', 'tram', 'train'].map(
            (kind) => poses.filter((p) => p.kind === kind).length,
          );
        },
        { timeout: 30000 },
      )
      .toEqual([10, 4, 2]);
    const poses = await call<Pose[]>(page, `${hook}.vehiclePoses()`);
    const results: Record<string, unknown> = {};
    let programs = 0;

    for (const kind of ['tram', 'train'] as const) {
      const vehicle = poses.filter((p) => p.kind === kind).sort((a, b) => a.id - b.id)[0];
      await page.selectOption('#vehicle-select', String(vehicle.id));
      await page.getByRole('button', { name: /Följ fordonet/ }).click();
      await expect(page.locator('.map-status')).toContainText('FÖLJER FORDON');
      await page.getByRole('button', { name: 'Stäng fordonsdetaljer' }).click();
      await page.waitForTimeout(5000);
      await call(page, `${hook}.settle()`);
      await frames(page);

      // The followed rail vehicle has a full-strength beam; no real-time lights exist.
      const night = await state(page);
      expect(night.artificial).toBe(1);
      expect(night.vehicleLights.enabled).toBe(true);
      expect(night.vehicleLights.max).toBe(16);
      const own = night.vehicleLights.selected.find((s) => s.id === vehicle.id);
      expect(own).toBeTruthy();
      expect(own!.kind).toBe(kind);
      expect(own!.weight).toBe(1);
      expect(night.realtimeLights).toMatchObject({ point: 0, spot: 0, shadowMaps: 0 });
      programs ||= night.programs;
      expect(night.programs).toBe(programs);

      // Screen point on the track 12 m ahead of the nose, in map-panel screenshot pixels.
      const target = await page.evaluate(
        ({ id, ahead }) => {
          const g = globalThis as any;
          const p = g.__cityLighting.vehiclePoses().find((v: Pose) => v.id === id);
          const { camera } = g.__cityCamera;
          const v = camera.position.clone();
          v.set(
            p.x + (Math.sin(p.heading) * ahead) / 25,
            p.y,
            p.z + (Math.cos(p.heading) * ahead) / 25,
          );
          v.project(camera);
          const canvas = document.querySelector('.map-panel canvas')!.getBoundingClientRect();
          const panel = document.querySelector('.map-panel')!.getBoundingClientRect();
          return {
            x: canvas.left - panel.left + ((v.x + 1) / 2) * canvas.width,
            y: canvas.top - panel.top + ((1 - v.y) / 2) * canvas.height,
            inView: Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 && v.z < 1,
          };
        },
        { id: vehicle.id, ahead: LAMP_FRONT[kind] + 12 },
      );
      expect(target.inView).toBe(true);
      const shot = async () => {
        await frames(page);
        return page.locator('.map-panel').screenshot();
      };
      const on = await shot();
      const onAgain = await shot();
      await call(page, `${hook}.setVehicleBeams(false)`);
      const off = await shot();
      const offState = await state(page);
      await call(page, `${hook}.setVehicleBeams(true)`);
      const back = await shot();
      const lumaOn = await luma(page, on, target.x, target.y, 30),
        lumaOff = await luma(page, off, target.x, target.y, 30),
        lumaBack = await luma(page, back, target.x, target.y, 30);
      // Brighter track in front of the vehicle with its beam; the frame is otherwise stable.
      expect(lumaOn).toBeGreaterThan(lumaOff * 1.25 + 4);
      expect(Math.abs(lumaBack - lumaOn)).toBeLessThan(1.5);
      expect(Math.abs((await luma(page, onAgain, target.x, target.y, 30)) - lumaOn)).toBeLessThan(
        1.5,
      );
      // Switching the beams (count 0 ↔ n) creates no shader program.
      expect(offState.vehicleLights.active).toBe(0);
      expect(offState.programs).toBe(programs);
      expect((await state(page)).programs).toBe(programs);

      fs.mkdirSync('test-results/rail-lights-f2', { recursive: true });
      fs.writeFileSync(`test-results/rail-lights-f2/${kind}-beam-on.png`, on);
      fs.writeFileSync(`test-results/rail-lights-f2/${kind}-beam-off.png`, off);
      results[kind] = { vehicle, target, night, luma: { lumaOn, lumaOff, lumaBack } };
    }

    // By day the beams are off (count 0) and still no new program.
    await setTime(page, 12 * 60);
    await call(page, `${hook}.settle()`);
    await frames(page);
    const day = await state(page);
    expect(day.artificial).toBe(0);
    expect(day.vehicleLights.active).toBe(0);
    expect(day.programs).toBe(programs);
    results.day = day;

    fs.writeFileSync('test-results/rail-lights-f2/e2e.json', JSON.stringify(results, null, 1));
    expect(errors).toEqual([]);
  } finally {
    // Restore the normal initial scene (as tests/simulation.spec.ts does).
    await request.post('/api/simulator/settings', { data: normal });
    await request.post('/api/simulator/reset', { data: {} });
    await request.post('/api/simulator/pause', { data: { paused: false } });
  }
});
