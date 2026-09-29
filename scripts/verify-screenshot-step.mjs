#!/usr/bin/env node
// M50 (PLAN_WEBV2_M45.md): explicit `screenshot "<name>"` (SPEC §13) had zero dogfood anywhere —
// every screenshot this suite ever captured before was an implicit failure-screenshot. Proves the
// step genuinely attaches real PNG bytes to its own step in results.json (ScreenshotAsset.base64,
// testFlow's types.ts) — not just that the DSL line parses and the test happens to still pass.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  `${TFLW} run --only "row-scoped add-to-cart on a search-filtered catalog row, with its async toast" --no-color tests/mixed/storefront.tflw`,
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

// ---------------------------------------------------------------------------------------------
// `T-5b` (tflw `PLAN_M247_DOGFOOD_WHOLE_PRODUCT.md`): the two browser-evidence flags nothing here
// had run. `--trace` keeps a trace on a GREEN run — the case it exists for, since a failure keeps
// one anyway — and `--update-snapshots` rewrites a baseline the board no longer matches.

const PROMO = 'tests/ui/storefront/promo.tflw';
// `--only` takes the declared name exactly, so the whole of it.
const PROMO_TEST = "the promo clock is masked out of the page's snapshot, and without the mask the page never matches";
const runPromo = (flags) =>
  spawnSync(`${TFLW} run --only "${PROMO_TEST}" --no-color ${flags} ${PROMO}`, { cwd: ROOT, shell: true, encoding: 'utf8' });
const promoResult = () => JSON.parse(readFileSync(RESULTS_PATH, 'utf8')).tests.find((t) => t.name === PROMO_TEST);

// 1. `--trace` on a run that passes: the archive exists, is a zip, and holds a Playwright trace.
const traced = runPromo('--trace');
ok('the promo test passes as written (the control every step below depends on)', traced.status === 0, traced.stdout + traced.stderr);
const tracePath = promoResult()?.trace?.path;
ok('`--trace` kept a trace for the passing test', typeof tracePath === 'string', JSON.stringify(promoResult()?.trace));
if (typeof tracePath === 'string') {
  const zipPath = path.join(ROOT, 'report', tracePath);
  const zip = existsSync(zipPath) ? readFileSync(zipPath) : Buffer.alloc(0);
  ok('the trace file is on disk where results.json says', zip.length > 0, zipPath);
  ok('it is a zip archive (`PK\\x03\\x04`)', zip.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])));
  ok('it holds a Playwright trace (a `.trace` entry `npx playwright show-trace` opens)', zip.includes(Buffer.from('.trace')));
}
// And its control: the same passing run without the flag keeps none.
runPromo('');
ok('without `--trace` a passing test keeps no trace (so the flag is what kept it)', promoResult()?.trace === undefined, JSON.stringify(promoResult()?.trace));

// 2. `--update-snapshots` on a changed board. The masked baseline is swapped for the unmasked one —
//    same page, same size, the clock drawn in — so the compare runs and fails on real pixels. Both
//    committed baselines are restored whatever happens below.
const SNAP_DIR = path.join(ROOT, 'tests/ui/storefront/snapshots/tests-ui-storefront-promo-tflw/the-promo-clock-is-masked-out-of-the-page-s-snapshot-and-without-the-mask-the-page-never-matches');
const masked = path.join(SNAP_DIR, 'promo-masked.png');
const unmasked = path.join(SNAP_DIR, 'promo-unmasked.png');
const original = { masked: readFileSync(masked), unmasked: readFileSync(unmasked) };
try {
  writeFileSync(masked, original.unmasked);
  const changed = runPromo('');
  ok('against a changed baseline the snapshot step fails', changed.status !== 0);
  const failing = promoResult()?.steps.find((s) => s.snapshotDiff);
  ok('and renders the triptych — baseline, actual and diff', Boolean(failing?.snapshotDiff?.baseline && failing?.snapshotDiff?.actual && failing?.snapshotDiff?.diff), JSON.stringify(failing?.snapshotDiff ? Object.keys(failing.snapshotDiff) : null));

  const updated = runPromo('--update-snapshots');
  ok('`--update-snapshots` passes the same run', updated.status === 0, updated.stdout + updated.stderr);
  ok('and rewrote the baseline (it is no longer the planted one)', !readFileSync(masked).equals(original.unmasked));

  const again = runPromo('');
  ok('the next run, with no flag, is green against the rewritten baseline', again.status === 0, again.stdout + again.stderr);
} finally {
  writeFileSync(masked, original.masked);
  writeFileSync(unmasked, original.unmasked);
}

if (violations > 0) {
  console.error(`\n${violations} screenshot-step proof violation(s).`);
  process.exit(1);
}
console.log('\n`screenshot "<name>"` attaches a real PNG to its own step; `--trace` keeps a trace on a green run; `--update-snapshots` rewrites a changed baseline.');
