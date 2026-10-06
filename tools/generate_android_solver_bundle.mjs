import fs from "node:fs";
import path from "node:path";

const [, , solverCoreArg, recognitionArg, outArg] = process.argv;
if (!solverCoreArg || !recognitionArg || !outArg) {
  console.error("Usage: node tools/generate_android_solver_bundle.mjs <solverCore.js> <recognitionCore.js> <out bundle.js>");
  process.exit(2);
}

const solverCore = fs.readFileSync(path.resolve(solverCoreArg), "utf8");
const recognitionCore = fs.readFileSync(path.resolve(recognitionArg), "utf8");

// Keep the presentation-only finalBoard enrichment in the same runtime file
// as the solver.  The Android WebView now has one App.jsx-derived entry point;
// Kotlin does not reimplement or reorder any solver decision.
const presentationAdapter = `
// App.jsx applies a selected path to the source board only for preview.
function clone2DForRunner(board) {
  return (board || []).map(function (row) { return (row || []).slice(); });
}

function finalBoardFromPathForRunner(originalBoard, path) {
  var board = clone2DForRunner(originalBoard);
  if (!Array.isArray(path) || path.length < 1) return board;
  var start = path[0];
  if (!start || start.r == null || start.c == null) return board;
  var held = board[start.r] && board[start.r][start.c];
  if (held == null) return board;

  var hole = null;
  if (start.r !== 0) {
    hole = { r: start.r, c: start.c };
    board[hole.r][hole.c] = -1;
  }

  for (var i = 1; i < path.length; i++) {
    var current = path[i];
    if (!current || current.r == null || current.c == null) continue;
    if (current.r === 0) {
      if (hole) board[hole.r][hole.c] = board[0][current.c];
      return board;
    }
    if (!hole) {
      hole = { r: current.r, c: current.c };
      board[hole.r][hole.c] = -1;
    } else {
      board[hole.r][hole.c] = board[current.r][current.c];
      board[current.r][current.c] = -1;
      hole = { r: current.r, c: current.c };
    }
  }
  if (hole) board[hole.r][hole.c] = held;
  return board;
}

function specialStatusForRunner(solution, specials) {
  var tuple = solution && Array.isArray(solution.specialTuple)
    ? solution.specialTuple
    : [];
  var slots = Array.isArray(specials) ? specials.slice(0, 3) : [];
  while (slots.length < 3) slots.push({ type: "none" });
  var compactIndex = 0;
  return slots.map(function (special) {
    if (!special || !special.type || special.type === "none") return false;
    var done = Number(tuple[compactIndex * 2] || 0) > 0;
    compactIndex++;
    return done;
  });
}

function enrichSolutionForRunner(solution, originalBoard, specials) {
  if (!solution || !Array.isArray(solution.path)) return solution;
  return Object.assign({}, solution, {
    finalBoard: finalBoardFromPathForRunner(originalBoard, solution.path),
    specialStatus: specialStatusForRunner(solution, specials)
  });
}

globalThis.autoComboEnrichSolveResult = function (result, originalBoard, specials) {
  if (!result || typeof result !== "object") return result;
  var enriched = Object.assign({}, result);
  if (Array.isArray(result.path)) {
    enriched.finalBoard = finalBoardFromPathForRunner(originalBoard, result.path);
    enriched.specialStatus = specialStatusForRunner(result, specials);
  }
  enriched.topSteps = Array.isArray(result.topSteps)
    ? result.topSteps.map(function (solution) { return enrichSolutionForRunner(solution, originalBoard, specials); })
    : [];
  enriched.topCombos = Array.isArray(result.topCombos)
    ? result.topCombos.map(function (solution) { return enrichSolutionForRunner(solution, originalBoard, specials); })
    : [];
  return enriched;
};
`;

const header = `// Single Android runtime bundle generated from App.jsx solver core.\n// Do not edit this generated asset by hand.\n`;
fs.mkdirSync(path.dirname(path.resolve(outArg)), { recursive: true });
fs.writeFileSync(
  path.resolve(outArg),
  header + solverCore + "\n" + presentationAdapter + "\n" + recognitionCore,
  "utf8"
);
console.log(`Generated ${path.relative(process.cwd(), path.resolve(outArg))}`);
