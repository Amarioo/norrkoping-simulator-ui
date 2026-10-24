// Step 6.1b: classify live SSE positions at Bergsbron, one episode per northbound entry per vehicle.
//
// An episode starts when a vehicle is first seen on the deck heading north and is resolved ONLY by that
// same vehicle: `crossed` (north of the Bredgatan junction on Kungsgatan, still heading north),
// `exitedAtJunction` (left Kungsgatan onto another road north of the bridge; a legitimate departure but
// not a crossing), `reversed` (heading south while still on or at the bridge), `turnedBack` (heading
// south on Kungsgatan between the bridge and the junction), `leftArea` (disappeared from the observed
// box first). Window boundaries are explicit:
// episodes already on the deck in the first frame are `startedBeforeWindow`, and unresolved episodes
// at the last frame are `openAtWindowEnd`; neither counts as a crossing or a failure.
//
// Policy: trucks must never enter northbound (their onward street is closed to them). Buses may (verified
// route 21 corridor). No vehicle may reverse or turn back before the junction.
// Usage: node scripts/step61b/analyze-traffic.mjs <trace.json with frames> <report.json>
import fs from 'node:fs';

export const AREA = { minX: -23, maxX: -19, minZ: -4, maxZ: 4 }; // scene units, Kungsgatan at Bergsbron
const DECK = { south: 2.7, north: -1.3 }; // z range of the bridge deck (north is -z)
const BRIDGE_END = -1.6; // beyond this the vehicle has left the deck
const JUNCTION = -2.5; // north of the Bredgatan junction (node 1108233121 at z ≈ -2.24)
const north = (v) => Math.cos(v.heading) < -0.7;
const south = (v) => Math.cos(v.heading) > 0.7;
const onDeckNorthbound = (v) =>
  v.road === 'Kungsgatan' && v.pos[2] > DECK.north && v.pos[2] < DECK.south && north(v);
const isCar = (kind) => kind === 'compact' || kind === 'estate';

export function analyzeTraffic(frames) {
  const episodes = [],
    open = new Map();
  frames.forEach((frame, index) => {
    const present = new Set();
    for (const v of frame.vehicles) {
      present.add(v.id);
      let ep = open.get(v.id);
      if (!ep && onDeckNorthbound(v)) {
        ep = {
          id: v.id,
          kind: v.kind,
          entered: frame.time,
          startedBeforeWindow: index === 0,
          points: [],
        };
        episodes.push(ep);
        open.set(v.id, ep);
      }
      if (!ep) continue;
      ep.points.push({ time: frame.time, pos: v.pos, heading: v.heading, road: v.road });
      const z = v.pos[2];
      let outcome = null;
      if (z < JUNCTION && north(v)) outcome = 'crossed';
      // Leaving Kungsgatan north of the bridge (onto Bredgatan at the junction) is a legitimate
      // departure; what the vehicle does afterwards (e.g. turning at Bredgatan's mapped road end)
      // is outside this episode.
      else if (v.road !== 'Kungsgatan' && z < BRIDGE_END) outcome = 'exitedAtJunction';
      else if (south(v)) outcome = z > BRIDGE_END ? 'reversed' : 'turnedBack';
      if (outcome) {
        Object.assign(ep, { outcome, resolved: frame.time });
        open.delete(v.id);
      }
    }
    for (const [id, ep] of open)
      if (!present.has(id) && ep.points.at(-1).time < frame.time) {
        Object.assign(ep, { outcome: 'leftArea', resolved: frame.time });
        open.delete(id);
      }
  });
  for (const ep of open.values()) ep.outcome = 'openAtWindowEnd';
  const counted = episodes.filter((e) => !e.startedBeforeWindow);
  const tally = (list) =>
    list.reduce(
      (m, e) => ({ ...m, [`${e.kind}:${e.outcome}`]: (m[`${e.kind}:${e.outcome}`] ?? 0) + 1 }),
      {},
    );
  return {
    start: frames[0]?.time,
    end: frames.at(-1)?.time,
    episodes,
    forbiddenEntries: episodes.filter((e) => e.kind === 'truck'),
    reversals: episodes.filter((e) => e.outcome === 'reversed' || e.outcome === 'turnedBack'),
    busCrossings: counted.filter((e) => e.kind === 'bus' && e.outcome === 'crossed'),
    carCrossings: counted.filter((e) => isCar(e.kind) && e.outcome === 'crossed'),
    // Normal car passages: north on Kungsgatan or onto Bredgatan at the junction.
    carPassages: counted.filter(
      (e) => isCar(e.kind) && (e.outcome === 'crossed' || e.outcome === 'exitedAtJunction'),
    ),
    summary: tally(episodes),
  };
}

/**
 * Acceptance for the live Bergsbron test. `failures` are definitive (stop the test); `pending` lists
 * positive requirements not yet observed. Each requirement is met by an individual episode whose entry
 * was observed inside the window.
 */
export function acceptance(
  report,
  { minCarPassages = 3, minCarCrossings = 1, minBusCrossings = 1 } = {},
) {
  const describe = (e) => `${e.kind} #${e.id} entered at t=${e.entered}: ${e.outcome}`;
  const failures = [
    ...report.forbiddenEntries.map((e) => `truck entered the northbound trap: ${describe(e)}`),
    ...report.reversals.map((e) => `did not continue north: ${describe(e)}`),
  ];
  const pending = [];
  if (report.busCrossings.length < minBusCrossings)
    pending.push(`bus crossings ${report.busCrossings.length} < ${minBusCrossings}`);
  if (report.carPassages.length < minCarPassages)
    pending.push(`car passages ${report.carPassages.length} < ${minCarPassages}`);
  if (report.carCrossings.length < minCarCrossings)
    pending.push(
      `car crossings north on Kungsgatan ${report.carCrossings.length} < ${minCarCrossings}`,
    );
  return { ok: failures.length === 0 && pending.length === 0, failures, pending };
}

if (process.argv[1]?.endsWith('analyze-traffic.mjs')) {
  const report = analyzeTraffic(JSON.parse(fs.readFileSync(process.argv[2])).frames);
  fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      window: [report.start, report.end],
      ...report.summary,
      acceptance: acceptance(report),
    }),
  );
}
