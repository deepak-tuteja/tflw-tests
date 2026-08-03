// Shared between scripts/regression.mjs (full 30-phase sweep) and scripts/regression-smoke.mjs
// (fast local subset, PLAN_CI.md decision 15) — phase-report archiving and the Docker
// restart/run helpers, so both scripts write report-by-phase/ the same way and a failing smoke
// run's evidence is inspectable exactly like a full sweep's.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
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
// See regression.mjs's own comment on JUNIT_EXCLUDED_PHASES for the full history.
const JUNIT_EXCLUDED_PHASES = new Set(['demo-fail-check']);

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

export function restart() {
  run('node cli.mjs stop');
  run('node cli.mjs start');
}
