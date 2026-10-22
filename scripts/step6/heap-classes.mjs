// Heap snapshot after forced GC, aggregated self size by constructor name; prints the largest
// differences between two URLs. Usage: node scripts/step6/heap-classes.mjs <urlA> <urlB> [top=30]
import { chromium } from '@playwright/test';

const [urlA, urlB, top = '30'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
async function classes(url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { timeout: 120000 });
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 240000 });
  await page.waitForTimeout(5000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
  const chunks = [];
  cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  await page.close();
  const snap = JSON.parse(chunks.join(''));
  const f = snap.snapshot.meta.node_fields;
  const types = snap.snapshot.meta.node_types[0];
  const iType = f.indexOf('type'),
    iName = f.indexOf('name'),
    iSize = f.indexOf('self_size');
  const out = new Map();
  for (let i = 0; i < snap.nodes.length; i += f.length) {
    const t = types[snap.nodes[i + iType]];
    const name = t === 'object' || t === 'closure' ? snap.strings[snap.nodes[i + iName]] : `(${t})`;
    const e = out.get(name) ?? [0, 0];
    e[0] += snap.nodes[i + iSize];
    e[1]++;
    out.set(name, e);
  }
  return out;
}
const a = await classes(urlA),
  b = await classes(urlB);
await browser.close();
const keys = new Set([...a.keys(), ...b.keys()]);
const diff = [...keys].map((k) => [k, (b.get(k)?.[0] ?? 0) - (a.get(k)?.[0] ?? 0), (b.get(k)?.[1] ?? 0) - (a.get(k)?.[1] ?? 0)]);
const total = (m) => [...m.values()].reduce((s, e) => s + e[0], 0);
console.log('total MB A', (total(a) / 1e6).toFixed(1), 'B', (total(b) / 1e6).toFixed(1));
diff.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, Number(top)).forEach(([k, d, n]) => console.log((d / 1e6).toFixed(2).padStart(8), 'MB', String(n).padStart(8), k.slice(0, 80)));
