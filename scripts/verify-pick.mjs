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

// The banner prints *before* `startPickSession` is even called (pickCommand, testFlow's cli.ts) —
// its own `process.on('SIGINT', ...)` handler only attaches once that resolves (real browser
// launched, real page navigated). Sending SIGINT the instant the banner appears races ahead of
// that and hits Node's default unhandled-signal kill instead of the graceful `session.close()`
// path this check actually wants to prove — a real person could never click that fast either.
await new Promise((r) => setTimeout(r, 2000));

child.kill('SIGINT');
await Promise.race([exited, new Promise((r) => setTimeout(r, 15000))]);
if (exitCode === null) child.kill('SIGKILL');
ok('Ctrl+C (SIGINT) stops cleanly (exit 0 or 130, the standard signal-death code)', exitCode === 0 || exitCode === 130, `exit ${exitCode}`);

if (violations > 0) {
  console.error(`\n${violations} pick-session proof violation(s).`);
  process.exit(1);
}
console.log('\ntflw pick launches against this project\'s real target and exits cleanly, as documented.');
