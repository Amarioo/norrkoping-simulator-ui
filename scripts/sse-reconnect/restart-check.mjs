// SSE reconnect check against the real backend: opens the app (dev server, backend behind the Vite
// proxy), then records every 250 ms what the header says ("Simulatorn är ansluten" / "Ansluter till
// simulatorn…"), whether the backend answers directly, and the city sequence number. Stop and
// restart the backend by hand while it runs. Screenshots are taken at the first "connected", the
// first "connecting" after it, and the first "connected" after the backend came back.
//
//   node scripts/sse-reconnect/restart-check.mjs <outDir> [seconds=120] [appUrl] [backendUrl]
// Refuses to overwrite <outDir>/restart-log.json or the screenshots.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [
  outDir,
  secondsArg = '120',
  app = 'http://127.0.0.1:5281',
  backend = 'http://127.0.0.1:8101',
] = process.argv.slice(2);
if (!outDir) throw new Error('usage: restart-check.mjs <outDir> [seconds] [appUrl] [backendUrl]');
fs.mkdirSync(outDir, { recursive: true });
const logFile = path.join(outDir, 'restart-log.json');
const shots = ['01-connected.jpg', '02-backend-stopped-connecting.jpg', '03-reconnected.jpg'];
for (const f of [logFile, ...shots.map((s) => path.join(outDir, s))])
  if (fs.existsSync(f)) throw new Error(`${f} exists; evidence is never overwritten`);

const backendUp = async () => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 800);
  try {
    const r = await fetch(backend + '/api/simulator/stream', { signal: ac.signal });
    ac.abort();
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
};

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1040 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.goto(`${app}/?date=2026-10-21&time=12:39&stadium=off`);
const t0 = Date.now();
const samples = [];
const transitions = [];
let last = { app: '', backend: null };
let shot = 0;
const save = async (i) => {
  await page.screenshot({ path: path.join(outDir, shots[i]), type: 'jpeg', quality: 80 });
  shot = i + 1;
};
while (Date.now() - t0 < Number(secondsArg) * 1000) {
  const t = (Date.now() - t0) / 1000;
  const [text, up, streamRequests] = await Promise.all([
    page.locator('.sim-live').innerText(),
    backendUp(),
    page.evaluate(
      () =>
        performance
          .getEntriesByType('resource')
          .filter((e) => e.name.includes('/api/simulator/stream')).length,
    ),
  ]);
  const appState = text.includes('Simulatorn är ansluten') ? 'connected' : 'connecting';
  const banner = await page.locator('.connection-banner').count();
  const sample = {
    t: +t.toFixed(2),
    app: appState,
    banner: banner > 0,
    backend: up,
    streamRequests,
  };
  samples.push(sample);
  if (appState !== last.app || up !== last.backend) {
    transitions.push(sample);
    console.log(JSON.stringify(sample));
  }
  if (shot === 0 && appState === 'connected') await save(0);
  else if (shot === 1 && appState === 'connecting' && !up) await save(1);
  else if (shot === 2 && appState === 'connected' && up) await save(2);
  last = { app: appState, backend: up };
  await page.waitForTimeout(250);
}
const reloads = await page.evaluate(() => performance.getEntriesByType('navigation').length);
// Derived delays: backend down → app shows "connecting"; backend back → app shows "connected".
const firstAfter = (from, pred) => samples.find((s) => s.t >= from && pred(s));
const down = transitions.find((s, i) => i > 0 && s.backend === false);
const noticed = down && firstAfter(down.t, (s) => s.app === 'connecting');
const back = down && firstAfter(down.t, (s) => s.backend === true);
const recovered = back && firstAfter(back.t, (s) => s.app === 'connected');
const report = {
  note: 'Real backend behind the Vite dev proxy, stopped and restarted by hand during the run. Times in s since page load; backend = direct request to the backend answers 200.',
  navigations: reloads,
  backendDownAt: down?.t ?? null,
  appNoticedAt: noticed?.t ?? null,
  noticeDelayS: down && noticed ? +(noticed.t - down.t).toFixed(2) : null,
  backendBackAt: back?.t ?? null,
  appReconnectedAt: recovered?.t ?? null,
  reconnectDelayS: back && recovered ? +(recovered.t - back.t).toFixed(2) : null,
  transitions,
  screenshots: shots.slice(0, shot),
};
fs.writeFileSync(logFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, transitions: transitions.length }));
await browser.close();
