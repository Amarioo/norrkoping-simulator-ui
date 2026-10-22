"""Step 6 evidence montages (JPEG) from the PNG captures of scripts/step6/capture.mjs.

  python scripts/step6/montage.py work/step6/ev docs/step6/evidence     (codex-runtimes Python 3.12)

Inputs (work/step6/ev/<set>/<pose>.png):
  before/            baseline build 994b881, its fixed sun
  legacy/            Step 6 build, ?sun=legacy (the same sun direction and daylight values)
  t0715 … t2130/     Step 6 build, 2026-10-21 at that local time, floodlights off
  t2130-event/       21:30, floodlights event; t2130-training/ training
Outputs: before-after/*.jpg, floodlights/*.jpg, time-of-day/*.jpg, sunrise/*.jpg, singles/*.jpg
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
try:
    FONT = ImageFont.truetype('segoeui.ttf', 18)
    SMALL = ImageFont.truetype('segoeui.ttf', 14)
except OSError:
    FONT = SMALL = ImageFont.load_default()

STADIUM = ['stadium-elevated-se', 'stadium-elevated-nw', 'stadium-exterior-west', 'stadium-exterior-ne',
           'stadium-exterior-se', 'stadium-pitch-north', 'stadium-pitch-west']
PILOTS = ['kungsgatan-street', 'kungsgatan-elevated', 'stromparken-path', 'stromparken-elevated',
          'stadium-elevated-se', 'stadium-pitch-north']
TIMES = [('t1239', '12:39 · dag'), ('t1736', '17:36 · solnedgång'), ('t1752', '17:52 · skymning'), ('t2130', '21:30 · natt')]
SUNRISE = [('t0715', '07:15 · gryning'), ('t0743', '07:43 · soluppgång'), ('t0815', '08:15 · morgon')]


def elevation(set_):
    """Solar elevation recorded by capture.mjs (capture-meta.json → lighting.elevation)."""
    import json
    p = SRC / set_ / 'capture-meta.json'
    try:
        e = json.loads(p.read_text(encoding='utf8'))['lighting']['elevation']
        return f'{e:+.1f}°'.replace('.', ',').replace('-', '−')
    except (OSError, KeyError, TypeError, ValueError):
        return ''


def load(set_, pose, scale=1.0):
    p = SRC / set_ / f'{pose}.png'
    if not p.exists():
        return None
    im = Image.open(p).convert('RGB')
    # Crop the map UI chrome off the top (toolbar) and bottom (attribution) bands.
    im = im.crop((0, 70, im.width, im.height - 30))
    if scale != 1.0:
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    return im


def label(im, text, sub=None):
    d = ImageDraw.Draw(im)
    w = d.textlength(text, font=FONT) + 16
    d.rectangle([0, 0, w, 28 + (18 if sub else 0)], fill=(18, 28, 33))
    d.text((8, 4), text, fill=(240, 244, 236), font=FONT)
    if sub:
        d.text((8, 28), sub, fill=(170, 186, 190), font=SMALL)
    return im


def grid(tiles, cols, out, title):
    tiles = [t for t in tiles if t is not None]
    if not tiles:
        return False
    w, h = tiles[0].size
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * w + (cols - 1) * 6, rows * h + (rows - 1) * 6 + 34), (10, 14, 16))
    d = ImageDraw.Draw(sheet)
    d.text((8, 7), title, fill=(230, 236, 228), font=FONT)
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * (w + 6), 34 + (i // cols) * (h + 6)))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=86, optimize=True)
    return True


def main():
    n = 0
    for pose in STADIUM:
        b, a = load('before', pose), load('legacy', pose)
        if b and a:
            n += grid([label(b, 'Före · 994b881'), label(a, 'Efter · Step 6')], 2,
                      OUT / 'before-after' / f'{pose}.jpg',
                      f'{pose} · samma kamera och samma sol (sun=legacy: 53,6°, dagsljusvärden före Step 6)')
    for pose in ['stadium-elevated-se', 'stadium-pitch-north', 'stadium-pitch-west', 'stadium-exterior-ne', 'stadium-exterior-west']:
        tiles = [load('t2130', pose), load('t2130-training', pose), load('t2130-event', pose)]
        if tiles[0] and tiles[2]:
            tiles = [label(t, s) for t, s in zip(tiles, ['Strålkastare av', 'Träning', 'Match']) if t]
            n += grid(tiles, len(tiles), OUT / 'floodlights' / f'{pose}.jpg',
                      f'{pose} · 2026-10-21 21:30 (solhöjd −30,5°) · samma kamera')
    for pose in PILOTS:
        tiles = [label(load(s, pose, 0.6), f'{t}, solhöjd {elevation(s)}') for s, t in TIMES if load(s, pose)]
        n += grid(tiles, 2, OUT / 'time-of-day' / f'{pose}.jpg', f'{pose} · 2026-10-21 (CEST) · strålkastare av')
        tiles = [label(load(s, pose, 0.6), f'{t}, solhöjd {elevation(s)}') for s, t in SUNRISE if load(s, pose)]
        n += grid(tiles, 3, OUT / 'sunrise' / f'{pose}.jpg', f'{pose} · 2026-10-21 morgon')
    print('montages', n)


if __name__ == '__main__':
    main()
