// tflw `M249` `A`/`C` (`D1362`, `D1369`) / this repo's `T-3` — the sweep's archive, graded at its end.
//
// Every phase's `report/` is renamed into `report-by-phase/<phase>/` (`archivePhaseReport`), and since
// tflw `M249` every `tflw run` keeps itself under `report/runs/<id>/`. So the archive is where two new
// claims can be checked against the runs this sweep really made, not a fixture:
//
//  1. **runs keep** — each archived phase that wrote a `results.json` kept that run: its `runs/`
//     holds a run whose `results.json` has the same `startedAt`. A phase is one run or several (a
//     script may run tflw more than once), and the newest kept one is the phase's last.
//  2. **`tflw merge`** — the phases that passed, merged, are one run whose tests are the sum of
//     theirs, whose `mergedFrom` names each, and whose exit is 0. The phases whose failure is by
//     design (`junit-by-design.xml`) are left out: merging a deliberate failure would redden every
//     sweep with the one thing it is meant to contain.
//
// The names read here — `runs` and `mergedFrom` — are in tflw's artifact contract (`report.*`), and
// `verify-artifact-contract.mjs` holds this file to them.

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const KEPT_RUNS_DIR = 'runs';

/**
 * Phases whose archived `results.json` is not a run this directory's tflw made and kept, each with
 * why. Claim 1 does not apply to them; an entry naming no archived phase is itself a problem, so the
 * list cannot outlive the reason it records.
 */
export const REPORT_NOT_KEPT_HERE = new Map([
  ['sarif-acceptance', 'runs its scans in a copy of the corpus and copies that run\'s results.json and findings.sarif into report/ — the run was kept where it ran, not here'],
  ['ui-check', 'drives `tflw ui`, whose page runs keep themselves under report/runs/, and then removes the kept directories it made (verify-ui.mjs\'s teardown) so no later phase reads its runs as its own'],
]);

/** `results` carry the archive's directory names (`slug(phase.name)`, as `archivePhaseReport` wrote them).
 * @returns {{ problems: string[], kept: number, merged: number }} */
export function checkArchive(archiveDir, tflwArgv, results) {
  const problems = [];
  const passed = new Set(results.filter((r) => r.ok && !r.skipped).map((r) => r.name));
  const dirs = existsSync(archiveDir) ? readdirSync(archiveDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
  const mergeable = [];
  const exemptSeen = new Set();
  let kept = 0;
  for (const name of dirs.sort()) {
    const dir = path.join(archiveDir, name);
    const resultsPath = path.join(dir, 'results.json');
    if (!existsSync(resultsPath)) continue;
    const report = JSON.parse(readFileSync(resultsPath, 'utf8'));
    if (REPORT_NOT_KEPT_HERE.has(name)) {
      exemptSeen.add(name);
      if (existsSync(path.join(dir, 'junit.xml')) && passed.has(name)) mergeable.push({ name, report });
      continue;
    }
    const runsDir = path.join(dir, KEPT_RUNS_DIR);
    const ids = existsSync(runsDir) ? readdirSync(runsDir).sort() : [];
    const newest = ids.at(-1);
    const newestReport = newest && existsSync(path.join(runsDir, newest, 'results.json')) ? JSON.parse(readFileSync(path.join(runsDir, newest, 'results.json'), 'utf8')) : null;
    if (newestReport?.startedAt !== report.startedAt) {
      problems.push(`${name}: its last run (started ${report.startedAt}) is not kept under ${KEPT_RUNS_DIR}/ — newest kept is ${newest ?? 'none'}${newestReport ? ` (started ${newestReport.startedAt})` : ''}`);
    } else kept += ids.length;
    if (existsSync(path.join(dir, 'junit.xml')) && passed.has(name)) mergeable.push({ name, report });
  }
  // Only this group's phases are archived here, so an exemption is stale only when its phase ran in
  // this group (it is in `results`) and left no report at all.
  for (const name of REPORT_NOT_KEPT_HERE.keys()) {
    if (results.some((r) => r.name === name) && !exemptSeen.has(name)) problems.push(`REPORT_NOT_KEPT_HERE names ${name}, which ran and archived no results.json — the exemption has outlived its reason`);
  }
  if (mergeable.length < 2) {
    problems.push(`only ${mergeable.length} passing phase report(s) to merge — the check needs two to say anything`);
    return { problems, kept, merged: 0 };
  }
  const out = path.join(archiveDir, '..', 'report-merged');
  rmSync(out, { recursive: true, force: true });
  const [node, ...entry] = tflwArgv;
  const r = spawnSync(node, [...entry, 'merge', ...mergeable.map((m) => path.join(archiveDir, m.name)), '--out', out, '--no-color'], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`tflw merge over ${mergeable.length} passing phases exited ${r.status}:\n${(r.stdout + r.stderr).slice(-800)}`);
  else {
    const merged = JSON.parse(readFileSync(path.join(out, 'results.json'), 'utf8'));
    const expectedTotal = mergeable.reduce((n, m) => n + m.report.total, 0);
    if (merged.total !== expectedTotal) problems.push(`the merge holds ${merged.total} tests; the ${mergeable.length} phases held ${expectedTotal}`);
    if ((merged.mergedFrom ?? []).length !== mergeable.length) problems.push(`mergedFrom names ${(merged.mergedFrom ?? []).length} inputs; ${mergeable.length} were merged`);
    if (merged.ok !== true) problems.push('the merge of passing phases is not ok');
  }
  return { problems, kept, merged: mergeable.length };
}
