# tflw declarative-expressiveness gaps (ranked)

**Successor to `TFLW-FEATURE-GAPS.md`.** That file's five findings (from the M1/M1.5 sessions) are
folded in here, re-verified against the finished v2 suite, and joined by three new findings
M5 specifically went looking for. Per plan_v2.md Part C: **tflw itself (`testFlow/`) is not touched
by this document** — these are backlog notes for a future testFlow session (see
`testFlow/PLAN.md`'s new milestone stub), not fixes. Every entry below was built and verified
against the real, running v2 API — none of this is speculative.

**Criterion for "real gap":** the scenario is legitimately declarative — an ordinary assertion or
data-shape check, not a loop/branch/state-machine a language that deliberately has neither (SPEC
§7.5) was never going to offer natively. Findings that fail this bar (page-walking, arbitrary
retry backoff logic) are listed separately as **confirmed-by-design**, not ranked as gaps.

## Ranked

Gap numbers are stable identifiers (cross-referenced from `testFlow/PLAN.md`'s decision log and
this repo's own task tracking) — a fixed gap keeps its number rather than the table renumbering
around it. See **Fixed**, below, for #1.

| # | Gap | Severity × Frequency | Proof |
|---|---|---|---|
| 1 | ~~No cookie-subject / cookie-jar~~ | — | **✅ Fixed — see [Fixed](#fixed) below** |
| 2 | No partial-object / subtree JSON matching | **Medium × High** — recurs in nearly every error-shape or structural assertion in the suite | `tests/schema-and-shape.tflw` |
| 3 | Correlated array-element JSON-path predicates | **High × Low** — low occurrence, but the failure mode is a *silent false pass*, not a visible error | `tests/order-items.tflw`'s last test |
| 4 | `wait until api` cannot carry per-step headers | **Medium × Low-Medium** — blocks any poll needing per-attempt auth (async jobs, token-expiry chains) | `tests/.checkonly/wait-until-headers.tflw` (parse-time), `tests/token-expiry.tflw` (the real scenario it forces) |
| 5 | No `Retry-After`-aware retry | **Medium × Low** — only recurs where the API rate-limits, but that's a common real pattern | `tests/reviews.tflw`'s two `@ratelimit` tests |
| 6 | No schema/contract validation against `/openapi.json` | **Medium × Low** — high potential value, low current occurrence (few endpoints document response schemas yet) | `tests/schema-and-shape.tflw` |
| 7 | Only one `session` may be opted into per test | **Low × High** — trivial one-line workaround, but recurs constantly | `tests/authz.tflw`, `tests/order-items.tflw`, `tests/jobs.tflw`, `tests/reviews.tflw`, `tests/http-maturity.tflw` |

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

## 2. No partial-object / subtree JSON matching

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

## 3. Correlated array-element JSON-path predicates

`any`/`all` (SPEC §6.3) each check **one field per array element**, independently. Two separate
`any` assertions — `expect any body.productId equals "X"` and `expect any body.quantity equals
2` — can each be satisfied by a **different** element and still both pass, proving nothing about
whether the item with `productId=X` actually has `quantity=2`. Confirmed by reading
`evaluateQuantified` (`packages/runtime/src/interpreter.ts`): the quantifier maps each array
element through the *same single remaining path*, matcher-per-element, with no way to correlate
two fields on the same matched element. `tests/order-items.tflw`'s last test builds a genuine
two-distinct-item order specifically to make this observable, then falls back to a JS `find()`
helper (`tests/helpers/find-item.ts`) to do the correlated check for real.

This is ranked above gaps #4-#7 despite low frequency because the failure mode is **a silent false
pass**, not a visible error — a test author who doesn't know about this can ship a scenario that
looks like it verifies a specific item's quantity and doesn't.

**Proposed syntax:** a JSONPath-style filter predicate inside the quantifier's path:

```
expect any body[?(@.productId == "{productIdA}")].quantity equals 2
```

**Cross-check:** real JSONPath (used by RestAssured's `jp.query()`, Playwright via custom JS,
`jsonpath-plus`) supports `[?(@.field==value)]` filter expressions natively — tflw's quantifiers
are a deliberately smaller, closed subset (P#13) that doesn't cover this case.

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
