// Read the actual Web solver declarations without maintaining a second solver.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import * as parser from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import * as t from '@babel/types';

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;

export async function loadWebSolver(sourcePath = 'src/App.jsx', globals = {}) {
  const sourceReadAt = new Date().toISOString();
  const source = fs.readFileSync(sourcePath, 'utf8');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  // Optional research hook, applied identically to baseline and candidate. It
  // observes endpoints after their native admission logic without changing it.
  if (typeof globals.__solverObserver === 'function') {
    let hooked = false;
    traverse(ast, { VariableDeclarator(p) {
      if (!t.isIdentifier(p.node.id, { name: 'beamSolve' })) return;
      const body = p.node.init.body.body;
      const index = body.findIndex((statement) => t.isVariableDeclaration(statement) &&
        statement.declarations.some((item) => t.isIdentifier(item.id, { name: 'pushTopCandidate' })));
      if (index < 0) throw new Error('Observer hook cannot find pushTopCandidate');
      const original = body[index].declarations.find((item) =>
        t.isIdentifier(item.id, { name: 'pushTopCandidate' }));
      original.id.name = 'pushTopCandidateOriginal';
      const wrapper = parser.parse(`const pushTopCandidate = (...args) => {
        const result = pushTopCandidateOriginal(...args);
        const [ev, node, score, violatesN2, extraCtx = {}, specialTuple = []] = args;
        __solverObserver({ ev, node, score, violatesN2, extraCtx, specialTuple,
          path: node ? buildPath(node) : [],
          endpointAccepted: !!node && shouldAcceptEnd(node),
          nativePools: { steps: topStepCandidates, combo: topComboCandidates } });
        return result;
      };`, { sourceType: 'module' }).program.body[0];
      body.splice(index + 1, 0, wrapper);
      hooked = true;
      p.skip();
    } });
    if (!hooked) throw new Error('Observer hook cannot find beamSolve');
  }
  const declarations = new Map();
  let appBody;
  const remember = (statement) => {
    if (t.isVariableDeclaration(statement)) {
      for (const item of statement.declarations) {
        if (!t.isIdentifier(item.id)) continue;
        declarations.set(item.id.name, t.variableDeclaration(statement.kind, [item]));
        if (item.id.name === 'App') appBody = item.init.body.body;
      }
    } else if (t.isFunctionDeclaration(statement) && statement.id) {
      declarations.set(statement.id.name, statement);
    }
  };
  ast.program.body.forEach(remember);
  if (!appBody) throw new Error('App component not found');
  appBody.forEach(remember);
  const visiting = new Set();
  const emitted = new Set();
  const chunks = [];
  function emit(name) {
    if (emitted.has(name) || visiting.has(name)) return;
    const node = declarations.get(name);
    if (!node) throw new Error(`Missing Web declaration: ${name}`);
    visiting.add(name);
    const file = t.file(t.program([t.cloneNode(node, true)]));
    traverse(file, { ReferencedIdentifier(p) {
      const dep = p.node.name;
      if (!p.scope.getBinding(dep) && declarations.has(dep)) emit(dep);
    } });
    visiting.delete(name);
    emitted.add(name);
    chunks.push(generate(node, { comments: false }).code);
  }
  const exports = ['beamSolve', 'evaluateBoard', 'findMatches', 'mergeTopSolutions',
    'makePoolRank', 'makeDefaultRuleProfile', 'getSolutionMergeSignature'];
  exports.forEach(emit);
  let ranking = {};
  if (source.includes('./solver/solutionRanking')) {
    ranking = await import('../src/solver/solutionRanking.js');
  }
  const pathReplay = source.includes('./solver/pathReplay')
    ? await import('../src/solver/pathReplay.js') : {};
  const comboBound = source.includes('./solver/comboBound')
    ? await import('../src/solver/comboBound.js') : {};
  const pathRefinement = source.includes('./solver/pathRefinement')
    ? await import('../src/solver/pathRefinement.js') : {};
  const performanceLevels = source.includes('./solver/performanceLevels')
    ? await import('../src/solver/performanceLevels.js') : {};
  const context = { console, performance, setTimeout, clearTimeout,
    requestAnimationFrame: (cb) => setTimeout(cb, 0), ...ranking, ...pathReplay, ...comboBound, ...pathRefinement, ...performanceLevels, ...globals };
  const code = chunks.join('\n').replace(/,\s*img:\s*[A-Za-z_$][\w$]*Img/g, '');
  // Native globals avoid vm.Context proxy overhead distorting solver timings.
  const api = new Function(...Object.keys(context), `${code}\n;return {${exports.join(',')}};`)(
    ...Object.values(context));
  api.sourceMetadata = { path: sourcePath, sourceReadAt,
    sha256: crypto.createHash('sha256').update(source).digest('hex') };
  return api;
}
