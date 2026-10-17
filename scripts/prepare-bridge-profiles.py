"""Estimated bridge deck profiles from approach elevations, never terrain below a span."""
import json,sys,math,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/geodata/python'))
import numpy as np
from scipy.ndimage import map_coordinates
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
m=read(ROOT/'work/geodata/lantmateriet/dtm/prepared/manifest.json')
g=np.fromfile(ROOT/'work/geodata/lantmateriet/dtm/prepared/ground.f32',dtype='<f4').reshape(m['rows'],m['columns'])
def node(x,z):
 return float(map_coordinates(g,np.array([[(z-m['z'])/m['step']],[(x-m['x'])/m['step']]]),order=1,mode='nearest',prefilter=False)[0])/25
def ground(x,z):
 step=.4 if abs(x)<64 and abs(z)<64 else 1.6;x0=math.floor(x/step)*step;z0=math.floor(z/step)*step;u=(x-x0)/step;v=(z-z0)/step
 b=node(x0+step,z0);c=node(x0,z0+step)
 return node(x0,z0)*(1-u-v)+b*u+c*v if u+v<=1 else node(x0+step,z0+step)*(u+v-1)+b*(1-v)+c*(1-u)
city=read(ROOT/'src/lib/data/norrkoping-map.json')
def inside(point,ring):
 x,z=point;result=False
 for a,b in zip(ring,ring[1:]+ring[:1]):
  if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:result=not result
 return result
groups={}
owned=set()
details=read(ROOT/'src/lib/data/city-bridges.json')['bridges']
for detail in details:
 roads=[r for r in city['roads'] if r['kind'] in ('road','path','tram','rail') and inside(((r['a'][0]+r['b'][0])/2,(r['a'][1]+r['b'][1])/2),detail['ring']) and (r['kind']!='path' or abs((r['b'][0]-r['a'][0])*math.cos(detail['rotation'])-(r['b'][1]-r['a'][1])*math.sin(detail['rotation']))/max(1e-9,math.dist(r['a'],r['b']))>.7)]
 if roads:
  groups['detail-'+str(detail['id'])]=(roads,detail)
  owned.update(id(r) for r in roads)
for r in city['roads']:
 if id(r) not in owned and r.get('bridge') and r['kind']!='stream':
  groups.setdefault(str(r['way']),([],None))[0].append(r)
points={}
for way,(roads,detail) in groups.items():
 ends=[(tuple(r['a']),r['yA']) for r in roads]+[(tuple(r['b']),r['yB']) for r in roads]
 if detail:
  cx,cz=detail['center'];dx=math.cos(detail['rotation']);dz=-math.sin(detail['rotation']);length=detail['length']
  a=((cx-dx*length/2,cz-dz*length/2),.071)
  b=((cx+dx*length/2,cz+dz*length/2),.071)
 else:
  a,b=max(((p,q) for p in ends for q in ends),key=lambda pair:math.dist(pair[0][0],pair[1][0]))
  length=math.dist(a[0],b[0])
  if length<1e-6:continue
  dx=(b[0][0]-a[0][0])/length;dz=(b[0][1]-a[0][1])/length
 ha=ground(a[0][0]-.4*dx,a[0][1]-.4*dz)+max(.071,a[1])+.02
 hb=ground(b[0][0]+.4*dx,b[0][1]+.4*dz)+max(.071,b[1])+.02
 for (x,z),legacy in ends:
  t=max(0,min(1,((x-a[0][0])*dx+(z-a[0][1])*dz)/length))
  key=f'{x:.3f},{z:.3f},{legacy:.3f}'
  points[key]=ha+(hb-ha)*t+(max(0,legacy-.071) if detail else 0)
# Shared pedestrian nodes must agree even when OSM ways have different layer offsets.
from collections import defaultdict
from scipy.sparse import lil_matrix
from scipy.sparse.linalg import spsolve
paths=[r for r in city['roads'] if r['kind']=='path' and r.get('bridge') and id(r) not in owned]
adj=defaultdict(dict)
for r in paths:
 a,b=tuple(r['a']),tuple(r['b']);w=1/max(.001,math.dist(a,b))
 adj[a][b]=w;adj[b][a]=w
anchors={}
for r in city['roads']:
 if r['kind'] not in ('path','road'):continue
 for p,legacy in [(tuple(r['a']),r['yA']),(tuple(r['b']),r['yB'])]:
  if p not in adj:continue
  if id(r) in owned:
   key=f'{p[0]:.3f},{p[1]:.3f},{legacy:.3f}'
   if key in points:anchors[p]=points[key]
  elif not r.get('bridge'):
   anchors.setdefault(p,ground(*p)+.091)
remaining=set(adj)
while remaining:
 todo=[next(iter(remaining))];component=set()
 while todo:
  p=todo.pop()
  if p in component:continue
  component.add(p);remaining.discard(p);todo.extend(q for q in adj[p] if q not in component)
 fixed={p:anchors[p] for p in component if p in anchors}
 if not fixed:
  # No mapped land connection: retain an explicitly estimated endpoint reference.
  endpoints=[p for p in component if len(adj[p])==1] or [min(component)]
  fixed={p:ground(*p)+.091 for p in endpoints}
 unknown=[p for p in component if p not in fixed];indices={p:i for i,p in enumerate(unknown)}
 A=lil_matrix((len(unknown),len(unknown)));rhs=np.zeros(len(unknown))
 for p,i in indices.items():
  for q,w in adj[p].items():
   A[i,i]+=w
   if q in fixed:rhs[i]+=w*fixed[q]
   else:A[i,indices[q]]-=w
 heights=dict(fixed)
 if unknown:heights.update(zip(unknown,spsolve(A.tocsr(),rhs)))
 for r in city['roads']:
  if r['kind']!='path':continue
  for p,legacy in [(tuple(r['a']),r['yA']),(tuple(r['b']),r['yB'])]:
   if p in heights:points[f'{p[0]:.3f},{p[1]:.3f},{legacy:.3f}']=float(heights[p])
data={'method':'Estimated linear deck between DTM approach heights, not surveyed bridge heights','points':points}
content=json.dumps(data,separators=(',',':'))+'\n'
for p in (ROOT/'src/lib/data/bridge-profiles.json',ROOT.parent/'norrkoping-simulator-backend/src/main/resources/bridge-profiles.json'):p.write_text(content)
print('Bridge profile nodes:',len(points))

# Bump the revision whenever infrastructure/surface rules change so stale servers are rejected.
path=ROOT/'src/lib/data/terrain.json'
dataset=read(path)
base=dataset['revision'].split('-surface-')[0]
dataset['revision']=base+'-surface-'+hashlib.sha256(('surface-grid-10-40-v1'+content).encode()).hexdigest()[:12]
encoded=json.dumps(dataset,ensure_ascii=False,separators=(',',':'))+'\n'
for target in (path,ROOT.parent/'norrkoping-simulator-backend/src/main/resources/terrain.json'):target.write_text(encoded,encoding='utf8')
path=ROOT/'src/lib/data/buildings-3d.json'
buildings=read(path);buildings['terrainRevision']=dataset['revision'];path.write_text(json.dumps(buildings)+'\n')
print('Surface revision:',dataset['revision'])
