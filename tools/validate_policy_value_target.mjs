import fs from "node:fs";
import readline from "node:readline";

const DIRS_8 = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    out[token.slice(2)] = argv[i + 1] || "";
    i++;
  }
  return out;
};

const fail = (message) => {
  throw new Error(message);
};

const validateRow = (row, lineNo, file) => {
  if (!row || typeof row !== "object") fail(`${file}:${lineNo}: row is not an object`);
  const hasScenarioMetadata = typeof row.scenario_id === "string" && row.scenario_id;
  if (hasScenarioMetadata) {
    if (!row.rule_profile || !Array.isArray(row.rule_profile.orbRules)) {
      fail(`${file}:${lineNo}: rule_profile.orbRules is required`);
    }
    if (row.rule_profile.orbRules.length !== 6) {
      fail(`${file}:${lineNo}: rule_profile.orbRules must contain 6 rules`);
    }
    if (!Array.isArray(row.requirements)) {
      fail(`${file}:${lineNo}: requirements must be an array`);
    }
  }
  if (!Array.isArray(row.board_with_hole) || row.board_with_hole.length !== 36) {
    fail(`${file}:${lineNo}: board_with_hole must contain 36 cells`);
  }
  if (!Array.isArray(row.route) || !Array.isArray(row.actions)) {
    fail(`${file}:${lineNo}: route/actions are required`);
  }
  if (row.route.length !== row.actions.length + 1) {
    fail(`${file}:${lineNo}: route/action length mismatch`);
  }
  for (let i = 1; i < row.route.length; i++) {
    const prev = row.route[i - 1];
    const next = row.route[i];
    if (!Array.isArray(prev) || !Array.isArray(next)) {
      fail(`${file}:${lineNo}: route points must be [row,col]`);
    }
    const action = Number(row.actions[i - 1]);
    const [dr, dc] = DIRS_8[action] || [];
    if (dr == null || next[0] - prev[0] !== dr || next[1] - prev[1] !== dc) {
      fail(`${file}:${lineNo}: action ${action} does not match route step ${i}`);
    }
  }

  const policy = row.policy_target;
  if (!Array.isArray(policy) || policy.length !== 8) {
    fail(`${file}:${lineNo}: policy_target must contain 8 actions`);
  }
  const policySum = policy.reduce((sum, value) => sum + Number(value || 0), 0);
  if (policySum > 1e-5 && Math.abs(policySum - 1) > 1e-3) {
    fail(`${file}:${lineNo}: policy_target must sum to 1 or 0`);
  }

  const terminal = row.terminal;
  if (!terminal || !Array.isArray(terminal.board) || terminal.board.length !== 36) {
    fail(`${file}:${lineNo}: terminal.board must contain 36 cells`);
  }
  if (
    !Array.isArray(terminal.initialClearMask) ||
    terminal.initialClearMask.length !== 36
  ) {
    fail(`${file}:${lineNo}: terminal.initialClearMask must contain 36 cells`);
  }
  if (!row.value_target || typeof row.value_target !== "object") {
    fail(`${file}:${lineNo}: value_target is required`);
  }
  if (
    hasScenarioMetadata &&
    (typeof row.value_target.requirements_satisfied !== "boolean" ||
      typeof terminal.requirementsSatisfied !== "boolean")
  ) {
    fail(`${file}:${lineNo}: requirement terminal labels are required`);
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file;
  if (!file) fail("Usage: node tools/validate_policy_value_target.mjs --file <jsonl>");
  if (!fs.existsSync(file)) fail(`file not found: ${file}`);

  const input = fs.createReadStream(file, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    count++;
    validateRow(JSON.parse(line), count, file);
  }
  console.log(JSON.stringify({ file, rows: count, valid: true }));
};

main().catch((error) => {
  console.error(`[validate-policy-value-target] ${error.message}`);
  process.exitCode = 1;
});
