#!/usr/bin/env node
// M42 (PLAN_WEBV2_M40.md decision 3): durable proof for `tflw migrate` — mirrors
// verify-cli-flags.mjs's pattern (real assertions against real output, not a one-time manual
// check trusted forever). Grammar has been additive-only since v0.1.0, so today this is a real
// no-op proof: the whole real suite genuinely has nothing to migrate, and the command mutates
// nothing on disk while saying so. Becomes a real mutating-migration assertion the day tflw ships
// its first deprecation (decision 3's own note).
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

const before = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
const stdout = execSync('node node_modules/tflw/dist/cli.cjs migrate --no-color', { cwd: ROOT, encoding: 'utf8' });
const after = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });

ok('reports nothing to migrate (grammar has been additive-only since v0.1.0)', stdout.includes('no deprecated syntax found — nothing to migrate.'), stdout.trim());
ok('mutates nothing on disk when there is nothing to migrate', before === after, `git status before/after differ`);

if (violations > 0) {
  console.error(`\n${violations} migrate proof violation(s).`);
  process.exit(1);
}

console.log('\ntflw migrate behaves as documented against the real suite.');
