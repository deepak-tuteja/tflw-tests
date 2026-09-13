// `M189a` — the reading of the reach measurement, and the gate that holds it to the measurement.
//
// `measure-mutation-reach.mjs` produces `reach.json`: for every registry mutation, whether any
// plant's run executed a line of its `find` region. Over the census's surviving runtime mutants
// that splits them into bins a person can act on — and only the **reached** bin needs a person.
// An unreached survivor is a fact about the roster's reach and nothing else; a reached survivor
// is a plant running through a line whose opposite it cannot tell from the original, and someone
// has to say which of two things that is:
//
//   not-asserted            a plant runs through it and its known answer does not depend on the
//                           result — the dogfood is shallow there, and a row is filed per
//                           construct family for the drawdown
//   out-of-reach-by-design  the result is visible only somewhere the roster does not look — the
//                           HTML report, an exit code, the LSP, a log line — and a plant that
//                           looked there would be a different kind of plant
//
// `mutation-covers.mjs`'s arrangement (`D842`, `D767`): the hand table and the measured set must
// name exactly the same mutations, in both directions, or the gate refuses. A verdict about a
// mutation no plant reaches is a judgement about nothing; a reached survivor without a verdict is
// the hand step left undone. Both are `D767`'s shape — a table nothing holds to its subject.
//
// The gate refuses a PARTIAL measurement outright. `--only` runs stamp themselves partial, and a
// table read against one would certify verdicts about a reached set that is short by an unknown
// amount — `M153b-01`'s confident wrong answer from a stale read.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERDICTS = ['not-asserted', 'out-of-reach-by-design'];
export const PRODUCED = '$produced';

/** The committed matrix, folded the way `read-mutation-matrix.mjs` folds it (`D848`). */
export function readMatrix(file) {
  const matrix = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.state === 'retracted') matrix.delete(row.id); else matrix.set(row.id, row);
  }
  return matrix;
}

/** The census's surviving runtime mutants, binned by what the reach measurement says of each. */
export function binsOf(reach, matrix) {
  const bins = { reached: [], unreached: [], unmapped: [], 'not-located': [], unmeasured: [] };
  for (const r of matrix.values()) {
    if (r.state !== 'survived' || !r.file.startsWith('packages/runtime/')) continue;
    const x = reach?.mutations?.[r.id];
    if (!x) bins.unmeasured.push(r.id);
    else if (!x.located) bins['not-located'].push(r.id);
    else if (!x.mapped) bins.unmapped.push(r.id);
    else if (x.reached) bins.reached.push(r.id);
    else bins.unreached.push(r.id);
  }
  for (const k of Object.keys(bins)) bins[k].sort();
  return bins;
}

/**
 * Every way the hand table can disagree with the measurement, as messages. Empty means the gate
 * passes. `table` is the parsed `reach-verdicts.json` with its `$comment` allowed.
 */
export function checkVerdicts(reach, matrix, table) {
  const problems = [];
  if (!reach) return ['no `reach.json` — nothing measured, so there is nothing to hold the table to. Run `npm run measure:mutation-reach` on the box and commit the artefact.'];
  if (!reach[PRODUCED] || !Array.isArray(reach[PRODUCED].plants)) return ['`reach.json` carries no `$produced` stamp — not an artefact this reader knows'];
  if (reach[PRODUCED].partial) return [`\`reach.json\` is PARTIAL (${reach[PRODUCED].plants.length} plant(s) ran) — a table read against a partial reached set would certify verdicts about an unknown remainder`];
  const bins = binsOf(reach, matrix);
  const measured = new Set(bins.reached);
  const labelled = new Set(Object.keys(table).filter((k) => !k.startsWith('$')));
  for (const id of measured) if (!labelled.has(id)) problems.push(`${id} is a reached survivor with no verdict in \`reach-verdicts.json\` (${reach.mutations[id].file}:${reach.mutations[id].lines.join(',')}, reached by ${reach.mutations[id].plants.length} plant(s))`);
  for (const id of labelled) if (!measured.has(id)) problems.push(`${id} has a verdict and is not a reached survivor — ${reach.mutations?.[id] ? (matrix.get(id)?.state !== 'survived' ? `the census says \`${matrix.get(id)?.state ?? 'absent'}\`` : reach.mutations[id].located ? (reach.mutations[id].mapped ? 'no plant reaches it' : 'its region has no mapping in the bundle') : 'its find string is not located in the current source') : 'the reach measurement has no such mutation'}. A verdict about nothing is \`D767\`'s shape.`);
  for (const id of labelled) {
    const v = table[id];
    if (!v || typeof v !== 'object') { problems.push(`${id}: the entry is not an object`); continue; }
    if (!VERDICTS.includes(v.verdict)) problems.push(`${id}: verdict \`${v.verdict}\` is not one of ${VERDICTS.join(' | ')}`);
    if (typeof v.family !== 'string' || !v.family.trim()) problems.push(`${id}: no \`family\` — a not-asserted verdict is filed per construct family, and this names which`);
    if (typeof v.why !== 'string' || v.why.trim().length < 20) problems.push(`${id}: \`why\` is missing or shorter than a sentence — one line of reasoning per verdict (\`D842\`)`);
  }
  if (bins['not-located'].length > 0) problems.push(`${bins['not-located'].length} survivor(s) could not be located in the current source (${bins['not-located'].join(', ')}) — the registry moved since the reach was measured; re-measure`);
  return problems;
}

export function loadReach(dir) {
  const p = path.join(dir, 'reach.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
export function loadVerdicts(dir) {
  const p = path.join(dir, 'reach-verdicts.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

// ── self-test ─────────────────────────────────────────────────────────────────────────────────
function selfTest() {
  const ok = [], bad = [];
  const t = (name, cond) => (cond ? ok : bad).push(name);
  const row = (id, state, file = 'packages/runtime/src/interpreter.ts') => ({ id, state, file, killed: [] });
  const matrix = new Map([
    ['a', row('a', 'survived')], ['b', row('b', 'survived')], ['c', row('c', 'survived')], ['d', row('d', 'survived')],
    ['k', row('k', 'killed')], ['l', row('l', 'survived', 'packages/lang/src/lexer.ts')], ['n', row('n', 'survived')],
  ]);
  const mut = (located, mapped, reached, plants = ['C1']) => ({ file: 'packages/runtime/src/interpreter.ts', located, mapped, reached, lines: reached ? [7] : [], plants: reached ? plants : [] });
  const reach = {
    [PRODUCED]: { plants: ['C1'], partial: false },
    mutations: { a: mut(true, true, true), b: mut(true, true, false), c: mut(true, false, false), d: mut(false, false, false), k: mut(true, true, true), l: mut(true, true, true) },
  };
  const bins = binsOf(reach, matrix);
  t('bins: reached / unreached / unmapped / not-located / unmeasured, runtime survivors only',
    JSON.stringify(bins) === JSON.stringify({ reached: ['a'], unreached: ['b'], unmapped: ['c'], 'not-located': ['d'], unmeasured: ['n'] }));

  const good = { $comment: 'x', a: { verdict: 'not-asserted', family: 'expect:comparison', why: 'the plant reads the verdict, never the coerced operand' } };
  const clean = { ...reach, mutations: { ...reach.mutations, d: mut(true, true, false) } };
  t('a table naming exactly the reached set passes', checkVerdicts(clean, matrix, good).length === 0);
  t('a reached survivor without a verdict is refused', checkVerdicts(clean, matrix, { $comment: 'x' }).some((p) => /^a is a reached survivor with no verdict/.test(p)));
  t('a verdict about an unreached survivor is refused, naming why', checkVerdicts(clean, matrix, { ...good, b: good.a }).some((p) => /^b has a verdict.*no plant reaches it/.test(p)));
  t('a verdict about a killed mutation is refused, naming the census state', checkVerdicts(clean, matrix, { ...good, k: good.a }).some((p) => /^k has a verdict.*census says `killed`/.test(p)));
  t('a verdict about a non-runtime survivor is refused', checkVerdicts(clean, matrix, { ...good, l: good.a }).some((p) => /^l has a verdict/.test(p)));
  t('a verdict outside the vocabulary is refused', checkVerdicts(clean, matrix, { a: { ...good.a, verdict: 'meh' } }).some((p) => /not one of/.test(p)));
  t('a verdict with no family is refused', checkVerdicts(clean, matrix, { a: { ...good.a, family: '' } }).some((p) => /no `family`/.test(p)));
  t('a verdict with a one-word why is refused', checkVerdicts(clean, matrix, { a: { ...good.a, why: 'shallow' } }).some((p) => /shorter than a sentence/.test(p)));
  t('a survivor the registry moved out from under is refused', checkVerdicts(reach, matrix, good).some((p) => /could not be located/.test(p)));
  t('no measurement refuses, and says what to run', /measure:mutation-reach/.test(checkVerdicts(null, matrix, good)[0]));
  t('a partial measurement refuses', /PARTIAL/.test(checkVerdicts({ ...clean, [PRODUCED]: { plants: ['C1'], partial: true } }, matrix, good)[0]));
  t('a stampless file refuses', /no `\$produced`/.test(checkVerdicts({ mutations: {} }, matrix, good)[0]));

  if (bad.length) {
    console.error(`✗ reach-verdicts self-test: ${bad.length} of ${ok.length + bad.length} control(s) did not fire`);
    for (const b of bad) console.error(`    · ${b}`);
    return 1;
  }
  console.log(`✓ reach-verdicts self-test: ${ok.length} control(s), each shown to fire on the input it exists for`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--self-test')) {
    console.error('✗ this module is a library; its only command-line mode is `--self-test`.');
    process.exit(64);
  }
  process.exit(selfTest());
}
