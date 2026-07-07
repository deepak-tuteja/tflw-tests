# tflw declarative-expressiveness gaps (ranked)

**Successor to `TFLW-FEATURE-GAPS.md`.** That file's five findings (from the M1/M1.5 sessions) are
folded in here, re-verified against the finished v2 suite, and joined by three new findings M5
specifically went looking for (gaps #1-#7, two since fixed) and three more from M6's
realistic-scale gap hunting (gaps #8-#10, plan_v2.md Part D — large templated bodies, a long
multi-hop request chain, a second auth scheme, and a deliberate large-body failure). Every entry
below was built and verified against the real, running v2 API — none of this is speculative. Gaps
#1, #2, and #8 are fixed; **#3 turned out to already be expressible** with tflw's existing shipped
grammar (no code change needed — see [Resolved](#resolved-no-tflw-code-change-needed)) once
`any`/`all` is paired with `matches subset {...}` instead of narrowing the path to one field —
everything else remains a backlog note for a future session, not yet touched in `testFlow/`.

**Criterion for "real gap":** the scenario is legitimately declarative — an ordinary assertion or
data-shape check, not a loop/branch/state-machine a language that deliberately has neither (SPEC
§7.5) was never going to offer natively. Findings that fail this bar (page-walking, arbitrary
retry backoff logic) are listed separately as **confirmed-by-design**, not ranked as gaps.

## Ranked

Gap numbers are stable identifiers (cross-referenced from `testFlow/PLAN.md`'s decision log and
this repo's own task tracking) — a fixed/resolved gap keeps its number rather than the table
renumbering around it. See **Fixed**, below, for #1, #2, and #8, and **Resolved**, below, for #3 (no
tflw code change — an existing composition covers it).

| # | Gap | Severity × Frequency | Proof |
|---|---|---|---|
| 1 | ~~No cookie-subject / cookie-jar~~ | — | **✅ Fixed — see [Fixed](#fixed) below** |
| 2 | ~~No partial-object / subtree JSON matching~~ | — | **✅ Fixed — see [Fixed](#fixed) below** |
| 3 | ~~Correlated array-element JSON-path predicates~~ | — | **✅ Resolved — see [Resolved](#resolved-no-tflw-code-change-needed) below** |
| 4 | `wait until api` cannot carry per-step headers | **Medium × Low-Medium** — blocks any poll needing per-attempt auth (async jobs, token-expiry chains) | `tests/.checkonly/wait-until-headers.tflw` (parse-time), `tests/token-expiry.tflw` (the real scenario it forces) |
| 5 | No `Retry-After`-aware retry | **Medium × Low** — only recurs where the API rate-limits, but that's a common real pattern | `tests/reviews.tflw`'s two `@ratelimit` tests |
| 6 | No schema/contract validation against `/openapi.json` | **Medium × Low** — high potential value, low current occurrence (few endpoints document response schemas yet) | `tests/schema-and-shape.tflw` |
| 7 | Only one `session` may be opted into per test | **Low × High** — trivial one-line workaround, but recurs constantly | `tests/authz.tflw`, `tests/order-items.tflw`, `tests/jobs.tflw`, `tests/reviews.tflw`, `tests/http-maturity.tflw` |
| 8 | ~~Failure diffs are completely untruncated, no per-field ignore/exclude~~ | — | **✅ Fixed — see [Fixed](#fixed) below** |
| 9 | No `base64(...)` (or general string-transform) generator function | **Medium × Low** — only blocks a declarative HTTP Basic `Authorization` header; the multi-scheme guard itself works fine once the header exists | `tests/basic-auth.tflw`, `tests/helpers/basic-auth.ts` |
| 10 | `upload "..." as "field"` can't specify or infer a file's Content-Type | **Medium × Low** — only matters when a test cares about the *received* MIME type, but the workaround (none — it's always `application/octet-stream`) can't be worked around at all, not even via JS | `tests/body-types.tflw` |

## Fixed

### 1. No cookie-subject / cookie-jar — ✅ fixed in tflw 0.1.0 (2026-07-07)

Shipped as `testFlow/PLAN.md` decision 87: `EvalCtx` gained an automatic `cookieJar` (new
`packages/runtime/src/cookieJar.ts`), auto-threaded through every `api`/`wait until api` step, a
`session` block's own run, and any action call — no new grammar. Full writeup lives in
`testFlow/SPEC.md` §3.3's new "Cookie jar (P#33)" subsection and `testFlow/PROGRESS.md`'s M2.11.

**What changed here in response:** `tflw.config`'s `shopper` session dropped its manual `capture
header "set-cookie"`/`header "Cookie" is …` lines entirely (the jar does it automatically);
`tests/sessions.tflw`'s two CSRF tests dropped the same manual capture/replay for their own
sequential logins (the jar carries the cookie forward across a test's own steps too, not just
across a cached session); the logout test *deliberately kept* its manual capture/replay (see its
own comment — it needs the stale, pre-logout cookie value specifically, to prove server-side
revocation rather than "the jar correctly cleared it"). The former `tests/.gaps/cookie-jar.tflw`
(an intentionally-failing fixture proving the crash) was replaced by `tests/cookie-jar.tflw` in
the ordinary suite, now proving the fix: the exact former-crash scenario
(`/auth/session-login-full`'s dual `Set-Cookie`) with zero `capture`/`header` at all, plus a second
test confirming the *second* cookie (`session_refresh`) is independently tracked and usable too.

**Verified 2026-07-07:** fresh `node cli.mjs stop && node cli.mjs start`, `npx tflw check` (16
files, no problems), `npx tflw run` — `PASS 61/61 passed` (59 carried over + the new
`cookie-jar.tflw`'s 2 tests), repeated clean under `--workers 4` on another fresh restart.

### 2. No partial-object / subtree JSON matching — ✅ fixed in tflw 0.1.0 (2026-07-07)

Shipped as `testFlow/PLAN.md` decision 88: a new `matches subset {...}` matcher — `MatcherName`
gained `matchesSubset`, the parser reuses the existing `{...}` object-literal grammar (no new
subject or production), and `runtime/src/matcher.ts`'s `subsetMatch()` checks every key/value in
the literal is present on the actual object (recursing into nested objects, requiring full
equality on nested arrays), ignoring any keys the actual object has that the literal doesn't
mention. Full writeup lives in `testFlow/SPEC.md` §6.3.1 and `testFlow/PROGRESS.md`'s M2.12.

**What changed here in response:** `tests/schema-and-shape.tflw`'s gap-demo test (previously
`@gaps @shape`, three separate `expect body.<field> equals <value>` lines plus a commented-out
"ideal syntax" line) now uses that exact "ideal syntax" for real — `@shape` only, one `expect body
matches subset { type: "about:blank", title: "Unprocessable Entity", status: 422 }` line — and its
comment explains why a `matches subset` literal, unlike a full `equals`, can ignore the
legitimately variable `errors` array while still asserting the rest of the shape. The same pattern
replaced the two-line `body.type equals`/`body.title equals` pairs in `crud-lifecycle.tflw` (2
occurrences) and `http-maturity.tflw` (5 occurrences: 412, 405, 409, 406, 415), folding in `status`
too where it wasn't already asserted separately — every RFC7807 filter response has the same
`{type,title,status,detail,errors?}` shape (`apiV2/src/common/problem-details.filter.ts`), so the
three-key subset is the natural "assert the whole envelope in one line" check. Assertions that pair
`equals` on structural fields with a `contains` on `detail` (a substring check `matches subset`
deliberately doesn't support — it's an equals-only partial match, §6.3.1) kept their separate
`body.detail contains "..."` line; `reviews.tflw`'s 409 test only ever asserted `detail`, so it was
untouched.

**Verified 2026-07-07:** fresh `node cli.mjs stop && node cli.mjs start`, `npx tflw check` (16
files, no problems), `npx tflw run` — `PASS 61/61 passed`, repeated clean under `--workers 4` on
another fresh restart.

### 8. Failure diffs are completely untruncated, no per-field ignore/exclude — ✅ fixed in tflw 0.1.0 (2026-07-07)

Shipped as `testFlow/PLAN.md` decision 90: `runtime/src/matcher.ts` gained a fixed 2000-char
`truncate()` cap applied to every failure message's `expected`/`got` text (a hardcoded default, not
new config surface — P#13), plus a more targeted improvement for `matches subset {...}`:
`subsetMismatches()` walks the same shape the matcher already checks but reports only the keys that
are actually missing or wrong (dotted paths for nested mismatches), instead of the whole actual
object. Full writeup lives in `testFlow/SPEC.md` §6.6 and `testFlow/PROGRESS.md`'s M2.14.

**What changed here in response:** nothing in this repo's own `.tflw` files needed to change —
`tests/.demo-fail/large-response-diff.tflw` is deliberately still failing (it's a demo-fail
fixture), and its failure message is what proves the fix.

**Verified 2026-07-07:** fresh `node cli.mjs stop && node cli.mjs start`, `npx tflw check` (23
files, no problems), `npx tflw run` — `PASS 77/77 passed`, repeated clean under `--workers 4` on
another fresh restart. `npx tflw run tests/.demo-fail/*.tflw --tag demofail` re-ran the exact
former-11,248-char scenario: the message is now capped at 2000 characters with a clear `(truncated,
showing 2000 of 11009 chars — see report.html for the full response body)` marker, and the subset
diff itself correctly narrowed to only the two mismatched keys (`status`, `items`) rather than the
whole envelope (`id`, `userId`, etc. no longer appear at all) — the remaining length comes from
`items` itself being the mismatched value (a real 61-item array), not from re-dumping fields that
already matched.

## Resolved (no tflw code change needed)

### 3. Correlated array-element JSON-path predicates — ✅ resolved (2026-07-07), no tflw change

The original writeup (kept as historical record at [§3 below](#3-correlated-array-element-json-path-predicates))
was itself correct about the symptom — `expect any body.productId equals "X"` and `expect any
body.quantity equals 2` can each be satisfied by a *different* element and still both pass — but
wrong about the fix requiring new grammar. tflw already ships the fix, as a side effect of gap #2's
`matches subset {...}` (decision 88): `any`/`all` quantify over **whole array elements** whenever
the subject path stops *at* the array itself rather than being narrowed to one field
(`evaluateQuantified`, `packages/runtime/src/interpreter.ts`, confirmed by reading the quantifier's
path-consumption logic together with `subsetMatch` in `packages/runtime/src/matcher.ts` — the
matcher receives the whole element object when no path segments remain past the array, and
`subsetMatch` correctly checks multiple keys against that one object). So instead of narrowing to
`body.productId` and `body.quantity` separately, stopping at the array and asserting a subset
correlates both fields on the same element in one statement:

```
expect any body matches subset { productId: "{productIdA}", quantity: 2 }
```

This was never tried against a correlated-pair case before now — decision 88's own log entry
mentions the `any`/`all` composition only in passing ("composes with `any`/`all` for free") without
calling out that it specifically subsumes gap #3. `packages/runtime/test/quantifiers.test.ts`
already had a passing unit test proving this composition (`` `any`/`all` compose with `matches
subset {...}` ``) — it just hadn't been connected to the gap #3 finding until this session.

**What changed here in response:** `tests/order-items.tflw`'s demo test dropped its `@gaps` tag,
renamed to describe the real fix, and its `let result = assert item quantity(...)` JS-helper line
was replaced by the one-line `expect any body matches subset {...}` above (the two independent,
individually-passing `any` lines are kept just above it, deliberately, as the "looks right, isn't"
trap for a reader). `tests/large-order.tflw` got the identical treatment at 61-item volume — same
one-line fix, no slower at scale. `tests/helpers/find-item.ts` (the JS workaround) is deleted; it's
no longer used anywhere in this suite.

**Verified 2026-07-07:** see the M7 entry in `PROGRESS.md` for the fresh-restart / `tflw check` /
`tflw run` / `--workers 4` evidence.

## Confirmed-by-design (not gaps)

- **No native page-walk primitive.** The DSL has no loops/conditionals by design (SPEC §7.5,
  P#25) — a single `api` step sees one page; walking every page of `GET
  /products?page=N&pageSize=M` (offset) or following a cursor `Link` header (keyset) both need
  the JS escape hatch (`tests/helpers/paginate.ts`). Confirms the fence works as intended rather
  than leaking; not re-ranked.
- **No fixed-delay/`sleep` primitive.** SPEC §9.3 (P#8): "every step auto-waits; `sleep` does not
  exist — only `wait until <condition>`." A deliberate design decision, not an oversight. It
  compounds with gap #4 in `tests/token-expiry.tflw` (waiting out a real token TTL with a specific
  bearer header attached has no declarative route at all, since neither `sleep` nor a
  header-carrying `wait until api` exists) — that compound case is scored under gap #4, not
  ranked separately here.

## Evaluated, found *not* to be gaps

Two candidates from the original gap-hunting table turned out to be fully declarative once
actually built — worth recording so a future session doesn't re-investigate them:

- **Idempotency-Key repeat-safety** (M3): capture the header once, replay it on a second `api`
  step. Zero JS, zero ergonomic friction — `tests/http-maturity.tflw`'s two Idempotency-Key tests
  needed nothing beyond ordinary `capture`/`header`.
- **ETag/If-Match conditional-request flow** (M3): same pattern — capture `ETag`, replay as
  `If-Match`/`If-None-Match`. Fully declarative, no escape hatch anywhere in
  `tests/http-maturity.tflw`'s ETag tests.
- **Cursor pagination, single hop** (M4): capturing `nextCursor` and making one more explicit
  `api` request to follow it (`tests/reviews.tflw`) is fully declarative. Only *walking every
  page automatically* needs the escape hatch, and that's the same confirmed-by-design fence as
  offset pagination, not a separate gap.

Three more from M6's realistic-scale gap hunting (plan_v2.md Part D) turned out fully declarative
once actually exercised, at real volume/shape rather than a toy case:

- **`body from` file templates at real volume, all four interpolation-matrix combinations** (M6):
  inline-partial, inline-complete, file-partial, and file-complete body replacement
  (`tests/request-chain.tflw`'s 8-hop chain, `tests/large-order.tflw`'s 61-item template) all
  worked exactly as documented (SPEC §5.2) with zero friction — `{var}` holes interpolate
  correctly whether there are 2 of them or 61, and whether the surrounding static structure is a
  single field or a 60-element array. Confirms `packages/lang/src/parser.ts:809-826` /
  `packages/runtime/src/interpreter.ts:743-753` scale cleanly; this was a real risk worth checking
  (per plan_v2.md Part D decision 3b), not a hunch.
- **The refresh lifecycle, repeated several times in one test** (M6): `tests/token-refresh-
  lifecycle.tflw` chains three full expire→refresh→continue cycles (and confirms a
  once-rotated refresh token is genuinely revoked, not just superseded, on replay) using only the
  same JS fixed-delay workaround `tests/token-expiry.tflw` already established for a single cycle
  — no new gap, and no backend auth-lifetime work was needed (`apiV2/src/auth/auth.service.ts`'s
  rotation already handled it). The one real interaction this surfaced was operational, not a
  language gap: this suite's `admin` **session** is a real bearer access token cached once for the
  whole run under a 5s TTL, so a test with a long real delay must sort after every test that relies
  on that cached session — hence this file's name (sorts right after `token-expiry.tflw`, once all
  `as admin`/`as shopper` tests have already run).
- **HTTP Basic via the existing multi-scheme guard** (M6): once the `Authorization: Basic
  base64(...)` header value exists, `AnyAuthGuard` accepting it (`tests/basic-auth.tflw`) needed no
  DSL changes at all — the *only* friction was producing that header value declaratively, tracked
  separately as gap #9 below.

---

## 1. No cookie-subject / cookie-jar — ✅ fixed, see [Fixed](#fixed) above

This section is kept as the original gap writeup (proposed syntax, cross-check, and the exact
crash it used to cause) for historical record — the gap itself is closed as of tflw 0.1.0
(2026-07-07); this repo's own `tests/.gaps/cookie-jar.tflw` no longer exists (moved to
`tests/cookie-jar.tflw`, now a passing proof).

`capture header "set-cookie" as x` captures every `Set-Cookie` line, newline-joined if there's
more than one (SPEC §5.4, decision 61) — correct for *reading* them, but there's no declarative
way to turn that back into a `Cookie` header a real cookie jar would send (attribute-stripped, one
line, last-value-wins per name). Reusing the whole raw capture as a `Cookie` header value happens
to work when a response sets **exactly one** cookie (`cookie-parser` tolerantly parses the
leftover `Path=/`/`HttpOnly`/etc. as junk keys alongside the real one) — the pattern
`tflw.config`'s `shopper` session and most of `sessions.tflw` rely on. It breaks the moment a
response sets **two or more** cookies at once (`/auth/session-login-full`'s `session` +
`session_refresh`): the newline-joined capture puts a literal `\n` inside an HTTP header value.

**Executable proof** (`tests/.gaps/cookie-jar.tflw`, confirmed 2026-07-07): this is a real
`FAIL 0/1`, not a graceful 4xx —

```
request failed: GET .../auth/profile — Headers.append: "session=...\nsession_refresh=..." is
an invalid header value.
```

The request never leaves the process; the WHATWG Headers API rejects the embedded `\n` outright.
There's no escape-hatch workaround *inside* a `session` block (which disallows `use`/`action`
calls); one exists ad hoc for a non-cached login (parse the joined string, split on `\n`, take the
`name=value` prefix before the first `;` on each line, re-join with `; `) — but nothing in this
suite already needed that path, since `sessions.tflw`'s dual-cookie test only ever asserts on the
raw header rather than chaining it forward.

**Proposed syntax:** a first-class cookie subject (SPEC §16 P#33) — tracks cookies by name,
applies `Set-Cookie` attribute semantics (expiry, path, `Max-Age` overriding older values), and
re-serializes only `name=value` pairs, comma/semicolon-joined per the real `Cookie` header grammar,
on the next request in the same session or test:

```
session shopper
  api POST /auth/session-login-full body { email: ..., password: ... }
  expect status equals 200
  # cookies auto-tracked from Set-Cookie, no manual capture/replay needed
```

**Cross-check:** Postman, Insomnia, RestAssured, and Playwright's `BrowserContext` all maintain a
persistent cookie jar automatically across requests in the same session — tflw's raw-header-
capture model is the outlier here, not the norm.

## 2. No partial-object / subtree JSON matching — ✅ fixed, see [Fixed](#fixed) above

This section is kept as the original gap writeup (proposed syntax, cross-check) for historical
record — the gap itself is closed as of tflw 0.1.0 (2026-07-07); the proposed syntax below is
exactly what shipped, and `tests/schema-and-shape.tflw`'s demo test now uses it for real.

`equals` does a full deep-equal (exact match, every field); `contains` only works on strings
(substring) and arrays (element deep-equal) — there is no "this object has at least these
key/value pairs, ignore the rest" matcher. Every RFC7807 shape assertion in this suite (`crud-
lifecycle.tflw`, `http-maturity.tflw`'s 405/409/412/415/406 tests, `reviews.tflw`'s 409 test) needs
one `expect body.<field> equals <value>` line per field instead of one structural statement — and
there's no way to assert "ignore the variable `errors` array, but check everything else" in one
go. `tests/schema-and-shape.tflw` demonstrates the working N-statement version.

**Proposed syntax** (SPEC §16 P#14, already parking-lotted):

```
expect body matches subset { type: "about:blank", title: "Unprocessable Entity", status: 422 }
```

**Cross-check:** Jest's `expect.objectContaining()`, Chai's `to.deep.include()` (used by Postman's
`pm.expect`), and RestAssured's partial-JSON-schema validation all support this natively — tflw's
`equals`/`contains` pair is the narrower of the two common patterns.

## 3. Correlated array-element JSON-path predicates — ✅ resolved, see [Resolved](#resolved-no-tflw-code-change-needed) above

This section is kept as the original gap writeup (the symptom description was accurate; the
"needs new grammar" conclusion was not) for historical record — see the Resolved section above for
what actually fixes it and why, with no `testFlow/` code change.

`any`/`all` (SPEC §6.3) each check **one field per array element**, independently. Two separate
`any` assertions — `expect any body.productId equals "X"` and `expect any body.quantity equals
2` — can each be satisfied by a **different** element and still both pass, proving nothing about
whether the item with `productId=X` actually has `quantity=2`. `tests/order-items.tflw`'s demo test
(and `tests/large-order.tflw` at 61-item volume) built a genuine multi-item order specifically to
make this observable.

**Originally proposed syntax** (superseded — not needed): a JSONPath-style filter predicate inside
the quantifier's path, `expect any body[?(@.productId == "{productIdA}")].quantity equals 2`. The
actual fix uses tflw's existing grammar instead: `expect any body matches subset { productId: "X",
quantity: 2 }`.

## 4. `wait until api` cannot carry per-step headers

Confirmed by reading the parser (`packages/lang/src/parser.ts`): `parseApiStep` calls
`parseApiHeaders()` after the request line; `parseWaitUntilApi` does not. Attempting it is a parse
error, not a runtime one — `tests/.checkonly/wait-until-headers.tflw` reproduces the exact
diagnostic:

```
error[TF010]: only `expect` lines may follow `wait until api`, found `header`
```

Session headers (`as <session>`) still apply automatically (threaded through
`EvalCtx.sessionHeaders` at request-build time, not parsed per-step), but a dynamically-generated
or per-test header value (a specific bearer token, a namespace, an idempotency key) cannot be
attached to a poll. `tests/token-expiry.tflw` is the concrete scenario this forces: waiting for a
specific access token to expire needs a per-poll `Authorization: Bearer <that token>` header,
which `wait until api` simply cannot express — the workaround abandons `wait until api` entirely in
favor of a JS `setTimeout` (`tests/helpers/wait-seconds.ts`) followed by a plain `api` step (which
*can* carry a header).

**Proposed syntax:**

```
wait until api GET /auth/profile
  header "Authorization" is "Bearer {accessToken}"
  expect status equals 401
```

**Cross-check:** Playwright's `page.waitForResponse` and RestAssured/Awaitility-style polling both
let you construct the full request (headers included) on every attempt — this is a real, narrow
gap relative to those tools, not a design philosophy difference.

## 5. No `Retry-After`-aware retry

`retry N` (SPEC §4.4) is fixed-count only — no way to read a response header to schedule the next
attempt. `tests/reviews.tflw`'s two `@ratelimit` tests are the concrete case: a `429` carries a
real `Retry-After` value, and honoring it needs `tests/helpers/sleep-and-retry.ts`'s JS `setTimeout`
followed by the DSL re-issuing the request as an ordinary `api` step.

**Proposed syntax:**

```
api POST /products/{productId}/reviews body { rating: 5 }
  header "Authorization" is "Bearer {userBToken}"
retry honoring Retry-After up to 3
```

**Cross-check:** mainstream HTTP clients (axios-retry, `got`'s retry option) support this as a
built-in retry strategy; Postman/Insomnia don't have it natively either — tflw isn't uniquely
behind mainstream *testing* tools here, just behind general-purpose HTTP clients.

## 6. No schema/contract validation against `/openapi.json`

No way to reference an externally-documented schema (the API's own generated OpenAPI spec) and
validate a response's structural conformance in one statement. `tests/schema-and-shape.tflw`'s
second test is the working route: a hand-rolled structural validator
(`tests/helpers/schema-check.ts`, no ajv/json-schema dependency — deliberately minimal, just
`type`/`required`/`nullable` checks) fetches `/openapi.json`, looks up the named schema, and throws
on mismatch (the call itself is the assertion, since there's no subject to `expect` against).

Ranked lower than gaps #1-#5 despite the potential value: this API only documents a handful of
response schemas today (`ProductResponseDto`, added specifically for this demo), so the *frequency*
this would actually recur across a typical suite is still low until more endpoints carry
`@ApiOkResponse` annotations — a fact this exercise itself surfaced, not a tflw limitation.

**Proposed syntax:**

```
expect body matches schema from "/openapi.json"
```

(Resolving "which schema" from the endpoint actually called, not a hardcoded name — a materially
harder problem than gap #2's static subset-literal, since it requires OpenAPI operation-to-schema
resolution at runtime.)

**Cross-check:** Postman's built-in "Validate schema" (via `ajv`), RestAssured's
`matchesJsonSchema(...)`, and dedicated contract-testing tools (Pact, `openapi-diff`) all solve
this — already correctly identified and parking-lotted in `testFlow/SPEC.md` §16 (P#3,
"OpenAPI/contract").

## 7. Only one `session` may be opted into per test

`test ... as <session>` is a single optional clause. Genuinely interleaving two identities in one
test (user A vs. user B vs. admin, all in the same flow) needs an inline ad hoc login for every
identity but one — the pattern this whole suite ended up leaning on constantly:
`tests/authz.tflw`, `tests/order-items.tflw` (×2), `tests/jobs.tflw` (×2), `tests/reviews.tflw`
(×4 — nearly every test needs a second reviewer), `tests/http-maturity.tflw`'s cross-user
Idempotency-Key test. Ranked lowest: the workaround is one extra `api POST /auth/login` block,
genuinely trivial, just voluminous.

**Proposed syntax:**

```
test "..." as admin, userA
```

**Cross-check:** not a common named limitation elsewhere (Postman/RestAssured collections just use
separate variables for as many identities as needed) — mostly notable because it wasn't obvious
from SPEC prose alone until this suite hit it dozens of times.

## 8. Failure diffs are completely untruncated, no per-field ignore/exclude — ✅ fixed, see [Fixed](#fixed) above

This section is kept as the original gap writeup (the exact 11,248-char evidence, and the
originally-proposed `max diff N` clause syntax) for historical record — the gap itself is closed as
of tflw 0.1.0 (2026-07-07). The shipped fix (decision 90) uses a hardcoded default cap plus a
subset-aware mismatch diff instead of the `max diff N` per-`expect` clause proposed below — no new
grammar, same minimal-footprint pattern as decisions 87/88.

Found deliberately, per plan_v2.md Part D decision 5: `tests/.demo-fail/large-response-diff.tflw`
asserts a wrong shape against a real 61-item order response
(`tests/large-order.tflw`/`tests/payloads/large-order.json`'s same fixture). The mismatch message
used to be built from a bare `JSON.stringify(actual)`, no length cap, no configurable per-field
ignore/exclude list, producing **one 11,248-character line** — the entire 61-item order (every id,
every `unitPrice`, every nested field) dumped flat into the CLI and `report/report.html` alike:

```
expect body matches subset { status: "definitely-not-a-real-status", items: "definitely-not-an-array" }
  expected body to match subset {"status":"definitely-not-a-real-status","items":"definitely-not-an-array"}, but got {"id":"7b70b1b7-...","userId":"...","status":"pending",...,"items":[{"id":"...","quantity":1,"unitPrice":"3.00"},{...60 more items...}]}
```

**Originally proposed syntax** (superseded — not needed): a per-`expect` `max diff N` clause.

```
expect body matches subset { status: "...", items: "..." } max diff 2000
```

**Cross-check:** Jest's snapshot diffs truncate long strings/arrays by default and highlight only
the changed lines; Playwright's expect diffs are similarly bounded.

## 9. No `base64(...)` (or general string-transform) generator function

Found while covering HTTP Basic auth (plan_v2.md Part D decision 9): `apiV2`'s `AnyAuthGuard` now
accepts `Authorization: Basic base64(email:password)` uniformly alongside bearer/session
(`tests/basic-auth.tflw`), and that guard itself needed no DSL support at all — the friction is
entirely upstream, producing the base64-encoded credential value in the first place. tflw's
generator list (SPEC §5, `unique(...)`, `random number/string/of/like`) has no string-transform
generator of any kind, so `tests/helpers/basic-auth.ts`'s one-line JS helper
(`Buffer.from(...).toString('base64')`) is the only route — checked against the parser/AST, there
is no `Base64Expr`/similar node.

Ranked below gap #8 (this is a single narrow, single-purpose gap, not a recurring reporting
problem) but above gap #10 (it forces a *whole JS file* for what would otherwise be a one-line
declarative header, not just an unrecoverable behavior difference): this is arguably a legitimate
missing **generator** rather than "computation" in the SPEC §7.5 sense — it's a pure, deterministic
value transform with no branching/looping, the same shape as the generators that already exist.

**Proposed syntax:**

```
header "Authorization" is "Basic {base64(env(ADMIN_EMAIL) + \":\" + env(ADMIN_PW))}"
```

(Exact surface syntax is an open question — this presupposes string concatenation exists too,
which it doesn't either; a narrower, more likely shape is a dedicated two-argument generator:
`basic credential(email, password)` alongside `unique(...)`/`random ...`.)

**Cross-check:** Postman has a built-in "Basic Auth" auth-type picker that encodes the header for
you with no scripting; Insomnia and RestAssured both do the same. tflw is the outlier in requiring
a JS escape hatch for a scheme this standard.

## 10. `upload "..." as "field"` can't specify or infer a file's Content-Type

Found while covering multipart uploads (plan_v2.md Part D decision 8):
`tests/body-types.tflw`'s upload test expects (and gets) `application/octet-stream` for a `.png`
file, not `image/png`. Confirmed by reading `packages/runtime/src/interpreter.ts:772`: the
multipart builder wraps the file in `new Blob([new Uint8Array(buf)])` with no `type` option, so
multer always falls back to the generic default — there is no way, declarative or JS-escape-hatch,
to influence this from inside a `.tflw` file (the `upload` step's file-reading is entirely
runtime-internal, not something a `use`d helper can intercept).

Ranked lowest of the three M6 findings: it only matters when a test specifically wants to assert
the *received* Content-Type (uncommon — most upload tests care about the file landing intact, not
its sniffed MIME type), but unlike gaps #3/#9 there is genuinely no workaround at all, not even an
unergonomic one.

**Proposed syntax:**

```
upload "./payloads/sample.png" as "image" type "image/png"
```

**Cross-check:** Postman's form-data file fields let you override the Content-Type per part;
`curl -F 'image=@sample.png;type=image/png'` and most HTTP client libraries (axios, `got`, Python
`requests`) all support an explicit per-file MIME type override. tflw inferring nothing at all
(not even from the file extension) is the narrower behavior.
