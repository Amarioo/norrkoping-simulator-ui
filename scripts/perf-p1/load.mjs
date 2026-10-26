// Phase P1: background CPU load of the whole machine over `ms` (all cores, from os.cpus() times),
// recorded with every measurement so disturbed series can be recognised.
import os from 'node:os';
const snap = () =>
  os.cpus().reduce(
    (a, c) => {
      const t = c.times;
      a.busy += t.user + t.nice + t.sys + t.irq;
      a.total += t.user + t.nice + t.sys + t.irq + t.idle;
      return a;
    },
    { busy: 0, total: 0 },
  );
export async function machineLoad(ms = 3000) {
  const a = snap();
  await new Promise((r) => setTimeout(r, ms));
  const b = snap();
  const busy = (b.busy - a.busy) / (b.total - a.total);
  return {
    busyPercent: Math.round(busy * 1000) / 10,
    coresBusy: Math.round(busy * os.cpus().length * 10) / 10,
  };
}
if (process.argv[1]?.endsWith('load.mjs'))
  console.log(await machineLoad(Number(process.argv[2] ?? 5000)));
