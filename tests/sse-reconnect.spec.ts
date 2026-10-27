import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// The city stream must recover by itself after the backend has been away (src/lib/sseWatchdog.ts).
// No backend: the page's /api/simulator/stream request is routed to a small SSE server in this test
// that sends a city snapshot every 100 ms (like the backend) and keeps the connection open.
// "Backend away" is simulated the two ways measured through the Vite dev proxy
// (docs/sse-reconnect/README.md):
// - proxy: open connections go silent (no error) and new requests get 502, after which the
//   browser's EventSource gives up for good;
// - silent: open and new connections stay open but no event arrives.
// Before the fix the page stayed on "Ansluter till simulatorn…" in both cases until reloaded.
const revision = (
  JSON.parse(fs.readFileSync('src/lib/data/terrain.json', 'utf8').replace(/^﻿/, '')) as {
    revision: string;
  }
).revision;

type Mode = 'up' | 'proxy' | 'silent';
const startCity = async () => {
  const state = { mode: 'up' as Mode, connections: 0, sequence: 0 };
  const open = new Set<http.ServerResponse>();
  const server = http.createServer((req, res) => {
    state.connections++;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.write('retry: 1500\n\n');
    // A connection made while the backend is away never delivers events, even after it is back.
    if (state.mode === 'up') open.add(res);
    req.on('close', () => open.delete(res));
  });
  const timer = setInterval(() => {
    if (state.mode !== 'up') return;
    const city = JSON.stringify({
      terrainRevision: revision,
      sequence: ++state.sequence,
      simulationTime: state.sequence / 10,
      paused: false,
      // The app's own defaults (city.svelte.ts); read as soon as it connects.
      settings: {
        compact: 100,
        estate: 60,
        trucks: 20,
        buses: 12,
        trams: 8,
        trains: 2,
        flights: true,
        timeScale: 3,
      },
      vehicles: [],
      aircraft: [],
      completedFlights: 0,
      events: [],
    });
    for (const res of open) res.write(`event: city\nid: ${state.sequence}\ndata: ${city}\n\n`);
  }, 100);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/stream`;
  // Going away: the backend's old connections stop sending (they are never resumed).
  const away = (mode: Exclude<Mode, 'up'>) => {
    state.mode = mode;
    open.clear();
  };
  const close = async () => {
    clearInterval(timer);
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  };
  return { state, url, away, close };
};

const route = async (page: Page, city: Awaited<ReturnType<typeof startCity>>) => {
  let badGateway = 0;
  await page.route('**/api/**', (r) => {
    if (new URL(r.request().url()).pathname !== '/api/simulator/stream') return r.abort();
    if (city.state.mode === 'proxy') {
      badGateway++;
      return r.fulfill({ status: 502, contentType: 'text/plain', body: 'Bad Gateway' });
    }
    return r.continue({ url: city.url });
  });
  return () => badGateway;
};
const live = (page: Page) => page.locator('.sim-live');

for (const mode of ['proxy', 'silent'] as const) {
  test(`city stream reconnects by itself after the backend was away (${mode})`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const city = await startCity();
    try {
      const badGateways = await route(page, city);
      await page.goto('/?date=2026-10-21&time=12:39&stadium=off');
      await expect(live(page)).toContainText('Simulatorn är ansluten', { timeout: 30000 });
      // Stays connected while events flow (no needless reconnects).
      await page.waitForTimeout(3000);
      expect(city.state.connections).toBe(1);

      city.away(mode);
      // Noticed within the silence limit (5 s) plus one check (1 s).
      await expect(live(page)).toContainText('Ansluter till simulatorn…', { timeout: 8000 });
      await expect(page.locator('.connection-banner')).toBeVisible();
      await page.waitForTimeout(8000);
      if (mode === 'proxy') expect(badGateways()).toBeGreaterThan(0);
      else expect(city.state.connections).toBeGreaterThan(1);

      city.state.mode = 'up';
      // Retries back off up to 10 s; 25 s covers the worst case.
      await expect(live(page)).toContainText('Simulatorn är ansluten', { timeout: 25000 });
      await expect(page.locator('.connection-banner')).toHaveCount(0);
      // The page was not reloaded.
      expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
    } finally {
      await city.close();
    }
  });
}
