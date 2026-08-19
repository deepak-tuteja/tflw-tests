#!/usr/bin/env node
// M50 (PLAN_WEBV2_M45.md): explicit `screenshot "<name>"` (SPEC §13) had zero dogfood anywhere —
// every screenshot this suite ever captured before was an implicit failure-screenshot. Proves the
// step genuinely attaches real PNG bytes to its own step in results.json (ScreenshotAsset.base64,
// testFlow's types.ts) — not just that the DSL line parses and the test happens to still pass.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tflwCommand } from './lib/tflw-bin.mjs';

/** `released`: this script grades the tflw a user would have installed, which is what
 *  `npx tflw` resolved here before M141 — the program is unchanged, the question is now
 *  declared and the entry is printed instead of inferred. */
const TFLW = tflwCommand('released', { label: 'verify-screenshot-step' });

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RESULTS_PATH = path.join(ROOT, 'report', 'results.json');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

execSync(
  `${TFLW} run --only "row-scoped add-to-cart on a page of a dozen identical buttons, with its async toast" --no-color tests/mixed/storefront.tflw`,
  { cwd: ROOT, stdio: 'inherit' },
);

const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
const test = results.tests.find((t) => t.name.startsWith('row-scoped add-to-cart'));
ok('the test ran', test !== undefined);

const step = test?.steps.find((s) => s.kind === 'screenshot');
ok('a `screenshot` step is present in the report', step !== undefined);
ok('it carries a real ScreenshotAsset (base64 field present)', typeof step?.screenshot?.base64 === 'string' && step.screenshot.base64.length > 0);

if (step?.screenshot?.base64) {
  const bytes = Buffer.from(step.screenshot.base64, 'base64');
  ok('the captured bytes are a genuine PNG (real signature, not placeholder text)', bytes.subarray(0, 8).equals(PNG_SIGNATURE), `first bytes: ${bytes.subarray(0, 8).toString('hex')}`);
}

if (violations > 0) {
  console.error(`\n${violations} screenshot-step proof violation(s).`);
  process.exit(1);
}
console.log('\n`screenshot "<name>"` attaches a real PNG to its own step, as documented.');
