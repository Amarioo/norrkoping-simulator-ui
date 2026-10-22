// Fixed Step 6 cameras and lighting states; before/after reuse the same poses and viewport.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2];
const poses = JSON.parse(fs.readFileSync('docs/step6/poses.json'));
poses['bergsbron-north-end'] = { position: [-17.9, 2.8, 2.9], target: [-21.1, 0.8, -0.9] };
const selected = [
  'kungsgatan-street',
  'kungsgatan-elevated',
  'stromparken-path',
  'stromparken-elevated',
  'stadium-pitch-north',
  'stadium-elevated-se',
  'bergsbron-north-end',
];
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const states = {
  day: [759, 'off'],
  sunset: [1056, 'off'],
  twilight: [1072, 'off'],
  night: [1290, 'off'],
  training: [1290, 'training'],
  match: [1290, 'event'],
};
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(
    (process.env.BASE ?? 'http://127.0.0.1:5185/') + '?date=2026-10-21&time=12:39&stadium=off',
  );
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 120000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  const previous = fs.existsSync(`${out}/metadata.json`) ? JSON.parse(fs.readFileSync(`${out}/metadata.json`)) : {};
  const metadata = { ...previous, poses, states, errors, viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1, captures: previous.captures ?? {} };
  for (const [state, [minutes, mode]] of Object.entries(states)) {
    await page.$eval(
      '#light-time',
      (el, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      minutes,
    );
    await page.selectOption('#stadium-lights', mode);
    for (const name of selected) {
      if (only && !only.has(name)) continue;
      if (['training', 'match'].includes(state) && !name.startsWith('stadium')) continue;
      await page.evaluate((pose) => {
        const { camera, controls } = globalThis.__cityCamera;
        camera.position.fromArray(pose.position);
        controls.target.fromArray(pose.target);
        controls.update();
        globalThis.__cityLighting.settle();
      }, poses[name]);
      await page.waitForTimeout(600);
      await page.locator('.map-panel').screenshot({ path: `${out}/${name}-${state}.png` });
      metadata.captures[`${name}-${state}`] = await page.evaluate(() => ({
        lighting: globalThis.__cityLighting.describe(),
        rendering: globalThis.__cityPerformance,
      }));
    }
  }
  fs.writeFileSync(`${out}/metadata.json`, JSON.stringify(metadata, null, 2));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, errors }));
if (errors.length) process.exitCode = 1;
