import { test, expect } from '@playwright/test';
import { analyzeTraffic } from '../scripts/step61b/analyze-traffic.mjs';

// Step 6.1b: trucks stay out of the policy trap; buses may cross (route 21 corridor); nobody reverses.
test('live cars cross Bergsbron and policy-restricted traffic avoids its northern trap', async ({
  page,
  request,
}) => {
  test.setTimeout(150000);
  await request.post('/api/simulator/settings', {
    data: {
      compact: 600,
      estate: 170,
      trucks: 150,
      buses: 80,
      trams: 0,
      trains: 0,
      flights: false,
      timeScale: 20,
    },
  });
  await request.post('/api/simulator/reset', { data: {} });
  await request.post('/api/simulator/pause', { data: { paused: true } });
  await page.goto('/?date=2026-10-21&time=21:30');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => {
    const frames: unknown[] = [];
    (globalThis as any).__bridgeFrames = frames;
    const stream = new EventSource('/api/simulator/stream');
    stream.addEventListener('city', (event) => {
      const world = JSON.parse(event.data);
      frames.push({
        time: world.simulationTime,
        vehicles: world.vehicles.filter(
          (v: any) => v.pos[0] > -23 && v.pos[0] < -19 && v.pos[2] > -4 && v.pos[2] < 4,
        ),
      });
    });
  });
  await request.post('/api/simulator/pause', { data: { paused: false } });
  try {
    await expect
      .poll(
        async () => {
          const report = analyzeTraffic(
            await page.evaluate(() => (globalThis as any).__bridgeFrames),
          );
          expect(report.forbiddenEntries).toHaveLength(0);
          expect(report.reversals).toHaveLength(0);
          // Every bus that entered northbound must leave north, never reverse on the deck.
          expect(report.busCrossings.length).toBeGreaterThanOrEqual(
            report.busEntries.filter((e: any) => e.time < report.end - 60).length,
          );
          return report.end > 600 && report.carCrossings.length >= 3;
        },
        { timeout: 100000, intervals: [1000] },
      )
      .toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await request.post('/api/simulator/pause', { data: { paused: true } });
  }
});
