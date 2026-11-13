// Interface U1: how long the page takes to appear (the app mounted: `.sim-metrics` in the DOM) and
// how many files the browser fetches on the way. Fresh browser context per run, cache off.
//   node scripts/interface-u1/mount-time.mjs <runs> name=url [name=url ...]
import { chromium } from '@playwright/test';

const [runsArg, ...targets] = process.argv.slice(2);
const runs = Number(runsArg);
const builds = targets.map((t) => t.split('='));
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const out = {};
for (let r = 0; r < runs; r++)
  for (const [name, base] of r % 2 ? [...builds].reverse() : builds) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1040 } });
    const page = await context.newPage();
    let requests = 0;
    page.on('request', () => requests++);
    const start = Date.now();
    await page.goto(new URL('?date=2026-10-21&time=12:39&stadium=off', base).href, {
      waitUntil: 'commit',
    });
    await page.locator('.sim-metrics').waitFor({ state: 'attached', timeout: 120000 });
    const mounted = Date.now() - start;
    (out[name] ??= { mountedMs: [], requests: [] }).mountedMs.push(mounted);
    out[name].requests.push(requests);
    await context.close();
  }
await browser.close();
for (const [name, v] of Object.entries(out))
  console.log(
    name,
    'mounted ms',
    v.mountedMs.join(' '),
    '| median',
    median(v.mountedMs),
    '| requests median',
    median(v.requests),
  );
