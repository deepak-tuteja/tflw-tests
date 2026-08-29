#!/usr/bin/env node
// **Founds `tflw-acceptance/perf/baseline.json` from measured runs** — `B6-15`, testFlow
// `PLAN_M154_DOGFOOD_CONFORMANCE.md`.
//
// The bands this writes are the reference every future perf comparison is judged against, so the
// way they are derived has to be reviewable rather than a shell one-liner someone ran once. That is
// the whole reason this is a script in the repo: `M154f-09` is the row for a rule that was written
// from whichever run happened to be green and turned out to be anchored on the wrong thing.
//
// ## Why it refuses a single run
//
// A band derived from one sample encodes that sample's box state — thermal, lease neighbours, page
// cache — as if it were tflw's behaviour. Two clean runs do not make a variance estimate either,
// and this script does not pretend otherwise: it widens whatever spread it *observed* by a margin
// rather than computing a confidence interval from n=2. What two runs buy is the ability to notice
// that a ratio is not reproducible at all, which one run cannot show.
//
// ## What disqualifies a measurement
//
// A rung contributes only if its own target stayed healthy through it, and — for rungs that measure
// apiV2's database — only if the run's load-target reset succeeded. Those are per-rung tests rather
// than per-run ones on purpose: a run can be an incident for one target and a clean measurement for
// another, and throwing the whole artifact away loses observations that make the bands *wider and
// more honest*, not narrower.
//
// ## Why some rungs get no `p95Ratio`
//
// `M154f-12` — tflw *used to* report percentiles as integer milliseconds. When tflw's p95 was small
// the ratio against a co-runner reporting sub-millisecond numbers was dominated by that rounding,
// not by either tool's behaviour: `echo-get-only` read 1.00/0.37 = 2.68, and a "1" that is really
// anything in [0.5, 1.5) makes the true ratio anywhere from 1.35 to 4.05. A band over that measures
// the reporter's quantisation. So the rule is stated as a **condition, not a rung list** (`M131`).
//
// ## Where the quantum comes from, and why it is no longer a number in this file (`M160d`, `D834`)
//
// It was one, and that was the defect. `QUANTUM_MS = 0.5` is a statement about **tflw's** behaviour
// living in **this** repository, and tflw's `M160a` falsified it: durations are no longer rounded at
// the point of measurement, and `D809` renders them magnitude-relatively (integer at or above 10 ms,
// two significant digits below). Nothing went red. This script went on suppressing bands using a
// quantum tflw no longer had — `M136a`'s cross-repo break exactly, one artifact over, with
// arithmetic in place of a field name.
//
// So tflw publishes the bound itself, in `dist/artifact-contract.json`'s `durations` block. The
// largest relative error `D809` can produce is exactly **1/21 (4.76%)**, reached just under
// `1.05 x 10^k` where the render lattice widens tenfold but the value has not. That is under
// `MAX_QUANTISATION_SHARE` at every magnitude, so under a current tflw the condition cannot fire —
// which is this milestone's result, not a reason to delete the condition.
//
// **A contract with no `durations` block is not an error, it is an older tflw**, and the fallback is
// the pre-`D809` model rather than a guess: that build really did report whole milliseconds, so
// `0.5 / p95` is exactly right for it. The absence *is* the signal.
//
// ## The bound belongs to the run, not to the checkout (`M160d`, `D835`)
//
// The first version of this read the bound from the **installed** tflw and applied it to every
// artifact on the command line. That is the same category error it had just fixed, pointed the
// other way: a bound describes the build that *produced* a reading, and the artifacts on disk were
// produced by builds that are no longer installed. Measured before it shipped, which is the only
// reason it did not: re-deriving the three founding runs of 2026-08-26 — whose tflw p95 readings are
// literally `1/1/1 ms` — under a current contract **banded `echo-get-only` at 1.906-3.317** and
// emptied `notes`. Those suppressions were correct. A build that reported `1` for anything in
// `[0.5, 1.5)` has a 50% error whatever a later build publishes about itself.
//
// So `perf-conformance.mjs` copies the measuring tflw's `durations` block into the artifact it
// writes, and this script reads it **per artifact**, from `artifact.tflw.durations`. An artifact
// with no such field predates the arrangement and gets the pre-`D809` model — which is right for
// every artifact that exists today, because that is exactly what those builds did.
//
// The condition is about the quantum's **share of the value**, not a millisecond floor. The first
// draft used a flat 2 ms cutoff and it was the wrong shape: it admitted `dogfood-get-only`, whose
// tflw p95 is 3 ms, so a +/-0.5 ms rounding step is +/-17% of the reading — against a band whose
// half-width is 25%. One reading rounding from 3 to 4 would breach the band on arithmetic alone,
// which is `M141`'s flake-generator class, and a founding baseline that ships a known flake teaches
// people to read past the gate. So a rung is banded on p95 only when `0.5 / tflwP95` stays under
// `MAX_QUANTISATION_SHARE` in every contributing run, and the reason is written next to the null.
//
// `established: true` needs an `rpsRatio` on every comparable rung, not a `p95Ratio`, so refusing
// these does not block the flip.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { comparableRungs, MAX_BAND_SPREAD, BASELINE_FILE } from './verify-perf-baseline.mjs';
import { RUNGS } from './lib/perf-ladder.mjs';

/** The target whose state a `POST /v1/admin/load/reset` actually restores. A rung pointed anywhere
 *  else is untouched by that reset succeeding or failing. */
const RESET_RESTORES = 'apiV2';

/** A rung earns a p95 band only while tflw's reporting error is under this share of the reading. At
 *  10% the error is comfortably inside `K_FLOOR`'s 25% half-width, so a band breach means behaviour
 *  rather than arithmetic. This threshold is **this repository's policy** and stays a literal here;
 *  what moved to the contract is tflw's *behaviour*, which is the half this repo cannot know. */
export const MAX_QUANTISATION_SHARE = 0.10;

/** The pre-`D809` model, for a tflw predating the contract's `durations` block. Not a default and
 *  not a guess — an older tflw genuinely did round every duration to a whole millisecond, so half a
 *  step is that build's exact worst case. */
export const LEGACY_QUANTUM_MS = 0.5;

/**
 * tflw's worst-case relative error for a reported p95 — from tflw, not from a literal here.
 *
 * Returns `{ share, source }`. `share` is what `MAX_QUANTISATION_SHARE` is compared against;
 * `source` is what the suppression note cites, so a reader can tell "tflw says it rounds this hard"
 * from "this script assumed an older tflw".
 */
export function reportingError(tflwP95, durations) {
  const published = durations?.maxRelativeError;
  if (typeof published === 'number') {
    return { share: published, source: `tflw ${durations?.rule ?? 'D809'}, published bound` };
  }
  return { share: LEGACY_QUANTUM_MS / tflwP95, source: 'pre-D809 tflw, whole-millisecond reporting' };
}

/** Minimum runs before a band may be written at all. See the header. */
export const MIN_RUNS = 2;

/** Multiplicative half-width applied to the geometric centre. Floored so a band is never tighter
 *  than +/-25% (two runs cannot justify more precision than that), capped so the resulting spread
 *  stays under `MAX_BAND_SPREAD` — 1.7^2 = 2.89. */
export const K_FLOOR = 1.25;
export const K_CAP = 1.7;
/** How much wider than the observed run-to-run spread a band is drawn. */
export const K_MARGIN = 1.2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v) => Math.round(v * 1000) / 1000;

/** The ratio observations one artifact contributes, keyed by rung. Only rungs that actually
 *  measured something usable contribute: a dead target or a skipped reset makes every number in the
 *  run a measurement of the incident rather than of tflw. */
export function observationsFrom(artifact) {
  const out = {};
  const ladder = artifact.legs?.ladder;
  if (!ladder) return out;

  // A failed reset invalidates the rungs that measure **apiV2's database**, and only those. The
  // first version of this threw for the whole artifact, which was too blunt and cost real signal:
  // the 10-23-37 run's apiV2 died, but its `echo-*` rungs ran against the driver's own stateless
  // echo server with a healthy target throughout, and those two measurements are perfectly good.
  // Discarding them left the echo bands founded on two runs taken an hour apart on an idle box —
  // which under-sampled the variance badly enough that this very run sat 0.2% outside them. Judge
  // the data, not the label on the run it came from.
  const resetFailed = Boolean(ladder.reset && ladder.reset.ok === false);
  const targetOf = (name) => RUNGS.find((r) => r.name === name)?.target;

  for (const row of ladder.rungs ?? []) {
    if (row.target_ok && row.target_ok.ok === false) continue;
    if (resetFailed && targetOf(row.name) === RESET_RESTORES) continue;
    const tflw = row.runners?.tflw;
    if (!tflw || tflw.error) continue;
    const peer = row.runners?.k6 && !row.runners.k6.error ? row.runners.k6
               : row.runners?.artillery && !row.runners.artillery.error ? row.runners.artillery
               : null;
    if (!peer) continue;
    out[row.name] = {
      rpsRatio: tflw.rps / peer.rps,
      p95Ratio: tflw.p95 / peer.p95,
      tflwP95: tflw.p95,
      // `D835` — the bound travels with the observation, because it describes the build that
      // produced it. `undefined` here is a pre-`M160d` artifact, and `reportingError` has an exact
      // model for that build rather than a default.
      durations: artifact.tflw?.durations,
    };
  }
  return out;
}

/** Draw a band around observed ratios. Returns `null` with a reason when it declines to. */
export function bandFrom(values) {
  if (values.length < MIN_RUNS) return { band: null, why: `only ${values.length} usable run(s)` };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (!(lo > 0)) return { band: null, why: `a ratio was ${lo}, which is not a positive number` };
  const centre = Math.exp(values.reduce((a, v) => a + Math.log(v), 0) / values.length);
  const k = clamp(Math.sqrt(hi / lo) * K_MARGIN, K_FLOOR, K_CAP);
  const band = { min: round(centre / k), max: round(centre * k) };
  if (band.min <= 0 || band.max <= band.min) return { band: null, why: `degenerate band ${JSON.stringify(band)}` };
  if (band.max / band.min > MAX_BAND_SPREAD) {
    return { band: null, why: `spread ${(band.max / band.min).toFixed(2)}x exceeds the ${MAX_BAND_SPREAD}x limit` };
  }
  if (band.min > lo || band.max < hi) {
    return { band: null, why: `band [${band.min}, ${band.max}] does not contain every observation ` +
                              `[${round(lo)}, ${round(hi)}] — refusing to write a band the founding runs already violate` };
  }
  return { band, why: null, observed: values.map(round), spread: round(hi / lo) };
}

export function derive(artifacts) {
  const per = artifacts.map(observationsFrom);
  const rungs = {};
  const notes = {};
  for (const rung of comparableRungs()) {
    const seen = per.map((o) => o[rung.name]).filter(Boolean);
    const entry = { rpsRatio: null, p95Ratio: null };
    const rps = bandFrom(seen.map((s) => s.rpsRatio));
    entry.rpsRatio = rps.band;
    if (!rps.band) notes[`${rung.name}.rpsRatio`] = rps.why;

    // `D836` — coarse reporting disqualifies a run's **p95**, not its **rps**. Dropping the whole
    // observation for it was the wider rule and it cost real signal: the founding set's third run
    // is the only look at the `echo-*` rungs under a different box state, and it is what widened
    // their `rpsRatio` bands to x1.81 from the x1.56 floor. A count of completed iterations does not
    // become less true because the percentile beside it was rendered to a whole millisecond. This is
    // `observationsFrom`'s per-rung rule one step further in — judge the datum, not the run it
    // arrived in — and it is what lets a pre-`D809` artifact go on contributing after `D834`.
    const quantised = seen.filter((s) => reportingError(s.tflwP95, s.durations).share > MAX_QUANTISATION_SHARE);
    const usable = seen.filter((s) => !quantised.includes(s));
    const p95 = bandFrom(usable.map((s) => s.p95Ratio));
    entry.p95Ratio = p95.band;
    if (!p95.band) {
      // Two ways to have too few: never measured, or measured too coarsely to use. Say which — the
      // first is a gap in the runs and the second is a statement about the build that made them.
      const errs = quantised.map((s) => reportingError(s.tflwP95, s.durations));
      notes[`${rung.name}.p95Ratio`] = quantised.length
        ? `not banded: ${usable.length} of ${seen.length} run(s) usable — tflw reported a p95 of ` +
          `${quantised.map((s) => s.tflwP95).join('/')} ms in the rest, and its reporting error ` +
          `(${errs[0].source}) is ${(Math.max(...errs.map((e) => e.share)) * 100).toFixed(0)}% of the ` +
          `reading, over the ${(MAX_QUANTISATION_SHARE * 100).toFixed(0)}% share at which a band would fail ` +
          `on rounding rather than on behaviour (M154f-12, M160d).`
        : p95.why;
    } else if (quantised.length) {
      notes[`${rung.name}.p95Ratio.contributors`] =
        `banded on ${usable.length} of ${seen.length} run(s): the other ${quantised.length} reported a p95 ` +
        `of ${quantised.map((s) => s.tflwP95).join('/')} ms too coarsely to use (M160d, D836). Their ` +
        `rpsRatio still contributes — the throughput count is unaffected by how the percentile was rendered.`;
    }
    rungs[rung.name] = entry;
    entry._observed = { rps: rps.observed ?? null, runs: seen.length };
  }
  return { rungs, notes };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const write = process.argv.includes('--write');
  if (files.length < MIN_RUNS) {
    console.error(`usage: derive-perf-bands.mjs <artifact.json> <artifact.json> [...] [--write]\n` +
                  `at least ${MIN_RUNS} clean run artifacts are required — see the header.`);
    process.exit(2);
  }
  const artifacts = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const { rungs, notes } = derive(artifacts);

  const existing = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  const missing = Object.entries(rungs).filter(([, v]) => !v.rpsRatio).map(([k]) => k);
  const out = {
    ...existing,
    _method: `Bands drawn by scripts/derive-perf-bands.mjs from ${files.length} run artifacts: geometric ` +
             `centre, half-width max(observed spread ^ 0.5 * ${K_MARGIN}, ${K_FLOOR}) capped at ${K_CAP}. ` +
             `Contribution is per-rung AND per-metric, so an artifact can found one rung's band and not ` +
             `another's, and can found a rpsRatio without founding the p95Ratio beside it — _notes says ` +
             `where that happened. "Clean run" is deliberately not claimed here: the founding set has ` +
             `held a partial contributor since the day it was established. Re-derive rather than hand-editing.`,
    // Relative to the baseline, not a bare basename: the committed value has always carried the
    // `founding-runs/` prefix, and a name with no directory cannot be pasted back into the re-derive
    // command that `founding-runs/README.md` publishes. A provenance field that does not resolve is
    // the thing `M154f-09` is a row about.
    _sources: files.map((f) => path.relative(path.dirname(BASELINE_FILE), path.resolve(f))),
    established: missing.length === 0,
    rungs: Object.fromEntries(Object.entries(rungs).map(([k, v]) => {
      const { _observed, ...band } = v;
      return [k, band];
    })),
    _notes: notes,
  };
  console.log(JSON.stringify({ rungs, notes, wouldEstablish: missing.length === 0, missing }, null, 2));
  if (write) {
    writeFileSync(BASELINE_FILE, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nwrote ${BASELINE_FILE}`);
  } else {
    console.log('\n(dry run — pass --write to update perf/baseline.json)');
  }
}
