const orb = (v) => v % 10;
const mark = (v, place) => Math.floor(v / place) % 10;
const same = (a, b) => a.r === b.r && a.c === b.c;
const recolor = (cell, source) => cell - orb(cell) + orb(source);

// Reconstruct terminal boards from the immutable request, including row0 events.
export function replaySolverPath(original, path, { diagonal = true, useRow0 = true, maxSteps = Infinity } = {}) {
  if (!Array.isArray(path) || !path.length || path.length - 1 > maxSteps) return null;
  if (path.some((p) => !p || !Number.isInteger(p.r) || !Number.isInteger(p.c) || p.r < 0 || p.r > 5 || p.c < 0 || p.c > 5)) return null;
  if (!Array.isArray(original) || original.length !== 6 || original.some((r) => !Array.isArray(r) || r.length !== 6)) return null;
  let start = null, end = null;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    const q = mark(original[r][c], 100);
    if (q === 1) { if (start) return null; start = { r, c }; }
    if (q === 2) { if (end) return null; end = { r, c }; }
  }
  if (start && !same(start, path[0])) return null;
  if (end && !same(end, path.at(-1))) return null;
  const board = original.map((r) => r.slice());
  const fromRow0 = path[0].r === 0;
  for (let i = 0; i < path.length; i++) {
    const to = path[i];
    if (!to || !Number.isInteger(to.r) || !Number.isInteger(to.c) || to.r < 0 || to.r > 5 || to.c < 0 || to.c > 5) return null;
    if ((!useRow0 && to.r === 0) || board[to.r][to.c] < 0 || mark(board[to.r][to.c], 10) === 1) return null;
    if ((mark(board[to.r][to.c], 10) === 2 || (end && same(to, end))) && i !== path.length - 1) return null;
    if (!i) continue;
    const from = path[i - 1];
    const dr = Math.abs(from.r - to.r), dc = Math.abs(from.c - to.c);
    if (Math.max(dr, dc) !== 1 || (!diagonal && dr + dc !== 1)) return null;
    if (from.r === 0) {
      if (i !== 1 || to.r !== 1) return null;
      board[to.r][to.c] = recolor(board[to.r][to.c], board[from.r][from.c]);
    } else if (to.r === 0) {
      if (fromRow0 || i !== path.length - 1 || from.r !== 1) return null;
      board[from.r][from.c] = recolor(board[from.r][from.c], board[0][to.c]);
    } else {
      [board[from.r][from.c], board[to.r][to.c]] = [board[to.r][to.c], board[from.r][from.c]];
    }
  }
  if (fromRow0 && path.length < 2) return null;
  return board;
}
