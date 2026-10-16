import {chromium} from '@playwright/test';
const baseURL=process.env.E2E_BASE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({channel:'msedge',args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}});
 await page.goto(baseURL);await page.waitForTimeout(4000);
 const world=await(await page.request.get(baseURL+'/api/simulator/world')).json();
 for(const kind of ['compact','estate','truck']){
  const v=world.vehicles.find(v=>v.kind===kind&&v.speed>10)??world.vehicles.find(v=>v.kind===kind);
  await page.selectOption('#vehicle-select',String(v.id));
  await page.getByRole('button',{name:/Följ fordonet/}).click();await page.waitForTimeout(2500);
  await page.locator('.map-panel').screenshot({path:`test-results/simulator/${kind}.png`});
 }
}finally{await browser.close()}


