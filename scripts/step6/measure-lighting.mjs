// Step 6 frame-time benchmark per lighting condition, plus transition stalls.
// Usage: BASE=http://127.0.0.1:5184/ [CONDITIONS=day,night-off,night-event] [FRAMES=180]
//          node scripts/step6/measure-lighting.mjs <out.json>
// Production build (vite preview), uncapped frame rate, 1280 × 900, DPR 1, Edge headless on the
// local GPU. Per condition: a fresh page, then 180 frames per preset view (median, p95, max).
// Transitions (new build only, at night in the 'parken' view): six floodlight toggles, 120 frames of
// time-slider scrubbing across the whole day, and 3 s of time-lapse at 10 min/s.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const out = process.argv[2] ?? 'test-results/lighting.json';
const base = process.env.BASE ?? 'http://127.0.0.1:5173/';
const frames = Number(process.env.FRAMES ?? 180);
const CONDITIONS = {
  day: 'date=2026-10-21&time=12:39&stadium=off',
  'night-off': 'date=2026-10-21&time=21:30&stadium=off',
  'night-event': 'date=2026-10-21&time=21:30&stadium=event',
};
const conditions = (process.env.CONDITIONS ?? Object.keys(CONDITIONS).join(',')).split(',');
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const stats = (d) => {
  const s = [...d].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    n: s.length,
    median: q(0.5),
    p95: q(0.95),
    max: s.at(-1),
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  };
};
const report = {
  base,
  frames,
  viewport: { width: 1280, height: 900 },
  conditions: {},
  transitions: null,
  errors: [],
};
try {
  for (const condition of conditions) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.addInitScript(() => {
      const t = [];
      globalThis.__frameTimes = t;
      const tick = (now) => {
        t.push(now);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto(base + '?' + CONDITIONS[condition], { timeout: 120000 });
    await page.locator('[data-map-ready="true"]').waitFor({ timeout: 240000 });
    await page.waitForTimeout(4000);
    const options = await page.$$eval('#city-focus option', (o) => o.map((x) => x.value));
    const views = [
      'overview',
      'city',
      'parken',
      'kungsgatan',
      'laxtrappan',
      'stromparken',
      'idrottsparkenPitch',
    ].filter((v) => options.includes(v));
    const result = {};
    for (const view of views) {
      await page.selectOption('#city-focus', view);
      await page.waitForTimeout(2500);
      const d = await page.evaluate(async (n) => {
        const d = [];
        let last = await new Promise((r) => requestAnimationFrame(r));
        for (let i = 0; i < n; i++) {
          const t = await new Promise((r) => requestAnimationFrame(r));
          d.push(t - last);
          last = t;
        }
        return d;
      }, frames);
      result[view] = stats(d);
    }
    report.conditions[condition] = result;
    // Transitions: only where the Step 6 controls exist.
    if (condition === 'night-off' && (await page.locator('#stadium-lights').count())) {
      await page.selectOption('#city-focus', 'parken');
      await page.waitForTimeout(2500);
      const window = async (action) => {
        const start = await page.evaluate(() => globalThis.__frameTimes.length);
        await action();
        const t = await page.evaluate((s) => globalThis.__frameTimes.slice(Math.max(1, s)), start);
        const d = [];
        for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
        return stats(d);
      };
      const steady = await window(() => page.waitForTimeout(3000));
      const toggles = await window(async () => {
        for (const mode of ['event', 'off', 'training', 'event', 'off', 'event']) {
          await page.selectOption('#stadium-lights', mode);
          await page.waitForTimeout(700);
        }
      });
      const scrub = await window(async () => {
        for (let i = 0; i < 120; i++) {
          await page.$eval(
            '#light-time',
            (el, v) => {
              el.value = String(v);
              el.dispatchEvent(new Event('input', { bubbles: true }));
            },
            (i * 12) % 1440,
          );
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
        }
      });
      await page.selectOption('#light-play', '600');
      const play = await window(() => page.waitForTimeout(3000));
      await page.selectOption('#light-play', '0');
      report.transitions = { view: 'parken', steady, toggles, scrub, play };
    }
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const m = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]),
    );
    report.conditions[condition].__heapMB = m.JSHeapUsedSize / 1e6;
    await page.close();
  }
} finally {
  await browser.close();
}
fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, '') || '.', { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(
  JSON.stringify({
    out,
    conditions: Object.keys(report.conditions),
    transitions: !!report.transitions,
    errors: report.errors.length,
  }),
);
if (report.errors.length) process.exitCode = 1;
