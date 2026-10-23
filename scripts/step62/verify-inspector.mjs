import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const browser=await chromium.launch({channel:'msedge'});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1400,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(process.cwd()+'/docs/step62/inventory-map.html').href);
  await page.locator('#centre').click();
  const count=await page.locator('#layer option').count();
  if(count!==6)throw new Error(`Expected all + 5 layers, got ${count}`);
  await page.selectOption('#layer','implemented estimate');
  const canvas=page.locator('canvas'),bounds=await canvas.boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.wheel(0,-100);
  const point=await page.evaluate(()=>{
    const p=data.points.find(p=>p.layer==='implemented estimate');
    return screen(p.en);
  });
  await canvas.click({position:{x:point[0],y:point[1]}});
  if(!(await page.locator('#info').textContent()).includes('implemented estimate'))throw new Error('Marker provenance inspection failed');
  await page.selectOption('#layer','All layers');
  await page.locator('#centre').click();
  await page.screenshot({path:'work/step62/inspector-desktop.png'});
  await page.setViewportSize({width:600,height:900});
  await page.locator('#fit').click();
  await page.screenshot({path:'work/step62/inspector-mobile.png'});
  if(errors.length)throw new Error(errors.join('\n'));
  const report={date:'2026-10-23',errors,layerOptions:count,markerProvenance:true,zoom:true,viewportChecks:['1400x1000','600x900'],scope:'Standalone inventory inspector only; no simulator/photometry validation'};
  fs.writeFileSync('docs/step62/evidence/inspector-check.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{await browser.close()}
