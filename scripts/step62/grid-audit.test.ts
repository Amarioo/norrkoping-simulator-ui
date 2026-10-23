import { expect, test } from 'vitest';
import { buildLightGrid, packGrid, packLamps, type ShaderLamp } from '../../src/lib/lighting/cityLights';

const lamp = (x = 0, z = 0): ShaderLamp => ({ x, z, y: .3, rangeM: 30,
  color: [1,1,1],candela: 1000,profile: 0,baseY:0,clipBelow:false,occlusionM:Array(16).fill(30) });

test('current grid reports overflow and truncates crowded cells to 16', () => {
  const g=buildLightGrid(Array.from({length:17},()=>lamp()),25);
  expect(g.overflow).toBeGreaterThan(0);
  expect(Math.max(...g.cells.map(c=>c.length))).toBe(16);
});
test('current equidistant overflow depends on input order, requiring stable asset tie-breaks', () => {
  const named=Array.from({length:17},(_,id)=>({id:`asset-${id}`,light:lamp()}));
  const selected=(items:typeof named)=>{
    const g=buildLightGrid(items.map(i=>i.light),25);
    return g.cells.find(c=>c.length===16)!.map(i=>items[i].id).sort();
  };
  expect(selected(named)).not.toEqual(selected([...named].reverse()));
});
test('separated lights allocate the empty bounding rectangle and correct texture bytes', () => {
  const lamps=[lamp(),lamp(540,430)];
  const g=buildLightGrid(lamps,25);
  expect(g.columns*g.rows).toBeGreaterThan(230000);
  const gt=packGrid(g),lt=packLamps(lamps);
  expect((gt.image.data as Float32Array).byteLength).toBe(g.columns*g.rows*64);
  expect((lt.image.data as Float32Array).byteLength).toBe(lamps.length*128);
  gt.dispose();lt.dispose();
});
