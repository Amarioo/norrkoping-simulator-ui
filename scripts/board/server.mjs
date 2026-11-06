// Local project board (epics and stories as a Kanban board).
//   npm run board            -> http://127.0.0.1:5330/
//   npm run board -- 5331    -> another port
//   npm run board:check      -> validate docs/board/board.json and exit
import fs from 'node:fs';
import path from 'node:path';
import { createBoardServer, REPO_ROOT } from './server-core.mjs';
import { validateBoard } from './board-lib.mjs';

const args = process.argv.slice(2);

if (args.includes('--check')) {
  const file = path.join(REPO_ROOT, 'docs/board/board.json');
  let errors;
  try {
    errors = validateBoard(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) {
    errors = [`board.json går inte att läsa: ${/** @type {Error} */ (e).message}`];
  }
  if (errors.length) {
    console.error(`board.json har ${errors.length} fel:\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log('board.json OK');
  process.exit(0);
}

const port = Number(args.find((a) => /^\d+$/.test(a)) ?? process.env.BOARD_PORT ?? 5330);
createBoardServer().listen(port, '127.0.0.1', () => {
  console.log(`Tavlan: http://127.0.0.1:${port}/`);
});
