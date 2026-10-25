import fs from 'node:fs';
import crypto from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { FrontSide, InstancedMesh, Texture } from 'three';
import outline from './emblem-outline.json';
import { createPoliceSign, emblemGeometry } from './sign';
import {
  EMBLEM_ASPECT,
  GABLE_WIDTH_M,
  NIGHT_GAIN,
  PHOTO,
  SIGN,
  TOWER_MEASURED,
  TOWER_MODEL,
  signPlacement,
} from './spec';

/** LiDAR measurements of the tower (scripts/police-signs-d1/police_tower_lidar.py). */
const lidar = JSON.parse(
  fs.readFileSync('docs/police-signs-d1/data/police-tower-lidar.json', 'utf8'),
);
const M = 25;
/** The drawn slab (src/lib/mapLandmarks.ts): width 0.51, height 1.82 at y 0.98, length 2.65. */
const SLAB = { halfWidth: 0.51 / 2, top: 0.98 + 1.82 / 2, capHalfLength: 2.71 / 2 };

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
    expect(GABLE_WIDTH_M - TOWER_MEASURED.widthM).toBeGreaterThanOrEqual(0);
    expect(GABLE_WIDTH_M - TOWER_MEASURED.widthM).toBeLessThanOrEqual(1);
  });

  test('sign size and height follow from the photo ratios', () => {
    expect(SIGN.widthM).toBeCloseTo((PHOTO.emblemWidthPx / PHOTO.gablePx) * GABLE_WIDTH_M, 2);
    expect(SIGN.widthM).toBeCloseTo(3.75, 2);
    expect(SIGN.heightM).toBeCloseTo(4.96, 2);
    expect(SIGN.centreBelowParapetM).toBeCloseTo(10.9, 1);
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
    // Face 0.25 m in front of the slab's gable wall, behind the parapet cap's overhang.
    expect((p.z - TOWER_MODEL.halfLength) * M).toBeCloseTo(SIGN.standoffM, 6);
    expect(p.z).toBeLessThan(SLAB.capHalfLength);
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
