// Lighting Phase 0 heap probe: post-GC JS heap after each of N cycles of (a) a control that only
// renders frames, (b) street-lighting rebuilds, (c) full controller recreation, on the live DEV scene
// (API aborted). Distinguishes measurement/browser drift (control) from lifecycle retention.
//
//   node scripts/lighting-phase0/heap-probe.mjs <out.json> <baseUrl> [cycles=30]
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [out, base, cyclesArg = '30'] = process.argv.slice(2);
const cycles = Number(cyclesArg);
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const report = { base, cycles, phases: {}, errors: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    timezoneId: 'Europe/Stockholm',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(new URL('?date=2026-10-21&time=21:30&stadium=event', base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.waitForTimeout(4000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const heap = async () => {
    for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
    return (
      (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize')
        .value / 1e6
    );
  };
  const frames = () =>
    page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
        ),
    );
  const actions = {
    control: () => null,
    reload: () => globalThis.__cityLighting.reloadStreetLighting(),
    recreate: () => void globalThis.__cityLighting.recreate(),
  };
  for (const [phase, action] of Object.entries(actions)) {
    const series = [];
    for (let i = 0; i < cycles; i++) {
      await page.evaluate(action);
      await frames();
      series.push(Number((await heap()).toFixed(4)));
    }
    const first = series.slice(0, 5).reduce((a, b) => a + b) / 5,
      last = series.slice(-5).reduce((a, b) => a + b) / 5;
    report.phases[phase] = {
      series,
      firstFiveMeanMB: first,
      lastFiveMeanMB: last,
      perCycleKB: ((last - first) / (cycles - 5)) * 1000,
    };
    console.log(
      phase,
      JSON.stringify(report.phases[phase].perCycleKB.toFixed(2)),
      series[0],
      series.at(-1),
    );
  }
  report.memory = await page.evaluate(() => {
    const r = globalThis.__cityLighting.renderer;
    return { ...r.info.memory, programs: r.info.programs.length };
  });
} finally {
  fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
  await browser.close();
}
