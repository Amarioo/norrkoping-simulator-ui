// Primary operator discovery only. Does not infer staffing, canopy geometry or lighting hours.
import fs from 'node:fs/promises';
const urls=process.argv.length>2?process.argv.slice(2):['https://st1.se/hitta-station','https://www.circlek.se/stations','https://www.okq8.se/hitta-station','https://www.preem.se/hitta-station/'];
for(const [i,url] of urls.entries()) {
  try {
    const r=await fetch(url,{signal:AbortSignal.timeout(20000)}),html=await r.text();
    await fs.writeFile(`work/step62/operator-${i}.html`,html);
    const links=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g)]
      .map(m=>({url:new URL(m[1],url).href,label:m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}))
      .filter(m=>/norrk(?:ö|o|%C3%B6)ping/i.test(m.url+' '+m.label));
    const ld=[...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)].map(m=>{try{return JSON.parse(m[1])}catch{return null}});
    console.log(JSON.stringify({url,status:r.status,links,ld}));
  } catch(e){console.log(url,e.message)}
}
