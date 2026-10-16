const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';
import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1150 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
try {
  await p.goto(base);
  await p.waitForTimeout(3500);
  for (const view of [
    'station',
    'norraPromenaden',
    'sodraPromenaden',
    'bergsbron',
    'laxholmsbron',
    'laxtrappan',
    'saltangsbron',
    'hamnbron',
    'gamlebro',
  ]) {
    await p.selectOption('#city-focus', view);
    await p.waitForTimeout(600);
    await p.locator('.map-panel').screenshot({ path: 'test-results/details/' + view + '.png' });
  }
  console.log({ errors });
  if (errors.length) process.exitCode = 1;
} finally {
  await b.close();
}
