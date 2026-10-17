import { test, expect } from '@playwright/test';

test('collective transport counts, articulated vehicles and following reach the UI through SSE', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const normal = {
    compact: 100,
    estate: 60,
    trucks: 20,
    buses: 12,
    trams: 8,
    trains: 2,
    flights: true,
    timeScale: 3,
  };
  try {
    await request.post('/api/simulator/settings', { data: normal });
    await request.post('/api/simulator/reset', { data: {} });
    await request.post('/api/simulator/pause', { data: { paused: true } });
    await page.goto('/');
    await expect(
      page.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' }),
    ).toBeVisible({ timeout: 30000 });
    for (const [id, value] of [
      ['buses', '5'],
      ['trams', '4'],
      ['trains', '2'],
    ])
      await page.locator('#' + id).fill(value);
    await page.getByRole('button', { name: /Uppdatera trafiken/ }).click();
    await expect(page.locator('.sim-feedback')).toContainText('Trafiken uppdaterad.');
    await expect
      .poll(async () => {
        const w = await (await request.get('/api/simulator/world')).json();
        return ['bus', 'tram', 'train'].map(
          (kind) => w.vehicles.filter((v: { kind: string }) => v.kind === kind).length,
        );
      })
      .toEqual([5, 4, 2]);
    const before = await (await request.get('/api/simulator/world')).json();
    for (const [kind, label, sections] of [
      ['bus', 'Buss', 0],
      ['tram', 'Spårvagn', 5],
      ['train', 'Östgötapendeln', 4],
    ] as const) {
      const vehicle = before.vehicles.find((v: { kind: string }) => v.kind === kind);
      expect(vehicle.sections?.length ?? 0).toBe(sections);
      if (kind === 'tram')
        expect(['Kvarnberget', 'Fridvalla', 'Vidablick', 'Klockaretorpet']).toContain(
          vehicle.destination,
        );
      await expect(page.locator('#vehicle-select option[value="' + vehicle.id + '"]')).toHaveCount(
        1,
      );
      await page.selectOption('#vehicle-select', String(vehicle.id));
      await expect(page.locator('.vehicle-inspector')).toContainText(label);
      if (kind === 'tram')
        await expect(page.locator('.vehicle-inspector')).toContainText(vehicle.destination);
      await page.getByRole('button', { name: /Följ fordonet/ }).click();
      await expect(page.locator('.map-status')).toContainText('FÖLJER FORDON');
    }
    await page.getByRole('button', { name: 'Fortsätt simuleringen' }).click();
    await expect
      .poll(
        async () => {
          const w = await (await request.get('/api/simulator/world')).json();
          return ['bus', 'tram', 'train'].every((kind) =>
            w.vehicles.some((v: any) => v.kind === kind && v.speed > 1),
          );
        },
        { timeout: 20000 },
      )
      .toBe(true);
    for (const id of ['buses', 'trams', 'trains']) await page.locator('#' + id).fill('0');
    await page.getByRole('button', { name: /Uppdatera trafiken/ }).click();
    await expect
      .poll(
        async () =>
          (await (await request.get('/api/simulator/world')).json()).vehicles.filter(
            (v: { kind: string }) => ['bus', 'tram', 'train'].includes(v.kind),
          ).length,
      )
      .toBe(0);
    await expect(page.locator('#vehicle-select option')).toHaveCount(181);
    expect(errors).toEqual([]);
  } finally {
    await request.post('/api/simulator/settings', { data: normal });
    await request.post('/api/simulator/reset', { data: {} });
  }
});
