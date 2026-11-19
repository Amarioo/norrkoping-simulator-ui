import fs from 'node:fs';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { AIRCRAFT_TYPES } from '../src/lib/aircraftTypes';

// Air traffic: up to six aircraft share the two runways. The backend must be one that flies the fleet
// (docs/air-traffic/README.md); the single legacy shuttle is covered by simulation.spec.ts.
const BASE = { compact: 20, estate: 10, trucks: 5, buses: 0, trams: 0, trains: 0, timeScale: 3 };
const world = async (request: APIRequestContext) =>
  (await request.get('/api/simulator/world')).json();
const ids = (count: number) => Array.from({ length: count }, (_, i) => 'NK-0' + (i + 1));

test.afterEach(async ({ request }) => {
  // The normal scene: default traffic and three aircraft.
  await request.post('/api/simulator/settings', {
    data: {
      compact: 100,
      estate: 60,
      trucks: 20,
      buses: 12,
      trams: 8,
      trains: 2,
      flights: true,
      planes: 3,
      timeScale: 3,
    },
  });
  await request.post('/api/simulator/pause', { data: { paused: false } });
});

test('the server flies the chosen number of aircraft and rejects more than six', async ({
  request,
}) => {
  for (const planes of [6, 2, 4]) {
    const res = await request.post('/api/simulator/settings', {
      data: { ...BASE, flights: true, planes },
    });
    expect(res.status()).toBe(200);
    const w = await world(request);
    expect(w.aircraft.map((a: { id: string }) => a.id)).toEqual(ids(planes));
    expect(w.settings.planes).toBe(planes);
  }
  const tooMany = await request.post('/api/simulator/settings', {
    data: { ...BASE, flights: true, planes: 7 },
  });
  expect(tooMany.status()).toBe(400);
  expect((await tooMany.json()).error).toBe('Välj högst 6 flygplan.');
  // The rejected command changed nothing.
  expect((await world(request)).aircraft.length).toBe(4);
  await request.post('/api/simulator/settings', { data: { ...BASE, flights: false, planes: 4 } });
  expect((await world(request)).aircraft.length).toBe(0);
});

test('the slider, the list of aircraft and following one of them', async ({ page, request }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post('/api/simulator/settings', { data: { ...BASE, flights: true, planes: 3 } });
  await request.post('/api/simulator/reset', { data: {} });
  await request.post('/api/simulator/pause', { data: { paused: false } });
  await page.goto('/');
  await expect(page.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' })).toBeVisible(
    { timeout: 30000 },
  );
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 120000 });
  const openTab = (name: string) => page.getByRole('tab', { name }).click();
  const rows = page.locator('.flight-row');

  // The slider shows what the city flies, and changes it.
  const slider = page.locator('#planes');
  await expect(slider).toHaveValue('3');
  await expect(slider).toBeEnabled();
  await slider.fill('5');
  await page.getByRole('button', { name: /Uppdatera trafiken/ }).click();
  await expect.poll(async () => (await world(request)).aircraft.length).toBe(5);
  await expect(page.locator('.sim-metrics')).toContainText('05');

  // The Flyg tab lists them; the card shows the first until another is chosen.
  await openTab('Flyg');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.flight-code')).toHaveText('NK-01');
  for (const [i, id] of ids(5).entries()) await expect(rows.nth(i)).toContainText(id);
  await expect(rows.nth(0)).toContainText(/NRK → F13|F13 → NRK/);
  // Air routes: every row and the card name the aircraft's type.
  const types: string[] = (await world(request)).aircraft.map((a: { type: string }) => a.type);
  for (const [i, type] of types.entries()) {
    expect(Object.keys(AIRCRAFT_TYPES)).toContain(type);
    await expect(rows.nth(i)).toContainText(AIRCRAFT_TYPES[type].short);
  }
  await expect(page.locator('.flight-type')).toHaveText(AIRCRAFT_TYPES[types[0]].name);
  await rows.nth(2).click();
  await expect(page.locator('.flight-code')).toHaveText('NK-03');
  await expect(page.locator('.flight-type')).toHaveText(AIRCRAFT_TYPES[types[2]].name);
  await expect(rows.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(rows.nth(0)).toHaveAttribute('aria-pressed', 'false');

  // Following the chosen aircraft; choosing another while following moves the camera to it.
  await page.getByRole('button', { name: 'Följ flygplanet' }).click();
  await expect(page.locator('.map-status')).toContainText('FÖLJER NK-03');
  await expect(page.getByRole('button', { name: 'Sluta följa flygplanet' })).toBeVisible();
  const target = () =>
    page.evaluate(() => {
      const t = (
        globalThis as unknown as {
          __cityCamera: { controls: { target: { x: number; y: number; z: number } } };
        }
      ).__cityCamera.controls.target;
      return [t.x, t.y, t.z];
    });
  const distanceTo = async (id: string) => {
    const a = (await world(request)).aircraft.find((p: { id: string }) => p.id === id);
    const t = await target();
    return Math.hypot(t[0] - a.pos[0], t[1] - a.pos[1], t[2] - a.pos[2]);
  };
  await expect.poll(() => distanceTo('NK-03'), { timeout: 15000 }).toBeLessThan(3);
  await rows.nth(4).click();
  await expect(page.locator('.map-status')).toContainText('FÖLJER NK-05');
  await expect.poll(() => distanceTo('NK-05'), { timeout: 15000 }).toBeLessThan(3);

  // Every aircraft is drawn, with its own lights (development hook).
  const drawn = () =>
    page.evaluate(() => {
      const d = (
        globalThis as unknown as {
          __cityLighting: {
            aircraftLights(): { aircraft: number; instances: number; poses: { id: string }[] };
          };
        }
      ).__cityLighting.aircraftLights();
      return { aircraft: d.aircraft, instances: d.instances, ids: d.poses.map((p) => p.id) };
    });
  expect(await drawn()).toEqual({ aircraft: 5, instances: 55, ids: ids(5) });

  // The followed aircraft leaves the fleet: the camera is released, the list shrinks.
  await request.post('/api/simulator/settings', { data: { ...BASE, flights: true, planes: 2 } });
  await expect(rows).toHaveCount(2);
  await expect(page.locator('.map-status')).toContainText('FRI KAMERA');
  await expect(page.locator('.flight-code')).toHaveText('NK-01');
  await expect.poll(async () => (await drawn()).ids).toEqual(ids(2));

  // One aircraft: no list, the card alone, as before the fleet.
  await request.post('/api/simulator/settings', { data: { ...BASE, flights: true, planes: 1 } });
  await expect(rows).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Följ flygplanet' })).toBeEnabled();

  // Flights off: the slider is disabled and no aircraft is left.
  await openTab('Trafik');
  await page.getByLabel('Flygtrafik mellan flygplatserna').uncheck();
  await expect(slider).toBeDisabled();
  await page.getByRole('button', { name: /Uppdatera trafiken/ }).click();
  await expect.poll(async () => (await world(request)).aircraft.length).toBe(0);
  await expect(page.locator('.sim-metrics')).toContainText('avstängd');
  expect(errors).toEqual([]);
});

test('six aircraft take turns on the runways without meeting', async ({ request }) => {
  test.setTimeout(120000);
  await request.post('/api/simulator/settings', {
    data: { ...BASE, flights: true, planes: 6, timeScale: 20 },
  });
  await request.post('/api/simulator/reset', { data: {} });
  await request.post('/api/simulator/pause', { data: { paused: false } });
  // Air routes: the outline of the mapped area (scene x, z), which no aircraft may leave.
  const outline: [number, number][] = JSON.parse(
    fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'),
  ).meta.clip;
  const insideMap = ([x, , z]: number[]) => {
    let inside = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [ax, az] = outline[i],
        [bx, bz] = outline[j];
      if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    }
    return inside;
  };
  const routes = new Set<string>(),
    kinds = new Set<string>();
  const phases = new Set<string>();
  let closest = Infinity,
    samples = 0;
  const started = Date.now();
  // About 20 simulated minutes at time factor 20.
  while (Date.now() - started < 60000) {
    const w = await world(request);
    samples++;
    for (const [i, a] of w.aircraft.entries()) {
      phases.add(a.phase);
      kinds.add(a.type);
      expect(insideMap(a.pos), `${a.id} at ${a.pos} in ${a.phase}`).toBe(true);
      if (['CLIMB', 'CRUISE', 'APPROACH'].includes(a.phase)) {
        expect(a.route).toBeTruthy();
        routes.add(a.origin + ': ' + a.route);
      }
      for (const b of w.aircraft.slice(i + 1))
        closest = Math.min(
          closest,
          Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]),
        );
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  const w = await world(request);
  expect(samples).toBeGreaterThan(200);
  expect(w.aircraft.length).toBe(6);
  expect(w.completedFlights).toBeGreaterThanOrEqual(8);
  // Never closer than the queue's nose-to-nose distance (1.6 units = 40 m), bar rounding on a curve.
  expect(closest).toBeGreaterThan(1.5);
  for (const phase of [
    'QUEUE',
    'TAXI_OUT',
    'TAKEOFF',
    'CLIMB',
    'CRUISE',
    'APPROACH',
    'LANDING',
    'TAXI_IN',
  ])
    expect(phases).toContain(phase);
  expect(phases).not.toContain('HOLDING');
  // Twenty simulated minutes are a dozen flights: more than one route, and only known types.
  expect(routes.size).toBeGreaterThanOrEqual(3);
  for (const route of routes) expect(route).toMatch(/: (över|norr om|söder om) staden$/);
  for (const kind of kinds) expect(Object.keys(AIRCRAFT_TYPES)).toContain(kind);
  const landings = w.events.filter((e: { kind: string }) => e.kind === 'landing');
  expect(landings.length).toBeGreaterThan(0);
  expect(landings[0].message).toMatch(/: NK-0[1-6] har landat\.$/);
});

test.describe('with a finger as the pointer', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('the slider and the rows of the aircraft list are finger-sized', async ({
    page,
    request,
  }) => {
    test.setTimeout(240000);
    await request.post('/api/simulator/settings', { data: { ...BASE, flights: true, planes: 4 } });
    await page.goto('/');
    await expect(
      page.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' }),
    ).toBeVisible({ timeout: 60000 });
    await page.getByRole('button', { name: 'Inställningar' }).click();
    const drawer = page.getByRole('dialog', { name: 'Inställningar' });
    await expect(drawer).toBeVisible();
    expect((await drawer.locator('#planes').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await drawer.getByRole('tab', { name: 'Flyg' }).click();
    const rows = drawer.locator('.flight-row');
    await expect(rows).toHaveCount(4);
    for (const row of await rows.all())
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await rows.nth(1).tap();
    await expect(drawer.locator('.flight-code')).toHaveText('NK-02');
    // The drawer does not widen the page.
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });
});
