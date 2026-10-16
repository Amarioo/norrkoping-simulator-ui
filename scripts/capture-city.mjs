import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1180 } });
const errors = [],
  warnings = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning') warnings.push(m.text());
});
await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:5173');
await page.locator('#city-focus').waitFor();
await page.waitForTimeout(2500);
fs.mkdirSync('test-results/city', { recursive: true });
for (const view of ['overview', 'parken', 'ljura', 'industry', 'centrum', 'station']) {
  await page.selectOption('#city-focus', view);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/city/${view}.png`, fullPage: true });
  await page.locator('.map-panel').screenshot({ path: `test-results/city/${view}-map.png` });
}
console.log(
  JSON.stringify({
    errors,
    warnings,
    canvas: await page.locator('canvas').count(),
    title: await page.title(),
  }),
);
await browser.close();
