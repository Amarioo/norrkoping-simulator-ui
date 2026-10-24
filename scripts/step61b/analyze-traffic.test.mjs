// Unit tests for the Step 6.1b Bergsbron analyzer. Run: node --test scripts/step61b/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTraffic, acceptance } from './analyze-traffic.mjs';

const NORTH = Math.PI,
  SOUTH = 0;
const at = (id, kind, z, heading = NORTH) => ({
  id,
  kind,
  pos: [-21, 0.7, z],
  heading,
  road: 'Kungsgatan',
});
/** Northbound trip for one vehicle: entering the deck at t0, sampled every 2 s, ending north of the junction. */
const trip = (id, kind, t0) =>
  [2.0, 0.5, -1.0, -2.0, -3.0].map((z, i) => ({ time: t0 + 2 * i, v: at(id, kind, z) }));
function frames(...tracks) {
  const byTime = new Map();
  for (const { time, v } of tracks.flat()) byTime.set(time, [...(byTime.get(time) ?? []), v]);
  const times = [...byTime.keys()].sort((a, b) => a - b);
  const all = [];
  // Observation always starts at t=0, so entries after it are inside the window.
  for (let t = 0; t <= times.at(-1); t += 2) all.push({ time: t, vehicles: byTime.get(t) ?? [] });
  return all;
}
const cars = (t0) => [
  trip(1, 'compact', t0),
  trip(2, 'estate', t0 + 20),
  trip(3, 'compact', t0 + 40),
];

test('no-bus input fails the acceptance condition even with normal car crossings', () => {
  const report = analyzeTraffic(frames(...cars(10)));
  const result = acceptance(report);
  assert.equal(report.carCrossings.length, 3);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, []);
  assert.match(result.pending.join(), /bus crossings 0 < 1/);
});

test('a tracked bus crossing passes', () => {
  const report = analyzeTraffic(frames(...cars(10), trip(80, 'bus', 30)));
  const result = acceptance(report);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(report.busCrossings[0].id, 80);
  assert.equal(report.busCrossings[0].entered, 30);
});

test('a bus reversing on the bridge fails', () => {
  const reverse = [
    { time: 30, v: at(80, 'bus', 2.0) },
    { time: 32, v: at(80, 'bus', 0.0) },
    { time: 34, v: at(80, 'bus', -0.5, SOUTH) },
  ];
  const result = acceptance(analyzeTraffic(frames(...cars(10), reverse, trip(81, 'bus', 70))));
  assert.equal(result.ok, false);
  assert.match(result.failures.join(), /bus #80 .*reversed/);
});

test('another bus cannot satisfy an entry episode it did not make', () => {
  // Bus 80 enters but leaves the observed area before the junction; bus 81 is already on the deck
  // when observation starts. Neither is an observed entry-to-crossing episode by one vehicle.
  const leaves = [
    { time: 30, v: at(80, 'bus', 2.0) },
    { time: 32, v: at(80, 'bus', 0.0) },
  ];
  const preexisting = [
    { time: 0, v: at(81, 'bus', 0.0) },
    { time: 2, v: at(81, 'bus', -3.0) },
  ];
  const report = analyzeTraffic(frames(preexisting, ...cars(10), leaves));
  assert.deepEqual(
    report.episodes
      .filter((e) => e.kind === 'bus')
      .map((e) => [e.id, e.outcome, e.startedBeforeWindow]),
    [
      [81, 'crossed', true],
      [80, 'leftArea', false],
    ],
  );
  assert.equal(acceptance(report).ok, false);
  assert.equal(report.busCrossings.length, 0);
});

test('an entry still on the bridge at the end of the window is open, not a crossing or failure', () => {
  const late = [
    { time: 56, v: at(80, 'bus', 2.0) },
    { time: 58, v: at(80, 'bus', 0.5) },
  ]; // last frames
  const report = analyzeTraffic(frames(...cars(10), late));
  assert.equal(report.episodes.find((e) => e.id === 80).outcome, 'openAtWindowEnd');
  const result = acceptance(report);
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, false);
});

test('exiting onto Bredgatan and later returning south is not a bridge reversal or a crossing', () => {
  // Shape of live estate #197 (2026-10-24 run): north over the bridge, east onto Bredgatan at the
  // junction, a turn at Bredgatan's mapped road end, then south again on Kungsgatan.
  const road = (id, z, heading, name, x = -21) => ({
    id,
    kind: 'estate',
    pos: [x, 0.7, z],
    heading,
    road: name,
  });
  const bredgatan = [
    { time: 30, v: road(97, 2.0, NORTH, 'Kungsgatan') },
    { time: 32, v: road(97, -1.66, NORTH, 'Kungsgatan') },
    { time: 34, v: road(97, -2.19, Math.PI / 2 + 0.1, 'Bredgatan', -20.5) },
    { time: 36, v: road(97, -2.26, Math.PI / 2 + 0.1, 'Bredgatan', -19.9) },
    { time: 38, v: road(97, -2.34, -Math.PI / 2 + 0.1, 'Bredgatan', -20.4) },
    { time: 40, v: road(97, -1.8, SOUTH, 'Kungsgatan') },
  ];
  const report = analyzeTraffic(frames(...cars(10), trip(80, 'bus', 50), bredgatan));
  assert.equal(report.episodes.find((e) => e.id === 97).outcome, 'exitedAtJunction');
  assert.equal(report.carCrossings.length, 3);
  assert.equal(report.carPassages.length, 4);
  assert.equal(acceptance(report).ok, true);
  // Junction exits count as normal car passages, but at least one car must continue north.
  const onlyExits = analyzeTraffic(frames(trip(80, 'bus', 50), bredgatan));
  assert.equal(onlyExits.carPassages.length, 1);
  assert.match(
    acceptance(onlyExits, { minCarPassages: 1 }).pending.join(),
    /north on Kungsgatan 0 < 1/,
  );
  // Heading south on Kungsgatan before reaching the junction is still a failure.
  const back = [
    { time: 30, v: road(98, 2.0, NORTH, 'Kungsgatan') },
    { time: 32, v: road(98, -1.8, NORTH, 'Kungsgatan') },
    { time: 34, v: road(98, -1.9, SOUTH, 'Kungsgatan') },
  ];
  assert.match(
    acceptance(analyzeTraffic(frames(...cars(10), trip(80, 'bus', 50), back))).failures.join(),
    /#98 .*turnedBack/,
  );
});

test('a northbound truck entry fails', () => {
  const result = acceptance(
    analyzeTraffic(frames(...cars(10), trip(80, 'bus', 30), trip(90, 'truck', 40))),
  );
  assert.equal(result.ok, false);
  assert.match(result.failures.join(), /truck entered the northbound trap: truck #90/);
});
