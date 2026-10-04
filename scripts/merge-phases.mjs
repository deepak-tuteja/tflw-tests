#!/usr/bin/env node
// tflw `M249` `C` (`D1369`) / `T-3` — every phase report under `report-by-phase/` that passed, merged
// by `tflw merge` into `report-merged/`. What CI's `merge-reports` job runs over the four groups'
// downloaded archives; locally it runs over whatever the last sweep left.
//
// A phase is merged when it wrote a `results.json` and kept its `junit.xml` — a phase whose failure is
// by design has that file renamed `junit-by-design.xml` (`archivePhaseReport`) and is left out, or the
// merge would carry every deliberate failure the sweep is built to contain. The exit code is the
// merge's: 0 when the merged run passed.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tflwArgv } from './lib/tflw-bin.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ARCHIVE = path.join(ROOT, 'report-by-phase');
const dirs = existsSync(ARCHIVE)
  ? readdirSync(ARCHIVE, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(path.join(ARCHIVE, e.name, 'results.json')) && existsSync(path.join(ARCHIVE, e.name, 'junit.xml')))
      .map((e) => path.join('report-by-phase', e.name))
      .sort()
  : [];
if (dirs.length === 0) {
  console.error('✗ no phase report under report-by-phase/ to merge — run the sweep (or download its artefacts) first');
  process.exit(2);
}
const [node, ...entry] = tflwArgv('released', { label: 'merge-phases' });
const r = spawnSync(node, [...entry, 'merge', ...dirs, '--out', 'report-merged', '--no-color'], { cwd: ROOT, stdio: 'inherit' });
process.exit(r.status ?? 2);
