#!/usr/bin/env node
// `S-2` (tflw `M240`; `PLAN_M239_DOGFOOD_EXPANSION.md` §3): `tflw ui` tested by this project — in
// tflw's own language where tflw can say it (`S-2a`, `tests/.tflw-ui/`), and in Playwright where it
// cannot (`S-2b`, `scripts/verify-ui-budgets.mjs`), under one server.
//
// WHAT IS SERVED. A scratch copy of this project, never the tree: the keyboard file writes a draft
// through the page with ⌘S, and a page that can write can write here. The copy is what
// `verify-refactor.mjs` copies — what `tflw run` resolves from the root — so the doors count this
// project's own tests and the budgets are measured on the project the review measured.
//
// WHERE THE SUITE RUNS. `tests/.tflw-ui/` is copied beside the project and run there, so its
// `report/` lands in the scratch directory. Its config reads two variables, set here from the
// server's first line: the base (`TFLW_UI_URL`, a plain override) and the token (`TFLW_UI_TOKEN`,
// read with `env(…)` so the redactor hides it).
//
// THE CONTROLS, so a green is a verdict and not an outage:
//   - the same `doors.tflw` with a wrong token must FAIL — the page then serves the one-sentence
//     page a token-less visit gets, and a suite that passed anyway would be passing on nothing;
//   - the token string must appear nowhere under the suite's `report/` (the plan's §6 risk 2).
//
// A chrome-spawning phase: on the box it runs under the sweep's lease like the browser groups, and
// never beside a model.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTflw } from './lib/tflw-bin.mjs';
import { measureBudgets } from './verify-ui-budgets.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_ENTRY = resolveTflw('released', { label: 'verify-ui-page' }).entry;
const COPIED = ['tests', 'shared', 'tflw.config', '.env', 'package.json', 'nginx/certs'];
const SUITE = path.join(ROOT, 'tests', '.tflw-ui');

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

function startUi(dir) {
  const child = spawn('node', [CLI_ENTRY, 'ui', '.', '--no-open', '--port', '0'], { cwd: dir, env: { ...process.env, FORCE_COLOR: '0' } });
  let out = '';
  child.stdout.on('data', (d) => (out += d.toString()));
  child.stderr.on('data', (d) => (out += d.toString()));
  let exitCode = null;
  const exited = new Promise((resolve) => child.on('exit', (code) => ((exitCode = code), resolve())));
  return {
    async listening(timeoutMs = 30000) {
      const start = Date.now();
      for (;;) {
        const m = /at (http:\/\/127\.0\.0\.1:\d+)\/\?token=([A-Za-z0-9_-]+)/.exec(out);
        if (m) return { base: m[1], token: m[2] };
        if (exitCode !== null) throw new Error(`tflw ui exited ${exitCode} before listening:\n${out}`);
        if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for tflw ui to listen; output so far:\n${out}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    async stop() {
      child.kill('SIGINT');
      await Promise.race([exited, new Promise((r) => setTimeout(r, 15000))]);
      if (exitCode === null) child.kill('SIGKILL');
    },
  };
}

function tflw(cwd, env, ...args) {
  const r = spawnSync('node', [CLI_ENTRY, ...args], { cwd, env: { ...process.env, FORCE_COLOR: '0', ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** Every file under `dir` whose bytes carry `needle` — the token must be in none of them. */
function filesCarrying(dir, needle) {
  const hits = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (statSync(p).size < 256 * 1024 * 1024 && readFileSync(p).includes(needle)) hits.push(path.relative(dir, p));
    }
  };
  if (existsSync(dir)) walk(dir);
  return hits;
}

const scratch = mkdtempSync(path.join(tmpdir(), 'tflw-verify-ui-page-'));
const project = path.join(scratch, 'project');
const suite = path.join(scratch, 'suite');
const ui = (() => {
  for (const m of COPIED) if (existsSync(path.join(ROOT, m))) cpSync(path.join(ROOT, m), path.join(project, m), { recursive: true });
  cpSync(SUITE, suite, { recursive: true });
  return startUi(project);
})();
try {
  const { base, token } = await ui.listening();
  console.log(`tflw ui serving a copy of this project at ${base}`);
  const env = { TFLW_UI_URL: base, TFLW_UI_TOKEN: token };

  const checked = tflw(suite, env, 'check', '--no-color');
  ok('`tflw check` over the page suite is clean', checked.status === 0 && /no problems found/.test(checked.out), checked.out.slice(0, 600));

  // The control first: a wrong token must fail, or the real run below proves nothing.
  const forged = tflw(suite, { ...env, TFLW_UI_TOKEN: 'not-this-session' }, 'run', '--no-color', 'doors.tflw');
  ok('control: the doors file FAILS with a wrong token', forged.status !== 0 && /FAIL/.test(forged.out), forged.out.slice(-600));

  const run = tflw(suite, env, 'run', '--no-color');
  const tally = /(\d+) passed[^\n]*?(\d+) failed/.exec(run.out) ?? /PASS (\d+)[^\n]*FAIL (\d+)/.exec(run.out);
  ok(`the page suite passes against this project${tally ? ` (${tally[0]})` : ''}`, run.status === 0, run.out.slice(-2000));

  const leaks = filesCarrying(path.join(suite, 'report'), token);
  ok('the token is in no file the run kept', leaks.length === 0, leaks.join(', '));

  const budgets = await measureBudgets(base, token);
  for (const line of budgets.passed) ok(line, true);
  for (const line of budgets.failed) ok(line, false);
} catch (e) {
  ok('the phase ran to its end', false, e instanceof Error ? e.stack ?? e.message : String(e));
} finally {
  await ui.stop();
  rmSync(scratch, { recursive: true, force: true });
}

if (violations > 0) {
  console.error(`\nverify-ui-page: ${violations} violation(s).`);
  process.exit(1);
}
console.log('\nverify-ui-page: the page passes its own language, its budgets and both controls.');
