"""Package unchanged simulator captures into labelled comparison panels; no retouching."""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'work/step61'
OUT = ROOT / 'docs/step61/evidence'
OUT.mkdir(parents=True, exist_ok=True)
FONT = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 19)
SMALL = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 14)
POSES = ['kungsgatan-street', 'kungsgatan-elevated', 'stromparken-path',
         'stromparken-elevated', 'stadium-pitch-north', 'stadium-elevated-se', 'bergsbron-north-end']
TIMES = [('day', '12:39 Day'), ('sunset', '17:36 Sunset'), ('twilight', '17:52 Twilight'), ('night', '21:30 Night')]

def tile(path, label, width=900):
    im = Image.open(path).convert('RGB')
    im = im.crop((0, 70, im.width, im.height - 30))
    im = im.resize((width, round(im.height * width / im.width)), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', (im.width, im.height + 34), '#101820')
    canvas.paste(im, (0, 34))
    ImageDraw.Draw(canvas).text((10, 5), label, fill='white', font=FONT)
    return canvas

def panel(tiles, cols, filename, title):
    w, h = tiles[0].size
    rows = (len(tiles) + cols - 1) // cols
    im = Image.new('RGB', (w * cols, h * rows + 70), '#101820')
    for i, t in enumerate(tiles): im.paste(t, ((i % cols) * w, 38 + (i // cols) * h))
    draw = ImageDraw.Draw(im)
    draw.text((12, 8), title, fill='white', font=FONT)
    draw.text((12, im.height - 25), 'Simulator captures | 2026-10-21 Europe/Stockholm | OSM contributors (ODbL); terrain Lantmateriet (CC BY 4.0)', fill='#abbac6', font=SMALL)
    im.save(OUT / filename, quality=91, subsampling=0)

metrics = {}
for pose in POSES:
    panel([tile(SRC / side / f'{pose}-night.png', side.title()) for side in ['before', 'after']],
          2, f'{pose}-night.jpg', f'{pose} | Step 6 / Step 6.1, identical camera and exposure')
    panel([tile(SRC / 'after' / f'{pose}-{state}.png', label) for state, label in TIMES],
          2, f'{pose}-times.jpg', f'{pose} | Step 6.1 time of day')
    if pose.startswith('stadium'):
        panel([tile(SRC / side / f'{pose}-{state}.png', f'{side.title()} / {label}', 700)
               for side in ['before', 'after'] for state, label in [('night', 'OFF'), ('training', 'TRAINING'), ('match', 'MATCH')]],
              3, f'{pose}-floodlights.jpg', f'{pose} | Floodlight modes retained')
    for state, _ in TIMES:
        a = Image.open(SRC / 'before' / f'{pose}-{state}.png').convert('RGB')
        b = Image.open(SRC / 'after' / f'{pose}-{state}.png').convert('RGB')
        metrics[f'{pose}-{state}'] = {'meanAbsoluteChannelDifference': sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3}
(OUT / 'pixel-differences.json').write_text(json.dumps(metrics, indent=2))
for side in ['before', 'after']:
    (OUT / f'{side}-capture-metadata.json').write_bytes((SRC / side / 'metadata.json').read_bytes())
print(f'Packaged {len(list(OUT.glob("*.jpg")))} panels in {OUT}')
