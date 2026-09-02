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

import { RUNGS, FIXTURES, FIXTURE_SOURCE, TARGETS } from './lib/perf-ladder.mjs';
import { resolveTflw, resolveArtifactContract } from './lib/tflw-bin.mjs';
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

/** `M160d` / `D835` — the reporting bound of the build this run is about to measure, copied into the
 *  artifact so a derivation months later reads the right one.
 *
 *  `derive-perf-bands.mjs` suppresses a `p95Ratio` band when tflw's own reporting error is a large
 *  share of the reading, and that error is a property of the **binary that produced the number**.
 *  Reading it from whatever tflw is installed when the bands are drawn gets it right only while the
 *  two happen to agree: re-deriving the 2026-08-26 founding runs under a current contract banded
 *  `echo-get-only` from readings of `1/1/1 ms`, whose true error is 50%.
 *
 *  `null` is a real answer, not a failure — a tflw predating the `durations` block rounded every
 *  duration to a whole millisecond, and the consumer has an exact model for that. So this never
 *  throws; `verify-artifact-contract.mjs` is the script whose job is to fail on a missing contract,
 *  and it fails for a different reason (a name this repo reads having gone away). */
function measuringBuildDurations() {
  try {
    const { file } = resolveArtifactContract('released', { label: 'perf-conformance' });
    return JSON.parse(readFileSync(file, 'utf8')).durations ?? null;
  } catch {
    return null;
  }
}

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};
const PROFILE = arg('profile', 'full');
const NO_LEASE = argv.includes('--no-lease');
const DRY = argv.includes('--dry-run');

// `D758` — `--in-sweep`: this run is a **phase of the regression sweep**, not a run of its own.
//
// The nightly timer is disarmed (`D754`) and the automated shape is deferred to publish. What that
// left open is the thing the schedule was for in the first place: a perf regression introduced
// during development is invisible until somebody remembers to measure. CI cannot close it — a
// shared GitHub runner cannot produce a number this ladder's bands mean anything against, and
// `D750` put the *static* half there instead (`verify:perf-parity`, `verify:perf-baseline`). So the
// measured half rides the one thing that already runs on the box, on demand, every time the suite
// is swept: `npm run regression`.
//
// Three things change under this flag and each is a claim that would otherwise be false — the
// lease is inherited rather than re-taken (`D759`), the artifact lands in its own series rather
// than over `latest.json` (`RESULTS_DIR` below), and a machine that is not the box **skips loudly
// with exit 3** rather than failing or, worse, measuring.
const IN_SWEEP = argv.includes('--in-sweep');

/** Where the artifact lands.
 *
 *  An in-sweep run grades a **working tree** — usually dirty, on whatever branch the developer is
 *  on — where every other run of this script grades a checkout reset to `origin/main` (`D748`). Both
 *  are legitimate; what must not happen is the first being read as the second. `latest.json` is what
 *  `tflwperfctl.sh status` reports as the box's perf state and what the tenant registry surfaces, so
 *  a WIP number written there is indistinguishable from a graded one to every reader downstream —
 *  the same shape as a timer that never fired. In-sweep artifacts get their own directory and never
 *  touch `latest.json`. */
const RESULTS_DIR = IN_SWEEP ? path.join(RESULTS, 'sweep') : RESULTS;

const log = (...m) => console.log(`[perf-conformance]`, ...m);

// ── the lease (D747) ────────────────────────────────────────────────────────────────────────────

/**
 * `D759` — inside the sweep the lease is **inherited, not re-taken, and not waived.**
 *
 * `scripts/exec.mjs` already holds the whole-box lock as `tflw:<label>` for the entire sweep, and
 * holds it the same way this file does (`D747`): an open stdin that dies with the driver. `boxlock.sh`
 * is a whole-box mutex and is **not reentrant**, so a phase calling `acquire` inside that would wait
 * out its own parent and fail EX_TEMPFAIL after the timeout. That deadlock is the *correct* behaviour
 * of a correct mutex — there is nothing to fix in the lock, only something to stop asking of it.
 *
 * `--no-lease` is the available escape and it is the wrong one, for a reason worth stating rather
 * than assuming: it logs "the numbers are not trustworthy" and records no holder, and both would be
 * **false** here. The box genuinely is exclusive; the holder is one frame up. Writing "untrusted"
 * into an artifact that was in fact measured under exclusivity corrupts the series in the direction
 * nobody checks — downward, where a reader discounts a real regression.
 *
 * So this verifies the inheritance instead of assuming it. `boxlock.sh status` must name a holder;
 * if it says `free`, the parent lease is gone, the box is open to a forge render mid-ladder, and
 * the run refuses. An unverified inheritance claim would be `--no-lease` with better manners.
 */
function inheritLease() {
  if (!existsSync(BOXLOCK)) {
    throw new Error(
      `--in-sweep needs ${BOXLOCK} to confirm the sweep's lease is held, and it is not there.`);
  }
  const probe = run(BOXLOCK, ['status']);
  const status = (probe.stdout ?? '').trim();
  if (!status.startsWith('held by:')) {
    throw new Error(
      `--in-sweep inherits the sweep's box lease, and \`boxlock.sh status\` reports "${status}". ` +
      `Nothing holds the box, so nothing keeps a forge render off it for the next four minutes. ` +
      `Run the sweep through \`scripts/exec.mjs\` (which takes the lock), or run this script on its ` +
      `own without --in-sweep so it takes its own.`);
  }
  log(`lease INHERITED from the sweep — ${status}`);
  return { release: () => {}, leased: true, inherited: status.replace(/^held by:\s*/, '') };
}

/** Spawn the real `boxlock.sh acquire` and resolve once it prints READY. Returns a release fn. */
function acquireLease(timeoutS = 1800) {
  if (IN_SWEEP) return inheritLease();
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

  // **`M154f-04` — read the rate k6 publishes rather than dividing by a field it stopped
  // emitting.** This used to be `reqs / (doc.state.testRunDurationMs / 1000)`. k6 v2's
  // `--summary-export` has no `state` block at all — the document is `{ root_group, metrics }` —
  // so `need()` threw on every single rung and the whole k6 half of the ladder produced nothing.
  // A counter's own `rate` is count-per-second over the run, which is the number that division was
  // reconstructing, and it cannot be removed without removing the counter. The `state` path is
  // kept as a fallback so an older k6 still works, but it is no longer the primary.
  const rate = metrics.http_reqs?.values?.rate ?? metrics.http_reqs?.rate;
  const stateSeconds = doc.state?.testRunDurationMs ? doc.state.testRunDurationMs / 1000 : null;
  const rps = need(rate ?? (stateSeconds ? reqs / stateSeconds : undefined),
                   'http_reqs rate (and no state.testRunDurationMs to reconstruct it from)',
                   summaryFile);

  // **`M154f-04` — and the error rate is read, not defaulted.** The previous expression ended in
  // `?? 0`, and neither of the two keys it tried exists in k6 v2: a `Rate` metric exports
  // `{ passes, fails, value }`, where `value` *is* the rate and `passes` counts the failures. So
  // every k6 rung in every artifact recorded `errorRate: 0` — not measured, asserted. That is the
  // one number `verify-perf-baseline.mjs` calls its calibration-free rule, and defaulting it is
  // precisely what this file's own header forbids two screens above: "a comparison gate whose
  // inputs quietly became null reports no regression forever".
  const failed = need(metrics.http_req_failed, 'http_req_failed', summaryFile);
  const errorRate = need(failed.values?.rate ?? failed.value ?? failed.rate,
                         'http_req_failed rate/value', summaryFile);

  return {
    iterations: reqs,
    errorRate,
    p95: need(p95, `${key} p(95)`, summaryFile),
    rps,
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
  const acceptance = path.join(root, 'tflw-acceptance');
  const present = { tflw: true, k6: runnerPresent('k6'), artillery: runnerPresent('artillery') };
  const absent = Object.entries(present).filter(([, yes]) => !yes).map(([name]) => name);

  writeTflwEnv(root);

  const selected = RUNGS.filter((r) => !rungFilter || rungFilter.includes(r.name));
  const needed = new Set(selected.map((r) => r.target));

  // `M154f-05` — start the servers this leg owns. Only `echo` is `managed: 'driver'`; apiV2 is the
  // Docker stack and is asserted, never started.
  const servers = [];
  for (const name of needed) {
    const target = TARGETS[name];
    if (target?.managed !== 'driver') continue;
    servers.push(startManagedTarget(acceptance, name, target));
  }

  try {
    // `M154f-06` — the reset, authenticated in a way that actually works, and **gated**.
    const reset = resetLoadTarget(root);

    // `M154f-09` — what every target looked like before any load was applied. Everything after is
    // judged against this rather than against an absolute, for `D750`'s reason: on this box an
    // absolute latency bound is either a flake generator or vacuous, but a target that is ten times
    // slower than it was ten minutes ago in the same run is not ambiguous.
    const health = {};
    for (const name of needed) health[name] = { before: probeTarget(name) };

    const rungs = [];
    for (const rung of selected) {
      const row = { name: rung.name, what: rung.what, target: rung.target, runners: {}, skipped: {} };
      row.health = { before: probeTarget(rung.target) };

      for (const [runner, rel] of Object.entries(rung.impls)) {
        if (!present[runner]) { row.skipped[runner] = 'not installed on this box'; continue; }
        try {
          row.runners[runner] = runOneRung(acceptance, runner, rel, rung);
        } catch (error) {
          row.runners[runner] = { error: error.message };
        }
      }

      row.health.after = probeTarget(rung.target);
      row.health.baseline = health[rung.target]?.before;
      row.target_ok = judgeHealth(row.health, health[rung.target]?.before);
      rungs.push(row);
    }

    for (const name of needed) health[name].after = probeTarget(name);

    return {
      // The leg passes only if every runner produced metrics **and** the reset worked **and** every
      // rung left its target as healthy as it found it. Before `M154f` this was the first clause
      // alone, which is why a run against a target spending 97% of its wall-clock in GC reported
      // five clean rungs at a 0% error rate.
      ok: rungs.every((r) => Object.values(r.runners).every((m) => !m.error))
          && reset.ok
          && rungs.every((r) => r.target_ok?.ok !== false),
      reset,
      reset_http: reset.http,      // kept: `tflwperfctl.sh status` and older artifacts read this key
      health,
      absent_runners: absent,
      rungs,
    };
  } finally {
    for (const s of servers) s.stop();
  }
}

/** `M154f-06` — reset the load target, with a credential that works, and report whether it did.
 *
 * The old call sent `Authorization: Bearer ${process.env.ADMIN_TOKEN ?? ''}`. Two things were wrong
 * with it and only the first is obvious. **No unit sets `ADMIN_TOKEN`**, so under systemd the header
 * was the literal `Bearer ` and the endpoint answered 401. And **it could not have worked if one
 * had been set**: `JWT_ACCESS_TTL` defaults to `5s` (docker-compose.yml), so any token minted early
 * enough to be put in the environment is expired by the time the leg runs — measured on 2026-08-26
 * as 201, then 401 six seconds later.
 *
 * `AnyAuthGuard` accepts HTTP Basic as well as a bearer token, and Basic has no expiry, so the fix
 * is to stop minting anything. The credentials are read out of `apiV2/src/seed/seed.ts` — the file
 * that creates the account — with the same env-then-literal precedence the app itself uses, so a
 * box that overrides `ADMIN_PW` is followed rather than guessed at. Copying the literal into this
 * file instead would be a fourth copy of a fixture that has already drifted twice (`D744`).
 *
 * And the result is **returned as a judgement, not as a number**. `reset_http` was recorded in every
 * artifact and read by nothing: a failed reset means every mutating rung measured a database still
 * holding the last run's rows, which is a wrong measurement rather than a missing one.
 */
const ADMIN_SEED_SOURCE = 'apiV2/src/seed/seed.ts';

function adminCredentials(root) {
  const file = path.join(root, ADMIN_SEED_SOURCE);
  const src = readFileSync(file, 'utf8');
  const seeded = (name) => {
    // Anchored on `process.env.<NAME> ??` so `ORG_A_ADMIN_EMAIL` cannot satisfy `ADMIN_EMAIL`.
    const m = src.match(new RegExp(`process\\.env\\.${name}\\s*\\?\\?\\s*'([^']+)'`));
    if (!m) {
      throw new Error(`${ADMIN_SEED_SOURCE} no longer defaults ${name} to a literal. The reset ` +
                      `credential is read from the seed so it cannot drift from the account that ` +
                      `is actually created; update this pattern rather than hardcoding a copy.`);
    }
    return m[1];
  };
  return {
    email: process.env.ADMIN_EMAIL ?? seeded('ADMIN_EMAIL'),
    password: process.env.ADMIN_PW ?? seeded('ADMIN_PW'),
  };
}

function resetLoadTarget(root) {
  const { email, password } = adminCredentials(root);
  const r = run('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '60',
                         '-X', 'POST', 'http://localhost:4001/v1/admin/load/reset',
                         '-u', `${email}:${password}`]);
  const http = (r.stdout ?? '').trim();
  const ok = /^2\d\d$/.test(http);
  return {
    ok,
    http,
    as: email,
    detail: ok ? null
      : `POST /v1/admin/load/reset answered ${http || '(no response)'} as ${email}. Every mutating ` +
        `rung after this one measured a database carrying the previous run's rows.`,
  };
}

// ── `M154f-09` — the target is checked, not assumed ─────────────────────────────────────────────
//
// **What the ladder could not see.** Its two existing rules are `errorRate > 1%` and "a rung with
// no co-runner is a failure". Both catch a target that is **down**. Neither catches one that is
// **dying**, and those are different failures: a degraded target answers everything successfully
// and only slowly, so the error rate stays at zero while every latency sample is poisoned.
//
// That is not hypothetical either. On 2026-08-26 apiV2 spent this leg heading for a heap OOM — the
// GC log's `current mu = 0.027` says 97% of wall-clock went to garbage collection — and exited 139
// during the run. All five completed rungs reported a **0% error rate**. `checkout-burst` came in
// at p95 95 ms against the ~68-72 ms this box had recorded at `M46`-`M48`. Nothing flagged any of
// it, and had the k6 half of the ladder been working that run would have written those numbers into
// `baseline.json` as the **founding** band for every future comparison.
//
// So the assertion is a ratio inside one run, not an absolute: `D750`'s reasoning applies here for
// the same reason it applies to the bands. The bound is deliberately loose — a target ten times
// slower on a trivial health endpoint than it was minutes earlier is not a slow box, it is a broken
// process — and both numbers ride along in the artifact so it can be tightened from data rather
// than from taste.

export const HEALTH_DEGRADATION_FACTOR = 5;

/**
 * **The bound is anchored on the leg's opening probe, not on the previous rung.**
 *
 * The first version of this check compared each rung's closing probe to its own opening one, and
 * the run of 2026-08-26 proved that structurally cannot work: apiV2 leaked its way from a 2.2 ms
 * health endpoint to a 144 ms one over eight rungs and then died of a heap OOM, while **every
 * single rung reported `ok`** — ratios of 0.86, 0.97, 1.22, 0.99, 8.32, 0.78, 1.06, 4.17. Each step
 * was small; the walk was 65x. A neighbour-anchored ratio is blind to monotone drift by
 * construction, which is exactly the shape of failure a leaking target produces.
 *
 * So each rung is judged against **both**: the leg's opening baseline for that target (catches
 * drift) and its own opening probe (catches a collapse inside one rung, which baseline-anchoring
 * would miss if the baseline were already bad).
 *
 * **5x is measured, not chosen.** In that same run the health endpoint read 2.13-3.34 ms on every
 * probe taken while the target was healthy — including during `dogfood-get-only`, which was serving
 * 12,913 requests a second at the time. Legitimate load does not move this endpoint at all. The
 * bound is therefore roughly twice the widest healthy reading observed under the ladder's heaviest
 * rung, and the numbers it is derived from ride along in every artifact so the next person can
 * check that claim rather than trust it.
 */

/** Median of three, because one sample of a sub-millisecond endpoint is mostly process-spawn noise.
 *  `curl` rather than `fetch` so the probe and the reset share one mechanism and one timeout. */
function probeTarget(name) {
  const target = TARGETS[name];
  if (!target?.health) return { ok: null, why: `no health endpoint declared for target ${name}` };
  const samples = [];
  let http = '';
  for (let i = 0; i < 3; i += 1) {
    const t0 = process.hrtime.bigint();
    const r = run('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '10', target.health]);
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
    http = (r.stdout ?? '').trim();
    if (!/^2\d\d$/.test(http)) break;
  }
  samples.sort((a, b) => a - b);
  return {
    ok: /^2\d\d$/.test(http),
    http,
    ms: Math.round(samples[Math.floor(samples.length / 2)] * 100) / 100,
  };
}

/** `{ ok }` plus, when not ok, the reason — so the artifact says *what* was wrong with the target
 *  rather than only that something was. `baseline` is the leg's opening probe for this target. */
function judgeHealth(health, baseline) {
  const { before, after } = health;
  if (before?.ok === null || after?.ok === null) return { ok: null, why: 'target has no health endpoint' };
  if (before?.ok === false) {
    return { ok: false, why: `the target was already unhealthy before this rung ran (health said ` +
                             `${before.http || 'nothing'}), so its numbers describe a broken target.` };
  }
  if (after?.ok === false) {
    return { ok: false, why: `the target stopped answering its health endpoint during this rung ` +
                             `(${after.http || 'no response'}). It was healthy when the rung started, ` +
                             `so the rung's own numbers were taken from a process that was failing.` };
  }

  const floor = (ms) => Math.max(ms, 0.5);        // a sub-ms endpoint must not make the ratio explode
  const drift = baseline?.ok ? after.ms / floor(baseline.ms) : null;
  const within = after.ms / floor(before.ms);
  const out = { ok: true, ratio: Math.round(within * 100) / 100 };
  if (drift !== null) out.drift = Math.round(drift * 100) / 100;

  if (drift !== null && drift > HEALTH_DEGRADATION_FACTOR) {
    return { ...out, ok: false,
             why: `the target's health endpoint reads ${after.ms} ms, ${drift.toFixed(1)}x the ` +
                  `${baseline.ms} ms it read when this leg started — past the ` +
                  `${HEALTH_DEGRADATION_FACTOR}x bound. The rung's own step was only ` +
                  `${within.toFixed(2)}x, which is the point: a target that degrades a little under ` +
                  `every rung is invisible to a neighbour-anchored check and has still stopped being ` +
                  `the target the earlier rungs were measured against.` };
  }
  if (within > HEALTH_DEGRADATION_FACTOR) {
    return { ...out, ok: false,
             why: `the target's health endpoint went from ${before.ms} ms to ${after.ms} ms across ` +
                  `this one rung — ${within.toFixed(1)}x, past the ${HEALTH_DEGRADATION_FACTOR}x ` +
                  `bound. A target that degrades this far under a rung answers every request ` +
                  `successfully and slowly, so the error rate stays at 0% while every latency sample ` +
                  `is poisoned.` };
  }
  return out;
}

/** `M154f-05` — start a `managed: 'driver'` target and hand back a stop. Waits for it to answer
 *  rather than sleeping: the echo server binds in milliseconds, but "rather than sleeping" is the
 *  difference between a flake and a failure on a loaded box. */
function startManagedTarget(acceptance, name, target) {
  const script = path.join(acceptance, target.script);
  if (!existsSync(script)) {
    throw new Error(`target \`${name}\` declares ${target.script}, which does not exist under ` +
                    `tflw-acceptance/. The manifest and the tree disagree.`);
  }
  const child = spawn(process.execPath, [script, String(target.port)], {
    cwd: path.dirname(script), stdio: 'ignore', detached: false,
  });
  const deadline = Date.now() + 15000;
  let up = false;
  while (Date.now() < deadline) {
    if (probeTarget(name).ok) { up = true; break; }
  }
  if (!up) {
    try { child.kill('SIGKILL'); } catch {}
    throw new Error(`target \`${name}\` did not answer ${target.health} within 15s of starting ` +
                    `${target.script}.`);
  }
  log(`started managed target ${name} (${target.script} on :${target.port})`);
  return { name, stop: () => { try { child.kill('SIGTERM'); } catch {} } };
}

/** **`M154f-05` — the rung's own path decides where it runs, not the runner's name.**
 *
 * This used to be `path.basename(rel)` with a `cwd` derived from `runner`, which threw away the
 * directory the manifest had just supplied. For five of seven rungs the two agreed and the bug was
 * invisible; for `echo-get-only` and `echo-post-only`, whose tflw side deliberately lives under
 * `perf/profile/` (its `why` says so, and says why), it looked for `perf/tflw/echo-get-only.tflw`
 * and died `ENOENT`. Both were then reported as regressions, which is the correct outcome for the
 * wrong reason: the rung had not regressed, the driver could not find it.
 *
 * `M154f-02` is the same bug — a path reduced to its basename and re-derived from something other
 * than itself — in a different file, filed the same week. Worth one sentence here so the pair is
 * findable from either end.
 */
function runOneRung(acceptance, runner, rel, rung) {
  const cwd = path.join(acceptance, path.dirname(rel));
  const file = path.basename(rel);
  if (!existsSync(path.join(cwd, file))) {
    throw new Error(`${rel} does not exist under tflw-acceptance/. verify-perf-parity.mjs asserts ` +
                    `every impl path, so this means the manifest and the tree drifted since it ran.`);
  }

  if (runner === 'tflw') {
    const report = path.join(cwd, 'report', 'results.json');
    rmSync(report, { force: true });          // the same guard runCorpus documents
    run(process.execPath, [TFLW_BIN, 'run', '--no-color', file], { cwd });
    return readTflw(report);
  }
  if (runner === 'k6') {
    const out = path.join(cwd, `.summary-${rung.name}.json`);
    rmSync(out, { force: true });
    const r = run('k6', ['run', '--quiet', `--summary-export=${out}`, file], { cwd });
    if (!existsSync(out)) {
      // k6 writes no summary at all when it rejects the script — an unsupported threshold
      // aggregation exits 104 before a single request is made. Without this the failure surfaced as
      // a bare ENOENT with no hint that k6 had an opinion about why.
      throw new Error(`k6 wrote no summary for ${rel} (exit ${r.status}). k6 said: ` +
                      `${((r.stderr ?? '') + (r.stdout ?? '')).trim().split('\n').slice(-3).join(' / ') || '(nothing)'}`);
    }
    return { ...readK6(out, `name:${rung.k6Tag ?? rung.name},expected_response:true`), exit: r.status };
  }
  if (runner === 'artillery') {
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
  // `D760` — the sweep runs `sweep`, not `full`, and the omission is `curve`.
  //
  // `full` is what the disarmed unit ran, and it is the right profile for a run whose whole purpose
  // is the measurement. As a *phase* the arithmetic is different: the sweep already costs dozens of
  // phases each paying a Docker restart, and `curve` is the breaking-point search — the longest leg, the
  // most sensitive to a neighbour, and the one whose answer moves least between two commits on a
  // branch. `ladder` is the leg that catches a regression (7 rungs, ratio bands, ~4 min measured)
  // and `functional` is 55s and proves the perf constructs still work at all. Adding those two to a
  // sweep is a cost a developer will keep paying; adding the breaking-point search is one they will
  // start skipping, and a gate that gets skipped is worth less than a smaller gate that does not.
  // `--profile full` remains exactly as available as it was for the deliberate, on-demand run.
  sweep: ['ladder', 'functional'],
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
  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date(doc.ts * 1000).toISOString().replace(/[:.]/g, '-');
  const file = path.join(RESULTS_DIR, `${stamp}.json`);
  const body = `${JSON.stringify(doc, null, 2)}\n`;
  writeFileSync(file, body);
  // `latest.json` is a full copy rather than a symlink: `tflwperfctl.sh` reads it over a path that
  // may not exist yet, and a dangling symlink reports as a *parse* failure rather than as absence.
  //
  // An in-sweep run writes its artifact and stops there (`D758`): it is judged, it is kept, and it
  // is deliberately not promoted, because `latest.json` answers "what is the box's perf state" and
  // a dirty branch tree is not an answer to that question.
  if (!IN_SWEEP) writeFileSync(path.join(RESULTS, 'latest.json'), body);
  return file;
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const legs = PROFILES[PROFILE];
  if (!legs) throw new Error(`no profile named ${PROFILE}; have ${Object.keys(PROFILES).join(', ')}`);

  // **Exit 3 is SKIPPED, and it is a third verdict for the same reason the run itself has three.**
  //
  // `npm run regression` is CONTRIBUTING's documented local command and it is not only ever run on
  // the box — a contributor sweeps on a laptop with no `boxlock.sh` and no k6. Two of the three ways
  // to handle that are wrong. Failing turns a perfectly good sweep red for a machine the phase was
  // never meant to grade. Passing quietly is worse, and is this pair of repos' oldest recurring
  // defect: the phase reads green in the summary and nobody learns the perf gate has not run on
  // anything for a month. So it exits 3, prints why, and `regression.mjs` renders it as `⊘ skipped`
  // — present in the summary, counted separately, and impossible to mistake for a measurement.
  if (IN_SWEEP) {
    const missing = [];
    if (!existsSync(BOXLOCK)) missing.push(`no boxlock.sh at ${BOXLOCK}`);
    if (!runnerPresent('k6')) missing.push('k6 is not on PATH');
    if (missing.length > 0) {
      log(`SKIPPED — ${missing.join('; ')}.`);
      log(`This phase measures on fedora-box only: the ladder's bands are ratios taken under a ` +
          `whole-box lease (\`D750\`), and a number from anywhere else is not comparable to them. ` +
          `Sweep through \`node scripts/exec.mjs exec -- npm run regression\` to include it.`);
      return 3;
    }
  }

  const doc = {
    v: 1,
    ts: Math.floor(Date.now() / 1000),
    profile: PROFILE,
    host: os.hostname(),
    node: process.version,
    lease: LEASE_LABEL,
    tree: describeTree(ROOT),
    tflw: { entry: TFLW_BIN, resolved: TFLW_LABEL ?? 'released', durations: measuringBuildDurations() },
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
  if (lease.inherited) doc.lease = `inherited:${lease.inherited}`;
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
    log(lease.inherited ? 'lease stays with the sweep' : 'lease released');
  }

  // The comparison happens here rather than in a separate pass so the artifact is self-judging:
  // whatever reads it later — `tflwperfctl.sh status`, the dashboard, a human next week — sees the
  // verdict without needing the baseline or this script. That is what "visible without anyone
  // watching" has to mean for a run nobody is watching.
  const judged = compare(doc);
  doc.regressions = judged.regressions;
  doc.compared_rungs = judged.checked;
  doc.uncomparable_rungs = judged.uncomparable;

  // **`M154f-10` — a run that compared nothing does not get to say PASS.**
  //
  // Until the bands are set, every rung takes `compare()`'s un-established branch: pushed to
  // `uncomparable` and `continue`d, with no regression raised. That is deliberate — an unset band is
  // not a regression — but it meant `doc.ok` could be `true` with `compared_rungs: 0`, and it was:
  // the 2026-08-26 re-run, with the k6 half repaired and all seven rungs producing metrics, printed
  // `PASS — 0 rung(s) compared, 0 regression(s)`. Before the repair the accidental `no-peer`
  // regressions had been holding the run red, so fixing the ladder is what *exposed* this rather
  // than what caused it.
  //
  // A green that means "nothing was checked" is the precise thing this file's own gate exists to
  // refuse, one level up: `verify-perf-baseline.mjs` calls reporting no-regression for an
  // uncompared rung "the precise shape of a vacuous check", and then the run wrapping it said PASS
  // for eight of them at once. So there are three verdicts rather than two, and the calibration run
  // — which is *supposed* to compare nothing, because its job is to produce the numbers the bands
  // are written from — reports `unjudged`. That is not a failure and reads as neither: it is a run
  // that has produced data and not a verdict.
  const ranTheLadder = (doc.legs.ladder?.rungs ?? []).length > 0;
  const failed = Boolean(doc.error)
    || !legs.every((name) => doc.legs[name]?.ok === true)   // every requested leg RAN and passed
    || judged.regressions.length > 0;
  doc.verdict = failed ? 'fail'
              : (ranTheLadder && judged.checked === 0) ? 'unjudged'
              : 'pass';
  doc.ok = doc.verdict === 'pass';

  const file = writeArtifact(doc);
  for (const r of judged.regressions) log(`REGRESSION [${r.kind}] ${r.rung ?? '-'}: ${r.detail}`);
  if (doc.verdict === 'unjudged') {
    log(`every rung ran and none could be compared: \`perf/baseline.json\` has no bands yet ` +
        `(\`established: false\`). Write them from this artifact's ratios, then a later run has ` +
        `something to judge against.`);
  }
  log(`${doc.verdict.toUpperCase()} — ${judged.checked} rung(s) compared, ` +
      `${judged.regressions.length} regression(s) — ${file}`);
  // `unjudged` exits non-zero: a scheduled job whose exit code says "fine" when nothing was checked
  // is the same silence as a timer that never fired, which is what `tflwperfctl.sh preflight`'s
  // freshness check already exists to break.
  return doc.verdict === 'pass' ? 0 : 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(`[perf-conformance] ${error.message}`);
    process.exit(2);
  });
}

export { acquireLease, writeTflwEnv, readTflw, readK6, need, runnerPresent, legCurve, legLadder, legFunctional, breakingSince,
         adminCredentials, resetLoadTarget, probeTarget, judgeHealth, startManagedTarget, runOneRung,
         describeTree, writeArtifact, main,
         LEGS, PROFILES, CURVE_PLANTS, RESULTS, LEASE_LABEL, PROFILE, DRY, log, run, RUNGS, ROOT };
