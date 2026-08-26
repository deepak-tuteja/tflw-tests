#!/usr/bin/env node
// The scheduled perf-conformance run — `M154e` step 4/5, testFlow `PLAN_M154_DOGFOOD_CONFORMANCE.md`.
//
// `D727` puts arrival-curve grading on a scheduled box run rather than in CI, because GitHub's
// shared runners cannot produce a trustworthy arrival curve and `fedora-box` can. `D733` makes that
// run a registered box tenant. This is the driver both decisions point at; the box-side control
// surface is `fedora-box-dashboard/tenants/tflwperfctl.sh` and the units are in `ops/systemd/`.
//
// ## Two legs, and a third arriving
//
//   curve   the workload-shape plants (C44-C50) against the zero-latency arrival server (`D745`).
//           Timing-sensitive, needs the box quiet, needs no Docker stack.
//   ladder  the three-runner perf ladder — tflw vs k6 vs Artillery against apiV2. Needs the stack.
//
// `M154f` adds a functional leg against tflw's `main` (`M124-03`). It is a third entry in `LEGS`
// and needs nothing else here, which is why the shape is a table rather than two functions.
//
// ## `D746` — the lease label is `tflw:load:conformance`, and the class is `tflw:load`
//
// `D733` says "a new `tflw:perf` lease class". Measured against `thresholds.CLASSES` before this
// was written, and it is a silent downgrade:
//
//     classify('tflw:perf')             -> load-run    requires=()
//     classify('tflw:load:conformance') -> tflw:load   requires=('quiet',)
//
// `load-run` (prefix `tflw:`) is the union class, so a *new* label under that prefix does not
// create a new class — it falls into the union, whose `requires` is empty. A measurement taken
// beside a neighbour is wrong rather than slow, so `requires: quiet` is the only property this run
// actually needs from the mutex, and `tflw:perf` would have dropped it while still returning
// perfectly real answers. `tflw:load` already exists and its own comment says it was declared in
// advance for exactly this caller: *"Nothing is observed under `tflw:load` yet — the class is
// declared so the etiquette exists before the first run needs it, which is a condition rather than
// a milestone."* This is that first run. Reusing it also needs no change to a frozen project.
//
// ## `D747` — the lease is taken through `boxlock.sh acquire`, never through plain `flock`
//
// The dashboard decides who holds the box by walking /proc for `boxlock.sh acquire` processes and
// matching the holder file's pid against that walk (`collect/lock.py`). A job that takes the same
// flock directly and writes the same holder file itself is reported as
// `stale_holder: claim_without_process` with `holder: null` — a live, correctly-labelled holder
// advertised as a leftover, and `statsctl check` then tells a forge render *"an unnamed job has
// held the box"*, which is the least actionable answer it can give. Observed live 2026-08-25
// against boxMoeLab's `moebench.sh`, which re-implements the protocol that way (dashboard finding
// 196). Registering as a tenant is worthless if the mutex cannot see the tenant, so this driver
// spawns the real `boxlock.sh` and holds its stdin open — which also means systemd killing the
// unit releases the lease, by the same EOF mechanism the SSH path relies on.
//
// ## `D748` — the run measures `origin/main` in its own checkout
//
// `~/tflw-exec/testFlow-tests` is the rsync target `scripts/exec.mjs` maintains from the Mac. A
// scheduled gate pointed at it would grade whatever a Mac session last pushed there — arbitrarily
// stale, possibly mid-rsync, and attributable to no commit. So the run keeps its own checkout and
// fetches `origin/main` into it, and the artifact records the sha it measured. That is also the
// shape `M154f`'s functional leg needs, with a second checkout of tflw.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { RUNGS, FIXTURES, FIXTURE_SOURCE } from './lib/perf-ladder.mjs';
import { resolveTflw } from './lib/tflw-bin.mjs';
import { compare } from './verify-perf-baseline.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOME = os.homedir();

const LEASE_LABEL = 'tflw:load:conformance';       // D746
/** The tflw checkout `M154f`'s functional leg packs from. `../testFlow` is the layout every human
 *  here works in; the box keeps its two checkouts side by side under `~/tflw-perf/` and the unit
 *  overrides this. Named rather than derived so the artifact can record where the sha came from. */
const TFLW_CHECKOUT = process.env.TFLW_PERF_TFLW_CHECKOUT ?? path.join(ROOT, '..', 'testFlow');
const BOXLOCK = process.env.TFLW_PERF_BOXLOCK ?? path.join(HOME, 'tflw-exec/bin/boxlock.sh');
const RESULTS = process.env.TFLW_PERF_RESULTS ?? path.join(HOME, 'tflw-perf/results');
const ARRIVAL_PORT = 4507;

// `M141`/`D533`: which tflw a script grades is an argument, not an inference, and there is exactly
// one place allowed to answer it. The first draft of this file read a `TFLW_BIN` override directly
// and `verify:tflw-resolution` caught it — an eighth answer to the one question that milestone spent
// itself reducing to one. `released` because the ladder measures the shipped generator, not a
// branch build; the resolver announces the entry path and a sha prefix, and the artifact records
// them so a number can be attributed to a build.
const { entry: TFLW_BIN, label: TFLW_LABEL } = resolveTflw('released', { label: 'perf-conformance' });

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};
const PROFILE = arg('profile', 'full');
const NO_LEASE = argv.includes('--no-lease');
const DRY = argv.includes('--dry-run');

const log = (...m) => console.log(`[perf-conformance]`, ...m);

// ── the lease (D747) ────────────────────────────────────────────────────────────────────────────

/** Spawn the real `boxlock.sh acquire` and resolve once it prints READY. Returns a release fn. */
function acquireLease(timeoutS = 1800) {
  if (NO_LEASE) {
    log('running WITHOUT a lease (--no-lease) — the numbers are not trustworthy');
    return { release: () => {}, leased: false };
  }
  if (!existsSync(BOXLOCK)) {
    throw new Error(
      `no boxlock.sh at ${BOXLOCK}. Refusing to run unleased: an arrival curve measured beside a ` +
      `neighbour is wrong rather than slow, and D746's whole point is that this class declares ` +
      `\`requires: quiet\`. Pass --no-lease only for a deliberately untrusted smoke run.`);
  }
  const child = spawn(BOXLOCK, ['acquire', LEASE_LABEL, String(timeoutS)], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    let seen = '';
    const onData = (chunk) => {
      seen += chunk.toString();
      if (seen.includes('READY')) {
        child.stdout.off('data', onData);
        log(`lease held as ${LEASE_LABEL}`);
        // Closing stdin is what releases it — the same EOF the SSH path relies on.
        resolve({ release: () => { try { child.stdin.end(); } catch {} }, leased: true });
      }
    };
    child.stdout.on('data', onData);
    child.on('exit', (code) => {
      if (!seen.includes('READY')) {
        reject(new Error(code === 75
          ? `the box is busy — boxlock timed out after ${timeoutS}s. This is the correct outcome, ` +
            `not an error: a measurement taken beside a neighbour is wrong.`
          : `boxlock.sh exited ${code} before READY`));
      }
    });
  });
}

// ── shared helpers ─────────────────────────────────────────────────────────────────────────────

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false, ...opts,
});

/** The credential fixtures, read out of the one file `verify-perf-parity.mjs` already single-sources
 *  them from. The tflw rungs `require env` both and read them from an untracked `perf/tflw/.env`,
 *  so a fresh checkout has no `.env` at all — generating it here from the same constant the parity
 *  gate asserts against is the only way to do it that cannot drift. */
function writeTflwEnv(root) {
  const src = readFileSync(path.join(root, FIXTURE_SOURCE), 'utf8');
  const value = (key) => {
    const m = src.match(FIXTURES[key].pattern);
    if (!m) throw new Error(`${FIXTURE_SOURCE} no longer defines ${FIXTURES[key].constant}`);
    return m[1];
  };
  const envFile = path.join(root, 'tflw-acceptance/perf/tflw/.env');
  writeFileSync(envFile, `LOAD_USER_EMAIL=${value('loadUserEmail')}\nLOAD_USER_PW=${value('loadUserPw')}\n`);
  return envFile;
}

const runnerPresent = (bin) => run('sh', ['-c', `command -v ${bin}`]).status === 0;

// ── metric extraction, and the population trap it must not fall into ────────────────────────────
//
// **`D749` — the runners are compared on matched populations, and the extractor fails loudly rather
// than defaulting.** tflw's `threshold … duration` reads *only the iterations that succeeded*
// (`SPEC` §12, tflw `M89a`), and k6's bare `http_req_duration` reads every request. This ladder has
// already been bitten by exactly that: `tflw-acceptance/README.md` §M89 records that `M49`'s
// published 3.54% p95 gap silently compared two different populations for months and "happened to
// hold because this scenario runs at a near-zero error rate, where the populations coincide; that
// was luck, not design." The rungs were fixed to emit
// `http_req_duration{name:…,expected_response:true}` — so this extractor must read *that*
// sub-metric, and a gate that read the top-level one would re-introduce a bug this repository has
// already paid for once.
//
// Every reader below throws when its key is absent instead of yielding `undefined`. A comparison
// gate whose inputs quietly became `null` reports "no regression" forever, which is `M141`'s
// vacuity with extra steps.

const need = (value, what, where) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    throw new Error(`${what} is missing from ${where}. The runner's output shape changed; refusing ` +
                    `to report a comparison built on an absent number.`);
  }
  return value;
};

/** tflw: the workload test in `report/results.json`. Percentiles are successful-only by contract. */
function readTflw(reportFile) {
  const doc = JSON.parse(readFileSync(reportFile, 'utf8'));
  const test = (doc.tests ?? []).find((t) => t.kind === 'workload');
  if (!test) throw new Error(`no workload test in ${reportFile} — did the rung run at all?`);
  const m = need(test.metrics, 'metrics', reportFile);
  const seconds = need(doc.durationMs, 'durationMs', reportFile) / 1000;
  return {
    iterations: need(m.iterations, 'metrics.iterations', reportFile),
    errorRate: need(m.errorRate, 'metrics.errorRate', reportFile),
    p95: need(m.durations?.p95, 'metrics.durations.p95', reportFile),
    rps: need(m.iterations, 'metrics.iterations', reportFile) / seconds,
    population: 'successful-only',
  };
}

/** k6 `--summary-export`. The sub-metric name is the rung's own `name` tag plus
 *  `expected_response:true`, which is what makes it comparable to tflw's population (`D749`). */
function readK6(summaryFile, subMetric) {
  const doc = JSON.parse(readFileSync(summaryFile, 'utf8'));
  const metrics = need(doc.metrics, 'metrics', summaryFile);
  const key = `http_req_duration{${subMetric}}`;
  const filtered = metrics[key];
  if (!filtered) {
    throw new Error(
      `${summaryFile} has no \`${key}\`. That sub-metric is what makes k6's percentile comparable ` +
      `to tflw's successful-only one (D749 / D-M89-8); comparing against bare http_req_duration ` +
      `would silently compare two populations. Available: ${Object.keys(metrics).filter((k) => k.startsWith('http_req_duration')).join(', ') || '(none)'}`);
  }
  const values = need(filtered.values ?? filtered, 'values', `${summaryFile} ${key}`);
  const p95 = values['p(95)'] ?? values.p95;
  const reqs = need(metrics.http_reqs?.values?.count ?? metrics.http_reqs?.count,
                    'http_reqs count', summaryFile);
  const seconds = need(doc.state?.testRunDurationMs, 'state.testRunDurationMs', summaryFile) / 1000;
  return {
    iterations: reqs,
    errorRate: (metrics.http_req_failed?.values?.rate ?? metrics.http_req_failed?.rate ?? 0),
    p95: need(p95, `${key} p(95)`, summaryFile),
    rps: reqs / seconds,
    population: subMetric,
  };
}

// ── the legs ────────────────────────────────────────────────────────────────────────────────────

const CURVE_PLANTS = ['C44', 'C45', 'C46', 'C47', 'C48', 'C49', 'C50'];

/** The arrival-curve tier. `verify-construct-acceptance.mjs` starts and stops its own arrival
 *  server, so this leg needs no Docker stack and no fixtures — only a quiet box, which is the
 *  entire reason `D727` put it here instead of in CI. */
function legCurve(root) {
  const r = run(process.execPath,
    [path.join(root, 'scripts/verify-construct-acceptance.mjs'), '--gate', '--only', CURVE_PLANTS.join(',')],
    { cwd: root });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return {
    ok: r.status === 0,
    plants: CURVE_PLANTS,
    exit: r.status,
    // Kept whole. A shape assertion that failed says *which bin* was wrong, and truncating that to
    // a pass/fail bit throws away the only part of the output anybody would act on.
    output: output.trim().split('\n').slice(-60).join('\n'),
  };
}

/** The three-runner ladder. Every rung is run in every runner that is installed; a runner that is
 *  not installed is a **recorded absence** (`absent_runners` in the artifact), never a silently
 *  narrower comparison. */
function legLadder(root, { rungFilter = null } = {}) {
  const perf = path.join(root, 'tflw-acceptance/perf');
  const present = { tflw: true, k6: runnerPresent('k6'), artillery: runnerPresent('artillery') };
  const absent = Object.entries(present).filter(([, yes]) => !yes).map(([name]) => name);

  writeTflwEnv(root);
  // Every mutating rung wants a reset first or it measures a database still carrying the last
  // run's rows (perf/README.md). Done once per leg rather than per rung: the rungs are run back to
  // back and a reset between them would itself be load on the target.
  const reset = run('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}',
                             '-X', 'POST', 'http://localhost:4001/v1/admin/load/reset',
                             '-H', `Authorization: Bearer ${process.env.ADMIN_TOKEN ?? ''}`]);

  const rungs = [];
  for (const rung of RUNGS) {
    if (rungFilter && !rungFilter.includes(rung.name)) continue;
    const row = { name: rung.name, what: rung.what, runners: {}, skipped: {} };

    for (const [runner, rel] of Object.entries(rung.impls)) {
      if (!present[runner]) { row.skipped[runner] = 'not installed on this box'; continue; }
      try {
        row.runners[runner] = runOneRung(perf, runner, rel, rung);
      } catch (error) {
        row.runners[runner] = { error: error.message };
      }
    }
    rungs.push(row);
  }
  return { ok: rungs.every((r) => Object.values(r.runners).every((m) => !m.error)),
           reset_http: reset.stdout, absent_runners: absent, rungs };
}

function runOneRung(perf, runner, rel, rung) {
  const file = path.basename(rel);
  if (runner === 'tflw') {
    const cwd = path.join(perf, 'tflw');
    const report = path.join(cwd, 'report', 'results.json');
    rmSync(report, { force: true });          // the same guard runCorpus documents
    run(process.execPath, [TFLW_BIN, 'run', '--no-color', file], { cwd });
    return readTflw(report);
  }
  if (runner === 'k6') {
    const cwd = path.join(perf, 'k6');
    const out = path.join(cwd, `.summary-${rung.name}.json`);
    rmSync(out, { force: true });
    run('k6', ['run', '--quiet', `--summary-export=${out}`, file], { cwd });
    return readK6(out, `name:${rung.k6Tag ?? rung.name},expected_response:true`);
  }
  if (runner === 'artillery') {
    const cwd = path.join(perf, 'artillery');
    const out = path.join(cwd, `.report-${rung.name}.json`);
    rmSync(out, { force: true });
    run('artillery', ['run', '--output', out, file], { cwd });
    const doc = JSON.parse(readFileSync(out, 'utf8'));
    const agg = need(doc.aggregate, 'aggregate', out);
    const seconds = (need(agg.lastMetricAt, 'lastMetricAt', out) - need(agg.firstMetricAt, 'firstMetricAt', out)) / 1000;
    const reqs = need(agg.counters?.['http.requests'], 'counters["http.requests"]', out);
    return {
      iterations: reqs,
      errorRate: (agg.counters?.['vuser.failed'] ?? 0) / Math.max(1, agg.counters?.['vuser.created'] ?? 1),
      p95: need(agg.summaries?.['http.response_time']?.p95, 'summaries["http.response_time"].p95', out),
      rps: reqs / seconds,
      population: 'all requests',
    };
  }
  throw new Error(`no runner named ${runner}`);
}

/** `M154f` / `M124-03` — the cross-repo seam, on a schedule.
 *
 * ## What this leg is for, and what it is not
 *
 * `testFlow-tests` CI packs tflw from its live `origin/main`, unpinned and deliberately so. That
 * makes the two repositories a linked pair: a breaking change pushed to tflw and not to this one
 * reddens this one until the second push lands. The rule has been kept **by a person remembering**
 * since `M85`, mitigated by a sentence in `CONTRIBUTING.md` and nothing else. `M124-03` filed that,
 * and named both plausible fixes along with what is wrong with each: a scheduled sibling run
 * catches it late and blames the wrong commit, a labelled-change hook catches only what somebody
 * labelled.
 *
 * The row was right about both, and this leg is the first option with the second one's information
 * folded in rather than instead of it. It catches late — that is real and unfixable from here,
 * because tflw's push cannot block on a repository it does not know about. What it does not do is
 * blame the wrong commit: `breaking` below lists the tflw commits between the last measured sha and
 * this one that declared themselves breaking, so a red arrives with its own suspects attached.
 *
 * **The pre-push hook half stays refused**, on `D14` grounds. A hook is an untracked file in one
 * person's `.git/`; a guarantee that lives there is a guarantee for one machine, and this ledger
 * has a row (`M136a-02`) about exactly that class of promise.
 *
 * ## Why it rides on the perf timer rather than getting its own
 *
 * It is four static gates and seconds of work — no Docker, no browser, no load. A second timer
 * would be a second thing to deploy, a second tenant to register and a second lease to reason
 * about, all for a job whose cost is a rounding error against the leg it rides beside. It also
 * wants the *same* property the perf run wants: to be the only thing that reports about the seam
 * between these two repositories.
 *
 * ## Why these four gates and not the whole suite
 *
 * Each one's ground truth **is** the tflw binary, which is precisely what makes it a cross-repo
 * seam rather than a test:
 *
 *   check-diagnostics    the code-assignment seam — a `TF0xx` that reaches tflw `main` with no
 *                        fixture here. `M130-07`'s subject, and the seam `M85` was about
 *   construct-coverage   the manifest seam — a construct shipped with nowhere to be graded
 *   check-acceptance     the grammar seam — a corpus that no longer parses
 *   artifact-contract    the consumed-artifact seam — `M136c-01`, where a renamed SARIF field left
 *                        every code in place, every gate green, and eleven entries broken
 *
 * The rest of the suite grades apiV2, and apiV2 does not move when tflw does.
 */
function legFunctional(root, { tflwCheckout } = {}) {
  const cli = tflwCheckout ? path.join(tflwCheckout, 'packages', 'cli') : null;
  const env = { ...process.env, ...(cli ? { TFLW_SIBLING_CLI: cli } : {}) };

  // Pack tflw's `main` into this checkout first — without it the gates below grade whatever tarball
  // happens to be vendored, which is the `M153b-01` failure mode and would make this leg report a
  // confident wrong answer rather than an old one.
  const refresh = run(process.execPath, [path.join(root, 'scripts/refresh-tflw.mjs')], { cwd: root, env });
  if (refresh.status !== 0) {
    return {
      ok: false,
      stage: 'refresh',
      exit: refresh.status,
      output: `${refresh.stdout ?? ''}${refresh.stderr ?? ''}`.trim().split('\n').slice(-30).join('\n'),
      tflw: tflwCheckout ? describeTree(tflwCheckout) : null,
      gates: {},
      breaking: [],
    };
  }

  const GATES = {
    'check-diagnostics': 'scripts/verify-check-diagnostics.mjs',
    'construct-coverage': 'scripts/verify-construct-coverage.mjs',
    'check-acceptance': 'scripts/check-acceptance.mjs',
    'artifact-contract': 'scripts/verify-artifact-contract.mjs',
  };

  const gates = {};
  for (const [name, rel] of Object.entries(GATES)) {
    const r = run(process.execPath, [path.join(root, rel)], { cwd: root, env });
    gates[name] = {
      ok: r.status === 0,
      exit: r.status,
      // Kept whole on failure for the same reason the curve leg keeps its bins: the useful half of
      // a cross-repo red is *which* code or construct, and a pass/fail bit throws that away.
      output: r.status === 0 ? null : `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n'),
    };
  }

  const tree = tflwCheckout ? describeTree(tflwCheckout) : null;
  return {
    ok: Object.values(gates).every((g) => g.ok),
    gates,
    tflw: tree,
    breaking: tflwCheckout ? breakingSince(tflwCheckout) : [],
  };
}

/** `M124-03`'s `BREAKING` convention, read rather than enforced.
 *
 * The convention is one line in `CONTRIBUTING.md`: a tflw commit that changes what this repository's
 * corpus or gates will accept says `BREAKING:` in its message. Nothing forces it — that was the
 * complaint about the hook shape and it applies here too — so this is deliberately **not** a gate on
 * the convention. It is a lookup performed when the answer is wanted: the leg goes red, and the
 * report names which of the tflw commits since the last measured sha said they would do this.
 *
 * A red with no `BREAKING` commit behind it is not a failure of the convention, and must not read as
 * one. It is the more interesting case — an *unintended* break — and it is the one a labelled-change
 * hook would have missed entirely.
 */
function breakingSince(tflwCheckout) {
  const last = readLastMeasuredTflwSha();
  if (!last) return [];
  const r = run('git', ['-C', tflwCheckout, 'log', '--format=%h%x09%s', `${last}..HEAD`]);
  if (r.status !== 0) return [];
  return r.stdout
    .split('\n')
    .filter((l) => /\bBREAKING\b/.test(l))
    .map((l) => {
      const [sha, ...rest] = l.split('\t');
      return { sha, subject: rest.join('\t') };
    });
}

/** The tflw sha the previous artifact measured, or `null` on the first run / an unreadable file.
 *  `null` means "no range to ask about", which is why `breakingSince` returns an empty list rather
 *  than guessing at a range. */
function readLastMeasuredTflwSha() {
  const latest = path.join(RESULTS, 'latest.json');
  if (!existsSync(latest)) return null;
  try {
    return JSON.parse(readFileSync(latest, 'utf8'))?.legs?.functional?.tflw?.sha ?? null;
  } catch {
    return null;
  }
}

const LEGS = { curve: legCurve, ladder: legLadder, functional: legFunctional };
const PROFILES = {
  curve: ['curve'],
  ladder: ['ladder'],
  functional: ['functional'],
  full: ['curve', 'ladder', 'functional'],
};

// ── the artifact ────────────────────────────────────────────────────────────────────────────────

/** The commit the run measured. `D748`: a scheduled gate that cannot name what it graded is a
 *  number without a subject. */
function describeTree(root) {
  const r = run('git', ['-C', root, 'rev-parse', 'HEAD']);
  const branch = run('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = run('git', ['-C', root, 'status', '--porcelain']);
  return {
    sha: r.status === 0 ? r.stdout.trim() : null,
    branch: branch.status === 0 ? branch.stdout.trim() : null,
    // A dirty tree is recorded, not refused: a human running this by hand on a work-in-progress
    // checkout is legitimate. What must never happen is the *scheduled* run silently grading one.
    dirty: dirty.status === 0 ? dirty.stdout.trim().length > 0 : null,
  };
}

function writeArtifact(doc) {
  mkdirSync(RESULTS, { recursive: true });
  const stamp = new Date(doc.ts * 1000).toISOString().replace(/[:.]/g, '-');
  const file = path.join(RESULTS, `${stamp}.json`);
  const body = `${JSON.stringify(doc, null, 2)}\n`;
  writeFileSync(file, body);
  // `latest.json` is a full copy rather than a symlink: `tflwperfctl.sh` reads it over a path that
  // may not exist yet, and a dangling symlink reports as a *parse* failure rather than as absence.
  writeFileSync(path.join(RESULTS, 'latest.json'), body);
  return file;
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const legs = PROFILES[PROFILE];
  if (!legs) throw new Error(`no profile named ${PROFILE}; have ${Object.keys(PROFILES).join(', ')}`);

  const doc = {
    v: 1,
    ts: Math.floor(Date.now() / 1000),
    profile: PROFILE,
    host: os.hostname(),
    node: process.version,
    lease: LEASE_LABEL,
    tree: describeTree(ROOT),
    tflw: { entry: TFLW_BIN, resolved: TFLW_LABEL ?? 'released' },
    legs: {},
    absent_runners: [],
    regressions: [],
    ok: false,
  };

  if (DRY) {
    log(`dry run — profile ${PROFILE} would run legs: ${legs.join(', ')}`);
    console.log(JSON.stringify(doc, null, 2));
    return 0;
  }

  const lease = await acquireLease();
  try {
    for (const name of legs) {
      log(`leg: ${name}`);
      const result = LEGS[name](ROOT, { tflwCheckout: TFLW_CHECKOUT });
      doc.legs[name] = result;
      if (result.absent_runners) doc.absent_runners = result.absent_runners;
    }
  } catch (error) {
    // A run that dies mid-leg must still leave an artifact, and this is not defensive habit — it is
    // the same failure `tflwperfctl.sh preflight`'s freshness check exists for. Without it a crashed
    // run and a timer that never fired are indistinguishable from the outside: both leave
    // `latest.json` untouched, and "no regression reported" reads identically to "nothing ran".
    // The artifact is the only thing anybody looks at later, so a failure has to be *in* it.
    doc.error = error.message;
    doc.legs.__crashed = { ok: false, at: Object.keys(doc.legs).length, message: error.message };
  } finally {
    lease.release();
    log('lease released');
  }

  // The comparison happens here rather than in a separate pass so the artifact is self-judging:
  // whatever reads it later — `tflwperfctl.sh status`, the dashboard, a human next week — sees the
  // verdict without needing the baseline or this script. That is what "visible without anyone
  // watching" has to mean for a run nobody is watching.
  const judged = compare(doc);
  doc.regressions = judged.regressions;
  doc.compared_rungs = judged.checked;
  doc.uncomparable_rungs = judged.uncomparable;

  doc.ok = !doc.error
    && legs.every((name) => doc.legs[name]?.ok === true)   // every requested leg RAN and passed
    && judged.regressions.length === 0;
  const file = writeArtifact(doc);
  for (const r of judged.regressions) log(`REGRESSION [${r.kind}] ${r.rung ?? '-'}: ${r.detail}`);
  log(`${doc.ok ? 'PASS' : 'FAIL'} — ${judged.checked} rung(s) compared, ` +
      `${judged.regressions.length} regression(s) — ${file}`);
  return doc.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(`[perf-conformance] ${error.message}`);
    process.exit(2);
  });
}

export { acquireLease, writeTflwEnv, readTflw, readK6, need, runnerPresent, legCurve, legLadder, legFunctional, breakingSince,
         describeTree, writeArtifact, main,
         LEGS, PROFILES, CURVE_PLANTS, RESULTS, LEASE_LABEL, PROFILE, DRY, log, run, RUNGS, ROOT };
