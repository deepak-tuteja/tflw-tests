// Shared between scripts/regression.mjs (full 30-phase sweep) and scripts/regression-smoke.mjs
// (fast local subset, PLAN_CI.md decision 15) — phase-report archiving and the Docker
// restart/run helpers, so both scripts write report-by-phase/ the same way and a failing smoke
// run's evidence is inspectable exactly like a full sweep's.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const REPORT_DIR = path.join(ROOT, 'report');
export const ARCHIVE_DIR = path.join(ROOT, 'report-by-phase');

export function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// demo-fail-check's junit.xml documents intentionally-failing fixtures — renamed so a
// JUnit-consuming reporter (dorny/test-reporter in CI) can't mistake it for a real regression.
// The full history is M35's demo-fail-check junit-renaming episode; there is no longer a second
// copy of it in regression.mjs, and this comment used to say there was (`M143d`).
//
// watch-check joined this class in `M141b` and nobody noticed, because the leg that runs it stalled
// in `Install Playwright browsers` on both of that PR's runs (`M143-04`) and the phase never
// completed in CI. `M141`/`D536` gave verify-watch.mjs a negative control: it unsets DISPLAY and
// requires the watched run to FAIL, which is the only way to prove from outside that `tflw watch`
// forces a headed browser. That failing run is the LAST thing the phase writes, so `report/`'s
// junit.xml ends up holding one deliberately-failed testcase — an implementation detail of a proof,
// not a suite result. `✓ watch-check` and a red `merge-reports` in the same run is the signature.
//
// construct-acceptance joined at `M154g` step 2, and this one had been latent since `M154b`. The
// phase has ALWAYS run meant-to-fail corpora — `C1`'s soft-check plant records two failed rows on
// purpose, `C4`'s second test must exhaust its retry budget — and which of them survives into
// `report/` is decided by nothing more principled than **which plant block happens to run last**.
// That ordering was benign until step 2 ended the phase with a mutation control: a copy of
// `matcher-discrimination.tflw` with every `not` dropped, run to prove all twelve negatives really
// go red. Seven deliberately-failed testcases, written last, archived, and reported by
// `merge-reports` three jobs away from anything naming them.
//
// So the exclusion is not a workaround for step 2's control — it is the correct classification of a
// phase whose plants include by-design failures by construction. Its verdict has never come from
// `junit.xml`: `verify-construct-acceptance.mjs --gate` asserts every plant's known answer and
// exits non-zero, which is the thing regression.mjs reads.
const JUNIT_EXCLUDED_PHASES = new Set(['demo-fail-check', 'watch-check', 'construct-acceptance']);

/**
 * Phases that reported success while leaving a failing `junit.xml` in the archive — see the caller
 * in `regression.mjs` for why this is checked at all.
 *
 * Reads the XML with a regex rather than a parser: the only thing wanted is JUnit's own
 * `failures="N"`/`errors="N"` attributes on `<testsuites>`/`<testsuite>`, which tflw's
 * `writeJunitXml` emits unconditionally. A phase in JUNIT_EXCLUDED_PHASES has had its file renamed
 * to `junit-by-design.xml` by the time this runs, so it is invisible here by construction — the
 * exclusion set is the single place that decides, and this function does not consult it twice.
 */
export function passedPhasesWithFailingJunit(results) {
  const out = [];
  for (const r of results) {
    if (!r.ok) continue;
    const junitPath = path.join(ARCHIVE_DIR, slug(r.name), 'junit.xml');
    if (!existsSync(junitPath)) continue;
    const xml = readFileSync(junitPath, 'utf8');
    // The root `<testsuites>` totals every suite; fall back to summing suites if it is absent.
    const root = /<testsuites\b[^>]*\bfailures="(\d+)"[^>]*>/.exec(xml);
    const rootErrors = /<testsuites\b[^>]*\berrors="(\d+)"[^>]*>/.exec(xml);
    let failures = root ? Number(root[1]) + Number(rootErrors?.[1] ?? 0) : 0;
    if (!root) {
      for (const m of xml.matchAll(/<testsuite\b[^>]*\bfailures="(\d+)"/g)) failures += Number(m[1]);
      for (const m of xml.matchAll(/<testsuite\b[^>]*\berrors="(\d+)"/g)) failures += Number(m[1]);
    }
    if (failures > 0) out.push({ name: r.name, failures, path: junitPath });
  }
  return out;
}

export function archivePhaseReport(phaseName) {
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

// `--verbose` only under real GitHub Actions (auto-detected via GITHUB_ACTIONS, same signal tflw
// itself uses for ::group::/::endgroup:: log grouping).
export const CI_VERBOSE = process.env.GITHUB_ACTIONS === 'true' ? ['--verbose'] : [];

export function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

// `stackEnv` (M128a): a phase may need the stack brought up differently from every other phase.
// The first case is `VULN_MODE=1`, which adds the pentest arc's fixture slice (apiV2/src/vuln/:
// Tier 1's hygiene routes, and since M130a Tier 2's broken-authorization ones) — deliberately
// absent by default, so the ~45 files that run against the clean app keep running against the
// clean app. That default matters more now than it did: one of the M130a routes deletes any order
// it is given, so a stack started with the slice present is one the rest of the suite should not
// be sharing. Because each phase restarts anyway, this costs nothing
// and, more to the point, it cannot leak: the next phase's own restart takes the variable away
// again, so "started with the fixtures" is scoped to exactly the phase that asked for it.
export function restart(stackEnv = {}) {
  run('node cli.mjs stop');
  run('node cli.mjs start', { env: { ...process.env, ...stackEnv } });
}
