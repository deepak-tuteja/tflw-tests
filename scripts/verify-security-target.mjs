#!/usr/bin/env node
// M128a (testFlow PLAN_M128_PENTEST_TIER1.md, D293 item 5) — assert every claim VULNS.md makes
// against the running stack.
//
// WHY THIS EXISTS AND NOT A ONE-TIME CURL. The plan's gate is "curl each planted route and each
// clean counterpart, confirming the header/cookie facts the ledger claims", and the reason it is
// scripted rather than done once by hand is the reason `verify-safety-flags.mjs` exists: a
// verification nobody re-runs decays into a claim. This one decays faster than most, because the
// thing it guards is a *known-answer ledger* — `M128c` measures the rule pack's precision and
// recall against VULNS.md, and every one of those numbers is only as true as the assumption that
// the target still answers the way the ledger says. A route quietly losing a header would not fail
// any test in this suite; it would silently turn a positive case into a negative one and take the
// acceptance verdict with it.
//
// NOTHING HERE ASSERTS ON tflw. No rule exists yet — the pack is `M128b`/`M128c`. This script
// checks only that the *target* is what the ledger says it is, which is what D2/D27's "the target
// lands first, as its own milestone" is for. Reading a `✗` here means apiV2, nginx or VULNS.md
// changed, never that a rule regressed.
//
// Run it against a stack started WITH the fixture slice:
//
//     VULN_MODE=1 node cli.mjs start
//     node scripts/verify-security-target.mjs
//
// The `VULN_MODE` requirement is checked first and reported as a setup error rather than as five
// failing assertions, because "the slice is absent" and "the slice is wrong" are different
// problems with different fixes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// The seeded identities live in `.env` (gitignored). `docker compose` reads it for free; a plain
// node script does not, so load it explicitly rather than requiring the caller to export ten
// variables by hand.
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // Already-exported variables are equally fine — CI does it that way.
}

const HTTP_BASE = 'http://localhost:4001/v1';
const HTTPS_BASE = 'https://localhost:8443/v1';

// The sidecar's server cert is regenerated per container start from a throwaway CA, so there is no
// stable trust root to point at — the same reasoning `tflw.config`'s `insecure true` records for
// `env secureLocal` and `env mtlsSidecar`. Scoped to this process, which does nothing but talk to
// two localhost ports.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let failures = 0;
let checks = 0;

function ok(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    console.error(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function die(msg) {
  console.error(`\n\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(2);
}

/** One request, reduced to the three things every claim in VULNS.md is about. */
async function probe(base, route, init = {}) {
  let res;
  try {
    res = await fetch(`${base}${route}`, { redirect: 'manual', ...init });
  } catch (err) {
    die(
      `${base}${route} is unreachable (${err.message}). Start the stack first: ` +
        `VULN_MODE=1 node cli.mjs start`,
    );
  }
  return {
    status: res.status,
    header: (name) => res.headers.get(name),
    // `getSetCookie()` keeps multi-cookie responses (session + session_refresh) as separate
    // entries; joining them would make "this cookie has HttpOnly" unanswerable.
    cookies: res.headers.getSetCookie(),
    body: await res.text(),
  };
}

/** The `Set-Cookie` line for one cookie name, or undefined. */
const cookieNamed = (cookies, name) => cookies.find((c) => c.startsWith(`${name}=`));

/** Cookie attributes are case-insensitive and order-free, so match them that way. */
const hasAttr = (cookie, attr) =>
  cookie
    .split(';')
    .slice(1)
    .some((part) => part.trim().toLowerCase() === attr.toLowerCase());

const attrValue = (cookie, attr) => {
  const found = cookie
    .split(';')
    .slice(1)
    .map((p) => p.trim())
    .find((p) => p.toLowerCase().startsWith(`${attr.toLowerCase()}=`));
  return found?.slice(attr.length + 1);
};

async function login(base) {
  const res = await probe(base, '/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.USER_A_EMAIL,
      password: process.env.USER_A_PW,
    }),
  });
  if (res.status !== 200) {
    die(`session-login against ${base} returned ${res.status} — check .env's seeded identities`);
  }
  return res;
}

// ── setup: the fixture slice has to actually be there ────────────────────────────────────────
const slicePresent = await probe(HTTP_BASE, '/vuln/document');
if (slicePresent.status === 404) {
  die(
    'the vuln/ fixture slice is absent — the stack was started without VULN_MODE=1. ' +
      'Restart it with: VULN_MODE=1 node cli.mjs start',
  );
}

// ── V1/V2 — CORS ─────────────────────────────────────────────────────────────────────────────
section('V1 — GET /vuln/cors-wildcard  (positive: sec/cors-wildcard-with-credentials)');
{
  const r = await probe(HTTP_BASE, '/vuln/cors-wildcard');
  ok('Access-Control-Allow-Origin is the wildcard', r.header('access-control-allow-origin') === '*',
    `got ${r.header('access-control-allow-origin')}`);
  ok('Access-Control-Allow-Credentials is true', r.header('access-control-allow-credentials') === 'true');
}

section('V2 — GET /vuln/cors-scoped  (negative: applicable, and correct)');
{
  const r = await probe(HTTP_BASE, '/vuln/cors-scoped');
  const origin = r.header('access-control-allow-origin');
  ok('Access-Control-Allow-Origin is present', origin !== null);
  ok('…and is a named origin, not the wildcard', origin !== '*' && origin === 'https://storefront.example',
    `got ${origin}`);
  ok('Access-Control-Allow-Credentials is true', r.header('access-control-allow-credentials') === 'true');
}

// ── V3 — the weak cookie, on both bases ──────────────────────────────────────────────────────
section('V3 — POST /vuln/weak-cookie  (positive: cookie-not-httponly · samesite-none · not-secure)');
for (const [label, base] of [['http', HTTP_BASE], ['https', HTTPS_BASE]]) {
  const r = await probe(base, '/vuln/weak-cookie', { method: 'POST' });
  const sid = cookieNamed(r.cookies, 'sid');
  ok(`[${label}] sets a sid cookie`, sid !== undefined);
  if (!sid) continue;
  ok(`[${label}] no HttpOnly`, !hasAttr(sid, 'HttpOnly'), sid);
  ok(`[${label}] no Secure`, !hasAttr(sid, 'Secure'), sid);
  ok(`[${label}] SameSite=None`, attrValue(sid, 'SameSite')?.toLowerCase() === 'none', sid);
}

// ── V4/V5 — the documents ────────────────────────────────────────────────────────────────────
section('V4 — GET /vuln/document  (positive: sec/csp-missing · sec/x-frame-options)');
{
  const r = await probe(HTTPS_BASE, '/vuln/document');
  ok('is a document (text/html)', (r.header('content-type') ?? '').includes('text/html'),
    r.header('content-type'));
  ok('no Content-Security-Policy', r.header('content-security-policy') === null);
  ok('no X-Frame-Options', r.header('x-frame-options') === null);
}

section('V5 — GET /vuln/document-hardened  (negative: csp · x-frame · hsts · nosniff · cacheable)');
{
  const r = await probe(HTTPS_BASE, '/vuln/document-hardened');
  ok('is a document (text/html)', (r.header('content-type') ?? '').includes('text/html'));
  ok('Content-Security-Policy present', (r.header('content-security-policy') ?? '').includes("default-src 'self'"));
  ok('X-Frame-Options: DENY', r.header('x-frame-options') === 'DENY');
  ok('X-Content-Type-Options: nosniff', r.header('x-content-type-options') === 'nosniff');
  ok('Strict-Transport-Security present', (r.header('strict-transport-security') ?? '').includes('max-age='));
  ok('Cache-Control: no-store', r.header('cache-control') === 'no-store');
}

// ── the clean app: five rules get both halves from it, with nothing planted ──────────────────
section('clean app over https (8443) — the untouched-app positives');
{
  const r = await probe(HTTPS_BASE, '/health');
  ok('sec/hsts-missing fires: no Strict-Transport-Security', r.header('strict-transport-security') === null);
  ok('sec/nosniff-missing fires: no X-Content-Type-Options', r.header('x-content-type-options') === null);
  ok('sec/server-version-disclosure fires: Server carries a version',
    /^nginx\/\d+\.\d+/.test(r.header('server') ?? ''), `Server: ${r.header('server')}`);
  ok('sec/cookie-* not applicable: no Set-Cookie', r.cookies.length === 0);
  ok('sec/cors-* not applicable: no Access-Control-Allow-Origin', r.header('access-control-allow-origin') === null);
  ok('sec/csp-missing, sec/x-frame-options not applicable: not a document',
    (r.header('content-type') ?? '').includes('application/json'), r.header('content-type'));
}

section('clean app over http (4001) — the direct-to-Express negatives');
{
  const r = await probe(HTTP_BASE, '/health');
  ok('sec/server-version-disclosure negative: no Server header at all', r.header('server') === null,
    `Server: ${r.header('server')}`);
  // Recorded, not asserted either way: VULNS.md flags this as an open rule-authoring question for
  // M128b. Printing the observed value is what lets that decision be made from fact.
  console.log(`  \x1b[2m·\x1b[0m X-Powered-By observed as: ${r.header('x-powered-by') ?? '(absent)'}`);
}

// ── the two real fixes ───────────────────────────────────────────────────────────────────────
section('the session cookie — M128a fix 1 (Secure, scheme-conditional)');
{
  const https = await login(HTTPS_BASE);
  const session = cookieNamed(https.cookies, 'session');
  ok('[https] issues a session cookie', session !== undefined);
  if (session) {
    ok('[https] Secure present — the M128a fix', hasAttr(session, 'Secure'), session);
    ok('[https] HttpOnly present', hasAttr(session, 'HttpOnly'), session);
    ok('[https] SameSite=Lax', attrValue(session, 'SameSite')?.toLowerCase() === 'lax', session);
  }

  const http = await login(HTTP_BASE);
  const plain = cookieNamed(http.cookies, 'session');
  ok('[http] issues a session cookie', plain !== undefined);
  if (plain) {
    // The whole point of making the fix conditional: a `Secure` cookie is not sent back over
    // plaintext, and ~30 files in this suite log in over http.
    ok('[http] Secure ABSENT — the plaintext suite is unaffected', !hasAttr(plain, 'Secure'), plain);
    ok('[http] HttpOnly present', hasAttr(plain, 'HttpOnly'), plain);
  }
}

section('the logout cookie — M128a fix 2 (the clearing Set-Cookie carries the same flags)');
for (const [label, base] of [['http', HTTP_BASE], ['https', HTTPS_BASE]]) {
  const li = await login(base);
  const jar = li.cookies.map((c) => c.split(';')[0]).join('; ');
  const out = await probe(base, '/auth/session-logout', { method: 'POST', headers: { Cookie: jar } });
  ok(`[${label}] logout succeeds`, out.status === 200, `status ${out.status}`);
  const cleared = cookieNamed(out.cookies, 'session');
  ok(`[${label}] logout clears the session cookie`, cleared !== undefined);
  if (cleared) {
    ok(`[${label}] the clearing cookie carries HttpOnly`, hasAttr(cleared, 'HttpOnly'), cleared);
    ok(
      `[${label}] the clearing cookie's Secure matches the scheme`,
      hasAttr(cleared, 'Secure') === (base === HTTPS_BASE),
      cleared,
    );
  }
}

section('sec/authenticated-response-cacheable — the untouched-app positive');
{
  const li = await login(HTTPS_BASE);
  const jar = li.cookies.map((c) => c.split(';')[0]).join('; ');
  const r = await probe(HTTPS_BASE, '/auth/profile', { headers: { Cookie: jar } });
  ok('authenticated request succeeds', r.status === 200, `status ${r.status}`);
  ok('fires: no Cache-Control anywhere in the chain', r.header('cache-control') === null,
    `Cache-Control: ${r.header('cache-control')}`);

  const anon = await probe(HTTPS_BASE, '/health');
  ok('not applicable unauthenticated: /health carries no credentials', anon.status === 200);
}

// ── ledger parity: no route without a row, no row without a route ────────────────────────────
section('VULNS.md parity — every fixture route has a row, and every row has a route');
{
  const controller = readFileSync(path.join(ROOT, 'apiV2/src/vuln/vuln.controller.ts'), 'utf8');
  const ledger = readFileSync(path.join(ROOT, 'VULNS.md'), 'utf8');

  const routes = [...controller.matchAll(/@(?:Get|Post|Put|Patch|Delete)\('([^']+)'\)/g)].map((m) => m[1]);
  ok('the controller declares routes at all', routes.length > 0);
  for (const route of routes) {
    ok(`/vuln/${route} appears in VULNS.md`, ledger.includes(`/v1/vuln/${route}`));
  }

  const ledgerRoutes = [...ledger.matchAll(/\/v1\/vuln\/([a-z-]+)/g)].map((m) => m[1]);
  for (const route of new Set(ledgerRoutes)) {
    ok(`VULNS.md's /vuln/${route} exists in the controller`, routes.includes(route));
  }
}

// ── verdict ──────────────────────────────────────────────────────────────────────────────────
// M126's rule: print the denominator. "0 failed" over a suite that ran two checks reads exactly
// like "0 failed" over one that ran fifty.
console.log('');
if (failures === 0) {
  console.log(`\x1b[32m✓ ${checks} claim(s) checked; VULNS.md matches the running target\x1b[0m`);
} else {
  console.error(`\x1b[31m✗ ${failures} of ${checks} claim(s) failed — VULNS.md and the target disagree\x1b[0m`);
}
process.exit(failures === 0 ? 0 : 1);
