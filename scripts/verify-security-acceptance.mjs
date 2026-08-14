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
  { env: 'secureLocal', kind: 'authz', test: 'sec/authz-object-leak fires on a route that serves any order by id (V6)', floor: 'critical', fires: ['sec/authz-object-leak'], probes: { total: 3, leaked: 2, refused: 1 } },
  { env: 'secureLocal', kind: 'authz', test: "sec/authz-collection-leak fires on a route that returns every user's orders (V7)", floor: 'critical', fires: ['sec/authz-collection-leak'], probes: { total: 3, leaked: 2, refused: 1 } },
  { env: 'secureLocal', kind: 'authz', test: 'sec/authz-object-leak stays silent on the real ownership-scoped route', floor: null, fires: [], silent: ['sec/authz-object-leak'], probes: { total: 3, refused: 3 } },
  // The only live `served different content` in either corpus, and the state most easily mistaken for
  // a leak: `shopper` got a 200 carrying orders, just not `peer`'s (D313). Two of them now — alice
  // gets her own list under either credential, which is the same correct answer reached twice.
  { env: 'secureLocal', kind: 'authz', test: 'sec/authz-collection-leak stays silent on the real order list', floor: null, fires: [], silent: ['sec/authz-collection-leak'], probes: { total: 3, 'served different content': 2, refused: 1 } },
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
  { env: 'secureLocal', kind: 'authz', test: 'probe mutating puts a DELETE in the probe set, and a replay cannot judge it (V8)', floor: null, fires: [], probes: { total: 3, inconclusive: 1, refused: 2 } },
  // **M132b (D356) — the positive `probe mutating` shipped without.** Until this row existed the
  // opt-in's acceptance evidence was "the request was probed" and never "the leak was found", which
  // is a control whose positive cannot occur. `leaked: 1` is `shopperBearer` receiving `peer`'s order
  // back from a `PUT`; `inconclusive: 1` is `shopper`, the same human on a cookie, refused for CSRF;
  // `refused: 1` is `anonymous` at `401`.
  //
  // The falsifier D356 named, for anyone re-reading this: this row must be a **violation**. If it
  // ever grades as `inconclusive`, `refused` or `0 violations`, the premise that an idempotent verb
  // is judgeable is wrong and `M130-05` reopens rather than staying closed.
  { env: 'secureLocal', kind: 'authz', test: 'probe mutating finds the leak on an idempotent PUT, which a DELETE cannot show (V9)', floor: 'critical', fires: ['sec/authz-object-leak'], probes: { total: 3, leaked: 1, inconclusive: 1, refused: 1 } },
];

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
    expectNotApplicable: ['sec/authz-object-leak', 'sec/authz-collection-leak'],
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
    expectNotApplicable: ['sec/authz-object-leak', 'sec/authz-collection-leak'],
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
    expectProbes: { total: 3, 'not probed': 3 },
  },
];

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
  const files = env === 'plaintext' ? ['plaintext.tflw'] : ['positives.tflw', 'negatives.tflw', 'authz.tflw'];
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
  console.log('  (probe set for a `peer`-owned test here is {shopper, shopperBearer, anonymous}:');
  console.log('   `admin` is `privileged` and excluded, and the owner is never in its own probe set.');
  console.log('   `shopperBearer` is alice again on a bearer token — M132b, without which no');
  console.log('   mutating probe in this corpus could be judged by anybody.)');
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
