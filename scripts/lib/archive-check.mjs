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

/** `results` carry the archive's directory names (`slug(phase.name)`, as `archivePhaseReport` wrote them).
 * @returns {{ problems: string[], kept: number, merged: number }} */
export function checkArchive(archiveDir, tflwArgv, results) {
  const problems = [];
  const passed = new Set(results.filter((r) => r.ok && !r.skipped).map((r) => r.name));
  const dirs = existsSync(archiveDir) ? readdirSync(archiveDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
  const mergeable = [];
  let kept = 0;
  for (const name of dirs.sort()) {
    const dir = path.join(archiveDir, name);
    const resultsPath = path.join(dir, 'results.json');
    if (!existsSync(resultsPath)) continue;
    const report = JSON.parse(readFileSync(resultsPath, 'utf8'));
    const runsDir = path.join(dir, KEPT_RUNS_DIR);
    const ids = existsSync(runsDir) ? readdirSync(runsDir).sort() : [];
    const newest = ids.at(-1);
    const newestReport = newest && existsSync(path.join(runsDir, newest, 'results.json')) ? JSON.parse(readFileSync(path.join(runsDir, newest, 'results.json'), 'utf8')) : null;
    if (newestReport?.startedAt !== report.startedAt) {
      problems.push(`${name}: its last run (started ${report.startedAt}) is not kept under ${KEPT_RUNS_DIR}/ — newest kept is ${newest ?? 'none'}${newestReport ? ` (started ${newestReport.startedAt})` : ''}`);
    } else kept += ids.length;
    if (existsSync(path.join(dir, 'junit.xml')) && passed.has(name)) mergeable.push({ name, report });
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
