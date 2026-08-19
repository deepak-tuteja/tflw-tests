#!/usr/bin/env node
// M47 (PLAN_WEBV2_M45.md): `--forbid-insecure`/`--evidence` had *stale* coverage claims —
// verify-cli-flags.mjs's own comment asserted both were "already covered" via CI/
// verify-redaction.mjs/safety-redaction.tflw, but neither is actually true: `--forbid-insecure` is
// never invoked anywhere as a real command, and `tests/api/identity/safety-redaction.tflw`'s own comment points
// at `--evidence headers-only`/`--evidence none` as a *manual* verification step (PROGRESS.md's
// M23 entry), never re-run since. Same "script it, don't trust a one-time manual check forever"
// reasoning as verify-cli-flags.mjs/verify-redaction.mjs, split into its own file since both flags
// are specifically safety/policy knobs, mirroring verify-redaction.mjs's own separate-script
// precedent for safety-specific proofs.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tflwCommand } from './lib/tflw-bin.mjs';

/** `released`: this script grades the tflw a user would have installed, which is what
 *  `npx tflw` resolved here before M141 — the program is unchanged, the question is now
 *  declared and the entry is printed instead of inferred. */
const TFLW = tflwCommand('released', { label: 'verify-safety-flags' });

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RESULTS_PATH = path.join(ROOT, 'report', 'results.json');

let violations = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

function run(cmd) {
  try {
    return { stdout: execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] }), status: 0 };
  } catch (err) {
    return { stdout: (err.stdout ?? '') + (err.stderr ?? ''), status: err.status ?? 1 };
  }
}

function allApiSteps(results) {
  const steps = [];
  for (const test of results.tests) {
    for (const step of test.steps) {
      if (step.kind === 'api') steps.push(step);
    }
  }
  return steps;
}

// --- --forbid-insecure: a real CI-policy gate, not just a flag that parses -----------------------
{
  // `insecure true` is genuinely active under mtlsSidecarNoCert (tflw.config) — the exact case
  // --forbid-insecure exists to catch before any test runs, not partway through one.
  const { stdout, status } = run(`${TFLW} run --env mtlsSidecarNoCert --forbid-insecure --no-color tests/api/identity/mtls.tflw`);
  ok(
    '--forbid-insecure refuses to run when the active env has `insecure true`',
    status !== 0 && /forbid-insecure was set and env .* has `insecure true` active — refusing to run/.test(stdout),
    stdout.trim().split('\n').slice(-3).join(' | '),
  );
  ok('--forbid-insecure exits before any test actually runs (no PASS/FAIL summary line)', !/PASS|FAIL \d+\/\d+/.test(stdout));
}
{
  // The positive path: --forbid-insecure must NOT block a genuinely secure env — proves it's
  // conditional on `insecure true`, not a blanket refusal that happens to always fire.
  const { stdout, status } = run(`${TFLW} run --env local --forbid-insecure --no-color --tag smoke`);
  ok('--forbid-insecure does not block a secure env (`local`, no `insecure true`)', status === 0 && /PASS \d+\/\d+ passed/.test(stdout), stdout.trim().split('\n').pop());
}

// --- --evidence headers-only/none: real content trimmed from the emitted report, ground-truth ---
// checked against results.json rather than just "the flag parsed and nothing crashed".
{
  run(`${TFLW} run --env safetyRedaction --evidence headers-only --no-color tests/api/identity/safety-redaction.tflw`);
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  const steps = allApiSteps(results);
  ok('--evidence headers-only: at least one api step captured', steps.length > 0);
  ok(
    '--evidence headers-only: response body is omitted, not the real body',
    steps.every((s) => s.response?.bodyText === '[omitted by evidence level]'),
  );
  ok(
    '--evidence headers-only: headers are still present (not also stripped)',
    steps.every((s) => Object.keys(s.response?.headers ?? {}).length > 0),
  );
}
{
  run(`${TFLW} run --env safetyRedaction --evidence none --no-color tests/api/identity/safety-redaction.tflw`);
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  const steps = allApiSteps(results);
  ok('--evidence none: at least one api step captured', steps.length > 0);
  ok(
    '--evidence none: response body is omitted',
    steps.every((s) => s.response?.bodyText === '[omitted by evidence level]'),
  );
  ok(
    '--evidence none: headers are also stripped (unlike headers-only)',
    steps.every((s) => Object.keys(s.response?.headers ?? {}).length === 0),
  );
}
{
  // The control case: with no --evidence flag (tflw.config's own `evidence` default, "full"), the
  // real body must actually be present — otherwise the two checks above would trivially pass
  // against a tool that always omits everything, proving nothing about the flag's own effect.
  run(`${TFLW} run --env safetyRedaction --no-color tests/api/identity/safety-redaction.tflw`);
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  const steps = allApiSteps(results);
  ok(
    '--evidence full (default): the real response body is present, not omitted',
    steps.some((s) => typeof s.response?.bodyText === 'string' && s.response.bodyText.includes('email')),
  );
}

if (violations > 0) {
  console.error(`\n${violations} safety-flag proof violation(s).`);
  process.exit(1);
}

console.log('\n--forbid-insecure and --evidence behave as documented.');
