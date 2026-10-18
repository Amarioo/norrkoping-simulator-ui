// Vitest runs in Node, where `?url` assets (e.g. /src/lib/data/terrain.json, see
// lib/cityData.ts) are root-relative paths that fetch() cannot load. Serve them from disk.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const nodeFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('/')) return nodeFetch(input, init);
  try {
    return new Response(await readFile(path.join(process.cwd(), decodeURIComponent(url))));
  } catch {
    return new Response(null, { status: 404 });
  }
}) as typeof fetch;
