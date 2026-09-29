#!/usr/bin/env node
// tflw `M247` `G12` (`D1385`) / this repository's `T-5a`: `tflw record`, driven by a script.
//
// `verify-pick.mjs` could only prove that `pick` launches and stops, because nothing outside the
// command could act in its window. `--cdp-port` is that door: the command opens the browser's
// DevTools endpoint on loopback, this script connects to it with Playwright's `connectOverCDP`, and
// every gesture it makes in the storefront is recorded exactly as a person's would be. So the
// adopter-side claim can finally be checked end to end:
//
//   1. the session announces its endpoint and is ready;
//   2. a short sign-in with the wrong password, made through the endpoint, prints one step per
//      action and nothing else on stdout;
//   3. those steps, as a test, pass `tflw check` and run green against the stack;
//   4. they equal `tests/.record/login-attempt.golden.tflw`, with this worker's web base written as
//      `{web}` so the golden does not depend on the port offset (`M197`).
//
// `--update` rewrites the golden from this run, for a deliberate change to what the recorder prints.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveTflw } from './lib/tflw-bin.mjs';
import { urls } from './lib/stack-ports.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_ENTRY = resolveTflw('released', { label: 'verify-record' }).entry;
const WEB = urls().TFLW_WEB_BASE;
const START = `${WEB}/login`;
const GOLDEN = path.join(ROOT, 'tests', '.record', 'login-attempt.golden.tflw');
const UPDATE = process.argv.includes('--update');

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

const port = await new Promise((resolve) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const p = probe.address().port;
    probe.close(() => resolve(p));
  });
});

const child = spawn('node', [CLI_ENTRY, 'record', START, '--cdp-port', String(port)], { cwd: ROOT });
let stdout = '';
let stderr = '';
child.stdout.on('data', (d) => (stdout += d.toString()));
child.stderr.on('data', (d) => (stderr += d.toString()));
let exitCode = null;
const exited = new Promise((resolve) => child.on('exit', (code) => resolve((exitCode = code))));

const until = async (what, cond, ms = 30000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) {
      child.kill('SIGKILL');
      ok(what, false, `timed out; stderr so far:\n${stderr}\nstdout so far:\n${stdout}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
};

// 1. The endpoint is announced, on loopback, before the page is declared ready.
await until('the session is ready', () => stderr.includes('ready — use the page as a user would'));
ok('the endpoint is announced on stderr, on loopback, at the port asked for', stderr.includes(`devtools: http://127.0.0.1:${port} `), stderr);

// 2. Drive the sign-in through the endpoint. The page is found by URL, not by position: the
//    endpoint lists every target the browser has, and the recorder's page is the one at START.
const driver = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = driver.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(START));
ok('the recorded page is reachable through the endpoint', page !== undefined, driver.contexts().flatMap((c) => c.pages()).map((p) => p.url()).join(', '));
if (page) {
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByText('invalid email or password').waitFor();
  // Let the recorder's queue drain: it resolves each locator against the live page after the fact.
  let seen = -1;
  for (let quiet = 0; quiet < 5; ) {
    await new Promise((r) => setTimeout(r, 150));
    if (seen === stdout.length) quiet++;
    else {
      seen = stdout.length;
      quiet = 0;
    }
  }
}
await driver.close().catch(() => {});
child.kill('SIGINT');
await Promise.race([exited, new Promise((r) => setTimeout(r, 15000))]);
if (exitCode === null) child.kill('SIGKILL');
ok('Ctrl+C stops the session cleanly (exit 0 or 130)', exitCode === 0 || exitCode === 130, `exit ${exitCode}\n${stderr}`);

const steps = stdout.split('\n').filter((l) => l.trim() !== '');
ok('stdout carries steps and nothing else — no banner, no endpoint line', !/recording |ready —|devtools:/.test(stdout), stdout);
ok('the gestures were recorded (a fill per field and the click)', steps.length >= 3, stdout);

// 3. The steps, as a test: they check and they run. A copy of this project's config beside them,
//    in a scratch directory, so the run's report does not land in the sweep's `report/`.
const recorded = `test "a recorded sign-in attempt"\n${steps.map((l) => `  ${l}`).join('\n')}\n`;
const scratch = mkdtempSync(path.join(tmpdir(), 'tflw-record-'));
try {
  copyFileSync(path.join(ROOT, 'tflw.config'), path.join(scratch, 'tflw.config'));
  writeFileSync(path.join(scratch, 'recorded.tflw'), recorded);
  const check = spawnSync('node', [CLI_ENTRY, 'check', 'recorded.tflw'], { cwd: scratch, encoding: 'utf8' });
  ok('`tflw check` accepts the recording', check.status === 0, `${check.stdout}${check.stderr}\n--- recorded.tflw ---\n${recorded}`);
  const run = spawnSync('node', [CLI_ENTRY, 'run', 'recorded.tflw', '--no-color'], { cwd: scratch, encoding: 'utf8', env: process.env });
  ok('the recording runs green against the stack', run.status === 0 && /PASS 1\/1/.test(run.stdout), `${run.stdout}${run.stderr}`.slice(-1500));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// 4. The golden, with this worker's base as `{web}`.
const normalized = recorded.split(WEB).join('{web}');
if (UPDATE) {
  writeFileSync(GOLDEN, normalized);
  console.log(`wrote ${path.relative(ROOT, GOLDEN)}:\n${normalized}`);
} else {
  const golden = existsSync(GOLDEN) ? readFileSync(GOLDEN, 'utf8') : '(missing)';
  ok(`the recording equals ${path.relative(ROOT, GOLDEN)}`, normalized === golden, `\n--- recorded ---\n${normalized}--- golden ---\n${golden}`);
}

if (violations > 0) {
  console.error(`\n${violations} record-session proof violation(s).`);
  process.exit(1);
}
console.log('\n`tflw record` was driven through its DevTools endpoint, and what it printed checks, runs and matches the golden.');
