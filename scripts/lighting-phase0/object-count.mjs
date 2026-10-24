// Lighting Phase 0: live-object counts per prototype (CDP Runtime.queryObjects, probe objects released)
// across street-lighting rebuilds or controller recreations on a DEV server (API aborted).
//
//   node scripts/lighting-phase0/object-count.mjs <baseUrl> reload|recreate [cycles=20]
import { chromium } from '@playwright/test';
const base = process.argv[2],
  action = process.argv[3] ?? 'reload',
  cycles = Number(process.argv[4] ?? 20);
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
await page.route('**/api/**', (r) => r.abort());
await page.goto(base + '?date=2026-10-21&time=21:30&stadium=event');
await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
await page.waitForTimeout(4000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Runtime.enable');
const protos = {
  DataTexture: 'Object.getPrototypeOf(__cityLighting.uniforms.cityLampTex.value)',
  InstancedMesh:
    "Object.getPrototypeOf(__cityLighting.group.getObjectByName('lighting-kungsgatan').children[0])",
  BufferGeometry:
    "Object.getPrototypeOf(__cityLighting.group.getObjectByName('lighting-kungsgatan').children[0].geometry)",
  MeshStandardMaterial:
    "Object.getPrototypeOf(__cityLighting.group.getObjectByName('lighting-kungsgatan').children[0].material)",
  Group: 'Object.getPrototypeOf(__cityLighting.group)',
  Float32Array: 'Float32Array.prototype',
  ArrayBuffer: 'ArrayBuffer.prototype',
  Map: 'Map.prototype',
  Array: 'Array.prototype',
  Object: 'Object.prototype',
  Function: 'Function.prototype',
};
const count = async () => {
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
  const out = {};
  for (const [k, expr] of Object.entries(protos)) {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: expr,
      objectGroup: 'probe',
    });
    const { objects } = await cdp.send('Runtime.queryObjects', {
      prototypeObjectId: result.objectId,
      objectGroup: 'probe',
    });
    const { result: len } = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      functionDeclaration: 'function(){return this.length}',
      returnByValue: true,
    });
    out[k] = len.value;
    await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'probe' }).catch(() => {});
  }
  return out;
};
const fn =
  action === 'reload'
    ? '__cityLighting.reloadStreetLighting()'
    : action === 'recreate'
      ? 'void __cityLighting.recreate()'
      : 'null';
const first = await count();
console.log('start', JSON.stringify(first));
for (let c = 1; c <= cycles; c++) {
  await page.evaluate(fn);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  if (c % 10 === 0) console.log(c, JSON.stringify(await count()));
}
await browser.close();
