"""Prepare the whole current map from verified Lantmateriet 1 m DTM GeoTIFFs.
Native deliveries remain unchanged. Runtime sampling is bilinear, at 5 m spacing.

Scene positions map to SWEREF 99 TM through the shared scene contract (src/lib/geo/sweref99tm.js):
  E = originEasting + x * metresPerUnit * gridScaleFactor
  N = originNorthing - z * metresPerUnit * gridScaleFactor
The contract is read from norrkoping-map.json meta.reference. There is no geographic round trip.

Flags:
  --activate              write the dataset to client and backend, update the building revision and
                          build the adaptive surface mesh (scripts/prepare-terrain-mesh.py)
  --keep-bridge-profiles  with --activate: keep bridge-profiles.json values and only re-derive the
                          surface revision (default re-runs prepare-bridge-profiles.py)
The revision rule (grid hash + surface rules, mesh and bridge profiles) is rtin.surface_revision().
"""
import base64, hashlib, json, math, sys, subprocess
from pathlib import Path
from contextlib import ExitStack
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'work/geodata/python'))
import numpy as np
import rasterio
from rasterio.merge import merge
from pyproj import CRS
from scipy.ndimage import map_coordinates
DATA = ROOT/'work/geodata/lantmateriet/dtm'
OUT = DATA/'prepared'
def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    catalog = read(DATA/'catalog.json')
    coverage = read(DATA/'coverage-report.json')
    if not coverage['catalogCoversMap'] or not coverage['allFilesPresent']:
        raise ValueError('Complete map coverage required')
    meta = read(ROOT/'src/lib/data/norrkoping-map.json')['meta']
    scene = meta.get('reference') or {}
    if scene.get('crs') != 'EPSG:3006':
        raise ValueError('norrkoping-map.json is not in the SWEREF 99 TM scene frame')
    reference = {k: scene[k] for k in ('crs','originEasting','originNorthing','gridScaleFactor',
        'gridConvergenceDegrees','metresPerUnit')}
    reference.update(verticalDatum='RH2000', verticalOriginMetres=0)
    unit = reference['metresPerUnit']*reference['gridScaleFactor']
    bounds = meta['bounds']
    step = 5/reference['metresPerUnit']
    x,z = [math.floor(v/step)*step for v in bounds[:2]]
    columns,rows = math.ceil((bounds[2]-x)/step)+1,math.ceil((bounds[3]-z)/step)+1
    ground = np.full((rows,columns), np.nan, dtype='<f4')
    sources = []
    with ExitStack() as stack:
        rasters = []
        for feature in catalog['features']:
            asset = feature['assets']['data']
            path = DATA/asset['href'].rsplit('/',1)[1]
            with path.open('rb') as stream:
                digest = hashlib.file_digest(stream,'sha256').hexdigest()
            if path.stat().st_size != asset['file:size'] or '1220'+digest != asset['file:checksum']:
                raise ValueError(f'Invalid delivery: {path}')
            raster = stack.enter_context(rasterio.open(path))
            if not CRS(raster.crs).equals(CRS.from_epsg(5845)) or raster.res != (1,1):
                raise ValueError(f'Unexpected CRS/resolution: {path}')
            rasters.append(raster)
            sources.append({'id':feature['id'],'sha256':digest,'properties':feature['properties']})
        eastings = reference['originEasting']+(x+np.arange(columns)*step)*unit
        for row in range(0,rows,128):
            end = min(rows,row+128)
            northings = reference['originNorthing']-(z+np.arange(row,end)*step)*unit
            east,north = np.meshgrid(eastings,northings)
            # Merge native pixels first so interpolation across delivery seams uses both files.
            crop = (math.floor(east.min())-2,math.floor(north.min())-2,
                    math.ceil(east.max())+2,math.ceil(north.max())+2)
            mosaic, affine = merge(rasters,bounds=crop,nodata=np.nan,dtype='float32')
            col = (east-affine.c)/affine.a-.5
            rr = (north-affine.f)/affine.e-.5
            ground[row:end] = map_coordinates(mosaic[0],[rr,col],order=1,mode='constant',cval=np.nan,prefilter=False)
            print(f'DTM rows {end}/{rows}',flush=True)
    fraction = float(np.isfinite(ground).mean())
    if fraction < .999:
        raise ValueError(f'Incomplete DTM coverage: {fraction}')
    blob = ground.tobytes()
    revision = 'lm-dtm-'+hashlib.sha256(blob).hexdigest()[:16]
    processing = ('Native 1 m EPSG:5845 DTM; native tiles mosaicked before bilinear sampling. '
        'Scene grid mapped directly to SWEREF 99 TM (scene contract in reference; no geographic '
        'round trip). Runtime grid 5 m; RH2000 retained; vertical exaggeration 1; no invented relief '
        'or hole filling.')
    manifest = {'reference':reference,'x':x,'z':z,'step':step,'columns':columns,'rows':rows,
        'runtimeGridMetres':5,'nativeGridMetres':1,'processing':processing,'sources':sources,
        'coverage':fraction,'rangeMetres':[float(np.nanmin(ground)),float(np.nanmax(ground))]}
    (OUT/'ground.f32').write_bytes(blob)
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    tile = {'id':'norrkoping-dtm','source':'Markhöjdmodell Nedladdning ©Lantmäteriet (bearbetad)',
        'sourceUrl':'https://api.lantmateriet.se/stac-hojd/v1/collections/dtm-cog',
        'licence':'CC-BY-4.0','acquired': min(f['properties']['start_datetime'] for f in catalog['features'])+'/'+max(f['properties']['end_datetime'] for f in catalog['features']),
        'kind':'DTM','resolutionMetres':5,'verticalAccuracyMetres':max(f['properties']['lagesosakerhethojd'] for f in catalog['features']),
        'verticalDatum':'RH2000','processing':processing,
        **{k:manifest[k] for k in ('x','z','step','columns','rows')},
        'heights':[],'heightsBase64':base64.b64encode(blob).decode('ascii')}
    keep = '--keep-bridge-profiles' in sys.argv
    # The surface mesh and the final revision are added by prepare-terrain-mesh.py (--activate).
    dataset = {'version':2,'revision':revision,'reference':reference,'tiles':[tile]}
    content = json.dumps(dataset,ensure_ascii=False,separators=(',',':'))+'\n'
    (OUT/'terrain.json').write_text(content,encoding='utf8')
    if '--activate' in sys.argv:
        building_path = ROOT/'src/lib/data/buildings-3d.json'
        buildings = read(building_path)
        if buildings['buildings']:
            raise ValueError('Validate measured buildings before changing terrain revision')
        targets = [ROOT/'src/lib/data/terrain.json',
            ROOT.parent/'norrkoping-simulator-backend/src/main/resources/terrain.json',building_path]
        previous = [p.read_bytes() for p in targets]
        buildings['terrainRevision'] = dataset['revision']
        try:
            for target in targets[:2]:
                target.write_text(content,encoding='utf8')
            building_path.write_text(json.dumps(buildings)+'\n',encoding='utf8')
        except Exception:
            for p,old in zip(targets,previous):
                p.write_bytes(old)
            raise
        subprocess.run([sys.executable,str(ROOT/'scripts/prepare-terrain-mesh.py'),'--activate'],check=True)
        if not keep:
            subprocess.run([sys.executable,str(ROOT/'scripts/prepare-bridge-profiles.py')],check=True)
    print(json.dumps({'revision':dataset['revision'],'coverage':fraction,'range':manifest['rangeMetres'],
        'columns':columns,'rows':rows,'status':'activated' if '--activate' in sys.argv else 'staged'}))
if __name__ == '__main__':
    main()
