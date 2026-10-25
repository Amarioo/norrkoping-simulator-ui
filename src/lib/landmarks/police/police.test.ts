import fs from 'node:fs';
import crypto from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { FrontSide, InstancedMesh, Texture } from 'three';
import outline from './emblem-outline.json';
import {
  FACADE_SEEDS,
  GLOW_SCALE,
  LIT_FRACTION,
  WINDOW_COLOURS,
  WINDOW_GRID,
  WINDOW_NIGHT_GAIN,
  litWindows,
  paintWindowGlow,
  windowGain,
} from './windows';
import { createPoliceSign, emblemGeometry } from './sign';
import {
  EMBLEM_ASPECT,
  GABLE_WIDTH_M,
  NIGHT_GAIN,
  PHOTO,
  SIGN,
  TOWER,
  TOWER_MEASURED,
  TOWER_MODEL,
  signPlacement,
} from './spec';
import { PARTS } from './tower';

/** LiDAR measurements of the tower (scripts/police-signs-d1/police_tower_lidar.py). */
const lidar = JSON.parse(
  fs.readFileSync('docs/police-signs-d1/data/police-tower-lidar.json', 'utf8'),
);
const M = 25;
/**
 * The drawn gable block (Police Tower D1b, src/lib/landmarks/police/tower.ts): the UPPER block of the
 * measured tower, scene units in the tower frame. (Until D1b: the illustrative slab, half width
 * 0.255, top 1.89, with a parapet cap overhanging the gable to 1.355.)
 */
const SLAB = {
  halfWidth: PARTS.upper.c1 / M,
  top: TOWER.upper.parapet / M,
  gableZ: PARTS.upper.a1 / M,
};

describe('Police Signs D1: measurements', () => {
  test('tower values in spec.ts are the LiDAR output', () => {
    expect(TOWER_MEASURED.lengthM).toBe(lidar.tower.lengthM);
    expect(TOWER_MEASURED.widthM).toBe(lidar.tower.widthM);
    expect(TOWER_MEASURED.groundRH2000).toBe(lidar.ground.gableFront.p50);
    expect(TOWER_MEASURED.bearingDeg).toBeCloseTo(lidar.frame.axisBearingDeg, 1);
    // Parapet: between the median and the 90th percentile of the gable-edge returns.
    expect(TOWER_MEASURED.parapetRH2000).toBeGreaterThanOrEqual(lidar.tower.heights.gableEdgeP50);
    expect(TOWER_MEASURED.parapetRH2000).toBeLessThanOrEqual(lidar.tower.heights.gableEdgeP90);
    // The photo's scale: the roof extent plus at most 1 m for the sparse edge returns.
    // The photo's dark gable is the tall part only (not the full tower width).
    expect(TOWER_MEASURED.gableTallWidthM).toBe(lidar.gableParts.tallPart.widthP1P99);
    expect(GABLE_WIDTH_M - TOWER_MEASURED.gableTallWidthM).toBeGreaterThanOrEqual(0);
    expect(GABLE_WIDTH_M - TOWER_MEASURED.gableTallWidthM).toBeLessThanOrEqual(1);
    expect(GABLE_WIDTH_M).toBeLessThan(TOWER_MEASURED.widthM - 3);
  });

  test('sign size and height follow from the photo ratios', () => {
    expect(SIGN.widthM).toBeCloseTo((PHOTO.emblemWidthPx / PHOTO.gablePx) * GABLE_WIDTH_M, 2);
    expect(SIGN.widthM).toBeCloseTo(2.51, 2);
    expect(SIGN.heightM).toBeCloseTo(3.32, 2);
    expect(SIGN.centreBelowParapetM).toBeCloseTo(7.3, 1);
    // The sign keeps the artwork's proportions; the photo is near-frontal (within 15°).
    expect(SIGN.widthM / SIGN.heightM / EMBLEM_ASPECT).toBeCloseTo(1, 2);
    expect(PHOTO.cosView).toBeGreaterThan(Math.cos((15 * Math.PI) / 180));
    expect(PHOTO.cosView).toBeLessThanOrEqual(1);
    expect(SIGN.count).toBe(1);
  });
});

describe('Police Signs D1: placement on the drawn tower', () => {
  const p = signPlacement(M);
  test('centred on the SSE gable, just in front of the wall, below the parapet', () => {
    expect(p.x).toBe(0);
    // Face 0.25 m in front of the slab's gable wall. (D1b: the parapet is flush with the walls, so
    // the former "behind the cap's overhang" check is now: TOWER_MODEL's gable is the drawn wall.)
    expect((p.z - TOWER_MODEL.halfLength) * M).toBeCloseTo(SIGN.standoffM, 6);
    expect(TOWER_MODEL.halfLength).toBeCloseTo(SLAB.gableZ, 12);
    // Centre 10.8 m below the parapet top; the whole sign below the slab top, within the gable width.
    expect((TOWER_MODEL.parapetTop - p.y) * M).toBeCloseTo(SIGN.centreBelowParapetM, 6);
    expect(p.y + p.height / 2).toBeLessThan(SLAB.top);
    expect(p.width / 2).toBeLessThan(SLAB.halfWidth);
    expect(p.width * M).toBeCloseTo(SIGN.widthM, 6);
    expect(p.height * M).toBeCloseTo(SIGN.heightM, 6);
  });

  test('the gable it is on faces the measured bearing (± 3°)', () => {
    // Local +z of the tower group in scene x/z (x east, z south) → bearing from grid north.
    const east = Math.sin(TOWER_MODEL.rotation),
      south = Math.cos(TOWER_MODEL.rotation);
    const bearing = (Math.atan2(east, -south) * 180) / Math.PI;
    expect(Math.abs(bearing - TOWER_MEASURED.bearingDeg)).toBeLessThan(3);
  });

  test('the mesh sits at the placement in the tower frame', () => {
    const sign = createPoliceSign(new Texture());
    expect(sign.mesh.name).toBe('police-sign');
    expect(sign.mesh.position.toArray()).toEqual([p.x, p.y, p.z]);
    sign.mesh.geometry.computeBoundingBox();
    const box = sign.mesh.geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(p.width, 3);
    expect(box.max.y - box.min.y).toBeCloseTo(p.height, 3);
    expect(box.max.z - box.min.z).toBe(0);
    sign.dispose();
  });
});

describe('Police Signs D1: day and night', () => {
  test('no glow by day, NIGHT_GAIN at full night, follows the level in between', () => {
    const sign = createPoliceSign(new Texture());
    expect(sign.material.emissiveIntensity).toBe(0);
    sign.setNightLevel(0);
    expect(sign.material.emissiveIntensity).toBe(0);
    sign.setNightLevel(1);
    expect(sign.material.emissiveIntensity).toBe(NIGHT_GAIN);
    sign.setNightLevel(0.5);
    expect(sign.material.emissiveIntensity).toBeCloseTo(NIGHT_GAIN / 2, 10);
    sign.setNightLevel(3);
    expect(sign.nightLevel).toBe(1);
    sign.setNightLevel(-1);
    expect(sign.material.emissiveIntensity).toBe(0);
    sign.dispose();
  });

  test('self-lit material, no light source: the artwork is both colour and emissive map', () => {
    const crest = new Texture();
    const sign = createPoliceSign(crest);
    let lights = 0;
    sign.mesh.traverse((o) => {
      if ((o as { isLight?: boolean }).isLight) lights++;
    });
    expect(lights).toBe(0);
    expect(sign.material.map).toBe(crest);
    expect(sign.material.emissiveMap).toBe(crest);
    expect(sign.material.emissive.getHex()).toBe(0xffffff);
    // The program-sharing contract with the tram/bus destination signs (publicTransport.ts):
    // opaque, front-sided, no alpha test, instanced.
    expect(sign.material.transparent).toBe(false);
    expect(sign.material.alphaTest).toBe(0);
    expect(sign.material.side).toBe(FrontSide);
    expect(sign.mesh).toBeInstanceOf(InstancedMesh);
    expect((sign.mesh as InstancedMesh).count).toBe(1);
    sign.dispose();
  });
});

describe('Police Signs D1: emblem outline', () => {
  test('outline belongs to the current artwork', () => {
    const sha = crypto
      .createHash('sha256')
      .update(fs.readFileSync('public/assets/polis-emblem.svg'))
      .digest('hex');
    expect(outline.sourceSha256).toBe(sha);
    expect(outline.outer.length).toBe(1);
  });

  test('geometry covers the emblem: UVs inside the texture, area a plausible share', () => {
    const g = emblemGeometry(1, 1);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getX(i)).toBeLessThanOrEqual(1 + 1e-6);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-6);
    }
    const pos = g.getAttribute('position'),
      index = g.getIndex()!;
    let area = 0;
    for (let t = 0; t < index.count; t += 3) {
      const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      const ax = pos.getX(b) - pos.getX(a),
        ay = pos.getY(b) - pos.getY(a),
        bx = pos.getX(c) - pos.getX(a),
        by = pos.getY(c) - pos.getY(a);
      area += (ax * by - ay * bx) / 2;
    }
    // Front faces (+z, counter-clockwise) and between 55 % and 90 % of the artwork's rectangle.
    expect(area).toBeGreaterThan(0.55);
    expect(area).toBeLessThan(0.9);
    g.dispose();
  });
});

describe('Police station night: lit tower windows', () => {
  test('deterministic, about the estimated share lit, different on the two façades', () => {
    const [a, b] = FACADE_SEEDS.map((seed) => litWindows(seed));
    expect(litWindows(FACADE_SEEDS[0])).toEqual(a);
    const share = (l: boolean[][]) => l.flat().filter(Boolean).length / l.flat().length;
    for (const f of [a, b]) {
      expect(f.lit.length).toBe(WINDOW_GRID.rows);
      expect(f.lit[0].length).toBe(WINDOW_GRID.cols);
      expect(Math.abs(share(f.lit) - LIT_FRACTION)).toBeLessThan(0.08);
      expect(f.colour.flat().every((c) => c >= 0 && c < WINDOW_COLOURS.length)).toBe(true);
    }
    expect(a.lit).not.toEqual(b.lit);
  });

  test('glow follows the night level: 0 by day, WINDOW_NIGHT_GAIN at full night', () => {
    expect(windowGain(0)).toBe(0);
    expect(windowGain(1)).toBe(WINDOW_NIGHT_GAIN);
    expect(windowGain(0.5)).toBeCloseTo(WINDOW_NIGHT_GAIN / 2, 10);
    expect(windowGain(-1)).toBe(0);
    expect(windowGain(2)).toBe(WINDOW_NIGHT_GAIN);
  });

  test('emissive map paints exactly the lit windows of the grid, black elsewhere', () => {
    const rects: { colour: string; x: number; y: number; w: number; h: number }[] = [];
    const ctx = {
      fillStyle: '',
      fillRect(x: number, y: number, w: number, h: number) {
        rects.push({ colour: this.fillStyle, x, y, w, h });
      },
    };
    paintWindowGlow(ctx as unknown as CanvasRenderingContext2D, FACADE_SEEDS[0]);
    const { lit } = litWindows(FACADE_SEEDS[0]);
    const g = WINDOW_GRID;
    const k = GLOW_SCALE;
    expect(rects[0]).toEqual({ colour: '#000000', x: 0, y: 0, w: g.width * k, h: g.height * k });
    expect(rects.length - 1).toBe(lit.flat().filter(Boolean).length);
    for (const r of rects.slice(1)) {
      const col = (r.x / k - g.x0) / g.dx,
        row = (r.y / k - g.y0) / g.dy;
      expect(Number.isInteger(col) && Number.isInteger(row)).toBe(true);
      expect(lit[row][col]).toBe(true);
      expect([r.w, r.h]).toEqual([g.w * k, g.h * k]);
      expect(WINDOW_COLOURS as readonly string[]).toContain(r.colour);
    }
  });
});
