#!/usr/bin/env node
// `M195` S3 (tflw `PLAN_M195_REGRESSION_GAP.md`): `tflw init`, the first command a new user runs,
// had no phase — it scaffolds a project against tflw's own demo service (`api "tflw://demo"`, a real
// HTTP server tflw starts for the run), and whether what it scaffolds still checks and runs was
// asked by nobody. Here it is asked in a fresh temporary directory every sweep: `init --load`
// creates the files it names, `check` over them is clean, `run example.tflw` is green against the
// demo service, and a second `init` refuses rather than overwriting (`B6-11`).
//
// `load.tflw` is checked, not run: its `threshold p95 … 500ms` is a timing number, and a timing
// number graded inside a sweep phase on a shared box is `M190-02`'s false-red shape. `perf-ladder`
// exists for numbers.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveTflw } from './lib/tflw-bin.mjs';

const CLI_ENTRY = resolveTflw('released', { label: 'verify-init' }).entry;

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

function tflw(cwd, ...args) {
  const r = spawnSync(process.execPath, [CLI_ENTRY, ...args], { cwd, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const dir = mkdtempSync(path.join(tmpdir(), 'tflw-verify-init-'));
try {
  const init = tflw(dir, 'init', '--load');
  const created = /^created (.+)$/m.exec(init.out)?.[1]?.split(', ') ?? [];
  ok('`tflw init --load` in an empty directory exits 0 and says what it created', init.status === 0 && created.length > 0, init.out.slice(0, 300));
  const expected = ['tflw.config', 'example.tflw', 'load.tflw', '.env.example', 'package.json', '.gitignore'];
  ok(`it names the six files it scaffolds: ${expected.join(', ')}`, JSON.stringify([...created].sort()) === JSON.stringify([...expected].sort()), created.join(', '));
  ok('every file it names exists', created.every((f) => existsSync(path.join(dir, f))), created.filter((f) => !existsSync(path.join(dir, f))).join(', '));
  const config = existsSync(path.join(dir, 'tflw.config')) ? readFileSync(path.join(dir, 'tflw.config'), 'utf8') : '';
  ok('the scaffolded config points `local` at the demo service, so the first run needs nothing wired up', /^env local default$/m.test(config) && /api "tflw:\/\/demo"/.test(config));
  const pkg = existsSync(path.join(dir, 'package.json')) ? JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) : {};
  ok('the scaffolded package.json is `"type": "module"` and private (`FU-15`)', pkg.type === 'module' && pkg.private === true, JSON.stringify(pkg));

  const check = tflw(dir, 'check', '--no-color');
  ok('`tflw check` over the scaffold is clean — both files, no problems', check.status === 0 && /2 files checked, no problems found/.test(check.out), check.out.slice(0, 300));

  const run = tflw(dir, 'run', 'example.tflw', '--no-color');
  ok('`tflw run example.tflw` is green against the demo service tflw starts itself', run.status === 0 && /PASS 1\/1 passed/.test(run.out), `exit ${run.status}: ${run.out.slice(0, 400)}`);
  ok('the run wrote its report where the scaffold says (`report/results.json`, ok)', existsSync(path.join(dir, 'report', 'results.json')) && JSON.parse(readFileSync(path.join(dir, 'report', 'results.json'), 'utf8')).ok === true);

  const again = tflw(dir, 'init');
  ok('a second `tflw init` refuses rather than overwriting (exit 2, names the existing config)', again.status === 2 && /already exists/.test(again.out), `exit ${again.status}: ${again.out.slice(0, 200)}`);
  ok('…and the config it refused to overwrite is byte-identical', readFileSync(path.join(dir, 'tflw.config'), 'utf8') === config);
} catch (error) {
  ok('the phase ran to its end', false, String(error?.stack ?? error).slice(0, 600));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (violations > 0) {
  console.error(`\n${violations} tflw init violation(s).`);
  process.exit(1);
}
console.log('\ntflw init scaffolds a project that checks and runs.');
