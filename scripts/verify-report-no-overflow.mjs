#!/usr/bin/env node
// PLAN_REPORT_OVERFLOW.md: tflw's report.html used to let a long unbroken token (a JWT — every
// auth.tflw test produces one) force its container wider than the page, dragging the *whole*
// page sideways with it (sidebar included) instead of scrolling just that one line. Fixed
// upstream in tflw (packages/reporter/src/html.ts — `.detail`/`.error`/`.phead`/`table.headers
// td` now all get `overflow-wrap:anywhere`), proven there by a synthetic-report unit test. This
// script re-proves it against the *real* vendored build's actual output — auth.tflw already
// produces real bearer JWTs in its report today, no synthetic fixture needed — confirming the fix
// survived the full tflw build+pack+vendor pipeline (`npm run refresh-tflw`), not just the TS
// source. Same "don't introduce a new raw-browser-launch pattern" reasoning as every other script
// in this directory: no script here launches Playwright directly even though it's a
// devDependency (only real `tflw`-driven browser steps do) — a string check against the real
// emitted report.html's embedded stylesheet is the consistent, cheap proof.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPORT_PATH = path.join(ROOT, 'report', 'report.html');

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

console.log('Running tests/api/identity/auth.tflw (produces real bearer JWTs in report.html) ...');
execSync('npx tflw run tests/api/identity/auth.tflw --no-color', { cwd: ROOT, stdio: 'inherit' });

const html = readFileSync(REPORT_PATH, 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
ok('report.html has an embedded <style> block', style.length > 0);

for (const selector of ['.detail', '.error', '.phead', 'table.headers td']) {
  const rule = style.match(new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\{([^}]*)\\}`));
  ok(`${selector} rule exists`, Boolean(rule));
  if (rule) {
    ok(`${selector} sets overflow-wrap:anywhere`, /overflow-wrap:anywhere/.test(rule[1]));
  }
}

// pre.body must stay unwrapped — it's formatted JSON with its own overflow-x:auto scroll.
const preBodyRule = style.match(/pre\.body\{([^}]*)\}/);
ok('pre.body rule exists', Boolean(preBodyRule));
if (preBodyRule) {
  ok('pre.body does NOT set overflow-wrap (must stay unwrapped, formatted JSON)', !/overflow-wrap/.test(preBodyRule[1]));
  ok('pre.body still has overflow-x:auto', /overflow-x:auto/.test(preBodyRule[1]));
}

// A real bearer JWT should actually be present in this report (auth.tflw always issues one) —
// otherwise the checks above would be vacuously true against a report with nothing long to wrap.
ok('report.html actually contains a long unbroken token (this proof isn\'t vacuous)', /eyJ[A-Za-z0-9_-]{40,}/.test(html));

if (violations > 0) {
  console.error(`\n${violations} report-overflow violation(s).`);
  process.exit(1);
}

console.log('\nreport.html wraps every free-form-text container that can carry an unbroken long token — no whole-page horizontal scroll.');
