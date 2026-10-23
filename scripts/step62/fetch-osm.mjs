// Explicit read-only acquisition; never changes runtime data. No historical date is fabricated.
import fs from 'node:fs/promises';
const query = `[out:json][timeout:90][bbox:58.555,16.065,58.65,16.295];(
nwr[amenity=fuel];node[highway=street_lamp];way[highway][lit];
nwr[amenity~"^(police|fire_station|hospital|charging_station)$"];
nwr[man_made=water_tower];nwr[historic=monument];nwr[leisure~"^(sports_centre|stadium)$"];
relation[route=bus];relation[route~"^(hiking|running|fitness_trail)$"];
);out meta geom;`;
const url = 'https://overpass-api.de/api/interpreter';
const r = await fetch(url + '?data=' + encodeURIComponent(query), {
  headers: {'User-Agent':'NorrkopingSimulator-Step62-Research/1.0'}, signal:AbortSignal.timeout(110000) });
if (!r.ok) throw new Error(`Overpass ${r.status}`);
const data = await r.json();
if (data.remark || !data.elements?.length) throw new Error(data.remark || 'Empty extract');
const out = new URL('../../work/step62/', import.meta.url);
await fs.mkdir(out,{recursive:true});
await fs.writeFile(new URL('osm-research.json',out), JSON.stringify(data));
await fs.writeFile(new URL('osm-request.json',out),JSON.stringify({url,query,retrievedAt:new Date().toISOString(),osmBase:data.osm3s.timestamp_osm_base},null,2)+'\n');
console.log(JSON.stringify({elements:data.elements.length,osmBase:data.osm3s.timestamp_osm_base,
  fuel:data.elements.filter(e=>e.tags?.amenity==='fuel').length,
  lamps:data.elements.filter(e=>e.tags?.highway==='street_lamp').length}));
