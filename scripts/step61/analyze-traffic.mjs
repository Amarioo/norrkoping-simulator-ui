// Classify the saved live SSE positions. A return AFTER leaving the deck is not a bridge-end U-turn.
import fs from 'node:fs';
export function analyzeTraffic(frames) {
  const vehicles = new Map(),
    reversals = [],
    crossings = [],
    forbiddenEntries = [];
  for (const frame of frames)
    for (const v of frame.vehicles) {
      let state = vehicles.get(v.id);
      if (
        !state &&
        v.road === 'Kungsgatan' &&
        v.pos[2] > -1.3 &&
        v.pos[2] < 2.7 &&
        Math.cos(v.heading) < -0.7
      ) {
        state = { id: v.id, kind: v.kind, approach: frame.time, points: [] };
        vehicles.set(v.id, state);
        if (['truck', 'bus'].includes(v.kind))
          forbiddenEntries.push({ time: frame.time, vehicle: v });
      }
      if (!state) continue;
      if (!state.done)
        state.points.push({ time: frame.time, pos: v.pos, heading: v.heading, road: v.road });
      if (v.pos[2] < -1.6) state.departed = true;
      if (
        !state.done &&
        !state.departed &&
        v.pos[2] < 0 &&
        v.pos[2] > -1.5 &&
        Math.cos(v.heading) > 0.7
      ) {
        state.done = true;
        reversals.push(state);
      }
      if (!state.done && v.pos[2] < -2.5 && Math.cos(v.heading) < -0.7) {
        state.done = true;
        crossings.push(state);
      }
    }
  return {
    start: frames[0]?.time,
    end: frames.at(-1)?.time,
    reversals,
    crossings,
    forbiddenEntries,
  };
}
if (process.argv[1]?.endsWith('analyze-traffic.mjs')) {
  const report = analyzeTraffic(JSON.parse(fs.readFileSync(process.argv[2])).frames);
  fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      reversals: report.reversals.length,
      crossings: report.crossings.length,
      forbiddenEntries: report.forbiddenEntries.length,
    }),
  );
}
