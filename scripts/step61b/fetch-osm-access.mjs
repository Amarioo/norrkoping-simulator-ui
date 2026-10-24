// Step 6.1b read-only Overpass extract: bus relations and access-related highway tags (dated).
import fs from 'node:fs/promises';
const query = `[out:json][timeout:120][bbox:58.555,16.065,58.65,16.295];
(rel[route=bus];rel[route=trolleybus];)->.r;
(way(r.r)[highway];way[highway][bus];way[highway][psv];way[highway=busway];way[highway][service=bus];way[highway]["access:bus"];way[highway][hgv];way[highway~"^(living_street|service)$"][access];way[highway][motor_vehicle];way[highway][motorcar];)->.w;
(.r;.w;);out meta;`;
const url='https://overpass-api.de/api/interpreter';
const r=await fetch(url,{method:'POST',body:'data='+encodeURIComponent(query),headers:{'User-Agent':'NorrkopingSimulator-Step61b/1.0','Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(150000)});
if(!r.ok) throw new Error('Overpass '+r.status+' '+await r.text());
const data=await r.json(); if(data.remark) throw new Error(data.remark);
await fs.mkdir(new URL('../../work/step61b/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../../work/step61b/osm-access.json',import.meta.url),JSON.stringify(data));
await fs.writeFile(new URL('../../work/step61b/osm-access-request.json',import.meta.url),JSON.stringify({url,query,retrievedAt:new Date().toISOString(),osmBase:data.osm3s.timestamp_osm_base},null,2)+'\n');
console.log(data.elements.length, data.osm3s.timestamp_osm_base);
