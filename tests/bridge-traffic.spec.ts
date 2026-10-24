import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { analyzeTraffic, acceptance, AREA } from '../scripts/step61b/analyze-traffic.mjs';

// Step 6.1b: trucks stay out of the Bergsbron policy trap, cars cross normally, and at least one bus is
// tracked individually from its northbound bridge entry to beyond the Bredgatan junction without
// reversing (verified route 21 corridor). Each requirement is met by one vehicle's own entry episode.
//
// Controlled scenario: Reset builds a fresh seeded RoadTraffic and the service always ticks in 0.05 s
// steps, so this run replays deterministically. The backend test Step61bTrafficRegressionTest replays the
// same scenario (150/50/100/80 at speed 20): bus #359 enters ≈670 s and crosses ≈683 s; the third car
// passage is ≈1,179 s (estate #197 exits onto Bredgatan ≈600 s). Pausing only shifts wall-clock time.
const SCENARIO = {
  compact: 150,
  estate: 50,
  trucks: 100,
  buses: 80,
  trams: 0,
  trains: 0,
  flights: false,
  timeScale: 20,
};
const SIMULATED_LIMIT = 1600; // seconds of simulated time, matching the backend replay's limit

test('a tracked bus and cars cross Bergsbron while trucks avoid its northern trap', async ({
  page,
  request,
}) => {
  test.setTimeout(300000);
  await request.post('/api/simulator/settings', { data: SCENARIO });
  await request.post('/api/simulator/reset', { data: {} });
  await request.post('/api/simulator/pause', { data: { paused: true } });
  await page.goto('/?date=2026-10-21&time=21:30');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate((area) => {
    const frames: unknown[] = [];
    (globalThis as any).__bridgeFrames = frames;
    const stream = new EventSource('/api/simulator/stream');
    stream.addEventListener('city', (event) => {
      const world = JSON.parse(event.data);
      frames.push({
        time: world.simulationTime,
        vehicles: world.vehicles.filter(
          (v: any) =>
            v.pos[0] > area.minX &&
            v.pos[0] < area.maxX &&
            v.pos[2] > area.minZ &&
            v.pos[2] < area.maxZ,
        ),
      });
    });
  }, AREA);
  await request.post('/api/simulator/pause', { data: { paused: false } });
  let report: any, result: any;
  try {
    for (;;) {
      const frames = await page.evaluate(() => (globalThis as any).__bridgeFrames);
      report = analyzeTraffic(frames);
      result = acceptance(report);
      // Definitive violations end the test immediately, with the offending vehicle and time.
      expect(result.failures, JSON.stringify(report.summary)).toEqual([]);
      if (result.ok || (report.end ?? 0) > SIMULATED_LIMIT) break;
      await page.waitForTimeout(1000);
    }
    const crossing = report.busCrossings[0];
    expect(
      result.pending,
      `window ${report.start}–${report.end} s; ${JSON.stringify(report.summary)}`,
    ).toEqual([]);
    // The crossing bus is a single vehicle observed from deck entry to north of the junction.
    expect(crossing.startedBeforeWindow).toBe(false);
    expect(crossing.points[0].pos[2]).toBeGreaterThan(-1.3);
    expect(crossing.points.at(-1).pos[2]).toBeLessThan(-2.5);
    expect(new Set(crossing.points.map((p: any) => p.road))).toContain('Kungsgatan');
    test.info().annotations.push({
      type: 'bus crossing',
      description: `bus #${crossing.id} entered t=${crossing.entered} s, crossed t=${crossing.resolved} s`,
    });
    expect(errors).toEqual([]);
  } finally {
    await request.post('/api/simulator/pause', { data: { paused: true } });
    // Optional evidence export, also on failure: BRIDGE_REPORT=<file.json> (episodes with positions).
    if (process.env.BRIDGE_REPORT && report)
      fs.writeFileSync(
        process.env.BRIDGE_REPORT,
        JSON.stringify({ scenario: SCENARIO, acceptance: result, ...report, errors }, null, 1),
      );
  }
});
