const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  p.on('pageerror', (e) => console.log('ERROR', e.message));
  for (const kind of ['tram', 'train']) {
    await p.goto(base + '/scripts/preview-vehicles.html?kind=' + kind);
    await p.waitForFunction(() => window.previewReady);
    await p.screenshot({ path: 'test-results/details/' + kind + '-model.png' });
  }
  await p.setViewportSize({ width: 1600, height: 1150 });
  await p.goto(base);
  await p.waitForTimeout(2000);
  await p.selectOption('#city-focus', 'policeEmblem');
  await p.waitForTimeout(1000);
  await p.locator('.map-panel').screenshot({ path: 'test-results/details/police-emblem.png' });
} finally {
  await browser.close();
}
