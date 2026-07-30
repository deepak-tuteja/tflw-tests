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

// M35 fixed this by excluding demo-fail-check's junit.xml from the `dorny/test-reporter` glob via
// a comma-separated `!`-negation in the workflow's `path` input — confirmed wrong on the very next
// real CI run (30132116208): dorny's `LocalFileProvider` splits `path` on `,` and calls fast-glob
// *separately per segment* (see its src/input-providers/local-file-provider.ts), so the negation
// segment just globs on its own (matching nothing, since a lone negative pattern has no positive
// pattern to subtract from) and never touches the other segment's results — the exclusion was a
// complete no-op. Fixed for real here instead: rename demo-fail-check's own junit.xml so it can
// no longer match `report-by-phase/*/junit.xml` at all, structurally, rather than depending on
// glob-exclusion semantics the action doesn't actually implement. The file is still archived and
// still uploaded whole via the report-by-phase/ artifact step — just under a name a human (or the
// verify-demofail.mjs script whose own count-based check() logic is this phase's real verdict) can
// still open, but the JUnit-consuming action can't accidentally pick up.
const JUNIT_EXCLUDED_PHASES = new Set(['demo-fail-check']);

function archivePhaseReport(phaseName) {
  if (!existsSync(REPORT_DIR)) return;
  const dest = path.join(ARCHIVE_DIR, slug(phaseName));
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  renameSync(REPORT_DIR, dest);
  if (JUNIT_EXCLUDED_PHASES.has(slug(phaseName))) {
    const junitPath = path.join(dest, 'junit.xml');
    if (existsSync(junitPath)) {
      renameSync(junitPath, path.join(dest, 'junit-by-design.xml'));
    }
  }
}

// E3 (PLAN_ENTERPRISE_REGRESSION.md) adds `orgOps` as a 5th area tag — its own `--tag orgOps` and
// `smoke,orgOps` phases below fall out of the existing per-area-tag map, no separate wiring
// needed.
const AREA_TAGS = ['identityOps', 'catalogOps', 'orderOps', 'adminOps', 'orgOps'];

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
  // M42 (PLAN_WEBV2_M40.md decision 3): CLI-verb dogfooding for `migrate`/`watch` — same "script it,
  // don't trust a one-time manual check forever" reasoning, now covering the two remaining
  // scriptable CLI verbs (`refactor apply` is deliberately one-off/mutating/human-reviewed, not
  // scripted here; `pick` is deliberately manual, see PROGRESS.md's M42 section).
  { name: 'migrate-check', cmd: 'node scripts/verify-migrate.mjs' },
  { name: 'watch-check', cmd: 'node scripts/verify-watch.mjs' },
  // M47 (PLAN_WEBV2_M45.md): --forbid-insecure/--evidence had stale "already covered" claims in
  // verify-cli-flags.mjs's own comment — neither was actually invoked/proven anywhere. Same
  // reasoning as migrate-check/watch-check above, own phase since both are safety/policy knobs.
  { name: 'safety-flags-check', cmd: 'node scripts/verify-safety-flags.mjs' },
  // M49 (PLAN_WEBV2_M45.md): tests/.checkonly/ only covered 3 of 22 assigned TF0xx codes, manually
  // run per its own header comments, never wired into any automated check. Same "script it, don't
  // trust a one-time manual check forever" reasoning as every other *-check phase above.
  { name: 'check-diagnostics', cmd: 'node scripts/verify-check-diagnostics.mjs' },
  // M50 (PLAN_WEBV2_M45.md): `tflw pick` had only one manual, non-scripted verification pass
  // (PROGRESS.md's M42 checklist) — a real click still isn't automatable (no CDP endpoint exposed,
  // deliberately manual by design), but launching + a clean Ctrl+C exit now is, same "script it"
  // reasoning as watch-check/migrate-check above.
  { name: 'pick-check', cmd: 'node scripts/verify-pick.mjs' },
  // M51 (PLAN_LOG_CONSUME.md): --log-output/--log-level had zero proof anywhere in this suite —
  // a genuine, never-closed gap, not a stale claim. Same "script it, don't trust a one-time manual
  // check forever" reasoning as every other *-check phase above.
  { name: 'logging-check', cmd: 'node scripts/verify-logging.mjs' },
  // PLAN_REPORT_OVERFLOW.md: a real report.html was scrolling the whole page sideways on a long
  // unbroken token (a JWT) — fixed upstream in tflw, re-proven here against the real vendored
  // build's actual output, not just tflw's own unit test.
  { name: 'report-overflow-check', cmd: 'node scripts/verify-report-no-overflow.mjs' },
  // E2 (PLAN_ENTERPRISE_REGRESSION.md): `tests/.env-specific/ui-admin/`'s new UI-only admin
  // console tests need their own `--env webv2Admin` phase for the same reason the file it lives
  // alongside (`webv2-admin.tflw`) needs `env webv2Admin` at all — the default `env local`'s `web`
  // base points at the storefront's :8090, not this console's :8091.
  {
    name: 'ui-admin-check',
    cmd: ['npx', 'tflw', 'run', '--no-color', ...CI_VERBOSE, '--env', 'webv2Admin', 'tests/.env-specific/ui-admin/*.tflw'].join(' '),
  },
  // Pre-E3 housekeeping (found during E2, deliberately deferred there): `webv2-admin.tflw` itself
  // — the pre-existing *mixed* admin test living alongside `ui-admin/` — had never been wired into
  // this sweep at all, unlike every other `.env-specific/` file. Same `--env webv2Admin` reason as
  // `ui-admin-check` above. E3 (PLAN_ENTERPRISE_REGRESSION.md) adds `orgs-mixed.tflw` to this same
  // phase — an explicit file list, not a `.env-specific/*.tflw` glob, since that directory also
  // holds `mtls-rejection.tflw`/`unreachable-host.tflw`, which need their own different envs.
  {
    name: 'webv2-admin-check',
    cmd: ['npx', 'tflw', 'run', '--no-color', ...CI_VERBOSE, '--env', 'webv2Admin', 'tests/.env-specific/webv2-admin.tflw', 'tests/.env-specific/orgs-mixed.tflw'].join(' '),
  },
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
