"""Inspect real LAS/LAZ deliveries without modifying or activating simulator data."""
import json
import sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
LOCAL_PACKAGES = ROOT / 'work/geodata/python'
if LOCAL_PACKAGES.is_dir():
    sys.path.insert(0, str(LOCAL_PACKAGES))
import laspy
import numpy as np


def inspect_file(file):
    classes = Counter()
    ground_count = 0
    ground_min, ground_max = float('inf'), float('-inf')
    with laspy.open(file) as reader:
        crs = reader.header.parse_crs()
        if crs is None:
            raise ValueError(f'Missing CRS in {file.name}; refusing to guess')
        report = {'file': file.name, 'points': reader.header.point_count,
                  'crs': crs.to_string(), 'crsName': crs.name,
                  'axes': [{'name': a.name, 'unit': a.unit_name} for a in crs.axis_info],
                  'bounds': [reader.header.mins.tolist(), reader.header.maxs.tolist()]}
        for chunk in reader.chunk_iterator(1_000_000):
            codes, counts = np.unique(np.asarray(chunk.classification), return_counts=True)
            classes.update({str(int(k)): int(v) for k,v in zip(codes, counts)})
            usable = (np.asarray(chunk.classification) == 2) & ~np.asarray(chunk.withheld, dtype=bool)
            heights = np.asarray(chunk.z)[usable]
            heights = heights[np.isfinite(heights)]
            if len(heights):
                ground_count += len(heights)
                ground_min = min(ground_min, float(heights.min()))
                ground_max = max(ground_max, float(heights.max()))
    report.update(classificationCounts=dict(classes), usableGroundPoints=ground_count,
                  groundRangeMetres=[ground_min,ground_max] if ground_count else None)
    return report


def main():
    directory = ROOT / 'work/geodata/lantmateriet'
    results = []
    for file in sorted(directory.glob('*.copc.laz')):
        report = inspect_file(file)
        results.append(report)
        print(json.dumps(report, ensure_ascii=False), flush=True)
    if not results:
        raise ValueError('No LAS/LAZ deliveries found')
    (directory / 'inspection-report.json').write_text(json.dumps(results,indent=2,ensure_ascii=False)+'\n',encoding='utf8')

if __name__ == '__main__':
    main()
