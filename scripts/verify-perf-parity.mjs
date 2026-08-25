#!/usr/bin/env node
// **The perf ladder's gate — the one `check-acceptance.mjs` structurally cannot be.**
//
// `M154e`, closing `B6-15`. The reasoning lives in `scripts/lib/perf-ladder.mjs`; the short version
// is that the acceptance check discovers corpora by walking for a `tflw.config`, so `perf/k6/` and
// `perf/artillery/` are not overlooked but *ineligible* — they are JavaScript and YAML and will
// never hold one. `verify-external-targets.mjs` walks the same roots and inherits the same blind
// spot, which is why the host check below is here and not there.
//
// Four properties, in the order a reader should care about them:
//
//   1. **Hosts.** Every URL in a runner file addresses something of ours. This is the safety half:
//      until now a k6 script could name any host on the internet and no gate anywhere would notice,
//      and `verify-external-targets.mjs`'s whole thesis is that a property nothing asserts is a
//      coincidence rather than a property.
//   2. **Fixtures.** Every implementation of a rung carries the same fixture values, and those
//      values equal the constants in `apiV2/src/load-admin/load-target.constants.ts`. This is the
//      half `B6-15` names. It has drifted twice — 98% k6 failure at `M48`, and a 100% error rate
//      reported as PASS on 2026-08-05 — both times with a comment in the file saying not to.
//   3. **Roster.** Every file under the runner directories is a rung this manifest names, or is
//      recorded as not one. A new rung that joins the ladder without a row goes red here.
//   4. **Ragged edges are recorded.** A rung missing a runner must say why. Artillery has no
//      `search-read`; that is a decision, and the gate makes it a written one.
//
// Exits non-zero on any failure. No `--gate` flag: unlike the acceptance graders this is static,
// costs milliseconds, and has no expensive mode to opt into.

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_SOURCE, FIXTURES, DRIFT_SCANNERS, LOCAL_HOSTS, RUNGS, NON_RUNG_FILES } from './lib/perf-ladder.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const acceptanceRoot = join(repoRoot, 'tflw-acceptance');

/** Directories whose every file must be rostered. `perf/profile/` is deliberately absent: it is a
 *  profiling harness with a dozen one-off benchmark scripts, not the ladder, and two of its files
 *  are on the ladder only because the echo rungs' tflw side lives there. */
const ROSTERED_DIRS = ['perf/tflw', 'perf/k6', 'perf/artillery'];

const problems = [];
const fail = (msg) => problems.push(msg);

const read = async (rel) => readFile(join(acceptanceRoot, rel), 'utf8');

// ---------------------------------------------------------------------------------------------
// The fixture values, read from the one file that defines them.
// ---------------------------------------------------------------------------------------------
const constantsSrc = await readFile(join(repoRoot, FIXTURE_SOURCE), 'utf8');
/** @type {Record<string, string>} */
const expected = {};
for (const [key, spec] of Object.entries(FIXTURES)) {
  const m = spec.pattern.exec(constantsSrc);
  if (!m) {
    // Loud rather than empty. An expectation that quietly became `undefined` would make every
    // fixture check below pass vacuously, which is `M141`'s entire finding class.
    fail(`${FIXTURE_SOURCE}: could not read \`${spec.constant}\` — the pattern in perf-ladder.mjs matched nothing. The constant was renamed or its shape changed; fix the pattern, do not delete the row.`);
    continue;
  }
  expected[key] = m[1];
}

// ---------------------------------------------------------------------------------------------
// 1 + 2 + 4 — per rung: files exist, hosts are ours, fixtures match, absences are recorded.
// ---------------------------------------------------------------------------------------------
const RUNNERS = ['tflw', 'k6', 'artillery'];
/** Every file the manifest claims, so the roster check below can subtract it. */
const claimed = new Set(NON_RUNG_FILES);

/** Every `http(s)://host…` in a file, checked against `LOCAL_HOSTS`. */
function checkHosts(rel, src) {
  for (const m of src.matchAll(/https?:\/\/([^/'"`\s{},)\]]+)/g)) {
    const host = m[1].replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    if (!LOCAL_HOSTS.has(host)) {
      fail(`${rel}: addresses \`${host}\`, which is not one of ours. Load-testing a host we do not own is refused here for the same reason verify-external-targets.mjs refuses it for tflw corpora.`);
    }
  }
}

/** Every ladder file's source, read once and reused by the host scan, the drift scan and the
 *  `carriedBy` check. Keyed by the path relative to `tflw-acceptance/`. */
const sources = new Map();

for (const rung of RUNGS) {
  const present = RUNNERS.filter((r) => rung.impls[r]);
  if (present.length === 0) fail(`rung \`${rung.name}\`: no implementations at all.`);
  if (present.length < RUNNERS.length && !rung.why) {
    const missing = RUNNERS.filter((r) => !rung.impls[r]);
    fail(`rung \`${rung.name}\`: no ${missing.join('/')} implementation and no \`why\`. A ragged ladder is allowed; an unexplained one is not.`);
  }
  for (const [runner, rel] of Object.entries(rung.impls)) {
    claimed.add(rel);
    try {
      sources.set(rel, await read(rel));
    } catch {
      fail(`rung \`${rung.name}\` (${runner}): \`tflw-acceptance/${rel}\` does not exist. The file moved or was deleted without the manifest moving with it.`);
    }
  }
}

// The non-rung files are ladder machinery — `processor.cjs` holds every Artillery rung's
// credentials — so they are read into the same map and scanned identically.
for (const rel of NON_RUNG_FILES) {
  try {
    sources.set(rel, await read(rel));
  } catch {
    fail(`\`tflw-acceptance/${rel}\` is in NON_RUNG_FILES but does not exist.`);
  }
}

// 1 — hosts.
for (const [rel, src] of sources) checkHosts(`tflw-acceptance/${rel}`, src);

// 2a — `carriedBy`: the named copies are still there. Catches a deletion or a rename.
for (const [key, spec] of Object.entries(FIXTURES)) {
  const want = expected[key];
  if (want === undefined) continue; // already reported above
  for (const rel of spec.carriedBy ?? []) {
    const src = sources.get(rel);
    if (src === undefined) {
      fail(`${spec.constant} is declared as carried by \`tflw-acceptance/${rel}\`, but that file is on no rung and in no NON_RUNG_FILES row, so this gate never reads it.`);
      continue;
    }
    if (!src.includes(want)) {
      fail(`\`tflw-acceptance/${rel}\` no longer contains ${spec.constant} (\`${want}\`) — ${spec.what}.`);
    }
  }
}

// 2b — the drift scan, which is the check with teeth. Every literal of a fixture's shape, in every
// ladder file, must be the value the constant defines. No list of files is involved, so a rung
// nobody rostered cannot hide a stale copy.
for (const [rel, src] of sources) {
  for (const scanner of DRIFT_SCANNERS) {
    const want = expected[scanner.fixture];
    if (want === undefined) continue;
    for (const m of src.matchAll(scanner.pattern)) {
      const literal = scanner.whole ? m[0] : m[1];
      if (literal !== want) {
        fail(`\`tflw-acceptance/${rel}\` contains ${scanner.what} \`${literal}\`, but ${FIXTURES[scanner.fixture].constant} is \`${want}\` — ${FIXTURES[scanner.fixture].what}. This is exactly the drift that produced a 98% k6 failure rate at M48 and, on 2026-08-05, a 100% error rate reported as PASS.`);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 3 — the roster: nothing under the runner directories is unaccounted for.
// ---------------------------------------------------------------------------------------------
for (const dir of ROSTERED_DIRS) {
  let entries;
  try {
    entries = await readdir(join(acceptanceRoot, dir), { withFileTypes: true });
  } catch {
    fail(`\`tflw-acceptance/${dir}\` does not exist — the ladder moved without this gate moving with it.`);
    continue;
  }
  for (const e of entries) {
    // Directories are skipped: `perf/tflw/report/` is run output. Dotfiles are skipped: `.env`
    // holds the load credentials locally and is not tracked.
    if (!e.isFile() || e.name.startsWith('.')) continue;
    const rel = `${dir}/${e.name}`;
    if (!claimed.has(rel)) {
      fail(`\`tflw-acceptance/${rel}\` is on the ladder's floor but in no row of perf-ladder.mjs. Add it to a rung's \`impls\`, or to NON_RUNG_FILES with a reason.`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
if (problems.length > 0) {
  console.error('✗ perf ladder parity\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\n${problems.length} problem(s). See scripts/lib/perf-ladder.mjs for what this gate is and why it is not part of check-acceptance.mjs.`);
  process.exit(1);
}

const impls = RUNGS.reduce((n, r) => n + Object.keys(r.impls).length, 0);
console.log(`✓ perf ladder parity: ${RUNGS.length} rung(s), ${impls} implementation(s), ${Object.keys(FIXTURES).length} fixture value(s) single-sourced from ${FIXTURE_SOURCE}, every host ours.`);
