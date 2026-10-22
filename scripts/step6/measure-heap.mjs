// JS heap after a forced garbage collection (CDP HeapProfiler.collectGarbage), per URL.
// Usage: node scripts/step6/measure-heap.mjs <out.json> <label=url> [<label=url> …]
// Each URL: fresh page, wait for map ready + 5 s, visit 'parken', 'kungsgatan', 'overview', then GC ×3.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [out, ...targets] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = {};
try {
  for (const t of targets) {
    const [label, url] = t.split(/=(.+)/);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(url, { timeout: 120000 });
    await page.locator('[data-map-ready="true"]').waitFor({ timeout: 240000 });
    await page.waitForTimeout(5000);
    for (const v of ['parken', 'kungsgatan', 'overview']) {
      await page.selectOption('#city-focus', v);
      await page.waitForTimeout(1500);
    }
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('Performance.enable');
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    (report[label] ??= []).push(m.JSHeapUsedSize / 1e6);
    await page.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
