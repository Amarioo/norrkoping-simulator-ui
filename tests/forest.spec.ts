import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Phase C1: the LiDAR-measured forest tiles along the northern trail loop in the running app. Their
// trees and forest floors are in the scene, the illustrative planting is gone from the tiles, the
// tallest tree stands as high as measured, and there are no new shader programs (20 by day and at
// night). No backend needed.
const data = JSON.parse(fs.readFileSync('src/lib/data/forest-c1.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const r = map.meta.reference;
const UNIT = r.metresPerUnit * r.gridScaleFactor,
  M = r.metresPerUnit;
type Tile = { e0: number; n0: number; sizeM: number; trees: number[][]; stats: Record<string, number> };
const rectOf = (t: Tile) => ({
  id: `${t.e0}_${t.n0}`,
  x0: (t.e0 - r.originEasting) / UNIT,
  x1: (t.e0 + t.sizeM - r.originEasting) / UNIT,
  z0: (r.originNorthing - t.n0 - t.sizeM) / UNIT,
  z1: (r.originNorthing - t.n0) / UNIT,
});
const TILES = (data.tiles as Tile[]).map(rectOf);
const TOTAL = (data.tiles as Tile[]).reduce((s, t) => s + t.trees.length, 0);
// The pilot tile (the camera looks at it).
const tile = (data.tiles as Tile[]).find((t) => t.e0 === 569250 && t.n0 === 6492500)!;
const RECT = rectOf(tile);
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
    const l = (globalThis as any).__cityLighting;
    l.settle();
    const d = l.describe();
    return { programs: d.programs, realtimeLights: d.realtimeLights, artificial: d.artificial };
  });
/** The forest meshes of the scene, summed over the tiles, and the other trees inside the tiles. */
const forest = (page: Page) =>
  page.evaluate((tiles) => {
    let root = (globalThis as any).__cityLighting.group;
    while (root.parent) root = root.parent;
    const byName: Record<string, any> = {};
    root.traverse((o: any) => {
      if (typeof o.name === 'string' && o.name.startsWith('forest-')) byName[o.name] = o;
    });
    const out = {
      tiles: 0,
      trunks: 0,
      crowns: 0,
      floorTriangles: 0,
      floorOffsetUnits: 0,
      crownsOutsideTile: 0,
      highestCrownTop: -Infinity,
      illustrative: 0,
      geometries: new Set<any>(),
      materials: new Set<any>(),
    };
    let trunkGeometry: any = null;
    const forestMeshes = new Set<any>();
    for (const t of tiles) {
      const trunks = byName['forest-trunks-' + t.id],
        crowns = byName['forest-crowns-' + t.id],
        floor = byName['forest-floor-' + t.id];
      if (!trunks || !crowns || !floor) continue;
      out.tiles++;
      out.trunks += trunks.count;
      out.crowns += crowns.count;
      out.floorTriangles += floor.geometry.getAttribute('position').count / 3;
      out.floorOffsetUnits = floor.material.polygonOffset ? floor.material.polygonOffsetUnits : 0;
      trunkGeometry = trunks.geometry;
      forestMeshes.add(trunks);
      out.geometries.add(trunks.geometry).add(crowns.geometry);
      out.materials.add(trunks.material).add(crowns.material).add(floor.material);
      // A crown lobe's top is its centre plus its vertical half-axis (the length of matrix column 1).
      const c = crowns.instanceMatrix.array;
      for (let i = 0; i < crowns.count; i++) {
        const k = i * 16;
        const x = c[k + 12],
          z = c[k + 14];
        if (x < t.x0 || x >= t.x1 || z < t.z0 || z >= t.z1) out.crownsOutsideTile++;
        out.highestCrownTop = Math.max(
          out.highestCrownTop,
          c[k + 13] + Math.hypot(c[k + 4], c[k + 5], c[k + 6]),
        );
      }
    }
    // Illustrative trees share the trunk geometry: none may be left inside a measured tile.
    root.traverse((o: any) => {
      if (!o.isInstancedMesh || forestMeshes.has(o) || o.geometry !== trunkGeometry) return;
      const a = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        const x = a[i * 16 + 12],
          z = a[i * 16 + 14];
        if (tiles.some((t) => x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1)) out.illustrative++;
      }
    });
    return { ...out, geometries: out.geometries.size, materials: out.materials.size };
  }, TILES);

test('Phase C1 forest: measured trees and forest floors in the 14 tiles, no illustrative trees left, 20 programs', async ({
  page,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (route) => route.abort());
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/?date=2026-10-21&time=12:30&stadium=off');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 150000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await page.waitForTimeout(3000);
  await frames(page);

  const f = await forest(page);
  expect(f.tiles).toBe(TILES.length);
  expect(TILES.length).toBe(14);
  // One trunk and two crown lobes per drawn tree; most of the measured tops are drawn.
  expect(f.trunks).toBeGreaterThan(0.9 * TOTAL);
  expect(f.trunks).toBeLessThanOrEqual(TOTAL);
  expect(f.crowns).toBe(f.trunks * 2);
  expect(f.crownsOutsideTile).toBe(0);
  expect(f.illustrative).toBe(0);
  expect(f.floorTriangles).toBeGreaterThan(1000);
  expect(f.floorOffsetUnits).toBeLessThan(0);
  // All tiles share two geometries (trunk, crown) and three materials (trunk, crown, floor).
  expect(f.geometries).toBe(2);
  expect(f.materials).toBe(3);
  // The highest crown top, taken above the pilot tile's ground: well above the 13 m illustrative
  // trees (the tiles' ground varies, so only a loose upper bound).
  const ground = await page.evaluate(
    async ({ x, z }) => {
      const { terrain } = await import('/src/lib/terrain.ts' as string);
      return terrain.groundHeight(x, z) as number;
    },
    { x: (RECT.x0 + RECT.x1) / 2, z: (RECT.z0 + RECT.z1) / 2 },
  );
  const highest = (f.highestCrownTop - ground) * M;
  expect(highest).toBeGreaterThan(tile.stats.treeHeightP90);
  expect(highest).toBeLessThan(90);

  const day = await programs(page);
  expect(day.artificial).toBe(0);
  expect(day.programs).toBe(20);
  expect(day.realtimeLights).toMatchObject({ point: 0, spot: 0, shadowMaps: 0 });

  // A picture from the south, for the record.
  await page.evaluate(
    async ({ rect, M }) => {
      const { terrain } = await import('/src/lib/terrain.ts' as string);
      const { camera, controls } = (globalThis as any).__cityCamera;
      const cx = (rect.x0 + rect.x1) / 2,
        cz = (rect.z0 + rect.z1) / 2;
      camera.position.set(cx, terrain.groundHeight(cx, rect.z1 + 7) + 110 / M, rect.z1 + 7);
      controls.target.set(cx, terrain.groundHeight(cx, cz) + 10 / M, cz);
      controls.update();
    },
    { rect: RECT, M },
  );
  await page.waitForTimeout(800);
  await frames(page);
  fs.mkdirSync('test-results/forest-c1', { recursive: true });
  await page.locator('.map-panel').screenshot({ path: 'test-results/forest-c1/day.png' });

  // Night: still 20 programs, nothing lit in the forest by this phase.
  await setTime(page, 21 * 60 + 30);
  await frames(page);
  const night = await programs(page);
  expect(night.artificial).toBe(1);
  expect(night.programs).toBe(20);
  await page.locator('.map-panel').screenshot({ path: 'test-results/forest-c1/night.png' });

  fs.writeFileSync(
    'test-results/forest-c1/e2e.json',
    JSON.stringify({ forest: f, highestCrownTopM: highest, day, night }, null, 1),
  );
  expect(errors).toEqual([]);
});
