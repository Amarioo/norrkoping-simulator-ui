/**
 * Phase C2 — the Vrinnevi illuminated trail: which fixtures stand on the loop, and when the loop is
 * switched off. No imports, so the renderer (fixtures.ts) can use it; the rule, its sources and the
 * generator are described in trailLighting.ts.
 */

/** The loop: OSM route relation and its member ways (scripts/data/trail-c2-source.json). */
export const TRAIL_RELATION = 5703856;
export const TRAIL_WAYS: readonly number[] = [
  26223168, 122294025, 122294026, 372645636, 383320758, 383320778, 383320779, 383320782, 383320783,
  383320784, 432960719, 432960730, 432960738, 432960741,
];
/**
 * Switch-off schedule of the whole loop, local time (Europe/Stockholm), minutes after midnight.
 * ASSUMPTION (see the header): on from 06.00, off from 22.00. Between those hours the lamps follow
 * the dusk/dawn level of all other lighting, so by day they are off anyway.
 */
export const TRAIL_SCHEDULE = {
  onFromMinutes: 6 * 60,
  offFromMinutes: 22 * 60,
  status: 'assumption',
  basis:
    "Norrköpings kommun's description of its Abborreberg illuminated trail (Naturkartan): lamps on 06.00 to dawn and dusk to 22.00. Not stated for Vrinnevi.",
} as const;
/** True when the trail's lamps are allowed to be on at this local time (minutes, any day offset). */
export function trailScheduleOn(minutes: number) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return m >= TRAIL_SCHEDULE.onFromMinutes && m < TRAIL_SCHEDULE.offFromMinutes;
}

const WAY_ID = /^estimate:[a-z0-9.-]+:way\/(\d+):s\d+$/;
const TRAIL_SET = new Set(TRAIL_WAYS);
/**
 * True for a fixture that stands on the loop: an estimate of any rollout (L2bc's lanterns and this
 * phase's) whose canonical ID names one of the loop's ways. These follow TRAIL_SCHEDULE.
 */
export function isTrailFixture(canonicalId: string) {
  const m = WAY_ID.exec(canonicalId);
  return !!m && TRAIL_SET.has(Number(m[1]));
}
