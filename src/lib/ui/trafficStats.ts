// Interface U1: the numbers behind the two charts under the map. Pure functions, no DOM.
// Everything here is read from the simulator's own snapshot (simulated traffic), nothing measured.

export interface MovingSample {
  /** Wall-clock time of the sample. */
  t: Date;
  /** Vehicles not standing still in that snapshot. */
  moving: number;
}

/** How often the charts read the snapshot, and how far back the line chart reaches. */
export const SAMPLE_MS = 2000;
export const HISTORY_MS = 5 * 60_000;

/** Appends a sample and drops the ones older than the window. Returns a new array. */
export function pushSample(
  history: readonly MovingSample[],
  sample: MovingSample,
  windowMs = HISTORY_MS,
): MovingSample[] {
  const oldest = sample.t.getTime() - windowMs;
  return [...history.filter((s) => s.t.getTime() >= oldest), sample];
}

export const KIND_LABELS = {
  compact: 'Personbilar',
  estate: 'Kombibilar',
  truck: 'Lastbilar',
  bus: 'Bussar',
  tram: 'Spårvagnar',
  train: 'Pendeltåg',
} as const;
export type VehicleKind = keyof typeof KIND_LABELS;

export interface KindCount {
  kind: VehicleKind;
  label: string;
  count: number;
}

/** Vehicles per kind, always all six kinds in the same order (zero when there are none). */
export function countByKind(vehicles: readonly { kind: string }[]): KindCount[] {
  const counts = new Map<string, number>();
  for (const v of vehicles) counts.set(v.kind, (counts.get(v.kind) ?? 0) + 1);
  return (Object.keys(KIND_LABELS) as VehicleKind[]).map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    count: counts.get(kind) ?? 0,
  }));
}

export const sameCounts = (a: readonly KindCount[], b: readonly KindCount[]) =>
  a.length === b.length && a.every((k, i) => k.count === b[i].count);
