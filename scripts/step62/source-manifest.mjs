import fs from 'node:fs';
import crypto from 'node:crypto';
const entries=[
  ['osm-research.json','https://overpass-api.de/api/interpreter','2026-10-23T09:05:06Z','ODbL-1.0'],
  ['trails.html','https://norrkoping.se/se-och-gora/motion-och-idrott/motionsspar',null,null],
  ['municipal.html','https://norrkoping.se/boende-trafik-och-miljo/lantmateri-och-kartor/oppna-kartdata-och-tjanster',null,null],
  ['noka.html','https://norrkoping.se/boende-trafik-och-miljo/lantmateri-och-kartor/norrkopingskartan-noka',null,null],
  ['essp.html','https://aro.lfv.se/content/eaip/AIP%20AMDT%201-2026_2026_08_07/eAIP/ES-AD%202%20ESSP%20NORRK%C3%96PING-KUNGS%C3%84NGEN%201-en-GB.html','2026-08-07',null],
  ['lfv-ad11.html','https://aro.lfv.se/content/eaip/AIP%20AMDT%201-2026_2026_08_07/eAIP/ES-AD%201.1-en-GB.html','2026-08-07',null],
  ['vrinnevi-brochure.pdf','https://uploads.naturkartan-cdn.se/uploads/site_pdf/file/370/6a0e8321fa8e6890361bc9848661402c.pdf','2012-06',null],
  ['vrinnevi-map.pdf','https://norrkoping.se/download/18.5ff942e1184b3f255e2663c6/1485187154271/sparkarta_vrinnevi.pdf','2011-04-16',null],
  ['operator-0.html','https://www.okq8.se/hitta-station',null,null],
  ['operator-1.html','https://www.preem.se/hitta-station/',null,null],
  ['operator-2.html','https://st1.se/hitta-station',null,null],
  ['operator-3.html','https://www.circlek.se/station/circle-k-norrkoping-ingelsta',null,null]
];
const data={retrievedDate:'2026-10-23',note:'Hashes identify read-only local research copies, not a grant to redistribute their content. Dates are source periods as described, not universally survey dates. Scratch is intentionally ignored; no raw material is embedded here.',files:entries.map(([name,url,sourceDate,licence])=>{
  const path='work/step62/'+name,bytes=fs.readFileSync(path);
  return {localPath:path,url,sourceDate,licence,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),redistribution:licence==='ODbL-1.0'?'allowed-with-conditions':'not-verified; reference-only'};
})};
fs.writeFileSync('docs/step62/evidence/source-manifest.json',JSON.stringify(data,null,2)+'\n');
console.log(`Hashed ${data.files.length} local source copies; content stays in ignored scratch.`);
