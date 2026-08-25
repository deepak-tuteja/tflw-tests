#!/usr/bin/env node
// `npm run verify:construct-acceptance` — the plants themselves, graded against their known answers.
//
// `M154b`, testFlow `PLAN_M154_DOGFOOD_CONFORMANCE.md` (`D722`, `D726`, `D734`). Sibling of
// `scripts/verify-security-acceptance.mjs`, whose per-plant precision/recall shape this mirrors —
// and of `scripts/verify-construct-coverage.mjs`, which is the static half.
//
// ## The division of labour, and why it is two scripts
//
// `verify-construct-coverage.mjs` asks *is every construct tflw ships accounted for* — a set
// comparison against `tflw spec --json`, seconds, no stack, every PR. This asks the question that
// set comparison cannot: **does each plant still produce the answer its row claims?** A roster row
// whose plant has quietly stopped discriminating is worse than no row, because it reads as evidence.
//
// That needs a Docker stack, a browser and a load generator, so it lives in the regression sweep.
// Same split, same reasons, as `verify-security-target.mjs` (does the target still answer this way?)
// against `verify-security-acceptance.mjs` (did the run report say so?).
//
// ## Precision and recall, for a construct rather than a rule
//
// The security ledger grades a rule pack: recall is *everything that should have fired, did*, and
// precision is *nothing fired that should not have*. Transposed onto a construct plant:
//
//   recall     the plant produced every part of its known answer — all six `check` rows, both
//              arrival counts, the one-shot state
//   precision  it produced *nothing else* — exactly two failures and not three, exactly the two
//              named subjects and not two others, exactly 60 arrivals on the two declared paths and
//              none anywhere else
//
// Precision is the half that is easy to skip and it is the half that catches the interesting
// failures. A `check` implementation that failed all six rows has perfect recall on "two failures
// were reported" if you only count that the test went red.
//
// ## `--gate`
//
// Assert-only, and the exit status regression.mjs's `construct-acceptance` phase means. The same
// split `M139-5`/`D493` made in the security grader, for the same reason: a script that both
// asserts and reports has one exit status for two jobs.

import { readFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveTflw } from './lib/tflw-bin.mjs';
import { readSpec, siblingState, gradeProvenance, announceProvenance, stalenessBanner } from './lib/tflw-provenance.mjs';
import { PLANTS, plantFor } from './lib/constructs.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GATE = process.argv.includes('--gate');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx === -1 ? null : new Set(process.argv[onlyIdx + 1].split(','));

const { entry: TFLW_BIN } = resolveTflw('released', { label: 'construct-acceptance' });
const PROVENANCE = gradeProvenance(readSpec(TFLW_BIN).build, siblingState());
announceProvenance('construct-acceptance', PROVENANCE);

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

/** Per-plant tally, so the closing table can say which half of the bar each row met. */
const scores = new Map(PLANTS.map((p) => [p.id, { recall: [], precision: [], skipped: null }]));
const recall = (id, okness, msg) => {
  scores.get(id).recall.push(okness);
  okness ? ok(msg) : fail(`${id} recall — ${msg}`);
};
const precision = (id, okness, msg) => {
  scores.get(id).precision.push(okness);
  okness ? ok(msg) : fail(`${id} precision — ${msg}`);
};

/**
 * Run a corpus and return its report.
 *
 * The report is **deleted before every run, not merely overwritten**. A `tflw run` that dies before
 * writing one — a parse error, a missing `require env` — leaves the previous run's `results.json`
 * in place, and a grader then reads one plant's answer out of another plant's report and prints a
 * confident list of meaningless mismatches. `verify-security-acceptance.mjs` learned that the
 * expensive way and its comment says so; this is the same guard, not a new idea.
 */
function runCorpus(cwd, args) {
  const reportFile = path.join(cwd, 'report', 'results.json');
  rmSync(reportFile, { force: true });
  const r = spawnSync(process.execPath, [TFLW_BIN, 'run', '--no-color', ...args], {
    cwd,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (!existsSync(reportFile)) {
    return { report: null, output };
  }
  return { report: JSON.parse(readFileSync(reportFile, 'utf8')), output };
}

const wanted = (id) => (ONLY === null || ONLY.has(id));

// =============================================================================
// C1 — `check`: the soft assertion records a failure and keeps going
// =============================================================================

if (wanted('C1')) {
  const plant = plantFor('step:check');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  if (!report) {
    fail(`${plant.id} produced no report. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C1').skipped = 'no report';
  } else {
    const test = report.tests.find((t) => t.kind === 'functional');
    if (!test) {
      fail(`${plant.id} — the report has no functional test in it`);
    } else {
      const checks = (test.steps ?? []).filter((s) => s.kind === 'check');
      const failed = checks.filter((s) => !s.ok);
      const last = (test.steps ?? []).at(-1);

      // Recall: every row the plant wrote is present. This is the assertion that separates "check
      // records and continues" from "check fails fast" — the latter produces four rows, not six,
      // and both runs exit non-zero with a FAIL summary that reads identically.
      recall('C1', checks.length === 6, `six \`check\` rows in the report (got ${checks.length}) — a fail-fast \`check\` would stop at the fifth`);
      recall('C1', failed.length === 2, `exactly two of them failed (got ${failed.length})`);
      recall(
        'C1',
        last?.kind === 'expect' && last.ok === true,
        `the \`expect\` after the failing checks ran and passed (got ${last ? `${last.kind}, ok=${last.ok}` : 'no steps'}) — this is the "and keeps going" half of the contract`,
      );
      recall('C1', test.ok === false, `the test's own verdict is FAIL (got ok=${test.ok}) — a \`check\` that recorded nothing would pass here, which is the silent direction`);

      // Precision: the right two, by name. A count alone is satisfied by an implementation that
      // failed the wrong two, and that is a real failure mode for a matcher, not a hypothetical one.
      const subjects = failed.map((s) => s.source.replace(/^\s*check\s+/, '').split(/\s+/)[0]).sort();
      precision(
        'C1',
        JSON.stringify(subjects) === JSON.stringify(['body.currency', 'body.falsy']),
        `the two failures are \`body.currency\` and \`body.falsy\` (got ${subjects.join(', ') || 'none'})`,
      );
      const nonCheckFailures = (test.steps ?? []).filter((s) => s.kind !== 'check' && !s.ok);
      precision('C1', nonCheckFailures.length === 0, `nothing outside the \`check\` rows failed (got ${nonCheckFailures.map((s) => s.source).join('; ') || 'none'})`);
    }
  }
}

// =============================================================================
// C2 — `accept dialog`: armed, and one-shot
// =============================================================================

if (wanted('C2')) {
  const plant = plantFor('step:accept');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, ['--env', 'webv2Admin', plant.evidence.file]);
  if (!report) {
    fail(`${plant.id} produced no report. Needs the stack, the admin console on :8091 and a browser.\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C2').skipped = 'no report';
  } else {
    const test = report.tests.find((t) => t.kind === 'functional');
    const steps = test?.steps ?? [];
    const hasStep = (needle) => steps.some((s) => s.source.includes(needle) && s.ok);

    // Recall: **both** states of the same click ran and held. Naming them individually rather than
    // asserting `test.ok` is the point — the control and the plant are only meaningful as a pair,
    // and a rewrite that dropped either would leave a green test that no longer tells an armed
    // handler from an unarmed one. `test.ok` cannot see that difference; the static gate counts the
    // armings but not what they were for.
    // The closing bracket is load-bearing: `[data-state='cancelled']` is not a substring of
    // `[data-state='cancelled-final']`, so the control cannot be satisfied by the plant's own step.
    recall('C2', hasStep("[data-state='cancelled']"), 'the control held — nothing armed, first confirm dismissed by default');
    recall('C2', hasStep("data-state='cancelled-final'"), 'the one-shot state held — dialog 1 accepted by the armed handler, dialog 2 dismissed by default');
    recall('C2', steps.filter((s) => s.source.includes('#bulk-delete-state')).length >= 3, 'all three state assertions are still in the plant (idle, cancelled, cancelled-final) — the contrast is what carries the claim');
    recall('C2', test?.ok === true, `the plant passed (got ok=${test?.ok})`);

    const failedSteps = steps.filter((s) => !s.ok);
    precision('C2', failedSteps.length === 0, `no step failed (got ${failedSteps.map((s) => `line ${s.line}: ${s.source}`).join('; ') || 'none'})`);
  }
}

// =============================================================================
// C3 — `run N iterations`: the count is exact, and independent of `--workers`
// =============================================================================

/** Start `arrival-server.mjs` and resolve when it says it is listening.
 *
 *  Waits for the line rather than sleeping. A fixed sleep is a race that passes on this laptop and
 *  fails on `fedora-box` under a forge render — and it fails as "0 arrivals", which reads exactly
 *  like the tflw defect this plant exists to detect. An instrument whose flake is indistinguishable
 *  from its finding is worse than no instrument. */
function startArrivalServer(cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['arrival-server.mjs'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('arrival-server did not report listening within 10s')), 10_000);
    proc.stdout.on('data', (b) => {
      if (b.toString().includes('listening')) {
        clearTimeout(timer);
        resolve(proc);
      }
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`arrival-server exited with ${code} before listening — is port 4507 already taken?`)); });
  });
}

const arrivals = async (verb) => JSON.parse(await (await fetch(`http://127.0.0.1:4507/${verb}`)).text());

if (wanted('C3')) {
  const plant = plantFor('step:run');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const corpus = path.join(ROOT, 'tflw-acceptance', 'conformance');
  let server = null;
  try {
    server = await startArrivalServer(corpus);

    /** The known answer, and the *only* paths the plant may touch. Written as data so the precision
     *  half can assert the complement — a generator that also hit `/` or retried onto a third path
     *  would satisfy every count above and still be wrong. */
    const EXPECTED = { '/shared': 60, '/per-user': 60 };

    // Twice, and the second time is the whole point: `tflw spec` says the count is *"exact and
    // independent of `--workers`"*. That is a claim tflw makes about itself in its own manifest, and
    // nothing has ever checked it. One worker and four are the two ends that matter — a
    // per-worker-divided count would show up immediately, and a per-worker-multiplied one too.
    const byWorkers = {};
    for (const workers of [1, 4]) {
      await arrivals('__reset');
      const { report, output } = runCorpus(corpus, ['--workers', String(workers), 'iterations.tflw']);
      const observed = await arrivals('__arrivals');
      byWorkers[workers] = observed;
      if (!report) {
        fail(`${plant.id} — no report at --workers ${workers}\n${output.trim().split('\n').slice(-10).join('\n')}`);
        continue;
      }
      for (const [p, want] of Object.entries(EXPECTED)) {
        const got = observed.byPath[p] ?? 0;
        recall('C3', got === want, `--workers ${workers}: ${p} received exactly ${want} request(s) (got ${got}) — counted by the server, not by tflw`);
      }
      const stray = Object.entries(observed.byPath).filter(([p]) => !(p in EXPECTED));
      precision('C3', stray.length === 0, `--workers ${workers}: no request landed anywhere but the two declared paths (stray: ${stray.map(([p, n]) => `${p}×${n}`).join(', ') || 'none'})`);
      // The generator's own account, checked against the server's — not as the bar, but because a
      // disagreement between them is a different and more interesting defect than either number
      // being wrong on its own.
      const reported = report.tests.reduce((n, t) => n + (t.metrics?.iterations ?? 0), 0);
      const landed = Object.values(observed.byPath).reduce((a, b) => a + b, 0);
      precision('C3', reported === landed, `--workers ${workers}: tflw reported ${reported} iteration(s) and ${landed} request(s) arrived — the report and the physics agree`);
    }
    const same = JSON.stringify(byWorkers[1]?.byPath) === JSON.stringify(byWorkers[4]?.byPath);
    recall('C3', same, `the counts are identical at --workers 1 and --workers 4 — the "independent of \`--workers\`" half of the contract \`tflw spec\` states`);
  } catch (e) {
    fail(`${plant.id} could not run: ${e.message}`);
    scores.get('C3').skipped = e.message;
  } finally {
    server?.kill();
  }
}

// =============================================================================
// C4, C5 — the run lifecycle: what a retried test actually did, and whether teardown ran
// =============================================================================
//
// **Order matters here, and it is the one sharp edge in this file.** Both plants reset
// `/v1/lifecycle/*` in their `before file`, because both use fixed counter names. So each run's
// counts must be read back BEFORE the next plant runs, not collected at the end — a batch read
// would show C5's numbers under C4's name and produce a confident, meaningless mismatch. Same
// family of mistake as the stale-report guard in `runCorpus` above, one layer out.

const LIFECYCLE_COUNTS = 'http://localhost:4001/v1/lifecycle/counts';

/** Read the server's own record of what happened. Returns null (rather than throwing) so a stack
 *  that is down is reported as a skip against the plant, not as a crash in the grader. */
async function lifecycleCounts() {
  try {
    const r = await fetch(LIFECYCLE_COUNTS);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

const functionalTests = (report) => (report?.tests ?? []).filter((t) => t.kind === 'functional');
/** Find one test by a distinctive fragment of its name.
 *
 *  Positional indexing would have been shorter and is a latent flake: `tflw run` may execute a
 *  file's tests across workers, and a report ordered by completion rather than by declaration would
 *  silently swap `tests[0]` and `tests[1]` — turning "the failing test failed" into a real-looking
 *  red on a green build. Every plant below names the test it means. */
const named = (report, fragment) => functionalTests(report).find((t) => (t.name ?? '').includes(fragment));
/** The steps of one test, flattened — a retried test carries `attempts[]`, and its top-level
 *  `steps` is the last attempt's (SPEC §4.4). */
const stepsOf = (test) => test?.steps ?? [];
const failingSteps = (test) => stepsOf(test).filter((s) => !s.ok);

if (wanted('C4')) {
  const plant = plantFor('declaration:retry');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  const counts = await lifecycleCounts();
  if (!report || !counts) {
    fail(`${plant.id} produced no ${report ? 'lifecycle counts' : 'report'}. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C4').skipped = report ? 'no lifecycle counts' : 'no report';
  } else {
    const tests = functionalTests(report);
    const settled = named(report, 'the third one settles');
    const exhausted = named(report, 'even when a fourth would have settled');

    // Recall — the server's own arithmetic. Every one of these is a number tflw's report cannot be
    // the source of, which is `D726`'s formulation carried over from the workload shapes.
    recall('C4', counts.attempts?.['c4-settles'] === 3, `\`c4-settles\` was attempted exactly 3 times (got ${counts.attempts?.['c4-settles'] ?? 0}) — \`retry 2\` is three attempts, not two`);
    recall('C4', counts.attempts?.['c4-exhausts'] === 3, `\`c4-exhausts\` was attempted exactly 3 times (got ${counts.attempts?.['c4-exhausts'] ?? 0}) — the budget stopped it one short of the answer it wanted`);
    recall('C4', counts.marks?.['c4-preamble'] === 3, `the pre-failure step ran 3 times (got ${counts.marks?.['c4-preamble'] ?? 0}) — the WHOLE test re-ran, not just the step that failed`);
    recall('C4', settled?.ok === true, `the in-budget test passed (got ok=${settled?.ok})`);
    recall('C4', settled?.flaky === true, `and is reported \`flaky\` rather than silently green (got flaky=${settled?.flaky ?? false}) — SPEC §4.4`);
    recall('C4', exhausted?.ok === false, `the past-budget test ended red (got ok=${exhausted?.ok}) — a retry that ignored its budget would have passed here`);

    // Precision — nothing else happened. A retry that also re-issued the `before file` reset, or
    // that attempted a third key, satisfies every count above.
    const strayKeys = Object.keys(counts.attempts ?? {}).filter((k) => k !== 'c4-settles' && k !== 'c4-exhausts');
    precision('C4', strayKeys.length === 0, `no key was attempted beyond the two the plant declares (stray: ${strayKeys.join(', ') || 'none'})`);
    const strayMarks = Object.keys(counts.marks ?? {}).filter((k) => k !== 'c4-preamble');
    precision('C4', strayMarks.length === 0, `no label was marked beyond \`c4-preamble\` (stray: ${strayMarks.join(', ') || 'none'})`);
    precision('C4', tests.length === 2, `the plant is exactly two tests (got ${tests.length})`);
    // tflw's own account against the server's. Not the bar — a disagreement between them is a
    // different and more interesting defect than either number being wrong alone.
    precision('C4', (settled?.attempts?.length ?? 1) === 3, `tflw reports 3 attempts for the in-budget test (got ${settled?.attempts?.length ?? 1}) — the report and the arrivals agree`);
    precision('C4', (exhausted?.attempts?.length ?? 1) === 3, `tflw reports 3 attempts for the past-budget test (got ${exhausted?.attempts?.length ?? 1})`);
  }
}

if (wanted('C5')) {
  const plant = plantFor('declaration:after');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  const counts = await lifecycleCounts();
  if (!report || !counts) {
    fail(`${plant.id} produced no ${report ? 'lifecycle counts' : 'report'}.\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C5').skipped = report ? 'no lifecycle counts' : 'no report';
  } else {
    const tests = functionalTests(report);
    const fileMarks = counts.marks?.['c5-after-file'] ?? 0;
    const testMarks = counts.marks?.['c5-after-test'] ?? 0;

    // Two integers, three defects. 0 is a hook that never ran; `c5-after-test` at 1 is a hook that
    // skipped the failed test; `c5-after-file` at 2 is the file scope collapsed into the test scope.
    recall('C5', fileMarks === 1, `\`after file\` ran exactly once for the file (got ${fileMarks}) — 2 would mean the file scope is really the test scope`);
    recall('C5', testMarks === 2, `\`after\` ran once per test, both of them (got ${testMarks}) — 1 would mean it skipped the test that failed, which is the half nothing had ever observed`);
    const passing = named(report, 'the passing test');
    const failing = named(report, 'the failing test');
    recall('C5', passing?.ok === true, `the passing test passed (got ok=${passing?.ok})`);
    recall('C5', failing?.ok === false, `the failing test failed (got ok=${failing?.ok}) — without a red test, \`after\`'s "whether it passed or failed" clause is unasserted`);

    const strayMarks = Object.keys(counts.marks ?? {}).filter((k) => k !== 'c5-after-file' && k !== 'c5-after-test');
    precision('C5', strayMarks.length === 0, `no label was marked beyond the two hooks (stray: ${strayMarks.join(', ') || 'none'})`);
    precision('C5', Object.keys(counts.attempts ?? {}).length === 0, `this plant attempted no settle key at all (got ${Object.keys(counts.attempts ?? {}).join(', ') || 'none'}) — proof the reset in \`before file\` really ran, and so that C4's counts above were its own`);
    precision('C5', tests.length === 2, `the plant is exactly two tests (got ${tests.length})`);
  }
}

// =============================================================================
// C6, C7 — `request fails` / `request connects`, on both sides of the transport boundary
// =============================================================================
//
// One plant, two runs, two envs, and graded as two rows because they are two claims. Neither run
// alone says anything: "fails passes against a closed port" is satisfied by a matcher that always
// passes, and "connects passes against a live server" by one that never fails.

if (wanted('C6') || wanted('C7')) {
  const fails = plantFor('matcher:fails');
  const connects = plantFor('matcher:connects');
  console.log(`\n${fails.id}/${connects.id} — ${fails.title}\n  target: ${fails.target}`);

  const dead = runCorpus(ROOT, ['--env', 'unreachableHost', connects.evidence.file]);
  const live = runCorpus(ROOT, [fails.evidence.file]);

  if (!dead.report || !live.report) {
    const which = !dead.report ? 'the unreachable-host run' : 'the live-control run';
    fail(`${fails.id}/${connects.id} — ${which} produced no report.\n${(!dead.report ? dead : live).output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C6').skipped = 'no report';
    scores.get('C7').skipped = 'no report';
  } else {
    const deadTests = functionalTests(dead.report);
    const deadFails = named(dead.report, 'a closed port is a connection-layer failure');
    const deadConnects = named(dead.report, 'asserted the other way round');
    const liveTest = named(live.report, 'a 503 is a response');
    const stepFor = (needle) => stepsOf(liveTest).find((s) => s.source.includes(needle));

    // C6 — `fails`. Passes where the transport genuinely failed; must NOT pass where it did not.
    recall('C6', deadFails?.ok === true, `against a closed port, \`expect request fails\` passed (got ok=${deadFails?.ok})`);
    const liveFails = stepFor('expect request fails');
    recall('C6', liveFails !== undefined && liveFails.ok === false, `against a server that answered 503, \`expect request fails\` did NOT pass (got ${liveFails ? `ok=${liveFails.ok}` : 'no such step'})`);
    // Precision: the red landed on that line and on no other. A file that goes red for the wrong
    // reason and one that goes red for the right reason are identical from the exit status.
    const liveFailed = failingSteps(liveTest);
    precision('C6', liveFailed.length === 1 && liveFailed[0].source.includes('expect request fails'), `it is the ONLY failing step in the control (failed: ${liveFailed.map((s) => s.source.trim()).join('; ') || 'none'})`);
    precision('C6', stepFor('expect status equals 503')?.ok === true, `the 503 itself was asserted and passed — so the server really did answer, and \`fails\` was judging a completed exchange`);

    // C7 — `connects`, the exact inverse on the same two requests.
    recall('C7', deadConnects?.ok === false, `against a closed port, \`expect request connects\` failed (got ok=${deadConnects?.ok})`);
    recall('C7', stepFor('expect request connects')?.ok === true, `against the 503, \`expect request connects\` passed (got ok=${stepFor('expect request connects')?.ok})`);
    precision('C7', deadTests.length === 2, `the unreachable-host plant is exactly two tests, one per matcher (got ${deadTests.length})`);
  }
}

// =============================================================================
// C8, C9, C10 — the value transforms, against literals rather than against each other
// =============================================================================
//
// The one plant here with no target and no server hop (`D743`). What it replaces is a round trip,
// and a round trip holds for any pair of mutually inverse functions — including a wrong pair. So
// the grading is: the three tests pass, AND the exact discriminating literal is still in the file.
// The second half is what stops the plant being weakened into a tautology later.

const TRANSFORM_ROWS = [
  { id: 'C8', construct: 'generator:transform-base64', word: 'base64', literal: 'TTE1NGMgeMO/Pz5+YStiL2MgZD1l', wrong: 'the URL-safe alphabet (`_`/`-`)' },
  { id: 'C9', construct: 'generator:transform-hex', word: 'hex', literal: '4d313534632078c3bf3f3e7e612b622f6320643d65', wrong: 'uppercase digits' },
  { id: 'C10', construct: 'generator:transform-url', word: 'url', literal: 'M154c%20x%C3%BF%3F%3E~a%2Bb%2Fc%20d%3De', wrong: 'form-urlencoding (`+` for space, `%7E` for `~`)' },
];

if (TRANSFORM_ROWS.some((r) => wanted(r.id))) {
  const first = plantFor('generator:transform-base64');
  console.log(`\nC8/C9/C10 — the value transforms\n  target: ${first.target}`);
  const { report, output } = runCorpus(ROOT, [first.evidence.file]);
  if (!report) {
    for (const r of TRANSFORM_ROWS) { fail(`${r.id} produced no report.\n${output.trim().split('\n').slice(-8).join('\n')}`); scores.get(r.id).skipped = 'no report'; }
  } else {
    const tests = functionalTests(report);
    for (const row of TRANSFORM_ROWS) {
      if (!wanted(row.id)) continue;
      const test = tests.find((t) => t.name?.startsWith(`${row.word} encode`));
      recall(row.id, test?.ok === true, `\`${row.word}\` matched its literal (got ${test ? `ok=${test.ok}` : 'no such test'}) — the wrong answer it rules out is ${row.wrong}`);
      const asserted = stepsOf(test).some((s) => s.source.includes(row.literal));
      precision(row.id, asserted, `the discriminating literal is still asserted in the plant, character for character`);
      const failed = failingSteps(test);
      precision(row.id, failed.length === 0, `no step failed (got ${failed.map((s) => s.source.trim()).join('; ') || 'none'})`);
    }
  }
}

// =============================================================================
// C11 — `matches file`, against a near miss of identical length
// =============================================================================

if (wanted('C11')) {
  const plant = plantFor('matcher:matches-file');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  if (!report) {
    fail(`${plant.id} produced no report. Needs the stack and an authenticated upload.\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C11').skipped = 'no report';
  } else {
    const golden = named(report, 'the golden file matches itself');
    const nearMiss = named(report, 'the near-miss file does not');
    recall('C11', golden?.ok === true, `the golden file matched itself (got ok=${golden?.ok})`);
    recall('C11', nearMiss?.ok === false, `the near-miss file did NOT match (got ok=${nearMiss?.ok}) — same 34 bytes long, two bytes different`);
    const failed = failingSteps(nearMiss);
    precision('C11', failed.length === 1 && failed[0].source.includes('constructs-near-miss'), `the red is on the near-miss comparison and nothing else (failed: ${failed.map((s) => s.source.trim()).join('; ') || 'none'})`);
    precision('C11', failingSteps(golden).length === 0, `nothing in the positive test failed — so the upload round-trip itself is sound and the red above is the matcher's`);
  }
}

// =============================================================================
// C12 — `give`: the named value, and not the two other values in reach
// =============================================================================

if (wanted('C12')) {
  const plant = plantFor('step:give');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  if (!report) {
    fail(`${plant.id} produced no report.\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C12').skipped = 'no report';
  } else {
    const tests = functionalTests(report);
    const namedValue = named(report, 'returns the named value');
    const parameter = named(report, "carries the action's parameter");
    recall('C12', namedValue?.ok === true, `\`give\` returned the action's own \`first\`, not the caller's binding and not the last capture (got ok=${namedValue?.ok})`);
    recall('C12', parameter?.ok === true, `\`give\` carried the action's parameter into its value (got ok=${parameter?.ok})`);
    // Precision: the three named wrong answers are each still asserted against. A plant reduced to
    // "the call returned something" would satisfy the two recalls above and nothing else.
    const sources = tests.flatMap((t) => stepsOf(t)).map((s) => s.source);
    for (const wrong of ['"known-answer"', '"EUR"', '"caller-value"', '"M154c-echoed"']) {
      precision('C12', sources.some((src) => src.includes(wrong)), `${wrong} is still named in the plant`);
    }
    const failed = tests.flatMap((t) => failingSteps(t));
    precision('C12', failed.length === 0, `no step failed (got ${failed.map((s) => s.source.trim()).join('; ') || 'none'})`);
  }
}

// =============================================================================
// C13-C22 — the six locators, and the three steps that cannot be graded apart
// =============================================================================
//
// One run, ten rows. The plant is a single test, so `test.ok` is one bit for ten claims — which is
// exactly the shape `C2`'s comment warns about. Every row therefore names *its own* assertion by the
// token it expects, and the precision half asserts the decoys are still on the page: a fixture that
// lost its near-misses would leave ten green rows grading nothing.

if (['C13','C14','C15','C16','C17','C18','C19','C20','C21','C22'].some(wanted)) {
  const plant = plantFor('locator:button');
  console.log(`\nC13-C22 — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  const ids = ['C13','C14','C15','C16','C17','C18','C19','C20','C21','C22'].filter(wanted);
  if (!report) {
    for (const id of ids) {
      fail(`${id} produced no report. Needs the stack and a browser.\n${output.trim().split('\n').slice(-12).join('\n')}`);
      scores.get(id).skipped = 'no report';
    }
  } else {
    // Named, not `[0]`: the plant carries a second, deliberately-red test (`C19`'s unscoped case),
    // and a positional lookup would start grading it the day someone reorders the file.
    const test = named(report, 'each locator resolves');
    const steps = stepsOf(test);
    const okStep = (needle) => steps.some((s) => s.source.includes(needle) && s.ok);
    const indexOf = (needle) => steps.findIndex((s) => s.source.includes(needle));

    // Recall: each row's own named answer.
    if (wanted('C13')) recall('C13', okStep("data-token='button/true'"), 'the `<button>` answered, not the link, the menuitem or the bare div');
    if (wanted('C14')) recall('C14', okStep("data-token='text/true'"), 'the rendered `<p>` answered, not the value/alt/title/aria-label decoys');
    if (wanted('C17')) recall('C17', okStep("data-token='css/3'"), 'the third of four identical siblings answered, not the first');
    if (wanted('C18')) recall('C18', okStep("data-token='xpath/4'"), 'the last of four answered, through an expression the `//` auto-detect cannot rescue');
    if (wanted('C16')) {
      recall('C16', okStep("data-token='list/items'"), 'the items list answered when named');
      recall('C16', okStep("data-token='list/suppliers'"), 'the suppliers list answered when named — the pair is the claim, either alone is satisfied by a locator that ignores the name');
    }
    if (wanted('C15')) recall('C15', okStep('#field-by-label" has value "GLASGOW'), "the label won `D6`'s cascade over the colliding placeholder");
    if (wanted('C21')) recall('C21', okStep('#field-by-placeholder" has value "UNTOUCHED'), 'the fill reached exactly one input — the decoy still holds its initial value');
    if (wanted('C22')) {
      const valueSteps = steps.filter((s) => /has value "/.test(s.source));
      recall('C22', valueSteps.length >= 2 && valueSteps.every((s) => s.ok), `\`has value\` was asserted in both directions and both held (got ${valueSteps.length} use(s))`);
    }
    if (wanted('C19')) {
      const withins = steps.filter((s) => /^\s*within /.test(s.source));
      recall('C19', withins.length >= 2, `both scoped blocks are still in the plant (got ${withins.length}) — the inner name is ambiguous without them`);
      // The second half, and the one the twenty-five pre-existing uses could not supply: the
      // unscoped case must be genuinely impossible, not merely untried. A `within` that resolved
      // its scope and then searched the document passes every scoped assertion above.
      const unscoped = named(report, 'MUST end red');
      const ambiguous = failingSteps(unscoped);
      recall('C19', unscoped?.ok === false, `the unscoped click did NOT succeed (got ok=${unscoped?.ok})`);
      precision('C19', ambiguous.length === 1 && /ambiguous locator/.test(ambiguous[0]?.detail ?? ''),
        `the red is an ambiguity error on the click itself, not a not-found or a timeout (got: ${(ambiguous[0]?.detail ?? 'none').split('\n')[0]})`);
      precision('C19', /matched 2 elements/.test(ambiguous[0]?.detail ?? ''),
        'exactly two elements matched — one decoy short and the ambiguity disappears along with the plant');
    }
    if (wanted('C20')) {
      recall('C20', okStep("data-token='none'"), 'the control held — the readout was untouched before any click');
      recall('C20', indexOf("data-token='none'") < indexOf("data-token='button/true'"), 'the control runs BEFORE the first token assertion — after them it would assert nothing');
    }
    for (const id of ids) recall(id, test?.ok === true, `the plant passed (got ok=${test?.ok})`);

    // Precision: nothing else fired, and the near-misses are still there to be missed. The second
    // half is the one that matters — every recall above stays green on a fixture page whose decoys
    // were deleted, and that page grades nothing at all.
    const failed = failingSteps(test);
    for (const id of ids) precision(id, failed.length === 0, `no step failed (got ${failed.map((s) => `line ${s.line}: ${s.source.trim()}`).join('; ') || 'none'})`);
    if (wanted('C20')) {
      const clicks = steps.filter((s) => /^\s*click /.test(s.source));
      precision('C20', clicks.length === 6, `exactly six clicks, one per candidate (got ${clicks.length})`);
    }
    if (wanted('C17')) precision('C17', okStep("li:nth-child(3)"), 'the positional selector is still positional — a rewrite to a unique selector would grade nothing');
    if (wanted('C18')) precision('C18', steps.some((s) => /click xpath "\(\/\//.test(s.source)), 'the xpath expression still opens with `(` — a leading `//` would let the auto-detect stand in for the prefix');
  }
}

// =============================================================================
// the table
// =============================================================================

console.log('\nper-plant precision and recall:\n');
for (const plant of PLANTS) {
  if (!wanted(plant.id)) {
    console.log(`  – ${plant.id} ${plant.construct} — not selected by --only`);
    continue;
  }
  const s = scores.get(plant.id);
  const tally = (xs) => (xs.length === 0 ? 'n/a' : `${xs.filter(Boolean).length}/${xs.length}`);
  const clean = s.recall.every(Boolean) && s.precision.every(Boolean) && s.recall.length > 0;
  // `D734` — a plant red for a *known* tflw defect keeps its row and says which. Absence of any
  // `blockedOn` is not the same as absence of defects; it is the claim that none is known.
  const blocked = plant.blockedOn ? `  [blocked-on:${plant.blockedOn}]` : '';
  console.log(`  ${clean ? '✓' : '✗'} ${plant.id} ${plant.construct.padEnd(14)} recall ${tally(s.recall)}  precision ${tally(s.precision)}${s.skipped ? `  (skipped: ${s.skipped})` : ''}${blocked}`);
}

console.log(
  failures === 0
    ? `\n✓ construct acceptance: ${PLANTS.filter((p) => wanted(p.id)).length} plant(s) produced exactly their known answers.`
    : `\n✗ construct acceptance: ${failures} mismatch(es).`,
);
if (failures > 0) process.stdout.write(stalenessBanner(PROVENANCE));

if (GATE) process.exit(failures === 0 ? 0 : 1);
process.exit(failures === 0 ? 0 : 1);
