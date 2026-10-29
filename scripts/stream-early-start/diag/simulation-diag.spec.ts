// Stream early start: diagnostic copy of tests/simulation.spec.ts up to the second tab, with a
// timeline probe (EventSource, workers, metrics), CDP network times and an optional CPU profile.
// Env: E2E_BASE_URL, VARIANT, DIAG_OUT (jsonl), STOP_AFTER=1, BLANK_FIRST=1, PROFILE=1.
import { test, expect } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import fs from 'node:fs';
const INIT: any = () => {
  const t = ((window as any).__t = {});
  const mark = (k) => {
    if (!(k in t)) t[k] = performance.now();
  };
  (window as any).__mark = mark;
  const ES = window.EventSource;
  window.EventSource = class extends ES {
    constructor(u, o) {
      super(u, o);
      mark('esCreate');
      this.addEventListener('open', () => mark('esOpen'));
      this.addEventListener('city', () => mark('esFirstCity'));
    }
  };
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(u, o) {
      super(u, o);
      const n = o?.name ?? 'w';
      mark('workerCreate');
      this.addEventListener('message', (e) => mark((e.data && e.data.loaded ? 'wLoaded:' : 'wDone:') + n));
    }
  };
  const lt = ((window as any).__lt = []);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) lt.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  const check = () => {
    const m = document.querySelector('.sim-metrics');
    if (!m) return;
    mark('metricsDom');
    if (m.textContent.includes((window as any).__target ?? '60')) mark('metricsTarget');
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true });
};


test('traffic commands, SSE, free camera and vehicle following work together', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post('/api/simulator/settings', {
    data: { compact: 100, estate: 60, trucks: 20, flights: true, timeScale: 3 },
  });
  await request.post('/api/simulator/reset', { data: {} });
  await request.post('/api/simulator/pause', { data: { paused: true } });
  await page.goto('/');
  await expect(page.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' })).toBeVisible(
    { timeout: 30000 },
  );
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fortsätt simuleringen' })).toBeVisible();
  for (const [id, value] of [
    ['compact', '30'],
    ['estate', '20'],
    ['trucks', '10'],
  ])
    await page.locator('#' + id).fill(value);
  await page.getByRole('button', { name: /Uppdatera trafiken/ }).click();
  await expect(page.locator('.sim-feedback')).toContainText('Trafiken uppdaterad.');
  await expect
    .poll(async () => (await (await request.get('/api/simulator/world')).json()).vehicles.length)
    .toBe(60);
  await expect(page.locator('.sim-metrics')).toContainText('60');
  if (process.env.BLANK_FIRST) await page.goto('about:blank');
  const second = await page.context().newPage();
  await second.addInitScript(INIT);
  const cdp = await page.context().newCDPSession(second);
  const net: any[] = [];
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (e: any) => { if (e.type === 'Document' || /stream/.test(e.request.url)) net.push(['req', e.request.url.slice(-30), e.timestamp, e.requestId]); });
  cdp.on('Network.responseReceived', (e: any) => { if (/stream/.test(e.response.url)) net.push(['resp', e.response.url.slice(-30), e.timestamp, e.requestId]); });
  let firstMsg = false;
  cdp.on('Network.eventSourceMessageReceived', (e: any) => { if (!firstMsg) { firstMsg = true; net.push(['msg', e.eventName, e.timestamp, e.requestId]); } });
  const profiling = !!process.env.PROFILE;
  if (profiling) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  const t0 = Date.now();
  await second.goto('/');
  const gotoMs = Date.now() - t0;
  await expect(second.locator('.sim-metrics')).toContainText('60', { timeout: 30000 });
  await second.waitForTimeout(300);
  const r: any = await second.evaluate(() => {
    const w = window as any;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const meas: any = {};
    for (const e of performance.getEntriesByType('measure')) if (e.name.startsWith('city-data')) meas[e.name] = [Math.round(e.startTime), Math.round(e.duration)];
    return { t: Object.fromEntries(Object.entries(w.__t).map(([k, v]: any) => [k, Math.round(v)])), load: Math.round(nav.loadEventEnd), meas, longTasks: w.__lt, buildMs: Math.round(w.__cityPerformance?.buildMs ?? -1) };
  });
  const doc = net.find((n) => n[0] === 'req' && !/stream/.test(n[1]));
  r.net = net.map((n) => [n[0], n[1], Math.round((n[2] - doc[2]) * 1000)]);
  if (profiling) { const { profile } = await cdp.send('Profiler.stop'); (profile as any).docTs = doc[2]; fs.writeFileSync((process.env.DIAG_OUT ?? 'diag') + '.' + Date.now() + '.cpuprofile', JSON.stringify(profile)); }
  r.afterLoadMs = r.t.metricsTarget - r.load; r.gotoMs = gotoMs; r.variant = process.env.VARIANT;
  fs.appendFileSync(process.env.DIAG_OUT ?? 'diag.jsonl', JSON.stringify(r) + String.fromCharCode(10));
  r.gl = await second.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g?.getExtension('WEBGL_debug_renderer_info'); return e ? g!.getParameter(e.UNMASKED_RENDERER_WEBGL) : String(g); });
  r.blankFirst = !!process.env.BLANK_FIRST;
  console.log('DIAG', JSON.stringify(r));
  if (process.env.STOP_AFTER) {
    await second.close();
    await request.post('/api/simulator/settings', { data: { compact: 100, estate: 60, trucks: 20, flights: true, timeScale: 3 } });
    await request.post('/api/simulator/reset', { data: {} });
    return;
  }
  await second.close();
  for (const view of ['airport', 'f13', 'police', 'kungsgatan'])
    await page.selectOption('#city-focus', view);
  const canvas = page.locator('canvas');
  await canvas.focus();
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  await expect
    .poll(async () => Number(await page.locator('.map-panel').getAttribute('data-camera-travel')))
    .toBeGreaterThan(0.1);
  const before = await (await request.get('/api/simulator/world')).json();
  const truck = before.vehicles.find((v: { kind: string }) => v.kind === 'truck');
  await page.selectOption('#vehicle-select', String(truck.id));
  await expect(page.locator('.vehicle-inspector')).toContainText('Lastbil');
  await page.getByRole('button', { name: /Följ fordonet/ }).click();
  await expect(page.locator('.map-status')).toContainText('FÖLJER FORDON');
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Stäng fordonsdetaljer' }).click();
  // Pick the actual moving-instance geometry, not just its dropdown entry.
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing canvas');
  const camera = new PerspectiveCamera(48, bounds.width / bounds.height, 0.015, 2400);
  camera.position.set(
    truck.pos[0] - Math.sin(truck.heading) * 0.85,
    truck.pos[1] + 0.42,
    truck.pos[2] - Math.cos(truck.heading) * 0.85,
  );
  camera.lookAt(truck.pos[0], truck.pos[1], truck.pos[2]);
  camera.updateMatrixWorld();
  const point = new Vector3(truck.pos[0], truck.pos[1] + 0.065, truck.pos[2]).project(camera);
  await page.mouse.click(
    bounds.x + ((point.x + 1) / 2) * bounds.width,
    bounds.y + ((1 - point.y) / 2) * bounds.height,
  );
  await expect(page.locator('.vehicle-inspector')).toContainText('Lastbil');
  await page.getByRole('button', { name: 'Stäng fordonsdetaljer' }).click();
  await page.getByRole('button', { name: /Följ flygplanet/ }).click();
  await expect(page.locator('.map-status')).toContainText('FÖLJER NK-01');
  await page.getByRole('button', { name: 'Fortsätt simuleringen' }).click();
  await expect
    .poll(async () => (await (await request.get('/api/simulator/world')).json()).simulationTime)
    .toBeGreaterThan(before.simulationTime + 0.5);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'test-results/simulator-desktop.png', fullPage: true });
  await page.context().setOffline(true);
  await expect(
    page.locator('.sim-live').filter({ hasText: 'Ansluter till simulatorn…' }),
  ).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' })).toBeVisible(
    { timeout: 15000 },
  );
  await page.getByLabel('Flygtrafik mellan flygplatserna').uncheck();
  await page.getByRole('button', { name: /Uppdatera trafiken/ }).click();
  await expect
    .poll(async () => (await (await request.get('/api/simulator/world')).json()).aircraft.length)
    .toBe(0);
  await expect(page.getByRole('button', { name: /Följ flygplanet/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Återställ simuleringen' }).click();
  await expect(page.locator('.sim-feedback')).toContainText('Simuleringen återställd.');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/simulator-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  // Restore the normal initial scene after this isolated verification run.
  await request.post('/api/simulator/settings', {
    data: { compact: 100, estate: 60, trucks: 20, flights: true, timeScale: 3 },
  });
  await request.post('/api/simulator/reset', { data: {} });
});
