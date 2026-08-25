#!/usr/bin/env node
// **The perf regression gate** — `M154e` step 5, testFlow `PLAN_M154_DOGFOOD_CONFORMANCE.md`.
//
// The milestone asks for "a comparison gate so a regression is visible without anyone watching".
// This is it, and it has two halves that run in different places for different reasons:
//
//   `verify:perf-baseline`  (static, CI)   the baseline file is well-formed, covers every rung the
//                                          manifest says has at least two runners, and declares no
//                                          band that cannot fail.
//   `compare(artifact)`     (the box run)  judges one run's artifact and returns its regressions,
//                                          which `perf-conformance.mjs` folds into the artifact and
//                                          `tflwperfctl.sh status` reports.
//
// ## `D750` — the gate compares tflw against its co-runners in the same run, not against last
// ## month's absolute numbers
//
// Absolute throughput on `fedora-box` moves with thermal state, whatever else holds the lease, the
// 2.4 GHz link and the kernel. A gate on absolutes is either a flake generator or, once widened
// enough to stop flaking, vacuous — `M141`'s finding class exactly. The ladder already exists to
// answer a *comparative* question ("so tflw's numbers can be compared against two established tools
// rather than asserted"), and a ratio between two runners measured in the same window cancels most
// of the box-state variance that makes the absolutes untrustworthy. So the bands are on
// `tflw.rps / k6.rps` and `tflw.p95 / k6.p95`, and the absolutes ride along in the artifact as
// history rather than as the gate.
//
// **A rung with no co-runner present is a failure, not a pass.** If k6 and Artillery are both
// absent there is no comparison to make, and reporting "no regression" for a rung nothing was
// compared against is the precise shape of a vacuous check.
//
// ## The half that has teeth before anything is calibrated
//
// The ratio bands need a measured run to be set, and until the ladder is next run in anger they are
// `null` (`established: false`). That would leave this gate toothless for its whole first life, so
// it carries a second rule that needs no calibration at all: **every rung's error rate must stay
// under its own declared threshold**. That is not a stylistic addition. On 2026-08-05 the tflw side
// of `dogfood-post-uncontended` ran at a **100% error rate while reporting PASS**, because it
// declared no `threshold` at all (tflw `TF033`/`M60`) — the single most expensive thing this ladder
// has ever failed to notice. An error-rate ceiling is robust to every box condition that makes the
// latency numbers untrustworthy, so it is the one bound worth asserting before any baseline exists.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUNGS } from './lib/perf-ladder.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const BASELINE_FILE = path.join(ROOT, 'tflw-acceptance/perf/baseline.json');

/** Every rung's own rungs declare `threshold error rate is less than 1%`; the gate holds the run to
 *  the same number rather than inventing a second one. */
export const ERROR_RATE_CEILING = 0.01;

/** A band wider than this is not a band. Chosen as an assertion about *bands*, not about the box:
 *  a 3x window on a ratio between two runners doing identical work would admit a rewrite that made
 *  tflw three times slower, which is the regression the gate exists to catch. */
export const MAX_BAND_SPREAD = 3;

export const readBaseline = () => JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));

/** Rungs that can be compared at all: at least two runners implement them. */
export const comparableRungs = () =>
  RUNGS.filter((r) => Object.keys(r.impls ?? {}).length >= 2);

// ── the run-time half ───────────────────────────────────────────────────────────────────────────

/**
 * Judge one artifact. Returns `{ regressions, checked, uncomparable }`.
 *
 * Deliberately returns rather than exits: the caller is the scheduled run, and its job is to write
 * the verdict into the artifact so something unattended can read it later.
 */
export function compare(artifact, baseline = readBaseline()) {
  const regressions = [];
  const ladder = artifact.legs?.ladder;
  let checked = 0;
  const uncomparable = [];

  // The curve leg is pass/fail on its own known answers; there is nothing to compare it against.
  if (artifact.legs?.curve && artifact.legs.curve.ok === false) {
    regressions.push({
      kind: 'curve', rung: null,
      detail: `the arrival-curve tier failed (exit ${artifact.legs.curve.exit}). A workload shape ` +
              `no longer paces the way its plant says it does.`,
    });
  }

  if (!ladder) return { regressions, checked, uncomparable };

  for (const row of ladder.rungs ?? []) {
    const runners = row.runners ?? {};
    const tflw = runners.tflw;
    if (!tflw || tflw.error) {
      regressions.push({ kind: 'rung-failed', rung: row.name,
                         detail: tflw?.error ?? 'the tflw side did not produce metrics' });
      continue;
    }

    // The calibration-free rule.
    if (tflw.errorRate > ERROR_RATE_CEILING) {
      regressions.push({
        kind: 'error-rate', rung: row.name,
        detail: `tflw error rate ${(tflw.errorRate * 100).toFixed(2)}% exceeds the ` +
                `${(ERROR_RATE_CEILING * 100).toFixed(0)}% ceiling. On 2026-08-05 this rung ran at ` +
                `100% and still reported PASS; that is what this bound exists for.`,
      });
    }

    const peer = runners.k6 && !runners.k6.error ? ['k6', runners.k6]
               : runners.artillery && !runners.artillery.error ? ['artillery', runners.artillery]
               : null;
    if (!peer) {
      // Not silently skipped — see the header. No comparison happened, so the rung is unjudged.
      uncomparable.push(row.name);
      regressions.push({
        kind: 'no-peer', rung: row.name,
        detail: `no co-runner produced metrics for this rung (skipped: ` +
                `${Object.entries(row.skipped ?? {}).map(([k, v]) => `${k} — ${v}`).join('; ') || 'none recorded'}), ` +
                `so nothing was compared. Reporting "no regression" here would be a vacuous pass.`,
      });
      continue;
    }

    const [peerName, peerMetrics] = peer;
    const bands = baseline.rungs?.[row.name];
    if (!bands || !bands.rpsRatio) {
      uncomparable.push(row.name);
      continue;   // un-established: reported by the static half, not a regression on its own
    }
    checked += 1;

    for (const [key, actual] of [['rpsRatio', tflw.rps / peerMetrics.rps],
                                 ['p95Ratio', tflw.p95 / peerMetrics.p95]]) {
      const band = bands[key];
      if (!band) continue;
      if (actual < band.min || actual > band.max) {
        regressions.push({
          kind: key, rung: row.name,
          detail: `tflw/${peerName} ${key} is ${actual.toFixed(3)}, outside the recorded band ` +
                  `[${band.min}, ${band.max}].`,
        });
      }
    }
  }
  return { regressions, checked, uncomparable };
}

// ── the static half ─────────────────────────────────────────────────────────────────────────────

export function checkBaselineShape(baseline = readBaseline()) {
  const problems = [];
  const rungs = baseline.rungs ?? {};

  for (const rung of comparableRungs()) {
    if (!(rung.name in rungs)) {
      problems.push(`\`${rung.name}\` implements ${Object.keys(rung.impls).length} runners but has no row in ` +
                    `perf/baseline.json. A rung that quietly leaves the baseline is a rung nothing compares.`);
    }
  }
  for (const name of Object.keys(rungs)) {
    if (!RUNGS.some((r) => r.name === name)) {
      problems.push(`perf/baseline.json has a row for \`${name}\`, which is on no rung in perf-ladder.mjs.`);
    }
    for (const key of ['rpsRatio', 'p95Ratio']) {
      const band = rungs[name]?.[key];
      if (band === null || band === undefined) continue;
      if (!(band.min > 0) || !(band.max > band.min)) {
        problems.push(`\`${name}\`.${key} is not a band: min must be > 0 and max > min (got ${JSON.stringify(band)}).`);
      } else if (band.max / band.min > MAX_BAND_SPREAD) {
        problems.push(`\`${name}\`.${key} spans ${(band.max / band.min).toFixed(1)}x, wider than the ` +
                      `${MAX_BAND_SPREAD}x limit — a band that cannot fail is not a check (M141).`);
      }
    }
  }
  if (baseline.established === true) {
    const missing = comparableRungs().filter((r) => !rungs[r.name]?.rpsRatio).map((r) => r.name);
    if (missing.length) {
      problems.push(`baseline.json claims \`established: true\` but ${missing.length} rung(s) still have ` +
                    `no band: ${missing.join(', ')}.`);
    }
  }
  return problems;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  if (!existsSync(BASELINE_FILE)) {
    console.error(`✗ perf baseline: ${BASELINE_FILE} does not exist.`);
    process.exit(1);
  }
  const baseline = readBaseline();
  const problems = checkBaselineShape(baseline);
  if (problems.length) {
    console.error('✗ perf baseline\n');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const comparable = comparableRungs();
  const withBands = comparable.filter((r) => baseline.rungs?.[r.name]?.rpsRatio).length;
  console.log(
    `✓ perf baseline: ${comparable.length} comparable rung(s), ${withBands} with recorded bands, ` +
    `error-rate ceiling ${(ERROR_RATE_CEILING * 100).toFixed(0)}%` +
    (baseline.established ? '' : ` — bands not yet established (set by the first scheduled run; see B6-15)`));
}
