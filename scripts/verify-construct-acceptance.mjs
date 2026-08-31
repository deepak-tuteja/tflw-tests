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

import { readFileSync, writeFileSync, rmSync, existsSync, copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveTflw } from './lib/tflw-bin.mjs';
import { readSpec, siblingState, gradeProvenance, announceProvenance, stalenessBanner } from './lib/tflw-provenance.mjs';
import { PLANTS, plantFor, plantsFor, assertAcceptancePlantsAreRunnable } from './lib/constructs.mjs';

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

// `M154f-02`. Checked before a single corpus runs, because the defect it catches is invisible
// afterwards: a plant whose run target is not a `.tflw` produces no report, and `if (!report)`
// records it as `skipped` rather than failing the id outright.
assertAcceptancePlantsAreRunnable(ROOT, existsSync, fail);

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

// `M154g` step 2d. Two of this tier's rows are graded by what `tflw check` **refuses**, not by what
// a run does: `C78`'s undecidability claim and `C79`'s scope-isolation claim are both negatives
// about the checker, and the files that would state them by running do not compile. Nothing is
// spawned against a stack here, so these legs grade identically with the stack down — which is
// also how they get dry-run while the box is busy.
// `env` since `M156f`: `C95`'s fourth and fifth legs turn on whether a variable is set, and the
// advisory note `tflw check` grew in tflw's `M156c` is the only thing in the check path that reads
// the environment at all. Same shape as `runRun` above, and merged rather than added beside it so
// there is one way to run each command.
function runCheck(args, { cwd = ROOT, env = {} } = {}) {
  const r = spawnSync(process.execPath, [TFLW_BIN, 'check', '--no-color', ...args], {
    cwd,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}

// `M154g` step 4a. The same shape for `tflw run`, and it exists for exactly one row: `C95` is the
// only claim in this ledger whose subject is something that happens **before** a run produces a
// report, so there is nothing for `runCorpus` to parse. The config it runs under points `api` at
// port 9 — on the fetch standard's blocked-ports list — so this opens no socket either.
function runRun(args, { cwd = ROOT, env = {} } = {}) {
  const r = spawnSync(process.execPath, [TFLW_BIN, 'run', '--no-color', ...args], {
    cwd,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
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
// C43 — `dismiss dialog`: the arming it overwrites (`M154d`, closes `M154b-01`)
// =============================================================================

// **One corpus run, two rows, and that is not just thrift.** `C43`'s whole claim is a contrast
// with the state `C2`'s last step produces — a no-op `dismiss` leaves the accept standing and
// yields `cancelled-final` — so the two rows are assertions about the *same* sequence in the same
// test. Running the file twice would grade the second row against a different execution of the
// thing it is contrasting with, and this plant seeds products and logs into the console, so the
// second run is not cheap either.
if (wanted('C2') || wanted('C43')) {
  const plant = plantFor('step:accept');
  const dismissPlant = plantFor('step:dismiss');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  if (wanted('C43')) console.log(`${dismissPlant.id} — ${dismissPlant.title}\n  target: ${dismissPlant.target}`);
  const { report, output } = runCorpus(ROOT, ['--env', 'webv2Admin', plant.evidence.file]);
  if (!report) {
    fail(`${plant.id} produced no report. Needs the stack, the admin console on :8091 and a browser.\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C2').skipped = 'no report';
    if (wanted('C43')) scores.get('C43').skipped = 'no report';
  } else {
    // `M159f` — the file is TWO tests now (`D806f`): the first holds the three non-destructive
    // states, the second the one that deletes. Taking `[0]` and `[1]` by position rather than by
    // name, and asserting the count, because a file that silently lost its second test would
    // otherwise be graded as a passing first test and nothing would say the third state stopped
    // being checked.
    const functional = report.tests.filter((t) => t.kind === 'functional');
    const test = functional[0];
    const deleteTest = functional[1];
    const answerTest = functional[2];
    const steps = test?.steps ?? [];
    const deleteSteps = deleteTest?.steps ?? [];
    const warningsOf = (t) => t?.warnings ?? [];
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

    // `M154b-02`, closed by tflw's `D797` and asserted here for the first time: two armings, two
    // dialogs from one click, and the delete really happens. Graded on the API's 404s rather than
    // on the page's own banner — under the single slot every assertion up to and including the
    // click passed while both products were still there, which is precisely why the claim is made
    // against the resource and not against the rendered claim about it.
    recall('C2', functional.length === 3, `the plant still carries all three of its tests (got ${functional.length} functional)`);
    recall('C2', deleteSteps.filter((s) => /^\s*accept dialog\s*$/.test(s.source)).length === 2,
      `the deleting test arms twice (got ${deleteSteps.filter((s) => /^\s*accept dialog\s*$/.test(s.source)).length})`);
    recall('C2', deleteSteps.some((s) => s.source.includes("p[data-state='bulk-deleted']") && s.ok),
      'the form actually submitted — the banner is the list page’s own render after a real navigation');
    recall('C2', deleteSteps.filter((s) => /^\s*expect status equals 404\s*$/.test(s.source) && s.ok).length === 2,
      `both products are gone, asked of the API (got ${deleteSteps.filter((s) => /^\s*expect status equals 404\s*$/.test(s.source) && s.ok).length} of 2 404s)`);
    recall('C2', deleteTest?.ok === true, `the deleting test passed (got ok=${deleteTest?.ok})`);

    // `D806h` — `TF080`'s runtime witness, and the only kind of proof a code no `tflw check` can
    // emit is able to have here. `verify-check-diagnostics.mjs` delegates the two `phase: 'run'`
    // codes to this gate by name; these two `recall`s are what that delegation resolves to, and a
    // deleted assertion here is caught there by the file-and-code cross-check rather than silently
    // leaving a code unproven.
    recall('C2', warningsOf(answerTest).some((w) => w.code === 'TF080'),
      `\`accept dialog with\` on a confirm produced TF080 (got ${JSON.stringify(warningsOf(answerTest).map((w) => w.code))})`);
    recall('C2', answerTest?.ok === true && answerTest?.steps?.some((st) => /^\s*expect status equals 404\s*$/.test(st.source) && st.ok),
      'and the dialog was accepted anyway — the product is gone, so the answer was ignored rather than the step');

    const failedSteps = [...steps, ...deleteSteps, ...(answerTest?.steps ?? [])].filter((s) => !s.ok);
    precision('C2', failedSteps.length === 0, `no step failed (got ${failedSteps.map((s) => `line ${s.line}: ${s.source}`).join('; ') || 'none'})`);

    if (wanted('C43')) {
      // `M159f` (`D806e`) — the order, graded by ADJACENCY, which is the same lesson `C26` cost
      // this milestone and the reason the old overwrite grader was written this way too. The claim
      // is that the DISMISSAL is written first and the accept behind it: reversed, this is `C2`'s
      // one-shot row and proves nothing about `dismiss`.
      //
      // Anchored on the dismissal and read outwards, never on the first `accept dialog` — that one
      // is `C2`'s arming, several steps earlier, and anchoring there is how the previous version of
      // this check failed on its first run.
      const dismissed = steps.findIndex((st) => /^\s*dismiss dialog\s*$/.test(st.source));
      const armedAfter = dismissed >= 0 && /^\s*accept dialog\s*$/.test(steps[dismissed + 1]?.source ?? '') ? dismissed + 1 : -1;
      const clicked = steps.findIndex((st, i) => i > dismissed && /^\s*click button "Delete 2 out-of-stock"/.test(st.source));

      recall('C43', dismissed > 0 && steps[dismissed]?.ok === true, 'the `dismiss dialog` step itself ran and passed');
      // The state AFTER the ordered pair, located by position rather than by substring: the plant's
      // own control asserts `cancelled` too, several steps earlier, so a `.some()` over the file
      // would be satisfied by a step that has nothing to do with this row.
      const settled = steps.find((st, i) => i > clicked && st.source.includes('#bulk-delete-state'));
      recall('C43', /data-state='cancelled'\]/.test(settled?.source ?? '') && settled?.ok === true,
        `the click after the dismissal settled at 'cancelled' (got ${settled ? settled.source.trim() : 'no state assertion after it'})`);
      // The last dialog of the attempt is confirm #1, which is only true if #2 was never raised —
      // the half the page state cannot tell you, since `cancelled` is also what a first-confirm
      // dismissal by the DEFAULT would leave.
      const message = steps.find((st, i) => i > clicked && /^\s*expect dialog message\b/.test(st.source));
      recall('C43', /matching this filter\?/.test(message?.source ?? '') && message?.ok === true,
        `the last dialog was confirm #1, so confirm #2 was never raised (got ${message ? message.source.trim() : 'no dialog message assertion after the click'})`);
      // And the wrong answer is reachable in this very run — `cancelled-final` is what a no-op
      // `dismiss`, a stack, or a slot would each have produced, and `C2`'s own step just produced
      // it. Without this the row would assert that a state it never saw is different from one it did.
      recall('C43', steps.some((st) => st.source.includes("data-state='cancelled-final'") && st.ok),
        'the contrasting state `cancelled-final` was actually reached in this run, so the wrong answer is not hypothetical');
      // `D806g`/`D806h` — the accept written behind the dismissal is never consumed, on purpose, and
      // tflw reports that as `TF079` against its own line. It is this row's second claim rather than
      // a side effect: the leftover exists **because** the dismissal answered confirm #1 and the
      // form stopped there, so the warning and the `cancelled` state are two readings of one fact.
      // Anchored on the line, so a warning raised by some other arming would not satisfy it.
      const unused = warningsOf(test).filter((w) => w.code === 'TF079');
      recall('C43', unused.length === 1 && unused[0].line === steps[armedAfter]?.line,
        `TF079 named the leftover accept at line ${steps[armedAfter]?.line} (got ${JSON.stringify(unused.map((w) => w.line))})`);

      precision('C43', armedAfter >= 0 && armedAfter === dismissed + 1,
        `the step immediately after the dismissal is \`accept dialog\` (dismissed@${dismissed}, armed@${armedAfter})`);
      precision('C43', clicked === armedAfter + 1,
        `the click follows the pair with nothing between it and them (clicked@${clicked})`);
      precision('C43', failedSteps.length === 0, 'no step failed');
    }
  }

  // `M159f-c` — `C2`'s SECOND target, and its own `tflw run`.
  //
  // Everything above raises one dialog kind, `confirm`, because that is the only kind the
  // double-confirm bulk delete has. Two claims were vacuous because of it, and neither can be
  // repaired by more confirm-testing:
  //
  //   * `dialog type` has a closed set of four values and this repository could produce one, so a
  //     subject hardcoded to `"confirm"` passed every dialog assertion in both repositories.
  //   * `accept dialog with`'s only use here is the `TF080` witness above, which asserts the answer
  //     went NOWHERE. An implementation that parsed the value and never handed it to Playwright
  //     satisfied that test by construction. Only a `prompt` separates the two.
  //
  // A separate file and a separate run rather than more blocks in the plant above: these are three
  // different fixtures on two different pages, and the run above is already seeding products for
  // three tests. No new roster row — `accept dialog with` is `step:accept` with more syntax, and
  // `dialog message`/`dialog type` are subjects inside matcher rows (`CONSTRUCTS.md`).
  //
  // Guarded on `C2` alone: every claim below is `step:accept`'s, and `--only C43` must not pay for
  // a second stack run whose findings it does not record.
  if (wanted('C2')) {
    const KINDS = 'tests/.constructs/dialog-kinds.tflw';
    const kinds = runCorpus(ROOT, ['--env', 'webv2Admin', KINDS]);
    if (!kinds.report) {
      fail(`C2's kind plant (${KINDS}) produced no report. Needs the stack, the admin console on :8091 and a browser.\n${kinds.output.trim().split('\n').slice(-12).join('\n')}`);
    } else {
      const kindTests = kinds.report.tests.filter((t) => t.kind === 'functional');
      const [promptTest, alertTest, unloadTest] = kindTests;
      recall('C2', kindTests.length === 3, `the kind plant carries one test per unexercised kind (got ${kindTests.length} of 3)`);

      // --- `prompt`: the three answers a prompt can return, and the only one that reaches the app.
      const pSteps = promptTest?.steps ?? [];
      const pState = (key) => pSteps.some((st) => st.source.includes(`#rename-state[data-state='${key}']`) && st.ok);
      recall('C2', pState('cancelled'), 'the control held — nothing armed, the prompt was dismissed and `prompt()` returned null');
      recall('C2', pState('empty'),
        'a bare `accept dialog` answered with the EMPTY STRING, which the page tells apart from a cancel — the half SPEC §9.1 states and nothing outside tflw’s unit tests had checked');
      recall('C2', pSteps.some((st) => /^\s*expect dialog type equals "prompt"/.test(st.source) && st.ok),
        'a kind that is not `confirm` was reported, so the subject is reading the dialog rather than a constant');
      // The claim the `TF080` witness above cannot make: the answer arrived. Asked of the product,
      // not of the page that just re-rendered under the new name.
      const renamed = pSteps.filter((st) => /^\s*expect body\.name equals/.test(st.source) && st.ok);
      recall('C2', renamed.length === 2 && renamed.some((st) => st.source.includes('renamed')),
        `\`accept dialog with\` reached the application — the product’s own name changed (got ${renamed.length} of 2 name assertions)`);
      recall('C2', promptTest?.ok === true, `the prompt plant passed (got ok=${promptTest?.ok})`);

      // --- `alert`: three armings, three identical outcomes, and the subject moving off the kind.
      const aSteps = alertTest?.steps ?? [];
      const checks = aSteps.filter((st) => /#stock-health-state\[data-checks='[123]'\]/.test(st.source) && st.ok);
      recall('C2', checks.length === 3,
        `an \`alert\` is unaffected by which arming answered it — nothing armed, accepted and dismissed all left the same counter (got ${checks.length} of 3)`);
      const types = aSteps.filter((st) => /^\s*expect dialog type equals/.test(st.source) && st.ok).map((st) => st.source.trim());
      recall('C2', types.some((t) => t.includes('"alert"')) && types.some((t) => t.includes('"confirm"')),
        `\`dialog type\` MOVED within one attempt, which no single-kind corpus could show (got ${JSON.stringify(types)})`);
      recall('C2', alertTest?.ok === true, `the alert plant passed (got ok=${alertTest?.ok})`);

      // --- `beforeunload`: reachable after all, and graded by the branch that is not the default.
      //
      // tflw's `M159` prediction 5 said a headless click would not qualify as the user gesture
      // browsers gate this kind on. It does — measured 2026-08-30, first try. Asserted here rather
      // than quietly enjoyed: the prediction is written down in `PLAN_M159_DIALOGS.md`, and this is
      // the run that falsified it.
      const uSteps = unloadTest?.steps ?? [];
      recall('C2', uSteps.some((st) => /^\s*expect dialog type equals "beforeunload"/.test(st.source) && st.ok),
        'the fourth value of the closed set was really raised by a headless run');
      // The ACCEPT branch only. A dismissal and an empty queue both mean "stay" here — the browser's
      // unhandled default — so the dismiss branch is `M154b-01`'s vacuous shape and is deliberately
      // not graded as though it were not.
      const left = uSteps.findIndex((st) => /^\s*expect css "h1:text-is\('Products'\)"/.test(st.source));
      recall('C2', left > 0 && uSteps[left]?.ok === true && /^\s*accept dialog\s*$/.test(uSteps[left - 2]?.source ?? ''),
        'accepting the guard LEFT the page, two steps under its own arming — the branch the default cannot satisfy');
      // And the control: same page, same link, nothing typed, so no dialog is raised at all. No step
      // can assert an absence, so the evidence is the arming going unconsumed — `TF079`, at its own
      // line. Without it both branches above would hold against a guard that blocked every
      // navigation unconditionally, which is a broken fixture and a green test.
      const unloadWarnings = (unloadTest?.warnings ?? []).filter((w) => w.code === 'TF079');
      const lastArm = [...uSteps].reverse().find((st) => /^\s*accept dialog\s*$/.test(st.source));
      recall('C2', unloadWarnings.length === 1 && unloadWarnings[0].line === lastArm?.line,
        `the clean-page control raised nothing, evidenced by TF079 at line ${lastArm?.line} (got ${JSON.stringify(unloadWarnings.map((w) => w.line))})`);
      recall('C2', unloadTest?.ok === true, `the beforeunload plant passed (got ok=${unloadTest?.ok})`);

      const kindFailures = [...pSteps, ...aSteps, ...uSteps].filter((st) => !st.ok);
      precision('C2', kindFailures.length === 0,
        `no step failed in the kind plant (got ${kindFailures.map((st) => `line ${st.line}: ${st.source}`).join('; ') || 'none'})`);
    }
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
// C44-C50 — the perf tier: the four workload shapes, the verdict rule, and pacing
// =============================================================================
//
// Everything here is graded against `arrival-server.mjs`'s recorded arrival *times*. See that
// file's `D745` for why the target is a zero-latency counter rather than apiV2, which inverts
// `D726`'s placement in order to keep `D726`'s principle: in the closed model a VU issues its next
// request when the last one returned, so a shape graded against a real database measures the
// database.
//
// **The tolerances below are bands, not point equalities, and each one is justified where it is
// used.** A shape is a claim about pacing on a wall clock, so demanding an exact bin count would be
// a flake generator on a contended box — and a band chosen loosely enough to never fail would be
// `M141`'s vacuity. Every band here was set against a measured run (fedora-box, 2026-08-25) and is
// wide enough for jitter, narrow enough that the *neighbouring shape* fails it. That last clause is
// the real bar: `ramp`'s band must reject `hold`'s curve, and it does.

/** The manifest id each perf-tier row grades, so the announcement loops below can look a plant up
 *  by row id. Stated rather than derived: `constructs.mjs` is explicit that a construct id is
 *  opaque by tflw's own contract and must not be split apart. */
const PLANT_CONSTRUCT = {
  C44: 'step:ramp', C45: 'step:hold', C46: 'step:step', C47: 'step:spike',
  C48: 'config:key:teardown', C49: 'step:threshold', C50: 'step:pause',
};

/** The binned arrival curve, per path. `bin` is chosen per assertion — a `hold` reads naturally in
 *  500 ms bins and a `spike`'s burst needs them. */
const curve = async (binMs) => JSON.parse(await (await fetch(`http://127.0.0.1:4507/__curve?bin=${binMs}`)).text());

/** The bins of one path with the leading empty ones dropped, so each test's curve is its own
 *  timeline rather than an offset into the server's. The corpus runs its tests sequentially onto
 *  distinct paths, which is what makes this sound. */
function ownBins(c, p) {
  const bins = c.byPath[p]?.bins ?? [];
  const first = bins.findIndex((n) => n > 0);
  return first === -1 ? [] : bins.slice(first);
}

if (wanted('C44') || wanted('C45') || wanted('C46') || wanted('C47')) {
  for (const id of ['C44', 'C45', 'C46', 'C47']) {
    if (!wanted(id)) continue;
    const pl = plantFor(PLANT_CONSTRUCT[id]);
    console.log(`\n${pl.id} — ${pl.title}\n  target: ${pl.target}`);
  }
  const corpus = path.join(ROOT, 'tflw-acceptance', 'conformance');
  let server = null;
  try {
    server = await startArrivalServer(corpus);
    await arrivals('__reset');
    const { report, output } = runCorpus(corpus, ['shapes.tflw']);
    if (!report) {
      for (const id of ['C44', 'C45', 'C46', 'C47']) if (wanted(id)) fail(`${id} — no report\n${output.trim().split('\n').slice(-10).join('\n')}`);
    } else {
      const counted = await arrivals('__arrivals');
      const c500 = await curve(500);

      // --- C45 `hold` ------------------------------------------------------------------------
      // `hold 50 rps for 4s` -> 200 arrivals, and flat from the FIRST bin. The flatness is the
      // whole construct: `tflw spec` says "a flat target for the whole duration, **with no
      // ramp-in**", and the only way to be wrong about that while landing the right total is to
      // ramp. So the first full bin is asserted against the target rate, not merely against zero.
      if (wanted('C45')) {
        const n = counted.byPath['/hold'] ?? 0;
        recall('C45', n >= 190 && n <= 210, `hold 50 rps for 4s landed ${n} request(s) — 200 expected, +/-5%`);
        const b = ownBins(c500, '/hold');
        // Bin 1 rather than bin 0: bin 0 is clipped by wherever in the bin the run started.
        const second = b[1] ?? 0;
        recall('C45', second >= 20 && second <= 30, `it is at full rate by its second 500ms bin (${second}, 25 expected) — a flat target has no ramp-in`);
        const body = b.slice(1, -1);
        const spread = body.length ? Math.max(...body) - Math.min(...body) : 999;
        precision('C45', spread <= 6, `and it stays flat: the spread across its steady bins is ${spread} (bins ${JSON.stringify(b)})`);
      }

      // --- C44 `ramp` ------------------------------------------------------------------------
      // The sharp one, and the reason it is sharp is arithmetic rather than tolerance: a linear ramp
      // to the same target over the same duration is a triangle inside `hold`'s rectangle, so it
      // must land HALF. A build that implemented `ramp` as `hold` doubles the count. Nothing in this
      // repository has ever checked this: `ramp` has uses, and every one of them was graded against
      // tflw's own report of what it did.
      if (wanted('C44')) {
        const n = counted.byPath['/ramp'] ?? 0;
        recall('C44', n >= 90 && n <= 110, `ramp to 50 rps over 4s landed ${n} request(s) — 100 expected, exactly half of hold's 200`);
        const hold = counted.byPath['/hold'] ?? 0;
        recall('C44', hold > 0 && n < hold * 0.62, `and it landed materially less than hold at the same rate and duration (${n} vs ${hold}) — the triangle inside the rectangle`);
        const b = ownBins(c500, '/ramp');
        const head = b.slice(0, 2).reduce((a, x) => a + x, 0);
        const tail = b.slice(-3, -1).reduce((a, x) => a + x, 0);
        recall('C44', tail > head * 2, `and it rises: its last full bins carry ${tail} against ${head} in its first (bins ${JSON.stringify(b)})`);
        // The complement of C45's flatness assertion, and the one that would catch a `ramp` that had
        // silently become a `hold` at half rate — which lands the right total and the wrong shape.
        precision('C44', head <= 12, `its opening bins are near zero (${head}), so it started from nothing rather than at a flat half-rate`);
      }

      // --- C46 `step` ------------------------------------------------------------------------
      // 20/s for 2s then 80/s for 2s is 200 arrivals, which is ALSO what `hold 50 rps for 4s` lands.
      // That collision is deliberate: the totals cannot tell the two apart, so a grader that only
      // counted would pass a build that had collapsed `step` into a flat average. The plateaus and
      // their 1:4 ratio are the claim.
      if (wanted('C46')) {
        const n = counted.byPath['/step'] ?? 0;
        recall('C46', n >= 190 && n <= 210, `step 20/2s then 80/2s landed ${n} request(s) — 200 expected`);
        const b = ownBins(c500, '/step');
        const low = b.slice(0, 3);
        const high = b.slice(4, 7);
        const loAvg = low.reduce((a, x) => a + x, 0) / Math.max(1, low.length);
        const hiAvg = high.reduce((a, x) => a + x, 0) / Math.max(1, high.length);
        recall('C46', loAvg >= 7 && loAvg <= 13, `its first stage runs at ${loAvg.toFixed(1)} per 500ms (10 expected, i.e. 20 rps)`);
        recall('C46', hiAvg >= 34 && hiAvg <= 46, `its second stage runs at ${hiAvg.toFixed(1)} per 500ms (40 expected, i.e. 80 rps)`);
        precision('C46', hiAvg > loAvg * 2.5, `and the jump is a staircase rather than a slope: ${(hiAvg / Math.max(1, loAvg)).toFixed(1)}x between stages (bins ${JSON.stringify(b)})`);
      }

      // --- C47 `spike` -----------------------------------------------------------------------
      // Baseline, burst, recovery — and `tflw spec` is explicit that a spike mixes flat and ramped
      // stages in any order, which is the part a two-stage shape cannot demonstrate. The recovery is
      // what makes it a spike rather than a step up: a build that held the burst would pass every
      // assertion about the peak.
      if (wanted('C47')) {
        const n = counted.byPath['/spike'] ?? 0;
        recall('C47', n >= 90 && n <= 120, `spike 10 / 120 / 10 landed ${n} request(s) — ~105 expected (2s+1s ramp+2s)`);
        const b = ownBins(c500, '/spike');
        const peak = Math.max(...(b.length ? b : [0]));
        const base = b.slice(0, 3).reduce((a, x) => a + x, 0) / 3;
        const rec = b.slice(-3).reduce((a, x) => a + x, 0) / 3;
        recall('C47', peak >= 25, `it bursts: its peak bin carries ${peak} against a baseline of ${base.toFixed(1)}`);
        recall('C47', rec <= base * 2.5 + 2, `and it recovers to baseline (${rec.toFixed(1)} vs ${base.toFixed(1)}) rather than holding the burst`);
        precision('C47', peak > base * 3, `the burst is ${(peak / Math.max(0.5, base)).toFixed(1)}x baseline, not a rounding artefact (bins ${JSON.stringify(b)})`);
      }

      // Nothing may land anywhere but the four declared paths.
      const declared = new Set(['/hold', '/ramp', '/step', '/spike']);
      const stray = Object.keys(counted.byPath).filter((p) => !declared.has(p));
      for (const id of ['C44', 'C45', 'C46', 'C47']) {
        if (wanted(id)) precision(id, stray.length === 0, `no request landed off the four declared paths (stray: ${stray.join(', ') || 'none'})`);
      }
    }
  } catch (e) {
    for (const id of ['C44', 'C45', 'C46', 'C47']) {
      if (!wanted(id)) continue;
      fail(`${id} could not run: ${e.message}`);
      scores.get(id).skipped = e.message;
    }
  } finally {
    server?.kill();
  }
}

if (wanted('C49')) {
  {
    const pl = plantFor(PLANT_CONSTRUCT.C49);
    console.log(`\n${pl.id} — ${pl.title}\n  target: ${pl.target}`);
  }
  const corpus = path.join(ROOT, 'tflw-acceptance', 'conformance');
  let server = null;
  try {
    server = await startArrivalServer(corpus);
    await arrivals('__reset');
    // This corpus is MEANT to end red: one of its two tests breaches its threshold by design. So the
    // exit status is not read at all and the report is. A grader that treated non-zero as "could not
    // run" would skip the only plant that proves a workload's verdict comes from its thresholds.
    const { report, output } = runCorpus(corpus, ['verdict.tflw']);
    if (!report) {
      fail(`C49 — no report\n${output.trim().split('\n').slice(-10).join('\n')}`);
    } else {
      const counted = await arrivals('__arrivals');
      const tests = report.tests ?? [];
      const green = tests.find((t) => (t.name ?? '').includes('a satisfied threshold'));
      const red = tests.find((t) => (t.name ?? '').includes('a breaching threshold'));

      {
        recall('C49', green?.ok === true, `a workload whose p95 threshold is satisfied passes (got ${green ? (green.ok ? 'pass' : 'fail') : 'no such test'})`);
        recall('C49', red?.ok === false, `a workload whose p95 threshold breaches FAILS (got ${red ? (red.ok ? 'pass' : 'fail') : 'no such test'})`);
        // The sharp half. Both tests issue the same request against the same path and every
        // `expect status equals 200` succeeds in both — the server really does answer 200. So the
        // red verdict cannot have come from an assertion, which is the claim `tflw spec` makes and
        // nothing has ever checked: "decided once, after the run, against the run's aggregate
        // metrics". On 2026-08-05 a rung with no threshold at all ran at a 100% error rate and
        // reported PASS.
        const redAssertionsAllPassed = (red?.steps ?? []).every((st) => st.ok !== false);
        recall('C49', red?.ok === false && redAssertionsAllPassed, `and it fails with EVERY assertion in it green — the verdict came from the threshold, not from the steps`);
        const bothSlow = (counted.byPath['/slow'] ?? 0);
        precision('C49', bothSlow === 16, `both tests really ran: ${bothSlow} request(s) reached /slow (16 expected, 8 iterations each)`);
      }

    }
  } catch (e) {
    fail(`C49 could not run: ${e.message}`);
    scores.get('C49').skipped = e.message;
  } finally {
    server?.kill();
  }
}

// `M157f` (`D789`) — `C48`, re-pointed from the deleted `cleanup` keyword to the `teardown` config
// key that replaced it. Its own block rather than a rider on `C49`'s, because it runs one file
// **three times** at three levels of the key and `C49` runs a different file once. The contrast
// across those three runs is the entire plant; a single run of any one of them proves nothing.
if (wanted('C48')) {
  const pl = plantFor(PLANT_CONSTRUCT.C48);
  console.log(`\n${pl.id} — ${pl.title}\n  target: ${pl.target}`);
  const corpus = path.join(ROOT, 'tflw-acceptance', 'conformance');
  let server = null;
  try {
    server = await startArrivalServer(corpus);

    /** One run of `teardown.tflw` at one level. Returns the marker count, the summary text and the
     * first test's reported p95 — the three things the four clauses read. The arrival counter is
     * reset per run, so each level's marker count is its own rather than a running total. */
    const atLevel = async (flags) => {
      await arrivals('__reset');
      // Meant to end red — both tests breach by design — so the exit status is not read and the
      // report is, exactly as `C49`'s own note explains for its file.
      const { report, output } = runCorpus(corpus, ['teardown.tflw', ...flags]);
      const counted = await arrivals('__arrivals');
      const first = (report?.tests ?? []).find((t) => (t.name ?? '').includes('red by threshold'));
      return { markers: counted.byPath['/after-each-marker'] ?? 0, output, p95: first?.metrics?.successful?.durations?.p95 ?? null, report };
    };

    const dflt = await atLevel([]);
    const never = await atLevel(['--teardown', 'never']);
    const onSuccess = await atLevel(['--teardown', 'on-success']);

    if (!dflt.report || !never.report || !onSuccess.report) {
      fail(`C48 — no report\n${(dflt.output || never.output || onSuccess.output).trim().split('\n').slice(-10).join('\n')}`);
    } else {
      // Clause 1. 8, not 4: the four iterations of the second test **failed**, and they tear down
      // too. Before `M157b` the throw sat above the hook loop and this read 4.
      recall('C48', dflt.markers === 8, `by default every iteration tears down, the failing ones included: ${dflt.markers} marker(s), 8 expected`);
      // Clause 2, both halves — the count and the sentence. `D785` makes the announcement part of
      // the contract, on the grounds that a config key set to debug one afternoon and committed is
      // otherwise a run that leaks in silence forever.
      recall('C48', never.markers === 0, `\`--teardown never\` runs no hook at all: ${never.markers} marker(s), 0 expected`);
      recall('C48', /teardown: disabled/.test(never.output), `and says so on the summary — \`D785\`'s advisory line is missing from the output`);
      // Clause 3, and the sharp one. The first test is RED (its threshold cannot be satisfied) while
      // all four of its iterations PASS. A build reading the test's verdict rather than the
      // iteration's answers 0 here.
      recall('C48', onSuccess.markers === 4, `\`--teardown on-success\` tears down the passing iterations only: ${onSuccess.markers} marker(s), 4 expected`);
      const firstRed = (onSuccess.report.tests ?? []).find((t) => (t.name ?? '').includes('red by threshold'));
      recall('C48', firstRed?.ok === false, `and the test those four iterations belong to is itself RED — without that this clause cannot tell \`on success\` from "reads the run's verdict"`);
      // Clause 4 — the one no plant here could make before `M157a`. Hook time is out of the
      // reported duration, so the p95 must not move when the number of hooks per iteration does.
      // Compared with a tolerance rather than for equality: these are real measurements, and
      // asserting bit-equality would be asserting the absence of jitter.
      //
      // **`M157g` — the tolerance and the hook's cost are one decision, and the first version got
      // it backwards.** This is a null result: it says a number does *not* move. A null result is
      // evidence only if the movement it denies would have been visible, and `/after-each-marker`
      // was a zero-latency path — so a build that put hook time straight back into the reported
      // duration would have moved the p95 by one local request, 1-3 ms, under a 5 ms tolerance.
      // The clause was green on `fedora-box` and could not have failed there for the right reason;
      // on GitHub's hosted runners it failed three times in four on jitter alone (spreads 5.5, 9,
      // 12 ms), which is how it was found — a clause too tight for its noise and too loose for its
      // effect at the same time.
      //
      // The repair raised the effect rather than loosening the test: the hook now costs 50 ms, so a
      // `D782` regression moves the p95 by ~50 ms per iteration. 20 ms then sits above the worst
      // jitter observed (12 ms) and well below the effect, and the clause can fail for the reason
      // it is written for on either machine.
      const ps = [dflt.p95, never.p95, onSuccess.p95];
      const spread = ps.every((v) => typeof v === 'number') ? Math.max(...ps) - Math.min(...ps) : null;
      recall('C48', spread !== null && spread <= 20, `the reported p95 does not move with the number of hooks run — ${JSON.stringify(ps)} ms across the three levels, against a 50ms hook (\`D782\`)`);
      // Non-vacuity. A marker path nothing ever reaches would satisfy the `never` clause for the
      // wrong reason, and every clause above it would be comparing zeroes.
      precision('C48', dflt.markers > 0, `the hook is reachable at all (a 0 in the default run would make every clause above vacuous rather than satisfied)`);
    }
  } catch (e) {
    fail(`C48 could not run: ${e.message}`);
    scores.get('C48').skipped = e.message;
  } finally {
    server?.kill();
  }
}

if (wanted('C50')) {
  const pl = plantFor('step:pause');
  console.log(`\n${pl.id} — ${pl.title}\n  target: ${pl.target}`);
  const corpus = path.join(ROOT, 'tflw-acceptance', 'conformance');
  let server = null;
  try {
    server = await startArrivalServer(corpus);
    await arrivals('__reset');
    const { report, output } = runCorpus(corpus, ['pacing.tflw']);
    if (!report) {
      fail(`C50 — no report\n${output.trim().split('\n').slice(-10).join('\n')}`);
    } else {
      const c = await curve(1000);
      const paced = c.byPath['/paced']?.gapsMs;
      const unpaced = c.byPath['/unpaced']?.gapsMs;
      recall('C50', paced != null && paced.minMs >= 195, `every gap between the paced VU's iterations is at least the 200ms it named (min ${paced?.minMs ?? 'n/a'}ms)`);
      recall('C50', unpaced != null && unpaced.maxMs < 50, `the control, same shape without \`pause\`, runs flat out (max gap ${unpaced?.maxMs ?? 'n/a'}ms) — which is what makes the number above mean something`);
      // The second claim, and the one with consequences. tflw's report labels the column
      // "duration (ms, pause-excluded)" — pacing is time the test chose to spend, not latency the
      // server imposed. A build that stopped subtracting it would report ~200ms here and every
      // threshold in every paced workload would silently start measuring the wrong thing: green
      // tests, wrong numbers.
      const pacedTest = (report.tests ?? []).find((t) => (t.name ?? '').includes('pause spaces'));
      const p50 = pacedTest?.metrics?.durations?.p50 ?? pacedTest?.metrics?.p50 ?? null;
      recall('C50', p50 != null && p50 < 50, `and the reported duration EXCLUDES the pause: p50 ${p50 ?? 'n/a'}ms against 200ms of pacing per iteration`);
      const n = (await arrivals('__arrivals')).byPath;
      precision('C50', (n['/paced'] ?? 0) === 12 && (n['/unpaced'] ?? 0) === 12, `both tests issued their full 12 iterations (/paced ${n['/paced'] ?? 0}, /unpaced ${n['/unpaced'] ?? 0}) — pacing slowed them, it did not drop them`);
    }
  } catch (e) {
    fail(`C50 could not run: ${e.message}`);
    scores.get('C50').skipped = e.message;
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
 *  that is down is reported as a skip against the plant, not as a crash in the grader.
 *
 *  **It also records WHY, in `lifecycleFailure`, and that is not decoration.** On 2026-08-27 the
 *  box sweep's `construct-acceptance` phase went red with `C67`/`C70`/`C71`/`C72` all reporting
 *  "produced no lifecycle counts. Is the stack up?" — while the tflw run immediately above them had
 *  just passed 4/4 against that same host, and three consecutive re-runs minutes later were green.
 *  The stack was up; the message was a diagnosis this function had not made, and the bare `catch {}`
 *  had thrown away the evidence that would have identified the real one.
 *
 *  Naming the error found it on the very next full run: **`UND_ERR_SOCKET`** — undici reusing a
 *  pooled keep-alive connection the server had already closed. `C67` is where it lands because the
 *  workhorse block is the first `/v1/lifecycle/*` read after `C60`-`C66`, seven matcher plants that
 *  touch the counter not at all, so the pooled socket has been idle long enough to be reaped. The
 *  four ids that failed are exactly the four that share that one run.
 *
 *  So the retry below is **narrow on purpose**: one repeat, only for a socket-level error, never for
 *  an HTTP status, and it says in the output that it happened. A blanket retry would have hidden the
 *  original flake as effectively as the bare `catch` did, and "the counter answered on the second
 *  ask" is a different fact from "the counter answered" — which a plant grading an arrival count has
 *  no business blurring. A non-2xx still fails immediately: that would be the target app misbehaving,
 *  which is a finding rather than a connection artifact. Filed as `M154g-04`. */
let lifecycleFailure = null;
const SOCKET_ERRORS = new Set(['UND_ERR_SOCKET', 'ECONNRESET', 'EPIPE']);
async function lifecycleCounts() {
  lifecycleFailure = null;
  for (const attempt of [1, 2]) {
    try {
      const r = await fetch(LIFECYCLE_COUNTS, { headers: { connection: 'close' } });
      if (!r.ok) {
        lifecycleFailure = `${LIFECYCLE_COUNTS} answered HTTP ${r.status}`;
        return null;
      }
      const body = await r.json();
      if (attempt === 2) console.log(`  ! ${LIFECYCLE_COUNTS} answered only on a second ask, after ${lifecycleFailure} (M154g-04)`);
      return body;
    } catch (err) {
      const code = err?.cause?.code ?? err?.code ?? err?.name ?? 'error';
      lifecycleFailure = `${LIFECYCLE_COUNTS} — ${code}: ${err?.message ?? String(err)}`;
      if (attempt === 2 || !SOCKET_ERRORS.has(code)) return null;
    }
  }
  return null;
}
/** The skip line every plant prints when the counter did not answer. Says which of the two
 *  questions actually failed, rather than asserting the stack is down. */
const lifecycleSkipReason = () => (lifecycleFailure ? `no lifecycle counts — ${lifecycleFailure}` : 'no lifecycle counts');

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
    fail(`${plant.id} produced no ${report ? lifecycleSkipReason() : 'report'}. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C4').skipped = report ? lifecycleSkipReason() : 'no report';
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
    scores.get('C5').skipped = report ? lifecycleSkipReason() : 'no report';
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
// C23-C38 — the UI tier's real flows, graded out of one run each
// =============================================================================
//
// Sixteen rows, two `tflw run` invocations. Every plant here lives in a suite file that existed
// before this milestone, so the grading has a job the `.constructs/` plants do not: those files
// are edited by people who have never read this roster, and a row whose test has been quietly
// loosened is worse than no row. The static gate catches the *spelling* vanishing. What follows
// catches the **assertion** vanishing while the spelling stays — a `double click` still there and
// the `is hidden` after it flipped to `is visible`, a `select` still there and the count-0 case
// deleted. Each block below therefore checks the shape of the known answer, not just its colour.

const REAL_FLOW_IDS = ['C23', 'C24', 'C25', 'C26', 'C27', 'C28', 'C29', 'C30', 'C31', 'C32', 'C33', 'C34', 'C35', 'C36', 'C37'];

if (REAL_FLOW_IDS.some(wanted)) {
  console.log(`\nC23-C37 — the storefront's real flows\n  target: webV2 storefront + admin, via tests/mixed/storefront.tflw`);
  const { report, output } = runCorpus(ROOT, ['tests/mixed/storefront.tflw']);
  if (!report) {
    for (const id of REAL_FLOW_IDS) {
      if (!wanted(id)) continue;
      fail(`${id} produced no report. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
      scores.get(id).skipped = 'no report';
    }
  } else {
    /** One test's steps, with the three questions every plant below asks of them. */
    const flow = (fragment) => {
      const test = named(report, fragment);
      const steps = stepsOf(test);
      const find = (re) => steps.filter((s) => re.test(s.source));
      return {
        test,
        steps,
        find,
        /** a step matching `re` exists and passed */
        okStep: (re) => find(re).some((s) => s.ok),
        /** the index of the first step matching `re`, or -1 */
        at: (re) => steps.findIndex((s) => re.test(s.source)),
      };
    };
    /** Recall is the same claim for every row: the flow it points at is still green. Stated once
     *  per test rather than once per row, so a test that disappears fails every row that named it
     *  rather than one of them. */
    const flowIsGreen = (ids, f, fragment) => {
      for (const id of ids) {
        if (!wanted(id)) continue;
        // A missing test is reported through `recall`, not through a bare `fail` beside it: two
        // reports of one problem inflate the mismatch count and make a rename look like two bugs.
        recall(id, f.test?.ok === true, f.test ? `"${fragment}…" is green (got ok=${f.test.ok})` : `"${fragment}…" is in the report at all — it was renamed or deleted`);
      }
    };

    // --- C23, C36, C37: the second browser tab ------------------------------
    const tabs = flow('receipt link genuinely opens a second browser tab');
    flowIsGreen(['C23', 'C36', 'C37'], tabs, 'receipt link genuinely opens a second browser tab');
    if (wanted('C23')) {
      recall('C23', tabs.okStep(/^\s*open "\/orders\/\{orderId\}"/), 'the interpolated navigation ran and passed');
      // The path is built from an id the test created three steps earlier, so the *source* keeping
      // its braces is what makes this an interpolation plant rather than a literal one. A rewrite
      // to a hard-coded order id would still pass every assertion in the test and grade nothing.
      precision('C23', tabs.find(/^\s*open "\/orders\/\{orderId\}"/).length === 1, 'the path is still interpolated, not a hard-coded id');
      precision('C23', tabs.at(/^\s*open "\/orders\/\{orderId\}"/) < tabs.at(/expect text "Order confirmed" is visible/), 'the heading is asserted after the navigation, not before it');
    }
    if (wanted('C36')) {
      recall('C36', tabs.okStep(/^\s*switch to new tab\s*$/), '`switch to new tab` caught the popup');
      recall('C36', tabs.okStep(/^\s*switch to tab 1\s*$/) && tabs.okStep(/^\s*switch to tab 2\s*$/), 'both numbered switches ran and passed');
      // `switch to tab 1` is only graded by what is asserted after it, and the heading it asserts
      // exists on tab 1 and not on the receipt PDF. Without that assertion sitting *between* the
      // two numbered switches, a `switch to tab N` that stayed put would pass unnoticed.
      const toOne = tabs.at(/^\s*switch to tab 1\s*$/);
      const heading = tabs.steps.findIndex((s, i) => i > toOne && /expect text "Order confirmed" is visible/.test(s.source));
      precision('C36', toOne !== -1 && heading !== -1 && heading < tabs.at(/^\s*switch to tab 2\s*$/), 'tab 1 is identified by a heading between the two numbered switches');
    }
    if (wanted('C37')) {
      recall('C37', tabs.okStep(/^\s*close tab\s*$/), '`close tab` ran and passed');
      const closed = tabs.at(/^\s*close tab\s*$/);
      precision('C37', tabs.at(/^\s*switch to tab 2\s*$/) < closed, 'the close happens with tab 2 in front, so closing the wrong tab is observable');
      precision('C37', tabs.steps.some((s, i) => i > closed && /expect text "Order confirmed" is visible/.test(s.source) && s.ok), 'an assertion that only holds on tab 1 runs after the close');
    }

    // --- C24, C25: two gestures, both graded by an absence --------------------
    const gestures = flow('double click and right click are real');
    flowIsGreen(['C24', 'C25'], gestures, 'double click and right click are real');
    if (wanted('C24')) {
      recall('C24', gestures.okStep(/^\s*double click button "Quick view"/), 'the double click ran and passed');
      recall('C24', gestures.okStep(/expect button "Close" is hidden/), 'the modal the first click opened was closed by the second');
      // `is hidden`, not `is visible`, is the entire plant. Someone tidying this test towards what
      // a double click "obviously" does would flip it and delete the known answer in one keystroke.
      precision('C24', gestures.find(/expect button "Close" is visible/).length === 0, 'nothing asserts the modal stayed open — that would be the opposite known answer');
    }
    if (wanted('C25')) {
      recall('C25', gestures.okStep(/^\s*right click button "Add to cart"/), 'the right click ran and passed');
      recall('C25', gestures.okStep(/expect text "Added 1 × Bulk Item 6 to your cart\." is hidden/), 'no click event was dispatched, so the toast never appeared');
      // The negative only means something because the positive is proven elsewhere in the same
      // file: an ordinary `click button "Add to cart"` really does raise this toast.
      const positive = report.tests.some((t) => (t.steps ?? []).some((s) => /expect text "Added 1 × .* to your cart\." is visible/.test(s.source) && s.ok));
      precision('C25', positive, 'an ordinary click on the same control raises the toast somewhere in this file — the absence is not an absence of everything');
    }

    // --- C26: the key ---------------------------------------------------------
    const escape = flow('Quick View modal traps focus');
    flowIsGreen(['C26'], escape, 'Quick View modal traps focus');
    if (wanted('C26')) {
      recall('C26', escape.okStep(/^\s*press "Escape"\s*$/), 'the key was pressed');
      const pressed = escape.at(/^\s*press "Escape"\s*$/);
      // **The step immediately before the key must prove the modal open**, and this is the whole
      // repair `M154d` made here. Until 2026-08-25 the `press` sat after a successful add-to-cart,
      // which `ProductQuickViewModal.tsx`'s `handleAdd` already closes — so the `is hidden` after
      // it was satisfied by the add, the key asserted nothing, and deleting the line left the test
      // green. A first-match search for "is visible" anywhere earlier would still pass on that old
      // shape; adjacency is what does not.
      precision('C26', pressed > 0 && /expect button "Close" is visible/.test(escape.steps[pressed - 1]?.source ?? ''), 'the step immediately before the key asserts the modal is OPEN');
      precision('C26', escape.steps.some((s, i) => i > pressed && /expect button "Close" is hidden/.test(s.source) && s.ok), 'and the step after it asserts the modal is closed');
    }

    // --- C27: the dropdown ----------------------------------------------------
    const select = flow('Category <select> really filters');
    flowIsGreen(['C27'], select, 'Category <select> really filters');
    if (wanted('C27')) {
      recall('C27', select.find(/^\s*select ".*" from field "Category"/).every((s) => s.ok) && select.find(/^\s*select ".*" from field "Category"/).length >= 2, 'both selections ran and passed');
      recall('C27', select.okStep(/has count 0/) && select.okStep(/has count 1/), 'the same search term yields 0 under one category and 1 under the other');
      // The zero is the half a broken `select` survives without. Assert it is still there *and*
      // still zero: `has count 0` rewritten to `has count 1` would leave two passing positives.
      precision('C27', select.find(/has count 0/).length === 1, 'exactly one of the two counts is the negative case');
    }

    // --- C28, C29, C30: the checkbox and the words that read it ---------------
    const check = flow("a11y-demo's accessible checkbox tick/untick");
    flowIsGreen(['C28', 'C29', 'C30'], check, "a11y-demo's accessible checkbox tick/untick");
    if (wanted('C28')) recall('C28', check.okStep(/^\s*tick field "Subscribe to updates"/), 'the tick ran and passed');
    if (wanted('C29')) recall('C29', check.okStep(/^\s*untick field "Subscribe to updates"/), 'the untick ran and passed');
    if (wanted('C30')) {
      const states = check.find(/expect field "Subscribe to updates" (not )?is checked/);
      recall('C30', states.length === 3 && states.every((s) => s.ok), `the subject is asserted in three states (got ${states.length})`);
      recall('C30', states.filter((s) => /not is checked/.test(s.source)).length === 2, 'two of the three are negations, so a matcher stuck at true fails here');
      // The order is the claim, not the count: unchecked -> tick -> checked -> untick -> unchecked.
      // Three assertions in any other arrangement grade something else.
      precision('C30', check.at(/expect field "Subscribe to updates" not is checked/) < check.at(/^\s*tick field/), 'the first negation runs before the tick');
      precision('C30', check.at(/^\s*tick field/) < check.at(/expect field "Subscribe to updates" is checked/) && check.at(/expect field "Subscribe to updates" is checked/) < check.at(/^\s*untick field/), 'the positive sits between the tick and the untick');
    }

    // --- C31: the drag --------------------------------------------------------
    const drag = flow('cart rows are drag-drop reorderable');
    flowIsGreen(['C31'], drag, 'cart rows are drag-drop reorderable');
    if (wanted('C31')) {
      recall('C31', drag.okStep(/^\s*drag css "\.drag-handle/), 'the drag ran and passed');
      const dragged = drag.at(/^\s*drag css "\.drag-handle/);
      const after = drag.steps.filter((s, i) => i > dragged && /tr:nth-child\(\d\) th:text-is/.test(s.source));
      recall('C31', after.length === 2 && after.every((s) => s.ok), `both rows are asserted by position after the drag (got ${after.length})`);
      // One row would pass for a table that merely re-rendered; two rows in the *same* position
      // would pass for a drag that did nothing. The pair has to disagree.
      precision('C31', new Set(after.map((s) => (s.source.match(/nth-child\((\d)\)/) ?? [])[1])).size === 2, 'the two assertions name different positions');
    }

    // --- C32: the drop --------------------------------------------------------
    const drop = flow("support page's drop-zone accepts a real file");
    flowIsGreen(['C32'], drop, "support page's drop-zone accepts a real file");
    if (wanted('C32')) {
      recall('C32', drop.okStep(/^\s*drop file ".*sample\.csv" onto /), 'the drop ran and passed');
      recall('C32', drop.okStep(/expect text "sample\.csv" is visible/), "the zone echoed the dropped file's own name back");
      // The zone has no file input, so there is no `fill field` fallback that could stand in for a
      // real DataTransfer. A test that grew one would grade the fallback instead of the step.
      precision('C32', drop.find(/^\s*fill field ".*[Ff]ile/).length === 0, 'nothing fills a file input — the drop is the only way the file arrives');
    }

    // --- C33: the stub, and the near-miss beside it ---------------------------
    const stub = flow("payment gateway's real fetch is stubbed");
    flowIsGreen(['C33'], stub, "payment gateway's real fetch is stubbed");
    if (wanted('C33')) {
      const stubs = stub.find(/^\s*stub (GET|POST) "https:\/\/payments\.example\.test/);
      recall('C33', stubs.length === 2 && stubs.every((s) => s.ok), `both stubs registered (got ${stubs.length})`);
      recall('C33', stub.okStep(/expect status of request to .* with method "POST" equals 500/), 'the POST stub is what the widget got');
      recall('C33', stub.okStep(/expect text "The payment gateway declined this card \(status 500\)\." is visible/), 'and its status surfaced through the app, not just through the report');
      // The GET row is the near-miss. Without it, a stub that matched on URL alone would look
      // correct; with it, that stub serves a 200 and the whole test goes green for the wrong
      // reason — which is why the two rows must disagree on both method and status.
      precision('C33', stubs.some((s) => /^\s*stub GET /.test(s.source) && /status 200/.test(s.source)), 'the GET near-miss is still there, still answering 200');
      precision('C33', stubs.some((s) => /^\s*stub POST /.test(s.source) && /status 500/.test(s.source)), 'and the POST row still disagrees with it');
    }

    // --- C34: the visual baseline --------------------------------------------
    const snap = flow('render fixture: a masked snapshot');
    flowIsGreen(['C34'], snap, 'render fixture: a masked snapshot');
    if (wanted('C34')) {
      const shots = snap.find(/matches snapshot "render-fixture-/);
      recall('C34', shots.length === 4 && shots.every((s) => s.ok), `four comparisons against two baselines (got ${shots.length})`);
      recall('C34', shots.filter((s) => /not matches snapshot/.test(s.source)).length === 1, 'exactly one is a `not` — the unmasked baseline catching the real change');
      // Two masked comparisons that bracket the same state change are what make the mask mean
      // something. One of them alone passes for a mask that is ignored.
      const masked = shots.filter((s) => /\bmask /.test(s.source));
      precision('C34', masked.length === 2 && masked.every((s) => !/not matches/.test(s.source)), 'both masked comparisons are positive, on either side of the change the unmasked one catches');
    }

    // --- C35: the accessibility scanner, both directions ----------------------
    const clean = flow('happy-path product and catalog pages have no accessibility violations');
    const dirty = flow("a11y-demo's inaccessible section");
    flowIsGreen(['C35'], clean, 'happy-path product and catalog pages have no accessibility violations');
    if (wanted('C35')) {
      recall('C35', dirty.test?.ok === true, dirty.test ? `"the a11y-demo's inaccessible section…" is green (got ok=${dirty.test.ok})` : '"the a11y-demo\'s inaccessible section…" is in the report at all — it was renamed or deleted');
      recall('C35', clean.find(/expect page has no a11y violations/).length === 2 && clean.find(/expect page has no a11y violations/).every((s) => s.ok), 'the scanner reports two real pages clean');
      const floors = dirty.find(/expect page not has no (minor |moderate |serious |critical )?a11y violations/);
      recall('C35', floors.length === 5 && floors.every((s) => s.ok), `and five severity floors red on the demo page (got ${floors.length})`);
      // `moderate` is the discriminating one and it is not obvious: **zero** violations on that
      // page are tagged moderate — only serious and critical exist — so this line passes under
      // floor semantics and fails under exact-match. Deleting it would leave four assertions that
      // an exact-match implementation also passes.
      precision('C35', floors.some((s) => /not has no moderate a11y violations/.test(s.source) && s.ok), 'the moderate floor — the one an exact-match implementation gets wrong — is still asserted');
    }

    // Precision, for every row at once: the evidence file still carries every flow these rows name.
    //
    // **The obvious check here — "the whole file is green" — was written first and then removed,
    // and the reason is worth keeping.** `storefront.tflw`'s header declares a known, accepted
    // flake: its reviews test submits alice's first-ever review of Bulk Item 1, so a *second* run
    // against a still-live stack 409s on what should be the first submission. That is fine for the
    // suite, which runs the file once per stack — but this grader runs it again, after
    // `regression.mjs`'s `mixed` phase already has. A file-wide assertion would therefore import
    // someone else's documented flake into this gate and go red on a build with nothing wrong with
    // it. Each row's own test is asserted green by `flowIsGreen`; what is left to check is that no
    // row is silently grading a test that has been renamed out from under it.
    const flows = ['receipt link genuinely opens a second browser tab', 'double click and right click are real',
      'Quick View modal traps focus', 'Category <select> really filters', "a11y-demo's accessible checkbox tick/untick",
      'cart rows are drag-drop reorderable', "support page's drop-zone accepts a real file",
      "payment gateway's real fetch is stubbed", 'render fixture: a masked snapshot',
      'happy-path product and catalog pages have no accessibility violations', "a11y-demo's inaccessible section"];
    const missing = flows.filter((f) => !named(report, f));
    for (const id of REAL_FLOW_IDS) {
      if (!wanted(id)) continue;
      precision(id, missing.length === 0, `all 11 flows this batch names are still in the evidence file (missing: ${missing.join('; ') || 'none'})`);
    }
  }
}

// --- C38: the download, which needs the admin console's own env ---------------
if (wanted('C38')) {
  const plant = plantFor('step:download');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  // Its own `tflw run`, and its own `--env`: `web` is one base URL per env (SPEC §3.2), so the
  // admin console at :8091 cannot be reached from the env the storefront tests use. Same reason
  // `regression.mjs` gives the console its own phase.
  const { report, output } = runCorpus(ROOT, [
    '--env', 'webv2Admin', plant.evidence.file,
    '--only', "the dashboard's Download orders CSV link exercises a real browser download",
  ]);
  if (!report) {
    fail(`C38 produced no report. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C38').skipped = 'no report';
  } else {
    const test = named(report, 'Download orders CSV link');
    const steps = stepsOf(test);
    recall('C38', test?.ok === true, `the plant passed (got ok=${test?.ok})`);
    recall('C38', steps.some((s) => /^\s*download as file\s*$/.test(s.source) && s.ok), 'a real download event fired off the link click');
    recall('C38', steps.some((s) => /^\s*expect \{file\} equals "orders-export\.csv"/.test(s.source) && s.ok), "and the step bound the server's own filename");
    // The literal is the plant. `orders-export.csv` is set by apiV2's `Content-Disposition` and
    // appears nowhere in the console's markup — the link reads "Download orders CSV" and points at
    // `/orders/export` — so a step binding the anchor text or the URL's last segment fails here.
    // Loosening this to `contains "csv"` would pass for all three.
    precision('C38', steps.filter((s) => /^\s*expect \{file\} /.test(s.source)).length === 1, 'exactly one assertion on the bound name');
    precision('C38', steps.some((s) => /equals "orders-export\.csv"/.test(s.source)), 'and it is still an equality against the exact name, not a substring');
    precision('C38', failingSteps(test).length === 0, `no step failed (got ${failingSteps(test).map((s) => `line ${s.line}: ${s.source.trim()}`).join('; ') || 'none'})`);
  }
}

// =============================================================================
// C39-C42 — hover, scroll to, screenshot, and the viewport key
// =============================================================================

// One corpus run serves `C39`, `C40`, `C41`'s positive half and `C42`'s control, because they are
// four tests in one file against one fixture page. `C41`'s negative half and `C42`'s configured
// half each need a run of their own — a different evidence level and a different `tflw.config`
// respectively, neither of which is expressible inside a single invocation.
const FIXTURE_IDS = ['C39', 'C40', 'C41', 'C42'];
if (FIXTURE_IDS.some(wanted)) {
  const hoverPlant = plantFor('step:hover');
  for (const id of FIXTURE_IDS) {
    if (!wanted(id)) continue;
    const p = PLANTS.find((x) => x.id === id);
    console.log(`\n${p.id} — ${p.title}\n  target: ${p.target}`);
  }
  const { report, output } = runCorpus(ROOT, [hoverPlant.evidence.file]);
  if (!report) {
    fail(`C39-C42 produced no report. Needs the stack, the storefront on :8090 and a browser.\n${output.trim().split('\n').slice(-12).join('\n')}`);
    for (const id of FIXTURE_IDS) if (wanted(id)) scores.get(id).skipped = 'no report';
  } else {
    const named = (fragment) => report.tests.find((t) => t.name.includes(fragment));
    const view = (fragment) => {
      const test = named(fragment);
      const steps = test?.steps ?? [];
      return {
        test,
        steps,
        at: (re) => steps.findIndex((st) => re.test(st.source)),
        okStep: (re) => steps.some((st) => re.test(st.source) && st.ok),
      };
    };

    // --- C39: hover -------------------------------------------------------------------------
    if (wanted('C39')) {
      const f = view('hover lands the pointer without clicking');
      if (!f.test) {
        recall('C39', false, 'the hover test is missing or was renamed — the roster names it, so a rename must update this grader');
      } else {
        recall('C39', f.okStep(/data-token='hovered:menu'/), 'the pointer arriving is observed');
        recall('C39', f.okStep(/expect text "pointer-is-over-the-menu" is visible/), 'and observed a second way, by an element absent from the DOM until the pointer arrives');
        recall('C39', f.test.ok === true, `the plant passed (got ok=${f.test.ok})`);

        // The three-point ordering IS the row. `none` before the hover establishes the starting
        // state, `hovered:menu` after it is the claim, and `clicked:menu` after the click is the
        // named wrong answer being shown reachable. Drop the last and a `hover` implemented as a
        // click passes; drop the first and a page that had always read `hovered:menu` passes.
        const before = f.at(/data-token='none'/);
        const hovered = f.at(/^\s*hover button "Open menu"/);
        const observed = f.at(/data-token='hovered:menu'/);
        const clicked = f.at(/^\s*click button "Open menu"/);
        const clickObserved = f.at(/data-token='clicked:menu'/);
        precision('C39', before >= 0 && before < hovered, `the starting state is asserted before the hover (none@${before}, hover@${hovered})`);
        precision('C39', hovered >= 0 && observed === hovered + 1, `the pointer token is asserted immediately after the hover (observed@${observed})`);
        precision('C39', clicked > observed && clickObserved > clicked, `the same button is then clicked and reports a different token (click@${clicked}, observed@${clickObserved})`);
      }
    }

    // --- C40: scroll to ---------------------------------------------------------------------
    if (wanted('C40')) {
      const f = view('scroll to really moves the viewport');
      if (!f.test) {
        recall('C40', false, 'the scroll test is missing or was renamed');
      } else {
        recall('C40', f.okStep(/data-seen='no'/), 'the sentinel is unseen before the scroll');
        recall('C40', f.okStep(/data-seen='yes'/), 'and latched seen after it');
        recall('C40', f.test.ok === true, `the plant passed (got ok=${f.test.ok})`);

        const unseen = f.at(/data-seen='no'/);
        const scrolled = f.at(/^\s*scroll to button "Bottom marker"/);
        const seen = f.at(/data-seen='yes'/);
        precision('C40', unseen >= 0 && unseen < scrolled && scrolled < seen,
          `the readout is asserted 'no' before the scroll and 'yes' after (no@${unseen}, scroll@${scrolled}, yes@${seen})`);
        // The trap this row exists to avoid, asserted so a future edit cannot walk into it: an
        // `is visible` on the marker itself would pass before any scrolling, because Playwright
        // visibility is a bounding box and has nothing to do with the viewport.
        precision('C40', !f.steps.some((st) => /expect button "Bottom marker" is visible/.test(st.source)),
          'the row does not assert visibility of the off-screen marker, which would pass unscrolled');
      }
    }

    // --- C41: screenshot, positive half -----------------------------------------------------
    if (wanted('C41')) {
      const f = view('screenshot captures at evidence full');
      const shot = f.steps.find((st) => /^\s*screenshot "step-fixture-observables"/.test(st.source));
      if (!f.test) {
        recall('C41', false, 'the screenshot test is missing or was renamed');
      } else {
        recall('C41', report.evidenceLevel === 'full', `the run really was at evidence full (got ${report.evidenceLevel})`);
        recall('C41', /captured$/.test(shot?.detail ?? ''), `the step reports a capture (got ${JSON.stringify(shot?.detail ?? null)})`);
        // Words are not enough for this row — see the plant's header. Decode what the report
        // actually carries and read the PNG's own IHDR.
        const png = shot?.screenshot?.base64 ? Buffer.from(shot.screenshot.base64, 'base64') : null;
        recall('C41', png !== null && png.length > 0 && png.subarray(1, 4).toString() === 'PNG',
          `the report carries real PNG bytes (got ${png ? `${png.length} bytes, magic ${JSON.stringify(png.subarray(1, 4).toString())}` : 'no payload'})`);
        const dims = png && png.length > 24 ? `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}` : 'unreadable';
        recall('C41', dims === '1280x720', `and the image is the size of the page that was open (got ${dims})`);
        precision('C41', shot?.ok === true, 'the step passed, as an evidence step always must');
      }
    }

    // --- C42: viewport, the unconfigured control --------------------------------------------
    if (wanted('C42')) {
      const f = view("the window starts at Playwright's own default");
      if (!f.test) {
        recall('C42', false, 'the default-viewport control is missing or was renamed');
      } else {
        recall('C42', f.okStep(/data-size='1280x720'/), 'with no `viewport` configured the window is Playwright’s own default');
        recall('C42', f.test.ok === true, `the control passed (got ok=${f.test.ok})`);
      }
    }

    for (const id of FIXTURE_IDS) {
      if (!wanted(id)) continue;
      const p = PLANTS.find((x) => x.id === id);
      const f = view(id === 'C39' ? 'hover lands' : id === 'C40' ? 'scroll to really' : id === 'C41' ? 'screenshot captures' : "Playwright's own default");
      precision(id, (f.test?.steps ?? []).every((st) => st.ok), `no step failed in ${p.construct}'s test`);
    }
  }
}

// C41's negative half — the same file, one evidence level down. `screenshot` still PASSES here;
// what changes is what it says it did, and that it carries no payload. A row that only ever ran at
// `evidence full` would not notice gating that had stopped working.
if (wanted('C41')) {
  const plant = plantFor('step:screenshot');
  const { report, output } = runCorpus(ROOT, [
    '--evidence', 'headers-only',
    plant.evidence.file,
    '--only', 'screenshot captures at evidence full and says so, and says so when it does not',
  ]);
  if (!report) {
    fail(`C41's evidence-off run produced no report.\n${output.trim().split('\n').slice(-12).join('\n')}`);
  } else {
    const test = report.tests[0];
    const shot = (test?.steps ?? []).find((st) => /^\s*screenshot "step-fixture-observables"/.test(st.source));
    recall('C41', report.evidenceLevel === 'headers-only', `the second run really was below full (got ${report.evidenceLevel})`);
    recall('C41', (shot?.detail ?? '').includes('not captured (evidence level)'),
      `and the step says it did not capture (got ${JSON.stringify(shot?.detail ?? null)})`);
    precision('C41', shot?.ok === true, 'the step still passes — it is evidence, never an assertion (interpreter.ts:3496)');
    precision('C41', !shot?.screenshot, 'and carries no image payload');
    precision('C41', test?.ok === true, `the test still passes at a lower evidence level (got ok=${test?.ok})`);
  }
}

// C42's configured half — its own directory, its own `tflw.config`, because `viewport` is legal
// only in `defaults` (`TF025`) and `defaults` is project-wide. cwd is the corpus, not ROOT: tflw
// reads `join(cwd, 'tflw.config')` (`cli.ts:1106`) and never walks up from the test file.
if (wanted('C42')) {
  const plant = plantFor('config:key:viewport');
  const corpus = path.join(ROOT, path.dirname(plant.evidence.file));
  const { report, output } = runCorpus(corpus, [path.basename(plant.evidence.file)]);
  if (!report) {
    fail(`C42's configured run produced no report (cwd ${corpus}).\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C42').skipped = 'no report';
  } else {
    const test = report.tests[0];
    const steps = test?.steps ?? [];
    recall('C42', steps.some((st) => /data-size='900x600'/.test(st.source) && st.ok),
      'the configured size is what the browser actually got');
    recall('C42', test?.ok === true, `the configured half passed (got ok=${test?.ok})`);
    // Both dimensions, and the reason is in the plant's header: a key read for width and dropped
    // for height would pass a plant whose two sizes shared one dimension.
    const cfg = readFileSync(path.join(corpus, 'tflw.config'), 'utf8');
    precision('C42', /^\s*viewport 900 600\s*$/m.test(cfg), 'the corpus config really declares `viewport 900 600`');
    precision('C42', !/^\s*viewport /m.test(readFileSync(path.join(ROOT, 'tflw.config'), 'utf8')),
      'and the ROOT config declares none, so the control is a genuine default rather than a second configured value');
    precision('C42', steps.every((st) => st.ok), 'no step failed');
  }
}

// C54 — the `evidence` key, `M154f`. Same shape as `C42` above and for the same structural reason:
// the key is project-wide, so it needs its own config root rather than a line in the root config
// that would change what every other plant's report contains.
//
// **What separates this from `C41` is the absence of a flag.** `C41` proves the *level* changes what
// a `screenshot` step does, and it sets that level with `--evidence` both times. This run passes no
// `--evidence` at all, so the level can only have arrived from `defaults`. The control is `C41`'s own
// default-level run above — same step, same page, no key, `not captured (evidence level)` — which is
// why this half asserts the positive and the ROOT config is asserted to declare nothing.
if (wanted('C54')) {
  const plant = plantFor('config:key:evidence');
  const corpus = path.join(ROOT, path.dirname(plant.evidence.file));
  // `plant.run`, not `basename(plant.evidence.file)` — this plant's witness IS its config, so the
  // two differ here and nowhere else. See the field's comment in `constructs.mjs`.
  const { report, output } = runCorpus(corpus, [plant.run ?? path.basename(plant.evidence.file)]);
  if (!report) {
    fail(`C54's configured run produced no report (cwd ${corpus}).\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C54').skipped = 'no report';
  } else {
    const test = report.tests[0];
    const shot = (test?.steps ?? []).find((st) => /^\s*screenshot "evidence-key-configured"/.test(st.source));
    recall('C54', report.evidenceLevel === 'full', `the run was at full evidence with no flag passed (got ${report.evidenceLevel})`);
    recall('C54', /captured$/.test(shot?.detail ?? ''), `the step reports a capture (got ${JSON.stringify(shot?.detail ?? null)})`);
    // Same reason as `C41`: a step can report a capture it did not make, so decode what the report
    // actually carries rather than trusting its own sentence about itself.
    const png = shot?.screenshot?.base64 ? Buffer.from(shot.screenshot.base64, 'base64') : null;
    recall('C54', png !== null && png.length > 0 && png.subarray(1, 4).toString() === 'PNG',
      `the report carries real PNG bytes (got ${png ? `${png.length} bytes` : 'no payload'})`);
    const dims = png && png.length > 24 ? `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}` : 'unreadable';
    recall('C54', dims === '1280x720', `and no viewport key moved the page underneath it (got ${dims})`);
    // The two halves of "the key did it": the corpus config declares the level, and no command line
    // could have. `runCorpus` above passes only the file name, and the ROOT config sets nothing —
    // so a green here with the key deleted would have to come from a default that is not the default.
    const cfg = readFileSync(path.join(corpus, 'tflw.config'), 'utf8');
    precision('C54', /^\s*evidence full\s*$/m.test(cfg), 'the corpus config really declares `evidence full`');
    precision('C54', !/^\s*evidence\s/m.test(readFileSync(path.join(ROOT, 'tflw.config'), 'utf8')),
      'and the ROOT config declares no level, so the control is a genuine default rather than a second configured value');
    precision('C54', !/^\s*viewport\s/m.test(cfg), 'and declares no `viewport`, so the IHDR check above grades this key and not that one');
    precision('C54', test?.ok === true, `the configured half passed (got ok=${test?.ok})`);
  }
}

// =============================================================================
// C60-C66 — the seven matchers that carry this suite's API assertions, and the
// twelve `not` lines that are the only thing standing between them and vacuity
// =============================================================================
//
// `M154g` step 2. One plant, one run, seven rows — and then the run again with every `not` removed.
//
// **The second run is the point.** `matchers-explained.tflw` has exercised all seven of these for a
// dozen milestones with assertions that are all positive, so a matcher stuck at `true` passes every
// one of them; `D722` calls that presence, not a known answer. The plant answers with pairs. But a
// pair written down is still only a claim that the negative half discriminates, and this gate is in
// the business of refusing claims — so it *mutates the plant* and demands the reds.
//
// The mutation is mechanical and total: every `expect <subject> not <matcher>` line becomes
// `check <subject> <matcher>` — `not` dropped so the assertion inverts, `expect` softened to `check`
// so one red does not abort the test and hide the eleven behind it. Every one of the twelve must
// then fail. If a future edit adds a `not` line that does not discriminate, this run stays green
// where it should not, and the count assertion below is what catches the transformation missing it.
const MATCHER_ROWS = [
  { id: 'C60', construct: 'matcher:equals', name: 'equals is exact', negatives: ['not equals "Known-Answer"', 'not equals "known-answer "', 'not equals 4'] },
  { id: 'C61', construct: 'matcher:contains', name: 'contains is substring on a string', negatives: ['not contains "own ans"', 'not contains "plan"'] },
  { id: 'C62', construct: 'matcher:matches-regex', name: 'matches is a regular expression', negatives: ['not matches "^eur$"'] },
  { id: 'C63', construct: 'matcher:matches-subset', name: 'matches subset ignores the keys', negatives: ['not matches subset { label: "known-answer", price: 41 }'] },
  { id: 'C64', construct: 'matcher:matches-schema', name: 'matches schema validates against', negatives: ['not matches schema "ProductResponseDto"'] },
  { id: 'C65', construct: 'matcher:greater-less-than', name: 'greater than and less than are strict', negatives: ['not is greater than 42', 'not is less than 42'] },
  { id: 'C66', construct: 'matcher:has-count', name: 'has count is an exact length', negatives: ['not has count 1', 'not has count 3'] },
];

if (MATCHER_ROWS.some((r) => wanted(r.id))) {
  const plant = plantFor('matcher:equals');
  console.log(`\nC60-C66 — seven matchers, twelve discriminating negatives\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  if (!report) {
    for (const row of MATCHER_ROWS) {
      if (!wanted(row.id)) continue;
      fail(`${row.id} produced no report. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
      scores.get(row.id).skipped = 'no report';
    }
  } else {
    for (const row of MATCHER_ROWS) {
      if (!wanted(row.id)) continue;
      const test = named(report, row.name);
      recall(row.id, test?.ok === true, `the pair held (got ok=${test?.ok})`);
      for (const neg of row.negatives) {
        const step = stepsOf(test).find((st) => st.source.includes(neg));
        recall(row.id, step?.ok === true, `\`${neg}\` is in the plant and held (got ${step ? `ok=${step.ok}` : 'no such step'})`);
      }
      // Precision: no negative was quietly dropped in an edit. The count, not the presence — a row
      // that lost one of its three `not` lines still passes every assertion above.
      const nots = stepsOf(test).filter((st) => /\bnot\b/.test(st.source)).length;
      precision(row.id, nots === row.negatives.length, `${row.negatives.length} negative(s) in the test and no more (got ${nots})`);
    }

    // The mutation control. Written beside the plant with a leading dot so tflw's own discovery
    // cannot pick it up, run by explicit path, and removed in `finally` — a leftover would be a
    // permanently-failing file in a directory the bare sweep does not walk, which is the quiet kind.
    const src = readFileSync(path.join(ROOT, plant.evidence.file), 'utf8');
    const control = path.join(ROOT, 'tests', '.constructs', '.discrimination-control.tflw');
    let flipped = 0;
    const mutated = src
      .split('\n')
      .map((ln) => {
        const m = /^(\s*)expect (.*?) not (.*)$/.exec(ln);
        if (!m) return ln;
        flipped += 1;
        return `${m[1]}check ${m[2]} ${m[3]}`;
      })
      .join('\n');
    const expected = MATCHER_ROWS.reduce((n, r) => n + r.negatives.length, 0);
    try {
      writeFileSync(control, mutated);
      const { report: ctl, output: ctlOut } = runCorpus(ROOT, ['tests/.constructs/.discrimination-control.tflw']);
      // `flipped` is asserted against the roster's own arithmetic rather than against a literal, so
      // adding a negative to the plant without adding it to `MATCHER_ROWS` is red here and not later.
      precision('C60', flipped === expected,
        `the control inverted every negative in the plant (${flipped} flipped, ${expected} rostered across C60-C66)`);
      if (!ctl) {
        fail(`the C60-C66 mutation control produced no report.\n${ctlOut.trim().split('\n').slice(-12).join('\n')}`);
      } else {
        const softs = functionalTests(ctl).flatMap((t) => stepsOf(t)).filter((st) => st.kind === 'check');
        const survived = softs.filter((st) => st.ok).map((st) => st.source.trim());
        recall('C60', softs.length === expected, `all ${expected} inverted assertions ran (got ${softs.length}) — a `
          + 'hard `expect` here would abort each test at its first red and hide the rest');
        recall('C60', survived.length === 0,
          `every one of them failed, so no negative in the plant is decoration (survived: ${survived.join('; ') || 'none'})`);
      }
    } finally {
      rmSync(control, { force: true });
    }
  }
}

// =============================================================================
// C67, C70, C71, C72 — the workhorse steps, graded against a server-side arrival counter
// =============================================================================
//
// Same sharp edge as C4/C5 and for the same reason: these two corpora reset `/v1/lifecycle/*` in
// their `before file`, so each one's counts must be read back before the next runs.
//
// The corpus-level precision claim is the one worth reading. `step-workhorses.tflw` declares five
// marks — two for `c67once`, two for `c70-{tag}`, one for `c71logged` — and the grader asserts the
// total is exactly five. That single number is `step:api`'s contract at file scope: any step that
// issued a request it was not asked to issue moves it, and no assertion inside the file could.

const WORKHORSE_IDS = ['C67', 'C70', 'C71', 'C72'];
if (WORKHORSE_IDS.some((id) => wanted(id))) {
  const plant = plantFor('step:api');
  console.log(`\n${plant.id}, C70, C71, C72 — the workhorse steps\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  const counts = await lifecycleCounts();
  if (!report || !counts) {
    fail(`${plant.id} produced no ${report ? lifecycleSkipReason() : 'report'}. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    for (const id of WORKHORSE_IDS) scores.get(id).skipped = report ? lifecycleSkipReason() : 'no report';
  } else {
    const marks = counts.marks ?? {};
    const attempts = counts.attempts ?? {};

    // --- C67 `api` -----------------------------------------------------------
    const once = named(report, 'exactly one request');
    const apiSteps = stepsOf(once).filter((st) => st.kind === 'api');
    recall('C67', marks['c67once'] === 2, `\`c67once\` arrived exactly twice for two \`api\` steps (got ${marks['c67once'] ?? 0}) — one step, one request`);
    recall('C67', apiSteps.length === 2 && apiSteps.every((st) => st.ok), `both \`api\` steps are in the report and both passed (got ${apiSteps.length})`);
    recall('C67', once?.ok === true, `the in-band assertions on the server's own count passed (got ok=${once?.ok}) — \`count: 1\` then \`count: 2\``);

    // Precision, and the assertion this whole plant exists for: the file declares five marks, so
    // five is what the server must have seen. An extra request anywhere in the corpus — a silent
    // retry, a duplicated send, a preflight — lands here and nowhere else.
    const totalMarks = Object.values(marks).reduce((n, v) => n + v, 0);
    precision('C67', totalMarks === 5, `the corpus issued exactly the five marks it declares (got ${totalMarks}: ${JSON.stringify(marks)})`);
    const strayLabels = Object.keys(marks).filter((k) => k !== 'c67once' && k !== 'c71logged' && !/^c70-/.test(k));
    precision('C67', strayLabels.length === 0, `no label was marked beyond the three the plant declares (stray: ${strayLabels.join(', ') || 'none'})`);

    // --- C70 `let` -----------------------------------------------------------
    const bound = named(report, 'binds its value once');
    const c70Labels = Object.keys(marks).filter((k) => /^c70-/.test(k));
    recall('C70', c70Labels.length === 1, `the two interpolations of \`{tag}\` produced ONE label (got ${c70Labels.length}: ${c70Labels.join(', ') || 'none'}) — two would mean \`let\` re-evaluates at each use`);
    recall('C70', marks[c70Labels[0]] === 2, `and that one label was marked twice (got ${marks[c70Labels[0]] ?? 0})`);
    const letStep = stepsOf(bound).find((st) => st.kind === 'let');
    recall('C70', /^tag = "[A-Za-z0-9]{8}" \(random\)$/.test(String(letStep?.detail ?? '')), `the binding is a fresh 8-character random string, per the report (got ${JSON.stringify(letStep?.detail ?? null)}) — a literal could not tell the two implementations apart`);
    precision('C70', stepsOf(bound).filter((st) => st.kind === 'api').length === 2, `the test made exactly two requests (got ${stepsOf(bound).filter((st) => st.kind === 'api').length})`);

    // --- C71 `log` -----------------------------------------------------------
    // `log` never fails, so like C41's `screenshot` there is nothing here a verdict can grade. The
    // known answer is the shape of the step in the report.
    const logged = named(report, 'writes one authored line');
    const logSteps = functionalTests(report).flatMap((t) => stepsOf(t)).filter((st) => st.kind === 'log');
    const logStep = stepsOf(logged).find((st) => st.kind === 'log');
    recall('C71', logStep !== undefined, `the \`log\` step reached \`report/results.json\` at all — a line that only went to stdout leaves nothing here`);
    recall('C71', String(logStep?.detail ?? '') === 'c71 observed c71logged', `its message is interpolated, not stored as source (got ${JSON.stringify(logStep?.detail ?? null)}) — \`{subject}\` is a capture from the step above`);
    recall('C71', logStep?.level === 'warn', `the authored level survived into the report (got ${JSON.stringify(logStep?.level ?? null)}) — a dropped level reports the default`);
    recall('C71', logStep?.destination === 'both', `and it is recorded as reaching both the run log and the report (got ${JSON.stringify(logStep?.destination ?? null)})`);
    precision('C71', logSteps.length === 1, `exactly one \`log\` step in the whole corpus (got ${logSteps.length})`);

    // --- C72 `wait` ----------------------------------------------------------
    // Three readings of one number. The first two prove it re-issued; only the third proves it
    // stopped, which is the half a passing wait cannot show about itself.
    const waited = named(report, 're-issues the request');
    const waitStep = stepsOf(waited).find((st) => st.kind === 'wait');
    recall('C72', attempts['c72settles'] === 3, `\`c72settles\` was attempted exactly 3 times (got ${attempts['c72settles'] ?? 0}) — fewer means the wait never re-issued, more means it did not stop when its condition held`);
    recall('C72', /passed after 3 attempts/.test(String(waitStep?.detail ?? '')), `tflw's own report agrees it took 3 attempts (got ${JSON.stringify(waitStep?.detail ?? null)}) — a disagreement between this and the count above is a more interesting defect than either being wrong alone`);
    recall('C72', waited?.ok === true, `and the in-band \`expect body.attempt equals 3\` passed (got ok=${waited?.ok})`);
    const strayAttempts = Object.keys(attempts).filter((k) => k !== 'c72settles');
    precision('C72', strayAttempts.length === 0, `no key was attempted beyond the one the plant declares (stray: ${strayAttempts.join(', ') || 'none'})`);
  }
}

// =============================================================================
// C68, C69 — `expect` and `capture`: the contracts about what does not happen next
// =============================================================================
//
// This corpus is **meant to fail**, the same way `retry-attempt-budget.tflw` is. Two of its three
// tests must end red, and the known answer is a label the server never sees.
//
// An absence is a weak observation, so it is made twice. The plant marks immediately *before* the
// step that must fail, which rules out a test that never started; and the grader then re-runs the
// file with the failing `expect` softened to `check` and requires the absent label to **appear**.
// That control is the same instrument step 2 introduced, pointed the other way: there the mutation
// had to make passing assertions fail, here it has to make a missing arrival happen.

const HARD_STOP_IDS = ['C68', 'C69', 'C73'];
if (HARD_STOP_IDS.some((id) => wanted(id))) {
  const plant = plantFor('step:expect');
  console.log(`\n${plant.id}, C69 — the hard-stop contracts\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  const counts = await lifecycleCounts();
  if (!report || !counts) {
    fail(`${plant.id} produced no ${report ? lifecycleSkipReason() : 'report'}. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    // `C73` rides this same run (below), so it is skipped from here too — otherwise it reports
    // "recorded no assertions at all" with no reason attached, which reads as a bug in the gate
    // rather than as a stack that is down.
    for (const id of HARD_STOP_IDS) scores.get(id).skipped = report ? lifecycleSkipReason() : 'no report';
  } else {
    const marks = counts.marks ?? {};

    // --- C68 `expect` --------------------------------------------------------
    // Each assertion group is gated on its own id: `C73` now shares this run, and `--only C73`
    // must not report a failure belonging to a plant the caller did not ask for.
    if (wanted('C68')) {
      const halts = named(report, 'ends the test at once');
      const haltSteps = stepsOf(halts);
      recall('C68', marks['c68before'] === 1, `the test reached the step before the failing \`expect\` (got ${marks['c68before'] ?? 0}) — this is what makes the absence below a fact about \`expect\``);
      recall('C68', marks['c68after'] === undefined, `and never reached the step after it (got ${marks['c68after'] ?? 'absent'}) — under \`check\` semantics this label would be at 1, which is the single number separating the two constructs`);
      recall('C68', halts?.ok === false, `the test's own verdict is FAIL (got ok=${halts?.ok})`);
      recall('C68', haltSteps.at(-1)?.kind === 'expect' && haltSteps.at(-1)?.ok === false, `the report's step list ends at the failing \`expect\` (ends at ${haltSteps.at(-1)?.kind}, ok=${haltSteps.at(-1)?.ok})`);
      precision('C68', haltSteps.length === 3, `exactly three steps were recorded, not the four the file contains (got ${haltSteps.length})`);
      precision('C68', failingSteps(halts).length === 1, `exactly one step failed (got ${failingSteps(halts).length}) — a hard assertion that kept going would record more`);
    }

    // --- C69 `capture` -------------------------------------------------------
    if (wanted('C69')) {
      const nothing = named(report, 'resolves to nothing');
      const nothingSteps = stepsOf(nothing);
      const captureStep = nothingSteps.find((st) => st.kind === 'capture');
      recall('C69', captureStep?.ok === false, `the \`capture\` step itself failed (got ok=${captureStep?.ok}) — the contract is that the step fails, not that some later interpolation looks odd`);
      recall('C69', /nothing to capture/.test(String(captureStep?.detail ?? '')), `and said why (got ${JSON.stringify(String(captureStep?.detail ?? '').slice(0, 60))})`);
      recall('C69', marks['c69before'] === 1 && marks['c69after'] === undefined, `the step before it ran and the step after it did not (before=${marks['c69before'] ?? 0}, after=${marks['c69after'] ?? 'absent'})`);
      precision('C69', nothingSteps.length === 3, `exactly three steps were recorded, not the four the file contains (got ${nothingSteps.length})`);

      // The half `tflw spec --json` does not state: a capture binds a value, not a live reference.
      const bindsValue = named(report, 'not a live reference');
      recall('C69', bindsValue?.ok === true, `the capture survived a second request unchanged (got ok=${bindsValue?.ok}) — a lazy read against "the response in scope" answers \`c69second\` here`);
      precision('C69', marks['c69bound'] === 1 && marks['c69second'] === 1, `both of that test's requests arrived exactly once (bound=${marks['c69bound'] ?? 0}, second=${marks['c69second'] ?? 0})`);
    }

    // --- C73 `test` -----------------------------------------------------------
    // Rides this run rather than paying for one of its own, and rides THIS file rather than a
    // green one on purpose: "the next test still ran" is only a claim where an earlier one failed.
    // Count alone cannot carry it — a runner that reports per *file* and one that abandons a file
    // at its first failing test both produce a single verdict — so the third test's own verdict is
    // asserted too.
    if (wanted('C73')) {
      const declared = [
        'a failing `expect` ends the test at once — the step after it never runs',
        'a `capture` that resolves to nothing fails the step rather than binding undefined',
        '`capture` binds the value it read, not a live reference to the current response',
      ];
      const reported = functionalTests(report);
      recall('C73', reported.length === 3, `three \`test\` declarations produced three reported tests (got ${reported.length}) — a per-file reporter produces 1`);
      recall(
        'C73',
        JSON.stringify(reported.map((t) => t.name)) === JSON.stringify(declared),
        `each carries its own declared name, in declaration order (got ${JSON.stringify(reported.map((t) => t.name))})`,
      );
      recall(
        'C73',
        reported[2]?.ok === true,
        `and the third test PASSED although the first two failed (got ok=${reported[2]?.ok}) — the half a count cannot state: a runner that stopped the file at its first failure also reports fewer tests, so the two wrong implementations are indistinguishable without a verdict`,
      );
      precision('C73', reported.filter((t) => t.ok === false).length === 2, `exactly two of the three failed (got ${reported.filter((t) => t.ok === false).length}) — the file's known answer, not a floor`);
      precision('C73', reported.every((t) => String(t.file ?? '').endsWith('hard-stop-semantics.tflw')), 'every reported test is attributed to the file that declared it');
    }

    // --- the control: soften the `expect` and the absent label must appear ----
    // Gated on its two owners: it costs an extra corpus run, and `--only C73` has no use for it.
    if (wanted('C68') || wanted('C69')) {
      const src = readFileSync(path.join(ROOT, plant.evidence.file), 'utf8');
      const control = path.join(ROOT, 'tests', '.constructs', '.hard-stop-control.tflw');
      const mutated = src.replace(
        /^(\s*)expect (body\.label equals "not-the-label-the-server-echoed")$/m,
        (_m, indent, rest) => `${indent}check ${rest}`,
      );
      try {
        const softened = mutated !== src;
        precision('C68', softened, 'the control mutation found the assertion it softens — if this fails the two readings below prove nothing');
        writeFileSync(control, mutated);
        runCorpus(ROOT, ['tests/.constructs/.hard-stop-control.tflw']);
        const ctl = (await lifecycleCounts()) ?? {};
        const ctlMarks = ctl.marks ?? {};
        recall('C68', ctlMarks['c68after'] === 1, `with the same assertion written as \`check\`, the step after it DOES run (got ${ctlMarks['c68after'] ?? 'absent'}) — so the absence above is caused by \`expect\`, not by the assertion being false`);
        // And the capture negative is untouched by that mutation, so its absence must survive it.
        recall('C69', ctlMarks['c69after'] === undefined, `while \`c69after\` is still absent in the control (got ${ctlMarks['c69after'] ?? 'absent'}) — the softening was scoped to one line`);
      } finally {
        rmSync(control, { force: true });
      }
    }
  }
}

// =============================================================================
// C74, C75, C76 — import, with each, @tag: which tests exist, and which of them run
// =============================================================================
//
// The three constructs that decide the *shape of a run* before a step executes. Each is used
// constantly in this suite and each has its effect hidden by the suite's own shape:
//
//   `import`      every use proves an action arrived — the manifest's claim is that a test did NOT
//   `with each`   rows looped inside ONE reported test pass every existing use here
//   `@tag`        every ordinary run is unfiltered, so a tag that selected nothing stays green
//
// All three are read off `POST /v1/lifecycle/mark`'s arrival counter, because in all three cases
// the question is which requests were issued at all rather than what any response said.

if (wanted('C74')) {
  const plant = plantFor('declaration:import');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  const counts = await lifecycleCounts();
  if (!report || !counts) {
    fail(`${plant.id} produced no ${report ? lifecycleSkipReason() : 'report'}. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C74').skipped = report ? lifecycleSkipReason() : 'no report';
  } else {
    const marks = counts.marks ?? {};
    const reported = functionalTests(report);

    // The positive half, and it has to come first: without it every absence below is satisfied by
    // an `import` that resolved to nothing, failed silently, or was never processed at all.
    recall('C74', marks['c74action'] === 1, `the imported file's \`action\` ran here exactly once (got ${marks['c74action'] ?? 'absent'}) — this is what makes the absences below mean *excluded* rather than *never loaded*`);
    recall('C74', reported[0]?.ok === true, `and the importing test passed, so \`give\` carried the count back across the import (got ok=${reported[0]?.ok})`);

    // The negative half — the manifest's actual claim.
    recall('C74', marks['c74importedtest'] === undefined, `the imported file's own test never ran (got ${marks['c74importedtest'] ?? 'absent'}) — it is a PASSING test that marks a label, so if imports registered tests this would be 1`);
    recall('C74', reported.length === 1, `exactly one test was reported (got ${reported.length}): the importer's own`);
    precision(
      'C74',
      reported.every((t) => !String(t.file ?? '').endsWith('imported-suite.tflw')),
      `and none of them is attributed to the imported file (got ${JSON.stringify(reported.map((t) => t.file))})`,
    );
    const stray = Object.keys(marks).filter((k) => k !== 'c74action');
    precision('C74', stray.length === 0, `the corpus issued exactly the one mark it declares (stray: ${stray.join(', ') || 'none'})`);
  }
}

if (wanted('C75')) {
  const plant = plantFor('declaration:with-each');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  const counts = await lifecycleCounts();
  if (!report || !counts) {
    fail(`${plant.id} produced no ${report ? lifecycleSkipReason() : 'report'}. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C75').skipped = report ? lifecycleSkipReason() : 'no report';
  } else {
    const marks = counts.marks ?? {};
    const reported = functionalTests(report);

    // Reporting: three rows, three verdicts. A `with each` that looped inside one reported test
    // sends the same three requests and passes the same three assertions — this line is the only
    // one that separates it from the real thing.
    recall('C75', reported.length === 3, `three rows produced three reported tests (got ${reported.length}) — a loop inside one reported test issues the same three requests and differs only here`);
    recall('C75', reported.every((t) => t.ok === true), `all three passed (got ${reported.filter((t) => !t.ok).length} failing)`);
    const names = reported.map((t) => t.name ?? '');
    recall(
      'C75',
      ['alpha', 'beta', 'gamma'].every((row) => names.some((n) => n.includes(`this is row ${row}`))),
      `each name carries its own row value interpolated (got ${JSON.stringify(names)})`,
    );
    precision('C75', new Set(names).size === 3, `the three names are distinct (got ${new Set(names).size} unique)`);

    // Execution: one row, one run, one value. The in-band `expect body.count equals 1` already
    // covers a row run twice; this reads the same fact off the server, and adds that the three rows
    // were three DIFFERENT values rather than one value spent three times.
    for (const row of ['alpha', 'beta', 'gamma']) {
      recall('C75', marks[`c75${row}`] === 1, `row \`${row}\` executed exactly once, with its own value (got ${marks[`c75${row}`] ?? 'absent'})`);
    }
    const total = Object.values(marks).reduce((n, v) => n + v, 0);
    precision('C75', total === 3, `the corpus issued exactly the three marks it declares (got ${total}: ${JSON.stringify(marks)})`);
  }
}

// `@tag` is the one plant here that cannot be graded from a single run: a filter is only observable
// as a *difference* between selections. Four runs, and the file resets the counter in its own
// `before file`, so each run's counts are that run's alone — read back between runs, never batched
// (the same sharp edge `C4`/`C5` carry, one layer out).
if (wanted('C76')) {
  const plant = plantFor('declaration:tags');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const file = plant.evidence.file;

  /** One selection, and what the server saw under it. */
  const select = async (args) => {
    const { report, output } = runCorpus(ROOT, [...args, file]);
    const counts = await lifecycleCounts();
    return { report, output, marks: (counts ?? {}).marks ?? null, arrived: Object.keys((counts ?? {}).marks ?? {}).sort() };
  };

  // Run FIRST, deliberately. It is a usage error, so tflw exits before writing a report — and this
  // phase's `report/` is what `archivePhaseReport` carries into `report-by-phase/`. Ending the
  // block on a run that wrote nothing would archive the previous selection's artifacts with no
  // `results.json` beside them, which is a confusing thing to hand a reader for no gain.
  //
  // The assertion is the negative the manifest itself used to get wrong (tflw `M154g-03`): tags
  // select, they never deselect. `SPEC` §4.1 — "No exclusion syntax". Run, not read off a doc.
  const excluded = runCorpus(ROOT, ['--exclude-tag', 'c76beta', file]);
  precision(
    'C76',
    /unknown flag `--exclude-tag`/.test(excluded.output),
    `there is no exclusion flag — \`--exclude-tag\` is refused by name (got ${JSON.stringify(excluded.output.trim().split('\n')[0] ?? '')})`,
  );

  const unfiltered = await select([]);
  if (!unfiltered.report || !unfiltered.marks) {
    fail(`${plant.id} produced no ${unfiltered.report ? 'lifecycle counts' : 'report'}. Is the stack up (\`node cli.mjs start\`)?\n${unfiltered.output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C76').skipped = unfiltered.report ? 'no lifecycle counts' : 'no report';
  } else {
    const alpha = await select(['--tag', 'c76alpha']);
    const beta = await select(['--tag', 'c76beta']);
    const both = await select(['--tag', 'c76alpha,c76beta']);

    const eq = (got, want) => JSON.stringify(got) === JSON.stringify(want);
    const ALL = ['c76alpha', 'c76beta', 'c76both'];

    recall('C76', eq(unfiltered.arrived, ALL), `unfiltered, all three tests ran (got ${JSON.stringify(unfiltered.arrived)}) — the baseline that makes every absence below a filter rather than a broken file`);

    // The two load-bearing readings. Runs 1 and 4 are both satisfied by a `--tag` that filters
    // nothing at all; run 2 alone is satisfied by one that reads only a declaration's FIRST tag.
    // It is run 3, the exact complement, that leaves no such implementation standing.
    recall('C76', eq(alpha.arrived, ['c76alpha', 'c76both']), `\`--tag c76alpha\` ran the alpha-tagged test and the both-tagged one, and NOT c76beta (got ${JSON.stringify(alpha.arrived)})`);
    recall('C76', eq(beta.arrived, ['c76beta', 'c76both']), `\`--tag c76beta\` is the exact complement (got ${JSON.stringify(beta.arrived)}) — without this run, a \`--tag\` reading only each test's first tag passes the line above`);
    recall('C76', eq(both.arrived, ALL), `\`--tag c76alpha,c76beta\` is the union, not the intersection (got ${JSON.stringify(both.arrived)}) — OR across a comma-separated list`);

    recall('C76', functionalTests(alpha.report).length === 2 && functionalTests(both.report).length === 3, `the report agrees with the counter on how many tests ran (--tag c76alpha: ${functionalTests(alpha.report).length}, --tag both: ${functionalTests(both.report).length})`);
    precision('C76', [unfiltered, alpha, beta, both].every((r) => Object.values(r.marks).every((n) => n === 1)), 'no selection ran any test more than once');
  }
}

// =============================================================================
// C77-C80 — `M154g` step 2d: the four `declaration` rows about scope and identity
// =============================================================================

if (wanted('C77')) {
  const plant = plantFor('declaration:action');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  const counts = await lifecycleCounts();
  if (!report || !counts) {
    fail(`${plant.id} produced no ${report ? lifecycleSkipReason() : 'report'}. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C77').skipped = report ? lifecycleSkipReason() : 'no report';
  } else {
    const marks = counts.marks ?? {};
    const reported = functionalTests(report);

    // The third reading, and it comes first for the same reason it does in `C74`: without it the
    // scope assertion below is satisfied by an action that never executed a single step.
    recall('C77', marks['c77inner'] === 1, `the action's own request went out exactly once (got ${marks['c77inner'] ?? 'absent'}) — otherwise the caller's \`body\` surviving is a fact about nothing`);
    recall('C77', marks['c77outer'] === 1, `and the caller's did too (got ${marks['c77outer'] ?? 'absent'}), so both responses really existed and the later one is the action's`);

    // `FU-12` itself. Both directions are in-band, so the verdict carries them — but the two are
    // named separately here, because a green test would otherwise report one fact where the
    // manifest makes two claims.
    recall('C77', reported.length === 1 && reported[0]?.ok === true, `the test passed (got ${reported.length} test(s), ok=${reported[0]?.ok}): \`give\` carried a value out AND the caller still read its own response afterwards`);
    const steps = stepsOf(reported[0]);
    const bad = failingSteps(reported[0]);
    precision('C77', bad.length === 0, `no step failed (got ${bad.length}: ${JSON.stringify(bad.map((s) => s.name ?? s.kind))})`);
    precision('C77', steps.length >= 6, `and the test really ran its body rather than short-circuiting (got ${steps.length} steps)`);
    const stray = Object.keys(marks).filter((k) => k !== 'c77inner' && k !== 'c77outer');
    precision('C77', stray.length === 0, `the corpus issued exactly the two marks it declares (stray: ${stray.join(', ') || 'none'})`);
  }
}

// `use` is the one construct in this tier whose contract is half runtime and half checker, so it is
// graded twice. The `tflw check` pair runs first and needs no stack at all.
if (wanted('C78')) {
  const plant = plantFor('declaration:use');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);

  const WITHOUT = 'tests/.constructs/check-unknown-call-without-use.tflw';
  const WITH = 'tests/.constructs/check-unknown-call-with-use.tflw';
  const withoutOut = runCheck([WITHOUT]);
  const withOut = runCheck([WITH]);

  // The control, and it is load-bearing: "no TF037 on the file with `use`" is equally satisfied by
  // a checker that never emits TF037, which is precisely the regression this pair exists to catch.
  recall('C78', /TF037/.test(withoutOut), `with the world closed, the same bogus call is a \`TF037\` (got: ${withoutOut.trim().split('\n')[0] || 'clean'})`);
  recall('C78', !/TF037/.test(withOut), `and one \`use\` line silences it (got: ${withOut.trim().split('\n')[0] || 'clean'}) — exports cannot be enumerated without importing, and the checker never executes what it checks`);
  precision('C78', !/TF04[03]/.test(withOut), `the \`use\`d module is real and resolvable, so the silence is undecidability rather than a file the checker gave up on (got: ${withOut.trim().split('\n')[0] || 'clean'})`);

  // And the pair really is a pair: one line of difference, or the comparison is between two
  // unrelated files that happen to disagree.
  const strip = (f) => readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter((l) => !l.startsWith('#') && l.trim() !== '');
  const diff = strip(WITH).filter((l) => !strip(WITHOUT).includes(l));
  precision('C78', diff.length === 1 && diff[0].startsWith('use '), `the two fixtures differ by exactly the \`use\` line and nothing else (got ${JSON.stringify(diff)})`);

  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  const counts = await lifecycleCounts();
  if (!report || !counts) {
    fail(`${plant.id} produced no ${report ? lifecycleSkipReason() : 'report'}. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C78').skipped = report ? lifecycleSkipReason() : 'no report';
  } else {
    const marks = counts.marks ?? {};
    const reported = functionalTests(report);
    recall('C78', reported.length === 1 && reported[0]?.ok === true, `the export is callable and answered the DSL's expectation (got ${reported.length} test(s), ok=${reported[0]?.ok})`);
    recall('C78', marks['c78-51f2ab95'] === 1, `and the value it returned reached the server verbatim (got ${Object.keys(marks).join(', ') || 'no marks'}) — a hash the DSL has no arithmetic to compute`);
  }
}

if (wanted('C79')) {
  const plant = plantFor('declaration:before');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);

  // The claim no running file can make: `before file`'s scope is sealed off from every test.
  const isolated = runCheck(['tests/.constructs/check-before-file-scope-isolated.tflw']);
  recall('C79', /TF030/.test(isolated), `a test that reads a \`before file\` binding does not compile (got: ${isolated.trim().split('\n')[0] || 'clean'})`);

  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  const counts = await lifecycleCounts();
  if (!report || !counts) {
    fail(`${plant.id} produced no ${report ? lifecycleSkipReason() : 'report'}. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C79').skipped = report ? lifecycleSkipReason() : 'no report';
  } else {
    const marks = counts.marks ?? {};
    const reported = functionalTests(report);

    // Cardinality: the half ~90 existing `before file` uses cannot state, because a hook that ran
    // too often would leave all of them green.
    recall('C79', marks['c79file'] === 1, `\`before file\` ran exactly once for the whole file (got ${marks['c79file'] ?? 'absent'}) across ${reported.length} test(s)`);
    recall('C79', marks['c79each'] === 3, `bare \`before\` ran once per test (got ${marks['c79each'] ?? 'absent'}, want 3)`);

    // Scope: asserted in-band as three ordinals, so the verdicts carry it. A `before` that ran once
    // per file and shared its scope leaves all three asserting 1 and only the first passing — which
    // is why the *count* of passing tests is the thing read here, not merely that some passed.
    recall('C79', reported.length === 3 && reported.every((t) => t.ok === true), `all three tests passed (got ${reported.filter((t) => t.ok).length}/${reported.length}): each read the binding its own \`before\` made, one ordinal apart`);
    const total = Object.values(marks).reduce((n, v) => n + v, 0);
    precision('C79', total === 4, `the corpus issued exactly the four marks it declares — one file-scoped, three test-scoped (got ${total}: ${JSON.stringify(marks)})`);
    precision('C79', !/TF030/.test(output), `and the sibling file's identical capture from a *bare* \`before\` was accepted, so the refusal above is about \`before file\` rather than about \`capture\``);
  }
}

// The one row in this tier with no fixture of its own. Grading an existing file is the point, not a
// shortcut: `M154a` already counted `sessions-explained.tflw` as evidence of `as` and never asked
// what it proved, which is `D722` exactly.
if (wanted('C80')) {
  const plant = plantFor('declaration:as');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  // This row grades an existing file rather than a fixture of its own, so it never reads the
  // arrival counter — but it still needs the same liveness guard the other three get, and for a
  // sharper reason. With the stack down a report IS produced: every test fails at its first
  // request, `ok` is false everywhere, and grading it yields five confident red assertions saying
  // `as admin` did not authorize anything. That is a stack-down message wearing a conformance
  // failure's clothes, which is the one output this whole tier exists to refuse. `lifecycleCounts()`
  // is used here purely as the liveness probe, never as evidence.
  const alive = await lifecycleCounts();
  if (!report || !alive) {
    fail(`${plant.id} produced no ${report ? lifecycleSkipReason() : 'report'}. Is the stack up (\`node cli.mjs start\`)?\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C80').skipped = report ? lifecycleSkipReason() : 'no report';
  } else {
    const authorized = named(report, 'opting into `as admin` starts every api step');
    const anonymous = named(report, 'no `as <session>` clause is anonymous');
    const both = named(report, 'as admin, shopper opts into both at once');

    recall('C80', authorized?.ok === true, `the test declared \`as admin\` got its 200 (ok=${authorized?.ok}) — no Authorization header is written anywhere in it`);
    recall('C80', anonymous?.ok === true, `and the test with no clause got its 401 (ok=${anonymous?.ok}), which is the same assertion pointed the other way`);
    recall('C80', both?.ok === true, `\`as admin, shopper\` merged both sessions' contributions onto one test (ok=${both?.ok}) — the manifest's "one or more"`);

    // Two tests disagreeing about a status code are not a pair. Matched on the step's `source` —
    // the line as written — because that is what makes "the same request" checkable rather than
    // asserted: both tests must literally contain `api GET /orders/all`.
    const REQUEST = 'api GET /orders/all';
    const issues = (test) => stepsOf(test).some((s) => (s.source ?? '').trim() === REQUEST);
    precision('C80', issues(authorized) && issues(anonymous), `both verdicts came from the same request, \`${REQUEST}\` (authorized: ${issues(authorized)}, anonymous: ${issues(anonymous)}) — so the \`as\` clause is the only difference between them`);
    precision('C80', failingSteps(authorized).length === 0 && failingSteps(anonymous).length === 0, `and neither reached its verdict through a failing step (${failingSteps(authorized).length} / ${failingSteps(anonymous).length})`);
  }
}

// =============================================================================
// C81-C91 — `M154g` step 3: eleven of the twelve `generator` rows
// =============================================================================
//
// One plant, four runs, and the four runs are the point. Everything this family promises is a
// statement about a *relationship between values* — distinct from each other, identical across a
// seed, moving with a clock — and a `.tflw` file can hold at most one run's worth of values and
// cannot do arithmetic on them. So the plant states shape and the grader states everything else:
//
//   A  --seed 4242 --now 2026-07-06     the reference run
//   B  --seed 4242 --now 2026-07-06     same seed, same clock  -> every `random` value repeats
//   C  --seed 9999 --now 2026-07-06     same clock, new seed   -> the seeded values move
//   D  --seed 4242 --now 2027-07-06     same seed, new clock   -> only the clock-derived ones move
//
// D is not redundant with C. `SPEC` §7.5 makes two separate promises — one run seed and one run
// clock — and C alone cannot tell them apart, because a `random date` derived purely from the seed
// would satisfy it. D is the run that separates them: under it `random date in past` must move and
// `random string 12` must not.
const GENERATOR_IDS = ['C81', 'C82', 'C83', 'C84', 'C85', 'C86', 'C87', 'C88', 'C89', 'C90', 'C91', 'C113'];

if (GENERATOR_IDS.some((id) => wanted(id))) {
  const plant = plantFor('generator:unique-prefix');
  console.log(`\nC81-C91 — the generator family\n  target: ${plant.target}`);

  // ---- the check-time half: SPEC §7.3's generator-operand table -------------------------------
  // No stack, so it grades identically while the box is busy — the same property `C78`/`C79` have.
  // The subject is not "TF054 fires" (that is `C59`'s job, by rule) but "**this generator** refuses
  // **this operand**", which is a different sentence about a different construct.
  const OPERANDS = 'tests/.checkonly/invalid-literal-operand.tflw';
  const operandOut = runCheck([OPERANDS]);
  const refuses = (src) =>
    new RegExp(`error\\[TF054\\]: \`${src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``).test(operandOut);

  // ---- the run half ---------------------------------------------------------------------------
  const NOW = '2026-07-06T00:00:00.000Z';
  const LATER = '2027-07-06T00:00:00.000Z';
  const decode = (marks) => {
    const single = {};
    const retried = {};
    for (const [key, n] of Object.entries(marks ?? {})) {
      const parts = key.split('|');
      // The value is base64 and may itself contain a `|`, so everything after the fixed fields is
      // rejoined rather than indexed. `random password` is why: it guarantees a symbol class.
      if (parts[0] === 'g3' && parts.length >= 4) {
        single[`${parts[1]}#${parts[2]}`] = Buffer.from(parts.slice(3).join('|'), 'base64').toString('utf8');
      } else if (parts[0] === 'g3r' && parts.length >= 3) {
        (retried[parts[1]] ??= []).push({
          value: Buffer.from(parts.slice(2).join('|'), 'base64').toString('utf8'),
          count: n,
        });
      }
    }
    return { single, retried };
  };
  const runOnce = async (seed, now) => {
    const { report, output } = runCorpus(ROOT, [plant.evidence.file, '--seed', String(seed), '--now', now]);
    const counts = await lifecycleCounts();
    return { report, output, counts, ...decode(counts?.marks) };
  };

  const A = await runOnce(4242, NOW);
  const B = A.report && A.counts ? await runOnce(4242, NOW) : null;
  const C = B?.report && B?.counts ? await runOnce(9999, NOW) : null;
  const D = C?.report && C?.counts ? await runOnce(4242, LATER) : null;

  if (!A.report || !A.counts || !D?.report || !D?.counts) {
    const why = !A.report ? 'report' : lifecycleSkipReason();
    fail(`C81-C91 produced no ${why}. Is the stack up (\`node cli.mjs start\`)?\n${(D?.output ?? A.output).trim().split('\n').slice(-12).join('\n')}`);
    for (const id of GENERATOR_IDS) scores.get(id).skipped = !A.report ? 'no report' : lifecycleSkipReason();
  } else {
    const v = A.single;
    const trio = (ctor) => [1, 2, 3].map((i) => v[`${ctor}#${i}`]);
    const distinct = (xs) => xs.every((x) => x !== undefined) && new Set(xs).size === xs.length;
    const consecutive = (ns) => ns.every((n, i) => Number.isInteger(n) && (i === 0 || n === ns[i - 1] + 1));
    const same = (slot, other) => other.single[slot] !== undefined && other.single[slot] === v[slot];
    const moved = (slot, other) => other.single[slot] !== undefined && other.single[slot] !== v[slot];
    const passed = (fragment) => named(A.report, fragment)?.ok === true;

    // --- the `unique` group, and the counter underneath all of it ------------------------------

    const prefixes = trio('unique-prefix');
    const pIdx = prefixes.map((s) => Number(String(s).slice('W3-Widget-'.length)));
    recall('C81', prefixes.every((s) => /^W3-Widget-\d+$/.test(String(s))), `the literal prefix survives and something was appended to it (${prefixes.join(', ')})`);
    recall('C81', distinct(prefixes) && consecutive(pIdx), `three draws are three **consecutive** counter values (${pIdx.join(', ')}) — this construct's distinctness is ordering, not entropy, and no site in this repository says so`);
    recall('C81', same('unique-prefix#1', B) && same('unique-prefix#1', C) && same('unique-prefix#1', D), `and the counter restarts at the same place under every seed and clock (${B.single['unique-prefix#1']} / ${C.single['unique-prefix#1']} / ${D.single['unique-prefix#1']}), which is the exact opposite of the \`random\` group below`);
    const retriedPrefix = A.retried['unique-prefix'] ?? [];
    recall('C81', retriedPrefix.length === 3 && retriedPrefix.every((e) => e.count === 1), `across a retried test's three attempts the counter kept advancing — three distinct values, each marked once (${JSON.stringify(retriedPrefix.map((e) => e.value))}). \`SPEC\` §7.2 states this in bold and nothing here has ever observed it: \`retry-and-flake.tflw\` retries against a \`random\` key, which is the opposite promise`);
    precision('C81', passed('keeps the prefix'), `the plant's own test for it passed`);

    const emails = trio('unique-email');
    const eIdx = emails.map((s) => Number(/^user(\d+)@/.exec(String(s))?.[1]));
    recall('C82', emails.every((s) => /^user\d+@example\.test$/.test(String(s))), `every draw is an address on one reserved domain (${emails.join(', ')})`);
    recall('C82', distinct(emails) && consecutive(eIdx), `three consecutive counter values again (${eIdx.join(', ')})`);
    recall('C82', eIdx[0] === pIdx[2] + 1, `and it is the **same** counter \`unique("…")\` uses: the test above drew ${pIdx.join('/')}, so the first address here is user${eIdx[0]}. That is the sentence a reader of this suite most needs — two \`unique\` values are distinct because of ordering across the whole run, not because each construct has its own sequence`);
    recall('C82', same('unique-email#1', C), `and it too is seed-independent (${C.single['unique-email#1']})`);
    precision('C82', passed('is an address'), `the plant's own test for it passed`);

    const numbers = trio('unique-number');
    const nIdx = numbers.map((s) => Number(s));
    recall('C83', numbers.every((s) => /^\d+$/.test(String(s))), `digits only (${numbers.join(', ')})`);
    recall('C83', distinct(numbers) && consecutive(nIdx), `three consecutive values (${nIdx.join(', ')})`);
    recall('C83', nIdx[0] === eIdx[2] + 1, `and this construct **is** the counter, unwrapped: it continues from user${eIdx[2]} at ${nIdx[0]}. It has no other site in the repository, so this row and its plant are its entire evidence`);
    precision('C83', passed('is the counter itself'), `the plant's own test for it passed`);

    const uuids = trio('unique-uuid');
    const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const tail = (s) => Number.parseInt(String(s).slice(-8), 16);
    const uIdx = uuids.map(tail);
    recall('C84', uuids.every((s) => V4.test(String(s))), `v4-shaped (${uuids.join(', ')})`);
    recall('C84', distinct(uuids) && consecutive(uIdx), `and the last eight hex digits are the counter, not entropy — ${uuids.map((s) => String(s).slice(-8)).join(', ')} is ${uIdx.join(', ')}. That is what makes distinctness a guarantee instead of 122 bits of luck, and it is the whole difference from \`random uuid\``);
    recall('C84', uIdx[0] - nIdx[2] === 4, `the counter jumped ${nIdx[2]} -> ${uIdx[0]} across the intervening test, which spent three ticks of the **same** sequence on its three \`unique like\` draws (\`SPEC\` §7.5). Until \`M154g-07\` was fixed this gap was the defect's evidence — the ticks were spent and the values did not carry them — and it is now the one place the *sharing* is visible: four constructs reading one counter is what makes \`C82\`'s and \`C83\`'s continuations mean anything, and a build that gave each construct its own sequence would pass every other claim in this block`);
    recall('C84', same('unique-uuid#1', C) === false && tail(C.single['unique-uuid#1']) === uIdx[0], `under a different seed the uuid changes but its counter digits do not (${C.single['unique-uuid#1']}) — the two halves of this construct have different sources, and only the counter half carries the guarantee`);
    precision('C84', passed('carries the counter in its last eight'), `the plant's own test for it passed`);

    // --- the `random` group: one seed, one clock, and the operand table -------------------------

    const n = Number(v['random-number#1']);
    recall('C85', Number.isInteger(n) && n >= 1 && n <= 100, `\`random number 1 to 100\` returned an integer inside its inclusive range (${n})`);
    recall('C85', same('random-number#1', B) && same('random-decimal#1', B), `both forms repeat exactly under the same seed (${B.single['random-number#1']}, ${B.single['random-decimal#1']}) — the claim no single run can make`);
    // The seed-sensitivity claim is made on the decimal alone and that is deliberate: `random
    // number 1 to 100` has a 1-in-100 chance of drawing the same integer under a different seed,
    // and a gate that flakes one run in a hundred is worse than one that asserts less.
    recall('C85', moved('random-decimal#1', C), `and a different seed moves them (${C.single['random-decimal#1']}); asserted on the decimal, whose range makes a coincidence impossible, rather than on the 1-in-100 integer`);
    recall('C85', same('random-number#1', D) && same('random-decimal#1', D), `while the run *clock* moves neither (${D.single['random-number#1']}, ${D.single['random-decimal#1']}) — the seed and the clock are two promises, not one`);
    recall('C85', refuses('random number 5 to 1') && refuses('random decimal 5 to 1'), `and an empty range is refused in the source, in both forms (\`SPEC\` §7.3's operand table, via ${OPERANDS})`);
    precision('C85', passed('inclusive range'), `the plant's own test for it passed`);

    const ms = (slot, run) => Date.parse(String((run ?? A).single[slot]));
    const nowMs = Date.parse(NOW);
    recall('C86', ms('random-date-past#1') < nowMs && ms('random-date-future#1') > nowMs, `\`in past\` and \`in future\` straddle the instant \`--now\` pinned (${v['random-date-past#1']} < ${NOW} < ${v['random-date-future#1']})`);
    recall('C86', ms('random-date-between#1') <= nowMs && ms('random-date-between#1') >= nowMs - 10 * 86400000, `and \`between today - 10 days and today\` landed inside its window (${v['random-date-between#1']})`);
    recall('C86', same('random-date-past#1', B) && same('random-date-future#1', B), `seed and clock together replay the exact instants (${B.single['random-date-past#1']})`);
    recall('C86', moved('random-date-past#1', C), `a different seed moves them (${C.single['random-date-past#1']})`);
    recall('C86', moved('random-date-past#1', D) && Math.abs(ms('random-date-past#1', D) - ms('random-date-past#1') - 365 * 86400000) < 3 * 86400000, `and so does a different **clock**, by about the year it was moved (${D.single['random-date-past#1']}) — the run that separates \`--now\` from \`--seed\`, which nothing else in this repository does`);
    recall('C86', refuses('random date between today and today - 10 days') && refuses('random date between'), `both refusals are in the source: bounds the wrong way round, and a quoted string that is never a date on any run`);
    precision('C86', passed('respects the run clock'), `the plant's own test for it passed`);

    const picks = trio('random-of');
    recall('C87', picks.every((s) => ['red', 'blue', 'green'].includes(String(s))), `every draw is an element of the inline list (${picks.join(', ')})`);
    recall('C87', new Set(picks).size > 1, `and the three draws are not one element repeated (${picks.join(', ')}) — the shape a generator that always returns the head would produce, and the one a single draw cannot exclude`);
    recall('C87', [1, 2, 3].every((i) => same(`random-of#${i}`, B)), `the sequence repeats under the same seed (${[1, 2, 3].map((i) => B.single[`random-of#${i}`]).join(', ')})`);
    precision('C87', passed('picks from the list'), `the plant's own test for it passed`);

    // --- `C113`: `unique like`, and the half of the family it belongs to -----------------------
    //
    // Graded here rather than beside `C89`'s `random like` on purpose: the two constructs share a
    // pattern language, a shape and a regex, and the ONLY thing that separates them is which of
    // these four runs moves the value. Read them together or the claim is not made.
    const likes = trio('unique-like');
    recall('C113', likes.every((s) => /^ORD-\d{6}$/.test(String(s))), `\`#\` filled with digits and the literal survives (${likes.join(', ')})`);
    recall('C113', distinct(likes), `three draws, three values (${likes.join(', ')}) — the weakest claim in this row, and the one that passed for a year against an implementation with no guarantee behind it. A sample of three cannot tell a guarantee from a high probability, which is why the two claims below exist`);
    recall('C113', same('unique-like#1', B) && same('unique-like#1', C) && same('unique-like#1', D), `and it is **identical under a second seed and a moved clock** (${B.single['unique-like#1']} / ${C.single['unique-like#1']} / ${D.single['unique-like#1']}), which places it with \`C81\`-\`C84\` and not with \`C89\`. That is the whole discriminator: \`random like\` on the same pattern moved to ${C.single['random-like#1']} under the same seed change. Before \`M154g-07\` this value moved too, because the only way to draw is to consult the RNG`);
    const retriedLike = A.retried['unique-like'] ?? [];
    recall('C113', retriedLike.length === 3 && retriedLike.every((e) => e.count === 1), `and across a retried test's three attempts it advances rather than replaying — three distinct values, each marked once (${JSON.stringify(retriedLike.map((e) => e.value))}), against \`C88\`'s one value marked three times. **This mark was written at step 3 and never read until now**, and reading it corrects the record: \`M154g-07\` claimed twice that \`SPEC\` §7.2's bolded retry clause was *false* for this construct, and it never was. The claim followed from a wrong mechanism theory — if the pattern came from the test's replayed \`random\` stream it would follow — but the old build keyed on \`uniqueSeq.next()\`, so the counter advanced across attempts and the three values already differed. The instrument that would have settled it was built here and nothing consulted it`);
    precision('C113', passed('fills `#` with digits'), `the plant's own test for it passed`);

    const s12 = String(v['random-string#1']);
    recall('C88', /^[A-Za-z0-9]{12}$/.test(s12), `\`random string 12\` is twelve alphanumerics (${s12})`);
    recall('C88', same('random-string#1', B) && moved('random-string#1', C) && same('random-string#1', D), `it repeats under one seed, moves under another, and ignores the clock (${B.single['random-string#1']} / ${C.single['random-string#1']} / ${D.single['random-string#1']})`);
    const retriedString = A.retried['random-string'] ?? [];
    recall('C88', retriedString.length === 1 && retriedString[0].count === 3, `and inside a retried test it **replays**: one value marked three times (${JSON.stringify(retriedString)}). Paired with \`C81\`'s three-distinct, this is \`SPEC\` §7.2/§7.3's opposite promises observed in one test — \`random\` is what an idempotency key must come from, \`unique\` is what it must not`);
    recall('C88', refuses('random string -3') && !refuses('random string 0'), `a negative length is refused in the source and \`0\` deliberately is not — the asymmetry the operand table keeps rather than flattens, and the half that would be invisible without a control in a file that reports`);
    precision('C88', passed('alphanumerics'), `the plant's own test for it passed`);

    const like = String(v['random-like#1']);
    recall('C89', /^SKU-\d{4}-[A-Za-z]{2}$/.test(like), `\`#\` filled with digits and \`?\` with letters — two alphabets, which a length check cannot tell apart (${like})`);
    recall('C89', same('random-like#1', B) && moved('random-like#1', C), `seed-reproducible (${B.single['random-like#1']} / ${C.single['random-like#1']})`);
    precision('C89', passed('with a digit and'), `the plant's own test for it passed`);

    const ru = String(v['random-uuid#1']);
    recall('C90', V4.test(ru), `v4-shaped (${ru})`);
    recall('C90', same('random-uuid#1', B) && moved('random-uuid#1', C), `seed-reproducible, unlike a uuid drawn from the platform's entropy (${B.single['random-uuid#1']} / ${C.single['random-uuid#1']})`);
    recall('C90', tail(C.single['random-uuid#1']) !== tail(v['random-uuid#1']), `and its last eight digits move with the seed (${String(v['random-uuid#1']).slice(-8)} -> ${String(C.single['random-uuid#1']).slice(-8)}) where \`unique uuid\`'s did not. That pair is the entire documented difference between the two constructs, and it is stated nowhere else`);
    precision('C90', passed('luck rather than a counter'), `the plant's own test for it passed`);

    const pw = String(v['random-password#1']);
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
    recall('C91', pw.length === 16 && String(v['random-password-default#1']).length === 12, `the requested length is honoured and the default is 12 (${pw.length}, ${String(v['random-password-default#1']).length})`);
    recall('C91', classes.every((re) => re.test(pw)), `and all four character classes are present (${pw}) — the validation policy this construct exists for, which no site in this repository asserts`);
    recall('C91', same('random-password#1', B) && moved('random-password#1', C), `seed-reproducible (${B.single['random-password#1']} / ${C.single['random-password#1']})`);
    recall('C91', refuses('random password 2'), `and a length too short to carry those four classes is refused in the source`);
    precision('C91', passed('length it was asked for'), `the plant's own test for it passed`);

    // --- shared precision: the run produced these values and nothing else ----------------------
    const red = functionalTests(A.report).filter((t) => !t.ok);
    const declared = new Set([
      ...['unique-prefix', 'unique-email', 'unique-number', 'unique-like', 'unique-uuid', 'random-of'].flatMap((c) => [1, 2, 3].map((i) => `${c}#${i}`)),
      'random-number#1', 'random-decimal#1', 'random-date-past#1', 'random-date-future#1',
      'random-date-between#1', 'random-string#1', 'random-like#1', 'random-uuid#1',
      'random-password#1', 'random-password-default#1',
    ]);
    const stray = Object.keys(v).filter((k) => !declared.has(k));
    const missing = [...declared].filter((k) => v[k] === undefined);
    for (const id of GENERATOR_IDS) {
      precision(id, red.length === 0 && stray.length === 0 && missing.length === 0, `the corpus went green and produced exactly its ${declared.size} declared draws${red.length ? ` — red: ${red.map((t) => t.name).join('; ')}` : ''}${stray.length ? ` — stray: ${stray.join(', ')}` : ''}${missing.length ? ` — missing: ${missing.join(', ')}` : ''}`);
    }
  }
}

// =============================================================================
// C92-C96 — the five config directives: the file is held still and the config moves
// =============================================================================
//
// Every other block in this file varies a run and reads a report. These five cannot: their subject
// is the config, and a `.tflw` file has no way to observe which `env` was selected, whether a
// `defaults` block was shared, or that a run was refused before it began. So the corpus is built
// the other way round — the fixtures under `tests/.checkonly/config-directives/` never change, and
// a **committed** `.config` file is copied in beside them as `tflw.config` for each leg.
//
// The scratch directories live under the OS temp dir rather than inside the repository, and that
// is load-bearing rather than tidy: `tflw run` reads a `.env` from its working directory, and this
// repository has one at its root. `C95`'s whole claim is about variables being absent.
//
// No stack. Four rows are `tflw check`; `C95` is a `tflw run` whose config points `api` at port 9,
// which the fetch standard blocks outright, so the "it got past the gate" leg fails identically
// whether or not apiV2 is up.

const DIRECTIVE_IDS = ['C92', 'C93', 'C94', 'C95', 'C96'];

if (DIRECTIVE_IDS.some((id) => wanted(id))) {
  const FIX = path.join(ROOT, 'tests', '.checkonly', 'config-directives');
  console.log('\nC92-C96 — the five config directives\n  target: tests/.checkonly/config-directives/ — committed configs, copied in as `tflw.config`');

  const scratch = mkdtempSync(path.join(tmpdir(), 'tflw-config-directives-'));
  const useConfig = (dir, config) => copyFileSync(path.join(FIX, config), path.join(dir, 'tflw.config'));
  const corpus = (name, files, config) => {
    const dir = path.join(scratch, name);
    mkdirSync(dir, { recursive: true });
    for (const f of files) {
      const dest = path.join(dir, f);
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(path.join(FIX, f), dest);
    }
    useConfig(dir, config);
    return dir;
  };
  const clean = (out) => /no problems found/.test(out);
  const firstLine = (out) => out.trim().split('\n')[0] || '(no output)';
  const counted = (out) => Number((out.match(/(\d+) files? checked/) ?? [])[1] ?? NaN);

  try {
    // ---- C92 / C94: one config, two envs, three unchanged files ------------------------------
    const NS = 'named-service.tflw';
    const SC = 'scoped-session.tflw';
    const US = 'unscoped-session.tflw';
    const envDir = corpus('envs', [NS, SC, US], 'two-envs.config');
    const chk = (args) => runCheck(args, { cwd: envDir });

    if (wanted('C92')) {
      const nsNoFlag = chk([NS]);
      const nsOne = chk(['--env', 'one', NS]);
      const nsTwo = chk(['--env', 'two', NS]);
      recall('C92', clean(nsOne), `\`api extra\` is clean under the env that declares it (got: ${firstLine(nsOne)})`);
      recall('C92', /error\[TF026\]/.test(nsTwo) && /"extra"/.test(nsTwo),
        `and the unchanged file is a \`TF026\` naming "extra" under the env that does not (got: ${firstLine(nsTwo)})`);
      recall('C92', clean(nsNoFlag), `the \`default\` marker resolves an env with nothing on the command line (got: ${firstLine(nsNoFlag)})`);
      // The marker is a *third* reading, not a repetition of `--env one`: a tflw that ignored it
      // and took the first declared env would produce the identical verdict. Byte-identical output
      // is the strongest available statement that the two resolved the same env.
      precision('C92', nsNoFlag === nsOne, 'the no-flag and `--env one` outputs are byte-identical, so the marker resolved that env rather than the first one');
      const nosuch = chk(['--env', 'nosuch', NS]);
      precision('C92', /unknown env "nosuch"/.test(nosuch) && /\bone\b/.test(nosuch) && /\btwo\b/.test(nosuch),
        `\`--env nosuch\` is refused naming both envs the config declares (got: ${firstLine(nosuch)})`);
      precision('C92', clean(chk(['--env', 'two', US])), '`env two` checks a file cleanly, so the `TF026` above is about the named service and not about that env being unusable');
    }

    if (wanted('C94')) {
      const scOne = chk(['--env', 'one', SC]);
      const scTwo = chk(['--env', 'two', SC]);
      recall('C94', clean(scOne), `\`as scoped\` is clean under the env its \`for env\` clause names (got: ${firstLine(scOne)})`);
      recall('C94', /error\[TF028\]/.test(scTwo) && /unknown session "scoped" in env "two"/.test(scTwo),
        `and a \`TF028\` under the env it does not (got: ${firstLine(scTwo)})`);
      recall('C94', /declared `for env one`/.test(scTwo), 'and the help text quotes the clause back, so the refusal names its own cause');
      // Without this the `TF028` is equally consistent with sessions not resolving in `env two` at
      // all. Same login step, same capture, same header — the clause is the only difference.
      precision('C94', clean(chk(['--env', 'two', US])), 'the unscoped sibling resolves in that same env, so what was refused is the clause and not the session table');
    }

    // ---- C93: one line, two blocks, two envs -------------------------------------------------
    if (wanted('C93')) {
      const defDir = corpus('defaults', ['kept.tflw'], 'defaults-shared.config');
      const dchk = (args) => runCheck(args, { cwd: defDir });
      const sharedOne = dchk(['--env', 'one', 'kept.tflw']);
      const sharedTwo = dchk(['--env', 'two', 'kept.tflw']);
      recall('C93', /error\[TF036\]/.test(sharedOne) && /error\[TF036\]/.test(sharedTwo),
        `one \`allow hosts\` line in \`defaults\` is read by both envs — \`TF036\` under each (got: ${firstLine(sharedOne)} / ${firstLine(sharedTwo)})`);
      precision('C93', /env `one`/.test(sharedOne) && /env `two`/.test(sharedTwo),
        'and each diagnostic names the env it was resolved for, so this is two readings rather than one cached verdict');

      useConfig(defDir, 'defaults-per-env.config');
      const perOne = dchk(['--env', 'one', 'kept.tflw']);
      const perTwo = dchk(['--env', 'two', 'kept.tflw']);
      recall('C93', /error\[TF036\]/.test(perOne), `moving the identical line into \`env one\` leaves that env's verdict unchanged (got: ${firstLine(perOne)})`);
      recall('C93', clean(perTwo), `and \`env two\` goes silent — one indentation level is the whole difference (got: ${firstLine(perTwo)})`);

      useConfig(defDir, 'defaults-duplicated.config');
      const dup = dchk(['kept.tflw']);
      recall('C93', /error\[TF022\]/.test(dup), `a second \`defaults\` block is refused (got: ${firstLine(dup)})`);
      precision('C93', !/TF036/.test(dup), 'and that config\'s env sits inside its own allowlist, so `TF022` is the only code in the output and the assertion cannot pass on a different complaint');
    }

    // ---- C95: refused before a socket exists -------------------------------------------------
    if (wanted('C95')) {
      const reqDir = corpus('require', ['kept.tflw'], 'require.config');
      const none = runRun([], { cwd: reqDir });
      recall('C95', /missing required environment variable/.test(none) && /C95_TOKEN/.test(none) && /C95_UNUSED/.test(none),
        `neither variable set: the run is refused naming both (got: ${firstLine(none)})`);
      const partial = runRun([], { cwd: reqDir, env: { C95_TOKEN: 'c95' } });
      recall('C95', /C95_UNUSED/.test(partial) && !/C95_TOKEN/.test(partial),
        `\`C95_UNUSED\` is referenced nowhere in that config and is required just as hard — the refusal names it alone (got: ${firstLine(partial)})`);
      const both = runRun([], { cwd: reqDir, env: { C95_TOKEN: 'c95', C95_UNUSED: 'c95' } });
      recall('C95', !/missing required environment variable/.test(both) && /blocked-ports/.test(both),
        'with both set the same run reaches the transport and dies at port 9 — "refused before it started" told from "ran and failed" without a stack');
      // ---- THE REVERSAL (`M156f.1`) ----------------------------------------------------------
      // This row used to end here, asserting a **silence**: `tflw check` reported "no problems
      // found" over the identical config while the manifest promised a missing secret "fails at
      // check time". That was measured, filed as `M154g-11`, and dispositioned *"the repair is the
      // sentence, never the gate"*. **That disposition was wrong and tflw's `M156` reversed it**
      // (`D774`): the guarantee was deliverable statically, with no secret and no socket, and the
      // half that was missing was the implementation rather than the wording.
      //
      // What the old leg is worth keeping as a warning: `clean()` is `/no problems found/`, and the
      // note added below does **not** disturb that string. So the retired assertion would still be
      // passing today, in a row whose claim had inverted underneath it — the exact failure this
      // corpus exists to catch, sitting inside the corpus. Rewritten rather than deleted for that
      // reason.
      //
      // Two legs now, and they are a pair. The first says the note fires; the second says it fires
      // for *unset* and not for *declared*, which is the distinction `D776` turns on and the one a
      // reader would most plausibly get wrong. Without the second, a note printed unconditionally
      // passes.
      const checked = runCheck(['kept.tflw'], { cwd: reqDir });
      recall('C95', clean(checked) && /require env: 2 of 2 not set here/.test(checked)
          && /C95_TOKEN/.test(checked) && /C95_UNUSED/.test(checked),
        `\`tflw check\` over the identical config now says so — an advisory note naming both variables, beside "no problems found" and an exit 0 (\`D779\`, reversing \`M154g-11\`) (got: ${firstLine(checked)})`);
      const checkedSet = runCheck(['kept.tflw'], { cwd: reqDir, env: { C95_TOKEN: 'c95', C95_UNUSED: 'c95' } });
      precision('C95', clean(checkedSet) && !/require env:/.test(checkedSet),
        `and with both set the note is absent entirely — it reports *unset*, never *declared*, so it cannot be satisfied by a line printed unconditionally (got: ${firstLine(checkedSet)})`);
    }

    // ---- C96: discovery skips the folder, an explicit path does not --------------------------
    if (wanted('C96')) {
      const exDir = corpus('exclude', ['kept.tflw', path.join('excluded', 'skipped.tflw')], 'exclude-on.config');
      const on = runCheck([], { cwd: exDir });
      const onNamed = runCheck([path.join('excluded', 'skipped.tflw')], { cwd: exDir });
      useConfig(exDir, 'exclude-off.config');
      const off = runCheck([], { cwd: exDir });
      const offNamed = runCheck([path.join('excluded', 'skipped.tflw')], { cwd: exDir });
      recall('C96', counted(on) === 1, `discovery reports 1 file with the \`exclude\` line (got ${counted(on)}: ${firstLine(on)})`);
      recall('C96', counted(off) === 2, `and 2 without it, over an unchanged corpus (got ${counted(off)}: ${firstLine(off)})`);
      recall('C96', counted(onNamed) === 1 && counted(offNamed) === 1,
        `naming the excluded file checks it under both configs — a discovery filter, not an access rule (got ${counted(onNamed)} / ${counted(offNamed)})`);
      precision('C96', clean(on) && clean(off), 'both corpora are otherwise clean, so the count is the only thing that moved between the two configs');
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// =============================================================================
// C97-C104 — the config keys, and the one declaration the same instrument freed
// =============================================================================
//
// Step 4a's handoff predicted that every one of the eleven `config:key:*` entries needs a running
// target. Seven of them do not, and the reason is what a config key actually claims: it is a
// statement about **the request tflw was about to make**, so the place it is readable is the wire,
// not a report and not a database. `arrival-server.mjs` is that wire — `D745`'s target, already
// chosen for `C3` and the perf tier on the argument that a real target measures the target.
//
// Three things were added to it here, each for one claim no counter could answer: a per-arrival
// header log (`C98` — "on **every** step" is a per-request question), a `/gate` rendezvous
// reporting the high-water mark of simultaneous holders (`C101`, `C104`), and nothing at all for
// `C100`, which needs only that the server would have recorded an arrival if one had been sent.
//
// `C104` is not a config key. It rosters here because the rendezvous is the endpoint its `RATCHET`
// condition asked for — that condition named apiV2 as the address and `D745` had already answered
// why the address is wrong.

const KEY_IDS = ['C97', 'C98', 'C99', 'C100', 'C101', 'C102', 'C103', 'C104'];

if (KEY_IDS.some((id) => wanted(id))) {
  const FIX = path.join(ROOT, 'tests', '.constructs', 'config-keys');
  const CONFORMANCE = path.join(ROOT, 'tflw-acceptance', 'conformance');
  console.log('\nC97-C104 — the config keys, graded on the wire\n  target: `arrival-server.mjs` — committed configs, copied in as `tflw.config`, no stack');

  // Same scratch placement and same reason as step 4a: `tflw run` reads a `.env` from its working
  // directory and this repository has one. Nothing here needs it, and a corpus that silently
  // inherited it would make "this plant needs no secrets" a property of where it was run.
  const scratch = mkdtempSync(path.join(tmpdir(), 'tflw-config-keys-'));
  const useConfig = (dir, config) => copyFileSync(path.join(FIX, config), path.join(dir, 'tflw.config'));
  const corpus = (name, files, config) => {
    const dir = path.join(scratch, name);
    mkdirSync(dir, { recursive: true });
    for (const f of files) copyFileSync(path.join(FIX, f), path.join(dir, f));
    useConfig(dir, config);
    return dir;
  };
  const peak = async () => JSON.parse(await (await fetch('http://127.0.0.1:4507/__peak')).text());
  const headersOf = async (name) => JSON.parse(await (await fetch(`http://127.0.0.1:4507/__headers?name=${name}`)).text());
  const hits = (text, needle) => (text.match(new RegExp(needle, 'g')) ?? []).length;
  const readIn = (dir, ...rel) => (existsSync(path.join(dir, ...rel)) ? readFileSync(path.join(dir, ...rel), 'utf8') : '');

  let server = null;
  try {
    server = await startArrivalServer(CONFORMANCE);

    // ---- C97 / C98: one corpus, two configs, and the wire says which base and which headers ----
    const apiDir = corpus('api', ['two-steps.tflw', 'named-service.tflw'], 'services.config');
    const ALPHA = '/base/alpha';
    const BETA = '/base/beta';
    const GAMMA = '/second/gamma';

    await arrivals('__reset');
    const plainOut = runRun([], { cwd: apiDir });
    const plainPaths = await arrivals('__arrivals');
    const plainHeaders = await headersOf('x-plant');

    if (wanted('C97')) {
      recall('C97', (plainPaths.byPath[ALPHA] ?? 0) === 1 && (plainPaths.byPath[BETA] ?? 0) === 1,
        `\`/alpha\` and \`/beta\` arrived at \`${ALPHA}\` and \`${BETA}\` — the base URL's own path segment is joined, not replaced (got: ${JSON.stringify(plainPaths.byPath)})`);
      recall('C97', (plainPaths.byPath[GAMMA] ?? 0) === 1,
        `and the step naming \`second\` arrived at \`${GAMMA}\`, which is a different base chosen by the name on the step`);
      // Without this, a runtime that sent every request to every declared service would satisfy
      // both assertions above and be wrong in the way that costs a real suite a duplicate write.
      precision('C97', Object.keys(plainPaths.byPath).length === 3 && plainPaths.total === 3,
        `exactly three requests arrived and nowhere else (got: ${JSON.stringify(plainPaths.byPath)})`);
      precision('C97', /PASS 2\/2/.test(plainOut), 'the run itself is green, so the paths above are what a passing suite put on the wire');
    }

    if (wanted('C98')) {
      const off = [ALPHA, BETA, GAMMA].every((p) => (plainHeaders.byPath[p] ?? [null])[0] === null);
      useConfig(apiDir, 'services-headers.config');
      await arrivals('__reset');
      const headerOut = runRun([], { cwd: apiDir });
      const every = await headersOf('x-plant');
      const scoped = await headersOf('x-second');
      const got = (h, p) => (h.byPath[p] ?? [])[0] ?? null;

      recall('C98', off, 'the control config declares no `header` key and none of the three arrivals carried `X-Plant`');
      recall('C98', [ALPHA, BETA, GAMMA].every((p) => (every.byPath[p] ?? []).length === 1 && got(every, p) === 'c98-every-step'),
        `one \`defaults\` header line reached **each** of the three arrivals separately (got: ${JSON.stringify(every.byPath)})`);
      recall('C98', got(scoped, GAMMA) === 'c98-second-only',
        `and \`header … for second\` reached the step addressed to that service (got: ${JSON.stringify(scoped.byPath)})`);
      // The half that stops "the header is everywhere" being satisfied by a runtime that ignores
      // scoping: a service-scoped header must be ABSENT from the other two.
      precision('C98', got(scoped, ALPHA) === null && got(scoped, BETA) === null,
        'the scoped header is absent from the two arrivals it does not name, so scoping narrows rather than decorates');
      precision('C98', /PASS 2\/2/.test(headerOut), 'the run is green under both configs, so nothing above is a side effect of a failure');
    }

    // ---- C99: the value decides, a step may overrule it, and one spelling does not exist -------
    if (wanted('C99')) {
      const tDir = corpus('timeout', ['slow.tflw', 'slow-override.tflw'], 'timeout-tight.config');
      const tight = runRun([], { cwd: tDir });
      useConfig(tDir, 'timeout-loose.config');
      const loose = runRun([], { cwd: tDir });

      recall('C99', /request timed out after 10ms/.test(tight),
        'the tight config fails the 50 ms step and the detail quotes the configured duration back, so the number was read rather than the key noticed');
      recall('C99', /PASS 2\/2/.test(loose), 'the same corpus is green when the only change is `10ms` -> `5s`');
      recall('C99', /✓ the same slow step carrying its own timeout/.test(tight),
        'and under the tight config the step with its own `timeout 5s` still passes — a default a step can overrule, not a refusal to wait');
      precision('C99', /FAIL 1\/2/.test(tight),
        'exactly one of the two tests failed under the tight config, so the override is the difference between them and not the run');
      // The narrowing (`M155`/`D768`), and it replaces this row's old `M154g-10` leg. That leg
      // asserted `timeout api 5s` was a `TF010` — the manifest documented a spelling the parser did
      // not have — and it was written to go red on purpose the day tflw implemented it. `M155`
      // implemented it, so what stands here now is the behaviour rather than its absence.
      //
      // **Written as a swapped pair on purpose.** `timeout step 5s, api 10ms` must fail the request
      // that `timeout step 10ms, api 5s` passes. Either config alone is satisfied by a resolver
      // reading only one of the two keys: the tight one passes on a resolver that ignores `step`
      // entirely, and the loose one passes on a resolver that ignores `api` and simply never
      // narrowed anything. It is their disagreement, on identical corpora one number-swap apart,
      // that says the narrow key is read AND that the broad key stopped reaching HTTP.
      useConfig(tDir, 'timeout-narrow-tight.config');
      const narrowTight = runRun([], { cwd: tDir });
      useConfig(tDir, 'timeout-narrow-loose.config');
      const narrowLoose = runRun([], { cwd: tDir });

      recall('C99', /request timed out after 10ms/.test(narrowTight),
        '`timeout api 10ms` bounds the request even though `timeout step` is 5s beside it, so the narrow key wins for HTTP');
      recall('C99', /PASS 2\/2/.test(narrowLoose),
        'and the same corpus is green with the two numbers swapped — `timeout step 10ms` no longer reaches an HTTP request at all');
      precision('C99', /FAIL 1\/2/.test(narrowTight),
        'exactly one of the two tests failed under the narrowed config, so the per-step override still overrules `timeout api` as it overruled `timeout step`');
    }

    // ---- C100: an absence, proven against something that would have recorded a presence --------
    if (wanted('C100')) {
      const aDir = corpus('allow', ['absolute.tflw'], 'allow-narrow.config');
      await arrivals('__reset');
      const narrowOut = runRun([], { cwd: aDir });
      const narrow = await arrivals('__arrivals');
      useConfig(aDir, 'allow-wide.config');
      await arrivals('__reset');
      const wideOut = runRun([], { cwd: aDir });
      const wide = await arrivals('__arrivals');

      recall('C100', (narrow.byPath['/blocked'] ?? 0) === 0,
        `nothing arrived at \`/blocked\` under an allowlist that names the other spelling of this machine (got: ${JSON.stringify(narrow.byPath)})`);
      recall('C100', (wide.byPath['/blocked'] ?? 0) === 1,
        'and exactly one request arrived when `"localhost"` was added — same listener, same step, one config line apart');
      recall('C100', /is not in `allow hosts`/.test(narrowOut) && /localhost/.test(narrowOut),
        'the refusal names the host it refused, so the red is this guardrail rather than an unrelated failure');
      // SPEC §3.7 promises no connection is attempted, not merely that the response is discarded.
      // Both readings are already in the baseline — the grader's own `__arrivals` fetch opens a
      // socket in each leg — so what is asserted is that the counter moved only where a request
      // was permitted.
      precision('C100', wide.connections > narrow.connections,
        `the socket counter rose only in the permitted leg (${narrow.connections} -> ${wide.connections}), so the refusal is before the connection and not after the response`);
      precision('C100', /PASS 1\/1/.test(wideOut), 'the permitted leg is green, so the blocked leg is not failing for a reason both configs share');
    }

    // ---- C101 / C104: the rendezvous, once per axis --------------------------------------------
    if (wanted('C101')) {
      const wDir = corpus('workers', ['gate-a.tflw', 'gate-b.tflw'], 'workers-one.config');
      await arrivals('__reset');
      const oneOut = runRun([], { cwd: wDir });
      const onePeak = await peak();
      useConfig(wDir, 'workers-two.config');
      await arrivals('__reset');
      const twoOut = runRun([], { cwd: wDir });
      const twoPeak = await peak();

      recall('C101', onePeak.peakWaiting === 1 && onePeak.gatePaired === 0 && onePeak.gateAlone === 2,
        `at \`workers 1\` the watermark is 1 and both holders waited out their deadline alone (got: ${JSON.stringify(onePeak)})`);
      recall('C101', twoPeak.peakWaiting === 2 && twoPeak.gatePaired === 2 && twoPeak.gateAlone === 0,
        `at \`workers 2\` it is 2 and both were released as a pair — one digit, over an unchanged corpus (got: ${JSON.stringify(twoPeak)})`);
      precision('C101', /PASS 2\/2/.test(oneOut) && /PASS 2\/2/.test(twoOut),
        'both legs pass every assertion, so the watermark is the only thing that moved and the plant cannot be reading a failure');
    }

    if (wanted('C104')) {
      const cDir = corpus('concurrency', ['pair-parallel.tflw', 'pair-sequential.tflw'], 'workers-one.config');
      await arrivals('__reset');
      const parOut = runRun(['pair-parallel.tflw'], { cwd: cDir });
      const parPeak = await peak();
      await arrivals('__reset');
      const seqOut = runRun(['pair-sequential.tflw'], { cwd: cDir });
      const seqPeak = await peak();

      recall('C104', parPeak.peakWaiting === 2 && parPeak.gatePaired === 2,
        `two consecutive \`parallel\` tests met inside the target (got: ${JSON.stringify(parPeak)})`);
      recall('C104', seqPeak.peakWaiting === 1 && seqPeak.gateAlone === 2,
        `the same two marked \`sequential\` never did (got: ${JSON.stringify(seqPeak)})`);
      // Without this the plant is `C101` written twice: file concurrency would produce the same
      // watermark. Read off the config actually in place rather than asserted in prose.
      precision('C104', /^\s*workers 1\s*$/m.test(readIn(cDir, 'tflw.config')),
        'both legs ran under `workers 1`, so the file-concurrency axis is pinned and the header modifier is the only difference');
      precision('C104', /PASS 2\/2/.test(parOut) && /PASS 2\/2/.test(seqOut),
        'both files are green, so `sequential` is serializing rather than failing');
    }

    // ---- C102: four artifacts, and nothing left behind -----------------------------------------
    if (wanted('C102')) {
      const ARTIFACTS = ['report.html', 'results.json', 'junit.xml', '.last-run.json'];
      const rDir = corpus('report', ['one-step.tflw'], 'report-custom.config');
      runRun([], { cwd: rDir });
      const custom = ARTIFACTS.filter((f) => existsSync(path.join(rDir, 'artifacts', 'custom', f)));
      const strayDefault = existsSync(path.join(rDir, 'report'));

      useConfig(rDir, 'report-default.config');
      rmSync(path.join(rDir, 'artifacts'), { recursive: true, force: true });
      runRun([], { cwd: rDir });
      const dflt = ARTIFACTS.filter((f) => existsSync(path.join(rDir, 'report', f)));
      const strayCustom = existsSync(path.join(rDir, 'artifacts'));

      recall('C102', custom.length === 4,
        `all four artifacts were written under \`artifacts/custom\`, a nested directory the run created (got: ${custom.join(', ') || 'none'})`);
      recall('C102', dflt.length === 4,
        `and all four land in \`report/\` when the key is removed and nothing else changes (got: ${dflt.join(', ') || 'none'})`);
      // A key that copied rather than moved would leave a stale `report/results.json` behind, which
      // every other plant in this gate reads — so this half is a guard on the instrument too.
      precision('C102', !strayDefault, '`report/` was not written at all under the custom key, so the artifacts moved rather than being copied');
      precision('C102', !strayCustom, 'and `artifacts/` is not written back when the key is gone');
    }

    // ---- C103: what is rendered moves, what is recorded does not -------------------------------
    if (wanted('C103')) {
      const lDir = corpus('log', ['logged.tflw'], 'log-warn.config');
      const legs = {};
      for (const which of ['warn', 'debug', 'html']) {
        rmSync(path.join(lDir, 'report'), { recursive: true, force: true });
        useConfig(lDir, `log-${which}.config`);
        const out = runRun([], { cwd: lDir });
        legs[which] = { out, json: readIn(lDir, 'report', 'results.json'), html: readIn(lDir, 'report', 'report.html') };
      }
      const DEBUG = 'c103-debug-line';
      const WARN = 'c103-warn-line';

      recall('C103', hits(legs.warn.out, DEBUG) === 0 && hits(legs.debug.out, DEBUG) > 0,
        `\`log level warn\` keeps the \`debug\` call off the console and \`log level debug\` lets it through (got ${hits(legs.warn.out, DEBUG)} / ${hits(legs.debug.out, DEBUG)})`);
      recall('C103', hits(legs.debug.html, DEBUG) === 0 && hits(legs.html.html, DEBUG) > 0,
        `\`log destination console\` keeps both calls out of \`report.html\` and \`log destination html\` puts them in (got ${hits(legs.debug.html, DEBUG)} / ${hits(legs.html.html, DEBUG)})`);
      recall('C103', hits(legs.html.out, WARN) === 0 && hits(legs.warn.out, WARN) > 0,
        `and the destination is exclusive rather than additive — the \`warn\` call is on the console under \`console\` and absent under \`html\` (got ${hits(legs.warn.out, WARN)} / ${hits(legs.html.out, WARN)})`);
      // SPEC §3.8: neither key ever affects whether a `log` step is *recorded*. This is the claim a
      // reader is most likely to get wrong, and the one a suite that greps its own console output
      // would read as data loss.
      const recorded = ['warn', 'debug', 'html'].map((w) => hits(legs[w].json, DEBUG) + hits(legs[w].json, WARN));
      precision('C103', recorded[0] > 0 && recorded.every((n) => n === recorded[0]),
        `\`results.json\` carries both calls identically under all three configs (got ${recorded.join(' / ')}), so what these keys filter is rendering`);
    }
  } catch (e) {
    for (const id of KEY_IDS) if (wanted(id)) { fail(`${id} could not run: ${e.message}`); scores.get(id).skipped = e.message; }
  } finally {
    server?.kill();
    rmSync(scratch, { recursive: true, force: true });
  }
}

// =============================================================================
// C105-C108 — the four keys whose witness is a target rather than a wire
// =============================================================================
//
// `insecure`, `cert` and `key` are claims about a TLS handshake and `web` is a claim about which
// application a browser reached. None of them is readable off `arrival-server.mjs`, so unlike
// `C97`-`C104` these four need the compose stack: the nginx sidecar's two listeners (`:8443` plain
// TLS, `:8444` mTLS) and both webV2 apps (`:8090` SPA storefront, `:8091` SSR admin console).
//
// Each of the four already had a **positive** running in this suite and no negative — `env
// secureLocal` passes whether or not `insecure` does anything, `mtls.tflw` and `mtls-rejection.tflw`
// are a pair split across two envs and two files, and the admin suite passing is equally consistent
// with both webV2 apps being served from one port. So every row here moves one config line over one
// unchanged fixture and states what the other side looks like.

const TARGET_IDS = ['C105', 'C106', 'C107', 'C108'];

if (TARGET_IDS.some((id) => wanted(id))) {
  const FIX = path.join(ROOT, 'tests', '.constructs', 'config-keys');
  const CERTS = path.join(ROOT, 'nginx', 'certs');
  console.log('\nC105-C108 — the config keys that need a real target\n  target: the nginx TLS sidecar (:8443, :8444) and both webV2 apps (:8090, :8091)');

  const scratch = mkdtempSync(path.join(tmpdir(), 'tflw-config-targets-'));
  const useConfig = (dir, config) => copyFileSync(path.join(FIX, config), path.join(dir, 'tflw.config'));
  const corpus = (name, files, config) => {
    const dir = path.join(scratch, name);
    mkdirSync(dir, { recursive: true });
    for (const f of files) copyFileSync(path.join(FIX, f), path.join(dir, f));
    useConfig(dir, config);
    return dir;
  };

  try {
    // ---- C105: the verification `insecure` disables is really happening ------------------------
    if (wanted('C105')) {
      const tDir = corpus('tls', ['health.tflw'], 'tls-insecure.config');
      const on = runRun([], { cwd: tDir });
      const forbidden = runRun(['--forbid-insecure'], { cwd: tDir });
      useConfig(tDir, 'tls-verify.config');
      const off = runRun([], { cwd: tDir });

      recall('C105', /PASS 1\/1/.test(on),
        'with `insecure true` the request completes against a certificate signed by a CA the container invented at start-up');
      recall('C105', !/PASS 1\/1/.test(off) && /certificate/i.test(off),
        `and with that one line removed the same request fails naming the certificate (got: ${(off.match(/.*certificate.*/i) ?? ['(no certificate text)'])[0].trim().slice(0, 120)})`);
      // SPEC §3.5: never a silent trade-off. A key that worked and said nothing would pass every
      // assertion above, and is the failure this clause exists to prevent.
      // Matched on the banner's own words, not on the substring `insecure`: the *failing* leg's
      // hint offers `set \`insecure true\` in tflw.config` as the repair, so a looser test passes on
      // both legs and asserts nothing. The teaching hint and the trade-off banner are different
      // sentences and only one of them is the promise.
      const BANNER = /insecure: true — TLS certificate verification was disabled for this run/;
      precision('C105', BANNER.test(on) && !BANNER.test(off),
        'the permitted leg carries the run-summary banner SPEC §3.5 promises and the verifying leg does not, so the trade-off is never silent');
      precision('C105', !/PASS 1\/1/.test(forbidden) && /forbid-insecure|refus/i.test(forbidden),
        `\`--forbid-insecure\` refuses the run rather than failing a test (got: ${forbidden.trim().split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 120) ?? '(no output)'})`);
    }

    // ---- C106 / C107: the certificate, and then the key that has to belong to it ---------------
    if (wanted('C106') || wanted('C107')) {
      // Copied rather than referenced: `cert`/`key` resolve against the config's own directory
      // (`M104-01`, `D183`), and these three files are regenerated at every container start, so a
      // committed path would be either wrong or stale.
      const mDir = corpus('mtls', ['health.tflw'], 'mtls-matched.config');
      for (const pem of ['client.pem', 'client.key', 'server.key']) {
        const src = path.join(CERTS, pem);
        if (!existsSync(src)) fail(`C106/C107 need \`nginx/certs/${pem}\`, which the nginx container writes at start-up — the stack is not up`);
        else copyFileSync(src, path.join(mDir, pem));
      }
      const matched = runRun([], { cwd: mDir });
      useConfig(mDir, 'mtls-nocert.config');
      const nocert = runRun([], { cwd: mDir });
      useConfig(mDir, 'mtls-mismatched-key.config');
      const wrongKey = runRun([], { cwd: mDir });

      if (wanted('C106')) {
        recall('C106', /PASS 1\/1/.test(matched), 'the client certificate gets the request past `ssl_verify_client on`');
        recall('C106', /expected status to equal 200, but got 400/.test(nocert),
          'and deleting the two lines leaves nginx\'s own 400 — the pair that has always run under two envs in two files, here as one file and one config line');
        // The half that separates this row's negative from `C107`'s: a 400 is a status the server
        // chose to send, so the handshake completed and the request was made. `mtls-rejection.tflw`
        // owns the assertion on the body text; what is claimed here is the status and its kind.
        precision('C106', !/request failed/.test(nocert) && !/PASS 1\/1/.test(nocert),
          'the no-certificate leg fails on the status rather than on the transport, so the connection was made and refused by the listener');
      }

      if (wanted('C107')) {
        // The discrimination: `C106`'s negative is a status the server chose to send. This one
        // never reaches a server, because the pair is refused where it is assembled.
        // Stated as what the output MUST contain rather than as what it must not, after one run of
        // this row disagreed on 2026-08-28 and did not reproduce in five more. A bare `!PASS` is
        // satisfied by any failure at all — including a crash, an empty buffer, or the corpus not
        // being there — so it cannot tell "the pairing was refused" from "something went wrong",
        // and an assertion whose flake is indistinguishable from its finding is the shape
        // `arrival-server.mjs`'s own header warns about.
        recall('C107', /request failed/.test(wrongKey) && !/PASS 1\/1/.test(wrongKey),
          'a real private key that belongs to somebody else fails at the transport, so the key is handed to the TLS context rather than stored beside the certificate');
        recall('C107', !/expected status to equal 200, but got 400/.test(wrongKey),
          `and it fails before any HTTP status exists, which is what tells it from \`C106\`'s server-chosen 400 (got: ${(wrongKey.match(/.*(?:request failed|error).*/i) ?? ['(no failure line)'])[0].trim().slice(0, 140)})`);
        precision('C107', /PASS 1\/1/.test(matched),
          'the matching pair over the identical fixture passes, so what failed above is the pairing and not the listener');
      }
    }

    // ---- C108: two bases, two applications, and a diagonal ------------------------------------
    if (wanted('C108')) {
      const wDir = corpus('web', ['open-storefront.tflw', 'open-admin.tflw'], 'web-storefront.config');
      const store = { front: runRun(['open-storefront.tflw'], { cwd: wDir }), admin: runRun(['open-admin.tflw'], { cwd: wDir }) };
      useConfig(wDir, 'web-admin.config');
      const console8091 = { front: runRun(['open-storefront.tflw'], { cwd: wDir }), admin: runRun(['open-admin.tflw'], { cwd: wDir }) };
      const passed = (out) => /PASS 1\/1/.test(out);

      recall('C108', passed(store.front) && passed(console8091.admin),
        'each file passes under the `web` base whose application it describes');
      recall('C108', !passed(store.admin) && !passed(console8091.front),
        'and fails under the other one — the same `open "/"`, two applications');
      // A key ignored in favour of one hard-coded base lights up a whole column rather than a
      // diagonal, which is exactly what the two assertions above would not distinguish alone.
      precision('C108', passed(store.front) !== passed(console8091.front),
        'the storefront file\'s verdict inverts when only the `web` line moves, so the base URL is what the bare path resolved against');
      precision('C108', passed(console8091.admin) !== passed(store.admin),
        'and so does the console file\'s, so neither result is one application answering both ports');
    }
  } catch (e) {
    for (const id of TARGET_IDS) if (wanted(id)) { fail(`${id} could not run: ${e.message}`); scores.get(id).skipped = e.message; }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// =============================================================================
// C112 — `was made`: the URL, the method, and whose network log is being read
// =============================================================================

// **`M154g` step 5 (`D766`).** This construct sat on the ratchet under the condition *"a
// browser-network assertion … it rosters with the UI work, not here"*. "The UI work" was `M154d`,
// which closed — so the condition was an **address**, not a requirement, and it went stale while
// still reading as live. The requirement it meant was a browser fixture with observable network
// traffic; `02-checkout-iframe-network.tflw` had been running one and `C108` had already proved this
// harness can drive and grade a browser tier.
//
// What the three existing uses could not do is fail. All three are positive — *this request was
// made* — so a matcher that answered `true` for anything observed, ignored the `with method` clause,
// or read the runner's own request log would satisfy every one of them. This is `D739` at its
// sharpest and the same shape `C105`-`C108` had: the evidence was everywhere and could not have
// caught the defect.
//
// One page load, six rows, graded **by position in the report** rather than by counting greens: four
// `expect`s that must pass and two `check`s — the same assertions with the negation dropped — that
// must fail in the same run. Without the controls the row would be asserting that answers it never
// saw are different from ones it did.
if (wanted('C112')) {
  const plant = plantFor('matcher:was-made');
  console.log(`\n${plant.id} — ${plant.title}\n  target: ${plant.target}`);
  const { report, output } = runCorpus(ROOT, [plant.evidence.file]);
  if (!report) {
    fail(`${plant.id} produced no report. Needs the stack, the storefront on :8090 and a browser.\n${output.trim().split('\n').slice(-12).join('\n')}`);
    scores.get('C112').skipped = 'no report';
  } else {
    const test = report.tests.find((t) => t.kind === 'functional');
    const steps = test?.steps ?? [];
    // Matched on the assertion's own source line, whole, and never on a fragment: `"/v1/products"`
    // appears in three of the six rows and `was made` is a substring of nothing useful. A `.find`
    // on a fragment is the first-match trap `C26` and `C43` both cost this milestone.
    const row = (src) => steps.find((st) => st.source.trim() === src);
    const held = (src) => row(src)?.ok === true;
    const broke = (src) => row(src)?.ok === false;

    const POS = 'expect request to "/v1/products" with method "GET" was made';
    const NEG_METHOD = 'expect request to "/v1/products" with method "POST" not was made';
    const NEG_URL = 'expect request to "/cart/checkout" not was made';
    const NEG_OWN = 'expect request to "/health" not was made';
    const CTRL_METHOD = 'check request to "/v1/products" with method "POST" was made';
    const CTRL_OWN = 'check request to "/health" was made';

    recall('C112', held(POS), 'the request the catalog page really issued is observed — the positive the three existing uses already make');
    recall('C112', held(NEG_METHOD), 'the same URL under a method the page never used was NOT made, so the `with method` clause is part of the judgement and not decoration');
    recall('C112', held(NEG_URL), 'a URL this run never touched was NOT made, so the matcher is not answering `true` for anything observed');
    // The claim nothing in this repository made before: `was made` reads the *browser's* network
    // log. The fixture's first step is a tflw-issued `api root GET /health`, so if the runner's own
    // requests were in scope this row is the only one of the six that would notice.
    recall('C112', held(NEG_OWN), 'the `/health` request tflw itself sent was NOT made, so the observation set is the browser\'s network log rather than the runner\'s');

    // Precision: the wrong answers are reachable in this very run. Two `check` rows, the same two
    // assertions with the negation dropped, recorded and continued past (`C1`) so one page load
    // carries both halves.
    precision('C112', broke(CTRL_METHOD), 'the control — the method negative with `not` dropped — FAILED, so that row discriminates rather than passing vacuously');
    precision('C112', broke(CTRL_OWN), 'and so did the runner\'s-own-request control, which is what makes the browser-log claim an assertion');
    const otherFailures = steps.filter((st) => !st.ok && st.kind !== 'check');
    precision('C112', otherFailures.length === 0, `nothing outside the two controls failed (got ${otherFailures.map((st) => st.source.trim()).join('; ') || 'none'}) — the page load itself is not what produced the reds`);
  }
}

// =============================================================================
// the table
// =============================================================================

console.log('\nper-plant precision and recall:\n');
// `M154f-03`. Iterate the plants THIS gate grades, not every plant on the roster. Seven rows are
// graded by reference under `D751` — `security`, `diagnostics`, `redaction` — and this driver never
// runs them, so their tallies are empty by construction. Walking all of `PLANTS` printed them as
// `✗ ... recall n/a precision n/a`: a red glyph that means *not my job*, sitting in a table whose
// every other red glyph means *this plant stopped discriminating*. Worse, the closing line then
// counted all 58 as having "produced exactly their known answers" — a claim about seven plants no
// assertion in this file touched. `D722` says presence is not sufficient; the same rule applies to
// a gate's own summary.
for (const plant of PLANTS) {
  if (!wanted(plant.id)) {
    console.log(`  – ${plant.id} ${plant.construct} — not selected by --only`);
    continue;
  }
  if (!plant.graders.includes('acceptance')) {
    const elsewhere = plant.graders.filter((g) => g !== 'acceptance' && g !== 'coverage');
    console.log(`  – ${plant.id} ${plant.construct.padEnd(14)} graded by \`${elsewhere.join('`, `')}\`, not here`);
    continue;
  }
  const s = scores.get(plant.id);
  const tally = (xs) => (xs.length === 0 ? 'n/a' : `${xs.filter(Boolean).length}/${xs.length}`);
  // `M154g` step 2d. `!s.skipped` is the newest clause and it was unreachable until this step: a
  // plant either graded or it did not, so a skip meant an empty tally and `recall.length > 0`
  // already caught it. `C78` and `C79` are the first plants graded by BOTH a `tflw check` pair and
  // a run, so a skipped runtime half can now sit beside a green static half — and the row printed
  // `✓ … (skipped: no report)`, a tick on a plant that never produced its known answer. Found by
  // mutating `before-scopes.tflw` into a file that does not parse; the gate still exited non-zero
  // via `fail()`, so this was a lying glyph rather than a hole, which is the kind that survives.
  const clean = s.recall.every(Boolean) && s.precision.every(Boolean) && s.recall.length > 0 && !s.skipped;
  // `D734` — a plant red for a *known* tflw defect keeps its row and says which. Absence of any
  // `blockedOn` is not the same as absence of defects; it is the claim that none is known.
  const blocked = plant.blockedOn ? `  [blocked-on:${plant.blockedOn}]` : '';
  console.log(`  ${clean ? '✓' : '✗'} ${plant.id} ${plant.construct.padEnd(14)} recall ${tally(s.recall)}  precision ${tally(s.precision)}${s.skipped ? `  (skipped: ${s.skipped})` : ''}${blocked}`);
}

// `M154f-03`, second half. A row printing `✗ ... n/a n/a` was only ever a glyph — `clean` went
// false and `failures` did not move, so a plant this gate is supposed to grade could assert nothing
// at all and the phase would still exit 0. That is `M141`'s vacuity class inside the gate that
// exists to refuse it. An empty tally is now a mismatch, and it says so in the plant's own terms.
for (const plant of plantsFor('acceptance')) {
  if (!wanted(plant.id)) continue;
  const s = scores.get(plant.id);
  if (s.recall.length === 0 && s.precision.length === 0) {
    fail(`${plant.id} (${plant.construct}) recorded no assertions at all${s.skipped ? ` (skipped: ${s.skipped})` : ''}. `
      + `A plant this gate grades must produce its known answer or fail trying; asserting nothing is neither.`);
  }
}

const graded = plantsFor('acceptance').filter((p) => wanted(p.id)).length;
const delegated = PLANTS.filter((p) => wanted(p.id) && !p.graders.includes('acceptance')).length;
console.log(
  failures === 0
    ? `\n✓ construct acceptance: ${graded} plant(s) produced exactly their known answers`
      + `${delegated > 0 ? `; ${delegated} more are graded by their own gates and are not claimed here` : ''}.`
    : `\n✗ construct acceptance: ${failures} mismatch(es).`,
);
if (failures > 0) process.stdout.write(stalenessBanner(PROVENANCE));

if (GATE) process.exit(failures === 0 ? 0 : 1);
process.exit(failures === 0 ? 0 : 1);
