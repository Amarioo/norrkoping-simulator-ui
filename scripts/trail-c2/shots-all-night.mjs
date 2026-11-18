// Phase C2, after the switch-off was removed (2026-11-13): the loop from above at 23:30 and 03:00,
// and the "Tid och ljus" tab with Idrottsparken's floodlights as the only light switch.
// Needs a DEV server.   node scripts/trail-c2/shots-all-night.mjs <base-url> <out-dir>
// The out dir must not exist yet (evidence is never overwritten).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('usage: <base-url> <out-dir>');
if (fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);
fs.mkdirSync(out, { recursive: true });
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const r = map.meta.reference,
  unit = r.metresPerUnit * r.gridScaleFactor,
  M = r.metresPerUnit;
const scene = (e, n) => [(e - r.originEasting) / unit, (r.originNorthing - n) / unit];
// The same viewpoint as shots.mjs "loop-top".
const VIEW = { cam: [...scene(569450, 6492690), 900], target: [...scene(569450, 6492700), 0] };

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/**', (route) => route.abort());
const log = [];
for (const time of ['23:30', '03:00']) {
  await page.goto(new URL(`/?date=2026-11-13&time=${time}&stadium=off`, base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await page.evaluate(
    async ({ cam, target, M }) => {
      const { terrain } = await import('/src/lib/terrain.ts');
      globalThis.__cityLighting.settle();
      const { camera, controls } = globalThis.__cityCamera;
      const at = ([x, z, up]) => [x, terrain.groundHeight(x, z) + up / M, z];
      camera.position.set(...at(cam));
      controls.target.set(...at(target));
      controls.update();
    },
    { ...VIEW, M },
  );
  await page.waitForTimeout(1500);
  const file = `loop-top-${time.replace(':', '')}.png`;
  await page.locator('.map-panel').screenshot({ path: path.join(out, file) });
  const d = await page.evaluate(() => globalThis.__cityLighting.describe());
  log.push({ file, time, artificial: d.artificial, programs: d.programs, trail: d.trailLighting });
}
await page.getByRole('tab', { name: 'Tid och ljus' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(out, 'tab-tid-och-ljus.png'), fullPage: true });
const controls = await page.evaluate(() =>
  [...document.querySelectorAll('[role="tabpanel"] select, [role="tabpanel"] input')].map((e) => e.id),
);
fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify({ shots: log, controlsInTab: controls, errors }, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify({ log, controls, errors }, null, 1));
