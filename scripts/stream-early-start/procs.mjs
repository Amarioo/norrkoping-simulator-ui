// Does the second tab get its own renderer process, or share the first tab's (one main thread)?
// Also: does a busy first tab stall the second tab's timers?
import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://127.0.0.1:5195/';
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 } });
const cdp = await browser.newBrowserCDPSession();
const renderers = async () =>
  (await cdp.send('SystemInfo.getProcessInfo')).processInfo.filter((p) => p.type === 'renderer').map((p) => p.id);
const page = await context.newPage();
await page.goto(url);
await page.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' }).waitFor({ timeout: 30000 });
const r1 = await renderers();
const second = await context.newPage();
await second.goto(url);
await second.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' }).waitFor({ timeout: 30000 });
const r2 = await renderers();
// Second tab: heartbeat every 10 ms; first tab: 1 s busy loop. A shared main thread stalls the heartbeat.
await second.evaluate(() => {
  window.__gaps = [];
  let last = performance.now();
  window.__hb = setInterval(() => {
    const now = performance.now();
    window.__gaps.push(now - last);
    last = now;
  }, 10);
});
await page.evaluate(() => {
  const end = performance.now() + 1000;
  while (performance.now() < end);
});
await second.waitForTimeout(300);
const maxGap = await second.evaluate(() => Math.round(Math.max(...window.__gaps)));
console.log(JSON.stringify({ renderersBefore: r1.length, renderersAfter: r2.length, secondTabMaxTimerGapMs: maxGap }));
await browser.close();
