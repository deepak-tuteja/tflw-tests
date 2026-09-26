#!/usr/bin/env node
// M29 (plan_v2.md Part R decision 6): durable, repeatable proof for six tflw CLI flags that had
// no proof beyond ad-hoc manual runs during past milestones — nothing before this would have
// caught a future tflw regression breaking any of them. Mirrors verify-redaction.mjs's pattern:
// real assertions against real output artifacts, not hand-verification trusted forever.
//
// `--forbid-insecure`/`--evidence` are out of scope here — this script only covers the six flags
// the M29 audit found with zero durable proof anywhere: `--failed`, `--bail`, `--format ndjson`,
// `--now`, `--log-file`, `--no-timestamps`. (M47/PLAN_WEBV2_M45.md: the claim this comment used to
// make — that `--forbid-insecure`/`--evidence` already had durable coverage elsewhere — was false;
// neither was actually invoked/proven anywhere. Real coverage now lives in
// `scripts/verify-safety-flags.mjs`, its own file since both are safety/policy knobs.)
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tflwArgv, quoteArgv } from './lib/tflw-bin.mjs';

/** `released`: this script grades the tflw a user would have installed, which is what
 *  `npx tflw` resolved here before M141 — the program is unchanged, the question is now
 *  declared and the entry is printed instead of inferred. */
const TFLW_ARGV = tflwArgv('released', { label: 'verify-cli-flags' });
const TFLW = quoteArgv(TFLW_ARGV);

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

// Every flag here is a property of *how* a run reports, not of whether it passes — so each block
// asserts on the shape of some real run's output. That left a hole this script fell straight into:
// when tflw's M104 path-resolution change broke `mtls.tflw` outright, all six assertions still
// held (the timestamps were still timestamps, the ndjson still parsed, the log file still had no
// ANSI) and this script printed six ✓ over a suite that had failed both its tests. The only thing
// that noticed was CI's report aggregator, reading the junit.xml this script leaves behind — a
// non-required job, since it runs `if: always()`. A driver that ignores its subject's verdict is a
// green check that means less than it looks like, so the runs that are *meant* to pass now say so.
//
// Deliberately excluded: the `--failed` and `--bail` blocks below, whose whole point is to drive a
// failing suite. Their non-zero exit is the fixture, not a regression.
function runPassing(cmd, what) {
  const result = run(cmd);
  ok(
    `${what}: the run it drives actually passed`,
    result.status === 0,
    `exit ${result.status}; last line: ${result.stdout.trim().split('\n').pop()}`,
  );
  return result;
}

// --- --now: pins the run's notion of "now" to an exact instant --------------------------------
{
  const pinned = '2027-05-01T00:00:00.000Z';
  const { stdout } = runPassing(
    `${TFLW} run tests/api/identity/mtls.tflw --env mtlsSidecar --now ${pinned} --seed 42 --no-color`,
    '--now',
  );
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
    run(`${TFLW} run tests/_verify-cli-flags-scratch.tflw --no-color`);
    const { stdout } = run(`${TFLW} run --failed --no-color`);
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
    `${TFLW} run tests/.demo-fail/bad-assertion.tflw tests/.demo-fail/contract-drift.tflw ` +
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
  runPassing(`${TFLW} run tests/api/identity/mtls.tflw --env mtlsSidecar --format ndjson --no-color`, '--format ndjson');
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
  // `runPassing` can't reach this one — the run happens inside the forked pty, so its exit code is
  // only knowable to the Python parent. It gets written out alongside the captured stdout so the
  // same verdict check applies here as everywhere else; without it, a totally failing run still
  // satisfies "stdout has ANSI, log file doesn't".
  const ptyStatusPath = path.join('/tmp', `tflw-pty-status-verify-${process.pid}.txt`);
  const pyScript = `
import pty, os
pid, fd = pty.fork()
if pid == 0:
    os.chdir(${JSON.stringify(ROOT)})
    # The same entry every other run in this file uses, handed over as argv rather than as a
    # shell string — a pty exec takes no shell. It was the last npx-argv literal in the repo, and
    # the one the M141 guard's first pattern set could not see.
    os.execvp(${JSON.stringify(TFLW_ARGV[0])}, [${TFLW_ARGV.map((a) => JSON.stringify(a)).join(', ')}, 'run', 'tests/api/identity/mtls.tflw', '--env', 'mtlsSidecar', '--log-file', ${JSON.stringify(logFilePath)}])
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
    _, status = os.waitpid(pid, 0)
    with open(${JSON.stringify(ptyStdoutPath)}, 'wb') as f:
        f.write(output)
    with open(${JSON.stringify(ptyStatusPath)}, 'w') as f:
        f.write(str(os.waitstatus_to_exitcode(status)))
`;
  try {
    execFileSync('python3', ['-c', pyScript], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    const ptyStdout = readFileSync(ptyStdoutPath, 'utf8');
    const logFile = readFileSync(logFilePath, 'utf8');
    const ptyStatus = readFileSync(ptyStatusPath, 'utf8').trim();
    ok(
      '--log-file: the run it drives actually passed',
      ptyStatus === '0',
      `exit ${ptyStatus}; last line: ${logFile.trim().split('\n').pop()}`,
    );
    const ESC = '\x1b[';
    ok(
      '--log-file strips ANSI even though the real (pty) stdout has color',
      ptyStdout.includes(ESC) && !logFile.includes(ESC),
      `pty stdout had color: ${ptyStdout.includes(ESC)}, log file had color: ${logFile.includes(ESC)}`,
    );
  } finally {
    for (const p of [logFilePath, ptyStdoutPath, ptyStatusPath]) if (existsSync(p)) unlinkSync(p);
  }
}

// --- --no-timestamps: omits the HH:MM:SS.mmm prefix every console line otherwise gets ----------
{
  const TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2}\.\d{3} /m;
  const { stdout: withTimestamps } = runPassing(
    `${TFLW} run tests/api/identity/mtls.tflw --env mtlsSidecar --no-color`,
    'default timestamps',
  );
  const { stdout: withoutTimestamps } = runPassing(
    `${TFLW} run tests/api/identity/mtls.tflw --env mtlsSidecar --no-color --no-timestamps`,
    '--no-timestamps',
  );
  ok('default output has an HH:MM:SS.mmm prefix', TIMESTAMP_RE.test(withTimestamps));
  ok('--no-timestamps omits the prefix', !TIMESTAMP_RE.test(withoutTimestamps));
}

// --- `tflw docs` and `tflw spec` (`M195` S4) ------------------------------------------------------
//
// Two read-only verbs no phase had ever run as a process. `docs` prints SPEC.md cheatsheet sections
// cut at build time (`gen-docs.mjs`); `spec` prints the construct manifest, whose `--json` form
// `check-diagnostics` already reads through `readSpec` — so what is graded here is the half nobody
// read: the index lists topics that each open, an unknown topic is refused with a suggestion, and
// the human `spec` rendering names the same count of constructs the JSON carries.
{
  const index = run(`${TFLW} docs`);
  ok('`tflw docs` with no topic exits 0 and prints the index', index.status === 0 && /^tflw docs <topic>/.test(index.stdout), index.stdout.slice(0, 120));
  ok('the index says where the full SPEC lives (`FU-17`)', /the full SPEC lives at https?:\/\//.test(index.stdout));
  // A topic line is an indented slug, optionally followed by its title; group headings are flush left.
  const topics = index.stdout.split('\n').map((l) => /^  ([a-z0-9-]+)(?:\s|$)/.exec(l)?.[1]).filter(Boolean);
  ok(`the index lists topics — ${topics.length}, \`matchers\` among them`, topics.length >= 20 && topics.includes('matchers'), topics.slice(0, 8).join(', '));
  const failing = [];
  for (const t of topics) {
    const r = run(`${TFLW} docs ${t}`);
    const [title, rule] = r.stdout.split('\n');
    if (r.status !== 0 || !title || rule !== '='.repeat(title.length) || r.stdout.trim().split('\n').length < 3) failing.push(`${t} (exit ${r.status})`);
  }
  ok('every listed topic prints its section — a title, its underline, and a body', failing.length === 0, failing.slice(0, 5).join(', '));
  // `run()` returns stdout only; the refusal goes to stderr, so this one is spawned directly.
  const unknown = spawnSync(TFLW_ARGV[0], [...TFLW_ARGV.slice(1), 'docs', 'matcher'], { cwd: ROOT, encoding: 'utf8' });
  ok('an unknown topic is refused (exit 2) with a suggestion and a pointer to the index', unknown.status === 2 && /Did you mean `matchers`/.test(unknown.stderr) && /Run `tflw docs` to list every topic/.test(unknown.stderr), `exit ${unknown.status}: ${(unknown.stderr ?? '').slice(0, 160)}`);

  const spec = run(`${TFLW} spec`);
  const head = /^tflw (\S+) — (\d+) constructs, manifest v(\d+)/.exec(spec.stdout);
  ok('`tflw spec` exits 0 and opens with the version, the construct count and the manifest version', spec.status === 0 && head !== null, spec.stdout.slice(0, 120));
  const json = run(`${TFLW} spec --json`);
  let manifest = null;
  try {
    manifest = JSON.parse(json.stdout);
  } catch {
    // graded below
  }
  ok('`tflw spec --json` is one JSON document with a `build` and a `constructs` array', json.status === 0 && manifest !== null && Array.isArray(manifest.constructs) && typeof manifest.build?.version === 'string', json.stdout.slice(0, 120));
  ok(`the two renderings name the same build and the same count — ${head?.[2]} constructs, manifest v${head?.[3]}`, head !== null && manifest !== null && Number(head[2]) === manifest.constructs.length && head[1] === manifest.build.version && Number(head[3]) === manifest.manifest);
  const families = new Set((manifest?.constructs ?? []).map((c) => c.family));
  ok('the manifest carries the families the sweep reads — step, matcher, generator, diagnostic', ['step', 'matcher', 'generator', 'diagnostic'].every((f) => families.has(f)), [...families].join(', '));
  const missing = (manifest?.constructs ?? []).filter((c) => !spec.stdout.includes(c.name)).map((c) => c.name);
  ok('every construct in the JSON is named in the human rendering', manifest !== null && missing.length === 0, missing.slice(0, 6).join(', '));
}

// --- tflw `M242` (`D1327`, `D1330`): `--tag !x` and `--shard i/n`, each against its control -----
//
// Two plant files whose tests carry `@constructs` and one of `@matchers` / `@language`. The
// exclusion is graded against the same run without it: what disappears must be exactly the tests
// tagged with the excluded tag. The shards are graded against the unsharded run: the two shards'
// tests are disjoint and together are the whole — the one property a CI matrix needs.
{
  const files = 'tests/.constructs/matcher-discrimination.tflw tests/.constructs/language-m242.tflw';
  const ran = () => {
    const report = JSON.parse(readFileSync(path.join(REPORT_DIR, 'results.json'), 'utf8'));
    return report.tests.map((t) => `${t.file}::${t.name}`).sort();
  };
  runPassing(`${TFLW} run ${files} --tag constructs --no-color`, '--tag control (no exclusion)');
  const all = ran();
  runPassing(`${TFLW} run ${files} --tag constructs,!matchers --no-color`, '--tag !matchers');
  const kept = ran();
  const dropped = all.filter((t) => !kept.includes(t));
  ok('--tag !matchers keeps a strict subset of the control', kept.length > 0 && kept.every((t) => all.includes(t)) && dropped.length > 0, `${kept.length} of ${all.length}`);
  ok('what it dropped is exactly the matcher plant', dropped.every((t) => t.includes('matcher-discrimination')) && kept.every((t) => t.includes('language-m242')), dropped.slice(0, 3).join(', '));

  runPassing(`${TFLW} run ${files} --no-color`, '--shard control (unsharded)');
  const whole = ran();
  const one = runPassing(`${TFLW} run ${files} --shard 1/2 --no-color`, '--shard 1/2');
  const first = ran();
  runPassing(`${TFLW} run ${files} --shard 2/2 --no-color`, '--shard 2/2');
  const second = ran();
  ok('--shard names itself in the header', /shard 1\/2: 1 of 2 files/.test(one.stdout), one.stdout.split('\n').find((l) => l.includes('shard')) ?? '(no shard line)');
  ok('the two shards are disjoint', first.every((t) => !second.includes(t)), first.filter((t) => second.includes(t)).join(', '));
  ok('and together are the unsharded run', [...first, ...second].sort().join('|') === whole.join('|'), `${first.length} + ${second.length} against ${whole.length}`);
}

if (violations > 0) {
  console.error(`\n${violations} CLI-flag proof violation(s).`);
  process.exit(1);
}

console.log('\nAll 6 previously-unproven CLI flags behave as documented, `--tag !x` and `--shard` match their controls, and `docs`/`spec` print what they promise.');
