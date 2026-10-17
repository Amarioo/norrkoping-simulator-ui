import { chromium } from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror', e=>console.log('ERROR',e.message));
 page.on('console',m=>{if(['error','warning'].includes(m.type()))console.log(m.type(),m.text())});
 page.on('response',r=>{if(r.url().includes('/api/')||r.url().includes('terrain'))console.log('HTTP',r.status(),r.url())});
 page.on('requestfailed',r=>console.log('FAILED',r.url(),r.failure()));
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'domcontentloaded',timeout:120000});
 console.log('DOM READY');
 await page.locator('#city-focus').waitFor({timeout:120000});
 console.log('FOCUS READY');
 await page.waitForTimeout(3000);
 console.log((await page.locator('body').innerText()).slice(-1800));
 await page.screenshot({path:'test-results/dtm-overview.png'});
 console.log('SCREENSHOT READY');
 for (const focus of ['campus','centrum','bergsbron','saltangsbron','hamnbron','ingelstaBridge','underpass','kungsgatan']) {
   if (!(await page.locator('#city-focus option').evaluateAll(os=>os.map(o=>o.value))).includes(focus)) continue;
   await page.selectOption('#city-focus',focus);
   await page.waitForTimeout(1000);
   await page.screenshot({path:'test-results/dtm-'+focus+'.png'});
 }
 const world=await (await page.request.get('http://127.0.0.1:8081/api/simulator/world')).json();
 console.log('BACKEND REVISION',world.terrainRevision,'VEHICLES',world.vehicles.length);

} finally {await browser.close();}
