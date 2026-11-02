// Phase P2b diagnostic: are repeated screenshots of an unchanged scene identical? Opens the app
// like tests/lighting.spec.ts (Phase A3: 1400x1000, /api aborted, A1–A3 lighting set, labels off),
// sets the A3 ring pose and takes SHOTS screenshots, three animation frames apart, optionally with a
// lighting controller recreation (RECREATE=1) or a window resize between them. Reports how many
// distinct images there were and how many pixels differ from the first one.
//   node scripts/perf-p2b/shot-stability.mjs <out.json> name=url [name=url ...]
// Env: SHOTS (30), RECREATE (0), ROUNDS (1).
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { host } from '../perf-p1/lib.mjs';

const [out, ...targets] = process.argv.slice(2);
if (!out || !targets.length) throw new Error('usage: <out.json> name=url ...');
if (fs.existsSync(out)) throw new Error(`${out} exists`);
const SHOTS = Number(process.env.SHOTS ?? 30);
const RECREATE = process.env.RECREATE === '1';
const ROUNDS = Number(process.env.ROUNDS ?? 1);
const report = { note: 'P2b shot stability diagnostic', host: host(), SHOTS, RECREATE, runs: [] };

const diff = (page, a, b) =>
  page.evaluate(
    async ({ a, b }) => {
      const load = async (s) => {
        const img = await createImageBitmap(
          await (await fetch('data:image/png;base64,' + s)).blob(),
        );
        const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
        c.drawImage(img, 0, 0);
        return { w: img.width, data: c.getImageData(0, 0, img.width, img.height).data };
      };
      const [x, y] = await Promise.all([load(a), load(b)]);
      let n = 0,
        max = 0;
      const where = [];
      for (let i = 0; i < x.data.length; i += 4) {
        const d = Math.max(
          Math.abs(x.data[i] - y.data[i]),
          Math.abs(x.data[i + 1] - y.data[i + 1]),
          Math.abs(x.data[i + 2] - y.data[i + 2]),
        );
        if (d) {
          n++;
          max = Math.max(max, d);
          if (where.length < 5) where.push([(i / 4) % x.w, Math.floor(i / 4 / x.w), d]);
        }
      }
      return { n, max, where };
    },
    { a: a.toString('base64'), b: b.toString('base64') },
  );

for (let round = 1; round <= ROUNDS; round++)
  for (const target of targets) {
    const [name, base] = target.split('=');
    const browser = await chromium.launch({
      channel: 'msedge',
      args: ['--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.route('**/api/**', (route) => route.abort());
    await page.goto(new URL('/?date=2026-10-21&time=21:30&stadium=off&lighting=a3', base).href);
    await page.locator('[data-map-ready="true"]').waitFor({ timeout: 120000 });
    await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
    await page.locator('.label-toggle input').uncheck();
    await page.evaluate(() => {
      const { camera, controls } = globalThis.__cityCamera;
      camera.position.fromArray([-28.4, 6.0, -19.2]);
      controls.target.fromArray([-28.5, 0.45, -22.1]);
      controls.update();
      globalThis.__cityLighting.settle();
    });
    const frames = () =>
      page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
          ),
      );
    await page.waitForTimeout(3000);
    await frames();
    const map = page.locator('.map-panel canvas');
    const shots = [];
    for (let i = 0; i < SHOTS; i++) {
      if (RECREATE && i) {
        await page.evaluate(() => globalThis.__cityLighting.recreate());
      }
      await frames();
      shots.push(await map.screenshot());
    }
    if (process.env.SAVE_DIR) {
      fs.mkdirSync(process.env.SAVE_DIR, { recursive: true });
      shots.forEach((s, i) =>
        fs.writeFileSync(`${process.env.SAVE_DIR}/${name}-r${round}-${i}.png`, s),
      );
    }
    const distinct = new Set(shots.map((s) => s.toString('base64'))).size;
    const diffs = [];
    for (let i = 1; i < shots.length; i++)
      if (!shots[i].equals(shots[0])) diffs.push({ i, ...(await diff(page, shots[0], shots[i])) });
    const run = { round, name, distinct, differingShots: diffs.length, diffs: diffs.slice(0, 8) };
    report.runs.push(run);
    console.log(
      round,
      name,
      'distinct',
      distinct,
      'differing',
      diffs.length,
      JSON.stringify(diffs.slice(0, 3)),
    );
    await browser.close();
  }
fs.writeFileSync(out, JSON.stringify(report, null, 1));
