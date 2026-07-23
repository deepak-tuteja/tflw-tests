#!/usr/bin/env node
// Full regression sweep: runs the whole suite, then each feature-area tag alone, then `@smoke`
// alone, then each smoke+area cross-axis combo — everything M17-M20's manual verification passes
// already exercised by hand, scripted so it runs the same way every time (M21). M25 adds two more
// phases (mtls-rejection, safety-redaction-check) matching what CI needs per PLAN_CI.md decision 8.
//
// Every phase gets its own fresh Docker restart first. Necessary, not just cautious: `unique(...)`
// resets its counter each `tflw run` invocation, but Postgres data persists across invocations —
// chaining phases on the same DB reproduces the exact "unique(...)-email/data collision" false
// failures this project has already hit and documented twice (PROGRESS.md M20, M21). A phase's
// result is only trustworthy in isolation.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPORT_DIR = path.join(ROOT, 'report');
// PLAN_CI.md decision 9 wants every phase's report.html/junit.xml/results.json uploaded, not just
// a green run's — but every phase writes to the same `report/`, and the next phase's restart
// doesn't touch it (only tflw's next `run` overwrites it in place). Archive each phase's output
// into its own subdirectory immediately after that phase finishes, before the next phase's `tflw
// run` can clobber it.
const ARCHIVE_DIR = path.join(ROOT, 'report-by-phase');

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function archivePhaseReport(phaseName) {
  if (!existsSync(REPORT_DIR)) return;
  const dest = path.join(ARCHIVE_DIR, slug(phaseName));
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  renameSync(REPORT_DIR, dest);
}

const AREA_TAGS = ['identityOps', 'catalogOps', 'orderOps', 'adminOps'];

// `--verbose` only under real GitHub Actions (auto-detected via GITHUB_ACTIONS, same signal tflw
// itself uses for decision 111.8's ::group::/::endgroup:: log grouping) — a local `npm run
// regression` stays exactly as compact as it's always been; a CI run gets grouped per-step detail
// automatically, no other YAML wiring needed. Deliberately no `--bail` here even in CI: decision 9
// (PLAN_CI.md) wants every phase's *complete* artifact uploaded, pass or fail — bailing at the
// first failing test would leave a truncated report for exactly the run you'd most want full
// evidence from.
const CI_VERBOSE = process.env.GITHUB_ACTIONS === 'true' ? ['--verbose'] : [];

// Most phases share the plain `tflw run --no-color [args]` shape; a phase may instead supply its
// own `cmd` (mtls-rejection needs a non-default `--env` + explicit file path; safety-redaction-check
// isn't a `tflw run` invocation at all, it's the report-artifact proof script from M25).
const PHASES = [
  { name: 'full suite', args: [] },
  ...AREA_TAGS.map((tag) => ({ name: `--tag ${tag}`, args: ['--tag', tag] })),
  { name: '--tag smoke', args: ['--tag', 'smoke'] },
  ...AREA_TAGS.map((tag) => ({ name: `--tag smoke,${tag}`, args: ['--tag', `smoke,${tag}`] })),
  {
    name: 'mtls-rejection',
    cmd: ['npx', 'tflw', 'run', '--no-color', ...CI_VERBOSE, '--env', 'mtlsSidecarNoCert', 'tests/.env-specific/mtls-rejection.tflw'].join(' '),
  },
  { name: 'safety-redaction-check', cmd: 'node scripts/verify-redaction.mjs' },
  // M29 (plan_v2.md Part R, coverage audit): the tests/.demo-fail/ set and 6 previously-unproven
  // CLI flags had no repeatable, regression-catching proof before this — only ad-hoc manual runs
  // during past milestones. Same "script it, don't trust a one-time manual check forever" reasoning
  // as safety-redaction-check above.
  { name: 'demo-fail-check', cmd: 'node scripts/verify-demofail.mjs' },
  { name: 'cli-flags-check', cmd: 'node scripts/verify-cli-flags.mjs' },
];

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function restart() {
  run('node cli.mjs stop');
  run('node cli.mjs start');
}

rmSync(ARCHIVE_DIR, { recursive: true, force: true });

const results = [];
for (const phase of PHASES) {
  console.log(`\n=== ${phase.name} (fresh restart) ===\n`);
  restart();
  const cmd = phase.cmd ?? ['npx', 'tflw', 'run', '--no-color', ...CI_VERBOSE, ...phase.args].join(' ');
  try {
    run(cmd);
    results.push({ ...phase, ok: true });
  } catch {
    results.push({ ...phase, ok: false });
  } finally {
    archivePhaseReport(phase.name);
  }
}

console.log('\n=== regression summary ===');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.log(`\n${failed.length}/${results.length} phase(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} phases passed.`);
