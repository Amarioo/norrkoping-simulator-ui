import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const paths=['evidence/coverage.json','evidence/landmarks.json','evidence/fuel-stations.json',
  'evidence/facilities.json','evidence/mapped-lamps.json','evidence/routing-audit.json',
  'evidence/routing-causes.json','evidence/operator-candidates.json','evidence/source-manifest.json',
  'inventory.sample.json','fuel-stations.md','inventory-map.html'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync('docs/step62/'+p)).digest('hex')]));
const before=hashes();
for(const script of ['local-audit','routing-causes','package-inventory','build-inspector','source-manifest']){
  const r=spawnSync(process.execPath,[`scripts/step62/${script}.mjs`],{encoding:'utf8'});
  if(r.status!==0)throw new Error(`${script}: ${r.stderr}`);
}
const after=hashes(),changed=paths.filter(p=>before[p]!==after[p]);
if(changed.length)throw new Error('Pinned-input output changed: '+changed.join(', '));
const report={date:'2026-10-23',pinnedLocalInputs:true,generatedFilesCompared:paths.length,byteIdentical:true,hashes:after,
 note:'Repeat local generation only; no live network acquisition. Does not make future Overpass snapshots identical.'};
fs.writeFileSync('docs/step62/evidence/reproducibility.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({generatedFilesCompared:paths.length,byteIdentical:true}));
