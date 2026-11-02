// Phase P2c: close-ups of every runway end (where taxiways join), the same camera in every build, so
// that coplanar pavements (runway surface vs taxiway asphalt, z-fighting) can be compared by eye and
// pixel by pixel. Runway surfaces are found in the running app as the textured, polygon-offset meshes
// of the landmark details group; for each, the two ends of its long axis are taken from its vertices.
// Camera: 1.6 scene units (40 m) above the point 1.2 units inside each end, looking down at it, plus an
// oblique view. Day, traffic off, 1400x1000.
//   node scripts/perf-p2c/airfield-closeups.mjs <shotDir> name=url [name=url ...]
// The first build is the reference for the pixel counts (printed and written to <shotDir>/diff.json).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [shotDir, ...targets] = process.argv.slice(2);
if (!shotDir || !targets.length) throw new Error('usage: <shotDir> name=url ...');
if (fs.existsSync(shotDir)) throw new Error(`${shotDir} exists (evidence is never overwritten)`);
fs.mkdirSync(shotDir, { recursive: true });

const findEnds = () => {
  const tower = globalThis.__perfP1.scene.getObjectByName('police-tower');
  const ends = [];
  tower.parent.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.material.map || !o.material.polygonOffset) return;
    const p = o.geometry.attributes.position;
    const v = (i) => [p.getX(i), p.getY(i), p.getZ(i)];
    const far = (a) => {
      let best = 0,
        d = -1;
      for (let i = 0; i < p.count; i++) {
        const q = v(i),
          e = (q[0] - a[0]) ** 2 + (q[2] - a[2]) ** 2;
        if (e > d) [d, best] = [e, i];
      }
      return v(best);
    };
    const a = far(v(0)),
      b = far(a);
    // Corners a and b are diagonal; the runway axis runs from the middle of one end to the other.
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (len < 5) return;
    const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    // Long axis: principal direction of the vertices.
    let sxx = 0,
      szz = 0,
      sxz = 0;
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i) - c[0],
        dz = p.getZ(i) - c[2];
      sxx += dx * dx;
      szz += dz * dz;
      sxz += dx * dz;
    }
    const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const dir = [Math.cos(angle), Math.sin(angle)];
    let min = Infinity,
      max = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getX(i) - c[0]) * dir[0] + (p.getZ(i) - c[2]) * dir[1];
      min = Math.min(min, t);
      max = Math.max(max, t);
    }
    for (const t of [min + 1.2, max - 1.2])
      ends.push({ x: c[0] + dir[0] * t, y: c[1], z: c[2] + dir[1] * t, dir });
  });
  return ends;
};

const shots = {};
for (const target of targets) {
  const [name, base] = target.split('=');
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(new URL('/?date=2026-10-21&time=12:39&stadium=off', base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 120000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  const ends = await page.evaluate(findEnds);
  shots[name] = [];
  for (const [i, e] of ends.entries())
    for (const view of ['top', 'oblique']) {
      await page.evaluate(
        ({ e, view }) => {
          const { camera, controls } = globalThis.__cityCamera;
          if (view === 'top') camera.position.set(e.x + 0.01, e.y + 1.6, e.z + 0.01);
          else camera.position.set(e.x - e.dir[0] * 1.5 + 0.4, e.y + 0.5, e.z - e.dir[1] * 1.5);
          controls.target.set(e.x, e.y, e.z);
          controls.update();
          globalThis.__cityLighting.settle();
        },
        { e, view },
      );
      await page.waitForTimeout(700);
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      const file = path.join(shotDir, `${name}-end${i + 1}-${view}.png`);
      await page.locator('.map-panel canvas').screenshot({ path: file });
      shots[name].push(file);
    }
  console.log(name, 'ends', ends.length);
  await browser.close();
}
const [ref, ...others] = Object.keys(shots);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const diff = {};
for (const name of others)
  for (const [i, file] of shots[name].entries()) {
    diff[path.basename(file)] = await page.evaluate(
      async ({ a, b }) => {
        const load = async (s) => {
          const img = await createImageBitmap(
            await (await fetch('data:image/png;base64,' + s)).blob(),
          );
          const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
          c.drawImage(img, 0, 0);
          return c.getImageData(0, 0, img.width, img.height).data;
        };
        const [x, y] = await Promise.all([load(a), load(b)]);
        let over8 = 0;
        for (let k = 0; k < x.length; k += 4)
          if (
            Math.max(
              Math.abs(x[k] - y[k]),
              Math.abs(x[k + 1] - y[k + 1]),
              Math.abs(x[k + 2] - y[k + 2]),
            ) > 8
          )
            over8++;
        return over8;
      },
      {
        a: fs.readFileSync(shots[ref][i]).toString('base64'),
        b: fs.readFileSync(file).toString('base64'),
      },
    );
  }
await browser.close();
fs.writeFileSync(path.join(shotDir, 'diff.json'), JSON.stringify(diff, null, 1));
console.log(JSON.stringify(diff));
