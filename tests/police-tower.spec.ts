import { test, expect, type Page } from '@playwright/test';

// Police Tower Phase D1b: the police tower in the running app is built from the LiDAR parts
// (src/lib/landmarks/police/spec.ts, docs/police-tower-d1b/): on the measured frame, its walls end at
// the measured parapet (49.35 m RH2000), the mast at 64.12 m, the walls reach the ground, the emblem
// sits on the SSE gable 7.3 m below the parapet (D1 follow-up scale), six tower meshes, and the shader program count
// stays 20 by day and at night. No backend needed.
const M = 25;
/** docs/police-tower-d1b/data/police-tower-parts.json, frame.gableCentreScene. */
const GABLE = [-28.7668, -24.9247];
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
const setTime = (page: Page, minutes: number) =>
  page.$eval(
    '#light-time',
    (el, v) => {
      (el as HTMLInputElement).value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    minutes,
  );
const programs = (page: Page) =>
  page.evaluate(() => {
    const l = (
      globalThis as unknown as {
        __cityLighting: {
          settle(): void;
          describe(): { programs: number; realtimeLights: Record<string, number> };
        };
      }
    ).__cityLighting;
    l.settle();
    return l.describe();
  });

test('Phase D1b police tower: measured frame, heights, footprint, emblem, programs unchanged', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/?date=2026-10-21&time=12:39&stadium=off');
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 150000 });
  await frames(page);

  const found = await page.evaluate(() => {
    type O = {
      name: string;
      parent: O | null;
      children: O[];
      position: { x: number; y: number; z: number };
      rotation: { y: number };
      geometry?: { attributes: { position: { count: number } } };
      updateMatrixWorld(force: boolean): void;
      traverse(f: (o: O) => void): void;
      getWorldPosition(v: unknown): { toArray(): number[] };
    };
    const l = (globalThis as unknown as { __cityLighting: { group: O } }).__cityLighting;
    let root = l.group;
    while (root.parent) root = root.parent;
    const towers: O[] = [];
    root.traverse((o) => {
      if (o.name === 'police-tower') towers.push(o);
    });
    if (towers.length !== 1) return { count: towers.length };
    const tower = towers[0];
    tower.updateMatrixWorld(true);
    // World-space extent of each tower mesh (vertices through the world matrix).
    const box = (o: O) => {
      const m = o as unknown as {
        geometry: {
          getAttribute(n: string): {
            count: number;
            getX(i: number): number;
            getY(i: number): number;
            getZ(i: number): number;
          };
        };
        matrixWorld: { elements: number[] };
      };
      const p = m.geometry.getAttribute('position'),
        e = m.matrixWorld.elements;
      const lo = [Infinity, Infinity, Infinity],
        hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.count; i++) {
        const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
        const w = [
          e[0] * x + e[4] * y + e[8] * z + e[12],
          e[1] * x + e[5] * y + e[9] * z + e[13],
          e[2] * x + e[6] * y + e[10] * z + e[14],
        ];
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], w[k]);
          hi[k] = Math.max(hi[k], w[k]);
        }
      }
      return { lo, hi };
    };
    const meshes: Record<string, { lo: number[]; hi: number[] }> = {};
    let sign: number[] | null = null;
    for (const c of tower.children)
      if (c.name.startsWith('police-tower-')) meshes[c.name] = box(c);
      else if (c.name === 'police-sign') {
        const v = (c.position as unknown as { clone(): unknown }).clone();
        sign = c.getWorldPosition(v).toArray();
      }
    return {
      count: 1,
      position: [tower.position.x, tower.position.y, tower.position.z],
      rotation: tower.rotation.y,
      meshes,
      sign,
    };
  });
  expect(found.count).toBe(1);
  expect(found.position![0]).toBeCloseTo(-29.0479, 6);
  expect(found.position![1]).toBe(0);
  expect(found.position![2]).toBeCloseTo(-25.8868, 6);
  expect(found.rotation!).toBeCloseTo(0.284254, 5);
  expect(Object.keys(found.meshes!).sort()).toEqual(
    // The façade mesh keeps the earlier slab's name (D1's lit-window tests address it).
    ['coping', 'gable', 'plant', 'roof', 'slab', 'wall'].map((s) => 'police-tower-' + s),
  );
  const m = found.meshes!;
  // Parapet top 49.35 m RH2000 (scene y = RH2000 / 25), the mast 64.12 m.
  expect(m['police-tower-coping'].hi[1] * M).toBeCloseTo(49.35, 2);
  expect(m['police-tower-gable'].hi[1] * M).toBeCloseTo(49.35, 2);
  expect(m['police-tower-plant'].hi[1] * M).toBeCloseTo(64.12, 2);
  // Walls reach down to the lowest rendered ground under the footprint (tower.ts): within 1 m of the
  // LiDAR ground 5–25 m in front of the SSE gable (11.74 m RH2000; the DTM under the tower is 12.2 m).
  const bottom = m['police-tower-gable'].lo[1] * M;
  expect(Math.abs(bottom - 11.74)).toBeLessThan(1);
  for (const s of ['slab', 'wall'])
    expect(m['police-tower-' + s].lo[1]).toBeCloseTo(m['police-tower-gable'].lo[1], 6);
  // The SSE gable: the gable mesh's far end is the measured gable centre (within 0.5 m).
  const g = m['police-tower-gable'];
  const ends = [
    [g.lo[0], g.lo[2]],
    [g.hi[0], g.hi[2]],
  ];
  expect(ends.some(([x]) => x <= GABLE[0] + 0.2 && x >= GABLE[0] - 0.2)).toBe(true);
  // The emblem: 7.3 m below the parapet (42.05 m RH2000), 0.25 m in front of the measured gable.
  const sign = found.sign!;
  expect(sign[1] * M).toBeCloseTo(42.05, 2);
  const dGable = Math.hypot(sign[0] - GABLE[0], sign[2] - GABLE[1]) * M;
  expect(dGable).toBeLessThan(0.5 + 0.25);

  // Programs and realtime lights: unchanged by day and at night.
  const day = await programs(page);
  await setTime(page, 1290);
  await page.waitForTimeout(400);
  await frames(page);
  const night = await programs(page);
  expect(day.programs).toBe(20);
  expect(night.programs).toBe(20);
  expect(night.realtimeLights).toEqual(day.realtimeLights);
  expect(night.realtimeLights.point).toBe(0);
  expect(night.realtimeLights.spot).toBe(0);
  expect(errors).toEqual([]);
});
