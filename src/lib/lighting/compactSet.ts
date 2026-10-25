/**
 * Lighting Phase L2: compact runtime format `lighting-compact-v1` for large generated fixture sets.
 *
 * The A1–A3 format stores one JSON object per fixture (≈ 330 bytes, ≈ 8 MB for 25 000). This format
 * stores one little-endian typed column per field, base64-encoded (≈ 56 bytes per fixture before
 * base64): canonical identity (kind, OSM element, station), type index, scene x/z (1e-4 units, as the
 * generator rounds them), heading (1e-6 rad, null as INT32_MIN), occlusion (16 × centimetres, the
 * generator rounds metres to 0.01) and bridge mounts as a sparse JSON list. Decoding yields the
 * A1–A3 runtime records (corridorRegistry input), so validation and rendering are unchanged.
 */
import type { A1Fixture } from './corridorGenerator';

export const COMPACT_FORMAT = 'lighting-compact-v1';
const NULL_HEADING = -2147483648;
const SECTORS = 16;

export interface CompactMeta {
  format: typeof COMPACT_FORMAT;
  generator: { script: string; version: string; seed: null };
  rollout: string;
  provenance: string;
  zone: string;
  sources: { id: string; dataset: string; license: string; osmBase: string }[];
  types: Record<string, { heightM: number; cct: number; candela: number; rangeM: number; profile: number }>;
}
export interface CompactSet {
  /** Required fields plus descriptive extras (corridor, units, counts …). */
  meta: CompactMeta & Record<string, unknown>;
  count: number;
  columns: {
    /** 0 = estimate (way/station), 1 = mapped OSM node. Uint8. */
    kind: string;
    /** OSM way or node ID. Float64. */
    element: string;
    /** Station index along the way (0 for mapped). Uint16. */
    station: string;
    /** Index into Object.keys(meta.types). Uint8. */
    type: string;
    /** Scene x, z × 1e4. Int32. */
    x: string;
    z: string;
    /** Heading × 1e6 rad, INT32_MIN = null. Int32. */
    heading: string;
    /** 16 occlusion distances per fixture, centimetres. Uint16. */
    occlusion: string;
  };
  /** Bridge-deck mounts: [fixture index, segment]. */
  bridges: [number, { way: number; a: number[]; b: number[]; yA: number; yB: number; t: number }][];
}

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s: string) => {
  const b = atob(s);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};
const ID = /^(?:osm:node\/(\d+)|estimate:([a-z0-9.-]+):way\/(\d+):s(\d+))$/;

/** Encodes generator records (sorted by canonical ID) into the compact format. */
export function encodeCompactSet(
  fixtures: A1Fixture[],
  meta: Omit<CompactMeta, 'format'> & Record<string, unknown>,
): CompactSet {
  const n = fixtures.length;
  const typeNames = Object.keys(meta.types);
  const kind = new Uint8Array(n),
    station = new DataView(new ArrayBuffer(n * 2)),
    element = new DataView(new ArrayBuffer(n * 8)),
    type = new Uint8Array(n),
    x = new DataView(new ArrayBuffer(n * 4)),
    z = new DataView(new ArrayBuffer(n * 4)),
    heading = new DataView(new ArrayBuffer(n * 4)),
    occlusion = new DataView(new ArrayBuffer(n * SECTORS * 2));
  const bridges: CompactSet['bridges'] = [];
  fixtures.forEach((f, i) => {
    const m = ID.exec(f.id);
    if (!m) throw new Error(`${f.id}: not a compact-encodable ID`);
    if (m[2] && m[2] !== meta.generator.version) throw new Error(`${f.id}: foreign generator`);
    if (f.zone !== meta.zone) throw new Error(`${f.id}: zone ${f.zone} ≠ ${meta.zone}`);
    const t = meta.types[f.type];
    const ti = typeNames.indexOf(f.type);
    if (ti < 0 || t.heightM !== f.heightM || t.cct !== f.cct || t.candela !== f.candela || t.rangeM !== f.rangeM || t.profile !== f.profile)
      throw new Error(`${f.id}: type ${f.type} does not match the type table`);
    if ((f.placement === 'mapped') !== !!m[1]) throw new Error(`${f.id}: placement/ID mismatch`);
    kind[i] = m[1] ? 1 : 0;
    element.setFloat64(i * 8, Number(m[1] ?? m[3]), true);
    station.setUint16(i * 2, m[4] ? Number(m[4]) : 0, true);
    type[i] = ti;
    const xi = Math.round(f.x * 1e4),
      zi = Math.round(f.z * 1e4);
    if (xi / 1e4 !== f.x || zi / 1e4 !== f.z) throw new Error(`${f.id}: position not on the 1e-4 grid`);
    x.setInt32(i * 4, xi, true);
    z.setInt32(i * 4, zi, true);
    heading.setInt32(i * 4, f.heading === null ? NULL_HEADING : Math.round(f.heading * 1e6), true);
    if (f.occlusionM.length !== SECTORS) throw new Error(`${f.id}: occlusion length`);
    f.occlusionM.forEach((v, s) => {
      const c = Math.round(v * 100);
      if (c / 100 !== v || c < 0 || c > 65535) throw new Error(`${f.id}: occlusion ${v} not centimetres`);
      occlusion.setUint16((i * SECTORS + s) * 2, c, true);
    });
    if (f.mount.kind === 'bridge') bridges.push([i, f.mount.segment]);
  });
  const b = (v: DataView | Uint8Array) =>
    toBase64(v instanceof Uint8Array ? v : new Uint8Array(v.buffer));
  return {
    meta: { format: COMPACT_FORMAT, ...meta },
    count: n,
    columns: {
      kind: b(kind),
      element: b(element),
      station: b(station),
      type: b(type),
      x: b(x),
      z: b(z),
      heading: b(heading),
      occlusion: b(occlusion),
    },
    bridges,
  };
}

/** Decodes the compact format into A1–A3 runtime records (corridorRegistry input). */
export function decodeCompactSet(set: CompactSet): {
  meta: { sources: CompactSet['meta']['sources'] };
  fixtures: A1Fixture[];
} {
  if (set.meta.format !== COMPACT_FORMAT) throw new Error(`unsupported format ${set.meta.format}`);
  const n = set.count;
  const view = (k: keyof CompactSet['columns'], bytes: number) => {
    const u = fromBase64(set.columns[k]);
    if (u.length !== n * bytes) throw new Error(`column ${k}: ${u.length} bytes for ${n} fixtures`);
    return new DataView(u.buffer);
  };
  const kind = view('kind', 1),
    element = view('element', 8),
    station = view('station', 2),
    type = view('type', 1),
    x = view('x', 4),
    z = view('z', 4),
    heading = view('heading', 4),
    occlusion = view('occlusion', SECTORS * 2);
  const typeNames = Object.keys(set.meta.types);
  const bridges = new Map(set.bridges);
  const version = set.meta.generator.version;
  const fixtures: A1Fixture[] = [];
  for (let i = 0; i < n; i++) {
    const mapped = kind.getUint8(i) === 1;
    const el = element.getFloat64(i * 8, true);
    const typeName = typeNames[type.getUint8(i)];
    const t = set.meta.types[typeName];
    const h = heading.getInt32(i * 4, true);
    const seg = bridges.get(i);
    fixtures.push({
      id: mapped ? `osm:node/${el}` : `estimate:${version}:way/${el}:s${station.getUint16(i * 2, true)}`,
      zone: set.meta.zone,
      type: typeName,
      x: x.getInt32(i * 4, true) / 1e4,
      z: z.getInt32(i * 4, true) / 1e4,
      heading: h === NULL_HEADING ? null : h / 1e6,
      mount: seg ? { kind: 'bridge', segment: seg } : { kind: 'ground' },
      placement: mapped ? 'mapped' : 'estimated',
      heightM: t.heightM,
      cct: t.cct,
      candela: t.candela,
      rangeM: t.rangeM,
      profile: t.profile,
      occlusionM: Array.from(
        { length: SECTORS },
        (_, s) => occlusion.getUint16((i * SECTORS + s) * 2, true) / 100,
      ),
    });
  }
  return { meta: { sources: set.meta.sources }, fixtures };
}
