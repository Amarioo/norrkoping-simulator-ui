import fs from 'node:fs';
import { SCENE_REFERENCE as ref, sceneToSweref } from '../../src/lib/geo/sweref99tm.js';
const root='docs/step62/';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(root+p,JSON.stringify(v,null,2)+'\n');
const fuels=read(root+'evidence/fuel-stations.json');
// Reviewed primary references, 2026-10-23. Identity corroboration is not a lighting survey.
const checked={
  'node/247135502':['https://st1.se/hitta-station','Stockholmsv. listing; exact address match not independently rechecked'],
  'node/247135512':['https://www.circlek.se/stations','INGO Lindovagen name listed'],
  'node/310929394':['https://st1.se/hitta-station','Hagag. listing'],
  'node/529808045':['https://www.circlek.se/station/circle-k-norrkoping-karusellen','Stockholmsvagen 78-80 address corroborated'],
  'node/761744018':['https://www.circlek.se/station/circle-k-norrkoping-ingelsta','Jarngatan 15 address corroborated'],
  'node/1069177545':['https://www.ingo.se/station/ingo-norrkopingde-geersgatan','Kompanigatan 3 address corroborated'],
  'node/1376659170':['https://gasolfyllarna.se/fyllningsstation/norrkoping/','LPG depot, Moa Martinsons gata 14; OSM hours differ from operator'],
  'node/1839935742':['https://st1.se/station/norrkoping-kopparg','Koppargatan 11 address corroborated'],
  'node/2912579680':['https://st1.se/hitta-station','Boktryckarg. listing'],
  'node/2912579681':['https://st1.se/hitta-station','Stockholmsv. 10 listing'],
  'node/1185864032':['https://www.circlek.se/stations','Gamla Ovagen name listed'],
  'way/99263073':['https://www.circlek.se/stations','INGO Vagngatan name listed'],
  'way/108229823':['https://www.circlek.se/stations','Fjarilsgatan name listed'],
  'way/287690914':['https://www.preem.se/stationer/norrkoping-norrkoping-ingelsta/','Koppargatan 2C address corroborated; operator says automatic'],
  'way/287690916':['https://www.circlek.se/stations','INGO Hageby Centrum name listed'],
  'node/247135767':['https://www.okq8.se/hitta-station/norrkoping/norrkoping-exportg-9-tanka','Exportgatan 9 identity corroborated'],
  'node/1107696684':['https://www.okq8.se/hitta-station/norrkoping/norrkoping-hagebygatan','Hagebygatan 241 identity; structured operator service STATION_AUTOMATIC'],
  'node/2516006120':['https://www.okq8.se/hitta-station/norrkoping/norrkoping-stockholmsv-72-74','Stockholmsvagen 72-74 identity; structured operator service STATION_MANNED'],
  'way/157911695':['https://www.okq8.se/hitta-station/norrkoping/norrkoping-skarphagsleden','Skarphagsleden/Vagngatan 25 identity; structured operator service STATION_MANNED'],
  'way/287685611':['https://www.okq8.se/hitta-station/norrkoping/norrkoping-moa-martinssons-g','Moa Martinsons gata 6 identity corroborated'],
  'way/287685623':['https://www.okq8.se/hitta-station/norrkoping/norrkoping-skarblackav','Trafikplats Klinga identity; structured operator service STATION_MANNED; colocated IDS facility needs reconciliation'],
};
for(const f of fuels){
  const c=checked[f.id.replace('osm:','')];
  if(c)f.operatorCorroboration={url:c[0],retrievedDate:'2026-10-23',sourceDate:null,scope:c[1],confirmsLighting:false};
  if(f.id==='osm:way/287690914')f.staffing='unattended (operator: Automat)';
  if(f.id==='osm:node/1376659170')f.staffing='attended LPG service (operator describes personnel)';
  if(f.id==='osm:node/1107696684')f.staffing='unattended (operator service STATION_AUTOMATIC)';
  if(['osm:node/2516006120','osm:way/157911695','osm:way/287685623'].includes(f.id))f.staffing='attended (operator service STATION_MANNED)';
}
write('evidence/fuel-stations.json',fuels);
const operatorCandidates=[
  {id:'operator:ingo:ingelsta-koppargatan',name:'INGO Norrkoping Ingelsta, Koppargatan',address:'Koppargatan 1 B',coordinates:null,source:'https://www.circlek.se/station/ingo-norrkoping-ingelsta-koppargatan',retrievedDate:'2026-10-23',sourceDate:null,status:'operator-listed; reconcile with 32 OSM features before adding a distinct station',licence:null},
  {id:'operator:circlek:truck-zinkgatan',name:'Circle K Truck Norrkoping Zinkgatan',address:'Zinkgatan 10',coordinates:null,source:'https://www.circlek.se/station/circle-k-truck-norrkoping-zinkgatan',retrievedDate:'2026-10-23',sourceDate:null,status:'operator-listed truck facility; reconcile with unnamed OSM/fleet points',licence:null},
  {id:'operator:okq8:malmgatan',name:'OKQ8 Norrkoping Ingelsta',address:'Malmgatan 41',coordinates:null,source:'https://www.okq8.se/hitta-station/norrkoping/norrkoping-ingelsta',retrievedDate:'2026-10-23',sourceDate:null,status:'operator lists fuel and automatic service; no OSM fuel point within 600 m in current extract; acquire licensed location match',licence:null},
  {id:'operator:st1:truck-maskingatan',name:'St1 Truck Norrkoping Masking.',address:'Maskingatan (number unresolved)',coordinates:null,source:'https://st1.se/hitta-station',retrievedDate:'2026-10-23',sourceDate:null,status:'current operator listing; needs OSM/fleet-site reconciliation',licence:null},
  {id:'operator:okq8:ids-klinga',name:'OKQ8 IDS Klinga truck facility',address:'E4 trafikplats Klinga',coordinates:null,source:'https://www.okq8.se/hitta-station/norrkoping/norrkoping-ids-klinga',retrievedDate:'2026-10-23',sourceDate:null,status:'operator lists fuel/automatic service near the staffed Klinga station; likely subfacility of osm:way/287685623, not automatically an extra unique site',licence:null}
];
write('evidence/operator-candidates.json',operatorCandidates);
const cell=v=>String(v??'unknown').replaceAll('|','/').replaceAll('\n',' ');
fs.writeFileSync(root+'fuel-stations.md',`# Fuel-feature review, 2026-10-23\n\nComplete bounded OSM extraction: **32 features**, not a certified unique active station count. Coordinates below are mapped POIs or labelled polygon bounds-midpoint anchors, rounded to metres here; JSON preserves millimetre-format derived values without implying survey accuracy. All exact source URLs, OSM edit/version dates and geometric associations are retained in [fuel-stations.json](evidence/fuel-stations.json).\n\nEvery site still has **unknown canopy, pump-island layout, forecourt/building/sign/parking light installation and real lighting schedule**. Footprint candidates within 60 m are retained for review; they do not prove the correct building or canopy. The three unnamed nodes, LPG, ethanol and fleet points need classification. Raw OSM opening hours are not applied to lighting. Staffing unknown unless explicitly indicated below; shop tags are only clues. Operator checks distinguish name-only from address confirmation.\n\n| OSM feature | Name / operator label | Address from OSM | E / N metres | Primary cross-check | Staffing |\n|---|---|---|---|---|---|\n`+
  fuels.map(f=>`| [${f.id.replace('osm:','')}](${f.geometryReference}) | ${cell(f.name)} | ${cell(f.address)} | ${f.coordinates?.map(Math.round).join(' / ')??'unknown'} | ${f.operatorCorroboration?`[${cell(f.operatorCorroboration.scope)}](${f.operatorCorroboration.url})`:'not independently confirmed'} | ${cell(f.staffing)} |`).join('\n')+
  `\n\nFive operator-listed reconciliation candidates: ${operatorCandidates.map(c=>`[${c.name}, ${c.address}](${c.source})`).join('; ')}. Exact coordinates/runtime footprint match remain null in [operator-candidates.json](evidence/operator-candidates.json). These are not automatically five additional unique stations: IDS Klinga appears colocated with the staffed station, and unidentified fleet points may match other candidates. The OKQ8 directory also includes EV-only addresses and car washes; those were not counted as fuel sites without fuel evidence.\n\nCircle K page metadata generically describes even INGO/truck pages as attended; that template text is not trusted as staffing evidence. Explicit OKQ8 STATION_AUTOMATIC/STATION_MANNED service attributes were used only for matching sites.\n\nProximity-review pairs: Qstar Norra / Preem Spargatan (~58.5 m), unnamed nodes 13625640176 / 13625640177 (~42.1 m). They remain separate source features pending review; do not merge adjacent brands/pumps by distance alone. Preem Ingelsta and St1 Koppargatan are different addresses (2C / 11), and the operator-listed INGO is at 1 B.\n\nOSM base 2026-10-23T09:05:06Z. © OpenStreetMap contributors, ODbL-1.0. Operator facts retrieved 2026-10-23; publication dates not established. No brand artwork, canopy dimensions, fixture positions or light schedules were inferred.\n`);

const evidence=(reference,supports,licence='ODbL-1.0',sourceDate=null)=>({reference,sourceDate,retrievedDate:'2026-10-23',licence,redistribution:licence==='ODbL-1.0'?'allowed-with-conditions':'reference-only',supports});
const base=(id,category,role,name)=>({id,category,role,name,parentId:null,sourceGeometry:null,position:null,geometryType:'unknown',fixtureType:null,orientationGridDegrees:null,mountingHeightM:null,illumination:'unknown',activation:{mode:'unknown',schedule:null,validFrom:null,validTo:null},color:{cctK:null,description:null},evidence:[],confidence:'unknown',positionMethod:'unknown',existingSimulatorAsset:null,requiredGeometry:[],priority:'P2',performanceClass:'unknown',unresolved:[]});
const lamps=read(root+'evidence/mapped-lamps.json'),pilot=read('src/lib/data/streetlights.json').fixtures;
const a=base(lamps[0].id,'street','fixture','OSM mapped street lamp');
a.sourceGeometry='https://www.openstreetmap.org/'+a.id.replace('osm:','');
a.geometryType='Point';a.position={e:lamps[0].coordinates[0],n:lamps[0].coordinates[1],heightRh2000M:null,meaning:'fixture-base'};
a.positionMethod='mapped';a.confidence='medium';a.evidence=[evidence(a.sourceGeometry,['mapped lamp existence','horizontal position'], 'ODbL-1.0',lamps[0].sourceDate)];
a.unresolved=['Operating status, fixture type, base elevation and mounting height not surveyed'];
const p=pilot.find(p=>p.placement==='estimated'),en=sceneToSweref(ref,p.x,p.z);
const b=base('estimate:pilot:'+p.id,'street','fixture','Existing estimated pilot fixture');
b.sourceGeometry='runtime:streetlights.json#'+p.id;b.geometryType='Point';b.position={e:en[0],n:en[1],heightRh2000M:null,meaning:'fixture-base'};
b.positionMethod='estimated';b.illumination='estimated';b.confidence='low';b.existingSimulatorAsset=b.sourceGeometry;b.fixtureType=p.type;b.mountingHeightM=p.heightM;b.color.cctK=p.cct;b.activation.mode='solar-night';b.performanceClass='instanced-static';
b.evidence=[evidence('src/lib/data/streetlights-provenance.json#'+p.id,['estimated position and type','simulation mounting/color/activation'], 'ODbL-1.0','2026-10-21')];
b.unresolved=['All dimensions, photometry and real-world operating state remain estimated'];
const hall=read(root+'evidence/landmarks.json').find(l=>l.name==='Rådhuset');
const c=base('osm:'+hall.id,'landmark','site','Rådhuset');c.sourceGeometry='runtime:norrkoping-map.json#'+hall.id;c.geometryType='Polygon';c.position={e:hall.anchorEN[0],n:hall.anchorEN[1],heightRh2000M:null,meaning:'footprint-bounds-midpoint'};c.positionMethod='derived-anchor';c.existingSimulatorAsset=c.sourceGeometry+'; mapLandmarks.ts tower';c.evidence=[evidence('https://www.openstreetmap.org/'+hall.id,['footprint','anchor'],'ODbL-1.0','2026-10-16')];c.confidence='medium';c.requiredGeometry=['Audit actual tower/spire heights and post-renovation exterior'];
const d=base('component:radhuset:gull-olle','landmark','geometry-prerequisite','Gull-Olle / Sankt Olof');d.parentId=c.id;d.sourceGeometry='parent:'+c.id;d.geometryType='reference';d.requiredGeometry=['Gilded statue at tower apex; orientation/base attachment measurements missing'];d.evidence=[evidence('https://norrkoping.se/kommun-och-politik/om-norrkoping/norrkopings-radhus',['sculpture identity','4.5 m sculpture reference; tower 68 m'],null)];d.confidence='high';d.unresolved=['RH2000 base/top and orientation unknown','Dedicated night illumination unverified'];
const e=base('site:vrinnevi:elljus-loop','forest-trail','route','Vrinnevi illuminated exercise loop');e.geometryType='reference';e.illumination='verified-lit';e.evidence=[evidence('https://norrkoping.se/se-och-gora/motion-och-idrott/motionsspar',['named 2.4 km illuminated route'],null,'2025-02-24')];e.confidence='high';e.unresolved=['Current licensed ordered route required','OSM relation 5703856 is a candidate, not yet a municipal vector match','Pole positions and schedule unknown'];e.requiredGeometry=['Current route/support surfaces before fixtures','Canopy-constrained forest reconstruction'];e.performanceClass='vegetation-lod';
const f=base('site:ESSP:runway09-27','airport','site','ESSP runway 09/27');f.sourceGeometry='runtime:airways/7840051';f.geometryType='LineString';f.illumination='verified-lit';f.activation.mode='operational';f.existingSimulatorAsset=f.sourceGeometry;f.evidence=[evidence('https://aro.lfv.se/content/eaip/AIP%20AMDT%201-2026_2026_08_07/eAIP/ES-AD%202%20ESSP%20NORRK%C3%96PING-KUNGS%C3%84NGEN%201-en-GB.html',['runway identity and published lighting configuration'],null,'2026-08-07')];f.confidence='high';f.requiredGeometry=['Directional approach, threshold/end, PAPI and actual fittings'];f.unresolved=['AIP configuration is not fixture survey or live switch state'];
const g=base(fuels[0].id,'fuel','site',fuels[0].name);g.geometryType='Point';g.position={e:fuels[0].coordinates[0],n:fuels[0].coordinates[1],heightRh2000M:null,meaning:'site-anchor'};g.positionMethod='mapped';g.sourceGeometry=fuels[0].geometryReference;g.confidence='medium';g.evidence=[evidence(g.sourceGeometry,['mapped fuel POI','site anchor'],'ODbL-1.0',fuels[0].sourceDate)];g.unresolved=fuels[0].unresolved;
const raw=read('work/step62/osm-research.json').elements;
const no=raw.find(e=>e.type==='way'&&e.tags?.lit==='no');
const h=base('osm:way/'+no.id,'street','route',no.tags.name??'Explicitly unlit mapped way');h.sourceGeometry='https://www.openstreetmap.org/way/'+no.id;h.geometryType='LineString';h.positionMethod='mapped';h.illumination='mapped-unlit';h.activation.mode='off';h.evidence=[evidence(h.sourceGeometry,['OSM lit=no; fixture generation exclusion'],'ODbL-1.0',no.timestamp)];h.confidence='medium';h.unresolved=['OSM darkness tag not an independent 2026 field survey'];
write('inventory.sample.json',{version:1,targetDate:'2026-10-23',horizontalCrs:'EPSG:3006',verticalDatum:'RH2000',assets:[a,b,c,d,e,f,g,h]});
console.log(`Packaged ${fuels.length} fuel features, ${Object.keys(checked).length} primary identity cross-checks, ${operatorCandidates.length} unresolved operator candidates, 8 registry examples.`);
