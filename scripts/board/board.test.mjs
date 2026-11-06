import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateBoard, moveStory, serializeBoard, nextUserStoryId, isSafeDocPath } from './board-lib.mjs';
import { createBoardServer, versionOf, REPO_ROOT } from './server-core.mjs';

const REAL_FILE = path.join(REPO_ROOT, 'docs/board/board.json');

function sample() {
  return {
    schema: 1,
    columns: ['backlog', 'next', 'doing', 'test', 'done'].map((id) => ({ id, title: id })),
    epics: [{ id: 'X', title: 'Epic X', color: '#123456' }],
    stories: [
      { id: 'a', epic: 'X', title: 'A', status: 'backlog' },
      { id: 'b', epic: 'X', title: 'B', status: 'backlog' },
      { id: 'c', epic: 'X', title: 'C', status: 'done' },
      { id: 'd', epic: 'X', title: 'D', status: 'backlog' },
    ],
  };
}
const order = (board, status) => board.stories.filter((s) => s.status === status).map((s) => s.id);

describe('the real board file', () => {
  const text = fs.readFileSync(REAL_FILE, 'utf8');
  const board = JSON.parse(text);

  it('is valid', () => {
    expect(validateBoard(board)).toEqual([]);
  });

  it('is stored in the same form the server writes', () => {
    expect(text).toBe(serializeBoard(board));
  });

  it('only links to reports that exist', () => {
    const missing = [...board.epics, ...board.stories].filter((x) => x.report && !fs.existsSync(path.join(REPO_ROOT, x.report)));
    expect(missing.map((x) => `${x.id}: ${x.report}`)).toEqual([]);
  });
});

describe('validateBoard', () => {
  it('accepts a minimal board', () => {
    expect(validateBoard(sample())).toEqual([]);
  });

  it.each([
    ['unknown epic', (b) => (b.stories[0].epic = 'Y'), 'epic "Y" finns inte'],
    ['unknown status', (b) => (b.stories[0].status = 'review'), 'status "review"'],
    ['duplicate id', (b) => (b.stories[1].id = 'a'), 'id finns redan'],
    ['unknown field (typo)', (b) => (b.stories[0].sumary = 'x'), 'okänt fält "sumary"'],
    ['report outside docs/', (b) => (b.stories[0].report = 'docs/../package.json'), 'report ska vara'],
    ['bad date', (b) => (b.stories[0].date = '6 nov'), 'date ska vara'],
    ['bad comment author', (b) => (b.stories[0].comments = [{ author: 'x', date: '2026-11-06', text: 'hej' }]), 'comments[0]'],
    ['task without done', (b) => (b.stories[0].tasks = [{ text: 'gör' }]), 'tasks[0]'],
    ['columns reordered', (b) => b.columns.reverse(), 'columns måste'],
    ['bad epic colour', (b) => (b.epics[0].color = 'red'), 'color ska vara'],
  ])('rejects %s', (_, mutate, message) => {
    const b = sample();
    mutate(b);
    expect(validateBoard(b).join('\n')).toContain(message);
  });

  it('rejects non-objects', () => {
    expect(validateBoard(null)).toHaveLength(1);
  });
});

describe('isSafeDocPath', () => {
  it('allows paths under docs/ only', () => {
    expect(isSafeDocPath('docs/perf-p1/README.md')).toBe(true);
    expect(isSafeDocPath('docs/../package.json')).toBe(false);
    expect(isSafeDocPath('src/App.svelte')).toBe(false);
    expect(isSafeDocPath('docs\\x.md')).toBe(false);
    expect(isSafeDocPath('docs//x.md')).toBe(false);
  });
});

describe('moveStory', () => {
  it('moves a story to another column, before a given story', () => {
    let b = moveStory(sample(), 'c', 'backlog', 'b');
    expect(order(b, 'backlog')).toEqual(['a', 'c', 'b', 'd']);
    expect(order(b, 'done')).toEqual([]);
  });

  it('reorders within a column', () => {
    expect(order(moveStory(sample(), 'd', 'backlog', 'a'), 'backlog')).toEqual(['d', 'a', 'b']);
    expect(order(moveStory(sample(), 'a', 'backlog', null), 'backlog')).toEqual(['b', 'd', 'a']);
  });

  it('puts a story last in the column when no target is given', () => {
    expect(order(moveStory(sample(), 'a', 'done'), 'done')).toEqual(['c', 'a']);
  });

  it('can move into an empty column', () => {
    const b = moveStory(sample(), 'b', 'test');
    expect(order(b, 'test')).toEqual(['b']);
    expect(b.stories.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not change the input board', () => {
    const b = sample();
    const before = JSON.stringify(b);
    moveStory(b, 'a', 'done');
    expect(JSON.stringify(b)).toBe(before);
  });

  it('rejects unknown stories and statuses', () => {
    expect(() => moveStory(sample(), 'zz', 'done')).toThrow();
    expect(() => moveStory(sample(), 'a', 'review')).toThrow();
  });
});

describe('nextUserStoryId', () => {
  it('finds the first free U-number', () => {
    const b = sample();
    expect(nextUserStoryId(b)).toBe('U1');
    b.stories.push({ id: 'U1', epic: 'X', title: 'u', status: 'backlog' });
    expect(nextUserStoryId(b)).toBe('U2');
  });
});

describe('board server', () => {
  let dir, boardFile, server, base;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-test-'));
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'docs', 'note.md'), '# Hej\n');
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'nej');
    boardFile = path.join(dir, 'docs', 'board.json');
    fs.writeFileSync(boardFile, serializeBoard(sample()));
    server = createBoardServer({ boardFile, docsDir: path.join(dir, 'docs'), repoRoot: dir });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const put = (body) => fetch(`${base}/api/board`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('returns the board with its version', async () => {
    const res = await fetch(`${base}/api/board`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.version).toBe(versionOf(fs.readFileSync(boardFile, 'utf8')));
    expect(data.board.stories).toHaveLength(4);
    expect(data.errors).toEqual([]);
  });

  it('saves a valid change and writes the stable form', async () => {
    const { version, board } = await (await fetch(`${base}/api/board`)).json();
    const next = moveStory(board, 'a', 'doing');
    const res = await put({ baseVersion: version, board: next });
    expect(res.status).toBe(200);
    const text = fs.readFileSync(boardFile, 'utf8');
    expect(text).toBe(serializeBoard(next));
    expect((await res.json()).version).toBe(versionOf(text));
    expect(fs.existsSync(`${boardFile}.tmp`)).toBe(false);
  });

  it('refuses a save based on an old version (someone else changed the file)', async () => {
    const { version, board } = await (await fetch(`${base}/api/board`)).json();
    fs.writeFileSync(boardFile, serializeBoard(moveStory(board, 'b', 'test'))); // e.g. Claude edits the file
    const before = fs.readFileSync(boardFile, 'utf8');
    const res = await put({ baseVersion: version, board: moveStory(board, 'd', 'done') });
    expect(res.status).toBe(409);
    expect(fs.readFileSync(boardFile, 'utf8')).toBe(before);
  });

  it('refuses an invalid board and leaves the file alone', async () => {
    const { version, board } = await (await fetch(`${base}/api/board`)).json();
    const before = fs.readFileSync(boardFile, 'utf8');
    board.stories[0].status = 'review';
    const res = await put({ baseVersion: version, board });
    expect(res.status).toBe(400);
    expect((await res.json()).errors.join()).toContain('review');
    expect(fs.readFileSync(boardFile, 'utf8')).toBe(before);
  });

  it('serves docs/ but nothing outside it', async () => {
    const ok = await fetch(`${base}/docs/note.md`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('# Hej\n');
    expect((await fetch(`${base}/docs/..%2Fsecret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/docs/%2E%2E/secret.txt`)).status).toBe(404);
  });

  it('serves the page and the shared library', async () => {
    expect((await fetch(`${base}/`)).headers.get('content-type')).toContain('text/html');
    expect((await fetch(`${base}/board-lib.mjs`)).headers.get('content-type')).toContain('javascript');
  });
});
