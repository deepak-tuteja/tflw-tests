# VULNS.md — the known-answer ledger for tflw's pentest arc

Every deliberately-flawed and deliberately-hardened response this suite can produce, and which
tflw rule each one is the answer to. Written for testFlow `M128a`
([PLAN_M128_PENTEST_TIER1.md](../testFlow/PLAN_M128_PENTEST_TIER1.md), D293/D295); consumed by
`M128c`'s acceptance pass, which measures the Tier 1 rule pack's precision and recall against it.
Extended for `M130a` ([PLAN_M130_PENTEST_TIER2.md](../testFlow/PLAN_M130_PENTEST_TIER2.md), D317)
with the arc's Tier 2 slice — broken object authorization.

**A planted flaw with no row here is how a target drifts out of sync with the acceptance that
depends on it.** So the rule is: no route in `apiV2/src/vuln/` without a row, and no row without a
route. `scripts/verify-security-target.mjs` enforces both halves against the running stack —
it curls every case below and asserts the header, cookie and authorization facts this file claims.

**Nothing in this file is a real vulnerability in a real endpoint.** The `vuln/` slice is gated
behind `VULN_MODE=1` and absent from the app entirely without it, and every flaw lives in a route
that exists only to carry it. `plan_v2.md` §4.2's rule — real endpoints stay clean — is what makes
the other ~45 files' results mean anything.

## How to run against it

```
VULN_MODE=1 node cli.mjs start          # the stack, with the fixture slice present
node scripts/verify-security-target.mjs # assert every claim below against it
node scripts/verify-sarif-acceptance.mjs # assert the SARIF document says the same thing (M135c)
```

Three graders read this table, and they read it for different reasons.
`verify-security-target.mjs` asks whether the *target* still answers the way the rows claim — a
failure there means apiV2, nginx or this file disagree, never that tflw regressed.
`verify-security-acceptance.mjs` and `verify-input-acceptance.mjs` ask which rules fired, stayed
silent, or stood down in the *run report*. `verify-sarif-acceptance.mjs` asks whether the
**machine-readable document** tflw hands to a code-scanning UI carries the same answer — which
matters because that is the one artifact whose mistakes are silent: an invalid or mis-anchored SARIF
file uploads successfully and produces no alerts at all. A row edited here without editing that
script is a row two graders check and one no longer does.

The plaintext base is `env local` (`http://localhost:4001/v1`, straight to the app). The TLS base is
`env secureLocal` (`https://localhost:8443/v1`, through M22's nginx sidecar). Several rules answer
differently on the two, and that difference is itself part of the ledger.

## The fixture routes (`VULN_MODE=1` only)

| id | route | serves | for rule | severity |
|---|---|---|---|---|
| `V1` | `GET /v1/vuln/cors-wildcard` | **positive** | `sec/cors-wildcard-with-credentials` | critical |
| `V2` | `GET /v1/vuln/cors-scoped` | **negative** | `sec/cors-wildcard-with-credentials` | — |
| `V3` | `POST /v1/vuln/weak-cookie` | **positive** | `sec/cookie-not-httponly` · `sec/cookie-samesite-none` · `sec/cookie-not-secure` (https only) | critical · moderate · critical |
| `V4` | `GET /v1/vuln/document` | **positive** | `sec/csp-missing` · `sec/x-frame-options` | serious · moderate |
| `V5` | `GET /v1/vuln/document-hardened` | **negative** | `sec/csp-missing` · `sec/x-frame-options` · `sec/hsts-missing` · `sec/nosniff-missing` · `sec/authenticated-response-cacheable` | — |
| `V6` | `GET /v1/vuln/orders/:id` | **positive** | `sec/authz-object-leak` | critical |
| `V7` | `GET /v1/vuln/orders` | **positive** | `sec/authz-collection-leak` | critical |
| `V8` | `DELETE /v1/vuln/orders/:id` | **probed, never judged** | `sec/authz-object-leak` (under `probe mutating` only) — see the bound below | critical |
| `V9` | `PUT /v1/vuln/orders/:id` | **positive** | `sec/authz-object-leak` (under `probe mutating` only) | critical |
| `V10` | `GET /v1/vuln/lookup?q=` | **positive** | `sec/reflected-input-unescaped` | moderate |
| `V11` | `GET /v1/vuln/items/:id` | **positive** | `sec/path-traversal-read` (under `probe traversal` only) | critical |
| `V12` | `POST /v1/vuln/notes` — `body.text` | **positive** | `sec/error-detail-disclosure` (under `probe mutating` only) | serious |
| `V13` | `POST /v1/vuln/notes` — `body.title` | **positive** | `sec/oversized-input-accepted` (under `probe mutating` + `probe oversized`) | minor |
| `V14` | `GET /v1/vuln/lookup-escaped?q=` | **negative** | `sec/reflected-input-unescaped` | — |

`V1`–`V5` are Tier 1's, and they are claims a response makes about *itself* — headers and cookie
flags. `V6`–`V9` are Tier 2's, and they are claims about *who is allowed to see what*, which is a
different kind of fixture: nothing in the response is malformed, and every one of them is a `200` a
correct endpoint would also have returned to somebody. `V10`–`V14` are Tier 3's, and they are claims
about what the application does with an input it did not expect — so unlike either tier before them
these fixtures are judged on a response to a request *tflw constructed*, not to the one the suite
made.

What each one actually sends:

- **`V1`** — `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Credentials: true`.
- **`V2`** — `Access-Control-Allow-Origin: https://storefront.example`,
  `Access-Control-Allow-Credentials: true`, `Vary: Origin`. Applicable and correct.
- **`V3`** — `Set-Cookie: sid=fixture-session-value; Path=/; SameSite=None`. No `HttpOnly`, no
  `Secure`. Named `sid` so it can never collide with the real `session` cookie in tflw's jar.
- **`V4`** — `Content-Type: text/html`, and none of `Content-Security-Policy` / `X-Frame-Options`.
- **`V5`** — `Content-Type: text/html` plus `Content-Security-Policy: default-src 'self';
  frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Cache-Control: no-store`.

- **`V6`** — an order by id with no ownership check at all. Authenticated (`AnyAuthGuard`, so a
  credential-less caller still gets `401`) and not authorized. Relations mirror
  `OrdersService.findOneScoped` exactly — order → items[] → product → category — so the leaked
  object is byte-identical to the one its owner would have received. `ParseUUIDPipe` is kept, and a
  missing order is a `404`: the route plants exactly one defect.
- **`V7`** — every user's orders, unfiltered, with `findOwn`'s relations and ordering. The clean
  counterpart `GET /v1/orders` answers the same `200` with a JSON array; only *which* orders are in
  it differs.
- **`V8`** — deletes any order and answers `{ "deleted": true, "id": "<the id>" }`. Genuinely
  destructive; `order_items`, `jobs` and `return_requests` all cascade on the order FK. **Probed
  under `probe mutating` and never judged** — the bound is recorded below, and `V9` is the route
  that supplies what this one structurally cannot.
- **`V9`** — writes `status` on any order and answers with the whole order, owner's `userId` and
  all. The same missing check as `V6`, on a mutating verb. **Idempotent on purpose**: the row is
  left where it was, so a probe replaying the owner's request receives the owner's order and the
  identity comparison that judges `V6` is reachable through a `PUT`. An unknown status is a `400`;
  a missing one re-writes the value already there, so a body-less replay is still idempotent rather
  than failing in a way that would read as the boundary holding. The clean counterpart is the app's
  own `PATCH /v1/orders/:id/items/:itemId`, which routes through the same `findOneScoped` as
  `GET /v1/orders/:id` — one check refusing a non-owner on both the read and the write, and `V9`
  is that check's absence.

**Two of the first five are clean, and that is the part worth reading twice.** Clean apiV2 gives
`csp-missing`, `x-frame-options` and `cors-wildcard-with-credentials` their *not-applicable* case —
its responses are JSON and same-origin, so those rules never engage. A rule that never engaged has
not been shown to stay silent, so `V2` and `V5` exist to supply the **negative** that clean apiV2
structurally cannot.

**Tier 2's slice is shaped the other way round, and the reason is the more interesting half of
`M130a`.** Its negatives need no fixture at all: the real `GET /v1/orders/:id` and `GET /v1/orders`
*are* the negative cases, because they are correct. `PLAN_M130_PENTEST_TIER2.md` §0(d) went looking
for a natural BOLA in this app and found none — every owner-scoped resource routes through a scoping
service, and the `:id` routes with no `@CurrentUser` (`/orgs/*`, `/products/*`, `/categories/*`) are
`@Roles(ADMIN)` platform-operator surfaces by design. That is the opposite of `M128a`, which found
two real defects in `auth.service.ts` by reading. So Tier 1 had to plant its *negatives* and Tier 2
has to plant its **positives**, and `plan_v2.md:765`'s claim that a "missing `ParseUUIDPipe` IDOR
already occurs naturally" is no longer true of this tree — every `:id` route reached carries the
pipe.

### The clean counterparts `V6`–`V8` are measured against

Not fixtures. These are the real routes, and their correctness is the negative half of the
acceptance bar.

| case | request, as a non-owner | expected |
|---|---|---|
| `sec/authz-object-leak` **negative** | `GET /v1/orders/{someone else's id}` | `403 not your order` (`orders.service.ts:409`) |
| `sec/authz-object-leak` **negative** | the same, unauthenticated | `401` — `AnyAuthGuard` |
| `sec/authz-collection-leak` **negative** | `GET /v1/orders` | `200`, containing only the caller's own orders |
| both rules **not applicable** | any request whose *owner* response was not `2xx` | nothing to leak (tflw D315) |

**An admin is a non-owning principal that legitimately gets `200`.** `findOneScoped` admits the
owner, any admin, and an owner/admin of the placing user's org. That is correct behaviour and it is
indistinguishable from `V6` by status code alone — which is why tflw's oracle compares resource
identity rather than status (D305), and why `session admin` has to be declared `privileged` in the
acceptance config (D307, landing in `M130c`).

### The CSRF caveat, which is a real limit on what Tier 2 can probe

`AnyAuthGuard` requires an `X-CSRF-Token` header matching the session token's own claim on every
`POST`/`PUT`/`PATCH`/`DELETE` made with a **cookie** session, and a tflw `session` block does not
expose that token to the test (`tests/api/identity/sessions.tflw` captures `body.csrfToken` by hand
for exactly this reason).

So a cookie-borne probe of a mutating endpoint is refused with `403 missing or invalid CSRF token`
**before the authorization check runs at all**. Under a differential oracle that reads a `403` as
"correctly denied", that is a false negative — the probe never reached the code whose authorization
was in question. Two consequences, both deliberate:

1. **`session peer` is bearer, not cookie**, correcting `PLAN_M130`'s D317 (which said "cookie
   transport, mirroring `shopper`"). What mattered about mirroring `shopper` is that `peer` is an
   ordinary user rather than an administrator — a fact about the seeded role, not the transport.
   `authz.tflw`, this file's control, already logs user B in over `/auth/login` for the same reason.
2. **`shopper` remains a cookie session and remains in the probe set**, so a mutating probe as
   `shopper` under `probe mutating` will hit CSRF rather than authorization. That is a limitation of
   the target's transport, not of the rule, and tflw should say so rather than count it as a
   refusal — filed for `M130b`.

**Closed, and graded here since `M136c`.** `M130b` gave the outcome its own kind (`inconclusive`,
D325) so the tier stopped scoring the refusal as clean; `M136a` gave it a way *out of the run* —
`scanBlindSpot.declines`, which reaches the console line, `results.json` and SARIF's
`tflw/notApplicable`. `verify:security-acceptance` now asserts the whole path against this guard:

```
authorization declined 1×: `shopper` — a cookie-borne principal was refused on a DELETE (403);
this may be CSRF rather than authorization, since a cookie session cannot supply the CSRF token
a mutating request needs. Give it a bearer session to judge it
```

**Why it is graded here and not only in tflw.** tflw proves the same reporting against a `node:http`
fixture that `403`s any mutating request without the header — fast, deterministic, and a defence
tflw wrote in order to be caught by tflw, which is `M130-01`'s own failure mode wearing a test's
clothes. The `403` above is issued by `apiV2/src/auth/guards/any-auth.guard.ts:70-75`, through nginx
and NestJS, by a guard written for the app.

**What the grader checks that the probe counts do not.** `V8` and `V9` already assert
`inconclusive: 1`. If D325's cookie-borne branch stopped matching, the probe would fall through to
the generic *"the host answered 403, which is not an authorization decision"*, still land in
`inconclusive`, and every ledger row would still pass — so the assertion is on the **reason**, and
its control is `shopperBearer`: the same human on a bearer token, who meets no CSRF pre-flight, is
never declined, and leaks outright on `V9`.

### The Tier 3 plants `V10`–`V14`, and why a whole new controller was needed

`M134c` (testFlow [PLAN_M134_PENTEST_TIER3.md](../testFlow/PLAN_M134_PENTEST_TIER3.md), D379/D395)
adds the arc's third tier — input handling — and it could not reuse a single existing route.
Measured at scoping time rather than discovered at build time:

| route | mutable input tflw can reach |
| --- | --- |
| `V1`,`V2`,`V4`,`V5`,`V7` | none — bare `@Get` |
| `V3` | none — bare `@Post` |
| `V6`,`V8`,`V9` | `:id` behind **`ParseUUIDPipe`** |
| `V9` | `body.status` — added by `M132b` for an unrelated reason |

There is **no `@Query()` anywhere** in the fixture slice and every `:id` is pipe-guarded, and
`ParseUUIDPipe` rejects type confusion and traversal with a `422` before any application code runs.
Tier 3 mutates the inputs of a request the suite already made; pointed at that, it grades a wall of
rejections and reports clean. That is `M132b`'s D363 trap — *a positive nobody can answer passes on
nothing* — one tier later and in its other form: not *who* can answer, but *what is there to mutate*.

**Each plant answers a detector, not an invariant's name.** Every rule in the Tier 3 pack ships with
a narrowing that exists to hold Tier 1's zero-false-positive bar, and a plant written to the name
alone satisfies none of them:

- **`V10`** serves **`text/html`**. `sec/reflected-input-unescaped` explicitly declines a JSON echo —
  echoing `<tflw>` inside a JSON string is correct, since JSON has no markup semantics — so a
  handler returning an object would leave the rule standing down. Only
  `injection/html-metacharacters` fires; `{{7*7}}` reaches the route, comes back verbatim, and is
  correctly not a reflection finding because it carries no angle brackets.
- **`V11`** returns the **file's contents**. `sec/path-traversal-read` matches a filesystem
  signature (`root:…:0:0:`), never a path echo, precisely so an app that reflects the attempted path
  in an error cannot be scored as having read a file. Its id is `7` because tflw recognises only a
  UUID, a run of digits or a long hex string as an identifier segment — a slug is not a mutation
  site at all, and the plant would have been lost to a `TF067` complaint about the *test*.
  Only `traversal/relative` escapes; the encoded, doubled-dot and absolute variants `404`, because
  this handler does no `../` stripping and no second decode. One firing payload, not a class.
- **`V12`** **catches and serializes** the driver error. `ProblemDetailsFilter` is global and
  unconditional, so an uncaught error becomes `{"detail":"an unexpected error occurred"}` with the
  stack sent to the logger — the cheap version of this plant produces a scrubbed `500` that matches
  no detector. The evidence is the ORM class name `QueryFailedError`, deliberately not a Postgres
  wording: `tflw'` produces *unterminated quoted string at or near…*, which is **not** the
  `syntax error at or near` literal tflw carries, so a plant keyed on the phrasing would pass today
  and break on an upgrade. Only `injection/sql-quote` fires — a double quote and a trailing
  semicolon are valid inside a single-quoted SQL literal and produce no error at all.
- **`V13`** is a DTO with `@IsString()` and **no** `@MaxLength()`. "No decorators" would not be a
  permissive DTO: `whitelist: true` strips every undecorated property and the handler would receive
  `{}`. The 64 KiB value is accepted with `201` at **both** body leaves, so one permissive DTO
  yields two findings with two fingerprints — correct rather than duplicated, since two unbounded
  fields are two repairs.

- **`V14`** is `V10` with an escape and nothing else changed — same `text/html` body, same query
  site, `&<>"'` replaced before interpolation so `<tflw>` comes back as `&lt;tflw&gt;`. It is the
  only **negative** in this tier, and it exists because the tier's other negative cannot cover this
  rule: `GET /v1/products?q=` answers JSON, and `sec/reflected-input-unescaped` declines a JSON echo
  by design, so the rule stands down there as *not applicable* rather than quiet. A rule that never
  engaged has not been shown to stay quiet — Tier 1 learned that as `V2`/`V5`, and this is the same
  lesson one tier on. With `V14` the rule is applicable, probed, answered and silent.

**`V12` and `V13` share one route on purpose**: a single observed request offering two
independently-attributable mutation sites is what makes per-site attribution demonstrable at all.

**`V10` and `V14` are a controlled pair**, and the ledger rows for them are identical but for the
violation count: same `moderate` floor, same three rules in play, same one withheld, same six probes
over one site. The only difference between the two runs is whether the application escapes. That is
what makes the reflection rule's silence a measurement instead of an absence.

**`V11`'s positive is reachable on the app's own listener and NOT through the sidecar, and that is a
fact about the deployment rather than about the app.** nginx decodes and normalises the request URI,
so `..%2f..%2f..%2f..%2fetc%2fpasswd` answers **`400`** at `https://localhost:8443` and never reaches
the handler. This was measured, not predicted: the row was first written against `secureLocal`, where
it sent nine probes, collected nine rejections, and reported `sec/path-traversal-read` as
applicable-and-silent — a rule that looks tested and is not.

So the acceptance corpus grants `probe traversal` on the **plaintext** env only, and `probe oversized`
on the **secureLocal** env only. Each opt-in then has a granted env and a withheld env, which is how
one corpus demonstrates the fires / silent / not-applicable states for both. **The app is vulnerable
and its deployment is not**; those are different claims about different things, and a corpus running
against a single base could not have separated them.

**One measured limit, recorded so nobody reads it as untested.** The oversized payload also targets
query parameters, and a 64 KiB query against `V10` returns **`431 Request Header Fields Too Large`**
— Node's default `--max-http-header-size` is 16 KiB and the request line counts toward it. That is
an ordinary non-finding on any Node server; body leaves are where the `oversized` class earns its
opt-in.

**The control for `V12` is a real endpoint, deliberately.** `GET /v1/products?q=` is a free-text
string that reaches Postgres full-text search — the same journey `V12`'s `text` makes — differing
only in being parameterised. `injection/sql-quote` lands in a real query there and returns `200`
with results; the identical payload on `V12` returns a serialised `QueryFailedError`. That pairing
is what makes the rule evidence rather than an assertion, and it is why the negative half of the
Tier 3 corpus names a route with a *database* behind it rather than a paginator.

### D380 — Tier 3 against the real suite, measured 2026-08-15

`verify:input-acceptance` measures the tier against a corpus built to exercise it. D380 is the
decision that this says nothing about what the tier costs or finds against a *real* suite, and that
the ~50 real API test files are where both get answered. `npm run sweep:input-volume` is that run: it
copies `tests/` to a gitignored `.sweep-input/`, attaches one input-handling assertion to every test
whose final request has a mutable input, grants all three probe classes, and runs it. Nothing under
`tests/` is modified, and nothing here touches `vuln/`.

**Reach is the first result, and it was not the expected one.** `TF067` is raised by the **checker**,
not at runtime — an assertion on a request with nothing to mutate refuses the whole run before it
starts. So Tier 3 cannot simply be switched on over a suite:

| | |
|---|---|
| tests in `tests/api/` | 236 |
| whose final request has a mutable input | **182 (77%)** |
| carrying nothing to mutate — path has no identifier segment, no query, no JSON body | 54 (23%) |

**Volume, across three runs:**

| | |
|---|---|
| assertions that probed | 174–175 |
| mutation sites reached | 383 |
| extra requests sent | **4,958–4,975** (4,862 answered) |
| mean per observed request | **28.4–28.5** |
| wall clock | 86s, strictly sequential (D21 layer 5) |

The spread is the suite's own, not the oracle's: a handful of tests create fixtures whose shape
depends on what a prior test left behind, so the number of mutation sites on their final request
moves by one or two. Recorded as a range rather than rounded to a single figure, because a reader who
re-runs this will not reproduce a point value and should not think something broke.

`tests/api/` makes 834 observed requests in total, so an assertion on *every* one of them would cost
roughly **23,700 extra requests** — an extrapolation from the 175 measured, not a second
measurement. **That answers D377's open question: the gate is urgent rather than merely prudent.**
A ~28× amplification is not something a suite absorbs by accident.

**Findings: 45, and every one of them is `sec/oversized-input-accepted`.**

The other three rules are **silent across 175 assertions against real endpoints** — no reflection, no
traversal, no disclosure. That is the half of D380 that is about the pack rather than the cost, and
it confirms D396's recorded prediction exactly: `ProblemDetailsFilter` is global and unconditional,
so no real endpoint can disclose through an uncaught error, and the sweep reporting zero disclosures
is that prediction measured rather than asserted.

The 45 are **genuine, and they are one defect repeated**. apiV2 declares no `@MaxLength()` anywhere,
so every free-text field accepts a 64 KiB value with a `2xx`. The breakdown below is the two runs
that agreed exactly; a third substituted a `POST /v1/coupons` `code` finding for one of these, for
the same fixture-ordering reason the volume moves. **The count and the class are stable; which
routes supply them is not entirely.**

| field | findings | routes |
|---|---|---|
| `name` (incl. `items[n].name`) | 26 | `POST /v1/products`, `POST /v1/products/batch`, `POST /v1/orgs`, `POST /v1/flaky-widget` |
| `items[n].categoryId` | 13 | `POST /v1/products/batch` |
| `key` | 5 | `POST /v1/flaky-widget`, `POST /v1/retry-demo` |
| `scope` | 1 | `POST /v1/oauth/token` |

**These are not planted and they get no `V` row**, because a `V` row is a fixture route and these are
the real application answering. They are recorded here rather than fixed because the fix is a product
decision about apiV2's DTOs, not about the pentest arc — and because `V13` predicted this class from
reading the code (`whitelist: true` strips undecorated properties, so "no decorators" is not the same
as "no bound"), and the sweep is what turned that reading into a measurement. `plan_v2.md` §4.2's
rule that real endpoints stay clean is about *planted* flaws; a real bound that was never declared is
exactly what a scanner is supposed to notice.

## What the real app answers, with nothing planted

Five of the ten rules get both halves from apiV2 as it is. These rows are not fixtures; they are
predictions about the untouched app, recorded before the pack exists so the first run either
confirms them or is interesting.

| case | request | expected |
|---|---|---|
| `sec/hsts-missing` **positive** | any `env secureLocal` response, e.g. `GET /v1/health` | no `Strict-Transport-Security` — the sidecar sets no `add_header` |
| `sec/hsts-missing` **not applicable** | the same request under `env local` | scheme is http |
| `sec/nosniff-missing` **positive** | `GET /v1/health` on either base | no `X-Content-Type-Options` anywhere in the chain |
| `sec/server-version-disclosure` **positive** | any `env secureLocal` response | nginx default `Server: nginx/1.27.x`, `server_tokens` not off |
| `sec/server-version-disclosure` **negative** | any `env local` response | Express sends no `Server` header at all |
| `sec/cookie-not-secure` **negative** | `POST /v1/auth/session-login` under `env secureLocal` | `Secure` present — see the fix below |
| `sec/cookie-not-secure` **not applicable** | the same login under `env local` | scheme is http |
| `sec/cookie-not-httponly` **negative** | `POST /v1/auth/session-login`, either base | `HttpOnly` present |
| `sec/cookie-samesite-none` **negative** | `POST /v1/auth/session-login`, either base | `SameSite=Lax` (and `Strict` on `session_refresh`) |
| `sec/authenticated-response-cacheable` **positive** | `GET /v1/auth/profile` with a session cookie | no `Cache-Control` anywhere in the chain |
| `sec/authenticated-response-cacheable` **not applicable** | `GET /v1/health`, unauthenticated | the request carried no credentials |
| `sec/csp-missing` · `sec/x-frame-options` **not applicable** | any JSON response | not a document |
| `sec/cookie-*` **not applicable** | `GET /v1/health` | the response sets no cookie |
| `sec/cors-wildcard-with-credentials` **not applicable** | `GET /v1/health` | no `Access-Control-Allow-Origin` |

`sec/nosniff-missing` and `sec/server-version-disclosure` apply unconditionally (D284), so neither
has a not-applicable case, and their absence from the table above is deliberate rather than a gap.

**`sec/server-version-disclosure`'s negative has a caveat for `M128b` to settle.** A plaintext
response carries no `Server` header but does carry Express's default `X-Powered-By: Express` — a
technology disclosure with no version in it. Whether the rule reads `X-Powered-By` at all is a rule-
authoring question, not a target question; if it does, this row's negative moves to a response that
has neither header and this file changes with it.

## The two real defects `M128a` fixed

Neither was planted. Both were found in `apiV2/src/auth/auth.service.ts` by reading the code while
scoping the rule pack — before any rule existed to catch them, which is the strongest evidence
available that the pack is aimed at something real.

1. **The session cookie had no `Secure` flag.** `res.cookie()` set `httpOnly`, `sameSite`, `maxAge`
   and `path`. Over the 8443 listener the session cookie therefore came back without `Secure`, and
   `sec/cookie-not-secure` (critical) would have fired against the untouched app. Fixed
   conditionally on the request scheme (`apiV2/src/common/request-scheme.ts`, reading the
   `X-Forwarded-Proto` the sidecar now sets) — unconditional would have logged in every plaintext
   test in the suite and then dropped the cookie on the next request.
2. **The logout response's clearing cookie carried no flags either.** `res.clearCookie(name, {path})`
   emits an ordinary `Set-Cookie`, so `session=; Expires=1970` with no `HttpOnly` was a
   `sec/cookie-not-httponly` (critical) finding on every logout, on *both* bases. The clearing
   cookie now carries the same flags as the cookie it retires.

Both fixes move a rule's clean-app case from **positive** to **negative**, which is why the fixture
slice exists at all: the positives moved to `V3`, where a deliberate flaw belongs.

## The acceptance measurement (`M128c`, D295)

`tflw-acceptance/security/` is the corpus and `scripts/verify-security-acceptance.mjs` is the grader:
it runs the corpus against this stack under both bases and compares the **exact set of rule ids**
each response produced against its own copy of the ledger below. Precision and recall, per rule.

```
VULN_MODE=1 node cli.mjs start
npm run verify:security-acceptance
```

Last run — 10 of the 12 rules demonstrated live in all three states:

```
  rule                                     fires  silent  n/a
  sec/cookie-not-httponly                    ✓      ✓      ✓
  sec/cookie-not-secure                      ✓      ✓      ✓
  sec/cors-wildcard-with-credentials         ✓      ✓      ✓
  sec/hsts-missing                           ✓      ✓      ✓
  sec/csp-missing                            ✓      ✓      ✓
  sec/tls-version-old                        ·      ✓      ✓
  sec/tls-weak-cipher                        ·      ✓      ✓
  sec/x-frame-options                        ✓      ✓      ·
  sec/cookie-samesite-none                   ✓      ✓      ·
  sec/nosniff-missing                        ✓      ✓      —
  sec/authenticated-response-cacheable       ✓      ✓      ·
  sec/server-version-disclosure              ✓      ✓      —
```

**The five gaps, named rather than rounded away** — the grader prints them on every run, because a
coverage table with a silent hole in it reads as complete:

- `sec/tls-version-old` / `sec/tls-weak-cipher` **fires** — not constructible; see above.
- `sec/x-frame-options`, `sec/cookie-samesite-none`, `sec/authenticated-response-cacheable`
  **not applicable** — a *reporting* limit, not a target one. tflw names its not-applicable rules
  only in D285's "no power to fail" message, which prints when **zero** rules applied; `nosniff` and
  `server-version-disclosure` apply unconditionally, so any floor at `moderate` or below always has
  at least one applicable rule and that message can never appear. These three rules do stand down in
  the corpus — the counts prove *some* rules did — but the report cannot say which.
- `—` marks the two rules with no not-applicable state to demonstrate: both apply unconditionally.

`silent` is verified as far as the report allows and no further: the rule was in play at that floor,
did not fire, and the applicable count leaves room for it. That is a necessary condition, not a
sufficient one, and the grader's own header says so.

## The Tier 2 acceptance measurement (`M130c`, D319)

The same corpus and the same grader, extended. `tflw-acceptance/security/authz.tflw` demonstrates
both authorization rules; the third state and D311's default half are expected-to-fail probes inside
the grader, because an assertion where nothing applied *fails* by D285 and therefore cannot be
written as a passing test.

Last run — **both rules demonstrated live in all three states, no gaps**:

```
  rule                                     fires  silent  n/a
  sec/authz-object-leak                      ✓      ✓      ✓
  sec/authz-collection-leak                  ✓      ✓      ✓
```

**What the tier costs, measured rather than estimated:** 6 assertion sites, 18 extra requests,
**3.0 per site**. That number is a property of the *config*, not of the feature — this corpus
declares `shopper`, `shopperBearer`, `peer` and a `privileged` `admin`, so a `peer`-owned assertion
probes three; the root `tflw.config` also declares two `oauth2` sessions, so the same assertion in
the dogfood suite would probe more again. The grader derives it from the run for exactly that
reason — **M132b added a session and a site and the figure moved on its own**, with no constant
anywhere to forget to update. It was 5 sites / 10 requests / 2.0 per site before that.

**`V8` is a positive the oracle cannot reach, and `V9` is why that is now demonstrated rather than
argued.** The plan expected `probe mutating` to probe the `DELETE` *and find the leak*. It does the
first only. The route is genuinely exploitable — `verify-security-target.mjs` deletes an order as a
non-owner and proves it every run — but Tier 2 judges by re-issuing the request it observed, and the
owner's own `DELETE` destroys the row before any probe replays it. Both doors are shut by
construction: a successful owning request leaves nothing to leak, and a failed one is a `4xx` the
rules decline. **The bound is destruction, not mutation.**

**M132b (D356) closed `M130-05` by planting the idempotent case and putting it next to this one.**
Until then, `probe mutating`'s entire acceptance evidence was *"the request was probed"* — a control
whose positive could not occur, which is the vacuous shape D291 has rejected repeatedly. `V9` is the
same missing check on a `PUT`, and the corpus runs the two under one probe set against one host,
with one variable between them: whether the verb destroys what it touches. `V8` returns no verdict;
`V9` returns a critical.

That pairing also **removed a confound that made the original finding weaker than it looked.** With
the probe set this corpus had at the time — `{shopper, anonymous}` — no mutating request could have
been judged by anybody: `shopper` is cookie-borne and refused for CSRF (`inconclusive`), `anonymous`
is `401` (`refused`), `admin` is `privileged` and excluded. So "the `DELETE` could not be judged" was
equally consistent with *a replay cannot judge destruction* and with *nobody was able to answer*, and
the two explanations predicted the identical report. The corpus was silently exhibiting the
**zero-judgeable-principals** case that tflw's guide now names as a limit. Declaring
`shopperBearer` — alice again, with a bearer token instead of a cookie — supplies a principal who
*can* answer, which is what makes the `V8`/`V9` contrast evidence instead of a story. A probe outcome
is a fact about the credential, not about the person.

What the opt-in *does* prove is still worth having, and the corpus pins it by contrast: the same
`DELETE`, the same two principals, differing only in whether the target says `probe mutating` —

| target | probe line | who the blind spot names, and why |
| --- | --- | --- |
| opt-in (`secureLocal`) | `3 principals probed — 1 inconclusive, 2 refused` | `shopper` — refused for CSRF on the `DELETE` |
| default (`plaintext`) | `3 principals probed — 3 not probed` | all three — no `probe mutating` covers the target |

**Both numbers were `2` here until `M136c`, and had been wrong since `M132b`** declared
`shopperBearer` and took every probe set in this corpus from two principals to three. Nothing was
red: the grader reads the run, this table is prose, and the two had no way to disagree out loud.
Recorded rather than quietly corrected, because it is the same defect class the third column now
guards against — a number that describes a run nobody re-measured.

The `inconclusive` is the CSRF caveat above, live: a cookie-borne principal refused `403` on a
mutating verb has not demonstrated an authorization boundary, and the report says so instead of
scoring it clean.

The third column is the part `M136c` added and the reason the contrast is now legible rather than
merely true. Both rows mean *the tier could not ask*, and they are **different repairs** — give
`shopper` a bearer session, versus write `probe mutating` on the target. A report that ran them
together into one number would be back where `M130-01` started.

## Not planted, on purpose

- **TLS version and cipher — measured, and the answer is that neither positive is constructible.**
  `M128c` shipped `sec/tls-version-old` and `sec/tls-weak-cipher`, and the plan's §3 said to decide
  their positives "on a real container, not now". Decided, on Fedora 43 / OpenSSL 3.2.6 / Node 22:

  | weakness | listener constructible? | reachable by tflw's own probe? |
  | --- | --- | --- |
  | TLS 1.0 / 1.1 | **no** — the distro crypto policy compiles the protocols out (`ERR_SSL_NO_PROTOCOLS_AVAILABLE`, and an internal error even at `@SECLEVEL=0`) | — |
  | 3DES, RC4 | **no** — not in OpenSSL 3.2's default provider (`ERR_SSL_NO_CIPHER_MATCH`) | — |
  | `NULL-SHA256` | yes | **no** — Node's `DEFAULT_CIPHERS` carries `!eNULL` |

  So the §3 fallback — "make `tls-weak-cipher` the demonstrated positive instead" — is **also**
  unavailable, for a reason the plan did not anticipate: the *client* half is as modern as the server
  half, and a weakness tflw cannot speak is one tflw cannot observe. Both rules are therefore
  recorded here as **positive unverified by construction**, which is what the plan asked for in
  preference to a proof that was never run. Their positives are covered by unit tests against
  synthetic handshake facts (`packages/runtime/test/security-rules.test.ts`), and both rules' *live*
  negative and not-applicable cases are demonstrated by `tflw-acceptance/security/` — see below.

  One consequence worth reading twice: `sec/tls-weak-cipher` fires only on a host that gives a
  current client nothing better, so it cannot see a server that merely still *offers* RC4 alongside
  AES-GCM. That is the right answer for a per-response assertion and the wrong tool for an audit;
  enumerating a server's whole offer takes one handshake per suite and is Tier 3's job (tflw D299).
- **~~Broken object authorization (BOLA/IDOR).~~** **Planted in `M130a` as `V6`–`V8`** — this row
  said "Tier 2; a passive header scan cannot see it, so planting it now would be cost with no
  coverage behind it", and Tier 2 is what arrived. Kept struck through rather than deleted because
  the reasoning is the arc's sequencing rule and still applies to what is below.
- **~~Injection (SQLi, command, template).~~** **Planted in `M134c` as `V12`** — this row said
  "Tier 3; finding it needs request *mutation* against a strict oracle, not a re-attributed replay
  of a request the suite already made, and a planted injection point with no fuzzer behind it is the
  same cost-with-no-coverage this list keeps refusing", and Tier 3 is what arrived. Kept struck
  through rather than deleted because the reasoning is the arc's sequencing rule and still applies
  to what is below.

  Two qualifications the original row did not anticipate, both worth carrying. **What ships is not a
  fuzzer**: tflw's corpus is fixed and enumerable — every payload against every mutable input, no
  sampling, no RNG — because a gate whose verdict depends on a draw is not a gate. And **the oracle
  reads disclosure, not execution**: `V12` is graded on the application leaking its own ORM
  exception, not on any injected SQL running. Command and template injection therefore remain
  unplanted, and now for a sharper reason than sequencing — tflw ships no rule that could name
  either, so a plant for them would still be cost with no coverage behind it.
- **Anything in a real endpoint.** The suite's ~45 other files run against the clean app, and
  `plan_v2.md` §4.2's rule — real endpoints stay clean — is what makes their results mean anything.
  Tier 2 does not weaken this: `V6`–`V8` are dedicated routes, never a `VULN_MODE` branch inside
  `OrdersService.findOneScoped`. The cheaper version would exercise the genuine route with its
  genuine body, and it would put an authorization bypass inside authorization code, one misread
  environment variable away from being real.
