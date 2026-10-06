import fs from "node:fs";
import path from "node:path";
import * as parser from "@babel/parser";
import traverseModule from "@babel/traverse";
import generateModule from "@babel/generator";
import * as t from "@babel/types";

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;

const [, , appJsxArg, outArg] = process.argv;
if (!appJsxArg || !outArg) {
  console.error("Usage: node tools/generate_android_appjsx_solver.mjs <src/App.jsx> <out solverCore.js>");
  process.exit(2);
}

const appJsxPath = path.resolve(appJsxArg);
const outPath = path.resolve(outArg);
const source = fs.readFileSync(appJsxPath, "utf8");
const ast = parser.parse(source, {
  sourceType: "module",
  plugins: ["jsx"],
  errorRecovery: true,
});

const declarations = new Map();
const declarationOrder = [];

const remember = (name, node, origin) => {
  if (!name || declarations.has(name)) return;
  declarations.set(name, { node: t.cloneNode(node, true), origin });
  declarationOrder.push(name);
};

const rememberVariableDeclaration = (kind, declaratorPath, origin) => {
  const id = declaratorPath.node.id;
  if (!t.isIdentifier(id)) return;
  remember(id.name, t.variableDeclaration(kind, [t.cloneNode(declaratorPath.node, true)]), origin);
};

let appBodyPath = null;

traverse(ast, {
  Program(programPath) {
    for (const statementPath of programPath.get("body")) {
      if (statementPath.isFunctionDeclaration() && statementPath.node.id) {
        remember(statementPath.node.id.name, statementPath.node, "program");
      } else if (statementPath.isVariableDeclaration()) {
        for (const declaratorPath of statementPath.get("declarations")) {
          rememberVariableDeclaration(statementPath.node.kind, declaratorPath, "program");
          if (
            t.isIdentifier(declaratorPath.node.id, { name: "App" }) &&
            (t.isArrowFunctionExpression(declaratorPath.node.init) ||
              t.isFunctionExpression(declaratorPath.node.init)) &&
            t.isBlockStatement(declaratorPath.node.init.body)
          ) {
            appBodyPath = declaratorPath.get("init").get("body");
          }
        }
      }
    }
  },
});

if (!appBodyPath) {
  throw new Error("Could not find App component body in App.jsx");
}

for (const statementPath of appBodyPath.get("body")) {
  if (statementPath.isFunctionDeclaration() && statementPath.node.id) {
    remember(statementPath.node.id.name, statementPath.node, "app");
  } else if (statementPath.isVariableDeclaration()) {
    for (const declaratorPath of statementPath.get("declarations")) {
      rememberVariableDeclaration(statementPath.node.kind, declaratorPath, "app");
    }
  }
}

const localFreeReferences = (node) => {
  const names = new Set();
  const file = t.file(t.program([t.cloneNode(node, true)]));
  traverse(file, {
    ReferencedIdentifier(identifierPath) {
      const name = identifierPath.node.name;
      if (identifierPath.scope.getBinding(name)) return;
      if (declarations.has(name)) names.add(name);
    },
  });
  return [...names];
};

const emitted = new Set();
const visiting = new Set();
const chunks = [];

const emitDeclaration = (name) => {
  if (emitted.has(name)) return;
  const item = declarations.get(name);
  if (!item) return;
  if (visiting.has(name)) return;
  visiting.add(name);
  for (const dep of localFreeReferences(item.node)) {
    if (dep !== name) emitDeclaration(dep);
  }
  visiting.delete(name);
  emitted.add(name);
  chunks.push(generate(item.node, { comments: true }).code);
};

emitDeclaration("beamSolve");

if (!emitted.has("beamSolve")) {
  throw new Error("Failed to emit App.jsx beamSolve");
}

let output = chunks.join("\n\n");
output = output
  // App.jsx's ORB_TYPES includes imported image variables. The solver only needs ids.
  .replace(/,\s*img:\s*[A-Za-z_$][\w$]*Img/g, "")
  .replace(/requestAnimationFrame\(/g, "(globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 0)))(");

const header = `// Auto-generated from ../../src/App.jsx by tools/generate_android_appjsx_solver.mjs.\n// Do not edit this asset by hand. Android must use the same beamSolve core as App.jsx.\n`;
const footer = `\n\nglobalThis.autoComboBeamSolve = beamSolve;\n// Export the exact App.jsx pool merge used after beamSolve so Android Top10\n// has the same deduplication and ranking semantics.\nif (typeof mergeTopSolutions === "function") {\n  globalThis.autoComboMergeTopSolutions = mergeTopSolutions;\n}\nglobalThis.autoComboSolverSource = "App.jsx";\n`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, header + output + footer, "utf8");

console.log(`Generated ${path.relative(process.cwd(), outPath)} from App.jsx (${emitted.size} declarations).`);
