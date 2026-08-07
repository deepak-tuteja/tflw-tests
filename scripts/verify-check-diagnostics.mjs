#!/usr/bin/env node
// M49 (PLAN_WEBV2_M45.md): `tests/.checkonly/` only covered 3 of 22 assigned TF0xx codes
// (TF011/TF014/TF028), manually run per its own header comments, never wired into
// regression.mjs/CI. Durable, repeatable proof for every remaining code: 13 via static fixtures
// under `tests/.checkonly/` (checked against this project's own real `tflw.config`, same as the
// 3 pre-existing fixtures), and 7 config-dialect codes (TF020-025, TF029) via inline fixture
// content written to a throwaway scratch directory and checked there — `tflw.config` is always
// read from `cwd` (`packages/cli/src/cli.ts`), so the config dialect's own diagnostics can't be
// triggered against a real file living inside this project without breaking the whole suite.
// TF004-009/TF017-019 are reserved, not assigned — nothing to dogfood there (SPEC.md).
//
// DRIFT CLOSED (M86, 2026-08-04). The closing line used to read "All N assigned TF0xx codes" where
// N was `Object.keys(...).length` — this script's own fixture count, not the count of codes tflw
// assigns. The two were equal at M49 and stopped being equal the next time tflw added a code, and
// the sentence went on claiming completeness for a year of milestones: at the point this was
// noticed, `TF033`/`TF034`/`TF035` had no fixture at all and the line still said "all". A
// completeness claim with nothing enforcing it is not a strong claim that might be stale — it is
// already stale, and it is exactly the class of defect the launch review was opened to find.
//
// The repair is `assignedCodes()` below: the expected list is read out of the *installed tflw
// bundle's* own §17 manifest, so adding a code to tflw and not dogfooding it here fails this
// script. tflw's `packages/lang/test/diagnosticsCoverage.test.ts` (M86) is the other half — it
// keeps that manifest in step with `Codes`, which is what makes it worth reading.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_ENTRY = path.join(ROOT, 'node_modules', 'tflw', 'dist', 'cli.cjs');

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

// Both streams, whatever the exit code — and `spawnSync` rather than `execFileSync` for exactly
// that reason. `execFileSync` hands back **stdout only** on success and reaches stderr solely via
// the thrown error, so the old success branch here could return `''` and be right: every shipped
// diagnostic was error-severity, so anything that reported also exited 2 and took the catch.
//
// tflw M97e/D147 ended that. `TF043`'s run tier is a **warning**, written to stderr at exit 0, so
// a fixture whose only diagnostic is a warning would have had its output discarded and been
// reported here as not reporting its code — a loud failure, but one blaming tflw for a defect in
// this script. The guard is supposed to be the thing that can be trusted when the two disagree.
function runCheck(args, opts = {}) {
  const { stdout, stderr } = spawnSync('node', [CLI_ENTRY, 'check', '--no-color', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  return (stdout ?? '') + (stderr ?? '');
}

// --- test-dialect codes: real fixtures under tests/.checkonly/, checked against the real project
// tflw.config (same as the 3 pre-existing fixtures, now also wired in here rather than only ever
// run by hand per their own header comments) ------------------------------------------------------
const FILE_FIXTURES = {
  TF001: 'stray-character.tflw',
  TF002: 'unterminated-string.tflw',
  TF003: 'bad-indent.tflw',
  TF010: 'missing-path.tflw',
  TF011: 'bad-keyword.tflw',
  TF012: 'unknown-method.tflw',
  TF013: 'unknown-subject.tflw',
  TF014: 'unknown-matcher.tflw',
  TF015: 'empty-block-body.tflw',
  TF016: 'bare-toplevel-step.tflw',
  TF026: 'unknown-api-service.tflw',
  TF027: 'unknown-table-column.tflw',
  TF028: 'bad-session.tflw',
  TF030: 'unbound-variable.tflw',
  TF031: 'request-and-response-combined.tflw',
  TF032: 'malformed-upload-type.tflw',
  TF033: 'workload-without-threshold.tflw',
  TF034: 'threshold-unknown-label.tflw',
  TF035: 'duplicate-action.tflw',
  TF037: 'unknown-call.tflw',
  TF038: 'call-wrong-arity.tflw',
  TF039: 'assert-before-any-request.tflw',
  TF040: 'call-in-dead-position.tflw',
  TF041: 'value-subject-misplaced.tflw',
  TF042: 'matcher-subject-mismatch.tflw',
  TF043: 'missing-referenced-file.tflw',
  TF044: 'action-call-cycle.tflw',
  TF045: 'unbalanced-bracket.tflw',
  TF046: 'empty-tag.tflw',
  TF047: 'unknown-escape.tflw',
  TF048: 'tab-indent.tflw',
  TF049: 'hidden-character.tflw',
};

for (const [code, file] of Object.entries(FILE_FIXTURES)) {
  const out = runCheck([`tests/.checkonly/${file}`]);
  ok(`${code}: tests/.checkonly/${file} reports ${code}`, out.includes(`[${code}]`), out.trim().split('\n')[0]);
}

// --- config-dialect codes: inline fixture content, own scratch tflw.config per case -------------
const CONFIG_FIXTURES = {
  TF020: 'env local default\n  api "http://localhost:4001"\n  headr "Accept" is "application/json"\n',
  TF021: 'env local default\n  api "http://localhost:4001"\n\ntest "not allowed here"\n  api GET /health\n',
  TF022: 'workers 3\n\nenv local default\n  api "http://localhost:4001"\n',
  TF023: 'defaults\n  timeout step 5x\n\nenv local default\n  api "http://localhost:4001"\n',
  TF024: 'env local default\n  api "http://localhost:4001"\n\nenv other default\n  api "http://localhost:4002"\n',
  TF025: 'defaults\n  web "http://localhost:8090"\n\nenv local default\n  api "http://localhost:4001"\n',
  TF029:
    'env local default\n  api "http://localhost:4001"\n\nsession admin\n  api POST /auth/login body { email: "a@a.com", password: "x" }\n\nsession admin\n  api POST /auth/login body { email: "a@a.com", password: "x" }\n',
  // tflw M85 (review cluster C1 / `A4-10`): the active env's own base URL against its own
  // `allow hosts`. It has to be the *default* env here — the check is env-scoped, and this script
  // runs `tflw check` with no `--env`.
  TF036: 'env local default\n  api "http://localhost:4001"\n  allow hosts "example.com"\n',
};

const scratchDir = mkdtempSync(path.join(tmpdir(), 'tflw-check-config-'));
try {
  for (const [code, content] of Object.entries(CONFIG_FIXTURES)) {
    writeFileSync(path.join(scratchDir, 'tflw.config'), content);
    const out = runCheck([], { cwd: scratchDir });
    ok(`${code}: a scratch tflw.config reports ${code}`, out.includes(`[${code}]`), out.trim().split('\n')[0]);
  }
} finally {
  rmSync(scratchDir, { recursive: true, force: true });
}

// --- completeness: the expected list comes from tflw, not from this file ------------------------

/**
 * Every TF0xx code the *installed* tflw assigns, read out of the shipped bundle's own SPEC §17
 * manifest (`DIAGNOSTICS` in `@tflw/lang`'s `spec-data.ts`, inlined into `dist/cli.cjs` by esbuild
 * — `{ code: "TF001", meaning: …, example: … }`). `code:` followed by a quoted `TF` number is that
 * manifest and nothing else; SPEC prose elsewhere in the bundle mentions codes in running text, not
 * in that shape.
 *
 * Reading a bundle with a regex is the least appealing part of this script, and it is still the
 * right trade: tflw publishes exactly one file with one `bin` entry and no library export, so the
 * alternatives are a new public API existing only for this test (the `runLoad` mistake — a public
 * export with no production caller), or a second hand-maintained list of codes, which is precisely
 * the thing that drifted. If the bundle shape ever changes, this throws loudly by design: fix the
 * pattern, do not delete the guard.
 */
function assignedCodes() {
  const bundle = readFileSync(CLI_ENTRY, 'utf8');
  const codes = new Set([...bundle.matchAll(/\bcode:\s*["'](TF\d{3})["']/g)].map((m) => m[1]));
  if (codes.size === 0) {
    throw new Error(
      `could not read tflw's diagnostic manifest out of ${CLI_ENTRY}. The bundle's shape changed — ` +
        'update the pattern in assignedCodes() (see @tflw/lang spec-data.ts DIAGNOSTICS). Do not ' +
        'drop this check: without it the summary below is a claim about this file, not about tflw.',
    );
  }
  return codes;
}

const dogfooded = new Set([...Object.keys(FILE_FIXTURES), ...Object.keys(CONFIG_FIXTURES)]);
const assigned = assignedCodes();

const uncovered = [...assigned].filter((code) => !dogfooded.has(code)).sort();
ok(
  `completeness: every TF0xx code the installed tflw assigns has a fixture here`,
  uncovered.length === 0,
  uncovered.length ? `no fixture for ${uncovered.join(', ')} — add one under tests/.checkonly/ (test dialect) or CONFIG_FIXTURES (config dialect)` : '',
);

const stale = [...dogfooded].filter((code) => !assigned.has(code)).sort();
ok(
  `completeness: every fixture here names a code the installed tflw still assigns`,
  stale.length === 0,
  stale.length ? `${stale.join(', ')} is dogfooded but no longer in tflw's manifest — the code was retired; delete the fixture` : '',
);

if (violations > 0) {
  console.error(`\n${violations} check-diagnostic proof violation(s).`);
  process.exit(1);
}
console.log(
  `\nAll ${assigned.size} TF0xx diagnostic codes the installed tflw assigns are dogfooded against a real \`tflw check\`` +
    ` (${Object.keys(FILE_FIXTURES).length} test-dialect fixtures, ${Object.keys(CONFIG_FIXTURES).length} config-dialect).`,
);
