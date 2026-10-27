// Probe: how does an SSE stream through the Vite dev proxy behave when the backend stops/restarts?
// Keeps one long stream open and tries a new request every 2 s; prints to stdout only.
//
//   node scripts/sse-reconnect/proxy-probe.mjs [devServerUrl=http://127.0.0.1:5281] [seconds=60]
const base = process.argv[2] || 'http://127.0.0.1:5281';
const seconds = Number(process.argv[3] || 60);
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
let chunks = 0;
(async () => {
  try {
    const res = await fetch(base + '/api/simulator/stream', {
      headers: { Accept: 'text/event-stream' },
    });
    console.log(ts(), 'long stream status', res.status, res.headers.get('content-type'));
    const reader = res.body.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) {
        console.log(ts(), 'long stream ENDED (done)');
        break;
      }
      chunks++;
    }
  } catch (e) {
    console.log(ts(), 'long stream ERROR', e.message);
  }
})();
let last = -1;
const iv = setInterval(async () => {
  if (chunks !== last) {
    console.log(ts(), 'long stream chunks', chunks);
    last = chunks;
  } else console.log(ts(), 'long stream SILENT, chunks', chunks);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 1500);
  try {
    const r = await fetch(base + '/api/simulator/stream', {
      headers: { Accept: 'text/event-stream' },
      signal: ac.signal,
    });
    console.log(ts(), '  new request ->', r.status, r.headers.get('content-type'));
    ac.abort();
  } catch (e) {
    console.log(
      ts(),
      '  new request ->',
      e.name === 'AbortError' ? 'no headers within 1.5 s' : e.message,
    );
  }
  clearTimeout(timer);
}, 2000);
setTimeout(() => {
  clearInterval(iv);
  process.exit(0);
}, seconds * 1000);
