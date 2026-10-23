// Read-only causal trace of the Kotlin pruning algorithm, cross-checked against its test report.
import fs from 'node:fs';
import { SCENE_REFERENCE as ref, sceneToSweref } from '../../src/lib/geo/sweref99tm.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const n=read('src/lib/data/transport-network.json'),map=read('src/lib/data/norrkoping-map.json');
const expected=read('docs/step62/evidence/routing-audit.json');
const outgoing=Array.from({length:n.nodes.length},()=>[]);
n.edges.forEach((e,i)=>outgoing[e.from].push(i));
const classes=new Map(map.roads.map(r=>[r.way,r.class]));
const clip=map.meta.clip;
const boundaryDistance=p=>Math.min(...clip.slice(1).map((b,i)=>{
  const a=clip[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));
  return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t)*25;
}));
const report={date:'2026-10-23',note:'Port of production filter for causal diagnostics; retained counts cross-check Kotlin. Boundary proximity suggests clipping, not a physical cul-de-sac survey.',policies:{}};
for(const kind of ['compact','truck','bus']){
  const allowed=i=>(kind!=='truck'||n.edges[i].truck)&&(kind!=='bus'||n.edges[i].bus);
  const candidates=n.edges.map((_,i)=>i).filter(allowed),alive=new Set(candidates);
  const exits=Array.from({length:n.nodes.length},()=>new Map()),incoming=Array.from({length:n.nodes.length},()=>[]);
  for(const i of candidates){const e=n.edges[i];exits[e.from].set(e.to,(exits[e.from].get(e.to)??0)+1);incoming[e.to].push(i)}
  const queue=[],causes=new Map();
  function inspect(node,trigger=null){
    const targets=exits[node];if(targets.size>1)return;
    const only=targets.keys().next().value;
    if(only!==undefined&&outgoing[node].every(i=>n.edges[i].to===only))return;
    const root=trigger===null?node:causes.get(trigger).root;
    for(const id of incoming[node])if(only===undefined||n.edges[id].from===only)queue.push({id,node,trigger,root});
  }
  n.nodes.forEach((_,i)=>inspect(i));
  for(let q=0;q<queue.length;q++){
    const c=queue[q];if(!alive.delete(c.id))continue;
    causes.set(c.id,c);
    const e=n.edges[c.id],m=exits[e.from],count=m.get(e.to)-1;
    if(count===0){m.delete(e.to);inspect(e.from,c.id)}else m.set(e.to,count);
  }
  if(alive.size!==expected[kind].retained)throw new Error(`Kotlin parity failed for ${kind}`);
  function trace(id){
    const c=causes.get(id);if(!c)return {edge:id,retained:true};
    const root=n.nodes[c.root],distance=boundaryDistance([root.x,root.z]);
    const chain=[];let cursor=id;
    while(cursor!==null&&chain.length<25){const x=causes.get(cursor);chain.push({edge:cursor,way:n.edges[cursor].way});cursor=x.trigger;}
    return {edge:id,way:n.edges[id].way,retained:false,seedNode:root.id,
      seedEN:sceneToSweref(ref,root.x,root.z),seedDistanceToClipM:distance,
      seedFullOutgoing:outgoing[c.root].map(i=>({edge:i,way:n.edges[i].way,to:n.nodes[n.edges[i].to].id,class:classes.get(n.edges[i].way)??null,permitted:allowed(i)})),
      cause:outgoing[c.root].some(i=>!allowed(i))?'policy exclusion at seed':outgoing[c.root].length===0?'directed full-graph terminal at seed':'directed trap propagation',chainFirst25:chain};
  }
  report.policies[kind]={retained:alive.size,
    road51:n.edges.map((e,i)=>({e,i})).filter(({e})=>e.way===318001968).map(({i})=>trace(i)),
    lostMappedEnds:expected[kind].lostGenuineEndEdges.map(e=>trace(e.edge))};
}
fs.writeFileSync('docs/step62/evidence/routing-causes.json',JSON.stringify(report,null,2)+'\n');
for(const [k,p]of Object.entries(report.policies))console.log(k,JSON.stringify({road51:p.road51.filter(x=>!x.retained).map(x=>({seed:x.seedNode,distanceM:x.seedDistanceToClipM,cause:x.cause})),lostEnds:p.lostMappedEnds.map(x=>({way:x.way,seed:x.seedNode,distanceM:Math.round(x.seedDistanceToClipM),cause:x.cause}))}));
