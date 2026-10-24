// Step 6.1b read-only OSM API lookup of specific ways' current tags. Usage: node scripts/step61b/fetch-osm-ways.mjs <wayId>...
import fs from 'node:fs/promises';
const ids=process.argv.slice(2);
const out=[];
for(let i=0;i<ids.length;i+=100){
  const r=await fetch('https://api.openstreetmap.org/api/0.6/ways.json?ways='+ids.slice(i,i+100).join(','),{headers:{'User-Agent':'NorrkopingSimulator-Step61b/1.0'}});
  if(!r.ok) throw new Error(r.status+' '+await r.text()); out.push(...(await r.json()).elements);
}
const file=new URL('../../work/step61b/osm-ways.json',import.meta.url);
let prev=[];try{prev=JSON.parse(await fs.readFile(file,'utf8')).elements}catch{}
const m=new Map(prev.map(e=>[e.id,e]));out.forEach(e=>m.set(e.id,{...e,retrievedAt:new Date().toISOString()}));
await fs.writeFile(file,JSON.stringify({source:'https://api.openstreetmap.org/api/0.6/ways.json',elements:[...m.values()]}));
for(const e of out)console.log(e.id,'v'+e.version,e.timestamp,JSON.stringify(e.tags));
