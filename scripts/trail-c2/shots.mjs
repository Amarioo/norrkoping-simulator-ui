// Phase C2: evidence screenshots of the Vrinnevi illuminated trail from fixed SWEREF viewpoints:
// before (the set without this phase's lanterns, `?lighting=no-c2`) and after at 21:30, after the
// switch-off at 22:30, and by day. No backend needed (the API is blocked).
// Needs a DEV server (the __cityCamera / __cityLighting hooks and module import), e.g. phase0-dev.
//   node scripts/trail-c2/shots.mjs <base-url> <out-dir>
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
/** Scene x, z of a SWEREF 99 TM point. */
const scene = (e, n) => [(e - r.originEasting) / unit, (r.originNorthing - n) / unit];

// Viewpoints: camera and target as SWEREF E, N and metres above the ground at that point.
const VIEWS = [
  // The whole loop from straight above and from the south.
  ['loop-top', { cam: [569450, 6492690, 900], target: [569450, 6492700, 0] }],
  ['loop-from-south', { cam: [569450, 6491900, 300], target: [569400, 6492650, 10] }],
  // The western leg (highway=track, new lanterns), from above the trail looking north.
  ['west-leg-above', { cam: [569200, 6492480, 60], target: [569140, 6492700, 2] }],
  // Eye level on the western leg, looking north along the trail.
  ['west-leg-eye-level', { cam: [569166, 6492602, 1.7], target: [569128, 6492680, 3] }],
  // The northern leg (highway=track, new lanterns) from the north-east.
  ['north-leg-above', { cam: [569420, 6493120, 70], target: [569300, 6492960, 2] }],
  // Where the new lanterns meet L2bc's (the south-western junction of track and path).
  ['seam-south-west', { cam: [569300, 6492400, 55], target: [569236, 6492490, 2] }],
];
const SETS = [
  ['before', '21:30', 'no-c2'],
  ['after', '21:30', null],
  ['after-switched-off', '22:30', null],
  ['after-day', '12:30', null],
];

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/**', (route) => route.abort());
const log = [];
let n = 0;
for (const [label, time, lighting] of SETS) {
  const query = `/?date=2026-11-13&time=${time}&stadium=off${lighting ? `&lighting=${lighting}` : ''}`;
  await page.goto(new URL(query, base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  for (const [name, view] of VIEWS) {
    const placed = await page.evaluate(
      async ({ cam, target, M }) => {
        const { terrain } = await import('/src/lib/terrain.ts');
        globalThis.__cityLighting.settle();
        const { camera, controls } = globalThis.__cityCamera;
        const at = ([x, z, up]) => [x, terrain.groundHeight(x, z) + up / M, z];
        const c = at(cam),
          t = at(target);
        camera.position.set(...c);
        controls.target.set(...t);
        controls.update();
        return { camera: c, target: t };
      },
      {
        cam: [...scene(view.cam[0], view.cam[1]), view.cam[2]],
        target: [...scene(view.target[0], view.target[1]), view.target[2]],
        M,
      },
    );
    await page.waitForTimeout(1500);
    const file = `${String(++n).padStart(2, '0')}-${label}-${name}.png`;
    await page.locator('.map-panel').screenshot({ path: path.join(out, file) });
    const d = await page.evaluate(() => globalThis.__cityLighting.describe());
    log.push({
      file,
      time,
      lighting: lighting ?? 'default',
      sweref: view,
      ...placed,
      programs: d.programs,
      fixtures: d.fixtures,
      trail: d.trailLighting,
    });
  }
}
fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify({ shots: log, errors }, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify({ shots: log.length, errors, last: log.at(-1)?.trail, programs: [...new Set(log.map((l) => l.programs))] }, null, 2));
