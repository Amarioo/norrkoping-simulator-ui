// Interface U1: screenshots of the page before and after, and the size of the 3D canvas in both.
//   node scripts/interface-u1/shots.mjs <outDir> before=<url> new=<url>
// "new" must be served from an origin the backend allows (commands are sent for the toast picture).
// Never overwrites: stops if <outDir> already holds a file it would write.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [outDir, ...targets] = process.argv.slice(2);
const urls = Object.fromEntries(targets.map((t) => t.split('=')));
if (!outDir || !urls.before || !urls.new) throw new Error('usage: <outDir> before=<url> new=<url>');
fs.mkdirSync(outDir, { recursive: true });
const file = (name) => {
  const f = path.join(outDir, name);
  if (fs.existsSync(f)) throw new Error(`${f} exists (evidence is never overwritten)`);
  return f;
};
const QUERY = '?date=2026-10-21&time=12:39&stadium=off';
const SIZES = [
  [1440, 1040],
  [1920, 1080],
  [1100, 800],
  [390, 844],
];

const browser = await chromium.launch({
  channel: 'msedge',
  args: ['--enable-unsafe-swiftshader'],
});
const open = async (base, width, height) => {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    timezoneId: 'Europe/Stockholm',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(new URL(QUERY, base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.locator('.sim-live i.online').waitFor({ timeout: 30000 });
  await page.waitForTimeout(3000);
  return { context, page, errors };
};
const canvas = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('.map-panel canvas');
    return [c.width, c.height];
  });

const report = { query: QUERY, canvas: {}, errors: {} };
for (const [w, h] of SIZES) {
  const key = `${w}x${h}`;
  report.canvas[key] = {};
  for (const build of ['before', 'new']) {
    const { context, page, errors } = await open(urls[build], w, h);
    report.canvas[key][build] = await canvas(page);
    if (key === '1440x1040' || key === '390x844') {
      const name = key === '390x844' ? 'mobile' : 'desktop';
      if (build === 'new' && name === 'desktop') {
        // Let the line chart collect a few samples first.
        await page.waitForTimeout(9000);
        await page.screenshot({ path: file('new-desktop-trafik.png'), fullPage: true });
        await page.getByRole('tab', { name: 'Tid och ljus' }).click();
        await page.screenshot({ path: file('new-desktop-tid-och-ljus.png'), fullPage: true });
        await page.getByRole('tab', { name: 'Flyg' }).click();
        await page.getByRole('tab', { name: 'Trafik' }).click();
        await page.getByRole('button', { name: /Uppdatera trafiken/ }).click();
        await page.locator('[data-sonner-toast]').first().waitFor();
        await page.waitForTimeout(600);
        await page.screenshot({ path: file('new-desktop-toast.png') });
        await page.locator('.sim-bottom').screenshot({ path: file('new-desktop-charts.png') });
      } else if (build === 'new') {
        await page.screenshot({ path: file('new-mobile.png') });
        await page.getByRole('button', { name: 'Inställningar' }).click();
        await page.getByRole('dialog', { name: 'Inställningar' }).waitFor();
        await page.waitForTimeout(900);
        await page.screenshot({ path: file('new-mobile-drawer.png') });
      } else {
        await page.screenshot({ path: file(`before-${name}.png`), fullPage: name === 'desktop' });
      }
    }
    report.errors[`${key}/${build}`] = errors;
    await context.close();
  }
}
await browser.close();
fs.writeFileSync(file('canvas-sizes.json'), JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify(report.canvas));
