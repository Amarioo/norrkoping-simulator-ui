// Shared logic for the local project board (docs/board/board.json).
// Used by the board server (Node), the board page (browser) and the tests, so no Node imports here.

export const STATUSES = ['backlog', 'next', 'doing', 'test', 'done'];
export const SIZES = ['S', 'S/M', 'M', 'M/L', 'L'];
export const AUTHORS = ['du', 'claude'];

const STORY_KEYS = new Set([
  'id', 'epic', 'title', 'status', 'size', 'date', 'summary', 'outcome', 'note', 'report', 'section', 'tasks', 'comments',
]);
const EPIC_KEYS = new Set(['id', 'title', 'color', 'summary', 'report', 'section']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} v */
const isText = (v) => typeof v === 'string' && v.trim().length > 0;

/** A repo-relative path inside docs/, e.g. "docs/perf-p1/README.md". @param {unknown} p */
export function isSafeDocPath(p) {
  return typeof p === 'string' && /^docs\/[^\\:]+$/.test(p) && !p.split('/').some((s) => s === '..' || s === '');
}

/**
 * Checks the board's shape. Returns a list of problems in plain Swedish; empty means valid.
 * @param {any} board
 * @returns {string[]}
 */
export function validateBoard(board) {
  const errors = [];
  if (!board || typeof board !== 'object') return ['Tavlan är inte ett JSON-objekt.'];
  if (board.schema !== 1) errors.push('schema måste vara 1.');

  const cols = Array.isArray(board.columns) ? board.columns : [];
  if (cols.map((c) => c?.id).join() !== STATUSES.join()) {
    errors.push(`columns måste ha id:n i ordningen ${STATUSES.join(', ')}.`);
  }
  cols.forEach((c, i) => {
    if (!isText(c?.title)) errors.push(`columns[${i}] saknar title.`);
  });

  const epicIds = new Set();
  for (const [i, e] of (Array.isArray(board.epics) ? board.epics : []).entries()) {
    const where = `epic ${e?.id ?? `#${i}`}`;
    if (!isText(e?.id)) errors.push(`${where}: id saknas.`);
    else if (epicIds.has(e.id)) errors.push(`${where}: id finns redan.`);
    else epicIds.add(e.id);
    if (!isText(e?.title)) errors.push(`${where}: title saknas.`);
    if (typeof e?.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(e.color)) errors.push(`${where}: color ska vara #rrggbb.`);
    for (const k of Object.keys(e ?? {})) if (!EPIC_KEYS.has(k)) errors.push(`${where}: okänt fält "${k}".`);
    if (e?.report !== undefined && !isSafeDocPath(e.report)) errors.push(`${where}: report ska vara en sökväg under docs/.`);
  }
  if (!Array.isArray(board.epics)) errors.push('epics måste vara en lista.');

  const storyIds = new Set();
  for (const [i, s] of (Array.isArray(board.stories) ? board.stories : []).entries()) {
    const where = `story ${s?.id ?? `#${i}`}`;
    if (!isText(s?.id)) errors.push(`${where}: id saknas.`);
    else if (storyIds.has(s.id)) errors.push(`${where}: id finns redan.`);
    else storyIds.add(s.id);
    if (!epicIds.has(s?.epic)) errors.push(`${where}: epic "${s?.epic}" finns inte.`);
    if (!isText(s?.title)) errors.push(`${where}: title saknas.`);
    if (!STATUSES.includes(s?.status)) errors.push(`${where}: status "${s?.status}" är okänd.`);
    if (s?.size !== undefined && !SIZES.includes(s.size)) errors.push(`${where}: size ska vara en av ${SIZES.join(', ')}.`);
    if (s?.date !== undefined && !(typeof s.date === 'string' && DATE.test(s.date))) errors.push(`${where}: date ska vara ÅÅÅÅ-MM-DD.`);
    for (const k of ['summary', 'outcome', 'note', 'section']) {
      if (s?.[k] !== undefined && typeof s[k] !== 'string') errors.push(`${where}: ${k} ska vara text.`);
    }
    if (s?.report !== undefined && !isSafeDocPath(s.report)) errors.push(`${where}: report ska vara en sökväg under docs/.`);
    if (s?.tasks !== undefined) {
      if (!Array.isArray(s.tasks)) errors.push(`${where}: tasks ska vara en lista.`);
      else s.tasks.forEach((t, j) => {
        if (!isText(t?.text) || typeof t?.done !== 'boolean') errors.push(`${where}: tasks[${j}] behöver text och done.`);
      });
    }
    if (s?.comments !== undefined) {
      if (!Array.isArray(s.comments)) errors.push(`${where}: comments ska vara en lista.`);
      else s.comments.forEach((c, j) => {
        if (!AUTHORS.includes(c?.author) || !isText(c?.text) || !(typeof c?.date === 'string' && DATE.test(c.date))) {
          errors.push(`${where}: comments[${j}] behöver author (du/claude), date och text.`);
        }
      });
    }
    for (const k of Object.keys(s ?? {})) if (!STORY_KEYS.has(k)) errors.push(`${where}: okänt fält "${k}".`);
  }
  if (!Array.isArray(board.stories)) errors.push('stories måste vara en lista.');
  return errors;
}

/**
 * Moves a story to a column, placed before another story (or last in that column).
 * The order within a column is the order in board.stories. Returns a new board.
 * @param {any} board
 * @param {string} id
 * @param {string} status
 * @param {string | null} [beforeId]
 */
export function moveStory(board, id, status, beforeId = null) {
  if (!STATUSES.includes(status)) throw new Error(`Okänd status: ${status}`);
  const story = board.stories.find((s) => s.id === id);
  if (!story) throw new Error(`Okänd story: ${id}`);
  const rest = board.stories.filter((s) => s.id !== id);
  const moved = { ...story, status };
  let at = beforeId && beforeId !== id ? rest.findIndex((s) => s.id === beforeId) : -1;
  if (at < 0) {
    // Last in the target column; with an empty column, keep the story where it was.
    const lastInColumn = rest.findLastIndex((s) => s.status === status);
    at = lastInColumn >= 0 ? lastInColumn + 1 : board.stories.findIndex((s) => s.id === id);
  }
  return { ...board, stories: [...rest.slice(0, at), moved, ...rest.slice(at)] };
}

/** Stable on-disk form: 2-space JSON and a final newline. @param {any} board */
export function serializeBoard(board) {
  return JSON.stringify(board, null, 2) + '\n';
}

/** Next free id for a story added from the page: U1, U2, ... @param {any} board */
export function nextUserStoryId(board) {
  let n = 1;
  const ids = new Set(board.stories.map((s) => s.id));
  while (ids.has(`U${n}`)) n++;
  return `U${n}`;
}
