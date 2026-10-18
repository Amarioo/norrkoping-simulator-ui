import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser = await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
 const started=Date.now();
 await page.goto(process.env.E2E_BASE_URL||'http://127.0.0.1:5174/',{waitUntil:'domcontentloaded',timeout:120000});
 await page.locator('#city-focus').waitFor({timeout:120000});
 // Ground, roads and buildings are built in workers; wait until they are in the scene.
 await page.locator('[data-map-ready="true"]').waitFor({timeout:120000});
 const readyMs=Date.now()-started;
 const results=[];
 for (const view of ['city','parken']) {
  await page.selectOption('#city-focus',view);
  const stats=await page.evaluate(async()=>{
   const samples=[];
   for(let i=0;i<12;i++) {
    await new Promise(r=>requestAnimationFrame(r));
    samples.push({...globalThis.__cityPerformance});
   }
   return {last:samples.at(-1),meanFrameMs:samples.slice(2).reduce((s,x)=>s+x.frameMs,0)/10};
  });
  results.push({view,...stats});
 }
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Performance.enable');
 const metrics=(await cdp.send('Performance.getMetrics')).metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize'].includes(m.name));
 const report={readyMs,results,metrics,errors};
 fs.mkdirSync('test-results',{recursive:true});
 fs.writeFileSync(process.env.PERF_REPORT||'test-results/performance.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
 await page.screenshot({path:process.env.PERF_SCREENSHOT||'test-results/performance.png'});
} finally {await browser.close();}

