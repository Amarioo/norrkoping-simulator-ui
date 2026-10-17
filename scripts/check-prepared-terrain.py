import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/geodata/python'))
import numpy as np
from scipy.ndimage import map_coordinates
folder=ROOT/('work/geodata/lantmateriet/dtm/prepared' if '--dtm' in sys.argv else 'work/geodata/lantmateriet/prepared')
m=json.loads((folder/'manifest.json').read_text())
g=np.fromfile(folder/'ground.f32',dtype='<f4').reshape(m['rows'],m['columns'])
w=np.fromfile(folder/'water.f32',dtype='<f4').reshape(g.shape) if (folder/'water.f32').exists() else np.full_like(g,np.nan)
city=json.loads((ROOT/'src/lib/data/norrkoping-map.json').read_text(encoding='utf-8-sig'))
def sample(points):
    p=np.asarray(points)
    return map_coordinates(g,[(p[:,1]-m['z'])/m['step'],(p[:,0]-m['x'])/m['step']],order=1,mode='constant',cval=np.nan,prefilter=False)
report={}
for name,points in [('roadEndpoints',[p for r in city['roads'] if r['kind']=='road' for p in (r['a'],r['b'])]),('buildingAnchors',[b['rings'][0][0] for b in city['buildings']])]:
    heights=sample(points)
    report[name]={'count':len(points),'missing':int((~np.isfinite(heights)).sum()),'fraction':float(np.isfinite(heights).mean())}
report['groundOrWaterCoverage']=float((np.isfinite(g)|np.isfinite(w)).mean())
report['groundRangeMetres']=[float(np.nanmin(g)),float(np.nanmax(g))]
report['status']='staging-quality-report-not-proof-of-complete-rendering'
(folder/'quality-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
