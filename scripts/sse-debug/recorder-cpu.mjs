// SSE debug panel: the tool's own main-thread CPU time, measured with the V8 sampling profiler
// (Chrome DevTools Protocol), so the number does not depend on how busy the rest of the machine is
// the way whole-frame times do. Production build with VITE_SSE_DEBUG=1 (`vite preview`), live
// backend traffic, Innerstaden view, 10 s profile per run. "debugMs" = self time of all functions in
// the debug chunk (SseDebugHost-*.js: log, recorder, raw reader, panel) + sseTap-*.js. Style, layout
// and paint caused by the panel's DOM updates are not script time; they are reported separately as
// the page's total RecalcStyle / Layout durations from Performance.getMetrics for the same 10 s.
//
//   node scripts/sse-debug/recorder-cpu.mjs <out.json> [rounds=2] [ssePort=5284]
// Refuses to overwrite <out.json>.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [out, roundsArg = '2', ssePort = '5284'] = process.argv.slice(2);
if (!out) throw new Error('usage: recorder-cpu.mjs <out.json> [rounds] [ssePort]');
if (fs.existsSync(out)) throw new Error(`${out} exists; measurements are never overwritten`);
const VARIANTS = { closed: '', open: '&sse-debug', 'open-raw': '&sse-debug=raw' };
const PROFILE_MS = 10000;
const report = {
  note: 'V8 sampling profiler (100 µs) for 10 s, Innerstaden view, live traffic, uncapped headless Edge 1280×900.',
  runs: [],
  errors: [],
};
const metric = (m, name) => m.metrics.find((x) => x.name === name)?.value ?? 0;
for (let round = 1; round <= Number(roundsArg); round++)
  for (const label of Object.keys(VARIANTS)) {
    const browser = await chromium.launch({
      channel: 'msedge',
      args: ['--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(
        `http://127.0.0.1:${ssePort}/?date=2026-10-21&time=12:39&stadium=off${VARIANTS[label]}`,
      );
      await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
      await page.selectOption('#city-focus', 'city');
      await page.waitForTimeout(4000);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
      const before = await cdp.send('Performance.getMetrics');
      const eventsBefore = await page.evaluate(() =>
        globalThis.__sseLog.channels().reduce((a, c) => a + c.events, 0),
      );
      await cdp.send('Profiler.start');
      await page.waitForTimeout(PROFILE_MS);
      const { profile } = await cdp.send('Profiler.stop');
      const after = await cdp.send('Performance.getMetrics');
      const eventsAfter = await page.evaluate(() =>
        globalThis.__sseLog.channels().reduce((a, c) => a + c.events, 0),
      );
      // Self time per node from the samples.
      const dt = new Map();
      for (let i = 0; i < profile.samples.length; i++)
        dt.set(
          profile.samples[i],
          (dt.get(profile.samples[i]) ?? 0) + profile.timeDeltas[i] / 1000,
        );
      let debugMs = 0;
      let scriptMs = 0;
      const top = {};
      for (const n of profile.nodes) {
        const ms = dt.get(n.id) ?? 0;
        const fn = n.callFrame.functionName;
        if (!['(idle)', '(program)', '(garbage collector)', '(root)'].includes(fn)) scriptMs += ms;
        if (/SseDebugHost-|sseTap-/.test(n.callFrame.url)) {
          debugMs += ms;
          const key = `${fn || '(anon)'}@${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`;
          top[key] = (top[key] ?? 0) + ms;
        }
      }
      const seconds = PROFILE_MS / 1000;
      const run = {
        label,
        round,
        events: eventsAfter - eventsBefore,
        debugMsPerSecond: debugMs / seconds,
        scriptMsPerSecond: scriptMs / seconds,
        recalcStyleMsPerSecond:
          ((metric(after, 'RecalcStyleDuration') - metric(before, 'RecalcStyleDuration')) * 1000) /
          seconds,
        layoutMsPerSecond:
          ((metric(after, 'LayoutDuration') - metric(before, 'LayoutDuration')) * 1000) / seconds,
        taskMsPerSecond:
          ((metric(after, 'TaskDuration') - metric(before, 'TaskDuration')) * 1000) / seconds,
        topDebugFunctions: Object.entries(top)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([k, v]) => [k, +v.toFixed(2)]),
      };
      report.runs.push(run);
      console.log(
        JSON.stringify({
          label,
          round,
          events: run.events,
          debug: run.debugMsPerSecond.toFixed(2),
          script: run.scriptMsPerSecond.toFixed(1),
          style: run.recalcStyleMsPerSecond.toFixed(1),
          layout: run.layoutMsPerSecond.toFixed(1),
          task: run.taskMsPerSecond.toFixed(0),
        }),
      );
    } catch (e) {
      report.errors.push(`${label} r${round}: ${e.message}`);
    } finally {
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
      await browser.close();
    }
  }
if (report.errors.length) process.exitCode = 1;
