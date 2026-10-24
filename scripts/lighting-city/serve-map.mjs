// Serves docs/lighting-city-l0/ read-only on 127.0.0.1 for reviewing the L0 lighting map in a browser.
//   node scripts/lighting-city/serve-map.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('docs/lighting-city-l0');
const PORT = Number(process.argv[2] ?? 5195);
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.png': 'image/png' };
http
  .createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'lighting-map.html';
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`L0 map on http://127.0.0.1:${PORT}/`));
