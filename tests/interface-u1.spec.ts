import { test, expect } from '@playwright/test';

// Interface U1: the rebuilt interface. Settings in three tabs (Bits UI), two charts under the map
// (LayerChart), animated numbers (NumberFlow), toasts for the simulator's answers (svelte-sonner) and,
// on a narrow screen, the settings in a drawer pulled up from the bottom edge (vaul-svelte).

test('Interface U1: tabs, charts, numbers and toasts on a desktop screen', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post('/api/simulator/settings', {
    data: { compact: 100, estate: 60, trucks: 20, flights: true, timeScale: 3 },
  });
  await request.post('/api/simulator/reset', { data: {} });
  await page.goto('/');
  await expect(page.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' })).toBeVisible(
    { timeout: 30000 },
  );

  // Three tabs; only the chosen tab's controls are shown, and the arrow keys move between them.
  await expect(page.getByRole('tab')).toHaveText(['Trafik', 'Tid och ljus', 'Flyg']);
  const trafik = page.getByRole('tab', { name: 'Trafik' });
  const ljus = page.getByRole('tab', { name: 'Tid och ljus' });
  await expect(trafik).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#compact')).toBeVisible();
  await expect(page.locator('#stadium-lights')).toBeHidden();
  await page.locator('#compact').fill('130');
  await trafik.focus();
  await page.keyboard.press('ArrowRight');
  await expect(ljus).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#stadium-lights')).toBeVisible();
  await expect(page.locator('#compact')).toBeHidden();
  await page.getByRole('tab', { name: 'Flyg' }).click();
  await expect(page.getByRole('button', { name: /Följ flygplanet/ })).toBeVisible();
  // A value set in one tab is still there after visiting the others.
  await trafik.click();
  await expect(page.locator('#compact')).toHaveValue('130');
  await page.locator('#compact').fill('100');

  // The charts follow the simulator: samples arrive, and the bar chart counts every vehicle.
  const world = await (await request.get('/api/simulator/world')).json();
  const moving = page.locator('[data-chart="moving"]');
  await expect
    .poll(async () => Number(await moving.getAttribute('data-samples')), { timeout: 20000 })
    .toBeGreaterThan(2);
  await expect(moving.locator('.chart-box')).toBeVisible();
  const kinds = page.locator('[data-chart="kinds"]');
  await expect(kinds).toHaveAttribute('data-total', String(world.vehicles.length));
  const trucks = world.vehicles.filter((v: { kind: string }) => v.kind === 'truck').length;
  await expect(kinds.locator('.chart-box')).toHaveAccessibleName(new RegExp(`Lastbilar ${trucks}\\b`));

  // The big numbers show the snapshot's values, as plain text beside the animated digits.
  const numbers = page.locator('.sim-metrics [data-number]');
  await expect(numbers).toHaveCount(4);
  await expect(numbers.nth(0)).toHaveText(String(world.vehicles.length));
  await expect(numbers.nth(1)).toHaveText(String(trucks));
  await expect(page.locator('.sim-metrics number-flow-svelte')).toHaveCount(4);

  // The simulator's answer comes as a toast.
  await page.getByRole('button', { name: /Uppdatera trafiken/ }).click();
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'Trafiken uppdaterad.' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('Interface U1: on a phone the settings open in a drawer; the map keeps the page width', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (r) => r.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await expect(page.locator('.sim-sidebar')).toHaveCount(0);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);

  await page.getByRole('button', { name: 'Inställningar' }).click();
  const drawer = page.getByRole('dialog', { name: 'Inställningar' });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('#compact')).toBeVisible();
  await drawer.getByRole('tab', { name: 'Flyg' }).click();
  await expect(drawer.getByRole('button', { name: /Följ flygplanet/ })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  // Back on a wide screen the side panel returns and the drawer button is gone.
  await page.setViewportSize({ width: 1440, height: 1040 });
  await expect(page.locator('.sim-sidebar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inställningar' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Flyg' })).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});
