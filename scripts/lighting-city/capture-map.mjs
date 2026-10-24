// Lighting Phase L0: screenshots of the 2D lighting map for the review evidence.
//
//   node scripts/lighting-city/capture-map.mjs [outDir]
//
// Needs the map server (node scripts/lighting-city/serve-map.mjs 5195). Writes PNGs to outDir
// (default work/lighting-city-l0/captures/, ignored). Copy the reviewed set into
// docs/lighting-city-l0/evidence/ once; never overwrite evidence by re-running.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT = process.argv[2] ?? 'work/lighting-city-l0/captures';
const BASE = 'http://127.0.0.1:5195/';
if (fs.existsSync(OUT) && OUT.includes('evidence') && fs.readdirSync(OUT).length)
  throw new Error(`${OUT} already holds evidence; refusing to overwrite`);
fs.mkdirSync(OUT, { recursive: true });

const shots = [
  { name: '01-overview', hash: '' },
  { name: '02-night-glow', hash: 'glow' },
  { name: '03-satellite-2016', hash: 'sat' },
  { name: '04-norrtull', hash: 'way=286445696' },
  { name: '05-centre-glow', hash: 'way=1050773512&glow' },
];
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
for (const s of shots) {
  await page.goto(BASE + (s.hash ? '?' + s.hash : ''), { waitUntil: 'load' });
  await page.waitForTimeout(800);
  if (s.name === '05-centre-glow') {
    // Zoom out from Norrtull to the inner city.
    for (let i = 0; i < 3; i++) await page.click('#zout');
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log(`${OUT}/${s.name}.png`);
}
// Narrow (phone-width) layout check.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/06-phone.png` });
console.log(`${OUT}/06-phone.png`);
await browser.close();
