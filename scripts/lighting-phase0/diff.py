"""Lighting Phase 0 pixel comparison of paired captures (scripts/lighting-phase0/capture.mjs).

  python scripts/lighting-phase0/diff.py <dirA> <dirB> <report.json> [<evidenceDir> <pose-state,...>]

Compares every <pose>-<state>.png present in both directories, as 8-bit RGB:
  changed      pixels where any channel differs
  max / mean   largest and mean absolute channel difference (mean over all pixels and channels)
  histogram    changed pixels by their largest channel difference (1, 2, 3-5, 6-10, 11-50, >50)
  bbox         bounding box of changed pixels
No tolerance is applied. With <evidenceDir>, the listed captures are written as compact JPEG triptychs:
A | B | |A-B| amplified ×16 (half resolution). Uses the codex-runtimes Python (PIL, numpy).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

a_dir, b_dir, report_path = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
evidence = Path(sys.argv[4]) if len(sys.argv) > 4 else None
selected = set(sys.argv[5].split(',')) if len(sys.argv) > 5 else set()

BINS = [(1, 1), (2, 2), (3, 5), (6, 10), (11, 50), (51, 255)]
report = {'a': str(a_dir), 'b': str(b_dir), 'images': {}}
total_changed = 0
for a_path in sorted(a_dir.glob('*.png')):
    b_path = b_dir / a_path.name
    if not b_path.exists():
        continue
    a = np.asarray(Image.open(a_path).convert('RGB'), dtype=np.int16)
    b = np.asarray(Image.open(b_path).convert('RGB'), dtype=np.int16)
    if a.shape != b.shape:
        report['images'][a_path.stem] = {'error': f'shape {a.shape} vs {b.shape}'}
        continue
    d = np.abs(a - b)
    m = d.max(axis=2)
    changed = int((m > 0).sum())
    total_changed += changed
    entry = {
        'pixels': int(m.size),
        'changed': changed,
        'changedFraction': changed / m.size,
        'max': int(d.max()),
        'mean': float(d.mean()),
        'histogram': {f'{lo}-{hi}': int(((m >= lo) & (m <= hi)).sum()) for lo, hi in BINS},
    }
    if changed:
        ys, xs = np.nonzero(m)
        entry['bbox'] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    report['images'][a_path.stem] = entry
    if evidence and a_path.stem in selected:
        evidence.mkdir(parents=True, exist_ok=True)
        amp = np.clip(m * 16, 0, 255).astype(np.uint8)
        heat = np.stack([amp, amp // 2, np.zeros_like(amp)], axis=2)
        w, h = a.shape[1], a.shape[0]
        canvas = Image.new('RGB', (w * 3 // 2, h // 2 + 22), (16, 18, 20))
        for k, img in enumerate([a.astype(np.uint8), b.astype(np.uint8), heat]):
            canvas.paste(Image.fromarray(img).resize((w // 2, h // 2), Image.LANCZOS), (k * w // 2, 22))
        draw = ImageDraw.Draw(canvas)
        labels = ['before (bf5f726)', 'after (Phase 0)', f'|diff| x16: {changed} px changed, max {entry["max"]}']
        for k, text in enumerate(labels):
            draw.text((k * w // 2 + 6, 5), text, fill=(230, 230, 230))
        canvas.save(evidence / f'{a_path.stem}.jpg', quality=82)
report['totalChanged'] = total_changed
report['compared'] = len(report['images'])
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=1) + '\n')
worst = sorted(report['images'].items(), key=lambda kv: -kv[1].get('changed', 0))[:8]
print(json.dumps({'compared': report['compared'], 'totalChanged': total_changed,
                  'worst': {k: (v.get('changed'), v.get('max')) for k, v in worst}}, indent=1))
