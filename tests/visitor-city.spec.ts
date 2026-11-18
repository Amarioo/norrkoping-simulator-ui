import { test, expect, type Page } from '@playwright/test';

// A city per visitor (src/lib/citySession.ts, backend internal/sim/sessions.go). With `?own-city`
// (or VITE_CITY_SESSIONS=1 in the build) each tab runs a simulation of its own: one visitor's
// traffic settings and pause do not reach another visitor, nor the shared city that the other
// tests use. Needs a backend with visitor cities (norrkoping-simulator-backend after faa1106).

const connected = (page: Page) =>
  expect(page.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' })).toBeVisible({
    timeout: 30000,
  });
const session = (page: Page) => page.evaluate(() => sessionStorage.getItem('city-session'));

test('two visitors each have a city of their own', async ({ browser, request }) => {
  test.setTimeout(120000);
  const shared = await (await request.get('/api/simulator/world')).json();

  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await a.goto('/?own-city');
  await b.goto('/?own-city');
  await connected(a);
  await connected(b);
  const [idA, idB] = [await session(a), await session(b)];
  expect(idA).toMatch(/^[0-9a-f]{32}$/);
  expect(idB).toMatch(/^[0-9a-f]{32}$/);
  expect(idA).not.toBe(idB);
  const world = async (id: string | null) =>
    (await request.get('/api/simulator/world?session=' + id)).json();

  // Visitor A lowers the traffic and pauses, through the interface.
  await a.locator('#compact').fill('10');
  await a.locator('#estate').fill('20');
  await a.locator('#trucks').fill('5');
  await a.getByRole('button', { name: 'Uppdatera trafiken' }).click();
  await expect.poll(async () => (await world(idA)).settings.compact).toBe(10);
  await a.getByRole('button', { name: 'Pausa simuleringen' }).click();
  await expect(a.getByRole('button', { name: 'Fortsätt simuleringen' })).toBeVisible();
  const afterA = await world(idA);
  expect(afterA.settings).toMatchObject({ compact: 10, estate: 20, trucks: 5 });
  expect(afterA.paused).toBe(true);

  // Visitor B still has the start values and a running clock.
  await expect(b.getByRole('button', { name: 'Pausa simuleringen' })).toBeVisible();
  const b1 = await world(idB);
  expect(b1.settings).toMatchObject({ compact: 100, estate: 60, trucks: 20 });
  expect(b1.paused).toBe(false);
  await expect
    .poll(async () => (await world(idB)).simulationTime)
    .toBeGreaterThan(b1.simulationTime + 1);
  expect(b1.vehicles.length).toBeGreaterThan(afterA.vehicles.length);

  // The shared city (requests without an id) is as it was.
  const sharedAfter = await (await request.get('/api/simulator/world')).json();
  expect(sharedAfter.settings).toEqual(shared.settings);
  expect(sharedAfter.paused).toBe(shared.paused);

  // A reload keeps the visitor's city.
  await a.reload();
  await connected(a);
  expect(await session(a)).toBe(idA);
  await expect(a.getByRole('button', { name: 'Fortsätt simuleringen' })).toBeVisible();

  await a.context().close();
  await b.context().close();
});

test('without ?own-city the page uses the shared city', async ({ page }) => {
  const streams: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname === '/api/simulator/stream') streams.push(url.search);
  });
  await page.goto('/');
  await connected(page);
  expect(await session(page)).toBeNull();
  expect(streams.length).toBeGreaterThan(0);
  expect(streams.every((s) => s === '')).toBe(true);
});
