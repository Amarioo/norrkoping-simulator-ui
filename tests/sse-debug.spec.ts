import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

// SSE debug panel. No backend needed: the city stream is mocked with page.route. A fulfilled route
// ends the response, so EventSource sees the events, then an error, then reconnects after the
// `retry:` time and gets them again — which also exercises the lifecycle entries. The mock also
// sends a comment and an event name the app does not listen for ("heartbeat"): EventSource cannot
// see those, the raw fetch reader can.
const CITY = JSON.stringify({ sequence: 41, simulationTime: 12.5, vehicles: [], aircraft: [] });
const BODY =
  'retry: 400\n\n' +
  ': kommentar från servern\n\n' +
  `event: city\nid: 41\ndata: ${CITY}\n\n` +
  'event: heartbeat\ndata: ping\n\n';

type Hook = { recording: boolean; listeners: number; rawReaders: number };
const hook = (page: Page) =>
  page.evaluate(() => {
    const h = (globalThis as unknown as { __sseLog?: Hook }).__sseLog;
    return h ? { recording: h.recording, listeners: h.listeners, rawReaders: h.rawReaders } : null;
  });

const mock = async (page: Page) => {
  await page.route('**/api/**', (r) => {
    if (new URL(r.request().url()).pathname === '/api/simulator/stream')
      return r.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: BODY,
      });
    return r.abort();
  });
};
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

test('SSE debug: panel off by default records nothing; L toggles it', async ({ page }) => {
  await mock(page);
  await page.goto('/?date=2026-10-21&time=12:39&stadium=off');
  await expect.poll(() => hook(page)).not.toBeNull();
  await page.waitForTimeout(1500);
  await expect(page.locator('.sse-debug')).toHaveCount(0);
  // Closed panel: no listeners on the app's EventSource, nothing recorded.
  expect(await hook(page)).toEqual({ recording: false, listeners: 0, rawReaders: 0 });
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { __sseLog: { log: { size: number } } }).__sseLog.log.size,
    ),
  ).toBe(0);
  await blur(page);
  await page.keyboard.press('l');
  await expect(page.locator('.sse-debug')).toBeVisible();
  expect((await hook(page))?.recording).toBe(true);
  expect((await hook(page))?.listeners).toBe(1);
  await expect(page.locator('.sse-debug .entry[data-event="city"]').first()).toBeVisible();
  await blur(page);
  await page.keyboard.press('l');
  await expect(page.locator('.sse-debug')).toHaveCount(0);
  expect(await hook(page)).toEqual({ recording: false, listeners: 0, rawReaders: 0 });
});

test('SSE debug: events, counters, lifecycle, filters, expand, copy, pause, clear, raw reader and export', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mock(page);
  await page.goto('/?date=2026-10-21&time=12:39&stadium=off&sse-debug');
  const panel = page.locator('.sse-debug');
  await expect(panel).toBeVisible();
  // Left by default (the fps counter sits bottom-right on the map); the arrow button swaps sides.
  await expect(panel).toHaveAttribute('data-side', 'left');
  await panel.getByRole('button', { name: 'Flytta panelen till höger' }).click();
  await expect(panel).toHaveAttribute('data-side', 'right');
  await panel.getByRole('button', { name: 'Flytta panelen till vänster' }).click();
  await expect(panel).toHaveAttribute('data-side', 'left');

  // Events arrive, newest first, with stream, id and size.
  const city = panel.locator('.entry[data-event="city"]');
  await expect(city.first()).toBeVisible();
  await expect(city.first().locator('.stream')).toHaveText('/api/simulator/stream');
  await expect(city.first().locator('.id')).toHaveText('#41');
  await expect(city.first().locator('.bytes')).toHaveText(`${CITY.length} B`);

  // Each mocked response ends → error → the browser reconnects (lifecycle entries).
  await expect(panel.locator('.entry[data-event="error"]').first()).toBeVisible();
  await expect(panel.locator('.entry[data-event="reconnect"]').first()).toBeVisible({
    timeout: 10000,
  });
  const row = panel.locator('tr[data-channel="/api/simulator/stream"]');
  await expect.poll(async () => Number(await row.getAttribute('data-events'))).toBeGreaterThan(1);

  // EventSource never delivers the unlistened "heartbeat" event or the comment.
  await expect(panel.locator('.entry[data-event="heartbeat"]')).toHaveCount(0);
  await expect(panel.locator('.entry[data-event="comment"]')).toHaveCount(0);

  // Expand: pretty-printed JSON; copy puts the entry (with parsed json) on the clipboard.
  // New events keep arriving at the top, so address the expanded entry, not "the first one".
  await city.first().locator('.row').click();
  const expanded = panel.locator('.entry.open');
  await expect(expanded).toHaveCount(1);
  await expect(expanded).toHaveAttribute('data-event', 'city');
  await expect(expanded.locator('pre.data')).toContainText('"sequence": 41');
  await expanded.locator('.copy').click();
  await expect(expanded.locator('.copy')).toHaveText('Kopierad ✓');
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied).toMatchObject({ event: 'city', lastEventId: '41', json: { sequence: 41 } });

  // Raw reader: its own fetch connection sees every event name and the comment.
  await panel.locator('.raw label', { hasText: '/api/simulator/stream' }).locator('input').check();
  await expect(panel.locator('.entry[data-event="heartbeat"]').first()).toBeVisible();
  await expect(panel.locator('.entry[data-event="comment"]').first()).toBeVisible();
  await expect(
    panel.locator('.entry[data-event="heartbeat"]').first().locator('.stream'),
  ).toHaveText('/api/simulator/stream [rå]');
  expect((await hook(page))?.rawReaders).toBe(1);

  // Filters: text search, event-name chip, stream chip, hide lifecycle.
  const search = panel.getByRole('searchbox', { name: 'Sök i SSE-loggen' });
  await search.fill('ping');
  await expect(panel.locator('.entry')).not.toHaveCount(0);
  for (const ev of await panel
    .locator('.entry')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-event'))))
    expect(ev).toBe('heartbeat');
  await search.fill('');
  await panel.locator('.chip.ev', { hasText: 'city' }).click();
  await panel.getByLabel('Dölj anslutningshändelser').check();
  await expect
    .poll(() =>
      panel
        .locator('.entry')
        .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-event')))]),
    )
    .toEqual(['city']);
  await panel
    .locator('.chips[aria-label="Filtrera på ström"] .chip', {
      hasText: '/api/simulator/stream [rå]',
    })
    .click();
  await expect
    .poll(() =>
      panel
        .locator('.entry .stream')
        .evaluateAll((els) => [...new Set(els.map((e) => e.textContent))]),
    )
    .toEqual(['/api/simulator/stream [rå]']);

  // Pause: counters keep counting, the list stops; Clear empties it.
  await panel.locator('button.pause').click();
  await expect(panel).toHaveAttribute('data-paused', 'true');
  const frozen = await panel.getAttribute('data-total');
  await page.waitForTimeout(1200);
  await expect(panel).toHaveAttribute('data-total', frozen!);
  await expect(panel.locator('.note', { hasText: 'medan loggen var pausad' })).toBeVisible();
  await panel.locator('button.pause').click();
  await panel.locator('button.clear').click();
  await expect(panel).toHaveAttribute('data-paused', 'false');
  await expect.poll(async () => Number(await panel.getAttribute('data-total'))).toBeGreaterThan(0);

  // Export: a JSON file with every stored entry, data parsed where it is JSON.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.locator('button.export').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^sse-logg-.*\.json$/);
  const file = JSON.parse(fs.readFileSync((await download.path())!, 'utf8'));
  expect(file.format).toBe('norrkoping-sse-debug-log/v1');
  expect(file.entries.length).toBeGreaterThan(0);
  const exported = file.entries.find((e: { event: string }) => e.event === 'city');
  expect(exported.json).toEqual(JSON.parse(CITY));
  expect(file.channels.map((c: { channel: string }) => c.channel)).toContain(
    '/api/simulator/stream [rå]',
  );

  // Closing stops recording, the raw reader and all listeners.
  await panel.getByRole('button', { name: 'Stäng SSE-panelen' }).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => hook(page)).toEqual({ recording: false, listeners: 0, rawReaders: 0 });
});
