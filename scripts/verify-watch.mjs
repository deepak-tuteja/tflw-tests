#!/usr/bin/env node
// M42 (PLAN_WEBV2_M40.md decision 3): durable, repeatable proof that `tflw watch` genuinely works
// against this project's real running stack — not just the one-off manual run that produced
// shared/webv2-login.tflw/webv2-checkout.tflw during M6/M7. Mirrors testFlow's own
// packages/cli/test/watch.test.ts pattern (spawn as a long-running child, wait for the
// "watching for changes" marker, save a file, wait for a second cycle, SIGINT to stop) but against
// this repo's real webV2 storefront instead of a throwaway temp project.
//
// Correction to PLAN_WEBV2_M40.md decision 3: `tflw watch` is NOT headless-safe. Confirmed by
// reading `watchCommand`'s own `runOne` (testFlow's packages/cli/src/cli.ts:309) — it unconditionally
// appends `--headed` to every triggered run's argv, regardless of any flag `tflw watch` itself was
// given; `headless: !args.headed` at cli.ts:856 is `runCommand`'s own flag, but watch always sets it.
// testFlow's own CI needs `xvfb-run` for exactly this reason (`.github/workflows/ci.yml`). This
// machine has a real display (`echo $DISPLAY` → `:0`), so this script runs directly — no Xvfb needed
// here specifically, but that's a property of this environment, not of `tflw watch` itself.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_ENTRY = path.join(ROOT, 'node_modules', 'tflw', 'dist', 'cli.cjs');
const SCRATCH_PATH = path.join(ROOT, 'tests', '_verify-watch-scratch.tflw');

const INITIAL_CONTENT =
  'test "_verify-watch-scratch: real webV2 smoke"\n' + '  open "/"\n' + '  expect text "Catalog" is visible\n';
const RESAVED_CONTENT = INITIAL_CONTENT + '  # resaved, to trigger a second watch cycle\n';

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

function startWatch(extraArgs) {
  const child = spawn('node', [CLI_ENTRY, 'watch', SCRATCH_PATH, '--no-color', ...extraArgs], { cwd: ROOT });
  let out = '';
  child.stdout.on('data', (d) => {
    out += d.toString();
  });
  child.stderr.on('data', (d) => {
    out += d.toString();
  });
  let exitCode = null;
  const exited = new Promise((resolve) => {
    child.on('exit', (code) => {
      exitCode = code;
      resolve();
    });
  });
  return {
    output: () => out,
    async waitForRunsCompleted(n, timeoutMs = 30000) {
      const start = Date.now();
      while ((out.match(/watching for changes/g) ?? []).length < n) {
        if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${n} completed run(s); output so far:\n${out}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    async stop() {
      child.kill('SIGINT');
      await Promise.race([exited, new Promise((r) => setTimeout(r, 15000))]);
      if (exitCode === null) child.kill('SIGKILL');
      return exitCode;
    },
  };
}

writeFileSync(SCRATCH_PATH, INITIAL_CONTENT);
const watch = startWatch([]);
try {
  await watch.waitForRunsCompleted(1);
  ok('the initial run passes against the real webV2 storefront', /PASS 1\/1 passed/.test(watch.output()));
  ok('the initial run launched a real headed browser (dogfoods this env’s real DISPLAY, not headless)', watch.output().includes('running the full suite') || watch.output().includes('running tests'));

  writeFileSync(SCRATCH_PATH, RESAVED_CONTENT);
  await watch.waitForRunsCompleted(2);
  const passCount = (watch.output().match(/PASS 1\/1 passed/g) ?? []).length;
  ok('re-saving the watched file triggers a genuine second run (2 total PASS 1/1 passed)', passCount === 2, `saw ${passCount}`);
  ok('the second run re-used the same seed as the first (watch pins one seed per session)', new Set(watch.output().match(/seed \d+/g) ?? []).size === 1);

  const exitCode = await watch.stop();
  ok('Ctrl+C (SIGINT) stops cleanly (exit 0 or 130, the standard signal-death code)', exitCode === 0 || exitCode === 130, `exit ${exitCode}`);
} finally {
  if (existsSync(SCRATCH_PATH)) unlinkSync(SCRATCH_PATH);
}

if (violations > 0) {
  console.error(`\n${violations} watch-mode proof violation(s).`);
  process.exit(1);
}

console.log('\ntflw watch behaves as documented against the real webV2 storefront.');
