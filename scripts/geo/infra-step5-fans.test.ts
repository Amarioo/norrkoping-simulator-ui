/** Step 5: junction-fan steps under the old ('flat') and the current ('corners') fan rule, same data. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { junctionFans } from '../../src/lib/infraDiagnostics';
import { terrain } from '../../src/lib/terrain';
it('compares fan rules', () => {
  const out: Record<string, unknown> = {};
  for (const rule of ['flat', 'corners'] as const) {
    const f = junctionFans(undefined, rule).sort((a, b) => b.value - a.value);
    out[rule] = {
      over5cm: f.length,
      over30cm: f.filter((i) => i.value > 0.3).length,
      max: f[0]?.value ?? 0,
      worst: f.slice(0, 15).map((i) => ({ value: +i.value.toFixed(3), at: terrain.toSweref(i.x, i.z).map(Math.round), detail: i.detail })),
    };
  }
  writeFileSync(process.env.OUT ?? 'work/step5/junction-fans.json', JSON.stringify(out, null, 1));
});
