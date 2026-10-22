// CPU profile of the main thread from navigation to map ready; prints the top self-time functions
// and the long tasks. Usage: node scripts/step6/profile-startup.mjs <url> [top=25]
import { chromium } from '@playwright/test';

const [url, top = '25'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await page.goto(url, { timeout: 120000 });
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 240000 });
  const ready = Date.now() - t0;
  await page.waitForTimeout(2500);
  const { profile } = await cdp.send('Profiler.stop');
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => {
    const n = nodes.get(id);
    const key = `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url.split('/').pop() || '').split('?')[0]}:${n.callFrame.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
  });
  console.log('map ready (ms from goto)', ready);
  [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(top)).forEach(([k, v]) => console.log(v.toFixed(1).padStart(8), k));
} finally {
  await browser.close();
}
