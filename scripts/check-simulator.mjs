import { chromium } from '@playwright/test';
import fs from 'node:fs';
const baseURL=process.env.E2E_BASE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true,args:['--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[],warnings=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
 const start=Date.now();await page.goto(baseURL);await page.locator('canvas').waitFor({timeout:60000});await page.waitForTimeout(2000);
 fs.mkdirSync('test-results/simulator',{recursive:true});
 await page.screenshot({path:'test-results/simulator/city.png',fullPage:true});
 for(const name of ['overview','airport','f13','police','kungsgatan','soderleden']){
  await page.selectOption('#city-focus',name);await page.waitForTimeout(900);
  await page.locator('.map-panel').screenshot({path:`test-results/simulator/${name}.png`});
 }
 await page.getByRole('button',{name:/Följ flygplanet/}).click();await page.waitForTimeout(1800);
 await page.screenshot({path:'test-results/simulator/plane.png',fullPage:true});
 console.log(JSON.stringify({elapsed:Date.now()-start,errors,warnings,body:await page.locator('.sim-feedback').innerText()}));
 if(errors.length)process.exitCode=1;
}finally{await browser.close();}
