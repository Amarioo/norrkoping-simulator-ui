"""Export prepared arrays into the existing shared terrain contract (explicit --activate)."""
import base64,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PREPARED=ROOT/'work/geodata/lantmateriet/prepared'
m=json.loads((PREPARED/'manifest.json').read_text())
blobs={name:(PREPARED/f'{name}.f32').read_bytes() for name in ('ground','water')}
revision='lm-laser-'+hashlib.sha256(blobs['ground']+blobs['water']).hexdigest()[:16]
tiles=[]
for name,kind in [('ground','DTM'),('water','water')]:
    tiles.append({ 'id':'norrkoping-'+name,'source':'Laserdata Nedladdning, skog ©Lantmäteriet (bearbetad)',
      'sourceUrl':'https://api.lantmateriet.se/stac-hojd/v1/collections/dsm-skoglig-copc',
      'licence':'CC-BY-4.0','acquired':'2020-02-03/2020-11-23','kind':kind,'resolutionMetres':m['runtimeGridMetres'],
      'verticalAccuracyMetres':None,'verticalDatum':'RH2000','processing':m['processing'],
      **{k:m[k] for k in ('x','z','step','columns','rows')},'heights':[],
      'heightsBase64':base64.b64encode(blobs[name]).decode('ascii') })
dataset={'version':1,'revision':revision,'reference':m['reference'],'tiles':tiles}
content=json.dumps(dataset,separators=(',',':'),ensure_ascii=False)+'\n'
(PREPARED/'terrain.json').write_text(content,encoding='utf8')
if '--activate' in sys.argv:
    current_buildings=json.loads((ROOT/'src/lib/data/buildings-3d.json').read_text(encoding='utf-8-sig'))
    if current_buildings['buildings']:
        raise ValueError('Validate existing measured buildings against the new reference first')
    for target in (ROOT/'src/lib/data/terrain.json',ROOT.parent/'norrkoping-simulator-backend/src/main/resources/terrain.json'):
        target.write_text(content,encoding='utf8')
    building_file=ROOT/'src/lib/data/buildings-3d.json'
    buildings=json.loads(building_file.read_text(encoding='utf-8-sig'))
    if buildings['buildings']:
        raise ValueError('Existing measured buildings must be checked against the new reference before activation')
    buildings['terrainRevision']=revision
    building_file.write_text(json.dumps(buildings)+'\n',encoding='utf8')
print(json.dumps({'revision':revision,'tiles':len(tiles),'status':'activated' if '--activate' in sys.argv else 'staged'}))
