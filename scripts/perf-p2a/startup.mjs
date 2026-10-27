// Phase P2a: paired start-up timing. Per round and build (rotated order), a fresh browser opens the
// app (1440x1040 like the Playwright suite, traffic on) and records, from navigation start: map ready
// ([data-map-ready]), first /api/simulator/stream request, "Simulatorn är ansluten"; then a second
// tab in the same browser context (as tests/simulation.spec.ts does) and the same marks for it.
//   node scripts/perf-p2a/startup.mjs <out.json> <rounds> main=url name=url [...]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { host, median } from '../perf-p1/lib.mjs';
import { machineLoad } from '../perf-p1/load.mjs';

const [out, roundsArg, ...targets] = process.argv.slice(2);
if (!out || !roundsArg || targets.length < 2)
  throw new Error('usage: <out.json> <rounds> main=url ...');
if (fs.existsSync(out)) throw new Error(`${out} exists`);
const builds = targets.map((t) => {
  const [name, base] = t.split('=');
  return { name, base };
});
const report = {
  note: 'Phase P2a start-up: ms from navigation to map ready, first stream request and "Simulatorn är ansluten"; first tab and a second tab in the same context. 1440x1040, traffic on, hook builds, Edge headless (Playwright suite flags).',
  host: host(),
  builds: builds.map((b) => b.name),
  runs: [],
  errors: [],
};

async function open(context, base) {
  const page = await context.newPage();
  const t0 = Date.now();
  let stream = null;
  page.on('request', (r) => {
    if (stream == null && r.url().includes('/api/simulator/stream')) stream = Date.now() - t0;
  });
  await page.goto(base);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 60000 });
  const mapReady = Date.now() - t0;
  await page
    .locator('.sim-live')
    .filter({ hasText: 'Simulatorn är ansluten' })
    .waitFor({ timeout: 60000 });
  return { page, mapReady, stream, connected: Date.now() - t0 };
}

for (let round = 1; round <= Number(roundsArg); round++) {
  const n = builds.length,
    order = Array.from({ length: n }, (_, i) => builds[(round - 1 + i) % n]);
  for (const build of order) {
    const run = { round, build: build.name, load: await machineLoad(2000) };
    const browser = await chromium.launch({
      channel: 'msedge',
      args: ['--enable-unsafe-swiftshader'],
    });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1040 } });
      const first = await open(context, build.base);
      const second = await open(context, build.base);
      run.first = { mapReady: first.mapReady, stream: first.stream, connected: first.connected };
      run.second = {
        mapReady: second.mapReady,
        stream: second.stream,
        connected: second.connected,
      };
      console.log(round, build.name, JSON.stringify(run.first), JSON.stringify(run.second));
    } catch (e) {
      report.errors.push(`r${round} ${build.name}: ${e.message}`);
    } finally {
      report.runs.push(run);
      await browser.close();
    }
  }
}
report.medians = {};
for (const b of report.builds)
  for (const tab of ['first', 'second'])
    for (const k of ['mapReady', 'stream', 'connected'])
      report.medians[`${b}/${tab}/${k}`] = median(
        report.runs.filter((r) => r.build === b && r[tab]).map((r) => r[tab][k]),
      );
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(report.medians);
