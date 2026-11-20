// Interface U4: what the memory is used for. Asks the browser for a detailed memory dump (the same
// data as chrome://tracing "memory-infra") once the map stands still, and sums it per kind of memory
// for the page's process and the graphics process.
//   node scripts/mobile-u4/memory-breakdown.mjs <url> [out.json] [seconds after map-ready, default 15]
import fs from 'node:fs';
import { chromium, devices } from '@playwright/test';

const [url, out, wait = '15'] = process.argv.slice(2);
if (!url) throw new Error('usage: <url> [out.json] [seconds]');
if (out && fs.existsSync(out)) throw new Error(`${out} exists (evidence is never overwritten)`);
const browser = await chromium.launch({ channel: 'msedge' });
const context = await browser.newContext({ ...devices['iPhone 14'], defaultBrowserType: undefined });
const page = await context.newPage();
const cdp = await browser.newBrowserCDPSession();
await cdp.send('Tracing.start', {
  transferMode: 'ReturnAsStream',
  traceConfig: {
    includedCategories: ['disabled-by-default-memory-infra'],
    excludedCategories: ['*'],
    memoryDumpConfig: { triggers: [] },
  },
});
await page.goto(url);
await page.waitForSelector('[data-map-ready="true"]', { timeout: 180_000 });
await page.waitForTimeout(Number(wait) * 1000);
await cdp.send('Tracing.requestMemoryDump', { levelOfDetail: 'detailed' });
const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
await cdp.send('Tracing.end');
const { stream } = await done;
let text = '';
for (;;) {
  const chunk = await cdp.send('IO.read', { handle: stream, size: 1 << 20 });
  text += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString() : chunk.data;
  if (chunk.eof) break;
}
const events = JSON.parse(text).traceEvents ?? JSON.parse(text);
const names = {};
for (const e of events)
  if (e.ph === 'M' && e.name === 'process_name') names[e.pid] = e.args.name;
const result = {};
for (const e of events) {
  if (e.ph !== 'v' || !e.args?.dumps?.allocators) continue;
  const process = names[e.pid] ?? String(e.pid);
  if (/Browser|Utility/.test(process)) continue;
  const sums = {};
  for (const [name, dump] of Object.entries(e.args.dumps.allocators)) {
    const size = dump.attrs?.size?.value;
    if (!size) continue;
    // Top two levels, e.g. "v8/main", "gpu/gl", "partition_alloc/partitions".
    const parts = name.split('/');
    const key = parts.length > 1 ? parts.slice(0, 2).join('/').replace(/0x[0-9a-f]+/gi, '*').replace(/_\d+$/, '') : null;
    if (parts.length === 1) (sums[parts[0] + ' (total)'] = parseInt(size, 16) / 1048576);
    else if (parts.length === 2) sums[key] = (sums[key] ?? 0) + parseInt(size, 16) / 1048576;
  }
  const totals = e.args.dumps.process_totals;
  const rows = Object.entries(sums)
    .filter(([, mb]) => mb >= 8)
    .sort((a, b) => b[1] - a[1])
    .map(([k, mb]) => [k, Math.round(mb)]);
  (result[process + ' ' + e.pid] ??= []).push({
    residentMB: totals?.resident_set_bytes ? Math.round(parseInt(totals.resident_set_bytes, 16) / 1048576) : null,
    privateMB: totals?.private_footprint_bytes ? Math.round(parseInt(totals.private_footprint_bytes, 16) / 1048576) : null,
    rows,
  });
}
if (out) fs.writeFileSync(out, JSON.stringify({ url, secondsAfterReady: Number(wait), result }, null, 2) + '\n');
for (const [process, dumps] of Object.entries(result))
  for (const d of dumps) {
    console.log(`\n${process}: resident ${d.residentMB} MB, private ${d.privateMB} MB`);
    for (const [k, mb] of d.rows) console.log(String(mb).padStart(7), k);
  }
await browser.close();
