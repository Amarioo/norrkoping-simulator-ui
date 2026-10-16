import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage({ viewport: { width: 1600, height: 1150 } }),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await p.goto(base);
  await p.waitForTimeout(4000);
  fs.mkdirSync('test-results/details', { recursive: true });
  for (const view of ['station', 'terminal', 'bollspelaren', 'ljuraStop', 'police']) {
    await p.selectOption('#city-focus', view);
    await p.waitForTimeout(700);
    await p.locator('.map-panel').screenshot({ path: 'test-results/details/' + view + '.png' });
  }
  await p.request.post(base + '/api/simulator/pause', { data: { paused: true } });
  const world = await (await p.request.get(base + '/api/simulator/world')).json();
  const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json'));
  for (const kind of ['tram', 'train']) {
    const clearance = (v) =>
      Math.min(...map.trees.map((t) => Math.hypot(t[0] - v.pos[0], t[1] - v.pos[2])));
    const v = world.vehicles
      .filter((v) => v.kind === kind)
      .sort((a, b) => clearance(b) - clearance(a))[0];
    await p.selectOption('#vehicle-select', String(v.id));
    await p.getByRole('button', { name: /Följ fordonet/ }).click();
    await p.waitForTimeout(2600);
    const box = await p.locator('canvas').boundingBox(),
      x = box.x + box.width * 0.5,
      y = box.y + box.height * 0.45;
    await p.mouse.move(x, y);
    await p.mouse.down();
    await p.mouse.move(x - 150, y + 15, { steps: 20 });
    await p.mouse.up();
    await p.waitForTimeout(500);
    await p.locator('.map-panel').screenshot({ path: 'test-results/details/' + kind + '.png' });
  }
  console.log({ errors });
  await p.request.post(base + '/api/simulator/pause', { data: { paused: false } });
} finally {
  await browser.close();
}
