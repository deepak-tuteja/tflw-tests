// `M197` (tflw `D1026`–`D1028`): the four phase groups at once, one stack each.
//
// The serial sweep costs 42 minutes on the box and about 28 of them are the stack's fresh restart
// before every phase — the isolation model (`regression.mjs`'s head comment, `D822`) is right and the
// price of paying it in series is not. CI has run the groups apart on four runners since PLAN_CI
// decision 16; this is the same partition on one machine: worker `k` gets `PHASE_GROUPS`' k-th group, a `COMPOSE_PROJECT_NAME`
// of its own, every host port offset by `100·k` (`stack-ports.mjs`, read by the compose file,
// `cli.mjs`, `tflw.config` through tflw's `env NAME default "…"` override, and the phase scripts),
// and **a copy of the tree** — because nineteen phase scripts read `report/` and twelve write into the tree, and one
// tree cannot host two phases at once. The copy is for the filesystem; the ports come from the
// environment, and the same tree runs serially with no copy at all.
//
// Not a pool. A pool of stacks with phases queued would balance better than four fixed groups,
// and it would also be a second scheduler beside CI's partition that the guards below do not
// cover; a box result should read leg-for-leg against a CI leg. If `tooling` grows, rebalance
// the groups — CI's wall benefits from that too.
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { ARCHIVE_DIR, ROOT } from './regression-shared.mjs';
import { stackEnv } from './stack-ports.mjs';

const WORKERS_DIR = path.join(ROOT, '.regression-workers');

/** What a worker's copy leaves out: build products, git, this directory, and every report — the
 *  worker writes its own `report/` and `report-by-phase/` and the parent merges the latter back. */
const EXCLUDE = ['node_modules', '.git', '.regression-workers', 'report', 'report-by-phase', 'runs', 'coverage'];

function makeWorkerTree(group) {
  const dir = path.join(WORKERS_DIR, group);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const excludes = EXCLUDE.map((e) => `--exclude=/${e}`).join(' ');
  execSync(`rsync -a ${excludes} ${JSON.stringify(ROOT + '/')} ${JSON.stringify(dir + '/')}`, { stdio: 'inherit' });
  // The installed packages are read-only to a sweep; one copy serves four workers.
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  // `resolveTflw('branch')` (the security and input corpora) finds the sibling checkout at
  // `../testFlow` relative to the tree it runs in; from a worker that is `.regression-workers/
  // testFlow`, so the real sibling is linked there once for every worker to share.
  const sibling = path.join(ROOT, '..', 'testFlow');
  const link = path.join(WORKERS_DIR, 'testFlow');
  if (existsSync(sibling) && !existsSync(link)) symlinkSync(sibling, link, 'dir');
  return dir;
}

/** Run one group in its own tree and stack; resolve with its exit code and its summary lines. */
function runWorker(group, k, script, extraArgs) {
  const dir = makeWorkerTree(group);
  // `TFLW_SOURCE_ROOT` (tflw D1032): a SARIF result anchors repo-relative, and a copy without
  // `.git` would anchor to `.regression-workers/<g>/…` under the real repository's root.
  const env = { ...process.env, ...stackEnv(100 * k), COMPOSE_PROJECT_NAME: `tflw-${group}`, TFLW_REGRESSION_WORKER: group, TFLW_SOURCE_ROOT: dir };
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(dir, 'scripts', path.basename(script)), '--group', group, ...extraArgs], {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const summary = [];
    let inSummary = false;
    const relay = (stream, isErr) => {
      let buf = '';
      stream.on('data', (chunk) => {
        buf += chunk.toString();
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line === '=== regression summary ===') inSummary = true;
          else if (inSummary && /^[✓✗⊘] /.test(line)) summary.push(line);
          (isErr ? process.stderr : process.stdout).write(`[${group}] ${line}\n`);
        }
      });
      stream.on('end', () => { if (buf) (isErr ? process.stderr : process.stdout).write(`[${group}] ${buf}\n`); });
    };
    relay(child.stdout, false);
    relay(child.stderr, true);
    child.on('close', (code) => resolve({ group, code: code ?? 1, summary, dir, env, wallMs: Date.now() - started }));
  });
}

/** Move a worker's `report-by-phase/<phase>` dirs under the parent's, so the archive looks as the
 *  serial run's does, and drop the worker tree. */
function mergeArchive(worker) {
  // The serial runner leaves the last phase's stack up for the next restart to replace; four
  // project-named stacks would stay up for good, so each worker's comes down with its tree.
  try {
    execSync('node cli.mjs stop', { cwd: worker.dir, env: worker.env, stdio: 'ignore' });
  } catch {
    /* a stack that is already down is the state wanted */
  }
  const from = path.join(worker.dir, 'report-by-phase');
  if (existsSync(from)) {
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    for (const name of readdirSync(from)) {
      const target = path.join(ARCHIVE_DIR, name);
      rmSync(target, { recursive: true, force: true });
      renameSync(path.join(from, name), target);
    }
  }
  rmSync(worker.dir, { recursive: true, force: true });
}

const fmt = (ms) => `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`;

/**
 * Run every group at once. `groups` is `PHASE_GROUPS`; `phaseOrder` is `PHASES`' names so the
 * combined summary prints in the order the serial sweep would. Returns the exit code.
 */
export async function runParallelGroups({ groups, phaseOrder, script, extraArgs = [] }) {
  const names = Object.keys(groups);
  console.log(`=== parallel groups: ${names.join(', ')} — one stack each, ports offset by 100·k, one tree each under .regression-workers/ ===\n`);
  rmSync(ARCHIVE_DIR, { recursive: true, force: true });
  const started = Date.now();
  const workers = await Promise.all(names.map((g, i) => runWorker(g, i + 1, script, extraArgs)));
  for (const w of workers) mergeArchive(w);
  rmSync(WORKERS_DIR, { recursive: true, force: true });

  const byPhase = new Map();
  for (const w of workers) for (const line of w.summary) byPhase.set(line.slice(2).replace(/ \(skipped.*$/, ''), { line, group: w.group });
  console.log('\n=== regression summary ===');
  for (const name of phaseOrder) {
    const hit = byPhase.get(name);
    if (hit) console.log(`${hit.line}  [${hit.group}]`);
  }
  for (const w of workers) console.log(`${w.code === 0 ? '✓' : '✗'} group ${w.group}: exit ${w.code}, ${fmt(w.wallMs)}`);
  console.log(`sweep wall ${fmt(Date.now() - started)} across ${workers.length} stacks`);
  const failed = workers.filter((w) => w.code !== 0);
  if (failed.length > 0) {
    console.log(`\n${failed.length} group(s) failed: ${failed.map((w) => w.group).join(', ')}.`);
    return 1;
  }
  const measured = [...byPhase.values()].filter((h) => !h.line.startsWith('⊘')).length;
  console.log(`\nAll ${measured} phases passed, in ${workers.length} groups at once.`);
  return 0;
}
