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
import { resolveTflw } from './lib/tflw-bin.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_ENTRY = resolveTflw('released', { label: 'verify-watch' }).entry;
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

function startWatch(extraArgs, env = process.env) {
  const child = spawn('node', [CLI_ENTRY, 'watch', SCRATCH_PATH, '--no-color', ...extraArgs], { cwd: ROOT, env });
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
  // A SECOND ASSERTION USED TO BE HERE and was deleted rather than strengthened (`M128-03`, closed
  // by `M141`). It claimed "the initial run launched a real headed browser", and its predicate was
  // `output.includes('running the full suite') || output.includes('running tests')`. Both halves
  // were empty:
  //
  //   - `'running tests'` appears NOWHERE in tflw's source. It matched nothing, ever.
  //   - `'running the full suite'` is `watchCommand`'s own pre-run label, printed by `runOne`
  //     BEFORE it invokes `runCommand` — so it says a run was about to start, not that a browser
  //     opened.
  //
  // Worse, it was a tautology against its own neighbours: `waitForRunsCompleted(1)` returns only
  // after `watching for changes`, which prints only after `runOne` — so by the time this line ran,
  // its own predicate was already guaranteed true. It could not fail. Nothing about a *headed*
  // browser was ever asserted by it, and the line above already asserts the run passed.
  //
  // What replaces it is at the bottom of this file: a negative control that unsets DISPLAY and
  // requires the run to FAIL. That is the only shape that can distinguish headed from headless,
  // because the difference is not visible in the log — it is visible in whether the browser can
  // open at all.

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

// --- the negative control (M141, D536) ----------------------------------------------------------
//
// `tflw watch` appends `--headed` to every triggered run unconditionally (`watchCommand`'s `runOne`,
// tflw `packages/cli/src/cli.ts`), which is why this script needs a real DISPLAY and why testFlow's
// own CI wraps it in `xvfb-run`. That is a claim about the child process, and the only way to test it
// from out here is to take the display away and require the run to break.
//
// **This assertion is inverted on purpose**: it passes when the watched run FAILS. If tflw ever
// stopped forcing `--headed` — or if this script stopped being the thing that launches a browser —
// the run would succeed without a display and this would go red, which is exactly the notification
// the deleted line above was supposed to give and never could.
//
// The whole `env` is rebuilt rather than mutated: `delete process.env.DISPLAY` would leak into the
// cleanup below and into anything this script is chained after.
{
  const { DISPLAY: _display, ...noDisplay } = process.env;
  writeFileSync(SCRATCH_PATH, INITIAL_CONTENT);
  const blind = startWatch([], noDisplay);
  try {
    await blind.waitForRunsCompleted(1, 90000);
    const passed = /PASS 1\/1 passed/.test(blind.output());
    ok(
      'with DISPLAY unset the watched run FAILS — proving the run above needed a real display, which is what a headed browser means',
      !passed,
      passed ? 'the run passed without a display, so nothing here is launching a headed browser' : '',
    );
  } catch (error) {
    // A timeout is also a pass for this control: no display, no browser, no completed cycle. Said
    // out loud rather than swallowed, because "it threw" and "it asserted" must not look alike.
    ok('with DISPLAY unset the watched run never completes a cycle — same conclusion, by timeout', true, String(error.message).slice(0, 80));
  } finally {
    await blind.stop();
    if (existsSync(SCRATCH_PATH)) unlinkSync(SCRATCH_PATH);
  }
}

if (violations > 0) {
  console.error(`\n${violations} watch-mode proof violation(s).`);
  process.exit(1);
}

console.log('\ntflw watch behaves as documented against the real webV2 storefront.');
