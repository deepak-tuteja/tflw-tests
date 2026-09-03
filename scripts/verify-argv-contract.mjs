#!/usr/bin/env node
/**
 * `M164-04` — the census script's argv contract, held to the inputs it exists for.
 *
 * ## Why this gate exists
 *
 * `discover-mutation-kills.mjs` decides whether a retraction's stated cause is recorded, whether a
 * capped sweep is capped, and whether the baseline bracket runs at all. Every one of those was
 * decided wrongly and **in silence** by its argv block until this milestone:
 *
 *   `--why <18 words>`    recorded one word          (the filed row, `M164-04`)
 *   `--limit=5`           validated, read by nothing -> `LIMIT = Infinity`
 *   `--baseline-only junk` an unknown positional vanished
 *   `--limit --status`    `NaN` -> `.slice(0, NaN)` -> swept zero candidates and exited 0
 *   `--window --status`   `NaN > 0` is false -> the baseline bracket silently disabled
 *
 * Not one of those produced a diagnostic. `verify-redaction.mjs` states the precedent this follows:
 * "a negative test that lives in the file and runs on every machine forever instead of once, in a
 * scratch copy, in a plan note."
 *
 * ## Why the old parser is reimplemented below
 *
 * `D-M164-04-7`: a case the old parser also passes proves nothing about the repair. So every case
 * declares `old` — what the previous implementation did with that input — and the gate asserts that
 * each case marked `discriminating` really does come out differently under the two. A case set that
 * silently stopped discriminating is the one failure a green gate cannot otherwise report, which is
 * `M154f`'s lesson and the reason `verify:redaction:self-test` exists at all.
 *
 * The reimplementation is the *whole* of the old contract — `KNOWN` plus `argv[i + 1]` — including
 * its error text. That last word is not decoration: the first draft of this model omitted the
 * `\nknown: …` suffix the old block printed, and §2 immediately reported case 9 as a difference
 * that did not exist. A control has to be faithful in what it is compared on, and the check that
 * exists to stop a case from silently agreeing found its own model wrong before it found anything
 * else.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgv, BOOLEAN, VALUE, REST } from './lib/argv.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let violations = 0;
const fail = (msg) => { console.error(`✗ ${msg}`); violations += 1; };
const pass = (msg) => console.log(`✓ ${msg}`);

// The spec under test, stated here rather than imported. `discover-mutation-kills.mjs` resolves the
// vendored tflw bundle at module scope, above its argv block, so importing it would pay that cost
// and fail on a machine whose vendored build has diverged (`D-M164-04-5`). §3 below closes the gap
// that restating opens: every key here must appear in that file's own `SPEC`.
const SPEC = {
  '--limit': VALUE,
  '--only': VALUE,
  '--baseline-only': BOOLEAN,
  '--status': BOOLEAN,
  '--out': VALUE,
  '--window': VALUE,
  '--remeasure': VALUE,
  '--why': REST,
  '--help': BOOLEAN,
};

/** The old contract, in full: a set of spellings, and `argv[i + 1]`. */
const OLD_KNOWN = new Set(Object.keys(SPEC));
function parseOld(argv) {
  for (const a of argv) {
    if (a.startsWith('--') && !OLD_KNOWN.has(a.split('=')[0])) {
      return { ok: false, error: `unknown flag: ${a}\nknown: ${[...OLD_KNOWN].join(' ')}` };
    }
  }
  const flag = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
  const values = Object.create(null);
  for (const k of Object.keys(SPEC)) {
    if (SPEC[k] === BOOLEAN) { if (argv.includes(k)) values[k] = true; }
    else if (flag(k) !== null) values[k] = flag(k);
  }
  return { ok: true, values };
}

const WHY18 = 'C97 gained an absolute-target third column at M164-03 — recall 2 to 4, precision 2 to 4, so its settled verdict was measured against a roster that no longer exists';

/**
 * `expect` is either `{ error: <substring the message must contain> }` or `{ values: {...} }`,
 * where `values` is checked exactly — an unlisted flag must be absent, so a parser that invents a
 * value cannot pass by being a superset.
 */
const CASES = [
  {
    n: 1, why: 'a multi-word --why is recorded in full — the filed defect',
    argv: ['--remeasure', 'C97', '--why', ...WHY18.split(' ')],
    expect: { values: { '--remeasure': 'C97', '--why': WHY18 } },
    discriminating: true,
  },
  {
    n: 2, why: '--flag=value is refused rather than silently meaning nothing',
    argv: ['--limit=5'],
    expect: { error: '`--limit=…` is not supported' },
    discriminating: true,
  },
  {
    n: 3, why: 'an unknown positional is named, not dropped',
    argv: ['--baseline-only', 'junk'],
    expect: { error: 'unexpected argument: junk' },
    discriminating: true,
  },
  {
    n: 4, why: 'a forgotten --limit value is an error, not NaN (which swept zero and exited 0)',
    argv: ['--limit', '--status'],
    expect: { error: '--limit needs a value' },
    discriminating: true,
  },
  {
    n: 5, why: 'a forgotten --window value is an error, not NaN, which disabled the baseline bracket',
    argv: ['--window', '--status'],
    expect: { error: '--window needs a value' },
    discriminating: true,
  },
  {
    n: 6, why: 'a rest value stops at the next flag and does not swallow it',
    argv: ['--why', 'a', 'b', '--limit', '5'],
    expect: { values: { '--why': 'a b', '--limit': '5' } },
    discriminating: true,
  },
  {
    // Marked a regression guard, and it was drafted as a discriminator. The old parser refuses this
    // too: its validator swept *every* `--`-prefixed token regardless of position, so the typo was
    // never reachable by the truncation defect. What this case guards is the new `rest` rule not
    // growing greedier — the property that makes `rest` safe at all — which is a claim about the
    // future, not a demonstration of the repair. §2 rejected the original classification.
    n: 7, why: 'a typo AFTER a rest value is refused, not absorbed into the prose — what keeps rest safe',
    argv: ['--why', 'a', 'b', '--lmit', '5'],
    expect: { error: 'unknown flag: --lmit' },
    discriminating: false,
  },
  {
    n: 8, why: 'an empty --why is absent, so the caller\'s own "no stated cause" refusal fires',
    argv: ['--remeasure', 'C97', '--why'],
    expect: { values: { '--remeasure': 'C97' } },
    discriminating: false,
  },
  { n: 9, why: 'an unknown flag is still refused', argv: ['--typo'], expect: { error: 'unknown flag: --typo' }, discriminating: false },
  {
    n: 10, why: 'the ordinary invocation still parses',
    argv: ['--only', 'a,b', '--status'],
    expect: { values: { '--only': 'a,b', '--status': true } },
    discriminating: false,
  },
  { n: 11, why: '--help parses as a boolean', argv: ['--help'], expect: { values: { '--help': true } }, discriminating: false },
  { n: 12, why: 'empty argv parses to no values', argv: [], expect: { values: {} }, discriminating: false },
];

const shape = (r) => (r.ok ? `ok ${JSON.stringify(r.values)}` : `error ${JSON.stringify(r.error)}`);

const matches = (result, expect) => {
  if (expect.error !== undefined) return !result.ok && result.error.includes(expect.error);
  if (!result.ok) return false;
  const got = Object.keys(result.values).sort();
  const want = Object.keys(expect.values).sort();
  if (got.join('|') !== want.join('|')) return false;
  return want.every((k) => result.values[k] === expect.values[k]);
};

// =============================================================================
// 1. every case behaves as specified
// =============================================================================
console.log('argv contract — 12 cases\n');
for (const c of CASES) {
  const got = parseArgv(c.argv, SPEC);
  if (matches(got, c.expect)) pass(`case ${c.n}: ${c.why}`);
  else fail(`case ${c.n}: ${c.why}\n    argv: ${JSON.stringify(c.argv)}\n    want: ${JSON.stringify(c.expect)}\n    got:  ${shape(got)}`);
}

// =============================================================================
// 2. the discriminating cases really do discriminate
// =============================================================================
console.log('\ndiscrimination against the previous implementation\n');
for (const c of CASES) {
  const now = shape(parseArgv(c.argv, SPEC));
  const before = shape(parseOld(c.argv));
  const differs = now !== before;
  if (c.discriminating && !differs) {
    fail(`case ${c.n} is marked discriminating but the old parser agrees — it proves nothing about the repair\n    both: ${now}`);
  } else if (!c.discriminating && differs) {
    fail(`case ${c.n} is marked a regression guard but the two parsers disagree — reclassify it\n    old: ${before}\n    new: ${now}`);
  } else {
    pass(`case ${c.n}: ${c.discriminating ? 'differs from the old parser' : 'unchanged, as a regression guard should be'}`);
  }
}

// =============================================================================
// 3. no flag is declared without a reader
// =============================================================================
//
// The rule the old block's own comment stated and could not enforce: "anything added there needs a
// reader". `--help` and `--out` each broke it once — both were spelled in `KNOWN`, both parsed,
// both read by nothing, and one of them started a multi-hour sweep under the box lock when the
// operator asked for usage. Now it is a check rather than a sentence.
console.log('\nspec/reader agreement\n');
const SRC = path.join('scripts', 'discover-mutation-kills.mjs');
const src = readFileSync(path.join(ROOT, SRC), 'utf8');

const declared = [...src.matchAll(/^\s*'(--[a-z-]+)':\s*(BOOLEAN|VALUE|REST),$/gm)].map((m) => m[1]);
if (declared.length === 0) {
  fail(`${SRC}: found no SPEC entries — this gate's parse of that file has broken, which would make every check below vacuous`);
} else if (declared.sort().join(' ') !== Object.keys(SPEC).sort().join(' ')) {
  fail(`${SRC}: its SPEC and this gate's disagree\n    there: ${declared.sort().join(' ')}\n    here:  ${Object.keys(SPEC).sort().join(' ')}`);
} else {
  pass(`${SRC}: its SPEC has the same ${declared.length} flags this gate drives`);
}

for (const key of Object.keys(SPEC)) {
  // A reader is a `flag('--x')` or `has('--x')` call somewhere below the spec — the declaration
  // itself is excluded by requiring the quote to follow an opening paren.
  const read = new RegExp(`(?:flag|has)\\('${key}'\\)`).test(src);
  if (read) pass(`${key} has a reader`);
  else fail(`${key} is declared in SPEC and no \`flag()\`/\`has()\` call reads it — that is exactly how \`--help\` and \`--out\` shipped as decoration`);
}

console.log('');
if (violations > 0) {
  console.error(`✗ argv contract: ${violations} violation(s)`);
  process.exit(1);
}
console.log(`✓ argv contract: ${CASES.length} cases, ${CASES.filter((c) => c.discriminating).length} of them discriminating, ${Object.keys(SPEC).length} flags each with a reader`);
