"""Prepare full-map DTM from class-2 points. Staging only; never mutates active scene data."""
import hashlib
import json
import math
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
import laspy
import numpy as np
from pyproj import CRS
from scipy.ndimage import distance_transform_edt, map_coordinates

NATIVE_STEP = 2.0
RUNTIME_STEP = 5.0
MAX_GROUND_FILL = 20.0
MAX_WATER_FILL = 10.0
DATA = ROOT / 'work/geodata/lantmateriet'
OUT = DATA / 'prepared'


def read_json(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))


def fill_small_holes(grid, radius):
    missing = ~np.isfinite(grid)
    if missing.all():
        return grid, 0
    distance, nearest = distance_transform_edt(missing, return_indices=True)
    fill = missing & (distance <= radius / NATIVE_STEP)
    grid[fill] = grid[tuple(nearest[:, fill])]
    return grid, int(fill.sum())


def native_grids(feature):
    asset = feature['assets']['data']
    filename = asset['href'].rsplit('/', 1)[1]
    file = DATA / filename
    if not file.exists() or file.stat().st_size != asset['file:size']:
        raise ValueError(f'Missing/incomplete delivery: {filename}')
    checksum = hashlib.sha256(file.read_bytes()).hexdigest()
    if '1220' + checksum != asset['file:checksum']:
        raise ValueError(f'Checksum mismatch: {filename}')
    cache = OUT / (feature['id'] + '.npz')
    if cache.exists():
        with np.load(cache) as cached:
            if str(cached['checksum']) == checksum:
                return cached['ground'], cached['water'], read_json(cache.with_suffix('.json'))
    xmin, ymin, xmax, ymax = asset['proj:bbox']
    width, height = math.ceil((xmax-xmin)/NATIVE_STEP), math.ceil((ymax-ymin)/NATIVE_STEP)
    sums = np.zeros((2,height*width), dtype=np.float64)
    counts = np.zeros((2,height*width), dtype=np.uint32)
    with laspy.open(file) as reader:
        crs = reader.header.parse_crs()
        if crs is None or not crs.equals(CRS.from_epsg(5845)):
            raise ValueError(f'Expected verified SWEREF99 TM + RH2000, got {crs}')
        for chunk in reader.chunk_iterator(1_000_000):
            codes = np.asarray(chunk.classification)
            usable = ~np.asarray(chunk.withheld, dtype=bool)
            for index, code in enumerate((2, 9)):
                take = (codes == code) & usable
                x, y, z = np.asarray(chunk.x)[take], np.asarray(chunk.y)[take], np.asarray(chunk.z)[take]
                col, row = np.floor((x-xmin)/NATIVE_STEP).astype(int), np.floor((y-ymin)/NATIVE_STEP).astype(int)
                valid = (col>=0)&(row>=0)&(col<width)&(row<height)&np.isfinite(z)
                ids = row[valid]*width + col[valid]
                sums[index] += np.bincount(ids, weights=z[valid], minlength=height*width)
                counts[index] += np.bincount(ids, minlength=height*width).astype(np.uint32)
    grids = np.full((2,height,width), np.nan, dtype=np.float32)
    for index in range(2):
        np.divide(sums[index], counts[index], out=grids[index].reshape(-1), where=counts[index]>0)
    original_ground = int(np.isfinite(grids[0]).sum())
    ground, ground_filled = fill_small_holes(grids[0], MAX_GROUND_FILL)
    water, water_filled = fill_small_holes(grids[1], MAX_WATER_FILL)
    stats = {'id':feature['id'],'checksum':checksum,'bounds':asset['proj:bbox'],
             'acquired':feature['properties']['datetime'],'crs':'EPSG:5845',
             'nativeGridStepMetres':NATIVE_STEP,'groundCellsObserved':original_ground,
             'groundCellsFilled':ground_filled,'waterCellsFilled':water_filled,
             'groundPoints':int(counts[0].sum()),'waterPoints':int(counts[1].sum()),
             'gridCells':width*height}
    np.savez_compressed(cache,ground=ground,water=water,checksum=checksum)
    cache.with_suffix('.json').write_text(json.dumps(stats,indent=2)+'\n',encoding='utf8')
    return ground,water,stats


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    coverage = read_json(DATA/'coverage-report.json')
    if not coverage['catalogCoversMap'] or not coverage['allFilesPresent']:
        raise ValueError('Full map acquisition is required. Run the downloader first.')
    catalog = read_json(DATA/'catalog.json')
    city = read_json(ROOT/'src/lib/data/norrkoping-map.json')
    ref = read_json(ROOT/'src/lib/data/terrain.json')['reference']
    x0,z0,x1,z1 = city['meta']['bounds']
    step = RUNTIME_STEP/ref['metresPerUnit']
    x0,z0 = math.floor(x0/step)*step, math.floor(z0/step)*step
    columns,rows = math.ceil((x1-x0)/step)+1,math.ceil((z1-z0)/step)+1
    scene_ground = np.full((rows,columns),np.nan,dtype=np.float32)
    scene_water = np.full_like(scene_ground,np.nan)
    if ref.get('crs') != 'EPSG:3006':
        raise ValueError('terrain.json is not in the SWEREF 99 TM scene frame')
    # Scene contract (src/lib/geo/sweref99tm.js): E = E0 + x*unit, N = N0 - z*unit.
    unit = ref['metresPerUnit']*ref['gridScaleFactor']
    reports = []
    for feature in catalog['features']:
        ground,water,stats = native_grids(feature)
        reports.append(stats)
        xmin,ymin,xmax,ymax = stats['bounds']
        local_x = (np.asarray([xmin,xmax])-ref['originEasting'])/unit
        local_z = (ref['originNorthing']-np.asarray([ymin,ymax]))/unit
        c0,c1 = max(0,math.floor((local_x.min()-x0)/step)),min(columns,math.ceil((local_x.max()-x0)/step)+1)
        r0,r1 = max(0,math.floor((local_z.min()-z0)/step)),min(rows,math.ceil((local_z.max()-z0)/step)+1)
        if c0>=c1 or r0>=r1:
            continue
        xs,zs = np.meshgrid(x0+np.arange(c0,c1)*step,z0+np.arange(r0,r1)*step)
        east,north = ref['originEasting']+xs*unit, ref['originNorthing']-zs*unit
        coords = [(north-ymin)/NATIVE_STEP-.5,(east-xmin)/NATIVE_STEP-.5]
        for native,target in ((ground,scene_ground),(water,scene_water)):
            sampled = map_coordinates(native,coords,order=1,mode='constant',cval=np.nan,prefilter=False)
            valid = np.isfinite(sampled)
            target[r0:r1,c0:c1][valid] = sampled[valid]
        print(f"Prepared {len(reports)}/{len(catalog['features'])}: {feature['id']}",flush=True)
    scene_ground.astype('<f4').tofile(OUT/'ground.f32')
    scene_water.astype('<f4').tofile(OUT/'water.f32')
    manifest = {'version':1,'status':'staging-not-active','reference':ref,'x':x0,'z':z0,'step':step,
                'columns':columns,'rows':rows,'runtimeGridMetres':RUNTIME_STEP,
                'nativeGridMetres':NATIVE_STEP,'verticalDatum':'RH2000','format':'little-endian float32; NaN=no-data',
                'groundCoverageFraction':float(np.isfinite(scene_ground).mean()),
                'waterCoverageFraction':float(np.isfinite(scene_water).mean()),
                'processing':'Class 2 ground and class 9 water separately; mean in 2m cells; bounded nearest fill (ground 20m, water 10m); bilinear resampling to 5m preview grid. No height exaggeration. Native 2m grids retained.',
                'sources':reports}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in manifest.items() if k not in ('sources','reference')},indent=2))

if __name__ == '__main__':
    main()
