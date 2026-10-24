// Step 6.1b: classify live SSE positions at Bergsbron under the corrected policy.
// Trucks must never enter northbound (their onward street is closed to them). Buses may: verified
// route 21 continues through the Kungsgatan gångfartsområde to Skvallertorget. No vehicle of any class
// may reverse on the deck. A return AFTER leaving the deck is not a bridge-end U-turn.
// Usage: node scripts/step61b/analyze-traffic.mjs <frames.json> <report.json>
import fs from 'node:fs';
const onDeckNorthbound = (v) =>
  v.road === 'Kungsgatan' && v.pos[2] > -1.3 && v.pos[2] < 2.7 && Math.cos(v.heading) < -0.7;
export function analyzeTraffic(frames) {
  const vehicles = new Map(),
    reversals = [],
    crossings = [],
    forbiddenEntries = [],
    busEntries = [];
  for (const frame of frames)
    for (const v of frame.vehicles) {
      let state = vehicles.get(v.id);
      if (!state && onDeckNorthbound(v)) {
        state = { id: v.id, kind: v.kind, approach: frame.time, points: [] };
        vehicles.set(v.id, state);
        if (v.kind === 'truck') forbiddenEntries.push({ time: frame.time, vehicle: v });
        if (v.kind === 'bus') busEntries.push({ time: frame.time, vehicle: v });
      }
      if (!state) continue;
      if (!state.done) state.points.push({ time: frame.time, pos: v.pos, heading: v.heading, road: v.road });
      if (v.pos[2] < -1.6) state.departed = true;
      if (!state.done && !state.departed && v.pos[2] < 0 && v.pos[2] > -1.5 && Math.cos(v.heading) > 0.7) {
        state.done = true;
        reversals.push(state);
      }
      if (!state.done && v.pos[2] < -2.5 && Math.cos(v.heading) < -0.7) {
        state.done = true;
        crossings.push(state);
      }
    }
  const byKind = (list) =>
    list.reduce((m, s) => ({ ...m, [s.kind]: (m[s.kind] ?? 0) + 1 }), {});
  return {
    start: frames[0]?.time,
    end: frames.at(-1)?.time,
    reversals,
    crossings,
    forbiddenEntries,
    busEntries,
    busCrossings: crossings.filter((s) => s.kind === 'bus'),
    carCrossings: crossings.filter((s) => s.kind === 'compact' || s.kind === 'estate'),
    summary: { crossings: byKind(crossings), reversals: byKind(reversals) },
  };
}
if (process.argv[1]?.endsWith('analyze-traffic.mjs')) {
  const report = analyzeTraffic(JSON.parse(fs.readFileSync(process.argv[2])).frames);
  fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      reversals: report.reversals.length,
      forbiddenTruckEntries: report.forbiddenEntries.length,
      busEntries: report.busEntries.length,
      ...report.summary,
    }),
  );
}
