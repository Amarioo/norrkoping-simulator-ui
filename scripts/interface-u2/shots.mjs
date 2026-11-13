// Interface U2: screenshots of the dark (default) and the light theme.
//   node scripts/interface-u2/shots.mjs <outDir> <url>
// <url> must be an origin the backend allows (a command is sent for the toast picture).
// Never overwrites: stops if <outDir> already holds a file it would write.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [outDir, base] = process.argv.slice(2);
if (!outDir || !base) throw new Error('usage: <outDir> <url>');
fs.mkdirSync(outDir, { recursive: true });
const file = (name) => {
  const f = path.join(outDir, name);
  if (fs.existsSync(f)) throw new Error(`${f} exists (evidence is never overwritten)`);
  return f;
};
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const open = async (query, width, height) => {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    timezoneId: 'Europe/Stockholm',
  });
  const page = await context.newPage();
  await page.goto(new URL('?date=2026-10-21&time=12:39&stadium=off' + query, base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.locator('.sim-live i.online').waitFor({ timeout: 30000 });
  await page.waitForTimeout(9000);
  return { context, page };
};
const report = {};
for (const theme of ['dark', 'light']) {
  // Dark is opened without ?theme= (the default); light through the address.
  const query = theme === 'light' ? '&theme=light' : '';
  {
    const { context, page } = await open(query, 1440, 1040);
    report[theme] = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      canvas: [
        document.querySelector('.map-panel canvas').width,
        document.querySelector('.map-panel canvas').height,
      ],
    }));
    await page.screenshot({ path: file(`${theme}-desktop.png`), fullPage: true });
    await page.getByRole('tab', { name: 'Tid och ljus' }).click();
    await page.locator('.sim-sidebar').screenshot({ path: file(`${theme}-tid-och-ljus.png`) });
    await page.getByRole('tab', { name: 'Trafik' }).click();
    await page.getByRole('button', { name: /Uppdatera trafiken/ }).click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await page.waitForTimeout(600);
    report[theme].toaster = await page
      .locator('[data-sonner-toaster]')
      .getAttribute('data-sonner-theme');
    await page.screenshot({ path: file(`${theme}-desktop-toast.png`) });
    await context.close();
  }
  {
    const { context, page } = await open(query, 390, 844);
    await page.screenshot({ path: file(`${theme}-mobile.png`) });
    await page.getByRole('button', { name: 'Inställningar' }).click();
    await page.getByRole('dialog', { name: 'Inställningar' }).waitFor();
    await page.waitForTimeout(900);
    await page.screenshot({ path: file(`${theme}-mobile-drawer.png`) });
    await context.close();
  }
}
await browser.close();
fs.writeFileSync(file('themes.json'), JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify(report));
