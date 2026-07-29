#!/usr/bin/env node
// M51 (PLAN_LOG_CONSUME.md): `--log-output`/`--log-level` had zero proof anywhere in this suite —
// checked directly, unlike the stale "already covered" claim M47 found and fixed for
// `--forbid-insecure`/`--evidence`, this one was a genuine, never-closed gap. Same "script it,
// don't trust a one-time manual check forever" reasoning as verify-safety-flags.mjs, split into
// its own file since `log` is its own distinct DSL feature, mirroring verify-safety-flags.mjs's
// own separate-script precedent.
//
// Drives tests/logging.tflw (three log lines: a bare `debug`, a bare `warn`, and an explicit
// `error ... to html`) under several `--log-output`/`--log-level` combinations and the dedicated
// `logConfig` env (tflw.config: `log destination "console"` / `log level "warn"`), reading
// report/results.json (recording, always complete regardless of flags) and console stdout
// (rendering, filtered) as ground truth — never inferred from the spec text alone.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RESULTS_PATH = path.join(ROOT, 'report', 'results.json');
const HTML_PATH = path.join(ROOT, 'report', 'report.html');

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

function logSteps() {
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  const steps = [];
  for (const test of results.tests) {
    for (const step of test.steps) {
      if (step.kind === 'log') steps.push(step);
    }
  }
  return steps;
}

// --- baseline: env logConfig (destination "console", level "warn"), no CLI overrides -----------
{
  const { stdout } = run('npx tflw run --env logConfig tests/logging.tflw --no-color');
  const steps = logSteps();
  ok('results.json records all 3 log steps regardless of destination/level', steps.length === 3, `got ${steps.length}`);
  ok(
    'results.json: level/destination are always present on every log step',
    steps.every((s) => typeof s.level === 'string' && typeof s.destination === 'string'),
  );
  ok('console: the debug line (below the configured warn threshold) does not print', !/\[DEBUG\]/.test(stdout));
  ok('console: the warn line (clears the threshold) prints', /\[WARN\].*stock check/.test(stdout));
  ok(
    'console: the explicit `to html` error line never prints to console, even though its level clears threshold',
    !/\[ERROR\]/.test(stdout),
  );

  const html = readFileSync(HTML_PATH, 'utf8');
  const badges = [...html.matchAll(/log-badge log-([a-z]+)/g)].map((m) => m[1]);
  ok('report.html: only the explicit `to html` line renders (bare console-destined lines excluded)', badges.length === 1 && badges[0] === 'error', `badges: [${badges.join(', ')}]`);
}

// --- --log-level debug: lowers the render threshold for every log step, config's own included --
{
  const { stdout } = run('npx tflw run --env logConfig tests/logging.tflw --no-color --log-level debug');
  ok('--log-level debug: the debug line now prints (threshold lowered below config)', /\[DEBUG\].*raw payload/.test(stdout));
  ok('--log-level debug: the warn line still prints', /\[WARN\].*stock check/.test(stdout));
  ok('--log-level debug: the explicit `to html` line still never reaches console', !/\[ERROR\]/.test(stdout));
}

// --- --log-output html: bare lines' destination flips to html-only; explicit `to html` unaffected
{
  const { stdout } = run('npx tflw run --env logConfig tests/logging.tflw --no-color --log-output html');
  ok(
    '--log-output html: nothing prints to console — bare lines redirected, explicit `to html` line was already html-only',
    !/\[DEBUG\]|\[WARN\]|\[ERROR\]/.test(stdout),
    stdout.trim().split('\n').filter((l) => l.includes('[')).join(' | '),
  );
  const steps = logSteps();
  ok('results.json still records all 3 steps even under --log-output html', steps.length === 3);
}

// --- --log-output console against env local (both/debug default): proves an explicit `to …` -----
// clause always wins over a CLI override too, not just over config (SPEC.md §3.8/§12).
{
  const { stdout } = run('npx tflw run --env local tests/logging.tflw --no-color --log-output console');
  ok('env local + --log-output console: the bare debug line prints (local default level is debug)', /\[DEBUG\].*raw payload/.test(stdout));
  ok('env local + --log-output console: the bare warn line prints', /\[WARN\].*stock check/.test(stdout));
  ok(
    'env local + --log-output console: the explicit `to html` error line STILL never reaches console — `--log-output` never overrides an explicit `to …` clause',
    !/\[ERROR\]/.test(stdout),
  );
}

if (violations > 0) {
  console.error(`\n${violations} logging proof violation(s).`);
  process.exit(1);
}

console.log('\n`log` destination/level config resolution, --log-output/--log-level overrides, and "explicit `to` always wins" all behave as documented.');
