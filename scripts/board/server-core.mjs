// HTTP server for the local project board. Serves the page, reads and writes the board file,
// and shows docs/ read-only so reports can be opened from a card. Binds to 127.0.0.1 only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateBoard, serializeBoard } from './board-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};
const MAX_BODY = 4 * 1024 * 1024;

/** Short content hash, used to detect that someone else changed the file. @param {string} text */
export const versionOf = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * @param {{ boardFile?: string, docsDir?: string, repoRoot?: string }} [opts]
 */
export function createBoardServer(opts = {}) {
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  const boardFile = opts.boardFile ?? path.join(repoRoot, 'docs/board/board.json');
  const docsDir = opts.docsDir ?? path.join(repoRoot, 'docs');

  /** @param {http.ServerResponse} res @param {number} code @param {unknown} body */
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  /** @param {http.ServerResponse} res @param {string} file */
  const sendFile = (res, file) => {
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  };

  function readBoard() {
    const text = fs.readFileSync(boardFile, 'utf8');
    return { text, version: versionOf(text) };
  }

  /** @param {string} text */
  function writeBoard(text) {
    const tmp = `${boardFile}.tmp`;
    fs.writeFileSync(tmp, text);
    try {
      fs.renameSync(tmp, boardFile);
    } catch {
      // Windows refuses the rename while another program holds the file open; write in place instead.
      fs.writeFileSync(boardFile, text);
      fs.rmSync(tmp, { force: true });
    }
  }

  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = decodeURIComponent(url.pathname);
    try {
      if (req.method === 'GET' && (route === '/' || route === '/index.html')) return sendFile(res, path.join(HERE, 'index.html'));
      if (req.method === 'GET' && route === '/board-lib.mjs') return sendFile(res, path.join(HERE, 'board-lib.mjs'));

      if (route === '/api/board' && req.method === 'GET') {
        const { text, version } = readBoard();
        let board;
        try {
          board = JSON.parse(text);
        } catch (e) {
          return json(res, 500, { error: `board.json går inte att läsa: ${/** @type {Error} */ (e).message}` });
        }
        return json(res, 200, { version, board, errors: validateBoard(board), repoRoot });
      }

      if (route === '/api/board' && req.method === 'PUT') {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => {
          size += c.length;
          if (size > MAX_BODY) req.destroy();
          else chunks.push(c);
        });
        req.on('end', () => {
          let body;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            return json(res, 400, { error: 'Ogiltig JSON.' });
          }
          const errors = validateBoard(body?.board);
          if (errors.length) return json(res, 400, { error: 'Tavlan har fel.', errors });
          const current = readBoard();
          if (body.baseVersion !== current.version) {
            return json(res, 409, { error: 'Tavlan har ändrats sedan du laddade den.', version: current.version });
          }
          const text = serializeBoard(body.board);
          writeBoard(text);
          return json(res, 200, { version: versionOf(text) });
        });
        return;
      }

      if (req.method === 'GET' && route.startsWith('/docs/')) {
        const file = path.resolve(docsDir, route.slice('/docs/'.length));
        if (!file.startsWith(docsDir + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          return json(res, 404, { error: 'Hittades inte.' });
        }
        return sendFile(res, file);
      }

      return json(res, 404, { error: 'Hittades inte.' });
    } catch (e) {
      return json(res, 500, { error: /** @type {Error} */ (e).message });
    }
  });
}
