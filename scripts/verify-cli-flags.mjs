#!/usr/bin/env node
// M29 (plan_v2.md Part R decision 6): durable, repeatable proof for six tflw CLI flags that had
// no proof beyond ad-hoc manual runs during past milestones — nothing before this would have
// caught a future tflw regression breaking any of them. Mirrors verify-redaction.mjs's pattern:
// real assertions against real output artifacts, not hand-verification trusted forever.
//
// `--forbid-insecure`/`--evidence` are deliberately out of scope here: both already have durable
// coverage elsewhere (`.github/workflows/ci.yml`'s CI job / `scripts/verify-redaction.mjs` and
// `tests/safety-redaction.tflw`'s `--evidence` runs) — this script only covers the six flags the
// M29 audit found with zero durable proof anywhere: `--failed`, `--bail`, `--format ndjson`,
// `--now`, `--log-file`, `--no-timestamps`.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPORT_DIR = path.join(ROOT, 'report');

let violations = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

function run(cmd, opts = {}) {
  try {
    return { stdout: execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], ...opts }), status: 0 };
  } catch (err) {
    return { stdout: err.stdout ?? '', status: err.status ?? 1 };
  }
}

// --- --now: pins the run's notion of "now" to an exact instant --------------------------------
{
  const pinned = '2027-05-01T00:00:00.000Z';
  const { stdout } = run(`npx tflw run tests/mtls.tflw --env mtlsSidecar --now ${pinned} --seed 42 --no-color`);
  ok('--now pins the printed run instant exactly', stdout.includes(`now ${pinned}`), stdout.trim().split('\n').pop());
}

// --- --failed: replays only the previous run's failing test(s) --------------------------------
{
  // A genuine failure needs to live inside tflw's *default* discovery set (not a dot-directory —
  // `--failed`'s own matching re-discovers the normal `tflw run` file set, confirmed by reading
  // `packages/cli/src/cli.ts`: pointing it at tests/.demo-fail/*.tflw instead produces "none of
  // the previously-failed tests were found in the current suite", not a real proof of the flag).
  // Scratch fixture, cleaned up in `finally` regardless of outcome — never left on disk.
  const scratchPath = path.join(ROOT, 'tests', '_verify-cli-flags-scratch.tflw');
  writeFileSync(
    scratchPath,
    'test "_verify-cli-flags-scratch: deliberately wrong on purpose"\n' +
      '  api GET /health\n' +
      '  expect status equals 999\n',
  );
  try {
    run('npx tflw run tests/_verify-cli-flags-scratch.tflw --no-color');
    const { stdout } = run('npx tflw run --failed --no-color');
    const m = /(?:PASS|FAIL) (\d+)\/(\d+) passed/.exec(stdout);
    const ranOnlyTheFailedOne = m !== null && Number(m[2]) === 1;
    ok(
      '--failed replays only the previously-failing test, not the whole default suite',
      ranOnlyTheFailedOne && stdout.includes('_verify-cli-flags-scratch'),
      stdout.trim().split('\n').pop(),
    );
  } finally {
    if (existsSync(scratchPath)) unlinkSync(scratchPath);
  }
}

// --- --bail: stops after the first failing test's final verdict -------------------------------
{
  run('node cli.mjs stop');
  run('node cli.mjs start');
  const bailReportDir = path.join(ROOT, 'report');
  run(
    'npx tflw run tests/.demo-fail/bad-assertion.tflw tests/.demo-fail/contract-drift.tflw ' +
      'tests/.demo-fail/large-response-diff.tflw --no-color --tag demofail --bail --format ndjson',
  );
  const events = readFileSync(path.join(bailReportDir, 'events.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const testEnds = events.filter((e) => e.type === 'test:end');
  ok(
    '--bail stops after the first failing test (only 1 test:end, not 3)',
    testEnds.length === 1,
    `saw ${testEnds.length} test:end event(s)`,
  );
}

// --- --format ndjson: report/events.ndjson is valid line-delimited JSON with the right shape ---
{
  run('npx tflw run tests/mtls.tflw --env mtlsSidecar --format ndjson --no-color');
  const lines = readFileSync(path.join(REPORT_DIR, 'events.ndjson'), 'utf8').trim().split('\n');
  let allValid = true;
  const types = new Set();
  for (const line of lines) {
    try {
      types.add(JSON.parse(line).type);
    } catch {
      allValid = false;
    }
  }
  ok('--format ndjson: every line is valid JSON', allValid);
  const expectedTypes = ['run:start', 'test:start', 'step:end', 'test:end', 'run:end'];
  ok(
    '--format ndjson: event stream includes every expected event type',
    expectedTypes.every((t) => types.has(t)),
    `saw: ${[...types].join(', ')}`,
  );
}

// --- --log-file: always plain text (ANSI stripped), regardless of stdout's own color state -----
{
  // `tflw`'s color decision is `noColor ? false : process.stdout.isTTY === true` (cli.ts) — a
  // plain execSync pipe is never a TTY, so color would never be on to strip in the first place.
  // A real pty is needed to force color on and make this a meaningful proof, not a vacuous one.
  // Uses Python's stdlib `pty` module (no new dependency — python3 is a system tool, not an npm
  // package) to allocate one.
  const logFilePath = path.join('/tmp', `tflw-logfile-verify-${process.pid}.log`);
  const ptyStdoutPath = path.join('/tmp', `tflw-pty-stdout-verify-${process.pid}.txt`);
  const pyScript = `
import pty, os
pid, fd = pty.fork()
if pid == 0:
    os.chdir(${JSON.stringify(ROOT)})
    os.execvp('npx', ['npx', 'tflw', 'run', 'tests/mtls.tflw', '--env', 'mtlsSidecar', '--log-file', ${JSON.stringify(logFilePath)}])
else:
    output = b''
    while True:
        try:
            data = os.read(fd, 4096)
        except OSError:
            break
        if not data:
            break
        output += data
    os.waitpid(pid, 0)
    with open(${JSON.stringify(ptyStdoutPath)}, 'wb') as f:
        f.write(output)
`;
  try {
    execFileSync('python3', ['-c', pyScript], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    const ptyStdout = readFileSync(ptyStdoutPath, 'utf8');
    const logFile = readFileSync(logFilePath, 'utf8');
    const ESC = '\x1b[';
    ok(
      '--log-file strips ANSI even though the real (pty) stdout has color',
      ptyStdout.includes(ESC) && !logFile.includes(ESC),
      `pty stdout had color: ${ptyStdout.includes(ESC)}, log file had color: ${logFile.includes(ESC)}`,
    );
  } finally {
    for (const p of [logFilePath, ptyStdoutPath]) if (existsSync(p)) unlinkSync(p);
  }
}

// --- --no-timestamps: omits the HH:MM:SS.mmm prefix every console line otherwise gets ----------
{
  const TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2}\.\d{3} /m;
  const { stdout: withTimestamps } = run('npx tflw run tests/mtls.tflw --env mtlsSidecar --no-color');
  const { stdout: withoutTimestamps } = run('npx tflw run tests/mtls.tflw --env mtlsSidecar --no-color --no-timestamps');
  ok('default output has an HH:MM:SS.mmm prefix', TIMESTAMP_RE.test(withTimestamps));
  ok('--no-timestamps omits the prefix', !TIMESTAMP_RE.test(withoutTimestamps));
}

if (violations > 0) {
  console.error(`\n${violations} CLI-flag proof violation(s).`);
  process.exit(1);
}

console.log('\nAll 6 previously-unproven CLI flags behave as documented.');
