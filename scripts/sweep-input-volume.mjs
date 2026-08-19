#!/usr/bin/env node
// `npm run sweep:input-volume` — D380's measurement (testFlow M134c,
// PLAN_M134_PENTEST_TIER3.md).
//
// `verify:input-acceptance` measures Tier 3 against a corpus built to exercise it: seven
// assertions, 80 extra requests, every one of them pointed at a route planted for the purpose.
// That number says nothing about what the tier costs a real suite, and D380 is the decision that
// the real suite is where that gets answered:
//
// > The ~45 real test files' observed requests are Tier 3's **negative** corpus and its volume
// > measurement — mutating them proves the oracle is quiet against a correct application, and tells
// > us whether D377's gate is urgent or merely prudent.
//
// So this script attaches one input-handling assertion to every test in `tests/api/` and runs it.
// Two answers come out, and they are independent:
//
//   1. **Is the oracle quiet against a correct app?** Every finding here is against a real endpoint,
//      and `plan_v2.md` §4.2 says real endpoints are clean — so a finding is either a false positive
//      in the pack or a genuine defect in apiV2, and both are worth more than a green line.
//   2. **What does the tier cost at suite scale?** Total extra requests, and the per-request
//      distribution that lets it be extrapolated to a suite this one's size.
//
// ## Why it copies the suite instead of editing it
//
// `plan_v2.md` §4.2's rule is that real endpoints stay clean, and the same instinct applies to the
// tests: this measurement must not leave a mutation-probing assertion behind in a file somebody
// later reads as the suite's intent. So the whole `tests/` tree is copied to `.sweep-input/`
// (gitignored) and the assertions are added *there*. The tree is copied whole rather than
// per-directory because 14 files under `tests/api/` reach outward with `use "../../helpers/…"`, and
// a partial copy would break them in ways that look like DSL errors.
//
// ## Why one assertion per test rather than one per `api` step
//
// A Tier 3 assertion judges **the request the last `api` step actually made**, so an assertion per
// step would need a step-by-step rewrite of 834 requests, and the rewritten file would no longer be
// the suite whose behaviour is being measured. One assertion per test measures 240 real observed
// requests as they are, and the per-request cost it reports is what extrapolates to the rest.
// **This is a declared bound, not a silent one** — the report prints both the measured figure and
// what the whole suite would cost, and says which is which.
//
// Run it against a stack started WITH the fixture slice absent or present — it makes no difference,
// because nothing here touches `vuln/`:
//
//     node cli.mjs start
//     node scripts/sweep-input-volume.mjs
//
// The probes mutate real data (`probe mutating` is granted below, and 690 of the suite's requests
// are writes). That is D380's point — *mutating a real endpoint does not make it dirty, it probes
// it* — and it is safe here for the same reason the suite itself is: `cli.mjs` builds this stack
// from nothing and destroys it with `down -v`.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTflw } from './lib/tflw-bin.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SWEEP = path.join(ROOT, '.sweep-input');
const TARGET = 'tests/api';

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // Already-exported variables are equally fine — CI does it that way.
}

const ASSERTION = 'expect response has no input handling violations';

/** The three opt-ins, added to `env local`'s own `authorized target` and to no other env.
 *
 * Every class, deliberately. The acceptance corpus splits them across two envs because it needs
 * each opt-in to have a *withheld* env to demonstrate the not-applicable state against; this script
 * is not demonstrating states, it is measuring cost and quietness, and withholding a class here
 * would understate both. */
const PROBE_GRANTS = ['probe mutating', 'probe oversized', 'probe traversal'];

// ── 1. the disposable copy ───────────────────────────────────────────────────────────────────
rmSync(SWEEP, { recursive: true, force: true });
mkdirSync(SWEEP, { recursive: true });
cpSync(path.join(ROOT, 'tests'), path.join(SWEEP, 'tests'), { recursive: true });

// `tests/api/identity/*.tflw` reaches three levels up — `import "../../../shared/get-profile.tflw"`
// lands at the *repo root's* `shared/`, not `tests/shared/` (both exist, and files in the suite
// import from each). So the copy needs the root-level siblings the suite names too, or the run dies
// at check time with `TF043` rather than running.
for (const sibling of ['shared']) {
  const from = path.join(ROOT, sibling);
  if (existsSync(from)) cpSync(from, path.join(SWEEP, sibling), { recursive: true });
}

// `use "./helpers.ts"` and friends resolve relative to the .tflw file, so the tree above is
// self-sufficient. `tflw.config` is not: it is read from the run root, so it needs its own copy
// with the opt-ins spliced in.
const config = readFileSync(path.join(ROOT, 'tflw.config'), 'utf8');
const lines = config.split('\n');
const targetLine = lines.findIndex((l) =>
  /^\s*authorized target "http:\/\/localhost:4001"/.test(l),
);
if (targetLine === -1) {
  console.error(
    "✗ could not find `authorized target \"http://localhost:4001\"` in tflw.config — the sweep " +
      'grants its probe classes by splicing into that declaration, so it cannot proceed blind.',
  );
  process.exit(2);
}
// Indentation matches the declaration's own, one level deeper — the same shape
// `tflw-acceptance/security/tflw.config` uses for its opt-ins.
const indent = (lines[targetLine].match(/^\s*/) ?? [''])[0] + '  ';
lines.splice(targetLine + 1, 0, ...PROBE_GRANTS.map((g) => `${indent}${g}`));
writeFileSync(path.join(SWEEP, 'tflw.config'), lines.join('\n'));

// ── 2. one assertion per test ────────────────────────────────────────────────────────────────
/**
 * A `.tflw` file is a sequence of top-level blocks introduced at column 0 (`test`, `before`,
 * `after`, `defaults`, a tag line, …) whose bodies are indented. So "the end of this test" is the
 * line before the next column-0 construct, trailing blank lines excluded — which is all the
 * structure this rewrite needs, and less than a parser's worth.
 */
/**
 * Whether tflw will accept an input-handling assertion on this step — an identifier path segment, a
 * query string, or a JSON body (SPEC §9.12).
 *
 * **This predicate is not a nicety, it is the sweep's central constraint.** `TF067` is raised by the
 * *checker*, not at runtime: an assertion on a request with nothing to mutate makes the whole run
 * refuse to start, so Tier 3 cannot simply be switched on over a suite. The first version of this
 * script annotated every test and got 222 assertions and zero requests. How many of a real suite's
 * requests pass this predicate is therefore one of the numbers D380 is asking for.
 *
 * A `{placeholder}` segment counts: the checker cannot know what it resolves to, and at runtime it
 * usually resolves to exactly the UUID that makes it a mutation site.
 */
function isMutable(stepText) {
  if (/\?[^\s"]*=/.test(stepText)) return true;
  if (/\bbody\s*\{/.test(stepText)) return true;
  const route = stepText.match(/^\s*api\s+(?:\w+\s+)?(?:GET|POST|PUT|PATCH|DELETE)\s+(\S+)/);
  if (!route) return false;
  const pathOnly = route[1].split('?')[0];
  return pathOnly
    .split('/')
    .some((seg) => /^\{[^}]+\}$/.test(seg) || /^\d+$/.test(seg) || /^[0-9a-fA-F-]{8,}$/.test(seg));
}

function annotate(source) {
  const src = source.split('\n');
  const out = [];
  let inTest = false;
  let sawApi = false;
  let lastStep = '';
  let lastStepIndent = '';
  let bodyIndent = '  ';
  let added = 0;
  let skippedNoInput = 0;

  const closeTest = () => {
    if (!inTest) return;
    // A test with no `api` step made no request to mutate, and one whose last request carries no
    // mutable input is a `TF067` the checker refuses before anything runs. Both are counted rather
    // than silently dropped — they are the measurement's declared bound.
    if (sawApi && !isMutable(lastStep)) skippedNoInput++;
    if (sawApi && isMutable(lastStep)) {
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      out.push(`${bodyIndent}${ASSERTION}`);
      // Restore the blank line the pop above consumed. Cosmetic, but the annotated tree is left on
      // disk to be read when a finding needs explaining, and a copy that runs the blocks together
      // is harder to compare against the original than it needs to be.
      out.push('');
      added++;
    }
    inTest = false;
    sawApi = false;
  };

  // `api inventory GET /warehouses` — §3.2's named-service form — is an `api` step too, and the
  // suite has a whole directory of them.
  const API_STEP = /^\s*api\s+(?:\w+\s+)?(?:GET|POST|PUT|PATCH|DELETE)\s/;

  for (const line of src) {
    const isTopLevel = line.trim() !== '' && !/^\s/.test(line);
    if (isTopLevel) closeTest();
    if (/^test\s+"/.test(line)) {
      inTest = true;
      sawApi = false;
      lastStep = '';
      bodyIndent = '  ';
    } else if (inTest) {
      if (API_STEP.test(line)) {
        sawApi = true;
        lastStep = line;
        lastStepIndent = (line.match(/^\s*/) ?? ['  '])[0];
        bodyIndent = lastStepIndent;
      } else if (
        lastStep &&
        line.trim() !== '' &&
        (line.match(/^\s*/) ?? [''])[0].length > lastStepIndent.length
      ) {
        // A continuation of the step above — `header "…" is "…"`, a wrapped body. It belongs to the
        // step for the purpose of asking whether that step has a mutable input.
        lastStep += '\n' + line;
      }
    }
    out.push(line);
  }
  closeTest();
  return { text: out.join('\n'), added, skippedNoInput };
}

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (entry.endsWith('.tflw')) found.push(full);
  }
  return found;
}

const files = walk(path.join(SWEEP, TARGET));
let assertionsAdded = 0;
let filesTouched = 0;
let outOfReach = 0;
for (const file of files) {
  const { text, added, skippedNoInput } = annotate(readFileSync(file, 'utf8'));
  outOfReach += skippedNoInput;
  if (added === 0) continue;
  writeFileSync(file, text);
  assertionsAdded += added;
  filesTouched++;
}

console.log(
  `\x1b[1mD380 — Tier 3 against the real suite\x1b[0m\n\n` +
    `  ${filesTouched} of ${files.length} file(s) under ${TARGET}/ carry an added assertion\n` +
    `  ${assertionsAdded} assertion(s), one per test whose final request has a mutable input\n` +
    `  ${outOfReach} test(s) skipped — final request carries nothing to mutate (checker refuses these, TF067)\n` +
    `  probe classes granted: ${PROBE_GRANTS.map((g) => g.split(' ')[1]).join(', ')}\n`,
);

// ── 3. run it ────────────────────────────────────────────────────────────────────────────────
console.log('  running… (strictly sequential probes, per D21 layer 5 — this takes a while)\n');
const started = Date.now();
// Explicit file arguments, not `TARGET`: tflw takes `.tflw` files and refuses a directory, and the
// no-argument form would sweep the whole copied tree — `.demo-fail/` and `.checkonly/` included,
// which are fixtures for other measurements and would corrupt this one.
const run = spawnSync(
  'node',
  [
    resolveTflw('released', { label: 'sweep-input-volume' }).entry,
    'run',
    '--env',
    'local',
    ...files.map((f) => path.relative(SWEEP, f)),
  ],
  { cwd: SWEEP, encoding: 'utf8', env: process.env, maxBuffer: 256 * 1024 * 1024 },
);
const elapsedMs = Date.now() - started;

const reportPath = path.join(SWEEP, 'report', 'results.json');
if (!existsSync(reportPath)) {
  console.error('✗ the run produced no report — tflw exited before writing one.\n');
  console.error((run.stderr || run.stdout || '').slice(-4000));
  process.exit(2);
}

// ── 4. read the volume and the findings back out ─────────────────────────────────────────────
const COUNTS = /(\d+) rules? — (\d+) applicable, (\d+) not applicable, (\d+) violations?/;
const MUTATIONS = /(\d+) sites?, (\d+) requests? sent, [\d.]+ per site — (\d+) answered/;
const VIOLATION = /^\s*- \[(critical|serious|moderate|minor)\] (sec\/[a-z0-9-]+): (.+)$/gm;

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const measured = [];
const findings = [];
let noPower = 0;

for (const test of report.tests ?? []) {
  for (const step of test.steps ?? []) {
    const detail = step.detail ?? '';
    if (!COUNTS.test(detail)) continue;
    const mut = detail.match(MUTATIONS);
    // An assertion that found no mutable input fails as `no power to fail` (D285) and sends
    // nothing. It is a real result — that request shape is outside Tier 3's reach — so it is
    // counted rather than dropped.
    if (!mut) {
      noPower++;
      continue;
    }
    measured.push({
      test: test.name,
      sites: Number(mut[1]),
      sent: Number(mut[2]),
      answered: Number(mut[3]),
    });
    VIOLATION.lastIndex = 0;
    let m;
    while ((m = VIOLATION.exec(detail)) !== null) {
      findings.push({ test: test.name, severity: m[1], rule: m[2], evidence: m[3] });
    }
  }
}

const totalSent = measured.reduce((a, r) => a + r.sent, 0);
const totalAnswered = measured.reduce((a, r) => a + r.answered, 0);
const totalSites = measured.reduce((a, r) => a + r.sites, 0);
const perRequest = measured.length ? totalSent / measured.length : 0;

console.log(`\n\x1b[1mVolume\x1b[0m\n`);
console.log(`  assertions that probed        ${measured.length}`);
console.log(
  `  reach over the suite          ${assertionsAdded}/${assertionsAdded + outOfReach} tests ` +
    `(${Math.round((100 * assertionsAdded) / (assertionsAdded + outOfReach))}%) — the rest carry ` +
    `nothing to mutate`,
);
console.log(`  assertions that sent nothing   ${noPower}`);
console.log(`  mutation sites reached        ${totalSites}`);
console.log(`  extra requests sent           ${totalSent}`);
console.log(`  answered                      ${totalAnswered}`);
console.log(`  mean per observed request     ${perRequest.toFixed(1)}`);
console.log(`  wall clock                    ${(elapsedMs / 1000).toFixed(0)}s (suite + probes)`);

// The extrapolation, stated as one because it is one. The measured figure covers each test's last
// observed request; the suite makes many more, and D377's gate is a decision about the whole of it.
const apiSteps = spawnSync(
  'bash',
  ['-c', `grep -rhE '^[[:space:]]*api[[:space:]]+(GET|POST|PUT|PATCH|DELETE)' ${TARGET} --include='*.tflw' | wc -l`],
  { cwd: ROOT, encoding: 'utf8' },
).stdout.trim();
console.log(
  `\n  ${TARGET}/ makes ${apiSteps} observed requests in total. At ${perRequest.toFixed(1)} probes each,\n` +
    `  an assertion on every one of them would cost ~${Math.round(Number(apiSteps) * perRequest).toLocaleString()} extra requests.\n` +
    `  That is an extrapolation from the ${measured.length} measured above, not a second measurement.`,
);

// ── 5. the quietness answer ──────────────────────────────────────────────────────────────────
console.log(`\n\x1b[1mFindings against real endpoints\x1b[0m\n`);
if (findings.length === 0) {
  console.log(
    `  \x1b[32mnone\x1b[0m — ${measured.length} assertions, ${totalSent} probes, zero violations.\n` +
      `  The oracle is quiet against a correct application, which is the half of D380 that is\n` +
      `  about the pack rather than about the cost.`,
  );
} else {
  console.log(
    `  \x1b[33m${findings.length}\x1b[0m — each is against a REAL endpoint, so each is either a false positive in\n` +
      `  the pack or a genuine defect in apiV2. Neither is a passing result; both need a row.\n`,
  );
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.rule}`);
    console.log(`    in: ${f.test}`);
    console.log(`    ${f.evidence}`);
  }
}

console.log(
  `\n  the annotated copy is left at .sweep-input/ for inspection; it is gitignored and\n` +
    `  regenerated from scratch on every run. Nothing under tests/ was modified.\n`,
);

process.exit(findings.length === 0 ? 0 : 1);
