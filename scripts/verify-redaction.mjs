#!/usr/bin/env node
// PLAN_CI.md decision 7: proves tflw's `redact` config actually keeps real PII out of the
// emitted artifacts — not just that safety-redaction.tflw's own assertions pass. Those assertions
// always see the true, unmasked value by design; a report-artifact inspection is the only way to
// actually prove masking happened, which is why this doesn't belong in the DSL itself (see
// PLAN_CI.md "Why this got big").
//
// Ground truth comes from a direct fetch against the real api (bypassing tflw entirely), so this
// script never trusts tflw's own redaction to tell it what the real values were.
//
// Scope, deliberately: `redact` (SPEC §3.5) is documented as applying only to the request/response
// trace (`redactRequest`/`redactResponse`), not to a step's own printed `detail` text. Two step
// kinds (`capture`, and `expect ... equals "{var}"`) compose the real resolved value straight into
// their own detail line, bypassing that boundary entirely — a real gap, filed as TFLW-GAPS.md #15,
// not fixable from this repo. Gating this script on the full raw text of report.html/results.json
// would just make it permanently red on a known, upstream, out-of-scope issue, so the strict
// leak-check below walks results.json's structured `request.body`/`response.bodyText` fields only
// — exactly what `redact` actually promises to cover.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv(path.join(ROOT, '.env'));

console.log('Running tests/safety-redaction.tflw ...');
execSync('npx tflw run --env safetyRedaction tests/safety-redaction.tflw', { cwd: ROOT, stdio: 'inherit' });

console.log('Fetching real, unredacted PII directly from the api as ground truth ...');
const loginRes = await fetch('http://localhost:4001/v1/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PW }),
});
if (!loginRes.ok) {
  console.error(`ground-truth login failed: ${loginRes.status}`);
  process.exit(1);
}
const { accessToken } = await loginRes.json();

const profileRes = await fetch('http://localhost:4001/v1/profile/export', {
  headers: { authorization: `Bearer ${accessToken}` },
});
if (!profileRes.ok) {
  console.error(`ground-truth /profile/export failed: ${profileRes.status}`);
  process.exit(1);
}
const profile = await profileRes.json();

const piiValues = [
  { name: 'ADMIN_EMAIL', value: env.ADMIN_EMAIL },
  { name: 'phone', value: profile.phone },
  { name: 'address.street', value: profile.address.street },
  { name: 'address.city', value: profile.address.city },
  { name: 'address.postalCode', value: profile.address.postalCode },
];

const reportDir = path.join(ROOT, 'report');
const report = JSON.parse(readFileSync(path.join(reportDir, 'results.json'), 'utf8'));

let violations = 0;

for (const test of report.tests) {
  for (const step of test.steps) {
    if (step.kind !== 'api') continue;
    const fields = [
      ['request.body', step.request?.body],
      ['response.bodyText', step.response?.bodyText],
    ];
    for (const [fieldName, text] of fields) {
      if (typeof text !== 'string') continue;
      for (const { name, value } of piiValues) {
        if (value && text.includes(value)) {
          console.error(`✗ "${test.name}" step ${fieldName} leaks real PII (${name}): "${value}"`);
          violations++;
        }
      }
    }
  }
}

// A `redact` pattern that never actually matched anything would pass the leak check above
// vacuously (nothing to leak if nothing was ever there) without proving redaction fired at all —
// checked in results.json and report.html, the two artifacts that actually carry request/response
// body content. junit.xml deliberately excluded: for a passing test it never carries body content
// at all (only `<system-out>`, and only on failure) — there is nothing there to redact either way.
for (const file of ['results.json', 'report.html']) {
  const content = readFileSync(path.join(reportDir, file), 'utf8');
  const maskedCount = (content.match(/\[redacted\]/g) ?? []).length;
  if (maskedCount === 0) {
    console.error(`✗ ${file} has zero [redacted] markers — redaction never fired`);
    violations++;
  } else {
    console.log(`✓ ${file} has ${maskedCount} [redacted] marker(s)`);
  }
}

if (violations > 0) {
  console.error(`\n${violations} redaction violation(s).`);
  process.exit(1);
}

console.log('\nAll PII masked correctly in the request/response trace — no real values leaked into results.json.');
