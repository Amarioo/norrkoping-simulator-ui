// Phase P1: the whole timing suite in one go, each step only once the machine is quiet (background
// CPU ≤ MAX_BUSY % (default 12) for four 10 s samples in a row); raw output in <runDir> (never overwritten).
//   node scripts/perf-p1/run-all.mjs <runDir> [baseUrl=http://127.0.0.1:5280]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { machineLoad } from './load.mjs';

const [dir, base = 'http://127.0.0.1:5280'] = process.argv.slice(2);
if (!dir) throw new Error('usage: run-all.mjs <runDir> [baseUrl]');
if (fs.existsSync(dir)) throw new Error(`${dir} exists`);
fs.mkdirSync(dir, { recursive: true });
const STEPS = [
  [
    'fullscreen-baseline',
    [
      'scripts/fullscreen-fps/fullscreen-baseline.mjs',
      path.join(dir, 'fullscreen-baseline.json'),
      '2',
      base,
    ],
    { SCREENS: '2560x1440' },
  ],
  ['part-cost', ['scripts/perf-p1/part-cost.mjs', path.join(dir, 'part-cost.json'), '3', base], {}],
  [
    'cpu-profile',
    ['scripts/perf-p1/cpu-profile.mjs', path.join(dir, 'cpu-profile.json'), '3', base],
    { RAW_DIR: path.join(dir, 'cpuprofiles') },
  ],
  ['gpu', ['scripts/perf-p1/gpu.mjs', path.join(dir, 'gpu.json'), '3', base], {}],
  [
    'frame-series',
    ['scripts/perf-p1/frame-series.mjs', path.join(dir, 'frame-series.json'), '3', base],
    {},
  ],
];
const only = process.env.STEPS?.split(',');
// The user's own dev server (port 5173) idles at about one core of 16 (≈ 6 %), hence 12 % by default.
const MAX_BUSY = Number(process.env.MAX_BUSY ?? 12);
const log = (s) => {
  const line = `${new Date().toISOString()} ${s}`;
  console.log(line);
  fs.appendFileSync(path.join(dir, 'run.log'), line + '\n');
};
for (const [name, args, env] of STEPS) {
  if (only && !only.includes(name)) continue;
  for (let inRow = 0; inRow < 4;) {
    const l = await machineLoad(10000);
    inRow = l.busyPercent <= MAX_BUSY ? inRow + 1 : 0;
    if (!inRow) log(`waiting: machine ${l.busyPercent} % busy`);
  }
  log(`start ${name}`);
  const r = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  log(`end ${name}: exit ${r.status}`);
}
