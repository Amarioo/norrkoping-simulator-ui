// Step 6.1b read-only Overpass extract of mapped turnaround facilities (turning circles/loops, dated).
import fs from 'node:fs/promises';
const query = `[out:json][timeout:90][bbox:58.555,16.065,58.65,16.295];
(node[highway~"^(turning_circle|turning_loop)$"];way[area=yes][highway~"^(turning_circle|turning_loop)$"];);out meta;`;
const url = 'https://overpass-api.de/api/interpreter';
const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query),
  headers: { 'User-Agent': 'NorrkopingSimulator-Step61b/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
  signal: AbortSignal.timeout(120000) });
if (!r.ok) throw new Error('Overpass ' + r.status);
const data = await r.json();
if (data.remark) throw new Error(data.remark);
const dir = new URL('../../work/step61b/', import.meta.url);
await fs.mkdir(dir, { recursive: true });
await fs.writeFile(new URL('osm-turning.json', dir), JSON.stringify(data));
await fs.writeFile(new URL('osm-turning-request.json', dir), JSON.stringify({ url, query, retrievedAt: new Date().toISOString(), osmBase: data.osm3s.timestamp_osm_base }, null, 2) + '\n');
console.log(data.elements.length, data.osm3s.timestamp_osm_base);
