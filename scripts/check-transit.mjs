import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1150 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.request.post(base + '/api/simulator/pause', { data: { paused: true } });
  await page.goto(base);
  await page.waitForTimeout(3000);
  fs.mkdirSync('test-results/transit', { recursive: true });
  const world = await (await page.request.get(base + '/api/simulator/world')).json();
  for (const kind of ['bus', 'tram', 'train']) {
    const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
    const clearance = (v) =>
      Math.min(...map.trees.map((t) => Math.hypot(t[0] - v.pos[0], t[1] - v.pos[2])));
    const vehicle = world.vehicles
      .filter((v) => v.kind === kind)
      .sort((a, b) => clearance(b) - clearance(a))[0];
    await page.selectOption('#vehicle-select', String(vehicle.id));
    await page.getByRole('button', { name: /Följ fordonet/ }).click();
    await page.waitForTimeout(2800);
    const bounds = await page.locator('canvas').boundingBox();
    const x = bounds.x + bounds.width * 0.5,
      y = bounds.y + bounds.height * 0.45;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 150, y + 15, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    await page.locator('.map-panel').screenshot({ path: 'test-results/transit/' + kind + '.png' });
  }
  await page.selectOption('#city-focus', 'underpass');
  await page.waitForTimeout(1000);
  await page.locator('.map-panel').screenshot({ path: 'test-results/transit/underpass.png' });
  console.log({
    errors,
    counts: world.vehicles.reduce((o, v) => ((o[v.kind] = (o[v.kind] ?? 0) + 1), o), {}),
  });
  await page.request.post(base + '/api/simulator/pause', { data: { paused: false } });
} finally {
  await browser.close();
}
