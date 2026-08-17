#!/usr/bin/env node
// `npm run verify:security-acceptance` — D295's measurement (testFlow M128c,
// PLAN_M128_PENTEST_TIER1.md).
//
// `tflw-acceptance/security/` is a corpus that goes red when a rule stops behaving. This is the
// thing that says *which* rule, and it is the difference between "the suite is green" and a
// coverage claim. It runs the corpus against the real stack and compares the exact set of rule ids
// each response produced against the ledger below — precision (nothing fired that should not have)
// and recall (everything that should have, did), per rule, not per severity band.
//
// ## Why a script and not just assertions
//
// The DSL can assert "this response has at least one critical violation" and "this response has
// none". It cannot assert *which rule*, and it cannot assert the third state at all: `expect
// response has no security violations` passes identically whether a rule ran and found nothing or
// never ran. Applicability is the state a boolean cannot express (D284) and therefore the one a
// corpus silently stops covering, so measuring it needs something that reads the report.
//
// ## What this can and cannot see, stated rather than implied
//
// | state | how it is measured | exact? |
// | --- | --- | --- |
// | **fires** | the rule id appears in the failure listing | yes |
// | **silent** | the rule was in play at that floor and did not appear | yes |
// | **not applicable** | only when D285's no-power-to-fail listing prints, which names every rule and its unmet precondition | for the cases where a floor isolates them |
//
// The third row is a genuine limit of the run report, not of this script: on a *passing* assertion
// the report carries the counts (`12 rules — 5 applicable, 7 not applicable, 0 violations`) but not
// which seven. This script therefore prints, at the end, exactly which rules' not-applicable case it
// verified by name and which it did not — a coverage claim with a silent gap in it is the thing
// this whole milestone is about.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const corpus = join(repoRoot, 'tflw-acceptance', 'security');

/** The pack, mirrored from `securityRules.ts`. Duplicated on purpose: if tflw reorders or re-grades
 * a rule, this file disagreeing is the signal. A grader that imported the thing it grades would
 * agree with it by construction. */
const PACK = [
  ['sec/cookie-not-httponly', 'critical'],
  ['sec/cookie-not-secure', 'critical'],
  ['sec/cors-wildcard-with-credentials', 'critical'],
  ['sec/hsts-missing', 'serious'],
  ['sec/csp-missing', 'serious'],
  ['sec/tls-version-old', 'serious'],
  ['sec/tls-weak-cipher', 'serious'],
  ['sec/x-frame-options', 'moderate'],
  ['sec/cookie-samesite-none', 'moderate'],
  ['sec/nosniff-missing', 'moderate'],
  ['sec/authenticated-response-cacheable', 'moderate'],
  ['sec/server-version-disclosure', 'minor'],
];
const RANK = { minor: 0, moderate: 1, serious: 2, critical: 3 };
const inPlay = (floor) => PACK.filter(([, sev]) => (floor ? RANK[sev] >= RANK[floor] : true)).map(([id]) => id);

/** Tier 2's pack, mirrored from `authzRules.ts` for the same reason `PACK` mirrors
 * `securityRules.ts`: a grader that imported the thing it grades would agree with it by
 * construction. Separate from `PACK` and not merged into it — the two are *different packs* with
 * different applicability rules and different `considered` counts, and a row graded against the
 * wrong one produces a confident wrong answer rather than an error (M130c). */
const AUTHZ_PACK = [
  ['sec/authz-object-leak', 'critical'],
  ['sec/authz-collection-leak', 'critical'],
  // M137b (D434). **The pack is 3 on every authorization assertion, not only where a `csrf from`
  // clause exists.** Pack membership cannot vary with config — `SCAN_RULE_IDS` and
  // `SCAN_RULE_SEVERITY` are projections of it (D406) — so the rule is always considered and reports
  // not-applicable with its own reason when no owning session declares the clause, exactly as the two
  // leak rules do on a response of the wrong shape. Every `applicable`/`not applicable` count in the
  // authz rows below moved by one because of this, and each was re-read from the run.
  ['sec/csrf-not-enforced', 'critical'],
];
const authzInPlay = (floor) =>
  AUTHZ_PACK.filter(([, sev]) => (floor ? RANK[sev] >= RANK[floor] : true)).map(([id]) => id);

/**
 * The known-answer ledger, keyed by the test name in the corpus. `fires` is the **exact** set for
 * that assertion's floor — a rule that fires and is not listed here is a precision failure, and one
 * that is listed and does not fire is a recall failure. Kept in sync with `VULNS.md` by hand, and
 * that is the point: a row here with no row there is how the two drift.
 */
const LEDGER = [
  // --- secureLocal (https://localhost:8443) ---
  { env: 'secureLocal', test: 'sec/cors-wildcard-with-credentials fires on `*` plus credentials (V1)', floor: 'critical', fires: ['sec/cors-wildcard-with-credentials'] },
  { env: 'secureLocal', test: 'the cookie-flag rules fire on a cookie with no HttpOnly, no Secure and SameSite=None (V3)', floor: 'critical', fires: ['sec/cookie-not-httponly', 'sec/cookie-not-secure'] },
  // A floor is a **minimum**, so `moderate` also carries every critical rule — which is why the two
  // cookie rules from the row above appear here again. Two drafts of this ledger read `moderate` as a
  // band; it is not one, and the grader is what said so.
  { env: 'secureLocal', test: 'the cookie-flag rules fire on a cookie with no HttpOnly, no Secure and SameSite=None (V3)', floor: 'moderate', fires: ['sec/cookie-not-httponly', 'sec/cookie-not-secure', 'sec/hsts-missing', 'sec/cookie-samesite-none', 'sec/nosniff-missing'] },
  { env: 'secureLocal', test: 'sec/csp-missing and sec/x-frame-options fire on a bare document (V4)', floor: 'serious', fires: ['sec/hsts-missing', 'sec/csp-missing'], silent: ['sec/tls-version-old', 'sec/tls-weak-cipher'] },
  { env: 'secureLocal', test: 'sec/csp-missing and sec/x-frame-options fire on a bare document (V4)', floor: 'moderate', fires: ['sec/hsts-missing', 'sec/csp-missing', 'sec/x-frame-options', 'sec/nosniff-missing'] },
  { env: 'secureLocal', test: 'sec/hsts-missing fires on every TLS response the sidecar serves', floor: 'serious', fires: ['sec/hsts-missing'] },
  // `minor` is the *lowest* rank, so a `minor` floor narrows nothing — the whole pack is in play and
  // every rule that fires against a bare TLS `/health` is listed here. An earlier draft of this row
  // claimed the floor isolated `server-version-disclosure`; a floor is a minimum, not a band.
  { env: 'secureLocal', test: 'sec/server-version-disclosure fires through the sidecar, which advertises its build', floor: 'minor', fires: ['sec/hsts-missing', 'sec/nosniff-missing', 'sec/server-version-disclosure'], silent: ['sec/tls-version-old', 'sec/tls-weak-cipher'] },
  { env: 'secureLocal', test: 'sec/nosniff-missing fires on a response that sets no X-Content-Type-Options', floor: 'moderate', fires: ['sec/hsts-missing', 'sec/nosniff-missing'] },
  // The only session-using row, and the one that demonstrates D287: `hsts-missing` and
  // `nosniff-missing` here come from the *session's own login response*, scanned once at
  // establishment and folded into every security assertion in a test that opted in. They are not
  // findings about `/auth/profile`, and the report labels them `session "shopper" login — …`.
  { env: 'secureLocal', test: 'sec/authenticated-response-cacheable fires on an authenticated response with no Cache-Control', floor: 'moderate', fires: ['sec/hsts-missing', 'sec/nosniff-missing', 'sec/authenticated-response-cacheable'] },
  { env: 'secureLocal', test: 'sec/cors-wildcard-with-credentials stays silent on credentialed CORS scoped to one origin (V2)', floor: 'critical', fires: [], silent: ['sec/cors-wildcard-with-credentials'] },
  { env: 'secureLocal', test: 'the cookie-flag rules stay silent on the real session cookie', floor: 'critical', fires: [], silent: ['sec/cookie-not-httponly', 'sec/cookie-not-secure'] },
  // `SameSite=Lax` on the real session cookie — the moderate cookie rule's negative. The two rules
  // that do fire here are properties of the header-less nginx in front, not of the cookie.
  { env: 'secureLocal', test: 'the cookie-flag rules stay silent on the real session cookie', floor: 'moderate', fires: ['sec/hsts-missing', 'sec/nosniff-missing'], silent: ['sec/cookie-samesite-none'] },
  { env: 'secureLocal', test: 'sec/csp-missing, x-frame-options, hsts-missing and nosniff stay silent on the hardened document (V5)', floor: 'serious', fires: [], silent: ['sec/csp-missing', 'sec/hsts-missing'] },
  { env: 'secureLocal', test: 'sec/csp-missing, x-frame-options, hsts-missing and nosniff stay silent on the hardened document (V5)', floor: 'moderate', fires: [], silent: ['sec/x-frame-options', 'sec/nosniff-missing'] },
  { env: 'secureLocal', test: 'sec/authenticated-response-cacheable stays silent when the response sets Cache-Control', floor: 'moderate', fires: [], silent: ['sec/authenticated-response-cacheable'] },
  { env: 'secureLocal', test: "the TLS rules stay silent against the sidecar's own configuration", floor: 'serious', fires: [], silent: ['sec/tls-version-old', 'sec/tls-weak-cipher'] },
  // --- plaintext (http://localhost:4001) ---
  { env: 'plaintext', test: 'sec/server-version-disclosure stays silent against the app itself', floor: 'minor', fires: ['sec/nosniff-missing'], silent: ['sec/server-version-disclosure'] },
  { env: 'plaintext', test: 'the cookie rules that fire over TLS are not-applicable over plaintext (V3)', floor: 'critical', fires: ['sec/cookie-not-httponly'], silent: [] },
  { env: 'plaintext', test: 'sec/hsts-missing is not-applicable over plaintext, where a browser ignores the header', floor: 'serious', fires: [], silent: [] },
  // --- Tier 2, `authz.tflw` under secureLocal (M130c, PLAN_M130_PENTEST_TIER2.md D319) ---
  //
  // `kind: 'authz'` is not decoration. These rows are graded against `AUTHZ_PACK`, and a Tier 2 step
  // additionally carries a **probe line** the hygiene steps have no equivalent of — the per-principal
  // outcome breakdown. `probes` grades that exactly, because it is where this tier's honesty lives:
  // "0 violations" means something completely different when every principal was refused than when
  // every principal was inconclusive, and a boolean oracle cannot tell those apart (D324).
  //
  // **Every `total` here went 2 → 3 in M132b**, when the corpus declared `shopperBearer` (D356).
  // That was not a fixture-tuning detail: with the old probe set no mutating request could be
  // judged by *anyone*, so the two rows at the bottom were measuring a corpus that had run out of
  // principals rather than a property of the tier. Every number below was re-read from the run.
  //
  // **And 3 → 4 in M137b**, when the corpus declared `shopperNoCsrf` (D455). Same mechanism, opposite
  // motive: `shopperBearer` was added because nobody could answer a mutating probe, and this one is
  // added because — once `shopper` carries a `csrf from` clause — nobody would be *unable* to, and the
  // blind-spot control needs a principal that still cannot. The three alices in the probe set are one
  // human on three credentials, which is this corpus's standing claim about what a probe outcome is a
  // fact about. Every number below was re-read from the run, again.
  { env: 'secureLocal', kind: 'authz', test: 'sec/authz-object-leak fires on a route that serves any order by id (V6)', floor: 'critical', fires: ['sec/authz-object-leak'], probes: { total: 4, leaked: 3, refused: 1 } },
  { env: 'secureLocal', kind: 'authz', test: "sec/authz-collection-leak fires on a route that returns every user's orders (V7)", floor: 'critical', fires: ['sec/authz-collection-leak'], probes: { total: 4, leaked: 3, refused: 1 } },
  { env: 'secureLocal', kind: 'authz', test: 'sec/authz-object-leak stays silent on the real ownership-scoped route', floor: null, fires: [], silent: ['sec/authz-object-leak'], probes: { total: 4, refused: 4 } },
  // The only live `served different content` in either corpus, and the state most easily mistaken for
  // a leak: `shopper` got a 200 carrying orders, just not `peer`'s (D313). Two of them now — alice
  // gets her own list under either credential, which is the same correct answer reached twice.
  { env: 'secureLocal', kind: 'authz', test: 'sec/authz-collection-leak stays silent on the real order list', floor: null, fires: [], silent: ['sec/authz-collection-leak'], probes: { total: 4, 'served different content': 3, refused: 1 } },
  // `M130-05`. The opt-in half of D311 — and the row that records the plan being wrong. `probe
  // mutating` really does move the DELETE into the probe set (that is what `total: 3` proves; the
  // default half below declines all three), and the oracle still cannot judge it, because the owner's
  // own DELETE destroys the row before any probe replays it. `inconclusive: 1` is `M130-01`'s CSRF
  // path, live.
  //
  // **`refused: 2` rather than `1` is the point of the M132b change.** The second refusal is
  // `shopperBearer` — a principal who is refused *nothing* on the row below and leaks there. So this
  // row can no longer be explained by "nobody could have answered": somebody could, and the DELETE
  // still yields no verdict. Read it against the V9 row that follows, which is identical in every
  // respect except the verb.
  //
  // **`refused: 3` after M137b, and the `inconclusive: 1` changed hands.** It is `shopperNoCsrf` now;
  // `shopper` supplies the token and joins the refusals, which is the third alice arriving at the
  // same answer `shopperBearer` already gave. The count that matters here is still `inconclusive: 1`
  // being a *declaration's* consequence rather than the engine's.
  { env: 'secureLocal', kind: 'authz', test: 'probe mutating puts a DELETE in the probe set, and a replay cannot judge it (V8)', floor: null, fires: [], probes: { total: 4, inconclusive: 1, refused: 3 } },
  // **M132b (D356) — the positive `probe mutating` shipped without.** Until this row existed the
  // opt-in's acceptance evidence was "the request was probed" and never "the leak was found", which
  // is a control whose positive cannot occur. `leaked: 1` is `shopperBearer` receiving `peer`'s order
  // back from a `PUT`; `inconclusive: 1` is `shopper`, the same human on a cookie, refused for CSRF;
  // `refused: 1` is `anonymous` at `401`.
  //
  // The falsifier D356 named, for anyone re-reading this: this row must be a **violation**. If it
  // ever grades as `inconclusive`, `refused` or `0 violations`, the premise that an idempotent verb
  // is judgeable is wrong and `M130-05` reopens rather than staying closed.
  //
  // **`leaked: 2` after M137b, and the second one is the milestone's whole point on this row.** It is
  // `shopper` — the same human as `shopperBearer`, on a cookie, now able to meet the CSRF pre-flight
  // because her session declares `csrf from`. So the two credentials that can be asked *agree*, and
  // the third (`shopperNoCsrf`) still cannot be. Before the milestone this row's `inconclusive: 1` and
  // its `leaked: 1` were the same human differing by transport, which was a true observation about
  // enforcement and a confusing one about authorization; the pair now differs by *declaration*.
  { env: 'secureLocal', kind: 'authz', test: 'probe mutating finds the leak on an idempotent PUT, which a DELETE cannot show (V9)', floor: 'critical', fires: ['sec/authz-object-leak'], probes: { total: 4, leaked: 2, inconclusive: 1, refused: 1 } },

  // --- Tier 4's CSRF half, `csrf.tflw` under secureLocal (M137b, D434/D457) ------------------------
  //
  // **The one assertion in either corpus whose owner declares `csrf from`, and therefore the only
  // place `sec/csrf-not-enforced` is applicable at all.** The rule derives a *"same cookie session,
  // token withheld"* principal from the owner and probes with it, so a bearer owner gives it nothing
  // to derive — and every other authorization assertion here is owned by `peer`, which is bearer. Its
  // absence would not fail anything: the rule would report not-applicable everywhere and D434's claim
  // that apiV2 is *"a ready-made negative control"* would be a statement about the app that the corpus
  // never checks. `silent` rather than `fires` is the assertion that the control is live.
  //
  // The derived probe is **not** in `total`. `probeCounts` builds the counts line from `probes` only,
  // and D457 gave the derived one its own `csrfProbes` field — because the derived principal *is* the
  // owner, so a shared list would make a token-less write that succeeds look like the owner's own ids
  // leaking to a non-owner, i.e. this rule's happy path firing a critical BOLA against the owner. It
  // surfaces in `declines` instead, which is where the row below picks it up.
  //
  // `total: 3` is the probe set for a two-owner test: `{peer, shopperNoCsrf, anonymous}`. Both names
  // in `as shopper, shopperBearer` are owners and neither is probed (D327) — which is not tidiness,
  // since leaving `shopperBearer` in the set would have it fetch alice's own profile and fire a
  // critical object-leak that is the fixture's fault. `served different content: 1` is `peer` patching
  // his own profile on a self-scoped route.
  { env: 'secureLocal', kind: 'authz', test: "sec/csrf-not-enforced stays silent because apiV2's guard enforces it", floor: null, fires: [], silent: ['sec/authz-object-leak', 'sec/csrf-not-enforced'], probes: { total: 3, 'served different content': 1, inconclusive: 1, refused: 1 } },
];

/** **`csrf.tflw`'s first two tests, which this file has to grade by hand because nothing else does.**
 *
 * `runCorpus` ignores the child's exit code by construction — this corpus's positives are *expected*
 * to produce findings, so a red run is the normal outcome and the report is the oracle. Everything
 * else here rides on that: `LEDGER` grades security assertions, `APPLICABILITY_PROBES` grades
 * expected-to-fail ones. A test that carries no security assertion and is simply supposed to pass has
 * no home in either, and dropping one into the corpus without this block would have added a control
 * whose result nobody reads.
 *
 * The pair is the clause's own proof (`D454`, since `sessions.tflw` must stay independent of it):
 * byte-identical `PATCH /users/me`, one owner declaring `csrf from` and one not, `200` against `403`.
 * `expectFail` is the half that keeps it honest — if a token ever leaked across sessions, or were
 * cached per credential rather than per declaration, `shopperNoCsrf` would get `200` here and every
 * probe-count row in this file would still pass. */
const FUNCTIONAL = {
  secureLocal: [
    { test: 'a cookie session that declares csrf from can make a mutating request', ok: true, why: 'the clause supplies the token on a mutating request with no per-step header' },
    { test: 'the same cookie session without the clause is refused before authorization', ok: true, why: 'the same request without the clause is 403 — so the token belongs to the declaration, not the credential' },
  ],
};

function gradeFunctional(label, report, expected) {
  for (const want of expected) {
    const t = (report.tests ?? []).find((x) => x.name === want.test);
    if (!t) {
      fail(`[${label}] no test named "${want.test}" ran — ${want.why}, and the proof is missing rather than failing`);
      continue;
    }
    if (t.ok !== want.ok) {
      fail(`[${label}] "${want.test}" ${t.ok ? 'passed' : 'failed'}, expected ${want.ok ? 'pass' : 'fail'}: ${want.why}${t.error ? `\n    ${t.error}` : ''}`);
      continue;
    }
    console.log(`✓ [${label}] ${want.test} — ${want.why}`);
  }
}

/** Assertions run purely to make D285's not-applicable listing print, which is the only place the
 * report names a rule that stood down. Each is *expected to fail* — that is the mechanism. */
const APPLICABILITY_PROBES = [
  {
    env: 'plaintext',
    source: 'test "critical rules over plaintext"\n  api GET /health\n  expect response has no critical security violations\n',
    expectNotApplicable: ['sec/cookie-not-httponly', 'sec/cookie-not-secure', 'sec/cors-wildcard-with-credentials'],
  },
  {
    env: 'plaintext',
    source: 'test "serious rules over plaintext"\n  api GET /health\n  expect response has no serious security violations\n',
    // Seven, not four: a floor is a minimum, so `serious` carries the three critical rules as well.
    expectNotApplicable: ['sec/cookie-not-httponly', 'sec/cookie-not-secure', 'sec/cors-wildcard-with-credentials', 'sec/hsts-missing', 'sec/csp-missing', 'sec/tls-version-old', 'sec/tls-weak-cipher'],
  },
  // --- Tier 2's third state, and D311's default half (M130c) --------------------------------------
  //
  // Both are expected-to-fail for the same D285 reason the two above are, which is why they live
  // here rather than in `authz.tflw`: an assertion where nothing applied *fails*, so it cannot be
  // written as a passing corpus test. That is the property being demonstrated, not a limitation.
  {
    kind: 'authz',
    env: 'secureLocal',
    // The owning response is a `4xx`, so there is no resource identity to compare and neither rule
    // can engage — D321's refusal, reached through the applicability path rather than asserted about.
    source:
      'test "an owning response that is a 4xx has no identity to compare" as peer\n' +
      '  api GET /orders/00000000-0000-0000-0000-000000000000\n' +
      '  expect status equals 404\n' +
      '  expect response has no authorization violations\n',
    // Three after M137b. `sec/csrf-not-enforced` stands down here for a *different* reason than the
    // other two — not "the owning response has no identity to compare" but "no owning session declares
    // a `csrf from` clause", since `peer` is bearer. Both reasons print, which is the point of D285's
    // listing: two rules declined on the response and one on the configuration, and the assertion is
    // no more powerful for either.
    expectNotApplicable: ['sec/authz-object-leak', 'sec/authz-collection-leak', 'sec/csrf-not-enforced'],
  },
  {
    kind: 'authz',
    env: 'plaintext',
    // **D311's default half.** Identical request to `authz.tflw`'s V8 test; the only difference is
    // that this env's `authorized target` does not say `probe mutating`. The opt-in row records
    // `total: 2`; this one must record a probe set that was declined outright — the run says so
    // rather than passing quietly, which is the whole control.
    // Its own product with its own stock, for the reason `authz.tflw` records at length: ordering
    // whatever sorts first in the catalog makes this probe fail on `409 insufficient stock` after a
    // few runs against a long-lived stack, nowhere near the assertion it exists to make.
    source:
      'test "a DELETE is not probed unless the target opts in" as peer\n' +
      '  api POST /auth/login body { email: env(ADMIN_EMAIL), password: env(ADMIN_PW) }\n' +
      '  expect status equals 200\n' +
      '  capture body.accessToken as adminToken\n' +
      '\n' +
      '  api GET /categories\n' +
      '  expect status equals 200\n' +
      '  capture body[0].id as categoryId\n' +
      '\n' +
      '  api POST /products body { name: unique("Authz Probe Widget"), price: 10, stock: 10, categoryId: {categoryId} }\n' +
      '    header "Authorization" is "Bearer {adminToken}"\n' +
      '  expect status equals 201\n' +
      '  capture body.id as productId\n' +
      '\n' +
      '  api POST /orders body { items: [{ productId: "{productId}", quantity: 1 }] }\n' +
      '  expect status equals 201\n' +
      '  capture body.id as orderId\n' +
      '\n' +
      '  api DELETE /vuln/orders/{orderId}\n' +
      '  expect status equals 200\n' +
      '  expect response has no authorization violations\n',
    // `sec/csrf-not-enforced` joins the list after M137b, for the configuration reason rather than the
    // target-declaration one: `peer` is bearer, so there is no clause to withhold a token from. Worth
    // reading beside `expectProbes` below — the two leak rules stood down because *nothing was
    // probed*, and this one would have stood down even if everything had been.
    expectNotApplicable: ['sec/authz-object-leak', 'sec/authz-collection-leak', 'sec/csrf-not-enforced'],
    // **The probe set was resolved and then declined in full** — `2 principals probed — 2 not
    // probed`, against the opt-in row's `1 inconclusive, 1 refused` on the identical request. Same
    // two principals, same DELETE, different target declaration, and the report distinguishes the
    // two situations by name rather than both arriving as "0 violations". That contrast *is* D311's
    // control, and it is why the default half had to be measured rather than assumed.
    //
    // (An earlier draft of this row expected `total: 0`, on the theory that a declined probe is an
    // unsent one. The run disagreed: tflw counts the principals it considered and then says what it
    // did with each, which is the more useful answer and the one that makes the two halves
    // comparable.)
    // Four after M137b, and this row is the one the milestone broke that nothing predicted: the
    // opt-in/default contrast is *symmetric*, so declaring a session for the opt-in half's benefit
    // moved the default half's numbers too. Worth recording because the failure was a `3` that had
    // been correct for two milestones and became wrong without being edited — exactly the shape the
    // paragraph below warns about, arriving from the other direction.
    expectProbes: { total: 4, 'not probed': 4 },
    // `M136c`. The counts line says *three were not probed*; this says **which three, and why**, in
    // the channel `M136a` added — and it is the contrast that makes D311's control legible. The
    // opt-in half declines exactly one principal, for CSRF; this half declines all three, for a
    // reason about the target declaration rather than about any of them. Both are "the tier could
    // not ask", and they are different repairs: give `shopper` a bearer session, versus write
    // `probe mutating` on the target. A report that ran them together into one number would be back
    // where `M130-01` started.
    //
    // The four are the probe set for a `peer`-owned test — `admin` is `privileged` and excluded,
    // and an owner is never in its own probe set. `shopperBearer` **and now `shopper`** are here and
    // forbidden on the opt-in half, which is the same fact from both sides: they are declined when
    // nobody was probed, and never declined when somebody was. That both alices who *can* answer
    // appear here is the sharpest form of the contrast — the reason is about the target's declaration,
    // so it applies to principals a CSRF reason could never have named.
    expectDeclines: ['shopper', 'shopperBearer', 'shopperNoCsrf', 'anonymous'].map((subject) => ({
      scan: 'authorization',
      subject,
      reason: /^DELETE changes state, and no `probe mutating` covers /,
      why: 'the target declares no `probe mutating`',
      count: 1,
    })),
  },
];

/** `M136c` — D422's second proof, and the only one of the two made against a defence tflw did not
 * write.
 *
 * `M130-01`: apiV2's `AnyAuthGuard` refuses a cookie-borne principal on a mutating request that
 * carries no `X-CSRF-Token`, *before* authorization is consulted (`apiV2/src/auth/guards/
 * any-auth.guard.ts:70-75`). A differential oracle scores that refusal clean, so the tier's answer
 * for that principal is not "allowed" or "denied" but **un-askable** — D325 grades it `inconclusive`
 * and `M136a`'s `scanBlindSpot.declines` is what carries it out of the run and into the report,
 * `results.json` and SARIF.
 *
 * tflw proves the reporting against a `node:http` fixture that 403s any mutating request without the
 * header. That fixture is fast, deterministic and mutation-killable, and it is also a defence tflw
 * invented to be caught by tflw — `M130-01`'s own failure mode wearing a test's clothes. This is the
 * half that cannot be: the 403 below is issued by NestJS through nginx, by a guard written for the
 * app and not for the scanner.
 *
 * **Why the probe-outcome rows above are not already this check.** Every one of them asserts a
 * count — `inconclusive: 1` on V8 and on V9. If D325's cookie-borne branch stopped matching
 * tomorrow, the same probe would fall through to the generic `the host answered 403, which is not an
 * authorization decision`, still land in `inconclusive`, and **every ledger row in this file would
 * still pass**. The reason text is the only thing that separates *the tier knows why it could not
 * ask* from *the tier gave up and said so vaguely*, which is the distinction the whole blind-spot
 * channel exists to make.
 *
 * **Why the subject is the sharpest control available here.** `shopper` and `shopperBearer` are the
 * same human — alice — on a cookie and on a bearer token. The app's authorization answer for the two
 * is identical; only the transport differs, and only the cookie one meets the CSRF pre-flight. So
 * one is un-askable and the other leaks outright (V9, `leaked: 1`). A decline keyed on the wrong
 * principal of that pair changes no count in any row above and would read as correct everywhere else.
 *
 * **Two rows and not one.** `reportDeclines` groups by reason, and the verb is inside the reason, so
 * V8's `DELETE` and V9's `PUT` arrive separately rather than as one `count: 2`. Asserted because the
 * collapsed form would still be a true statement about a blind spot and would have lost which
 * request it is about — and because it is the observable difference between grouping by reason and
 * grouping by subject.
 *
 * **`coverage` is deliberately not graded.** `apiSteps`/`withOwner` counts `api` steps across the
 * discovered suite, so it moves whenever anyone adds a test — a fact about the corpus, not about a
 * rule, and grading it here would turn every corpus edit into a red run in the file that grades
 * rules. `declines` is per-run and per-principal, which is why it can be exact. */
/** The CSRF branch's own sentence, matched rather than compared whole: the tail after the semicolon
 * is advice to a human and may be reworded, while the head is the claim. A generic fallback reason
 * (`the host answered 403, which is not an authorization decision`) does not match this, which is
 * the entire point — see above. */
const csrfReason = (verb, status = 403) =>
  new RegExp(`^a cookie-borne principal was refused on a ${verb} \\(${status}\\); this may be CSRF rather than authorization`);

const DECLINES = {
  secureLocal: [
    // **The subject moved from `shopper` to `shopperNoCsrf` in M137b, and the two rows are otherwise
    // untouched.** The proof they carry is unchanged — apiV2's own guard refusing a cookie-borne
    // mutating request before authorization — but the principal it is made against is now cookie-borne
    // *by declaration* rather than because tflw could not do otherwise. That is D455's whole repair:
    // before it, these rows would have gone silently empty and `NEVER_DECLINED` below would have
    // passed vacuously.
    { scan: 'authorization', subject: 'shopperNoCsrf', reason: csrfReason('DELETE'), why: "refused on a DELETE for CSRF by apiV2's real AnyAuthGuard — D422's second proof", count: 1 },
    { scan: 'authorization', subject: 'shopperNoCsrf', reason: csrfReason('PUT'), why: "refused on a PUT for CSRF by apiV2's real AnyAuthGuard — D422's second proof", count: 1 },
    // `csrf.tflw`'s third test. Same principal, third verb — and `PATCH` is the verb because that test
    // needed a mutating route with no setup at all.
    { scan: 'authorization', subject: 'shopperNoCsrf', reason: csrfReason('PATCH'), why: "refused on a PATCH for CSRF, on the one assertion whose owner declares the clause", count: 1 },
    // **The derived principal, and the only place in either corpus where it is observable at all.**
    // D457 keeps it out of `probes`, so it contributes to no `total` and to no outcome count; the
    // blind-spot channel is where it surfaces, under a name that says what it is. The row asserts two
    // things at once that are the same fact from opposite sides: `sec/csrf-not-enforced` was silent on
    // this assertion *because* this probe was refused, and the refusal means authorization was never
    // consulted for it. A run where the rule stays silent and this row is absent would mean the rule
    // was silent for the boring reason — nothing derived, nothing sent.
    //
    // The aggregation key is `scan + subject + reason` (`cli.ts:2786`), so this and the `PATCH` row
    // above stay separate despite sharing a reason string. Asserted rather than assumed, because a key
    // that collapsed them would report one fact where there are two principals.
    { scan: 'authorization', subject: 'shopper (csrf token withheld)', reason: csrfReason('PATCH'), why: "the derived token-withheld principal was refused, which is D434's negative control firing on nothing", count: 1 },
  ],
};

/** Principals that must appear in no decline on this env's corpus run — see the bottom of
 * `gradeDeclines` for why this is per-run rather than a global rule.
 *
 * **`shopper` joins `shopperBearer` here in M137b, and that addition is the milestone's acceptance
 * evidence rather than a bookkeeping consequence.** She is the *only* principal in this corpus that
 * moved from one list to the other: two rows above named her before, and now nothing declines her,
 * because her session supplies the token. The two lists together are the before-and-after, and the
 * pair `shopper`/`shopperNoCsrf` is what stops either from being vacuous — same human, same transport,
 * one clause apart, one in each list.
 *
 * The derived principal does not trip this despite being derived *from* her: the forbid compares
 * subjects with `===`, and its subject is the distinct string `shopper (csrf token withheld)`. Which is
 * correct rather than lucky — the fact being asserted is that alice's own credential is never
 * un-askable, and a probe deliberately stripped of her token is a different subject making a different
 * claim. A prefix or substring match here would have made the two lists contradict each other. */
const NEVER_DECLINED = { secureLocal: ['shopperBearer', 'shopper'] };

/** Graded as a set, exactly, in both directions: a decline the ledger does not name is as much a
 * finding as one it names and the run did not produce. A new blind spot appearing in this corpus is
 * something somebody should have to write down. */
function gradeDeclines(label, report, expected, forbidden = []) {
  // The crawl's route-surface declines are graded by `gradeCrawl` against `CRAWL_DECLINE_SHAPES` —
  // see that table's header for why they cannot be part of an exact set. Everything they do not
  // claim still arrives here and is still graded exactly, in both directions, so the partition
  // narrows what this function is responsible for without narrowing what is checked.
  const { crawlDeclines, rest: got } = partitionDeclines(report.scanBlindSpot?.declines ?? []);
  if (crawlDeclines.length > 0) {
    console.log(`  (${crawlDeclines.length} crawl decline(s) on this env are graded by shape — see \`CRAWL_DECLINE_SHAPES\`)`);
  }
  if (got.length !== expected.length) {
    fail(`[${label}] blind-spot declines: expected ${expected.length}, got ${got.length}\n    actual: ${JSON.stringify(got, null, 2)}`);
    return;
  }
  for (const want of expected) {
    const match = got.find((d) => d.scan === want.scan && d.subject === want.subject && want.reason.test(d.reason));
    if (!match) {
      fail(
        `[${label}] no ${want.scan} decline naming \`${want.subject}\` ${want.why}.\n` +
          `    This is the assertion that separates "the tier knows why it could not ask" from "the tier\n` +
          `    could not judge it" — the probe-count rows pass either way. Declines actually reported:\n` +
          `    ${JSON.stringify(got, null, 2)}`,
      );
      continue;
    }
    if (match.count !== want.count) {
      fail(`[${label}] \`${want.subject}\` — ${want.why} — declined ${match.count}×, ledger says ${want.count}×`);
      continue;
    }
    console.log(`✓ [${label}] the blind spot names \`${match.subject}\` — ${want.why}`);
  }
  // The control that keeps the above from being a happy accident of naming. Same human, different
  // transport: `shopperBearer` supplies no cookie, so the guard's CSRF pre-flight never runs for it
  // and it is never un-askable *on a target that opted in*. If it appears here, either the engine is
  // keying declines on the wrong principal or the target's guard changed shape — and V9's
  // `leaked: 1`, which is this same principal getting `peer`'s order back from a `PUT`, would be
  // measuring something else.
  //
  // Passed in per caller rather than hard-coded, because it is only true where a probe was permitted
  // to happen: D311's default half declines all three principals including this one, and for a
  // reason that has nothing to do with CSRF.
  for (const subject of forbidden) {
    const rows = got.filter((d) => d.subject === subject);
    if (rows.length > 0) {
      fail(`[${label}] \`${subject}\` was declined, and on this run nothing should have declined it: ${JSON.stringify(rows)}`);
    }
  }
}

// --- M137e: the Tier 4 crawl, graded by finding provenance rather than by assertion ----------------
//
// `crawl.tflw`'s unit of evidence is not "this assertion fired"; it is **"this finding was reached by
// this seed"**. So this grader reads `report.findings` and the crawl's own surface line, and the
// ledger it checks against is D437's matched pair:
//
//   V15  GET /v1/vuln/reports/orders   documented, never exercised  ->  reachable by `openapi` only
//   V7   GET /v1/vuln/orders           undocumented, exercised      ->  reachable by `traffic` only
//
// Drop either seed and a **named row** goes missing, which is the property D437 asked for and the one
// an aggregate recall number cannot express.
const CRAWL_PLANTS = [
  { endpoint: 'GET /v1/vuln/reports/orders', via: 'openapi', rule: 'sec/authz-collection-leak', findings: 3, why: 'V15 — documented and never exercised, so only enumeration can reach it' },
  { endpoint: 'GET /v1/vuln/orders', via: 'traffic', rule: 'sec/authz-collection-leak', findings: 3, why: 'V7 — @ApiExcludeController(), so only the traffic seed can reach it' },
];

// D482 (`M137c2`). Public collections the crawl **reaches and must not report**. Every principal
// including `anonymous` receives these, so there is no owner and no boundary — before the fix each of
// them produced four critical findings, twenty in total, beside the one true positive above.
//
// Asserted as *reached* first, which is what stops it being vacuous: a route the crawl never dialled
// also produces no findings, and would satisfy the same expectation while measuring nothing. That is
// this repo's oldest recurring failure shape (D363: check who can actually answer before planting).
const CRAWL_PUBLIC = ['GET /v1/products', 'GET /v1/categories', 'GET /v1/categories/tree'];

/** **Every decline a crawl contributes, and the reason they are graded here by shape rather than in
 * `gradeDeclines` by exact set.**
 *
 * `scanBlindSpot.declines` is report-global, so adding `crawl.tflw` to the plaintext corpus put 70
 * declines into a run whose ledger said 0 — and the naive repair, writing 70 into `DECLINES`, is the
 * one this file already argues against. See `DECLINES`' own header on `coverage`: a number that
 * "moves whenever anyone adds a test" is a fact about the corpus rather than about a rule, and
 * grading it here "would turn every corpus edit into a red run in the file that grades rules". A
 * crawl's declines are that same shape one level up — they move whenever anyone adds an *endpoint* —
 * which is exactly why `gradeCrawl` already refuses to pin the synthesized-write count. The
 * per-principal declines `gradeDeclines` exists for stay exact; these do not.
 *
 * **The partition is asserted exhaustive**, which is the part that keeps this from being a hole: any
 * decline matching none of these shapes still reaches `gradeDeclines`' exact set and still fails
 * there if the ledger does not name it. Nothing leaves one grader without landing in another.
 *
 * `pin` is the subject a shape is additionally pinned to, where one exists — `exclude` names a route
 * this corpus chose, so it can be exact even though the others cannot. */
const CRAWL_DECLINE_SHAPES = [
  {
    match: /does not declare `probe mutating`/,
    why: 'synthesized write(s) enumerated, disclosed and not sent — affirming a scan is not affirming writes (D465)',
  },
  {
    match: /rejected as invalid \(400\)/,
    why: "synthesized request(s) refused by the validator before the route ran — a validator's refusal is indistinguishable from a hardened endpoint, so the crawl declines to call it clean",
  },
  {
    // **`M130-01`, and this is the first time that row has a number.** The Tier 4 scoping predicted
    // it: incidental at Tier 2, *systematic* under a crawler, because a 403 before authorization is
    // consulted is the default outcome across the whole mutating surface. Graded as non-zero rather
    // than pinned for the same route-surface reason as the rest — but graded, and reported with its
    // count, so the row stops being a sentence in a ledger and starts being a measurement.
    match: /before the route's code ran/,
    why: 'route(s) where the crawl principal was refused before authorization was consulted — the open `M130-01` blind spot, now counted',
  },
  {
    match: /excluded by this crawl's `exclude/,
    why: 'route(s) withheld by `exclude`, disclosed rather than dropped',
    pin: /contract-demo/,
  },
];

/** Split a run's declines into the crawl's route-surface ones and everything else. Used by both
 * graders so the two cannot disagree about which is which. */
const partitionDeclines = (declines) => {
  const crawlDeclines = [];
  const rest = [];
  for (const d of declines) {
    (CRAWL_DECLINE_SHAPES.some((s) => s.match.test(d.reason ?? '')) ? crawlDeclines : rest).push(d);
  }
  return { crawlDeclines, rest };
};

function gradeCrawl(report) {
  const crawl = (report.tests ?? []).find((t) => t.kind === 'crawl');
  if (!crawl) {
    fail('[plaintext] no crawl in the report — `crawl.tflw` did not run, and everything below would pass vacuously');
    return;
  }
  const surface = crawl.surface ?? {};
  const { discovered = 0, withheld = 0, sent = 0, reached = 0, seeds = [] } = surface;

  // The identity D435's disclosure rests on. A crawler that quietly dropped what it could not build
  // would report a smaller denominator and look like better coverage.
  if (discovered !== withheld + sent) {
    fail(`[plaintext] crawl surface: ${discovered} discovered != ${withheld} withheld + ${sent} sent — the disclosure identity is broken`);
  } else if (reached > sent) {
    fail(`[plaintext] crawl surface: ${reached} reached > ${sent} sent, which is impossible`);
  } else {
    console.log(`✓ [plaintext] crawl surface accounts for everything — ${discovered} discovered = ${withheld} withheld + ${sent} sent, ${reached} reached`);
  }

  // **Both seeds must have found something.** A crawl whose `traffic` seed came back empty still
  // reports a surface and still finds V15, so without this the run reads identically whether the
  // traffic seed works or has silently stopped resolving.
  for (const name of ['openapi', 'traffic']) {
    const seed = seeds.find((x) => x.seed === name);
    if (!seed || !(seed.discovered > 0)) {
      fail(`[plaintext] the \`${name}\` seed discovered nothing — half of D437's pair cannot be reached, so its plant's absence would prove nothing`);
    } else {
      console.log(`✓ [plaintext] \`${name}\` seed discovered ${seed.discovered} route(s)`);
    }
  }

  // `reached` has to be non-zero for any of the plant rows to mean anything, and it is worth its own
  // assertion because `M137c1` shipped a crawl that sent 31 requests, reached 0, and reported green.
  // `TF068`'s fourth cause makes that red now; this says so from the outside as well.
  if (reached === 0) {
    fail('[plaintext] the crawl reached nothing — every plant row below would be measuring an unreached route (M137c1, D480/D481)');
    return;
  }

  const findings = (report.findings ?? []).filter((f) => f.scan === 'authorization' && f.via !== undefined);
  for (const plant of CRAWL_PLANTS) {
    const mine = findings.filter((f) => f.endpoint === plant.endpoint);
    if (mine.length !== plant.findings) {
      fail(`[plaintext] ${plant.endpoint} — expected ${plant.findings} crawl finding(s), got ${mine.length} (${plant.why})`);
      continue;
    }
    const rules = [...new Set(mine.map((f) => f.rule))];
    if (rules.length !== 1 || rules[0] !== plant.rule) {
      fail(`[plaintext] ${plant.endpoint} — expected only ${plant.rule}, got ${rules.join(', ')}`);
      continue;
    }
    // **The assertion this whole file exists for.** A plant found by the *wrong* seed is a plant that
    // has stopped being exclusive: if V15 ever reports `via: traffic`, some test in this repo has
    // started sending it a request and the enumeration proof is gone — silently, with the finding
    // count unchanged.
    const vias = [...new Set(mine.map((f) => f.via))];
    if (vias.length !== 1 || vias[0] !== plant.via) {
      fail(
        `[plaintext] ${plant.endpoint} — expected every finding via \`${plant.via}\`, got ${vias.join(', ')}.\n` +
          `    ${plant.why}. A plant reachable by both seeds proves neither.`,
      );
      continue;
    }
    console.log(`✓ [plaintext] ${plant.endpoint} — ${mine.length} finding(s), all via \`${plant.via}\` (${plant.why})`);
  }

  // Precision, stated as a set rather than as a count (D445): nothing outside the two plants. On this
  // corpus that is checkable outright, which is stronger than a baseline — a baseline records what was
  // once true, and this records what must stay true.
  const strayEndpoints = [...new Set(findings.map((f) => f.endpoint))].filter(
    (e) => !CRAWL_PLANTS.some((p) => p.endpoint === e),
  );
  if (strayEndpoints.length > 0) {
    fail(
      `[plaintext] the crawl reported findings on ${strayEndpoints.length} endpoint(s) that are not plants:\n` +
        `    ${strayEndpoints.join('\n    ')}\n` +
        `    Precision on this corpus is exact (D445). If one of these is a public collection, D482 has regressed.`,
    );
  } else {
    console.log(`✓ [plaintext] no crawl finding outside the ${CRAWL_PLANTS.length} plants — precision is exact on this corpus`);
  }

  // D482 from the other direction, and *reached* before *silent*.
  const declinedSubjects = new Set((report.scanBlindSpot?.declines ?? []).map((d) => d.subject));
  for (const endpoint of CRAWL_PUBLIC) {
    const template = endpoint.replace(/^\w+ /, '');
    const wasDeclined = [...declinedSubjects].some((sub) => sub === endpoint || sub === template);
    if (wasDeclined) {
      fail(`[plaintext] ${endpoint} was declined rather than reached, so "no finding here" measures nothing (D363)`);
      continue;
    }
    if (findings.some((f) => f.endpoint === endpoint)) {
      fail(`[plaintext] ${endpoint} is public — every principal including \`anonymous\` receives it — and must not be an authorization finding (D482)`);
      continue;
    }
    console.log(`✓ [plaintext] ${endpoint} was reached and reported nothing — public data has no owner (D482)`);
  }

  // The engine's own explanation of the line above, asserted on the text a reader sees. `n leaked`
  // beside `0 violations` is two true statements that contradict each other without it, and a
  // suppression nobody can see is indistinguishable from a rule that quietly stopped working.
  const noteSteps = (crawl.steps ?? []).filter((s) => /public data with no owner/.test(s.detail ?? ''));
  if (noteSteps.length === 0) {
    fail('[plaintext] no crawl step explained a public-data suppression — D482 either did not engage or engaged silently');
  } else {
    console.log(`✓ [plaintext] ${noteSteps.length} crawl step(s) say why a leaked probe set was not a violation (D482)`);
  }

  // D465, and the reason this crawl runs on the env that withholds the opt-in: a synthesized write is
  // enumerated, disclosed and not sent. The count is not pinned — it is a property of apiV2's route
  // surface and would churn on every new endpoint — but zero would mean the gate stopped engaging.
  // **All four decline shapes a crawl produces, each graded non-zero, and none of them pinned to a
  // count.** D465's synthesized writes were the only one graded before; the other three arrived with
  // this corpus file and were silently ungraded, which is the same hole in miniature that
  // `CRAWL_DECLINE_SHAPES` exists to close on the other side. Non-zero rather than exact because
  // every one of them is a function of apiV2's route surface — a new endpoint moves them and that is
  // not a regression — but zero would mean the channel stopped engaging, which is.
  //
  // `exclude` is additionally pinned to its subject, because that one route is a choice this corpus
  // made rather than a property of the surface: a pattern that silently stopped matching shows up
  // here rather than as one more route quietly crawled.
  const { crawlDeclines } = partitionDeclines(report.scanBlindSpot?.declines ?? []);
  for (const shape of CRAWL_DECLINE_SHAPES) {
    const hits = crawlDeclines.filter((d) => shape.match.test(d.reason ?? ''));
    if (hits.length === 0) {
      fail(`[plaintext] the crawl disclosed no ${shape.why} — that channel stopped engaging, or the reason was reworded out from under this grader`);
      continue;
    }
    if (shape.pin && !hits.some((d) => shape.pin.test(d.subject ?? ''))) {
      fail(`[plaintext] ${hits.length} decline(s) matched \`${shape.match}\` but none names the subject this corpus pinned (${shape.pin}) — the pattern is dead, or the route left the document`);
      continue;
    }
    console.log(`✓ [plaintext] ${hits.length} ${shape.why}`);
  }
}

const COUNTS = /(\d+) rules? — (\d+) applicable, (\d+) not applicable, (\d+) violations?/;
const VIOLATION = /^\s*- \[(critical|serious|moderate|minor)\] (sec\/[a-z0-9-]+):/gm;
const STOOD_DOWN = /^\s*- (sec\/[a-z0-9-]+) applies when: (.+)$/gm;
/** The discriminator between a Tier 1 step and a Tier 2 one, and the reason this script needed one
 * at all: **the two tiers share the counts line and the `sec/` id prefix**, so `securitySteps()`
 * ingests both and would have graded an authz assertion against the hygiene pack without
 * complaining. Only the probe line is unique to Tier 2 — a hygiene scan judges one response and has
 * no principals to count. */
const PROBES = /(\d+) principals? probed — ([^\n:)]+)/;

/**
 * `2 principals probed — 1 leaked, 1 refused` → `{ total: 2, leaked: 1, refused: 1 }`.
 *
 * Returns `null` for a Tier 1 step, which is how the grader tells the two tiers apart. Outcome
 * names are taken verbatim rather than mapped to an enum here: the point of duplicating tflw's
 * vocabulary in this file is that a rename on that side shows up as a mismatch, and a mapping table
 * would quietly absorb exactly that.
 */
function parseProbes(detail) {
  const m = PROBES.exec(detail);
  if (!m) return null;
  const out = { total: Number(m[1]) };
  for (const part of m[2].split(',')) {
    const p = /^\s*(\d+) (.+?)\s*$/.exec(part);
    if (p) out[p[2]] = Number(p[1]);
  }
  return out;
}

function securitySteps(report) {
  const out = [];
  for (const t of report.tests ?? []) {
    // **Crawls are excluded, and not as a convenience** (M137e, testFlow D437). This function feeds
    // `LEDGER`, whose unit is *one assertion in one named test* — the corpus writes them in a fixed
    // order and a count mismatch is itself a finding. A crawl breaks both halves of that: it applies
    // one written assertion to every route it reaches, so the number of steps under its name is a
    // property of the target's OpenAPI document rather than of anything an author wrote down, and the
    // `leftover` check at the bottom of the ledger loop would report every one of them as ungraded
    // coverage. It is graded by `gradeCrawl` instead, whose unit is the *finding* and its `via`.
    if (t.kind === 'crawl') continue;
    for (const s of t.steps ?? []) {
      const detail = s.detail ?? '';
      if (!COUNTS.test(detail)) continue;
      out.push({
        test: t.name,
        ok: s.ok,
        detail,
        fired: [...detail.matchAll(VIOLATION)].map((m) => m[2]),
        stoodDown: [...detail.matchAll(STOOD_DOWN)].map((m) => m[1]),
        counts: COUNTS.exec(detail).slice(1).map(Number),
        probes: parseProbes(detail),
      });
    }
  }
  return out;
}

/**
 * **Never `npx tflw`** (`M115-03`, and `scripts/exec.mjs`'s D9). `npx` resolves this suite's
 * *vendored* `tflw-0.1.0.tgz`, which predates the entire pentest arc — a grader run through it would
 * report that none of the twelve rules exist and be perfectly happy about it. `TFLW_BIN` names the
 * built CLI; the default points at the sibling checkout so a plain `npm run
 * verify:security-acceptance` on a dev machine works without ceremony.
 */
const TFLW_BIN = process.env.TFLW_BIN ?? join(repoRoot, '..', 'testFlow', 'packages', 'cli', 'dist', 'cli.cjs');

/**
 * The corpus declares `require env USER_A_EMAIL, USER_A_PW`, and tflw auto-loads `.env` from the
 * *config* directory — which would mean a second copy of real credentials under
 * `tflw-acceptance/security/`. The repo already has exactly one such file at its root, and copying a
 * secret to make a path shorter is how a secret ends up committed. So this reads the root `.env`
 * once and passes the values through to the child process instead. Deliberately non-fatal if it is
 * missing: `require env`'s own diagnostic names the variables, and is a better message than anything
 * this script would invent.
 */
function rootEnv() {
  let text;
  try {
    text = readFileSync(join(repoRoot, '.env'), 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || line.trimStart().startsWith('#')) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const CHILD_ENV = { ...rootEnv(), ...process.env };

function runCorpus(env, files) {
  // **Deleted before every run, not merely overwritten.** A `tflw run` that dies before it writes a
  // report — a parse error, a missing `require env` — leaves the *previous* run's `results.json`
  // sitting there, and this script would grade one env's corpus against another env's report and
  // report a long list of confident, meaningless mismatches. It did exactly that once.
  rmSync(join(corpus, 'report', 'results.json'), { force: true });
  const args = [TFLW_BIN, 'run', '--env', env, '--no-color', ...files];
  const r = spawnSync(process.execPath, args, { cwd: corpus, encoding: 'utf8', shell: false, env: CHILD_ENV });
  let report;
  try {
    report = JSON.parse(readFileSync(join(corpus, 'report', 'results.json'), 'utf8'));
  } catch (e) {
    console.error(`could not read the run report for --env ${env}: ${e.message}`);
    console.error(`  (tflw binary: ${TFLW_BIN})`);
    console.error(`${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd().split('\n').slice(-25).join('\n'));
    process.exit(1);
  }
  return { report, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`✗ ${msg}`);
};

// --- the fired set, per case, exact ------------------------------------------

/** Which rules this run demonstrated in each state, accumulated across both envs. */
const seen = { fires: new Set(), silent: new Set(), notApplicable: new Set() };
/** The same three states for Tier 2, kept in its own accumulator so the coverage table can print two
 * packs without either borrowing the other's evidence. */
const seenAuthz = { fires: new Set(), silent: new Set(), notApplicable: new Set() };

for (const env of ['secureLocal', 'plaintext']) {
  // `csrf.tflw` is secureLocal-only because its third test needs that env's `probe mutating` — the
  // derived token-withheld probe is a mutating request like any other and is gated by the same D21
  // opt-in (M137b, D457).
  // `crawl.tflw` is plaintext-only (M137e): its `seed openapi` source is that env's own origin, so
  // the document, the `authorized target` and the crawled base are one host — and `probe mutating` is
  // withheld there, which is the state worth crawling in (D465).
  const files = env === 'plaintext' ? ['plaintext.tflw', 'crawl.tflw'] : ['positives.tflw', 'negatives.tflw', 'authz.tflw', 'csrf.tflw'];
  const { report } = runCorpus(env, files);
  const steps = securitySteps(report);
  const rows = LEDGER.filter((l) => l.env === env);

  // One ledger row per security assertion, matched in order within a test — the corpus writes them
  // in the same order the ledger lists them, and a mismatch in *count* is itself a finding (a case
  // silently dropped from the corpus would otherwise just stop being graded).
  const byTest = new Map();
  for (const s of steps) byTest.set(s.test, [...(byTest.get(s.test) ?? []), s]);

  for (const row of rows) {
    const list = byTest.get(row.test);
    if (!list || list.length === 0) {
      fail(`[${env}] no security assertion found for ledger row "${row.test}" — the corpus and the ledger have drifted`);
      continue;
    }
    const step = list.shift();
    const isAuthz = row.kind === 'authz';
    const pool = isAuthz ? seenAuthz : seen;
    // **The tier the step actually is, versus the tier the ledger says it is.** Both tiers write the
    // same counts line, so a row pointing at the wrong test would otherwise be graded happily
    // against the wrong pack. The probe line is present on exactly one of them, so this is a total
    // check rather than a heuristic.
    if (isAuthz !== (step.probes !== null)) {
      fail(`[${env}] "${row.test}" is graded as ${isAuthz ? 'Tier 2 (authz)' : 'Tier 1 (hygiene)'}, but the step ${step.probes ? 'has' : 'has no'} probe line — the ledger and the corpus disagree about which tier this assertion is`);
      continue;
    }
    if (isAuthz && row.probes) {
      const got = step.probes;
      const want = row.probes;
      const keys = [...new Set([...Object.keys(want), ...Object.keys(got)])].sort();
      const diff = keys.filter((k) => (want[k] ?? 0) !== (got[k] ?? 0));
      if (diff.length > 0) {
        // Printed as the whole breakdown rather than just the differing key, because the outcome
        // mix is the claim — "0 violations, 2 refused" and "0 violations, 2 inconclusive" are the
        // same assertion result and completely different evidence (D324).
        fail(`[${env}] "${row.test}" probe outcomes\n    expected: ${JSON.stringify(want)}\n    actual:   ${JSON.stringify(got)}`);
        continue;
      }
    }
    const expected = [...row.fires].sort();
    const actual = [...new Set(step.fired)].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      fail(`[${env}] "${row.test}" @${row.floor}\n    expected: ${expected.join(', ') || '(none)'}\n    actual:   ${actual.join(', ') || '(none)'}`);
      continue;
    }
    for (const id of actual) pool.fires.add(id);
    // **Silence, and exactly how strongly it is verified.**
    //
    // A rule is demonstrated silent only if it *ran* and found nothing. The report gives the number
    // of applicable rules but not their names, so this checks the three things it can — the rule was
    // in play at this floor, it did not fire, and the applicable count leaves room for it — plus the
    // ledger's own claim, drawn from `VULNS.md`, that this response meets the rule's precondition.
    //
    // That is a **necessary** condition, not a sufficient one: a response where two rules swapped
    // applicability would satisfy it. Stated here rather than glossed, because "verified" doing more
    // work than the check behind it is the exact failure this whole file is about. The sufficient
    // version needs the report to name its not-applicable rules on a passing assertion, which it
    // does not — see the note at the top.
    const [, applicable] = step.counts;
    const claimed = row.silent ?? [];
    const notInPlay = claimed.filter((id) => !(isAuthz ? authzInPlay(row.floor) : inPlay(row.floor)).includes(id));
    if (notInPlay.length > 0) {
      fail(`[${env}] "${row.test}" @${row.floor} claims ${notInPlay.join(', ')} stayed silent, but a ${row.floor} floor does not even consider ${notInPlay.length === 1 ? 'it' : 'them'}`);
      continue;
    }
    if (applicable < actual.length + claimed.length) {
      fail(`[${env}] "${row.test}" @${row.floor} claims ${claimed.length} silent + ${actual.length} fired, but only ${applicable} rules were applicable`);
      continue;
    }
    for (const id of claimed) pool.silent.add(id);
    const probeNote = isAuthz && step.probes ? `, ${step.probes.total} principal(s) probed` : '';
    console.log(`✓ [${env}] ${row.test} @${row.floor ?? 'no floor'} — ${actual.length} finding(s)${probeNote}, exactly as the ledger says`);
  }
  for (const [test, leftover] of byTest) {
    if (leftover.length > 0) fail(`[${env}] "${test}" ran ${leftover.length} security assertion(s) the ledger does not grade — add rows, or the corpus is claiming coverage nothing checks`);
  }
  // `M136c` — run-level, so it is graded once per env rather than per row. `plaintext` runs no
  // authorization assertion at all and must therefore report no declines: an empty expectation is
  // the control that stops the check passing on whatever happens to be in the report.
  gradeDeclines(env, report, DECLINES[env] ?? [], NEVER_DECLINED[env] ?? []);
  // The two tests in this corpus that are graded by their own verdict rather than by a rule.
  gradeFunctional(env, report, FUNCTIONAL[env] ?? []);
  if (env === 'plaintext') gradeCrawl(report);
}

// --- the third state, from D285's listing ------------------------------------

/** Written into the corpus directory rather than passed on stdin, because the corpus directory *is*
 * the config root: a probe run anywhere else would not be covered by the `authorized target`
 * declaration that permits a security assertion at all, and would fail as `TF060` instead of
 * demonstrating anything. Removed again in the `finally`, so a failed run leaves no stray file. */
function withProbeFile(probe, index, fn) {
  // **Not dot-prefixed.** A leading `.` makes the file invisible to tflw's discovery, and passing an
  // undiscoverable path does not error — the run quietly falls back to discovering the whole
  // directory instead. This script then graded the corpus' own first assertion and reported a
  // confident, wrong answer about a probe that had never run.
  const name = `probe-${index}-${probe.env}.tflw`;
  writeFileSync(join(corpus, name), probe.source);
  try {
    return fn(name);
  } finally {
    rmSync(join(corpus, name), { force: true });
  }
}

for (const probe of APPLICABILITY_PROBES) {
  const { report } = withProbeFile(probe, APPLICABILITY_PROBES.indexOf(probe), (name) => runCorpus(probe.env, [name]));
  const steps = securitySteps(report);
  const step = steps[0];
  if (!step) {
    fail(`[${probe.env}] the applicability probe produced no security assertion`);
    continue;
  }
  if (step.ok) {
    fail(`[${probe.env}] an assertion where every rule stood down PASSED — D285 has been removed`);
    continue;
  }
  const missing = probe.expectNotApplicable.filter((id) => !step.stoodDown.includes(id));
  const extra = step.stoodDown.filter((id) => !probe.expectNotApplicable.includes(id));
  if (missing.length || extra.length) {
    fail(`[${probe.env}] not-applicable listing mismatch\n    missing: ${missing.join(', ') || '(none)'}\n    extra:   ${extra.join(', ') || '(none)'}`);
    continue;
  }
  if (probe.expectProbes) {
    const got = step.probes ?? { total: 0 };
    const keys = [...new Set([...Object.keys(probe.expectProbes), ...Object.keys(got)])].sort();
    const diff = keys.filter((k) => (probe.expectProbes[k] ?? 0) !== (got[k] ?? 0));
    if (diff.length > 0) {
      fail(`[${probe.env}] declined-probe-set mismatch\n    expected: ${JSON.stringify(probe.expectProbes)}\n    actual:   ${JSON.stringify(got)}`);
      continue;
    }
  }
  if (probe.expectDeclines) gradeDeclines(`${probe.env} probe`, report, probe.expectDeclines);
  for (const id of step.stoodDown) (probe.kind === 'authz' ? seenAuthz : seen).notApplicable.add(id);
  console.log(`✓ [${probe.env}] D285 fired and named ${step.stoodDown.length} rules that stood down, exactly as the ledger says`);
}

// --- the coverage table, gaps included ---------------------------------------

/** Two rules apply unconditionally (D284's `appliesWhen: always`), so they have no third state to
 * demonstrate. Absent from the gap list rather than permanently listed in it — a gap report that
 * always names the same two rows is one people learn to skip. */
const NO_NOT_APPLICABLE = new Set(['sec/nosniff-missing', 'sec/server-version-disclosure']);

console.log('\nD295 coverage — one row per rule, three states:\n');
const gaps = [];
console.log(`  ${'rule'.padEnd(40)} fires  silent  n/a`);
for (const [id] of PACK) {
  const f = seen.fires.has(id), s = seen.silent.has(id);
  const n = NO_NOT_APPLICABLE.has(id) ? 'n/a' : seen.notApplicable.has(id);
  if (!f || !s || n === false) gaps.push([id, { fires: f, silent: s, notApplicable: n !== false }]);
  console.log(`  ${id.padEnd(40)} ${f ? '  ✓  ' : '  ·  '}  ${s ? '  ✓ ' : '  · '}   ${n === 'n/a' ? '—' : n ? ' ✓' : ' ·'}`);
}

if (gaps.length > 0) {
  console.log('\nNot demonstrated live by this run, and why — a coverage claim with a silent gap is the');
  console.log('thing this milestone exists to avoid, so each one is named:\n');
  for (const [id, states] of gaps) {
    const missing = Object.entries(states).filter(([, v]) => !v).map(([k]) => k);
    console.log(`  ${id}: ${missing.join(', ')}`);
  }
  console.log('\nSee VULNS.md — "Not planted, on purpose" — for the measured reason the two `sec/tls-*`');
  console.log('positives are not constructible on OpenSSL 3.x, and for which states are covered by');
  console.log('unit tests against synthetic handshake facts instead.');
}

// --- D319: the same table for Tier 2, plus the price of the tier ------------------------------

console.log('\nD319 coverage — one row per authorization rule, three states:\n');
const authzGaps = [];
console.log(`  ${'rule'.padEnd(40)} fires  silent  n/a`);
for (const [id] of AUTHZ_PACK) {
  const f = seenAuthz.fires.has(id), s = seenAuthz.silent.has(id), n = seenAuthz.notApplicable.has(id);
  if (!f || !s || !n) authzGaps.push([id, { fires: f, silent: s, notApplicable: n }]);
  console.log(`  ${id.padEnd(40)} ${f ? '  ✓  ' : '  ·  '}  ${s ? '  ✓ ' : '  · '}   ${n ? ' ✓' : ' ·'}`);
}
if (authzGaps.length > 0) {
  console.log('\nNot demonstrated live by this run:\n');
  for (const [id, states] of authzGaps) {
    console.log(`  ${id}: ${Object.entries(states).filter(([, v]) => !v).map(([k]) => k).join(', ')}`);
  }
  // **`sec/csrf-not-enforced` has no `fires` here and cannot have one**, which is a fact about the
  // target and is recorded rather than left to look like an oversight. Every mutating route in apiV2
  // — including the deliberately-broken `vuln/` ones (`vuln-orders.controller.ts:51`) — is behind
  // `AnyAuthGuard`, so there is no endpoint that would accept a token-less cookie-borne write. The
  // positive lives in tflw's own `node:http` fixture instead; VULNS.md carries the row under
  // "Not planted, on purpose", with the reason planting one would mean weakening the app's real guard
  // and thereby destroying `D434`'s negative control — the two cannot coexist on one target.
  console.log('\nSee VULNS.md — "Not planted, on purpose" — for why `sec/csrf-not-enforced` has no live');
  console.log('positive: apiV2 guards every mutating route, and weakening one to plant it would destroy');
  console.log("the negative control that is this rule's whole acceptance story (D434).");
}

/**
 * **The price, printed rather than discovered.** D319 asks this corpus to record what an
 * authorization assertion costs, because "four extra requests per assertion site" is the kind of
 * number that turns into a surprise in CI if it only ever lives in a plan.
 *
 * It is derived from the run rather than asserted, because the probe set is a property of the
 * *config* — this corpus declares `shopper`, `peer` and a `privileged` `admin`, so a `peer`-owned
 * assertion costs two; the root `tflw.config` also declares two `oauth2` sessions, so the same
 * assertion in the dogfood suite costs four. Quoting one repo's number for the other would be wrong,
 * which is exactly why this prints the one it measured instead of a constant.
 */
console.log('\nD319 — what the tier cost this run:\n');
{
  const rows = LEDGER.filter((l) => l.kind === 'authz' && l.probes);
  const sites = rows.length;
  const requests = rows.reduce((n, r) => n + (r.probes.total ?? 0), 0);
  console.log(`  ${sites} authorization assertion site(s), ${requests} extra request(s) — ${(requests / sites).toFixed(1)} per site`);
  console.log('  (probe set for a `peer`-owned test here is');
  console.log('   {shopper, shopperBearer, shopperNoCsrf, anonymous}: `admin` is `privileged` and');
  console.log('   excluded, and the owner is never in its own probe set. The three alices are one human');
  console.log('   on three credentials — `shopperBearer` is M132b, without which no mutating probe in');
  console.log('   this corpus could be judged by anybody, and `shopperNoCsrf` is M137b, without which');
  console.log('   every mutating probe could be, leaving the blind-spot control with no subject.');
  console.log('   The average is below the per-site figure because `csrf.tflw`\'s assertion names two');
  console.log('   owners, and an owner is not probed — plus its derived token-withheld probe, which is');
  console.log('   a real request this line does not count because D457 keeps it out of `probes`.)');
}

// --- D347: the public-target gate, three invocations, zero packets ----------------------------
//
// **The only case in this file graded on a refusal rather than on a report**, and the only one that
// needs no stack at all. `public-target/scan.tflw` is one unmodified file run three times against
// one unmodified config; the only thing that changes is the command line, which is the whole of
// D21 §3.2(3) — the affirmation this gate wants is precisely the one no file in the repository is
// allowed to make.
//
// Nothing here reaches a host. The target is `.invalid` (RFC 2606, guaranteed never to resolve),
// and it is usable as evidence only because tflw classifies an address **literally**: a DNS-based
// classifier could not answer at all, while the literal one says `public` with no lookup. The
// offline corpus and the no-DNS decision are one decision, not two.
//
// **The third case is what stops the first two being vacuous.** A control that refused everything
// would score identically on cases 1 and 2. Case 3 has to reach a *different* failure — a
// connection attempt — and the assertion is therefore two-sided: the gate's code must be absent,
// and the run must have got far enough to try the socket.
console.log('\nD347 — the public-target gate, three invocations of one file:\n');
{
  const scan = join('public-target', 'scan.tflw');
  const cases = [
    {
      label: 'no affirmation',
      flags: [],
      wants: 'TF065',
    },
    {
      label: 'an affirmation for an origin this run never scans',
      flags: ['--allow-public-target', 'https://other.example.invalid'],
      wants: 'TF066',
    },
    {
      label: 'the affirmation this run needs',
      flags: ['--allow-public-target', 'https://staging.example.invalid'],
      wants: null,
    },
  ];
  for (const { label, flags, wants } of cases) {
    const args = [TFLW_BIN, 'run', '--env', 'publicTarget', '--no-color', ...flags, scan];
    const r = spawnSync(process.execPath, args, { cwd: corpus, encoding: 'utf8', shell: false, env: CHILD_ENV });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (wants) {
      if (out.includes(`[${wants}]`)) console.log(`  ✓ ${label} → refused, ${wants}`);
      else fail(`[publicTarget] ${label} should have been refused with ${wants}; got: ${out.trim().split('\n').slice(-3).join(' / ')}`);
      // Refused means refused *before* anything is attempted. A run that reported the code and then
      // went on to try the host would satisfy a presence check and defeat the control.
      if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(out)) {
        fail(`[publicTarget] ${label} reported ${wants} but still attempted a connection — the gate must refuse before the socket`);
      }
    } else {
      if (out.includes('[TF065]') || out.includes('[TF066]')) {
        fail(`[publicTarget] ${label} was still refused by the gate — the affirmation matches the origin this env scans`);
      } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|could not be established|fetch failed/i.test(out)) {
        console.log('  ✓ the affirmation this run needs → gate passed, run failed at the connection (which is the evidence)');
      } else {
        fail(`[publicTarget] ${label} neither refused nor reached a connection attempt — the gate cannot be shown to have let anything through: ${out.trim().split('\n').slice(-3).join(' / ')}`);
      }
    }
  }
  console.log('\n  (zero packets: `.invalid` is RFC 2606-reserved, and the address class is read from');
  console.log('   the URL as written — this corpus never resolves a name, let alone contacts a host.)');
}

console.log(failures === 0 ? '\n✓ security acceptance: every graded case matched the ledger' : `\n✗ security acceptance: ${failures} mismatch(es)`);
process.exit(failures === 0 ? 0 : 1);
