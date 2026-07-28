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
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

function runCheck(args, opts = {}) {
  try {
    execFileSync('node', [CLI_ENTRY, 'check', '--no-color', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    return '';
  } catch (err) {
    return (err.stdout ?? '') + (err.stderr ?? '');
  }
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

const total = Object.keys(FILE_FIXTURES).length + Object.keys(CONFIG_FIXTURES).length;
if (violations > 0) {
  console.error(`\n${violations} check-diagnostic proof violation(s).`);
  process.exit(1);
}
console.log(`\nAll ${total} assigned TF0xx diagnostic codes dogfooded against a real \`tflw check\`.`);
