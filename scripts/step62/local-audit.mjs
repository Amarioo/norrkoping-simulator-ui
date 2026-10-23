import fs from 'node:fs';
import crypto from 'node:crypto';
import { SCENE_REFERENCE as ref, sceneToSweref, geodeticToScene, geodeticToSweref } from '../../src/lib/geo/sweref99tm.js';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p,j) => fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
const map = read('src/lib/data/norrkoping-map.json');
const network = read('src/lib/data/transport-network.json');
const terrain = read('src/lib/data/terrain.json');
const osm = read('work/step62/osm-research.json');
const request = read('work/step62/osm-request.json');
const routing = read('../norrkoping-simulator-backend/build/step62/routing-audit.json');
fs.mkdirSync('docs/step62/evidence',{recursive:true});
const countBy = (items,key) => items.reduce((o,i)=>(o[key(i)]=(o[key(i)]??0)+1,o),{});
const round = n => Math.round(n*1000)/1000;
const tm = p => sceneToSweref(ref,...p).map(round);
const box = points => [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
const inside = (p,ring) => { let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
  const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
} return yes; };
const inPolygon = (p,b) => inside(p,b.rings[0])&&!b.rings.slice(1).some(r=>inside(p,r));
function centroid(e) {
  if(e.lat!=null)return [e.lat,e.lon];
  const b=e.bounds;if(b)return [(b.minlat+b.maxlat)/2,(b.minlon+b.maxlon)/2];
  if(e.geometry){const a=e.geometry;return [a.reduce((s,p)=>s+p.lat,0)/a.length,a.reduce((s,p)=>s+p.lon,0)/a.length];}
  return null;
}
const centroidScene = b => {const a=box(b.rings.flat());return [(a[0]+a[2])/2,(a[1]+a[3])/2];};
const tile=terrain.tiles[0], ts=ref.metresPerUnit*ref.gridScaleFactor;
const hashes = ['terrain','bridge-profiles','transport-network'].map(name=>{
  const a=fs.readFileSync(`src/lib/data/${name}.json`),b=fs.readFileSync(`../norrkoping-simulator-backend/src/main/resources/${name}.json`);
  return {name,ui:crypto.createHash('sha256').update(a).digest('hex'),backend:crypto.createHash('sha256').update(b).digest('hex'),equal:a.equals(b)};
});
const landmarks = map.buildings.filter(b=>/Rådhuset|Matteus kyrka|Sankt Olai kyrka|S:t Johannes kyrka|Gamla vattentornet|Hedvigs kyrka|Värmekyrkan|Strykjärnet|Polishuset|Resecentrum Norrköping|Vrinnevisjukhuset|Mirum Galleria|Domino$|Linden$/.test(b.name??'')).map(b=>({id:b.id,name:b.name,anchorEN:tm(centroidScene(b)),anchorMethod:'footprint-bounds midpoint; not a fixture or surveyed tower',footprintEN:b.rings.map(r=>r.map(tm)),heightM:b.height*25,heightSource:b.heightSource}));
const litWays=osm.elements.filter(e=>e.type==='way'&&e.tags?.highway&&e.tags.lit);
const mappedLamps=osm.elements.filter(e=>e.tags?.highway==='street_lamp');
const fuels=osm.elements.filter(e=>e.tags?.amenity==='fuel').map(e=>{
  const ll=centroid(e),p=ll?geodeticToScene(ref,...ll):null;
  const contained=p?map.buildings.filter(b=>inPolygon(p,b)).map(b=>b.id):[];
  // A 60 m search is a candidate list, never an identity/canopy inference.
  const nearby=p?map.buildings.filter(b=>Math.hypot(...centroidScene(b).map((v,i)=>v-p[i]))*25<=60).map(b=>({id:b.id,kind:b.kind,heightM:b.height*25})):[];
  return {id:`osm:${e.type}/${e.id}`,name:e.tags.name??e.tags.brand??e.tags.operator??null,operator:e.tags.operator??null,brand:e.tags.brand??null,
    address:[e.tags['addr:street'],e.tags['addr:housenumber']].filter(Boolean).join(' ')||null,
    coordinates:ll?geodeticToSweref(...ll).map(round):null,coordinateMethod:e.type==='node'?'mapped POI':'mapped feature bounds midpoint',
    geometryReference:`https://www.openstreetmap.org/${e.type}/${e.id}`,osmVersion:e.version,sourceDate:e.timestamp,snapshot:request.osmBase,
    shopTag:e.tags.shop??null,openingHoursTag:e.tags.opening_hours??null,staffing:'unknown',
    containingRuntimeFootprints:contained,nearbyRuntimeFootprints60m:nearby,
    canopyPresence:null,pumpIslandArrangement:null,forecourtLighting:'unknown',buildingExteriorLighting:'unknown',signLighting:'unknown',parkingEntryLighting:'unknown',
    operatorCorroboration:null,unresolved:['Confirm active 2026 operator and public vs fleet/LPG use','Match forecourt and canopy geometry','Opening hours do not establish lighting hours']};
});
const duplicateCandidates=[];
for(let i=0;i<fuels.length;i++)for(let j=i+1;j<fuels.length;j++){
  const a=fuels[i],b=fuels[j];if(!a.coordinates||!b.coordinates)continue;
  const d=Math.hypot(a.coordinates[0]-b.coordinates[0],a.coordinates[1]-b.coordinates[1]);
  if(d<60)duplicateCandidates.push({a:a.id,b:b.id,distanceM:round(d),decision:'review; never merge solely by proximity'});
}
const busRelations=osm.elements.filter(e=>e.tags?.route==='bus').map(e=>{
  const ways=e.members.filter(m=>m.type==='way'&&!m.role).map(m=>m.ref);
  return {id:e.id,ref:e.tags.ref??null,name:e.tags.name??null,sourceDate:e.timestamp,
    memberWays:ways.length,intersectRemovedBusWays:ways.filter(id=>routing.bus.removedWays.includes(id)),
    unmappedInRuntime:ways.filter(id=>!network.edges.some(edge=>edge.way===id)).length};
});
const areasSouth=map.areas.filter(a=>a.kind==='wood'&&a.rings[0].some(p=>p[1]>65&&p[0]>-45&&p[0]<100));
const report={date:'2026-10-23',runtimeSnapshot:map.meta.timestamp,inventorySnapshot:request.osmBase,request,
  frame:terrain.reference,clipPolygonEN:map.meta.clip.map(tm),bboxEN:box(map.meta.clip.map(tm)),
  terrain:{...Object.fromEntries(Object.entries(tile).filter(([k])=>!['heights','heightsBase64'].includes(k))),
    swerefBounds:box([tm([tile.x,tile.z]),tm([tile.x+(tile.columns-1)*tile.step,tile.z+(tile.rows-1)*tile.step])]),
    runtimeHeightSamples:tile.columns*tile.rows,runtimeHeightBytes:tile.columns*tile.rows*4,meshTriangles:terrain.mesh.triangles},
  counts:{buildings:map.buildings.length,buildingHeights:countBy(map.buildings,b=>b.heightSource),renderedSegments:countBy(map.roads,r=>r.kind),
    roadClasses:countBy(map.roads,r=>r.class),landCover:countBy(map.areas,a=>a.kind),mappedTrees:map.trees.length,signals:map.signals.length,networkNodes:network.nodes.length,networkEdges:network.edges.length,
    fuelFeatures:fuels.length,mappedLampNodes:mappedLamps.length,taggedLitWays:countBy(litWays,e=>e.tags.lit),busRelations:busRelations.length},
  southernStudyWindow:{note:'Diagnostic scene x -45..100 z>65; NOT the legal reserve boundary',woodFragments:areasSouth.length,mappedTrees:map.trees.filter(p=>p[1]>65&&p[0]>-45&&p[0]<100).length},
  bridges:read('src/lib/data/city-bridges.json').bridges.map(b=>({id:b.id,name:b.name,anchorEN:tm(b.center)})),
  airports:map.airports.map(a=>({...a,startEN:tm(a.start),endEN:tm(a.end)})),
  airways:countBy(map.airways,a=>`${a.historic?'historic':'active'}:${a.kind}`),
  runwayGeometries:map.airways.filter(a=>a.kind==='runway').map(a=>({id:a.id,ref:a.ref,historic:a.historic,surface:a.surface,pointsEN:a.points.map(tm)})),
  transitRoutes:network.transitRoutes.map(r=>({id:r.id,kind:r.kind,stops:r.stops.length,points:r.points.length})),hashes,
  duplicateFuelCandidates:duplicateCandidates,busRelationAudit:busRelations,
  runningRelations:osm.elements.filter(e=>e.tags?.route==='running'||e.tags?.route==='hiking').map(e=>({id:e.id,tags:e.tags,sourceDate:e.timestamp,bounds:e.bounds}))};
write('docs/step62/evidence/coverage.json',report);
write('docs/step62/evidence/landmarks.json',landmarks);
write('docs/step62/evidence/fuel-stations.json',fuels);
write('docs/step62/evidence/routing-audit.json',routing);
write('docs/step62/evidence/mapped-lamps.json',mappedLamps.map(e=>({id:`osm:${e.type}/${e.id}`,coordinates:geodeticToSweref(e.lat,e.lon).map(round),tags:e.tags,sourceDate:e.timestamp,snapshot:request.osmBase,version:e.version})));
write('docs/step62/evidence/facilities.json',osm.elements.filter(e=>
  ['police','fire_station','hospital','charging_station'].includes(e.tags?.amenity)||
  e.tags?.man_made==='water_tower'||e.tags?.historic==='monument'||
  ['sports_centre','stadium'].includes(e.tags?.leisure)).map(e=>{
    const ll=centroid(e);return {id:`osm:${e.type}/${e.id}`,name:e.tags.name??null,tags:e.tags,
      coordinates:ll?geodeticToSweref(...ll).map(round):null,
      coordinateMethod:e.type==='node'?'mapped POI':'mapped feature bounds midpoint',
      sourceDate:e.timestamp,snapshot:request.osmBase};
  }));
console.log(JSON.stringify({bounds:report.bboxEN,counts:report.counts,southernStudyWindow:report.southernStudyWindow,
 duplicateFuelCandidates:duplicateCandidates,busRelationFlags:busRelations.filter(r=>r.intersectRemovedBusWays.length),runningRelations:report.runningRelations},null,2));
