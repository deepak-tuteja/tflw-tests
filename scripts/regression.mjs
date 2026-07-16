#!/usr/bin/env node
// Full regression sweep: runs the whole suite, then each feature-area tag alone, then `@smoke`
// alone, then each smoke+area cross-axis combo — everything M17-M20's manual verification passes
// already exercised by hand, scripted so it runs the same way every time (M21).
//
// Every phase gets its own fresh Docker restart first. Necessary, not just cautious: `unique(...)`
// resets its counter each `tflw run` invocation, but Postgres data persists across invocations —
// chaining phases on the same DB reproduces the exact "unique(...)-email/data collision" false
// failures this project has already hit and documented twice (PROGRESS.md M20, M21). A phase's
// result is only trustworthy in isolation.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const AREA_TAGS = ['identityOps', 'catalogOps', 'orderOps', 'adminOps'];

const PHASES = [
  { name: 'full suite', args: [] },
  ...AREA_TAGS.map((tag) => ({ name: `--tag ${tag}`, args: ['--tag', tag] })),
  { name: '--tag smoke', args: ['--tag', 'smoke'] },
  ...AREA_TAGS.map((tag) => ({ name: `--tag smoke,${tag}`, args: ['--tag', `smoke,${tag}`] })),
];

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function restart() {
  run('node cli.mjs stop');
  run('node cli.mjs start');
}

const results = [];
for (const phase of PHASES) {
  console.log(`\n=== ${phase.name} (fresh restart) ===\n`);
  restart();
  const cmd = ['npx', 'tflw', 'run', '--no-color', ...phase.args].join(' ');
  try {
    run(cmd);
    results.push({ ...phase, ok: true });
  } catch {
    results.push({ ...phase, ok: false });
  }
}

console.log('\n=== regression summary ===');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.log(`\n${failed.length}/${results.length} phase(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} phases passed.`);
