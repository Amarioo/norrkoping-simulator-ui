import { test, expect } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';

test('traffic commands, SSE, free camera and vehicle following work together', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post('/api/simulator/settings', {
    data: { compact: 100, estate: 60, trucks: 20, flights: true, timeScale: 3 },
  });
  await request.post('/api/simulator/reset', { data: {} });
  await request.post('/api/simulator/pause', { data: { paused: true } });
  await page.goto('/');
  await expect(page.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' })).toBeVisible(
    { timeout: 30000 },
  );
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fortsätt simuleringen' })).toBeVisible();
  for (const [id, value] of [
    ['compact', '30'],
    ['estate', '20'],
    ['trucks', '10'],
  ])
    await page.locator('#' + id).fill(value);
  await page.getByRole('button', { name: /Uppdatera trafiken/ }).click();
  await expect(page.locator('.sim-feedback')).toContainText('Trafiken uppdaterad.');
  await expect
    .poll(async () => (await (await request.get('/api/simulator/world')).json()).vehicles.length)
    .toBe(60);
  await expect(page.locator('.sim-metrics')).toContainText('60');
  const second = await page.context().newPage();
  await second.goto('/');
  await expect(second.locator('.sim-metrics')).toContainText('60');
  await second.close();
  for (const view of ['airport', 'f13', 'police', 'kungsgatan'])
    await page.selectOption('#city-focus', view);
  const canvas = page.locator('canvas');
  await canvas.focus();
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  await expect
    .poll(async () => Number(await page.locator('.map-panel').getAttribute('data-camera-travel')))
    .toBeGreaterThan(0.1);
  const before = await (await request.get('/api/simulator/world')).json();
  const truck = before.vehicles.find((v: { kind: string }) => v.kind === 'truck');
  await page.selectOption('#vehicle-select', String(truck.id));
  await expect(page.locator('.vehicle-inspector')).toContainText('Lastbil');
  await page.getByRole('button', { name: /Följ fordonet/ }).click();
  await expect(page.locator('.map-status')).toContainText('FÖLJER FORDON');
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Stäng fordonsdetaljer' }).click();
  // Pick the actual moving-instance geometry, not just its dropdown entry.
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing canvas');
  const camera = new PerspectiveCamera(48, bounds.width / bounds.height, 0.015, 2400);
  camera.position.set(
    truck.pos[0] - Math.sin(truck.heading) * 0.85,
    truck.pos[1] + 0.42,
    truck.pos[2] - Math.cos(truck.heading) * 0.85,
  );
  camera.lookAt(truck.pos[0], truck.pos[1], truck.pos[2]);
  camera.updateMatrixWorld();
  const point = new Vector3(truck.pos[0], truck.pos[1] + 0.065, truck.pos[2]).project(camera);
  await page.mouse.click(
    bounds.x + ((point.x + 1) / 2) * bounds.width,
    bounds.y + ((1 - point.y) / 2) * bounds.height,
  );
  await expect(page.locator('.vehicle-inspector')).toContainText('Lastbil');
  await page.getByRole('button', { name: 'Stäng fordonsdetaljer' }).click();
  await page.getByRole('button', { name: /Följ flygplanet/ }).click();
  await expect(page.locator('.map-status')).toContainText('FÖLJER NK-01');
  await page.getByRole('button', { name: 'Fortsätt simuleringen' }).click();
  await expect
    .poll(async () => (await (await request.get('/api/simulator/world')).json()).simulationTime)
    .toBeGreaterThan(before.simulationTime + 0.5);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'test-results/simulator-desktop.png', fullPage: true });
  await page.context().setOffline(true);
  await expect(
    page.locator('.sim-live').filter({ hasText: 'Ansluter till simulatorn…' }),
  ).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' })).toBeVisible(
    { timeout: 15000 },
  );
  await page.getByLabel('Flygtrafik mellan flygplatserna').uncheck();
  await page.getByRole('button', { name: /Uppdatera trafiken/ }).click();
  await expect
    .poll(async () => (await (await request.get('/api/simulator/world')).json()).aircraft.length)
    .toBe(0);
  await expect(page.getByRole('button', { name: /Följ flygplanet/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Återställ simuleringen' }).click();
  await expect(page.locator('.sim-feedback')).toContainText('Simuleringen återställd.');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/simulator-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  // Restore the normal initial scene after this isolated verification run.
  await request.post('/api/simulator/settings', {
    data: { compact: 100, estate: 60, trucks: 20, flights: true, timeScale: 3 },
  });
  await request.post('/api/simulator/reset', { data: {} });
});
