#!/usr/bin/env node
// M29 (plan_v2.md Part R decision 7): proves the whole `tests/.demo-fail/*.tflw` set still fails
// for the reason each fixture exists to demonstrate — not just that `npx tflw run` on them exits
// non-zero once, by hand, during whatever milestone first wrote them. Nothing today would notice
// if a future tflw regression silently made one of these start *passing* (i.e. the behavior it's
// supposed to prove-broken-without stopped failing) — that's exactly the gap this closes.
//
// `allow-hosts-blocked.tflw` is a genuine outlier among the `.demo-fail` set: its assertion
// (`expect status equals 200` against `GET /health`) only fails under `env allowHostsBlocked`
// (whose allowlist excludes localhost) — under the suite's default `env local` it's a perfectly
// ordinary passing request. Confirmed empirically while building this script: running the whole
// `tests/.demo-fail/*.tflw --tag demofail` glob together under the default env reports
// `1/8 passed, 7 failed`, not `0/8` — exactly the silent-pass-instead-of-fail risk this script
// exists to catch, not a hypothetical. So this runs two sub-checks, each against its own correct
// env, rather than one blanket glob invocation.
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEMO_FAIL_DIR = path.join(ROOT, 'tests', '.demo-fail');

// Not anchored to line start: the real summary line is prefixed with an `HH:MM:SS.mmm` timestamp
// on the same line (`21:42:30.477 FAIL 0/7 passed, 7 failed · ...`), not `PASS`/`FAIL` at column 0.
const SUMMARY_RE = /(?:PASS|FAIL) (\d+)\/(\d+) passed(?:, (\d+) failed)?/;

/** Runs a tflw command, tolerating its expected non-zero exit, and parses the summary line. */
function runExpectingFailures(cmd) {
  let output;
  try {
    output = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
  } catch (err) {
    // `tflw run` exits non-zero on any failing test — that's the expected shape here, not an
    // error in this script. stdout is still on the error object.
    output = err.stdout ?? '';
  }
  const m = SUMMARY_RE.exec(output);
  if (!m) {
    console.error(`could not parse a summary line from:\n${output}`);
    process.exit(1);
  }
  return { passed: Number(m[1]), total: Number(m[2]), failed: Number(m[3] ?? '0') };
}

function check(name, actual, expected) {
  const ok = actual.passed === expected.passed && actual.total === expected.total;
  console.log(
    `${ok ? '✓' : '✗'} ${name}: ${actual.passed}/${actual.total} passed (expected ${expected.passed}/${expected.total})`,
  );
  return ok;
}

let allOk = true;

const allowHostsFile = 'allow-hosts-blocked.tflw';
const otherFiles = readdirSync(DEMO_FAIL_DIR)
  .filter((f) => f.endsWith('.tflw') && f !== allowHostsFile)
  .sort();

const otherPaths = otherFiles.map((f) => path.join('tests', '.demo-fail', f)).join(' ');
const otherResult = runExpectingFailures(`npx tflw run ${otherPaths} --no-color --tag demofail`);
allOk = check(`${otherFiles.length} demo-fail fixtures (env local)`, otherResult, {
  passed: 0,
  total: otherFiles.length,
}) && allOk;

const allowHostsResult = runExpectingFailures(
  `npx tflw run tests/.demo-fail/${allowHostsFile} --no-color --env allowHostsBlocked --tag demofail`,
);
allOk = check('allow-hosts-blocked.tflw (env allowHostsBlocked)', allowHostsResult, { passed: 0, total: 1 }) && allOk;

if (!allOk) {
  console.error('\nAt least one demo-fail fixture stopped failing for its intended reason.');
  process.exit(1);
}

console.log('\nAll demo-fail fixtures still fail for their intended reason.');
