// Interface U4: how much memory the page takes while it starts, at phone size.
// Edge (Chromium) on this computer, not Safari on an iPhone: the numbers show the size of the load and how a
// change moves it, not what an iPhone reports.
//   node scripts/mobile-u4/memory.mjs <url> <out.json> [cores]
// The out file must not exist yet (evidence is never overwritten). `cores` overrides
// navigator.hardwareConcurrency (the app picks its number of geometry workers from it).
// Sampled every ~0.3 s from the operating system: the working set (memory in use) of the page's
// renderer process (the page and its workers) and of the graphics process.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium, devices } from '@playwright/test';

const [url, out, cores] = process.argv.slice(2);
if (!url || !out) throw new Error('usage: <url> <out.json> [cores]');
if (fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);

/** Working set in MB per pid, from `tasklist` (locale-proof: only the digits of the "K" column). */
function workingSets(pids) {
  const text = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'latin1' });
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('","');
    const pid = Number(cells[1]);
    if (pids.includes(pid)) result[pid] = Number(cells[4].replace(/\D/g, '')) / 1024;
  }
  return result;
}

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-precise-memory-info'] });
const context = await browser.newContext({ ...devices['iPhone 14'], defaultBrowserType: undefined });
if (cores)
  await context.addInitScript(
    (n) => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => n }),
    Number(cores),
  );
const page = await context.newPage();
const cdp = await browser.newBrowserCDPSession();
const processes = async () => (await cdp.send('SystemInfo.getProcessInfo')).processInfo;

const before = [];
const samples = [];
const started = Date.now();
let ready = null,
  crashed = false;
page.on('crash', () => (crashed = true));
const navigation = page.goto(url, { waitUntil: 'commit' });
const readyWatch = navigation
  .then(() => page.waitForSelector('[data-map-ready="true"]', { timeout: 180_000 }))
  .then(() => (ready = (Date.now() - started) / 1000))
  .catch((error) => console.error('map never became ready:', error.message));

let settleUntil = Infinity;
while (Date.now() < settleUntil && !crashed) {
  const info = await processes();
  const renderers = info.filter((p) => p.type === 'renderer' && !before.includes(p.id));
  const gpu = info.filter((p) => p.type === 'GPU');
  const sets = workingSets([...renderers, ...gpu].map((p) => p.id));
  const sum = (list) => list.reduce((total, p) => total + (sets[p.id] ?? 0), 0);
  samples.push({
    t: +((Date.now() - started) / 1000).toFixed(2),
    rendererMB: Math.round(sum(renderers)),
    gpuMB: Math.round(sum(gpu)),
  });
  if (ready !== null && settleUntil === Infinity) settleUntil = Date.now() + 15_000;
  if (Date.now() - started > 200_000) break;
  await new Promise((resolve) => setTimeout(resolve, 300));
}
await readyWatch;

const heap = crashed
  ? null
  : await page.evaluate(() => {
      const m = performance.memory;
      return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
    });
const peak = (key) => Math.max(...samples.map((s) => s[key]));
const last = samples.at(-1);
const result = {
  url,
  device: 'Edge (Chromium), iPhone 14 emulation (390 × 664 px viewport, touch)',
  hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency).catch(() => null),
  crashed,
  mapReadySeconds: ready,
  peak: { rendererMB: peak('rendererMB'), gpuMB: peak('gpuMB') },
  peakTotalMB: Math.max(...samples.map((s) => s.rendererMB + s.gpuMB)),
  settled: { rendererMB: last.rendererMB, gpuMB: last.gpuMB },
  mainThreadJsHeapMB: heap,
  samples,
};
fs.mkdirSync(new URL('.', new URL(out, 'file:///' + process.cwd().replace(/\\/g, '/') + '/')), {
  recursive: true,
});
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
const { samples: _, ...summary } = result;
console.log(JSON.stringify(summary, null, 2));
await browser.close();
