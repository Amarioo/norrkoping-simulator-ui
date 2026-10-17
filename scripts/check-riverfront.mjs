import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';
try {
  const p = await b.newPage({ viewport: { width: 1600, height: 1150 } }),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base);
  await p.waitForTimeout(4500);
  for (const view of ['ingelstaBridge', 'grandHotel', 'holmen']) {
    await p.selectOption('#city-focus', view);
    await p.waitForTimeout(700);
    await p.locator('.map-panel').screenshot({ path: 'test-results/details/' + view + '.png' });
  }
  for (const [line, destination] of [
    ['2', 'Kvarnberget'],
    ['2', 'Fridvalla'],
    ['3', 'Vidablick'],
    ['3', 'Klockaretorpet'],
  ]) {
    await p.goto(
      base +
        '/scripts/preview-vehicles.html?kind=tram&line=' +
        line +
        '&front=1&destination=' +
        destination,
    );
    await p.waitForFunction(() => window.previewReady);
    await p
      .locator('canvas')
      .screenshot({ path: 'test-results/details/tram-' + destination + '.png' });
  }
  console.log({ errors });
  if (errors.length) process.exitCode = 1;
} finally {
  await b.close();
}
