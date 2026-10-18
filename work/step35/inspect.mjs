// Captures the dev inspection overlay (?inspect=infra) after its analysis has finished.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const logs = [];
page.on('console', (m) => logs.push(m.text()));
await page.goto('http://127.0.0.1:5173/?inspect=infra', { timeout: 120000 });
await page.locator('[data-map-ready="true"]').waitFor({ timeout: 240000 });
await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
await page.waitForFunction(() => globalThis.__infraIssues, null, { timeout: 120000 });
const summary = await page.evaluate(() => {
  const c = {};
  for (const i of globalThis.__infraIssues) c[i.kind] = (c[i.kind] ?? 0) + 1;
  return c;
});
for (const [name, pose] of Object.entries({
  'inspect-industri': { position: [-8, 9, 14], target: [-14, 0, 2] },
  'inspect-stathoga': { position: [10, 6, -30], target: [6, 0, -38] },
})) {
  await page.evaluate((pose) => {
    const { camera, controls } = globalThis.__cityCamera;
    camera.position.fromArray(pose.position);
    controls.target.fromArray(pose.target);
    controls.update();
  }, pose);
  await page.waitForTimeout(2500);
  await page.locator('.map-panel').screenshot({ path: `work/step35/inspect/${name}.png` });
}
console.log(JSON.stringify({ summary, logs: logs.filter((l) => l.includes('[infra]')) }));
await browser.close();
