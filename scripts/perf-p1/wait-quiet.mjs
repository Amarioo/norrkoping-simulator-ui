// Phase P1: wait until the machine is quiet (background CPU below a threshold for several samples in
// a row), so timing runs are not disturbed by other programs. Exits 0 when quiet, 1 on timeout.
//   node scripts/perf-p1/wait-quiet.mjs [maxBusyPercent=8] [samplesInARow=4] [timeoutMin=240]
import { machineLoad } from './load.mjs';
const [max = '8', need = '4', timeout = '240'] = process.argv.slice(2);
const end = Date.now() + Number(timeout) * 60000;
let inRow = 0;
while (Date.now() < end) {
  const l = await machineLoad(10000);
  inRow = l.busyPercent <= Number(max) ? inRow + 1 : 0;
  console.log(new Date().toISOString().slice(11, 19), l.busyPercent, inRow);
  if (inRow >= Number(need)) process.exit(0);
  await new Promise((r) => setTimeout(r, 20000));
}
process.exit(1);
