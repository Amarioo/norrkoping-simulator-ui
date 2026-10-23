"""Validate retained research data and registry contract; no simulator build/import.

Use the bundled Python after installing jsonschema into ignored work/step62/python.
"""
from pathlib import Path
import json
import math
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/step62/python'))
from jsonschema import Draft7Validator, FormatChecker

DOC = ROOT / 'docs/step62'
files = sorted(DOC.rglob('*.json'))
data = {p.relative_to(DOC).as_posix(): json.loads(p.read_text(encoding='utf-8')) for p in files}
schema = data['registry.schema.json']
Draft7Validator.check_schema(schema)
Draft7Validator(schema, format_checker=FormatChecker()).validate(data['inventory.sample.json'])

def finite(value):
    if isinstance(value, float):
        assert math.isfinite(value)
    elif isinstance(value, dict):
        for v in value.values(): finite(v)
    elif isinstance(value, list):
        for v in value: finite(v)

for item in data.values(): finite(item)
for name in ['evidence/fuel-stations.json', 'evidence/mapped-lamps.json', 'evidence/facilities.json',
             'evidence/landmarks.json', 'evidence/operator-candidates.json']:
    ids = [x['id'] for x in data[name]]
    assert len(ids) == len(set(ids)), f'Duplicate IDs: {name}'
assets = data['inventory.sample.json']['assets']
ids = {a['id'] for a in assets}
assert len(ids) == len(assets)
for a in assets:
    assert a['parentId'] is None or a['parentId'] in ids
    assert a['positionMethod'] != 'surveyed', 'This sample contains no surveys'
    if a['illumination'] in ['mapped-unlit', 'verified-unlit']:
        assert a['activation']['mode'] == 'off'
        assert a['role'] != 'fixture'

coverage = data['evidence/coverage.json']
assert all(h['equal'] and h['ui'] == h['backend'] for h in coverage['hashes'])
assert len(data['evidence/fuel-stations.json']) == coverage['counts']['fuelFeatures'] == 32
assert len(data['evidence/mapped-lamps.json']) == coverage['counts']['mappedLampNodes'] == 25
assert len(data['evidence/operator-candidates.json']) == 5
for a in data['evidence/operator-candidates.json']:
    assert a['coordinates'] is None
for a in data['evidence/fuel-stations.json'] + data['evidence/mapped-lamps.json']:
    e,n = a['coordinates']
    assert 561000 < e < 576000 and 6490000 < n < 6503000
for kind, expected in [('compact',11), ('truck',125), ('bus',979)]:
    assert data['evidence/routing-audit.json'][kind]['additionalRemoved'] == expected
assert data['evidence/routing-audit.json']['bus']['lostStopNodes'] == [{'id':3183225928, 'name':'Skvallertorget'}]

# Independent projection check against PROJ if installed alongside the existing geo tools.
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
try:
    from pyproj import Transformer
except ImportError:
    projection = 'Not available in this Python ABI; existing independent coordinate tests required separately'
else:
    # Match retained mapped coordinates to raw, licensed OSM input, independently of JS conversion.
    raw = json.loads((ROOT / 'work/step62/osm-research.json').read_text(encoding='utf-8'))
    nodes = {f'osm:{x["type"]}/{x["id"]}': x for x in raw['elements'] if x['type']=='node'}
    transform = Transformer.from_crs(4326,3006,always_xy=True)
    errors=[]
    for p in data['evidence/mapped-lamps.json']:
        node=nodes[p['id']]
        e,n=transform.transform(node['lon'],node['lat'])
        errors.append(math.hypot(e-p['coordinates'][0],n-p['coordinates'][1]))
    assert max(errors)<.002, max(errors)
    projection={'points':len(errors),'maximumErrorM':max(errors),'reference':'PROJ EPSG:4326 -> EPSG:3006; WGS84 treated as SWEREF geographic as existing project contract'}

result={'date':'2026-10-23','jsonFilesValidated':len(files),'schema':'JSON Schema draft-07',
        'registryRecords':len(assets),'duplicateIds':0,'sharedHashesEqual':True,
        'projectionCheck':projection,'notes':['Fuel spatial near-pairs are unresolved, not duplicate IDs',
        'Research records are not simulator visual validation']}
(DOC / 'evidence/validation.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
