#!/usr/bin/env node
// M141 (`M115-03`, `M128-04`) — one answer to "which tflw am I running?", enforced.
//
// Two halves, because the row family has two halves. `scripts/lib/tflw-bin.mjs` must **behave**
// (half A), and it must be the **only** way this tree resolves a tflw (half B). Either alone is
// the defect wearing different clothes: a resolver nobody calls announces nothing, and a tree that
// calls one resolver which silently accepts anything announces the wrong thing confidently.
//
// HALF A CARRIES ITS OWN BREAKS. Order 1 is the cluster of checks that could not fail, so every
// assertion here was run against a deliberately broken resolver before it was committed (`D537`),
// and the negative cases below are the durable half of that: they assert that the resolver
// **refuses**, so they fail if the refusal is ever deleted. A test that only ever exercises the
// happy path of a guard is not a test of the guard.
//
// HALF B'S ALLOW-LIST IS THE HONEST PART (`D540`). A green here does not mean "nothing resolves a
// tflw outside the resolver" — it means every place that does is **named below with a reason**.
// The draft green condition for this milestone was "every check in either repo prints which build
// it graded", which is not enumerable and so cannot be enforced; this is that condition with the
// exceptions written down instead of assumed away.
//
// A PLAIN SCRIPT RATHER THAN A TEST, for the reason `verify-contributing.mjs` gives at length:
// this repo's `npm test` is `tflw run` over a Docker stack, and there is no runner for `scripts/`.
// It needs no stack, no `.env` and no Playwright, so it runs in `acceptance-check` beside the other
// static gates.

import { existsSync, mkdirSync, mkdtempSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveTflw, tflwCommand, resolveArtifactContract, RELEASED_ENTRY, BRANCH_ENTRY } from './lib/tflw-bin.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
let failures = 0;

function fail(message) {
  failures += 1;
  console.log(`✗ ${message}`);
}
function pass(message) {
  console.log(`✓ ${message}`);
}

/** Run `fn` with `env` applied, restoring whatever was there — the resolver reads env per call. */
function withEnv(env, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === null) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Returns the thrown error, or null if `fn` did not throw. Negative cases assert on this. */
function threw(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

const CLEAN_ENV = { TFLW_BIN: null, TFLW_CLI_ENTRY: null, TFLW_ARTIFACT_CONTRACT: null };

// ── Half A: the resolver behaves ────────────────────────────────────────────────────────────────

console.log('resolver behaviour\n');

// 1. The question is an argument, and an unknown one is refused rather than defaulted. A default
//    would reintroduce exactly what this module deletes: a resolution nobody declared.
{
  const error = threw(() => resolveTflw('whichever', { quiet: true }));
  if (!error) fail('an undeclared question resolves anyway — the question is back to being implied');
  else pass('an unknown question is refused rather than defaulted');
}

// 2. Both real questions resolve, and to *different* programs. Asserting they differ is the point:
//    if the two questions ever collapse onto one path, every call site is asking the same thing and
//    the log stops distinguishing anything, which is the original defect restored.
{
  const results = withEnv(CLEAN_ENV, () => {
    const released = existsSync(RELEASED_ENTRY) ? resolveTflw('released', { quiet: true }) : null;
    const branch = existsSync(BRANCH_ENTRY) ? resolveTflw('branch', { quiet: true }) : null;
    return { released, branch };
  });
  if (!results.released) fail(`no vendored tflw at ${RELEASED_ENTRY} — run npm run refresh-tflw`);
  else if (!results.branch) fail(`no sibling build at ${BRANCH_ENTRY} — run (cd ../testFlow && npm run build)`);
  else if (results.released.entry === results.branch.entry) {
    fail('released and branch resolve to the same file, so the declared question distinguishes nothing');
  } else pass('released and branch resolve to two different programs');
}

// 3. The announcement actually reaches stderr, and carries all three facts the row asked for:
//    the question, the absolute path, and enough of the hash to tell two builds apart. `M115-03`'s
//    own smallest proposed fix was "print which binary you used"; this is the assertion that it is
//    still printed, because a print statement is the easiest thing in this file to lose silently.
{
  const written = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    written.push(String(chunk));
    return realWrite(chunk, ...rest);
  };
  let resolved;
  try {
    resolved = withEnv(CLEAN_ENV, () => resolveTflw('released', { label: 'verify-tflw-resolution' }));
  } finally {
    process.stderr.write = realWrite;
  }
  const line = written.join('');
  const missing = [
    ['the question', line.includes('[released]')],
    ['the absolute path', line.includes(resolved.entry)],
    ['the sha prefix', line.includes(resolved.sha.slice(0, 8))],
    ['the caller label', line.includes('verify-tflw-resolution')],
  ]
    .filter(([, ok]) => !ok)
    .map(([what]) => what);
  if (missing.length > 0) fail(`the announcement omits ${missing.join(', ')} — it printed: ${JSON.stringify(line)}`);
  else pass('every resolution announces its question, path and sha to stderr');
}

// 4. `M128-04`'s refusal. The row asked for "the driver refusing to run npx-based phases without
//    [an override]"; the driver is untracked (`D14`, in mac-fedora-connect), so the refusal lives
//    here where a gate can hold it. Asking `branch` and being handed a DIFFERENT program is the
//    confusion the row describes, and it must be an error, not a shrug.
//
//    THIS ASSERTION WAS WRONG WHEN FIRST WRITTEN, and CI is what said so. It pointed `TFLW_BIN` at
//    `RELEASED_ENTRY` and demanded a refusal — which passed here and failed there, because
//    `refresh-tflw.mjs` packs the tarball **from the sibling checkout**: right after an install the
//    vendored entry and the branch build are the SAME BYTES, and accepting it is then not a bug but
//    the resolver's stated contract (assertion 5 — identity is by content, not by path). It had
//    passed locally only because this machine's `node_modules/tflw` happened to be stale. A check
//    whose green depends on an accident of when somebody last ran an install is exactly the kind of
//    check Order 1 exists to remove, so it is replaced by both halves stated outright.
{
  const shas = withEnv(CLEAN_ENV, () => ({
    released: existsSync(RELEASED_ENTRY) ? resolveTflw('released', { quiet: true }).sha : null,
    branch: existsSync(BRANCH_ENTRY) ? resolveTflw('branch', { quiet: true }).sha : null,
  }));

  // 4a. Whichever way the two builds currently stand, the resolver's answer is asserted — there is
  //     no environment in which this is skipped, and the CI case is the identical one.
  if (shas.released && shas.branch) {
    const error = withEnv({ ...CLEAN_ENV, TFLW_BIN: RELEASED_ENTRY }, () =>
      threw(() => resolveTflw('branch', { quiet: true })),
    );
    if (shas.released === shas.branch) {
      if (error) fail(`the vendored entry is byte-identical to the branch build and was still refused: ${error.message}`);
      else pass('a vendored entry freshly packed from the branch build IS the branch build, and is accepted');
    } else if (!error) {
      fail('resolveTflw("branch") accepted a vendored build whose bytes differ — M128-04 is open again');
    } else {
      pass('a vendored entry whose bytes differ from the branch build is refused');
    }
  }

  // 4b. The refusal itself, against a vendored path built to differ rather than found differing —
  //     so this half asserts the same thing on every machine and in CI. `node_modules` is in the
  //     path on purpose: the message has to name it as a *vendored* build, which is the sentence a
  //     reader gets when the confusion the row describes actually happens to them.
  if (existsSync(BRANCH_ENTRY)) {
    const dir = mkdtempSync(path.join(tmpdir(), 'tflw-bin-'));
    const vendored = path.join(dir, 'node_modules', 'tflw', 'dist', 'cli.cjs');
    mkdirSync(path.dirname(vendored), { recursive: true });
    writeFileSync(vendored, `${readFileSync(BRANCH_ENTRY, 'utf8')}\n// packed from another commit\n`);
    const error = withEnv({ ...CLEAN_ENV, TFLW_BIN: vendored }, () =>
      threw(() => resolveTflw('branch', { quiet: true })),
    );
    if (!error) fail('resolveTflw("branch") accepted a vendored build that is not the branch build — M128-04 is open again');
    else if (!/refuses/.test(error.message)) fail(`branch refused the vendored build with an unhelpful message: ${error.message}`);
    else if (!/vendored build/.test(error.message)) fail(`the refusal did not name it as a vendored build: ${error.message}`);
    else pass('a vendored build that is not the branch build is refused, and named as vendored');
  }
}

// 5. …but identity is by CONTENT, not by path. `exec.mjs` rsyncs this tree to fedora-box under a
//    different prefix, so a byte-identical copy at another path is the same program and refusing it
//    would make the guard wrong on the machine that runs almost every gate.
if (existsSync(BRANCH_ENTRY)) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tflw-bin-'));
  const copy = path.join(dir, 'cli.cjs');
  copyFileSync(BRANCH_ENTRY, copy);
  const error = withEnv({ ...CLEAN_ENV, TFLW_BIN: copy }, () => threw(() => resolveTflw('branch', { quiet: true })));
  if (error) fail(`a byte-identical copy of the branch build was refused: ${error.message}`);
  else pass('a byte-identical copy of the branch build at another path is accepted');

  writeFileSync(copy, `${readFileSync(copy, 'utf8')}\n// not the same program\n`);
  const mutated = withEnv({ ...CLEAN_ENV, TFLW_BIN: copy }, () => threw(() => resolveTflw('branch', { quiet: true })));
  if (!mutated) fail('a copy whose bytes differ from the branch build was accepted as the branch build');
  else pass('a copy whose bytes differ from the branch build is refused');
}

// 6. Three names for one question was the defect in miniature. The aliases still work — a CI step
//    or a shell habit predating this module should not break — but two of them disagreeing has no
//    honest resolution, so it is an error rather than a precedence rule nobody would remember.
{
  const error = withEnv({ ...CLEAN_ENV, TFLW_BIN: RELEASED_ENTRY, TFLW_CLI_ENTRY: BRANCH_ENTRY }, () =>
    threw(() => resolveTflw('released', { quiet: true })),
  );
  if (!error) fail('TFLW_BIN and TFLW_CLI_ENTRY disagreed and one silently won');
  else pass('TFLW_BIN and TFLW_CLI_ENTRY disagreeing is an error, not a precedence puzzle');
}

// 7. The shell-string and artifact-contract helpers resolve through the same answer. They exist so
//    that the `execSync('npx tflw …')` sites and the contract check stop being a second and third
//    way to ask, and that is only true if they delegate.
{
  const command = withEnv(CLEAN_ENV, () => tflwCommand('released', { quiet: true }));
  const contract = withEnv(CLEAN_ENV, () => resolveArtifactContract('released', { quiet: true }));
  if (!command.includes(RELEASED_ENTRY)) fail(`tflwCommand did not resolve through the resolver: ${command}`);
  else if (path.dirname(contract.file) !== path.dirname(RELEASED_ENTRY)) {
    fail(`the artifact contract resolved beside a different build: ${contract.file}`);
  } else pass('tflwCommand and resolveArtifactContract both delegate to the one answer');
}

// ── Half B: nothing else resolves a tflw ────────────────────────────────────────────────────────

/**
 * Every way this tree has ever named a tflw entry. Matched against source with comments stripped,
 * because a comment cannot resolve anything and several of these files discuss the history at
 * length — `check-acceptance.mjs:39` in particular exists to explain why `npx` is right there.
 */
const PATTERNS = [
  { re: /\bnpx\s+(?:--no-install\s+)?tflw\b/, what: '`npx tflw`' },
  // The ARRAY form, which the pattern above does not see and which is where the biggest site in
  // the repo was hiding: `regression.mjs` built `['npx', 'tflw', 'run', …].join(' ')` for all 30
  // phases. Found by reading the file rather than by the guard, which is the guard being
  // incomplete in exactly the way this milestone is about — so the pattern is here now.
  { re: /\[\s*'npx'\s*,\s*'tflw'/, what: "an `['npx', 'tflw', …]` argv array" },
  { re: /node_modules['"\/\\\s,\]]+tflw\b/, what: 'a hand-built path into node_modules/tflw' },
  { re: /packages['"\/\\\s,\]]+cli['"\/\\\s,\]]+dist/, what: 'a hand-built path into the sibling build' },
  { re: /\bprocess\.env\.TFLW_(?:BIN|CLI_ENTRY|ARTIFACT_CONTRACT)\b/, what: 'a direct read of a TFLW_* override' },
];

/**
 * Sites that legitimately do not go through the resolver. **Every entry carries a reason**, and an
 * entry whose reason has expired is meant to be deleted rather than kept for tidiness.
 */
const ALLOWED = [
  {
    file: 'scripts/lib/tflw-bin.mjs',
    why: 'is the resolver — it is the one place allowed to know where a tflw lives',
  },
  {
    file: 'scripts/exec.mjs',
    why: 'is untracked and local-only by decision (D14, mac-fedora-connect/tflw-exec-offload-plan.md). '
      + 'It is a machine-specific driver, not a check: it never grades a build, it forwards a command to '
      + 'fedora-box. M141/D533 deliberately left it alone rather than reversing a decision taken in another repo.',
  },
  {
    file: 'scripts/refresh-tflw.mjs',
    why: 'installs the vendored tarball — it is what MAKES the released answer exist, so it cannot ask for it. '
      + 'Its node_modules/tflw reads are integrity checks on the install it just performed.',
  },
  {
    file: 'scripts/verify-tflw-resolution.mjs',
    why: 'is this guard — half A must name both entries to assert they differ',
  },
];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join('\n');
}

async function* mjsFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* mjsFiles(full);
    else if (entry.name.endsWith('.mjs')) yield full;
  }
}

console.log('\nresolution sites\n');

const allowedFiles = new Set(ALLOWED.map((a) => a.file));
const offenders = [];
for await (const file of mjsFiles(path.join(repoRoot, 'scripts'))) {
  const rel = path.relative(repoRoot, file);
  if (allowedFiles.has(rel)) continue;
  const source = stripComments(readFileSync(file, 'utf8'));
  for (const { re, what } of PATTERNS) {
    if (re.test(source)) offenders.push(`${rel} — ${what}`);
  }
}

// The npm scripts are resolution sites too, and the loudest one: the root `npm test` is a bare
// `tflw run`, which resolves the VENDORED tarball through `node_modules/.bin`. That is this repo's
// primary dogfood gate grading the released build while reading as though it graded the branch —
// the headline `M115-03` never states. Migrating the scripts is separate work; what is refused here
// is a bare `tflw` arriving in a NEW script without a decision.
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const BARE_TFLW_SCRIPTS = new Set([
  'test',
  'test:mtls',
  'test:mtls-rejection',
  'test:safety',
  'test:logging',
  'test:unreachable-host',
  'test:secure-local',
  'test:webv2-admin',
  'test:ui-admin',
]);
for (const [name, body] of Object.entries(pkg.scripts ?? {})) {
  if (!/(^|\s|&&\s*)tflw\s/.test(body)) continue;
  if (!BARE_TFLW_SCRIPTS.has(name)) offenders.push(`package.json scripts.${name} — a bare \`tflw\` (resolves the vendored tarball via node_modules/.bin)`);
}

if (offenders.length > 0) {
  for (const offender of offenders) fail(`resolves a tflw outside scripts/lib/tflw-bin.mjs: ${offender}`);
  console.log(
    '\n  Use resolveTflw("released"|"branch") and declare which question the site asks.\n' +
      '  If it genuinely cannot, add it to ALLOWED in this file WITH A REASON — that list is the\n' +
      '  green condition\'s honest half, not a suppression mechanism.',
  );
} else {
  pass(`every resolution goes through the resolver, with ${ALLOWED.length} named exceptions and ${BARE_TFLW_SCRIPTS.size} bare-\`tflw\` npm scripts`);
}

console.log('');
for (const { file, why } of ALLOWED) console.log(`  allowed: ${file} — ${why}`);

if (failures > 0) {
  console.log(`\n✗ tflw resolution: ${failures} problem(s)`);
  process.exit(1);
}
console.log('\n✓ tflw resolution: one answer, announced, and nothing else asks');
