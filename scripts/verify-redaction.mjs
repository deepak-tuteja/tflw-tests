#!/usr/bin/env node
// PLAN_CI.md decision 7: proves tflw's `redact` config actually keeps real PII out of the
// emitted artifacts — not just that safety-redaction.tflw's own assertions pass. Those assertions
// always see the true, unmasked value by design; a report-artifact inspection is the only way to
// actually prove masking happened, which is why this doesn't belong in the DSL itself (see
// PLAN_CI.md "Why this got big").
//
// Ground truth comes from a direct fetch against the real api (bypassing tflw entirely), so this
// script never trusts tflw's own redaction to tell it what the real values were.
//
// Scope: `redact` (SPEC §3.5) applies to the request/response trace (`redactRequest`/
// `redactResponse`) *and*, since gap #15 was fixed upstream (tflw 0.1.0, 2026-07-26), to a plain
// `capture`/`expect`/`check` step's own printed `detail` text when its subject is redact-covered.
// The leak-check below walks every step's `request.body`/`response.bodyText`/`detail` fields — the
// full set `redact` now promises to cover. Quantified (`any`/`all`) assertions are a documented,
// deliberate exception (upstream SPEC §3.5) — this suite doesn't quantify over a redacted path, so
// there's nothing to carve out here.
//
// ## `M154g` — `M154f-03`'s rule, carried here
//
// `M154f-03` found `verify-construct-acceptance.mjs` printing a summary that asserted a property of
// seven plants no assertion in the file touched, and — the half that mattered — an empty tally
// moving no counter, so a plant that graded nothing exited 0. The general form is *a gate is a
// claim, and a claim needs its own gate*, and the plan named this script as the next place to carry
// it rather than the next place to rediscover it.
//
// It was carried and it found the same shape here, statically, before the stack was ever started:
//
//   * **The ground-truth set could shrink silently.** `piiValues` skipped any value the profile
//     endpoint stopped returning (`if (value && ...)`), so a renamed field removed a needle from the
//     search and the closing line went on claiming all five were masked. Now a missing or
//     implausibly short value is a violation, not a skip.
//   * **One of the three field kinds was never present at all.** This script walks `request.body`,
//     `response.bodyText` and `detail`, and closed by claiming "the request/response trace" was
//     clean — but the corpus was three `GET`s, so **no step in any run carried a `request.body`**
//     and a third of the named surface was asserted over an empty set. Measured against an archived
//     full-suite artifact (4809 steps, 932 `request.body` fields) versus this file's own 16 steps
//     (zero). `safety-redaction.tflw` now sends one, and the guard below fails if it stops.
//   * **The roster's citation ran one way.** `constructs.mjs` names this script as `C55`'s grader
//     and nothing in this script named `C55` back, so a rename would have orphaned the claim
//     silently. `D752`'s both-directions check, one gate over.
//
// ## `--self-test`
//
// The positive path needs apiV2 running; the guards do not. `--self-test` drives the pure cores
// below with synthetic fixtures and asserts each guard fires on the input it exists for — including
// the exact `request.body`-shaped hole that was live here until today. `M154f`'s own lesson was
// *write the failing case before believing the passing one*, and a negative test that lives in the
// file runs on every machine forever instead of once, in a scratch copy, in a plan note.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tflwCommand } from './lib/tflw-bin.mjs';
import { GRADERS, plantsFor } from './lib/constructs.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SELF_PATH = 'scripts/verify-redaction.mjs';
const SELF_TEST = process.argv.includes('--self-test');

let violations = 0;
const fail = (msg) => { console.error(`✗ ${msg}`); violations += 1; };
const pass = (msg) => console.log(`✓ ${msg}`);

// =============================================================================
// the pure cores — everything `--self-test` can drive without a stack
// =============================================================================

/** The construct rows this script claims to grade, stated rather than derived. Deriving it from the
 *  roster would make the cross-check below a tautology: the point is that two independently written
 *  lists agree, which is `D752` exactly. */
const CONSTRUCTS_GRADED_HERE = ['config:key:redact'];

/** Which five values are ground truth, and how each is read out of the profile export. Named
 *  explicitly so a field the endpoint renames goes red here rather than quietly leaving the set. */
const PII_FIELDS = [
  { name: 'ADMIN_EMAIL', from: (env) => env.ADMIN_EMAIL },
  { name: 'phone', from: (_env, p) => p?.phone },
  { name: 'address.street', from: (_env, p) => p?.address?.street },
  { name: 'address.city', from: (_env, p) => p?.address?.city },
  { name: 'address.postalCode', from: (_env, p) => p?.address?.postalCode },
];

/** A needle shorter than this is not evidence: a two-character "city" would match somewhere in
 *  every artifact and turn the leak check red for a reason that has nothing to do with redaction.
 *  Short enough that a real four-letter city name still counts. */
const MIN_NEEDLE = 3;

/** The three fields `redact` promises to cover, and the three this script walks. Kept as one list
 *  because the coverage guard and the scan must never disagree about what "the trace" means. */
const FIELD_KINDS = ['request.body', 'response.bodyText', 'detail'];

export function groundTruth(env, profile) {
  const values = [];
  const problems = [];
  for (const field of PII_FIELDS) {
    const value = field.from(env, profile);
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(
        `ground truth is incomplete: ${field.name} is ${value === undefined ? 'absent' : JSON.stringify(value)}. ` +
          'A value that cannot be read is a needle that leaves the search — the leak check below would then pass ' +
          'over four values and the closing line would still claim five. Fix the fixture or the field name; do not skip it.',
      );
      continue;
    }
    if (value.trim().length < MIN_NEEDLE) {
      problems.push(
        `ground truth is unusable: ${field.name} is ${JSON.stringify(value)}, shorter than ${MIN_NEEDLE} characters. ` +
          'A needle that short matches by accident and proves nothing either way.',
      );
      continue;
    }
    values.push({ name: field.name, value });
  }
  return { values, problems };
}

export function scanReport(report, piiValues) {
  const leaks = [];
  const seen = Object.fromEntries(FIELD_KINDS.map((k) => [k, 0]));
  const masked = Object.fromEntries(FIELD_KINDS.map((k) => [k, 0]));
  let tests = 0;
  let steps = 0;
  for (const test of report?.tests ?? []) {
    tests += 1;
    for (const step of test?.steps ?? []) {
      steps += 1;
      const fields = [
        ['request.body', step.request?.body],
        ['response.bodyText', step.response?.bodyText],
        ['detail', step.detail],
      ];
      for (const [fieldName, text] of fields) {
        if (typeof text !== 'string') continue;
        seen[fieldName] += 1;
        if (text.includes('[redacted]')) masked[fieldName] += 1;
        for (const { name, value } of piiValues) {
          if (text.includes(value)) leaks.push({ test: test.name, field: fieldName, name, value });
        }
      }
    }
  }
  return { leaks, seen, masked, tests, steps };
}

/** The empty-tally rule itself. Every claim the closing line makes has to have had something to be
 *  made *about*; this returns the ways it did not. */
export function vacuityProblems(scan, piiValues) {
  const problems = [];
  if (piiValues.length !== PII_FIELDS.length) {
    problems.push(
      `the leak check ran against ${piiValues.length} of ${PII_FIELDS.length} ground-truth values — ` +
        'a partial search cannot support a claim about the whole set.',
    );
  }
  if (scan.tests === 0 || scan.steps === 0) {
    problems.push(
      `the report carries ${scan.tests} test(s) and ${scan.steps} step(s) — there was nothing to scan, ` +
        'so "no PII leaked" is true of an empty set and says nothing about redaction.',
    );
  }
  for (const kind of FIELD_KINDS) {
    if (scan.seen[kind] === 0) {
      problems.push(
        `no step in this run carried a \`${kind}\` field, and this script claims to cover it. ` +
          'A third of the surface asserted over an empty set is the defect `M154g` opened this file to fix ' +
          '(the corpus was three `GET`s and no request body existed anywhere) — restore the corpus case that ' +
          'produces one, or stop naming this field in the claim.',
      );
    }
  }
  if (scan.seen['request.body'] > 0 && scan.masked['request.body'] === 0) {
    problems.push(
      'request bodies were recorded and not one of them carries a `[redacted]` marker. ' +
        'The response side proving redaction fired says nothing about `redactRequest`, which is the arm ' +
        'that had no corpus case at all — an unmasked-but-not-leaking request body means the covered field ' +
        'never reached it, and the case is back to proving nothing.',
    );
  }
  return problems;
}

/** `D752`'s shape, one gate over: the roster names this script, and this script names the roster
 *  back. Either direction alone is a citation; only both together are an assertion. */
export function rosterProblems(rostered, declared, graderEntry, selfPath) {
  const problems = [];
  const declaredSet = new Set(declared);
  const rosteredSet = new Set(rostered.map((p) => p.construct));
  for (const plant of rostered) {
    if (!declaredSet.has(plant.construct)) {
      problems.push(
        `${plant.id} rosters \`${plant.construct}\` against this script and this script does not claim to grade it. ` +
          'Add it to `CONSTRUCTS_GRADED_HERE` with the assertions that answer it, or move the row to the grader that does.',
      );
    }
  }
  for (const id of declared) {
    if (!rosteredSet.has(id)) {
      problems.push(
        `this script claims to grade \`${id}\` and no plant in \`constructs.mjs\` rosters it here — ` +
          'the claim is unindexed, which is how a construct silently gets graded twice or not at all.',
      );
    }
  }
  if (graderEntry?.script !== selfPath) {
    problems.push(
      `\`GRADERS.redaction.script\` is ${JSON.stringify(graderEntry?.script)} and this file is ${JSON.stringify(selfPath)} — ` +
        'the roster points at a different file, so its rows are graded by something other than what runs here.',
    );
  }
  return problems;
}

// =============================================================================
// --self-test — the negative cases, no stack required
// =============================================================================

if (SELF_TEST) {
  let failedCases = 0;
  const CLEAN_ENV = { ADMIN_EMAIL: 'admin@example.com' };
  const CLEAN_PROFILE = {
    phone: '+1-555-867-5309',
    address: { street: '221 Maple Ave', city: 'Springfield', postalCode: '10115' },
  };
  const step = (over) => ({ request: { body: 'x' }, response: { bodyText: 'y' }, detail: 'z', ...over });
  const cleanReport = {
    tests: [{
      name: 't',
      steps: [
        { request: { body: '{"email":"[redacted]"}' }, response: { bodyText: '{"phone":"[redacted]"}' }, detail: 'ok' },
      ],
    }],
  };

  const expectCase = (label, got, want) => {
    const hit = got.some((p) => p.includes(want));
    if (hit) pass(`self-test: ${label}`);
    else { console.error(`✗ self-test: ${label} — no problem mentioned ${JSON.stringify(want)}; got ${JSON.stringify(got)}`); failedCases += 1; }
  };
  const expectClean = (label, got) => {
    if (got.length === 0) pass(`self-test: ${label}`);
    else { console.error(`✗ self-test: ${label} — expected no problems, got ${JSON.stringify(got)}`); failedCases += 1; }
  };

  // The control. Without it every case below would pass against a core that always complains.
  const clean = groundTruth(CLEAN_ENV, CLEAN_PROFILE);
  expectClean('a complete profile yields five needles and no complaint', clean.problems);
  if (clean.values.length !== PII_FIELDS.length) { console.error(`✗ self-test: control produced ${clean.values.length} needles, expected ${PII_FIELDS.length}`); failedCases += 1; }
  expectClean('a masked report with all three field kinds is not vacuous', vacuityProblems(scanReport(cleanReport, clean.values), clean.values));

  expectCase('a renamed profile field is a violation, not a silent skip',
    groundTruth(CLEAN_ENV, { ...CLEAN_PROFILE, phone: undefined }).problems, 'phone is absent');
  expectCase('an empty ground-truth value is refused',
    groundTruth({ ADMIN_EMAIL: '' }, CLEAN_PROFILE).problems, 'ADMIN_EMAIL');
  expectCase('a needle too short to mean anything is refused',
    groundTruth(CLEAN_ENV, { ...CLEAN_PROFILE, address: { ...CLEAN_PROFILE.address, city: 'X' } }).problems, 'shorter than');

  expectCase('an empty report is vacuous, not clean',
    vacuityProblems(scanReport({ tests: [] }, clean.values), clean.values), 'nothing to scan');
  // The exact hole this milestone found live: `detail` everywhere, no request body anywhere.
  expectCase('a run with no request body at all is refused — the live defect, kept as a case',
    vacuityProblems(scanReport({ tests: [{ name: 't', steps: [{ response: { bodyText: '[redacted]' }, detail: 'd' }] }] }, clean.values), clean.values),
    'no step in this run carried a `request.body` field');
  expectCase('a request body that never shows a marker is refused',
    vacuityProblems(scanReport({ tests: [{ name: 't', steps: [step({ request: { body: 'nothing masked here' } })] }] }, clean.values), clean.values),
    '`[redacted]` marker');
  expectCase('a partial ground-truth set cannot support the whole claim',
    vacuityProblems(scanReport(cleanReport, clean.values.slice(1)), clean.values.slice(1)), 'of 5 ground-truth values');

  const leaked = scanReport({ tests: [{ name: 't', steps: [step({ detail: `phone is ${CLEAN_PROFILE.phone}` })] }] }, clean.values);
  if (leaked.leaks.some((l) => l.name === 'phone' && l.field === 'detail')) pass('self-test: a real value in a step `detail` is found');
  else { console.error(`✗ self-test: the detail leak was not found; got ${JSON.stringify(leaked.leaks)}`); failedCases += 1; }

  expectCase('a roster row this script does not claim is a violation',
    rosterProblems([{ id: 'C99', construct: 'config:key:invented' }], CONSTRUCTS_GRADED_HERE, GRADERS.redaction, SELF_PATH), 'C99');
  expectCase('a claim no roster row names is a violation',
    rosterProblems([], CONSTRUCTS_GRADED_HERE, GRADERS.redaction, SELF_PATH), 'unindexed');
  expectCase('a roster pointing at another file is a violation',
    rosterProblems(plantsFor('redaction'), CONSTRUCTS_GRADED_HERE, { script: 'scripts/somewhere-else.mjs' }, SELF_PATH), 'points at a different file');
  expectClean('the real roster resolves both ways',
    rosterProblems(plantsFor('redaction'), CONSTRUCTS_GRADED_HERE, GRADERS.redaction, SELF_PATH));

  console.log(failedCases === 0
    ? `\n✓ self-test: every guard fires on the input it exists for, and none fires on the control.`
    : `\n✗ self-test: ${failedCases} guard(s) did not behave as documented.`);
  process.exit(failedCases === 0 ? 0 : 1);
}

// =============================================================================
// the real run
// =============================================================================

/** `released`: this script grades the tflw a user would have installed, which is what
 *  `npx tflw` resolved here before M141 — the program is unchanged, the question is now
 *  declared and the entry is printed instead of inferred. */
const TFLW = tflwCommand('released', { label: 'verify-redaction' });

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

// The roster cross-check runs first: it costs nothing, needs no stack, and a script grading a row
// nobody rosters should say so before it spends four minutes proving it.
for (const problem of rosterProblems(plantsFor('redaction'), CONSTRUCTS_GRADED_HERE, GRADERS.redaction, SELF_PATH)) fail(problem);
if (violations === 0) {
  pass(`the roster resolves both ways: ${plantsFor('redaction').map((p) => p.id).join(', ')} <-> ${CONSTRUCTS_GRADED_HERE.join(', ')}`);
}

const env = loadEnv(path.join(ROOT, '.env'));

console.log('Running tests/api/identity/safety-redaction.tflw ...');
execSync(`${TFLW} run --env safetyRedaction tests/api/identity/safety-redaction.tflw`, { cwd: ROOT, stdio: 'inherit' });

console.log('Fetching real, unredacted PII directly from the api as ground truth ...');
const loginRes = await fetch('http://localhost:4001/v1/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PW }),
});
if (!loginRes.ok) {
  console.error(`ground-truth login failed: ${loginRes.status}`);
  process.exit(1);
}
const { accessToken } = await loginRes.json();

const profileRes = await fetch('http://localhost:4001/v1/profile/export', {
  headers: { authorization: `Bearer ${accessToken}` },
});
if (!profileRes.ok) {
  console.error(`ground-truth /profile/export failed: ${profileRes.status}`);
  process.exit(1);
}
const profile = await profileRes.json();

const { values: piiValues, problems: groundTruthProblems } = groundTruth(env, profile);
for (const problem of groundTruthProblems) fail(problem);

const reportDir = path.join(ROOT, 'report');
const report = JSON.parse(readFileSync(path.join(reportDir, 'results.json'), 'utf8'));

const scan = scanReport(report, piiValues);
for (const leak of scan.leaks) {
  fail(`"${leak.test}" step ${leak.field} leaks real PII (${leak.name}): "${leak.value}"`);
}
for (const problem of vacuityProblems(scan, piiValues)) fail(problem);

// A `redact` pattern that never actually matched anything would pass the leak check above
// vacuously (nothing to leak if nothing was ever there) without proving redaction fired at all —
// checked in results.json and report.html, the two artifacts that actually carry request/response
// body content. junit.xml deliberately excluded: for a passing test it never carries body content
// at all (only `<system-out>`, and only on failure) — there is nothing there to redact either way.
for (const file of ['results.json', 'report.html']) {
  const content = readFileSync(path.join(reportDir, file), 'utf8');
  const maskedCount = (content.match(/\[redacted\]/g) ?? []).length;
  if (maskedCount === 0) fail(`${file} has zero [redacted] markers — redaction never fired`);
  else pass(`${file} has ${maskedCount} [redacted] marker(s)`);
}

if (violations > 0) {
  console.error(`\n${violations} redaction violation(s).`);
  process.exit(1);
}

// `D722`, applied to this gate's own report: the line counts what it actually searched, so a run
// that searched less than it claims cannot read as a run that searched everything.
console.log(
  `\nAll ${piiValues.length} ground-truth value(s) masked across ${scan.steps} step(s) in ${scan.tests} test(s) — ` +
    `${FIELD_KINDS.map((k) => `${k} ${scan.seen[k]} scanned/${scan.masked[k]} masked`).join(', ')}. ` +
    'No real value reached results.json.',
);
