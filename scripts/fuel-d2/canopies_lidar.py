"""Phase D2 (fuel stations): measured canopies over the pumps, from OSM outlines and LiDAR.

Sources
  - Station list: docs/step62/evidence/fuel-stations.json (32 OSM amenity=fuel features, OSM base
    2026-10-23T09:05:06Z, © OpenStreetMap contributors, ODbL-1.0).
  - Canopy outlines: the runtime map src/lib/data/norrkoping-map.json (OSM base 2026-10-16T13:35:36Z):
    every `building=roof` outline (kind 'roof') plus CANOPY_TAGGED (an amenity=fuel way tagged
    `building:part=roof`, which the runtime map stores as kind 'yes').
  - Heights: Lantmäteriet point cloud "Laserdata NH 2020" (STAC collection dsm-skoglig-copc, scan area
    20C012, 2020), ©Lantmäteriet, CC BY 4.0. Raw tiles stay local in work/geodata/lantmateriet/.

Method (per station)
  1. Candidate outlines: canopy outlines whose vertex centroid lies within ASSOCIATE_M of the station
     point; each outline goes to its nearest station only.
  2. Inside each outline (inset INSET_M), the non-noise returns on a 1 m grid: top of each cell
     (highest non-ground return) and the local ground (median of class-2 returns in a ring
     GROUND_RING_M outside the outline). A cell "has canopy" when its top is CLEARANCE_M above that
     ground. Accepted as a canopy when the share of canopy cells is ≥ MIN_COVER and the top surface is
     flat (p90 − p10 ≤ MAX_SPREAD_M).
  2b. By the user's decision of 2026-11-10 two more stations are built from the LiDAR: INTERPRETED reads
     an OSM building=yes outline as the canopy, LIDAR_OUTLINE measures the outline itself (the
     minimum-area rectangle of the flat roofed patch outside every OSM building). Both are then measured
     and accepted by the same rule as above.
  3. Stations without an accepted outline: the nearest flat, roofed LiDAR patch (no ground return below,
     3.8–7.5 m above ground, outside every OSM building) is recorded as a CANDIDATE only. It is not
     built: without an outline or a photograph the patch could be any low flat roof.

Frame: SWEREF 99 TM (EPSG:3006) metres; heights RH2000 metres (the scene's vertical datum). The scene
transform is in the map's meta.reference (scene = (SWEREF − origin) / (25 · k), x east, z south).

Output (deterministic: no timestamps, no machine paths, fixed rounding, sorted keys)
  src/lib/data/fuel-canopies.json   runtime data (also the provenance of every measured value)
  [optional] a contact sheet PNG of all stations (LiDAR height above ground, outlines drawn)

Usage (codex-runtimes Python 3.12, see docs/claude-progress.md):
  python scripts/fuel-d2/canopies_lidar.py <out.json> [sheet.png]
"""
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/geo'))
sys.path.insert(0, str(ROOT / 'work/geodata/python'))
from lidar_window import points, tiles  # noqa: E402
import numpy as np  # noqa: E402
from scipy import ndimage  # noqa: E402

VERSION = 'fuel-d2-v1'
ASSOCIATE_M = 60.0
INSET_M = 0.5
GROUND_RING_M = (1.0, 10.0)
CLEARANCE_M = (3.0, 8.5)
MIN_COVER = 0.5
MAX_SPREAD_M = 0.8
WINDOW_M = 50
# amenity=fuel way tagged building=yes + building:part=roof (OSM tags in the 2026-10-23 research
# snapshot; the runtime map keeps only building=yes as kind 'yes').
CANOPY_TAGGED = {'way/99263073': 'building:part=roof on the amenity=fuel way'}
# User decision 2026-11-10 (D2 review): build these two stations from the LiDAR as well.
# - Ingo Lindövägen: the OSM building=yes outline at the station point (no other tags) is read as the
#   canopy: the LiDAR shows a flat roof about 4.3 m high, no ground return below it, inside the loop of
#   the forecourt drive; INGO is an unmanned brand (no shop).
# - OKQ8 Hagebygatan (operator: automatic station): no outline in OSM; the canopy's outline is measured
#   from the LiDAR as the minimum-area rectangle of the flat roofed cells (≈ 4.0 m) next to the station
#   that lie outside every OSM building. The adjoining OSM building (way/95526635, ≈ 4.9 m) is untouched.
INTERPRETED = {'osm:node/247135512': 'way/96575513'}
LIDAR_OUTLINE = {'osm:node/1107696684': 'lidar:node/1107696684'}
LIDAR_PATCH = {'maxDistanceM': 25.0, 'minCells': 60, 'minFill': 0.75}


def r(x, n=2):
    return float(round(float(x), n))


def contains(poly, P):
    x, y = P[:, 0], P[:, 1]
    c = np.zeros(len(P), bool)
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[i - 1]
        if y1 == y2:
            continue
        m = (y1 > y) != (y2 > y)
        xi = (x2 - x1) * (y - y1) / (y2 - y1) + x1
        c ^= m & (x < xi)
    return c


def seg_dist(P, poly):
    """Distance of each point to the polygon boundary."""
    d = np.full(len(P), np.inf)
    for i in range(len(poly)):
        a = np.array(poly[i - 1])
        b = np.array(poly[i])
        ab = b - a
        L2 = float(ab @ ab) or 1e-12
        t = np.clip(((P - a) @ ab) / L2, 0, 1)
        q = a + t[:, None] * ab
        d = np.minimum(d, np.hypot(*(P - q).T))
    return d


def area(poly):
    return abs(sum(poly[k][0] * poly[k - 1][1] - poly[k - 1][0] * poly[k][1] for k in range(len(poly)))) / 2


def min_area_rect(pts):
    """Minimum-area enclosing rectangle of points (rotating calipers over the hull; first minimum wins)."""
    from scipy.spatial import ConvexHull
    hull = pts[ConvexHull(pts).vertices]
    best = None
    for i in range(len(hull)):
        a, b = hull[i], hull[(i + 1) % len(hull)]
        d = b - a
        L = math.hypot(*d)
        if L < 1e-9:
            continue
        u = d / L
        v = np.array([-u[1], u[0]])
        pu, pv = hull @ u, hull @ v
        A = (pu.max() - pu.min()) * (pv.max() - pv.min())
        if best is None or A < best[0] - 1e-9:
            best = (A, u, v, pu.min(), pu.max(), pv.min(), pv.max())
    A, u, v, u0, u1, v0, v1 = best
    return A, [tuple(u * a + v * b) for a, b in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]


def main(out, sheet=None):
    m = json.loads((ROOT / 'src/lib/data/norrkoping-map.json').read_text(encoding='utf8'))
    ref = m['meta']['reference']
    E0, N0, K, MPU = ref['originEasting'], ref['originNorthing'], ref['gridScaleFactor'], ref['metresPerUnit']

    def to_en(x, z):
        return E0 + x * MPU * K, N0 - z * MPU * K

    stations = json.loads((ROOT / 'docs/step62/evidence/fuel-stations.json').read_text(encoding='utf8'))
    outlines = {}
    for b in m['buildings']:
        if b['kind'] == 'roof' or b['id'] in CANOPY_TAGGED or b['id'] in INTERPRETED.values():
            ring = [to_en(x, z) for x, z in b['rings'][0]]
            if ring[0] == ring[-1]:
                ring = ring[:-1]
            outlines[b['id']] = ring
    centroid = {k: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for k, v in outlines.items()}
    owner = {}
    for oid, (cx, cy) in sorted(centroid.items()):
        best = None
        for s in stations:
            d = math.hypot(cx - s['coordinates'][0], cy - s['coordinates'][1])
            if d <= ASSOCIATE_M and (best is None or d < best[0]):
                best = (d, s['id'])
        if best:
            owner[oid] = best
    others = [
        [to_en(x, z) for x, z in b['rings'][0]]
        for b in m['buildings']
        if b['kind'] != 'roof' and b['id'] not in CANOPY_TAGGED and b['id'] not in INTERPRETED.values()
    ]
    labels = {oid: 'osm building:part=roof' for oid in CANOPY_TAGGED}
    labels.update({oid: 'osm building=yes, read as the canopy (user decision 2026-11-10)'
                   for oid in INTERPRETED.values()})
    derived = {}

    canopies, out_stations, panels = [], [], []
    for s in stations:
        e, n = s['coordinates']
        R = WINDOW_M
        E, N, Z, Cl = points(e - R, n - R, e + R, n + R)
        keep = (Cl != 7) & (Cl != 18)
        E, N, Z, Cl = E[keep], N[keep], Z[keep], Cl[keep]
        g = Cl == 2
        nx = 2 * R
        ix = np.clip((E - (e - R)).astype(int), 0, nx - 1)
        iy = np.clip((N - (n - R)).astype(int), 0, nx - 1)
        top = np.full((nx, nx), -np.inf)
        np.maximum.at(top, (iy[~g], ix[~g]), Z[~g])
        gmin = np.full((nx, nx), np.inf)
        np.minimum.at(gmin, (iy[g], ix[g]), Z[g])
        hasg = np.isfinite(gmin)
        idx = ndimage.distance_transform_edt(~hasg, return_distances=False, return_indices=True)
        gs = gmin[idx[0], idx[1]]
        cx_, cy_ = np.meshgrid(np.arange(nx) + 0.5 + e - R, np.arange(nx) + 0.5 + n - R)
        cells = np.c_[cx_.ravel(), cy_.ravel()]
        if s['id'] in LIDAR_OUTLINE:
            oid = LIDAR_OUTLINE[s['id']]
            hf = np.where(np.isfinite(top), top - gs, np.nan)
            mx = ndimage.maximum_filter(np.nan_to_num(hf, nan=-99), 3)
            mn = ndimage.minimum_filter(np.nan_to_num(hf, nan=99), 3)
            bm = np.zeros((nx, nx), bool)
            for p in others:
                if min(abs(q[0] - e) for q in p) > 2 * R or min(abs(q[1] - n) for q in p) > 2 * R:
                    continue
                bm |= contains(p, cells).reshape(nx, nx)
            cand = np.isfinite(hf) & (hf > 3.0) & (hf < 8.5) & ~hasg & ((mx - mn) < 0.5) & ~bm
            cand = ndimage.binary_opening(ndimage.binary_closing(cand, iterations=1), iterations=1) & ~bm
            lab, k = ndimage.label(cand)
            best = None
            for j in range(1, k + 1):
                w = lab == j
                yy, xx = np.nonzero(w)
                d = math.hypot(xx.mean() + 0.5 - R, yy.mean() + 0.5 - R)
                if w.sum() >= LIDAR_PATCH['minCells'] and d <= LIDAR_PATCH['maxDistanceM'] and (best is None or d < best[0]):
                    best = (d, w)
            if best is None:
                raise SystemExit(f'{s["id"]}: no LiDAR patch for the decided outline')
            yy, xx = np.nonzero(best[1])
            corners = np.array([(e - R + x + dx, n - R + y + dy) for x, y in zip(xx, yy) for dx in (0, 1) for dy in (0, 1)], float)
            A, rect = min_area_rect(corners)
            ring = [(r(p[0]), r(p[1])) for p in rect]
            outlines[oid] = ring
            owner[oid] = (math.hypot(sum(p[0] for p in ring) / 4 - e, sum(p[1] for p in ring) / 4 - n), s['id'])
            fill = float(best[1].sum()) / A
            labels[oid] = 'LiDAR roof patch, minimum-area rectangle (user decision 2026-11-10)'
            derived[oid] = {'ringSweref': [list(p) for p in ring], 'patchCells': int(best[1].sum()), 'rectangleFill': r(fill, 3)}
            if fill < LIDAR_PATCH['minFill']:
                raise SystemExit(f'{s["id"]}: LiDAR patch fills only {fill:.0%} of its rectangle')
        mine = sorted(oid for oid, (d, sid) in owner.items() if sid == s['id'])
        accepted = []
        drawn = []
        for oid in mine:
            ring = outlines[oid]
            inside = contains(ring, cells).reshape(nx, nx)
            inner = inside & (seg_dist(cells, ring).reshape(nx, nx) >= INSET_M)
            ring_pts = np.c_[E[g], N[g]]
            dist_g = seg_dist(ring_pts, ring)
            in_g = contains(ring, ring_pts)
            sel_g = (~in_g) & (dist_g >= GROUND_RING_M[0]) & (dist_g <= GROUND_RING_M[1])
            ground = float(np.median(Z[g][sel_g])) if sel_g.sum() else float('nan')
            tops = top[inner]
            h = tops - ground
            canopy_cell = np.isfinite(h) & (h >= CLEARANCE_M[0]) & (h <= CLEARANCE_M[1])
            cover = float(canopy_cell.mean()) if inner.sum() else 0.0
            ztop = tops[canopy_cell]
            p10, p50, p90 = (np.percentile(ztop, [10, 50, 90]) if len(ztop) else (np.nan,) * 3)
            pin = np.c_[E, N]
            in_pts = contains(ring, pin)
            n_ret = int(in_pts.sum())
            n_ground_below = int((in_pts & g).sum())
            ok = bool(cover >= MIN_COVER and len(ztop) and (p90 - p10) <= MAX_SPREAD_M)
            rec = {
                'id': oid,
                'station': s['id'],
                'outline': labels.get(oid, 'osm building=roof'),
                'stationDistanceM': r(owner[oid][0], 1),
                'areaM2': r(area(ring), 1),
                'cells': int(inner.sum()),
                'canopyCellShare': r(cover, 3),
                'returns': n_ret,
                'groundReturnsBelow': n_ground_below,
                'groundRh2000': r(ground),
                'groundSamples': int(sel_g.sum()),
                'topRh2000': {'p10': r(p10), 'p50': r(p50), 'p90': r(p90)},
                'clearanceM': r(p50 - ground),
                'accepted': ok,
                'reason': 'flat roof over the outline' if ok else (
                    f'only {cover:.0%} of the outline has a roof {CLEARANCE_M[0]}–{CLEARANCE_M[1]} m above ground'
                    if cover < MIN_COVER else f'top not flat (p90 − p10 = {p90 - p10:.2f} m)'),
            }
            rec.update(derived.get(oid, {}))
            canopies.append(rec)
            if ok:
                accepted.append(oid)
            drawn.append((ring, ok))
        entry = {
            'id': s['id'],
            'name': s['name'],
            'brand': s.get('brand'),
            'operator': s.get('operator'),
            'coordinates': [r(s['coordinates'][0], 1), r(s['coordinates'][1], 1)],
            'canopies': accepted,
            'built': bool(accepted),
        }
        if not accepted:
            # LiDAR candidate only (not built).
            hf = np.where(np.isfinite(top), top - gs, np.nan)
            mx = ndimage.maximum_filter(np.nan_to_num(hf, nan=-99), 3)
            mn = ndimage.minimum_filter(np.nan_to_num(hf, nan=99), 3)
            bm = np.zeros((nx, nx), bool)
            for p in others:
                if min(abs(q[0] - e) for q in p) > 2 * R or min(abs(q[1] - n) for q in p) > 2 * R:
                    continue
                bm |= contains(p, cells).reshape(nx, nx)
            cand = np.isfinite(hf) & (hf > 3.8) & (hf < 7.5) & ~hasg & ((mx - mn) < 0.5) & ~bm
            cand = ndimage.binary_closing(cand, iterations=1) & ~bm
            lab, k = ndimage.label(cand)
            best = None
            for j in range(1, k + 1):
                w = lab == j
                a = int(w.sum())
                if a < 25:
                    continue
                yy, xx = np.nonzero(w)
                d = math.hypot(xx.mean() + 0.5 - R, yy.mean() + 0.5 - R)
                if best is None or d < best['distanceM']:
                    best = {'distanceM': r(d, 1), 'areaM2': a, 'heightM': r(np.nanmedian(hf[w]))}
            entry['lidarCandidate'] = best
            entry['reason'] = (
                'no canopy outline in OSM near the station; '
                + ('nearest flat roofed LiDAR patch recorded, not built' if best else 'no flat roofed LiDAR patch nearby')
            )
        out_stations.append(entry)
        panels.append((s, top - gs, drawn, e, n))

    tile_names = sorted({p.name for (te0, tn0, te1, tn1, p) in tiles()})
    data = {
        'meta': {
            'phase': 'D2',
            'version': VERSION,
            'script': 'scripts/fuel-d2/canopies_lidar.py',
            'crs': 'EPSG:3006',
            'verticalDatum': 'RH2000',
            'sources': [
                {'id': 'osm-fuel', 'dataset': 'docs/step62/evidence/fuel-stations.json', 'license': 'ODbL-1.0',
                 'osmBase': '2026-10-23T09:05:06Z'},
                {'id': 'osm-map', 'dataset': 'src/lib/data/norrkoping-map.json', 'license': 'ODbL-1.0',
                 'osmBase': m['meta']['timestamp']},
                {'id': 'decision', 'dataset': 'user decision 2026-11-10: also build OKQ8 Hagebygatan and Ingo Lindövägen from the LiDAR',
                 'license': '-', 'osmBase': '-'},
                {'id': 'lidar', 'dataset': 'Lantmäteriet Laserdata NH 2020 (dsm-skoglig-copc, scan area 20C012)',
                 'license': 'CC BY 4.0', 'acquired': '2020'},
            ],
            'parameters': {
                'associateM': ASSOCIATE_M, 'insetM': INSET_M, 'groundRingM': list(GROUND_RING_M),
                'clearanceM': list(CLEARANCE_M), 'minCover': MIN_COVER, 'maxSpreadM': MAX_SPREAD_M,
                'lidarPatch': LIDAR_PATCH,
            },
            'userDecisions': {'interpreted': INTERPRETED, 'lidarOutline': LIDAR_OUTLINE, 'date': '2026-11-10'},
            'lidarTiles': len(tile_names),
        },
        'stations': out_stations,
        'canopies': canopies,
    }
    text = json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + '\n'
    Path(out).write_text(text, encoding='utf8', newline='\n')
    print('wrote', out, 'sha256', hashlib.sha256(text.encode('utf8')).hexdigest())
    print('stations built', sum(s['built'] for s in out_stations), 'of', len(out_stations),
          '; canopies accepted', sum(c['accepted'] for c in canopies), 'of', len(canopies))
    if sheet:
        contact_sheet(panels, sheet)


def contact_sheet(panels, path):
    """Height above ground (0–9 m), one 100 × 100 m panel per station, outlines: green accepted, red not."""
    from PIL import Image, ImageDraw
    S = 3
    cols = 8
    rows = math.ceil(len(panels) / cols)
    W = 2 * WINDOW_M * S
    img = Image.new('RGB', (cols * (W + 6), rows * (W + 22)), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    for k, (s, h, drawn, e, n) in enumerate(panels):
        ox, oy = (k % cols) * (W + 6), (k // cols) * (W + 22)
        v = np.clip(np.nan_to_num(h, nan=0, neginf=0) / 9.0, 0, 1)
        band = (h >= 3.5) & (h <= 8.5)
        rgb = np.stack([v * 255, v * 255, v * 255], -1)
        rgb[band] = [230, 160, 40]
        tile = Image.fromarray(np.flipud(rgb).astype(np.uint8)).resize((W, W), Image.NEAREST)
        img.paste(tile, (ox, oy))
        for ring, ok in drawn:
            pts = [(ox + (p[0] - (e - WINDOW_M)) * S, oy + ((n + WINDOW_M) - p[1]) * S) for p in ring]
            draw.polygon(pts, outline=(40, 200, 60) if ok else (220, 40, 40))
        draw.ellipse([ox + W / 2 - 3, oy + W / 2 - 3, ox + W / 2 + 3, oy + W / 2 + 3], outline=(30, 90, 230), width=2)
        label = (s['name'] or s['id'])[:24]
        draw.text((ox + 2, oy + W + 4), label.encode('ascii', 'replace').decode(), fill=(0, 0, 0))
    img.save(path, optimize=False)
    print('sheet', path)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
