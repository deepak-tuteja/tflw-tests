#!/usr/bin/env node
// M50 (PLAN_WEBV2_M45.md): `tflw pick` had only one manual, non-scripted verification pass
// (PROGRESS.md's M42 checklist) — every other CLI verb that can be scripted at all
// (migrate/watch, and now this) got a regression-phase script. `pick` is deliberately manual by
// design (M42/decision 2): it opens a real, visible browser and waits for a human to click
// something, and there's no CDP endpoint exposed to script a real click against it from outside
// (startPickSession/BrowserManager, testFlow's cli.ts/browser.ts, launch no `--remote-debugging-
// port`) — driving an actual click here would mean adding a new capability to tflw itself, out of
// scope for this "small cleanup batch" milestone. What *is* legitimately scriptable, and wasn't
// scripted before this: that the command launches for real, connects to this project's real
// target, and exits cleanly on Ctrl+C — the same smoke-level proof verify-watch.mjs already gives
// `tflw watch`, mirrored here.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_ENTRY = path.join(ROOT, 'node_modules', 'tflw', 'dist', 'cli.cjs');
const TARGET_URL = 'http://localhost:8090/';

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

const child = spawn('node', [CLI_ENTRY, 'pick', TARGET_URL], { cwd: ROOT });
let out = '';
child.stdout.on('data', (d) => (out += d.toString()));
child.stderr.on('data', (d) => (out += d.toString()));
let exitCode = null;
const exited = new Promise((resolve) => {
  child.on('exit', (code) => {
    exitCode = code;
    resolve();
  });
});

const start = Date.now();
while (!out.includes('click any element to print its locator')) {
  if (Date.now() - start > 30000) {
    child.kill('SIGKILL');
    ok('the session launches and opens the real target', false, `timed out; output so far:\n${out}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 100));
}
ok('the session launches and reports opening the real target', out.includes(`opening ${TARGET_URL}`));

// No sleep here any more (tflw M105, review `M104-02`). This used to wait a fixed 2000ms because
// the banner it waits on above printed *before* `startPickSession` was even called, so the banner
// meant "about to launch", not "ready" — and tflw's own SIGINT handler only attached once the
// launch had resolved. A Ctrl+C inside that window was reported back as `error: page.goto: …` and
// exit 2 (`EXIT_USAGE`, "could not run"), which is how this check went red on run 31198662574 and
// passed on rerun of the identical commit. The 2000ms was a wall-clock guess at a cold CI runner's
// browser launch, which is exactly why the failure was intermittent rather than constant.
//
// `pick` now prints two lines — `opening <url>` before the launch, `ready — click any element …`
// after it — so the loop above is a genuine readiness wait and the sleep has nothing left to do.
// Ctrl+C is also handled from the first line onward, so an early signal is no longer a failure
// mode this script has to steer around.
child.kill('SIGINT');
await Promise.race([exited, new Promise((r) => setTimeout(r, 15000))]);
if (exitCode === null) child.kill('SIGKILL');
ok(
  'Ctrl+C (SIGINT) stops cleanly (exit 0 or 130, the standard signal-death code)',
  exitCode === 0 || exitCode === 130,
  // The child's output, not just the number. When this failed in CI it printed a bare `exit 2` and
  // discarded the `error:` line that said why, so the mechanism had to be re-derived from source
  // instead of read off the log.
  `exit ${exitCode}; output:\n${out.trim()}`,
);

if (violations > 0) {
  console.error(`\n${violations} pick-session proof violation(s).`);
  process.exit(1);
}
console.log('\ntflw pick launches against this project\'s real target and exits cleanly, as documented.');
