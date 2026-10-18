"""Before/after screenshot comparison for fixed camera presets.
Usage: python scripts/geo/compare_views.py docs/coordinate-migration/before/views docs/coordinate-migration/after/views out
Writes side-by-side composites (before | after | amplified difference) and prints per-view metrics."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

before, after, out = map(Path, sys.argv[1:4])
out.mkdir(parents=True, exist_ok=True)
rows = []
for b in sorted(before.glob('*.png')):
    a = after / b.name
    if not a.exists():
        continue
    x = np.asarray(Image.open(b).convert('RGB'), dtype=np.int16)
    y = np.asarray(Image.open(a).convert('RGB'), dtype=np.int16)
    h, w = min(x.shape[0], y.shape[0]), min(x.shape[1], y.shape[1])
    x, y = x[:h, :w], y[:h, :w]
    d = np.abs(x - y).max(axis=2)
    rows.append({'view': b.stem, 'meanAbsDiff': round(float(d.mean()), 2),
                 'pixelsChangedOver32': round(float((d > 32).mean()) * 100, 2)})
    diff = np.clip(d * 4, 0, 255).astype(np.uint8)
    composite = np.concatenate([x, y, np.stack([diff] * 3, axis=2)], axis=1).astype(np.uint8)
    Image.fromarray(composite).resize((composite.shape[1] // 2, composite.shape[0] // 2)).save(out / b.name)
print(json.dumps(rows, indent=1))
(out / 'metrics.json').write_text(json.dumps(rows, indent=1) + '\n', encoding='utf8')
