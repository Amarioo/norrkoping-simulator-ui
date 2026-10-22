/**
 * Simulated date/time in Europe/Stockholm and the sun's position over Norrköping.
 *
 * - Wall-clock time is converted to UTC with the IANA zone through Intl (no hand-written DST rules):
 *   a non-existent spring-forward time moves forward by the gap, an ambiguous autumn time takes the
 *   first (summer-time) occurrence.
 * - Solar position: NOAA solar calculator (Meeus), ±0.01° in elevation for 1950–2050, with the
 *   standard NOAA atmospheric refraction correction. Azimuth is clockwise from TRUE north.
 * - Scene direction: true azimuth is rotated into the SWEREF 99 TM grid frame with terrain.trueNorth
 *   (scene x east, z south); see sunDirection().
 */
export const ZONE = 'Europe/Stockholm';
const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(zone, f);
  }
  return f;
}
export interface LocalTime {
  /** YYYY-MM-DD */
  date: string;
  /** Minutes after local midnight, 0 ≤ m < 1440 (fractional seconds kept). */
  minutes: number;
}
function parts(utcMs: number, zone: string) {
  const p: Record<string, number> = {};
  for (const { type, value } of formatter(zone).formatToParts(new Date(utcMs)))
    if (type !== 'literal') p[type] = Number(value);
  return p;
}
/** UTC offset of the zone at an instant, minutes (Stockholm: +60 or +120). */
export function zoneOffsetMinutes(utcMs: number, zone = ZONE) {
  const p = parts(utcMs, zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}
export function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
/** Local wall-clock time in `zone` → UTC milliseconds. */
export function localToUtc(date: string, minutes: number, zone = ZONE): number {
  const [y, mo, d] = parseDate(date);
  const wall = Date.UTC(y, mo - 1, d) + minutes * 60000;
  const before = zoneOffsetMinutes(wall - DAY_MS / 2, zone),
    after = zoneOffsetMinutes(wall + DAY_MS / 2, zone);
  const valid = [before, after]
    .map((o) => wall - o * 60000)
    .filter((t) => wall - zoneOffsetMinutes(t, zone) * 60000 === t);
  // Ambiguous (both valid): the earlier instant. Gap (none valid): the pre-transition offset, which
  // lands after the gap (02:30 on the spring-forward day becomes 03:30 summer time).
  return valid.length ? Math.min(...valid) : wall - before * 60000;
}
/** UTC milliseconds → local date and minutes in `zone`. */
export function utcToLocal(utcMs: number, zone = ZONE): LocalTime {
  const p = parts(utcMs, zone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    minutes: p.hour * 60 + p.minute + p.second / 60 + (utcMs % 1000) / 60000,
  };
}
/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number) {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface SolarPosition {
  /** Degrees clockwise from true north. */
  azimuth: number;
  /** Apparent elevation (with refraction), degrees. */
  elevation: number;
  /** Geometric elevation, degrees. */
  geometricElevation: number;
}
/** NOAA solar position for an instant (UTC ms) and a geodetic position (degrees, east positive). */
export function solarPosition(utcMs: number, lat: number, lon: number): SolarPosition {
  const jd = utcMs / DAY_MS + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps * RAD) / 2) ** 2;
  const eot =
    (4 / RAD) *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD));
  const utcMinutes = (((utcMs % DAY_MS) + DAY_MS) % DAY_MS) / 60000;
  const solarTime = (((utcMinutes + eot + 4 * lon) % 1440) + 1440) % 1440;
  let hourAngle = solarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  const phi = lat * RAD,
    ha = hourAngle * RAD;
  const cosZenith = Math.max(
    -1,
    Math.min(1, Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha)),
  );
  const zenith = Math.acos(cosZenith);
  const geometric = 90 - zenith / RAD;
  const azimuth =
    (((Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) /
      RAD +
      180) %
      360) +
      360) %
    360;
  return { azimuth, elevation: geometric + refraction(geometric), geometricElevation: geometric };
}
/** NOAA atmospheric refraction correction, degrees. */
function refraction(h: number) {
  if (h > 85) return 0;
  const t = Math.tan(h * RAD);
  let arcsec: number;
  if (h > 5) arcsec = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5;
  else if (h > -0.575) arcsec = 1735 + h * (-518.2 + h * (103.4 + h * (-12.79 + h * 0.711)));
  else arcsec = -20.774 / t;
  return arcsec / 3600;
}
/**
 * Unit vector towards the sun in the scene frame (x east, y up, z south) from a TRUE azimuth.
 * `trueNorth` is the scene (x, z) unit vector of true north (terrain.trueNorth); true east is that
 * vector turned 90° clockwise seen from above.
 */
export function sunDirection(
  azimuth: number,
  elevation: number,
  trueNorth: [number, number],
): [number, number, number] {
  const [nx, nz] = trueNorth,
    ex = -nz,
    ez = nx;
  const a = azimuth * RAD,
    h = elevation * RAD;
  const hx = Math.cos(a) * nx + Math.sin(a) * ex,
    hz = Math.cos(a) * nz + Math.sin(a) * ez;
  return [hx * Math.cos(h), Math.sin(h), hz * Math.cos(h)];
}

export type DayPhase =
  'day' | 'golden' | 'civil-twilight' | 'nautical-twilight' | 'astronomical-twilight' | 'night';
/** Standard twilight bands of the apparent solar elevation. */
export function dayPhase(elevation: number): DayPhase {
  if (elevation >= 6) return 'day';
  if (elevation >= -0.833) return 'golden';
  if (elevation >= -6) return 'civil-twilight';
  if (elevation >= -12) return 'nautical-twilight';
  if (elevation >= -18) return 'astronomical-twilight';
  return 'night';
}

/** Local minutes of the day at which the elevation crosses `threshold` (rising or setting). */
export function crossing(
  date: string,
  threshold: number,
  rising: boolean,
  lat: number,
  lon: number,
  zone = ZONE,
): number | null {
  const elev = (m: number) => solarPosition(localToUtc(date, m, zone), lat, lon).elevation;
  let prev = elev(0);
  for (let m = 5; m <= 1440; m += 5) {
    const cur = elev(m);
    if (rising ? prev < threshold && cur >= threshold : prev >= threshold && cur < threshold) {
      let lo = m - 5,
        hi = m;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const v = elev(mid);
        if (rising ? v < threshold : v >= threshold) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    prev = cur;
  }
  return null;
}
/** Local minutes of the extreme (max or min) elevation on a date, 1-minute resolution. */
export function extreme(date: string, max: boolean, lat: number, lon: number, zone = ZONE) {
  let best = 0,
    bestV = max ? -Infinity : Infinity;
  // Solar midnight can fall either side of local midnight; search 12:00 → 36:00 for the minimum.
  const start = max ? 0 : 720;
  for (let m = start; m < start + 1440; m++) {
    const v = solarPosition(localToUtc(date, 0, zone) + m * 60000, lat, lon).elevation;
    if (max ? v > bestV : v < bestV) {
      bestV = v;
      best = m;
    }
  }
  return { minutes: best, elevation: bestV };
}

export type PresetId = 'sunrise' | 'day' | 'sunset' | 'twilight' | 'night';
export interface Preset {
  id: PresetId;
  /** Minutes after local midnight of `date` (may be ≥ 1440: after midnight, next calendar day). */
  minutes: number;
  elevation: number;
  phase: DayPhase;
  label: string;
}
/**
 * Deterministic lighting presets for a date, derived from the sun (not fixed clock times):
 * sunrise/sunset at the standard −0.833° horizon, "twilight" in the middle of evening civil twilight
 * (−3°), "night" at the deepest point of the night (solar midnight). Labels say what that night is:
 * in a Swedish summer the sun never reaches −18°, so solar midnight is twilight, not dark night.
 */
export function presets(date: string, lat: number, lon: number, zone = ZONE): Preset[] {
  const at = (minutes: number) =>
    solarPosition(localToUtc(date, 0, zone) + minutes * 60000, lat, lon).elevation;
  const noon = extreme(date, true, lat, lon, zone);
  const midnight = extreme(date, false, lat, lon, zone);
  const rise = crossing(date, -0.833, true, lat, lon, zone);
  const set = crossing(date, -0.833, false, lat, lon, zone);
  const dusk = crossing(date, -3, false, lat, lon, zone);
  const out: Preset[] = [];
  const add = (id: PresetId, minutes: number | null, label: string) => {
    if (minutes === null) return;
    const elevation = at(minutes);
    out.push({ id, minutes, elevation, phase: dayPhase(elevation), label });
  };
  add('sunrise', rise, 'Soluppgång');
  add('day', noon.minutes, 'Dag (sann middag)');
  add('sunset', set, 'Solnedgång');
  add('twilight', dusk, 'Skymning (−3°)');
  const nightLabel: Record<DayPhase, string> = {
    night: 'Natt',
    'astronomical-twilight': 'Natt (astronomisk skymning)',
    'nautical-twilight': 'Ljus natt (nautisk skymning)',
    'civil-twilight': 'Ljus natt (borgerlig skymning)',
    golden: 'Midnattssol',
    day: 'Midnattssol',
  };
  add('night', midnight.minutes, nightLabel[dayPhase(midnight.elevation)]);
  return out;
}
