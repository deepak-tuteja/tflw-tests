#!/usr/bin/env node
// Fast local smoke check (PLAN_CI.md decision 15): one Docker restart, then `--tag smoke` (a
// mixed sample across all 3 layers) plus the cheapest, highest-signal `*-check` scripts that
// don't need their own `--env`/restart-adjacent assumptions — demo-fail-check, cli-flags-check,
// check-diagnostics. Not a replacement for `npm run regression`'s full 30-phase sweep: reserve
// that for `testFlow`-touching changes, or let CI catch it (README's own "Fast local smoke
// check" note points here).
//
// Deliberately excluded, per decision 15: mtls-rejection/safety-redaction-check/
// safety-flags-check/ui-admin-check/webv2-admin-check (each needs its own `--env`, i.e. its own
// restart-adjacent assumptions this smoke run's one shared restart doesn't cleanly support) and
// watch-check/pick-check/logging-check/report-overflow-check (real but narrow single-flag
// proofs, lower regression-catching density per second than a broad smoke tag sweep).
import { rmSync } from 'node:fs';
import { ARCHIVE_DIR, CI_VERBOSE, archivePhaseReport, restart, run } from './lib/regression-shared.mjs';

const SMOKE_PHASES = [
  { name: '--tag smoke', args: ['--tag', 'smoke'] },
  { name: 'demo-fail-check', cmd: 'node scripts/verify-demofail.mjs' },
  { name: 'cli-flags-check', cmd: 'node scripts/verify-cli-flags.mjs' },
  { name: 'check-diagnostics', cmd: 'node scripts/verify-check-diagnostics.mjs' },
];

rmSync(ARCHIVE_DIR, { recursive: true, force: true });

console.log('\n=== smoke: one restart, then all phases against it ===\n');
restart();

const results = [];
for (const phase of SMOKE_PHASES) {
  console.log(`\n--- ${phase.name} ---\n`);
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

console.log('\n=== smoke summary ===');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.log(`\n${failed.length}/${results.length} smoke phase(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} smoke phases passed.`);
