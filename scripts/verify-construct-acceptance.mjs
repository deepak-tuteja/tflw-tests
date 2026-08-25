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
