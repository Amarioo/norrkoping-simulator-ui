import { test, expect } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';

test('3D control room commands flow through Ktor and both SSE projections', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await request.post('/api/commands/reset', { data: {} });
  await request.post('/api/commands/pause', { data: { paused: true } });
  await page.goto('/');
  await expect(page.getByText('Live connection', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('PAUSED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dispatch 5 drones' }).click();
  await expect(page.getByText('Drones dispatched.', { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await (await request.get('/api/world')).json()).drones.length)
    .toBe(13);
  await expect(page.locator('.metrics').first()).toContainText('/ 13');
  // A second subscriber receives the same authoritative world.
  const second = await page.context().newPage();
  await second.goto('/');
  await expect(second.getByText('Live connection', { exact: true })).toBeVisible();
  await expect(second.locator('.metrics')).toContainText('/ 13');
  await second.close();
  // Project a known stationary drone into screen coordinates to test actual mesh picking.
  const bounds = await page.locator('canvas').boundingBox();
  if (!bounds) throw new Error('No canvas');
  const snapshot = await (await request.get('/api/world')).json();
  const drone = snapshot.drones.reduce((highest: { pos: number[] }, d: { pos: number[] }) =>
    d.pos[1] > highest.pos[1] ? d : highest,
  );
  const camera = new PerspectiveCamera(44, bounds.width / bounds.height, 0.1, 600);
  camera.position.set(106, 118, 118);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const point = new Vector3(...(drone.pos as [number, number, number])).project(camera);
  await page.mouse.click(
    bounds.x + ((point.x + 1) * bounds.width) / 2,
    bounds.y + ((1 - point.y) * bounds.height) / 2,
  );
  await expect(page.getByText('DRONE INSPECTOR', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close drone details' }).click();
  await page.getByRole('button', { name: 'Introduce wind' }).click();
  await expect(page.getByRole('button', { name: 'Clear wind' })).toBeVisible();
  await page.getByRole('button', { name: 'Add no-fly zone' }).click();
  const map = await page.locator('canvas').boundingBox();
  if (!map) throw new Error('Missing 3D canvas');
  await page.mouse.click(map.x + map.width * 0.5, map.y + map.height * 0.55);
  await expect(page.getByText('Zone activated.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remove zone / })).toBeVisible();
  const before = await (await request.get('/api/world')).json();
  await page.getByRole('button', { name: 'Resume simulation' }).click();
  await expect(page.getByRole('button', { name: 'Pause simulation' })).toBeVisible();
  await expect
    .poll(async () => (await (await request.get('/api/world')).json()).simulationTime)
    .toBeGreaterThan(before.simulationTime + 0.5);
  await page.screenshot({ path: 'test-results/swarm-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /^Remove zone / }).click();
  await expect(page.getByRole('button', { name: /^Remove zone / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Recall fleet' }).click();
  await expect(page.getByText('Fleet recalled.', { exact: true })).toBeVisible();
  await page.context().setOffline(true);
  await expect(page.getByText('Reconnecting…', { exact: true })).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText('Live connection', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Reset simulation' }).click();
  await expect(page.getByText('Simulation reset.', { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await (await request.get('/api/world')).json()).drones.length)
    .toBe(8);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Dispatch 5 drones' })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/swarm-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
