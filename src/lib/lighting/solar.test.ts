import { describe, expect, test } from 'vitest';
import {
  addDays,
  dayPhase,
  extreme,
  localToUtc,
  presets,
  solarPosition,
  sunDirection,
  utcToLocal,
  zoneOffsetMinutes,
} from './solar';

// Norrköping (scene origin, E 569 030 N 6 494 989).
const LAT = 58.5877,
  LON = 16.1924;
const iso = (ms: number) => new Date(ms).toISOString();

describe('Europe/Stockholm wall clock', () => {
  test('winter and summer offsets', () => {
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 15, 12))).toBe(60);
    expect(zoneOffsetMinutes(Date.UTC(2026, 6, 15, 12))).toBe(120);
  });
  test('ordinary times convert both ways', () => {
    expect(iso(localToUtc('2026-01-15', 12 * 60))).toBe('2026-01-15T11:00:00.000Z');
    expect(iso(localToUtc('2026-07-15', 12 * 60))).toBe('2026-07-15T10:00:00.000Z');
    for (let h = 0; h < 48 * 4; h++) {
      const utc = Date.UTC(2026, 2, 28) + h * 15 * 60000; // across the spring change
      const local = utcToLocal(utc);
      expect(localToUtc(local.date, local.minutes)).toBe(utc);
    }
  });
  test('spring forward: the missing hour moves forward by the gap', () => {
    // 2026-03-29 02:00 CET → 03:00 CEST. 01:59 is CET, 02:30 does not exist, 03:00 is CEST.
    expect(iso(localToUtc('2026-03-29', 119))).toBe('2026-03-29T00:59:00.000Z');
    expect(iso(localToUtc('2026-03-29', 150))).toBe('2026-03-29T01:30:00.000Z');
    expect(iso(localToUtc('2026-03-29', 180))).toBe('2026-03-29T01:00:00.000Z');
  });
  test('fall back: an ambiguous time takes the first (summer-time) occurrence', () => {
    // 2026-10-25 03:00 CEST → 02:00 CET; 02:30 happens twice (00:30Z and 01:30Z).
    expect(iso(localToUtc('2026-10-25', 150))).toBe('2026-10-25T00:30:00.000Z');
    expect(iso(localToUtc('2026-10-25', 210))).toBe('2026-10-25T02:30:00.000Z');
    expect(utcToLocal(Date.parse('2026-10-25T01:30:00Z'))).toEqual({
      date: '2026-10-25',
      minutes: 150,
    });
  });
  test('date arithmetic crosses months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('solar position over Norrköping', () => {
  test('noon elevation follows the declination (midsummer, equinox, midwinter)', () => {
    // 90° − φ ± ε plus ~0.0–0.1° refraction; φ = 58.59°, ε = 23.44°.
    expect(extreme('2026-06-21', true, LAT, LON).elevation).toBeCloseTo(90 - LAT + 23.44, 0);
    expect(extreme('2026-12-21', true, LAT, LON).elevation).toBeCloseTo(90 - LAT - 23.44 + 0.1, 0);
    const equinox = extreme('2026-03-20', true, LAT, LON).elevation;
    expect(equinox).toBeGreaterThan(30.6);
    expect(equinox).toBeLessThan(32.2);
  });
  test('azimuth: east in the morning, south at solar noon, west in the evening', () => {
    const noon = extreme('2026-06-21', true, LAT, LON).minutes;
    const at = (m: number) => solarPosition(localToUtc('2026-06-21', m), LAT, LON);
    expect(at(noon).azimuth).toBeGreaterThan(178);
    expect(at(noon).azimuth).toBeLessThan(182);
    expect(at(6 * 60).azimuth).toBeLessThan(110);
    expect(at(18 * 60).azimuth).toBeGreaterThan(250);
    // Solar noon at 16.19° E: 12:00 UTC − 64.8 min + 1.7 min (equation of time) ≈ 10:57 UTC = 12:57 CEST.
    expect(Math.abs(noon - (12 * 60 + 57))).toBeLessThan(3);
  });
  test('a midsummer night is twilight, not dark night; midwinter reaches astronomical night', () => {
    const june = extreme('2026-06-21', false, LAT, LON);
    expect(june.elevation).toBeGreaterThan(-9);
    expect(june.elevation).toBeLessThan(-7);
    expect(dayPhase(june.elevation)).toBe('nautical-twilight');
    const june21 = presets('2026-06-21', LAT, LON).find((p) => p.id === 'night')!;
    expect(june21.label).toMatch(/Ljus natt/);
    const dec = presets('2026-12-21', LAT, LON).find((p) => p.id === 'night')!;
    expect(dec.phase).toBe('night');
    expect(dec.label).toBe('Natt');
  });
  test('presets are ordered and derived from the sun', () => {
    const p = Object.fromEntries(presets('2026-10-21', LAT, LON).map((x) => [x.id, x]));
    expect(p.sunrise.minutes).toBeLessThan(p.day.minutes);
    expect(p.day.minutes).toBeLessThan(p.sunset.minutes);
    expect(p.sunset.minutes).toBeLessThan(p.twilight.minutes);
    expect(p.sunrise.elevation).toBeCloseTo(-0.833, 1);
    expect(p.sunset.elevation).toBeCloseTo(-0.833, 1);
    expect(p.twilight.elevation).toBeCloseTo(-3, 1);
    // 2026-10-21 is CEST: sunset in Norrköping ≈ 17:50.
    expect(Math.abs(p.sunset.minutes - (17 * 60 + 50))).toBeLessThan(15);
  });
  test('continuous over midnight and over the DST change', () => {
    const before = solarPosition(localToUtc('2026-10-21', 1439.999), LAT, LON).elevation;
    const after = solarPosition(localToUtc('2026-10-22', 0), LAT, LON).elevation;
    expect(Math.abs(after - before)).toBeLessThan(0.01);
    // Ten-minute steps through the 2026-10-25 night: no step larger than the sun moves in 10 min.
    let prev = solarPosition(Date.parse('2026-10-24T20:00:00Z'), LAT, LON).elevation;
    for (let m = 10; m <= 12 * 60; m += 10) {
      const e = solarPosition(Date.parse('2026-10-24T20:00:00Z') + m * 60000, LAT, LON).elevation;
      expect(Math.abs(e - prev)).toBeLessThan(2.6);
      prev = e;
    }
  });
});

describe('sun direction in the scene frame', () => {
  // terrain.trueNorth: true north is 1.0135° west of grid north at the origin.
  const north: [number, number] = [
    -Math.sin((1.0135 * Math.PI) / 180),
    -Math.cos((1.0135 * Math.PI) / 180),
  ];
  test('true azimuths map through true north, not grid north', () => {
    const n = sunDirection(0, 0, north);
    expect(n[0]).toBeCloseTo(north[0], 9);
    expect(n[2]).toBeCloseTo(north[1], 9);
    const e = sunDirection(90, 0, north);
    expect(e[0]).toBeGreaterThan(0.99); // east is +x
    // True north is turned 1° west of grid north, so true east is turned 1° towards grid north (−z).
    expect(e[2]).toBeCloseTo(north[0], 9);
    const s = sunDirection(180, 0, north);
    expect(s[2]).toBeGreaterThan(0.99); // south is +z
  });
  test('elevation sets the vertical component; unit length', () => {
    const d = sunDirection(231, 53.6, north);
    expect(Math.hypot(...d)).toBeCloseTo(1, 12);
    expect(d[1]).toBeCloseTo(Math.sin((53.6 * Math.PI) / 180), 12);
  });
});
