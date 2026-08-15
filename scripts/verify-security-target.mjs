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

// ── M130a helpers: JSON over bearer auth ─────────────────────────────────────────────────────
//
// V1–V5 needed only headers, so `probe` above returns the body as text and nothing parses it.
// V6–V9 are claims about *which resource* came back, so they need the body as data and they need
// to be made as a named principal. Bearer rather than cookie throughout, and not for convenience:
// `AnyAuthGuard` demands an `X-CSRF-Token` matching the session token's own claim on every mutating
// request made with a cookie, so a cookie-borne `DELETE` (V8) or `PUT` (V9) would be refused for
// CSRF *before* the authorization check this section is about. See VULNS.md's CSRF caveat — and
// note that this is the same fact the acceptance corpus turns into evidence, where the cookie
// principal's refusal is reported `inconclusive` rather than skipped.
let counter = 0;

/** One JSON request as an optional bearer principal; body parsed when it parses. */
async function json(base, route, { method = 'GET', token, body } = {}) {
  const res = await probe(base, route, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    parsed = undefined;
  }
  return { status: res.status, body: parsed, raw: res.body };
}

/** An access token for a seeded identity, or a setup failure — never a silent undefined. */
async function bearerLogin(label, email, password) {
  const res = await json(HTTP_BASE, '/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (res.status !== 200 || !res.body?.accessToken) {
    die(`bearer login for ${label} returned ${res.status} — check .env's seeded identities`);
  }
  return res.body.accessToken;
}

/** An order owned by whoever holds `token`, or undefined with the failure already reported. */
async function placeOrder(token, productId) {
  const res = await json(HTTP_BASE, '/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId, quantity: 1 }] },
  });
  ok('an order can be placed for the fixture product', res.status === 201,
    `status ${res.status} ${res.raw?.slice(0, 200)}`);
  return res.body?.id;
}

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

// ── V6–V9 — broken object authorization (M130a D317; V9 added by M132b D356) ──────────────────
//
// A different kind of claim from everything above, and the assertions have to be built differently
// because of it. V1–V5 are facts about one response's own headers, so one curl answers each. A BOLA
// fixture is a fact about *two* principals and a resource that belongs to one of them, so this
// section has to manufacture the resource first: an admin creates a dedicated product, user A
// places an order with it, and user B — who owns nothing here — is the non-owner every probe below
// is made as.
//
// The dedicated product mirrors what `tests/api/identity/authz.tflw` does and for the same reason:
// grabbing whatever `GET /products` sorts first risks colliding with some other test's
// low-remaining-stock item.
//
// **Every clean counterpart is asserted beside its plant.** The plant alone would prove only that
// the route leaks; what makes the pair a known-answer ledger entry is that the real route, asked
// the identical question by the identical caller, refuses. Those are the negative cases tflw's
// acceptance bar reads, and nothing else in this repo asserts them.
section('V6–V9 setup — a dedicated product, an order owned by user A, and a non-owner');
const authz = {};
{
  const adminToken = await bearerLogin('admin', process.env.ADMIN_EMAIL, process.env.ADMIN_PW);
  authz.owner = await bearerLogin('user A (the owner)', process.env.USER_A_EMAIL, process.env.USER_A_PW);
  authz.peer = await bearerLogin('user B (the non-owner)', process.env.USER_B_EMAIL, process.env.USER_B_PW);
  authz.admin = adminToken;

  const categories = await json(HTTP_BASE, '/categories');
  ok('categories are seeded', Array.isArray(categories.body) && categories.body.length > 0);
  const categoryId = categories.body?.[0]?.id;

  const product = await json(HTTP_BASE, '/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: `Authz Fixture Widget ${process.pid}-${counter++}`,
      price: 10,
      stock: 10,
      categoryId,
    },
  });
  ok('admin can create the fixture product', product.status === 201, `status ${product.status}`);

  authz.productId = product.body?.id;
  authz.orderId = await placeOrder(authz.owner, authz.productId);
  ok("user A's order was placed", authz.orderId !== undefined);
}

section('V6 — GET /vuln/orders/:id  (positive: sec/authz-object-leak)');
if (authz.orderId) {
  const leak = await json(HTTP_BASE, `/vuln/orders/${authz.orderId}`, { token: authz.peer });
  ok('a non-owner gets 200', leak.status === 200, `status ${leak.status}`);
  ok("…and the body is user A's order, by id", leak.body?.id === authz.orderId,
    `got id ${leak.body?.id}`);
  // The oracle tflw will use compares resource identity, so the fixture has to leak an object that
  // is identifiable as the owner's — not merely a 200 with some plausible order in it.
  ok('…carrying the owner\'s user id, so it is genuinely their row', typeof leak.body?.userId === 'string');
  ok('…with items expanded, as the owner would have received', Array.isArray(leak.body?.items));

  const anon = await json(HTTP_BASE, `/vuln/orders/${authz.orderId}`);
  ok('unauthenticated is still 401 — the plant is broken authz, not a public route',
    anon.status === 401, `status ${anon.status}`);

  const missing = await json(HTTP_BASE, '/vuln/orders/00000000-0000-4000-8000-000000000000',
    { token: authz.peer });
  ok('a bad id is 404, not a leak — exactly one defect is planted', missing.status === 404,
    `status ${missing.status}`);
}

section('V6 clean counterpart — GET /orders/:id refuses the same caller');
if (authz.orderId) {
  const denied = await json(HTTP_BASE, `/orders/${authz.orderId}`, { token: authz.peer });
  ok('the real route answers 403 to a non-owner', denied.status === 403, `status ${denied.status}`);
  ok('…with the ownership message, not a role message',
    /not your order/i.test(JSON.stringify(denied.body)), JSON.stringify(denied.body));

  const anon = await json(HTTP_BASE, `/orders/${authz.orderId}`);
  ok('…and 401 with no credentials at all', anon.status === 401, `status ${anon.status}`);

  // The D307 case, and the reason a status-code oracle cannot do this tier's job: a non-owning
  // principal that legitimately receives the owner's order, byte-identically.
  const asAdmin = await json(HTTP_BASE, `/orders/${authz.orderId}`, { token: authz.admin });
  ok('an admin — non-owning — legitimately gets 200 (tflw D307 privileged)',
    asAdmin.status === 200, `status ${asAdmin.status}`);
  ok("…and it is the same order, so only a privilege declaration separates it from V6",
    asAdmin.body?.id === authz.orderId);
}

section('V7 — GET /vuln/orders  (positive: sec/authz-collection-leak)');
if (authz.orderId) {
  const leak = await json(HTTP_BASE, '/vuln/orders', { token: authz.peer });
  ok('a non-owner gets 200', leak.status === 200, `status ${leak.status}`);
  ok('…and an array', Array.isArray(leak.body));
  ok("…containing user A's order id", (leak.body ?? []).some((o) => o.id === authz.orderId));
}

section("V7 clean counterpart — GET /orders returns only the caller's own");
if (authz.orderId) {
  const own = await json(HTTP_BASE, '/orders', { token: authz.peer });
  ok('a non-owner gets 200 here too — the status is identical to V7', own.status === 200,
    `status ${own.status}`);
  ok("…and the array does NOT contain user A's order id",
    !(own.body ?? []).some((o) => o.id === authz.orderId));
  // Stronger than "user A's one order is absent": every row it *did* return belongs to the caller.
  // The weaker check would pass against a route that filtered out exactly one order by accident.
  const me = await json(HTTP_BASE, '/auth/profile', { token: authz.peer });
  ok('the caller can be identified', typeof me.body?.id === 'string');
  ok('…and every order returned belongs to them',
    (own.body ?? []).every((o) => o.userId === me.body?.id),
    `${(own.body ?? []).filter((o) => o.userId !== me.body?.id).length} foreign order(s)`);
}

section('V8 — DELETE /vuln/orders/:id  (positive: sec/authz-object-leak, mutating)');
{
  // Its own order, because this one really is destroyed.
  const victimId = await placeOrder(authz.owner, authz.productId);
  ok('a second order was placed to be destroyed', victimId !== undefined);
  if (victimId) {
    const gone = await json(HTTP_BASE, `/vuln/orders/${victimId}`, {
      method: 'DELETE',
      token: authz.peer,
    });
    ok('a non-owner can delete it', gone.status === 200, `status ${gone.status}`);
    ok('…and the response names the id it destroyed', gone.body?.id === victimId);

    // The damage is real, which is the entire argument for tflw's `probe mutating` opt-in being
    // default-off: a probe that succeeds here has destroyed state the rest of a suite may depend on.
    const after = await json(HTTP_BASE, `/orders/${victimId}`, { token: authz.owner });
    ok('…and the owner can no longer read their own order (404) — the deletion was real',
      after.status === 404, `status ${after.status}`);
  }
}

section('V8 clean counterpart — the real API has no DELETE /orders/:id at all');
if (authz.orderId) {
  const noRoute = await json(HTTP_BASE, `/orders/${authz.orderId}`, {
    method: 'DELETE',
    token: authz.peer,
  });
  // 404 here is "no such route" rather than "no such order" — Nest's router has no handler. Worth
  // asserting rather than assuming: it confirms the plant is not shadowing or overriding a real
  // route, only sitting beside one.
  ok('DELETE /orders/:id is 404 (no handler), so V8 shadows nothing',
    noRoute.status === 404, `status ${noRoute.status}`);
  const stillThere = await json(HTTP_BASE, `/orders/${authz.orderId}`, { token: authz.owner });
  ok("…and user A's order survived the attempt", stillThere.status === 200,
    `status ${stillThere.status}`);
}

// ── V9 — the mutating plant a replay oracle can actually judge (M132b, D356) ──────────────────
//
// V8 proves `probe mutating` reaches the request. It cannot prove the tier reaches a *verdict*,
// because destruction removes the thing a replay would compare. This route is the same defect on
// an idempotent verb, and the claims below are chosen to pin the two properties the oracle needs
// and V8's route cannot offer: the response identifies the owner's order, and the row is still
// there afterwards for a probe to ask about.
section('V9 — PUT /vuln/orders/:id  (positive: sec/authz-object-leak, mutating and idempotent)');
{
  const targetId = await placeOrder(authz.owner, authz.productId);
  ok('a third order was placed, owned by user A', targetId !== undefined);
  if (targetId) {
    const write = { method: 'PUT', token: authz.peer, body: { status: 'processing' } };
    const leak = await json(HTTP_BASE, `/vuln/orders/${targetId}`, write);
    ok('a non-owner can write to it', leak.status === 200, `status ${leak.status}`);
    ok("…and the body is user A's order, by id", leak.body?.id === targetId,
      `got id ${leak.body?.id}`);
    ok("…carrying the owner's user id, so the leak is identifiable as theirs",
      typeof leak.body?.userId === 'string');
    ok('…and the write was real, not a read wearing a PUT', leak.body?.status === 'processing',
      `status field ${leak.body?.status}`);

    // **The property V8 lacks, asserted rather than assumed.** A replay oracle compares the owner's
    // response with each probe's; that only works if replaying leaves the resource where it was.
    const again = await json(HTTP_BASE, `/vuln/orders/${targetId}`, write);
    ok('replaying it is idempotent — same id, same resulting state',
      again.status === 200 && again.body?.id === targetId && again.body?.status === 'processing',
      `status ${again.status}, state ${again.body?.status}`);

    const survived = await json(HTTP_BASE, `/orders/${targetId}`, { token: authz.owner });
    ok('…and the owner can still read their own order — nothing was destroyed, which is exactly why a probe can judge this and not V8',
      survived.status === 200, `status ${survived.status}`);

    const anon = await json(HTTP_BASE, `/vuln/orders/${targetId}`, {
      method: 'PUT',
      body: { status: 'processing' },
    });
    ok('unauthenticated is still 401 — the plant is broken authz, not an open route',
      anon.status === 401, `status ${anon.status}`);

    const bad = await json(HTTP_BASE, `/vuln/orders/${targetId}`, {
      method: 'PUT',
      token: authz.peer,
      body: { status: 'not-a-real-status' },
    });
    ok('an unknown status is 400, not a leak — exactly one defect is planted',
      bad.status === 400, `status ${bad.status}`);
  }
}

section('V9 clean counterpart — the real idempotent write refuses the same caller');
if (authz.orderId) {
  // `PATCH /orders/:id/items/:itemId` is the app's own owner-scoped mutation, and it is the exact
  // counterpart rather than an approximate one: `updateItem` (`orders.service.ts:442`) calls the
  // same `findOneScoped` that guards `GET /orders/:id`. One check refuses a non-owner on both the
  // read and the write, and V9 is that check's absence.
  const owned = await json(HTTP_BASE, `/orders/${authz.orderId}`, { token: authz.owner });
  const itemId = owned.body?.items?.[0]?.id;
  ok("the owner's order has an item to write to", typeof itemId === 'string');
  if (itemId) {
    const denied = await json(HTTP_BASE, `/orders/${authz.orderId}/items/${itemId}`, {
      method: 'PATCH',
      token: authz.peer,
      body: { quantity: 2 },
    });
    ok('the real route answers 403 to a non-owner', denied.status === 403,
      `status ${denied.status}`);
    ok('…with the ownership message, so the refusal is authorization and not validation',
      /not your order/i.test(JSON.stringify(denied.body)), JSON.stringify(denied.body));

    const byOwner = await json(HTTP_BASE, `/orders/${authz.orderId}/items/${itemId}`, {
      method: 'PATCH',
      token: authz.owner,
      body: { quantity: 2 },
    });
    ok('…and 200 for the owner, so the 403 above is about who asked, not about the request',
      byOwner.status === 200, `status ${byOwner.status}`);
  }
}

// ── M134c: the Tier 3 input-handling plants (V10–V14) ────────────────────────────────────────
//
// These rows are graded by a *detector*, not by a rule name, so the assertions below check the
// exact property each detector reads rather than "the route answered". A `V10` that served JSON,
// a `V11` that echoed the path instead of the file, or a `V12` whose error reached the global
// filter would each be a live route with a green smoke test and no coverage behind it.
//
// The negative halves matter as much: this section asserts which payloads *do not* fire, because
// VULNS.md claims one firing payload per plant rather than a whole class, and a claim like that
// decays silently the moment the target starts erroring on something else.
section('V10–V14 — the Tier 3 input-handling plants');
{
  // -- V10: reflection, and the content type is the plant ------------------------------------
  const control = await probe(HTTP_BASE, '/vuln/lookup?q=shoes');
  ok('V10 answers 200', control.status === 200, `status ${control.status}`);
  ok(
    'V10 serves text/html — `sec/reflected-input-unescaped` declines a JSON echo, so this is the plant',
    (control.header('content-type') ?? '').includes('text/html'),
    control.header('content-type') ?? '(none)',
  );

  const reflected = await probe(HTTP_BASE, `/vuln/lookup?q=${encodeURIComponent('<tflw>')}`);
  ok(
    'V10 reflects `<tflw>` with its angle brackets intact',
    reflected.body.includes('<tflw>'),
    reflected.body.slice(0, 120),
  );

  // The 64 KiB query, measured rather than assumed (testFlow D400). Node's default
  // `--max-http-header-size` is 16 KiB and the request line counts toward it, so the `oversized`
  // payload cannot reach this handler at all. Asserted here so that if a future Node or a
  // `--max-http-header-size` flag changes it, the ledger's "431" sentence goes red instead of
  // quietly becoming false.
  const oversizedQuery = await probe(HTTP_BASE, `/vuln/lookup?q=${'A'.repeat(64 * 1024)}`);
  ok(
    'a 64 KiB query is refused with 431 before reaching V10 — the oversized class cannot fire on a query site',
    oversizedQuery.status === 431,
    `status ${oversizedQuery.status}`,
  );

  // -- V14: the escaped twin, which is what makes the reflection rule's silence a measurement -----
  //
  // The pair is a controlled comparison and these assertions are what keep it one. If `V14` ever
  // stopped serving markup it would go *not applicable* rather than quiet, and the coverage table
  // would silently lose a cell while every test stayed green — so the content type is asserted
  // exactly as `V10`'s is, and the escaping is asserted on both sides: the entity present, the raw
  // metacharacters absent.
  const escapedControl = await probe(HTTP_BASE, '/vuln/lookup-escaped?q=shoes');
  ok('V14 answers 200', escapedControl.status === 200, `status ${escapedControl.status}`);
  ok(
    'V14 serves text/html too — otherwise the rule goes not-applicable and demonstrates the wrong state',
    (escapedControl.header('content-type') ?? '').includes('text/html'),
    escapedControl.header('content-type') ?? '(none)',
  );

  const escaped = await probe(
    HTTP_BASE,
    `/vuln/lookup-escaped?q=${encodeURIComponent('<tflw>')}`,
  );
  ok(
    'V14 escapes `<tflw>` to `&lt;tflw&gt;`',
    escaped.body.includes('&lt;tflw&gt;'),
    escaped.body.slice(0, 120),
  );
  ok(
    'V14 leaves no raw angle bracket from the payload — the half that makes the finding absent',
    !escaped.body.includes('<tflw>'),
    escaped.body.slice(0, 120),
  );

  // -- V11: traversal, and only the relative payload escapes ----------------------------------
  const item = await probe(HTTP_BASE, '/vuln/items/7');
  ok('V11 answers 200 for its own item', item.status === 200, `status ${item.status}`);
  ok(
    "V11's id is digit-shaped, so tflw recognises it as an identifier segment at all",
    item.body.includes('seventh'),
    item.body.slice(0, 80),
  );

  const traversed = await probe(
    HTTP_BASE,
    `/vuln/items/${encodeURIComponent('../../../../etc/passwd')}`,
  );
  ok(
    'V11 reads /etc/passwd on the relative traversal payload',
    traversed.status === 200 && /(^|\n)root:[^:\n]*:0:0:/.test(traversed.body),
    `status ${traversed.status}, body ${traversed.body.slice(0, 60)}`,
  );

  // The three variants that must NOT escape. This handler does no `../` stripping and no second
  // decode, so a filter-defeating payload has nothing to defeat — which is the honest answer and
  // the reason VULNS.md claims one payload rather than the traversal class.
  for (const [label, payload] of [
    ['percent-encoded', '..%2f..%2f..%2f..%2fetc%2fpasswd'],
    ['doubled-dot-slash', '....//....//....//....//etc/passwd'],
    ['absolute', '/etc/passwd'],
  ]) {
    const res = await probe(HTTP_BASE, `/vuln/items/${encodeURIComponent(payload)}`);
    ok(
      `V11 404s on the ${label} traversal variant — it escapes nothing here`,
      res.status === 404,
      `status ${res.status}`,
    );
  }

  // -- V12/V13: one route, two leaves, two rules ----------------------------------------------
  const note = await json(HTTP_BASE, '/vuln/notes', {
    method: 'POST',
    body: { text: 'hello', title: 'a note' },
  });
  ok('V12/V13 answer 201 to an ordinary body', note.status === 201, `status ${note.status}`);
  ok(
    'the control body discloses nothing — the disclosure rule subtracts the control, so this must hold',
    !note.raw.includes('QueryFailedError'),
    note.raw.slice(0, 120),
  );

  const quoted = await json(HTTP_BASE, '/vuln/notes', {
    method: 'POST',
    body: { text: "tflw'", title: 'a note' },
  });
  ok(
    'V12 leaks the ORM exception class name on an unbalanced single quote',
    quoted.raw.includes('QueryFailedError'),
    `status ${quoted.status}, body ${quoted.raw.slice(0, 120)}`,
  );
  // The wording check is deliberately inverted: it asserts that the Postgres phrasing is NOT the
  // `syntax error at or near` literal tflw's SQL detector carries. That is why the plant is keyed
  // on the class name, and if a future Postgres starts saying "syntax error" this line going red
  // is the signal that the reasoning in VULNS.md needs revisiting — not that anything broke.
  ok(
    "…and it is the class name doing the work: Postgres says 'unterminated quoted string', not 'syntax error at or near'",
    !quoted.raw.includes('syntax error at or near'),
    quoted.raw.slice(0, 160),
  );

  for (const [label, text] of [
    ['a double quote', 'tflw"'],
    ['a trailing semicolon', 'tflw;'],
  ]) {
    const res = await json(HTTP_BASE, '/vuln/notes', {
      method: 'POST',
      body: { text, title: 'a note' },
    });
    ok(
      `V12 does NOT fire on ${label} — it is valid inside a single-quoted SQL literal`,
      res.status === 201 && !res.raw.includes('QueryFailedError'),
      `status ${res.status}`,
    );
  }

  const oversized = await json(HTTP_BASE, '/vuln/notes', {
    method: 'POST',
    body: { text: 'hello', title: 'A'.repeat(64 * 1024) },
  });
  ok(
    'V13 accepts a 64 KiB title with 201 — no bound refused it, which is the whole finding',
    oversized.status === 201 && oversized.body?.titleLength === 64 * 1024,
    `status ${oversized.status}, titleLength ${oversized.body?.titleLength}`,
  );

  const confused = await json(HTTP_BASE, '/vuln/notes', {
    method: 'POST',
    body: { text: 1234567890, title: 'a note' },
  });
  ok(
    'a type-confusion payload is refused 422 with no disclosure — the pipe works, so the class yields no positive',
    confused.status === 422 && !confused.raw.includes('QueryFailedError'),
    `status ${confused.status}`,
  );
}

// ── ledger parity: no route without a row, no row without a route ────────────────────────────
section('VULNS.md parity — every fixture route has a row, and every row has a route');
{
  const ledger = readFileSync(path.join(ROOT, 'VULNS.md'), 'utf8');

  // M130a: two controllers now, and the second one's routes carry a path parameter. Both halves of
  // this check had to widen for it, and the narrower versions would have failed *open* rather than
  // loudly — `@Get(':id')` on a controller this loop never read is a route with no row, reported as
  // nothing at all. A parity check that cannot see half the routes is the vacuous shape this file's
  // own header warns about.
  //
  // The prefix comes from `@Controller('…')` rather than being assumed to be `vuln`, so a fixture
  // controller mounted somewhere else is still checked against the ledger under its real path.
  //
  // M134c adds the third. This list is hand-maintained and that is its known weakness — a fourth
  // controller added without a line here is invisible to both halves of the parity check, which is
  // exactly the fail-open shape the paragraph above describes. It stays a list rather than a
  // directory scan only because `vuln/` also holds `vuln.module.ts` and `dto/`, and a scan that
  // had to exclude those would encode the same assumption less visibly.
  const controllers = [
    'vuln/vuln.controller.ts',
    'vuln/vuln-orders.controller.ts',
    'vuln/vuln-input.controller.ts',
  ];
  const routes = [];
  for (const file of controllers) {
    const src = readFileSync(path.join(ROOT, 'apiV2/src', file), 'utf8');
    const prefix = /@Controller\('([^']+)'\)/.exec(src)?.[1];
    ok(`${file} declares a @Controller prefix`, prefix !== undefined);
    if (!prefix) continue;
    // `@Get()` with no argument is the collection route — the prefix itself.
    for (const m of src.matchAll(/@(?:Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)/g)) {
      routes.push(m[1] ? `${prefix}/${m[1]}` : prefix);
    }
  }
  ok('the fixture controllers declare routes at all', routes.length > 0);
  for (const route of new Set(routes)) {
    ok(`/v1/${route} appears in VULNS.md`, ledger.includes(`/v1/${route}`));
  }

  // `:` and `/` join the character class so `orders/:id` survives; the trailing `(?![\w:/-])`
  // stops `/v1/vuln/orders` from also matching the prefix of `/v1/vuln/orders/:id` and reporting a
  // route that was never declared.
  const ledgerRoutes = [...ledger.matchAll(/\/v1\/(vuln\/[a-z:/-]+)(?![\w:/-])/g)].map((m) => m[1]);
  for (const route of new Set(ledgerRoutes)) {
    ok(`VULNS.md's /v1/${route} exists in a fixture controller`, routes.includes(route));
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
