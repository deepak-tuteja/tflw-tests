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

node cli.mjs stop && node cli.mjs start   # …and then the ORDINARY stack, no flag
node scripts/verify-vuln-slice-hidden.mjs # assert none of it is reachable or documented (M137e)
```

That second stack is not a footnote. Since `M137e` one fixture route (`V15`) is deliberately
**documented** in `/openapi.json`, and the entire argument for that being safe is that it exists only
under `VULN_MODE=1` — so "absent without the flag" stopped being a free consequence of the exclusion
and became a claim that needs checking. It needs the other stack, which is why it is its own script and
its own `regression.mjs` phase.

Five scripts read this table, asking **four** different questions of it.
`verify-security-target.mjs` asks whether the *target* still answers the way the rows claim — a
failure there means apiV2, nginx or this file disagree, never that tflw regressed.
`verify-security-acceptance.mjs` and `verify-input-acceptance.mjs` ask which rules fired, stayed
silent, or stood down in the *run report*. `verify-sarif-acceptance.mjs` asks whether the
**machine-readable document** tflw hands to a code-scanning UI carries the same answer — which
matters because that is the one artifact whose mistakes are silent: an invalid or mis-anchored SARIF
file uploads successfully and produces no alerts at all. And since `M137e`,
`verify-vuln-slice-hidden.mjs` asks the one question none of the others can, because it needs the
other stack: whether any of this is reachable **without** `VULN_MODE=1`. A row edited here without
editing those scripts is a row some graders check and others no longer do.

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
| `V15` | `GET /v1/vuln/reports/orders` — **the only documented fixture route** | **positive** | `sec/authz-collection-leak` (reachable by a crawl's `openapi` seed alone) | critical |
| `V16` | **`webV2/admin` on `:8091` — every page it serves** | **positive** | `sec/csp-missing` (serious), `sec/x-frame-options` (moderate), `sec/nosniff-missing` (moderate), `sec/authenticated-response-cacheable` (moderate) — reachable by a crawl's `spider` seed alone | serious |
| `V17` | `GET /hardened` on `:8091` | **negative** | the same three rules, all silent | — |
| `V18` | **nginx's `:8445` listener — the transport, not a route** | **positive** | `sec/tls-weak-cipher` (serious), reachable under `probe ciphers` alone | serious |

`V1`–`V5` are Tier 1's, and they are claims a response makes about *itself* — headers and cookie
flags. `V6`–`V9` are Tier 2's, and they are claims about *who is allowed to see what*, which is a
different kind of fixture: nothing in the response is malformed, and every one of them is a `200` a
correct endpoint would also have returned to somebody. `V10`–`V14` are Tier 3's, and they are claims
about what the application does with an input it did not expect — so unlike either tier before them
these fixtures are judged on a response to a request *tflw constructed*, not to the one the suite
made. `V15` is Tier 4's, and it is the first row in this file whose distinguishing property is not in
its response at all: it breaks the same rule `V7` does, in the same way, and what separates them is
**who can find it**.

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

- **`V15`** — every user's orders, unfiltered, to any authenticated caller. Byte-for-byte the same
  handler as `V7`, on a different route, and the clean counterpart is a different one too:
  `GET /v1/orders/all` (`orders.controller.ts:60`) serves the same unscoped collection and is
  `@Roles(UserRole.ADMIN)`, so the plant is exactly one missing decorator. No path parameter and no
  required query, deliberately — see the section below for why that is load-bearing rather than
  incidental.

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

> **`M137b` removed the engine half of this limit** (`csrf from … send as header`, tflw D433). A
> session block can now capture the token once and attach it to mutating requests, so a cookie
> principal *can* be judged — see "The Tier 4 CSRF measurement" below. Everything in this section
> still describes what happens to a cookie session that does **not** declare the clause, which is now
> a configuration choice and is deliberately still exercised: `shopperNoCsrf` exists so the blind-spot
> path below keeps a live subject (tflw D455). The section is left standing rather than rewritten
> because the caveat is what the corpus still measures; only its cause moved.

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
authorization declined 1×: `shopperNoCsrf` — a cookie-borne principal was refused on a DELETE
(403); this may be CSRF rather than authorization, since a cookie session cannot supply the CSRF
token a mutating request needs. Give it a bearer session to judge it, or a `csrf from` clause so
it can supply one
```

The subject was `shopper` until `M137b` and the reason's last clause is new in it — the repair tflw
suggests is now the one the reader can actually take, and the principal it is suggested for is one
declared without the clause on purpose.

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

Since `M137b` there are **three alices and two controls**, which is the same argument twice over: the
grader's `NEVER_DECLINED` now lists `shopper` beside `shopperBearer`, so the same human is asserted
un-declinable on a cookie *and* on a bearer token, while `shopperNoCsrf` — same human, same cookie
transport, one clause fewer — is asserted declined on all three mutating verbs. A probe outcome is a
fact about the credential, and now demonstrably about the *declaration* rather than the transport.

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

### The Tier 4 enumeration plant `V15`, and why it is the one documented fixture route

`M137e` (testFlow [PLAN_M137_PENTEST_TIER4.md](../testFlow/PLAN_M137_PENTEST_TIER4.md), D437/D438)
adds the arc's fourth tier — a **crawl**, which finds its own requests instead of judging the ones the
suite made. It has two seeds, and they find different things:

| seed | finds | can it find `V1`–`V14`? | can it find `V15`? |
|---|---|---|---|
| `seed openapi` | every operation `/openapi.json` describes | **no** — all three controllers are `@ApiExcludeController()` | **yes** |
| `seed traffic` | every distinct route this run's own tests touched | yes, the acceptance corpus sends them | **no** — nothing in this repo ever sends it |

D437's rule is that **each seed source gets at least one plant only it can reach**, and the reason is
about how a regression would look rather than about coverage arithmetic: with a shared plant set,
dropping the enumerator makes recall fall by an amount nobody has a number for. With `V15`, it makes a
*named row* go missing.

**So `V15` had to be documented, and every other fixture route must not be.** That is the tension this
row exists inside, and both halves are enforced:

- `scripts/verify-security-target.mjs` asserts `/v1/vuln/reports/orders` **is** in the `VULN_MODE`
  document, as a `GET`, **and that it is the only `/v1/vuln/*` path in it**. A second documented
  fixture route would make a missing `via: openapi` finding ambiguous about which plant went unfound.
- `scripts/verify-vuln-slice-hidden.mjs` asserts it is **absent** from the default stack — no route,
  no documented path, no leaked tag. That is a separate script and a separate `regression.mjs` phase
  because the two claims need opposite stacks: `security-target-check` runs under
  `stackEnv: { VULN_MODE: '1' }`, and this claim is only meaningful without it.

**Why documenting it does not violate the exclusion it appears to violate (D438).** `VULNS.md`'s
standing rule at the top of this file plus `@ApiExcludeController()` on all three controllers added up
to *no plant can ever be documented*, which would have left Tier 4's enumeration plant unbuildable.
But read the exclusion's stated reason — `vuln.controller.ts:24-27` — it is that documenting the slice
*"would make `/openapi.json` vary by environment and every contract assertion in this suite vary with
it."* That reason is narrower than its effect. The contract assertions it protects
(`tests/api/catalog/contract-and-retry.tflw:21`, `tests/examples/matchers-explained.tflw:62`,
`tests/api/admin/versioning.tflw:9`) all run against a stack started **without** `VULN_MODE=1`. A route
documented **and** absent without the flag leaves every one of them looking at the document it has
always looked at.

**No path parameter and no required query, and that is the design rather than the shape it happened to
take.** A crawl's OpenAPI seed must invent the values a documented request cannot be made without, and
an invented id does not exist — so a synthesized `GET /vuln/reports/orders/{id}` would answer `404`
and be recorded as *not reached* rather than judged. `V15` needs nothing invented, so it reaches real
code on the first attempt. That matters for what a **missing** finding would mean: with a parameter,
"the crawl found nothing" is ambiguous between *it cannot enumerate* and *it invented a bad value*, and
those have different repairs. Without one, it can only mean the first.

**Fourth controller, and the split is along visibility rather than dependencies.**
`VulnReportsController` needs nothing `VulnOrdersController` does not already have — same repository,
same guard, same unscoped `find`. It is its own class because `@ApiExcludeController()` is a *class*
decorator, so the single property that defines this plant cannot be expressed per-route on a controller
that carries the exclusion.

**The requirement that nothing ever sends it a request is a property of the whole suite, not of one
file.** If any `.tflw` test ever calls `/v1/vuln/reports/orders`, the captured-traffic seed finds it
too, the two seeds stop being distinguishable here, and D437's per-seed attribution loses its only
enumeration-exclusive positive — a coverage claim that reads exactly the same after it has stopped
being true. `verify:security-acceptance` grades this finding's `via` as `openapi`, which is what makes
that requirement something a run can fail rather than a note in a comment.

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
it runs the corpus against this stack under all three of its envs and compares the **exact set of rule
ids** each response produced against the ledger. Precision and recall, per rule — and, since `M139-4`,
per plant: every row in the table above is asked for its own evidence, at the severity the ledger
claims for it.

The ledger the grader reads is `scripts/lib/plants.mjs`, not this file. **That direction is
deliberate** (`M139-1`, D489): the manifest is hand-authored and authoritative, and the table above is
checked against it — ids only, since the table writes `:id` where the fingerprint tflw computes writes
`{id}`. Parsing this prose to build the oracle would let a typo in a markdown cell silently retune what
every grader expects.

```
VULN_MODE=1 node cli.mjs start
npm run verify:security-acceptance        # the full report, including the tables below
npm run verify:security-acceptance:gate   # the asserting half only — what CI runs
```

**The second command is a `regression.mjs` phase** (`security-acceptance-gate`, `M139-5`); the first is
a report run by hand. The split is D493's, and the reason is that the two fail differently: a ledger
row that stops matching is a regression with a name, while a coverage table's gaps are recorded and
accepted, so gating them would add a red no fix closes.

Last run — 11 of the 12 rules demonstrated live in all three states, and the twelfth named:

```
  rule                                     fires  silent  n/a
  sec/cookie-not-httponly                    ✓      ~      ✓
  sec/cookie-not-secure                      ✓      ~      ✓
  sec/cors-wildcard-with-credentials         ✓      ~      ✓
  sec/hsts-missing                           ✓      ~      ✓
  sec/csp-missing                            ✓      ~      ✓
  sec/tls-version-old                        ·      ✓      ✓
  sec/tls-weak-cipher                        ✓      ✓      ✓
  sec/x-frame-options                        ✓      ~      ✓
  sec/cookie-samesite-none                   ✓      ✓      ✓
  sec/nosniff-missing                        ✓      ~      —
  sec/authenticated-response-cacheable       ✓      ~      ✓
  sec/server-version-disclosure              ✓      ✓      —
```

**`silent` now prints two glyphs, and the difference is the point** (`M139-6`). `✓` is the rule census
saying the rule *applied* in a run where it produced nothing — it ran and found nothing, which is the
sufficient version of the claim. `~` is what this column has always meant and all it could mean: the
rule was in play at that floor, did not fire, and the applicable count left room for it. Printing one
glyph for both would be claiming the stronger thing on the weaker evidence, which is the failure this
whole table exists to avoid.

**One gap, named rather than rounded away** — the grader prints it on every run, because a coverage
table with a silent hole in it reads as complete. There were four; `M137g` closed one by planting
`V18`, and `M139-6` closed three by reading a field that had been in the report for two milestones:

- `sec/tls-version-old` **fires** — not constructible on this platform at all; see below. **`M137g`
  removed the other half of what used to be one bullet here.** `sec/tls-weak-cipher` was recorded
  beside it as "not constructible" from `M128c` until 2026-08-18, and the two were never
  unconstructible for the same reason: TLS 1.0/1.1 cannot be made into a listener, while a broken
  *suite* could be and simply could not be reached by a client whose ClientHello excluded it. Reading
  them as a pair is what hid that difference for two milestones, and `V18` is what the distinction
  was worth.
- ~~`sec/x-frame-options`, `sec/cookie-samesite-none`, `sec/authenticated-response-cacheable`
  **not applicable**~~ — **closed 2026-08-18 by `M139-6`, and the diagnosis was half right.** The
  reason recorded here was: *"a reporting limit, not a target one. tflw names its not-applicable rules
  only in D285's 'no power to fail' message, which prints when zero rules applied; `nosniff` and
  `server-version-disclosure` apply unconditionally, so any floor at `moderate` or below always has at
  least one applicable rule and that message can never appear. These three rules do stand down in the
  corpus — the counts prove *some* rules did — **but the report cannot say which**."*

  Everything up to the last clause still holds, and it is why all three rules are `moderate` and no
  floor can isolate them. The last clause stopped being true with `M134b` / tflw `D389`, which
  publishes `RunReport.scanCoverage` — a rule census carried on **every** scan assertion, passing or
  failing, naming each not-applicable rule *with its unmet precondition*. The field was built two
  milestones ago to answer exactly this question and no grader in this repo had ever read it.

  Two measurements were needed rather than one, and the second is worth carrying. The census is
  **run-level, and `applied` wins**: a rule that judged one response and stood down on another is
  reported as applied. Measured 2026-08-18, all three of these apply *somewhere* in every one of the
  three envs, so reading the census off the corpus runs closed **none** of the three gaps. What closes
  them is one assertion at a `moderate` floor against `/health` — a JSON response with no cookie, no
  credentials and no `text/html` — where all three apply nowhere and the census names them:

  ```
  sec/x-frame-options — the response is a document (Content-Type: text/html)
  sec/cookie-samesite-none — the response sets a cookie
  sec/authenticated-response-cacheable — the request carried session or bearer credentials
  ```

  That assertion **fails**, and that is fine: `nosniff` and `server-version-disclosure` really do fire
  on `/health` and both are in the committed baseline. D389's whole point is that the census is
  published either way. It lives in `APPLICABILITY_PROBES` as the one probe graded on the census rather
  than on D285's listing.
- `—` marks the two rules with no not-applicable state to demonstrate: both apply unconditionally.

## The Tier 2 acceptance measurement (`M130c`, D319)

The same corpus and the same grader, extended. `tflw-acceptance/security/authz.tflw` demonstrates
both authorization rules; the third state and D311's default half are expected-to-fail probes inside
the grader, because an assertion where nothing applied *fails* by D285 and therefore cannot be
written as a passing test.

Last run — **all three rules demonstrated live in every state that exists for them**:

```
  rule                                     fires  silent  n/a
  sec/authz-object-leak                      ✓      ✓      ✓
  sec/authz-collection-leak                  ✓      ✓      ✓
  sec/csrf-not-enforced                      ·      ✓      ✓
```

The third row is `M137b`'s, and its missing `fires` is a fact about the target rather than a gap in
the corpus — see "Not planted, on purpose".

**What the tier costs, measured rather than estimated:** 7 assertion sites, 27 extra requests,
**3.9 per site**. That number is a property of the *config*, not of the feature — this corpus
declares `shopper`, `shopperBearer`, `shopperNoCsrf`, `peer` and a `privileged` `admin`, so a
`peer`-owned assertion probes four; the root `tflw.config` also declares two `oauth2` sessions, so
the same assertion in the dogfood suite would probe more again. The grader derives it from the run
for exactly that reason — **two milestones running have added a session and a site and the figure
moved on its own**, with no constant anywhere to forget to update. It was 5 sites / 10 requests / 2.0
per site before `M132b`, and 6 / 18 / 3.0 before `M137b`.

The average is below four because `csrf.tflw`'s assertion names **two** owners (`as shopper,
shopperBearer`) and an owner is never in its own probe set. It also sends one request this figure does
not count: the derived token-withheld probe, which tflw keeps in its own channel (D457) precisely so
it cannot be mistaken for a non-owner principal.

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
| opt-in (`secureLocal`) | `4 principals probed — 1 inconclusive, 3 refused` | `shopperNoCsrf` — refused for CSRF on the `DELETE` |
| default (`plaintext`) | `4 principals probed — 4 not probed` | all four — no `probe mutating` covers the target |

**Both numbers were `2` here until `M136c`, and had been wrong since `M132b`** declared
`shopperBearer` and took every probe set in this corpus from two principals to three. Nothing was
red: the grader reads the run, this table is prose, and the two had no way to disagree out loud.
Recorded rather than quietly corrected, because it is the same defect class the third column now
guards against — a number that describes a run nobody re-measured.

**`M137b` moved them again, to `4`, and this time the grader did go red** — which is the difference the
paragraph above was asking for. Declaring `shopperNoCsrf` for the opt-in half's benefit widened the
*default* half's probe set too, and the expected-to-fail probe that measures it failed on a `3` that
had been correct for two milestones and was never edited. Worth carrying: the two halves of a contrast
are coupled through the config, so a session declared to fix one of them changes both.

The `inconclusive` is the CSRF caveat above, live: a cookie-borne principal refused `403` on a
mutating verb has not demonstrated an authorization boundary, and the report says so instead of
scoring it clean.

The third column is the part `M136c` added and the reason the contrast is now legible rather than
merely true. Both rows mean *the tier could not ask*, and they are **different repairs** — give
`shopper` a bearer session or a `csrf from` clause, versus write `probe mutating` on the target. A
report that ran them together into one number would be back where `M130-01` started.

## The Tier 4 CSRF measurement (`M137b`, tflw D433/D434/D454/D455)

Two features, one target: the `csrf from … send as header` session clause, and `sec/csrf-not-enforced`,
which withholds the captured token from a derived principal and re-issues the observed mutating
request with it missing. `tflw-acceptance/security/csrf.tflw` holds all three tests.

**`tests/api/identity/sessions.tflw` was deliberately left alone.** tflw's D433 originally had the
clause delete that file's hand-capture as a side effect; D454 reversed it. Those two tests are a
matched `403`/`201` pair whose subject is `AnyAuthGuard` itself, and D434 names that guard as
`sec/csrf-not-enforced`'s **negative control** — so *"this app enforces CSRF"* has to stay provable
independently of the engine feature that supplies the token, or the control validates the thing it
controls for. The clause's own proof therefore lives in the acceptance corpus, against the same app.

**The clause, proved by a one-variable pair.** Both tests send a byte-identical `PATCH /users/me`; the
only difference anywhere in the system is whether the owning `session` block carries the clause.

| owner | declares `csrf from`? | answer |
| --- | --- | --- |
| `shopper` | yes | `200` — no `capture`, no per-step `header`, nothing about CSRF in the test at all |
| `shopperNoCsrf` | no | `403`, from the guard's pre-flight, *before* authorization is consulted |

The `403` half is the one that keeps the other honest: a token leaking across sessions, or cached per
credential rather than per declaration, would return `200` there and every probe-count row in the
grader would still pass. Both are graded by `verify-security-acceptance.mjs` in a block of their own,
because that script ignores the corpus's exit code by construction — this corpus's positives are
*meant* to produce findings — so a functional test dropped in without one is a control nobody reads.

`PATCH /users/me` because it needs no setup at all: `AnyAuthGuard`-protected so the pre-flight applies,
an RFC 7386 merge patch so any key is legal, idempotent and self-scoped so it can run any number of
times against a long-lived stack. That also means `csrf.tflw` has no `before` block, which is why the
third test lives there rather than in `authz.tflw`.

**The rule, and the only place in either corpus where it is applicable.** It derives a *"same cookie
session, token withheld"* principal from the owner, so a bearer owner gives it nothing to derive — and
every other authorization assertion here is owned by `peer`, which is bearer. Without the third test
the rule would report not-applicable everywhere, the coverage table would show it in two states out of
three, and D434's claim that apiV2 is *"a ready-made negative control"* would be a statement about the
app that the corpus never checks. Measured, on the one assertion whose owner declares the clause:

```
3 principals probed — 1 served different content, 1 inconclusive, 1 refused
authorization declined 1×: `shopper (csrf token withheld)` — a cookie-borne principal was refused
on a PATCH (403) …
```

Four principals answer and each answers differently, which is D324's whole taxonomy on one request:
`peer` gets `200` with **different content** (the route is self-scoped, so bob patches bob),
`shopperNoCsrf` is **inconclusive**, `anonymous` is **refused** at `401`, and the derived principal is
**refused** at `403` — the negative control firing on nothing.

Two things about that output are load-bearing rather than incidental:

- **The derived probe is not in the count of three.** D457 gives it its own `csrfProbes` field, because
  the derived principal *is* the owner: on a shared probe list, a token-less write that succeeded would
  return the owner's own resource ids to a "non-owner" and `sec/authz-object-leak` would report a
  critical BOLA against the owner's own resource — this rule's happy path firing the wrong finding. It
  surfaces in the blind-spot channel instead, under a name that says what it is, and that decline is
  the grader's proof that the rule was silent because a probe was refused rather than because nothing
  was ever sent.
- **The assertion names two owners** (`as shopper, shopperBearer`, tflw D327). They are the same human.
  Name only `shopper` and alice's other credential stays in the probe set, fetches alice's own profile,
  and earns a critical object-leak finding that is the fixture's fault rather than the app's.

## The Tier 4 spider measurement (`M137f`, tflw D442/D483)

**`V16` is the first time any Tier 1 document rule has judged a document a real application served.**
apiV2 serves no HTML at all — `apiV2/src/vuln/vuln.controller.ts` says so in its own comment, *"Both
rules' precondition is 'the response is a document', which no real apiV2 route satisfies"*, and
fabricates a `text/html` response so `V4`/`V5` have a subject. Four milestones of grading
`sec/csp-missing` and `sec/x-frame-options` therefore graded them against a fixture built to satisfy
them. The admin console is a genuine server-rendered Express/EJS app and it sets no security headers
anywhere, so the rules fire on pages written for people rather than for a test.

| | value |
|---|---|
| target | `webV2/admin` on `:8091` (SSR, EJS, `express-session` cookie auth, its own CSRF middleware) |
| corpus | `tflw-acceptance/security/spider.tflw`, `--env plaintext` |
| surface | `18 discovered · 9 withheld · 9 sent · 9 reached · 26 walked`, truncated at `max depth 2` |
| reached | the dashboard, categories, products, tickets, coupons, orders, orgs and the org membership pages |
| rules fired on `V16` | `sec/csp-missing` (19) · `sec/x-frame-options` (19) · `sec/nosniff-missing` (20) · `sec/authenticated-response-cacheable` (9) |
| rules fired on `V17` | none — the pair's whole point |
| withheld | eight synthesized writes (`POST /logout`, `/coupons`, `/orgs`, `/orgs/{id}`, `/orgs/{id}/memberships`, `/orgs/{id}/memberships/{id}/role`, `/orgs/{id}/memberships/{id}/remove`, `/products/{id}/delete`) with no `probe mutating` on this origin (`D465`), plus `GET /hardened` by `exclude` |
| blind spot | `http://localhost:8090/` — *needs rendering to crawl* (`D442`) |

**`V17` is what makes `V16` a measurement.** A rule that fired on every page would be
indistinguishable from a rule that fires unconditionally, so exactly one route sets all three headers
and is expected to produce nothing. It is `exclude`d from the crawl and graded by an ordinary `test`,
because a crawl applies one assertion to every response it reaches and this response has to be the
exception. That is `V4`/`V5`'s pairing (`/vuln/document` against `/vuln/document-hardened`) moved onto
a real app rather than a fixture controller.

**Two things the first live run corrected, both recorded because reasoning had produced the opposite
answer.** The pair was first built with only CSP and `X-Frame-Options` set on the hardened page, which
left it tripping `sec/nosniff-missing` — a negative that fails measures nothing. And the assertion was
first written at a `critical` floor, copying every other file here; at that floor the only three
critical rules are cookie- and CORS-shaped, none applies to a plain HTML page, and D285 failed the
assertion for having no power to fail. `moderate` is the floor at which both named rules are graded.

**The `:8090` blind spot is graded as a gap, on purpose.** The storefront is a Vite SPA whose document
is `<div id="root"></div>` and one script, with no anchors at all. A fetching spider finds the shell,
finds nothing to follow, and declares the origin *needs rendering to crawl*. `D442` chose parsing over
rendering for safety reasons — every existing gate lives on the request path — and the honest price is
a class of site this tool cannot walk. An unmentioned gap is what this arc keeps filing rows about, so
it is a graded decline rather than a silent zero.

**This corpus found a tflw defect that had nothing to do with crawling, and the numbers on either
side of it are the clearest thing in this file.** The crawl's first live run walked **anonymously**
despite being declared `as console`: `3 discovered · 1 sent · 1 reached · 2 walked`, green, and
reported as the console's surface. Filed as tflw `M137f-01`, and the cause was in the transport rather
than the crawl — a followed redirect chain reported every hop's `Set-Cookie` and forwarded none of
them, so the authenticated cookie from `POST /login`'s `302` never reached the next hop, and this
console's session middleware (it touches `req.session` on every request) then issued a *newer*
anonymous cookie that won last-wins in the jar. The session established, reported `200` — the chain
lands on the login page, which is a `200` — and was not logged in.

Fixed, the same crawl reaches `18 discovered · 9 withheld · 9 sent · 9 reached · 26 walked`. Three
things are worth carrying out of it:

- **The status code of a form post that redirects tells you almost nothing.** Only a second request
  can distinguish a login that worked from one that did not, which is why nothing caught this for nine
  milestones of green sweeps.
- **`V17`'s negative silently stopped being reachable.** It was linked only from the login page, which
  an authenticated walk never sees, so `exclude "/hardened"` matched nothing and the surface line
  simply had one fewer route in it. Nothing went red. The dashboard now links it too, and the
  `exclude` is load-bearing again — an exclusion that excludes nothing is a coverage claim nobody
  checks.
- **The walk is genuinely truncated and says so.** At `max depth 3` the console yields 42 pages and
  *not one additional operation*, so `discovered` saturates at depth 2 while `walked` keeps climbing.
  The page cap is set generously (60 against a walk of 26) so that depth is the binding bound and the
  numbers above are deterministic rather than frontier-order-dependent.

**`sec/authenticated-response-cacheable` is the fourth rule, and it is the cleanest evidence the fix
did what it claims.** Its precondition is *"the request carried session or bearer credentials"*, so a
walk that was not logged in could not reach it at any depth. It now fires on nine of the console's
authenticated pages — including `GET /orders/export`, which is a CSV of other people's orders served
with no `Cache-Control` at all.

**Two things this file's own grader had to change, both recorded because the first draft of each was
wrong.** `gradePrecision` discriminated plants by the path prefix `/v1/vuln/`, on the stated premise
that *"every planted route is served at `/v1/vuln/…`, so the prefix IS the plant set"* — and `V16` is
the first plant whose subject is an **origin** rather than a route, so the premise no longer holds.
The discriminator for it is provenance (`via: 'spider'`), which is exactly the plant set because only
the spider reaches that origin. That would have cost the precision gate its power over 67 findings, so
`gradeSpider` asserts the spider's rule set **exactly** instead: a rule firing there that this file has
not accounted for goes red. And `verify-security-acceptance.mjs` itself was **red before any of this
work started** — `session console` is top-level while `api adminConsole` was declared on `plaintext`
only, so every other env failed at `TF026` before a single assertion ran. Nobody saw it because that
script ran in no automated gate, which was `M137e-01` in one sentence. `M139-5` closed that row: the
script's asserting half — the ledger rows, the crawl/spider/declines graders, `D445`'s precision bar
and its staleness check — is now the `security-acceptance-gate` phase of `scripts/regression.mjs`, and
therefore of CI. The coverage tables below stay a report run by hand, deliberately; the split and its
reasoning are D493.

## The Tier 4 crawl measurement (`M137e`, tflw D437/D438/D465/D480/D482)

The tier's addition is not a new rule but a new *surface*: `tflw-acceptance/security/crawl.tflw` finds
its own requests instead of judging ones somebody wrote down. So what is measured here is one thing no
other file in this repo can show — **that a finding was reached by a seed, and by which one.**

**The surface, and why it is stated as an identity rather than a total.**

```
87 discovered = 54 withheld + 33 sent   (14 reached)
  seeds:  openapi 82 route(s)   traffic 5 route(s)
```

The grader asserts the arithmetic, not the magnitude. A crawler that quietly narrowed its own surface
would report a smaller denominator and *look like better coverage*, so the number that must hold is
that everything discovered is accounted for as either withheld or sent. `reached > sent` is separately
rejected as impossible. The route-count itself is deliberately unpinned — it is a property of apiV2's
surface and moves whenever anyone adds an endpoint.

**`D437`'s matched pair, which is the point of running two seeds.** Each seed has a plant the other
cannot see, so dropping either one makes a *named ledger row* go missing rather than making recall fall
by an amount nobody has a number for:

| plant | route | documented? | exercised? | reachable by | findings |
| --- | --- | --- | --- | --- | --- |
| `V15` | `GET /v1/vuln/reports/orders` | **yes** — the only fixture route that is | never | `openapi` only | 3, all `via: openapi` |
| `V7` | `GET /v1/vuln/orders` | no — `@ApiExcludeController()` | yes, by the corpus | `traffic` only | 3, all `via: traffic` |

**Precision is exact on this corpus: 6 findings, all on the 2 plants, none anywhere else.** That is the
`D445` property, and it is the measurement `M137c2` exists to have made true — see below.

**`D482`, and the reason this section reports a *before* number.** Before the fix the same crawl
produced **23** findings: the 6 above plus **20 false criticals** across three public collections, four
apiece. A route that hands the built-in `anonymous` principal the same collection it hands everyone
else has no owner and therefore no boundary to cross, so neither leak rule has anything to say about
it. Three collections are graded, and graded as **reached first**:

```
✓ GET /v1/products        reached, reported nothing
✓ GET /v1/categories      reached, reported nothing
✓ GET /v1/categories/tree reached, reported nothing
✓ 4 crawl step(s) say why a leaked probe set was not a violation
```

*Reached* first is what stops the row being vacuous — a route the crawl never dialled also produces no
findings and would satisfy the same expectation while measuring nothing. That is this repo's oldest
recurring failure shape (`D363`). The fourth line matters for the opposite reason: the suppression has
to be **stated**, not silent, or a rule that stopped running entirely would pass this block.

Note what the fix is *not*: the guard returns `applicable: true` with no findings, never
`applicable: false`. A crawl judges every response it reaches, so `D285` requires at least one
applicable rule of the family on each one; on a public collection the pack's other two rules already
stand down, so standing this one down too would convert 20 spurious findings into 4 spurious
**failures** and redden any crawl of a public API. Same evidence, opposite sign.

**What the crawl declined to do, all four kinds, none of them pinned to a count.**

```
50  synthesized write(s) enumerated, disclosed and not sent      (D465)
12  synthesized request(s) refused by the validator (400)
 7  route(s) refused before authorization was consulted          (M130-01)
 1  route withheld by `exclude`                                  (pinned to its subject)
```

The 50 are `D465` made a number instead of a sentence: `probe mutating` is withheld on this env, so
every write the crawl found is enumerated, disclosed and **not sent** — affirming a scan is not
affirming writes. The 12 are honest about a limit: a validator's refusal is indistinguishable from a
hardened endpoint, so the crawl declines to call them clean rather than counting them as passes.

**The 7 are the `M130-01` classifier holding on a real surface, and that is worth stating precisely
because the obvious reading of them is wrong.** `M130-01` described a real defect — apiV2 refuses a
cookie-borne mutating request *before* authorization is consulted, and a differential oracle reads the
refusal as **clean** — but that row is **closed** (`M136a`, 2026-08-16, closed as *fixed* rather than
withdrawn). tflw's `authzProbe.ts` classifies such a refusal as `inconclusive`, `inconclusive` cannot
reach `clean`, and the probe is declined into the blind-spot channel instead. So each of these 7 is the
engine **correctly refusing to call an unanswerable probe clean**, not a hole.

It is graded anyway, and the reason is the interesting part: that closure rests on **six unit tests**
against hand-built cases, and a crawl is the first thing to exercise the classifier across a whole
mutating surface — where a 403 before the route's code runs is the *default* outcome, not an edge case.
Zero declines here would mean the classifier had stopped engaging, which is precisely how the original
defect presented, and which would once again read as good news: nothing declined, so nothing wrong.
Graded non-zero rather than exact, like the other three, because all four move with apiV2's route
surface.

`exclude` is the one that *is* pinned to its subject, because `/v1/contract-demo/*` is a choice this
corpus made rather than a property of the surface: a pattern that silently stopped matching would
otherwise show up as one more route quietly crawled.

**Run as `--env plaintext`, with `VULN_MODE=1`.** One origin serves the document, the
`authorized target` and the crawled base, so nothing has to be reconciled by a reader — and the
document declares no `servers`, which is what makes `M137c1`/`D480` (resolve OpenAPI paths against the
document's own `servers`, not the `api` base) a live regression guard here rather than a note.

## The Tier 4 cipher measurement (`M137g`, tflw D441/D485/D486)

**`V18` is the first plant in this repo whose subject is not a request.** `V1`–`V15` are routes,
`V16`/`V17` are pages; this one is a *listener*. nginx's 8445 port (`nginx/offering.conf`, installed
only under `VULN_MODE=1`) serves the same app through the same proxy as 8443 with one line different:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-RSA-AES128-GCM-SHA256:NULL-SHA256:@SECLEVEL=0';
```

Four handshakes against it, measured on nginx:1.27-alpine / OpenSSL 3.x, 2026-08-18:

| a client that… | gets |
| --- | --- |
| asks the way anything modern asks | **TLSv1.3, `TLS_AES_256_GCM_SHA384`** — impeccable |
| names `NULL-SHA256` at `@SECLEVEL=0` | **TLSv1.2, `NULL-SHA256`** — no encryption at all |
| names `NULL-SHA` at `@SECLEVEL=0` | `handshake_failure` — the host does not offer it |
| names `RC4-SHA` | its own OpenSSL refuses to build the ClientHello |

**The first two rows are the plant.** A host that hands every current caller AES-GCM over TLS 1.3 is
one that every per-response assertion tflw ships reads as clean — including `sec/tls-weak-cipher`
itself, which until `M137g` judged the suite it was *given*. The broken suite is still in the
configuration and still reachable by anybody who asks for it, which is what a scanner is for and what
an assertion about one response structurally cannot do.

Measured on the acceptance run, 2026-08-18 — the shape of one enumeration against this listener:

| candidates offered | accepted | refused | unaskable |
| --- | --- | --- | --- |
| 18 | 1 (`NULL-SHA256`) | 7 | 10 (RC4 ×4, 3DES ×3, `DES-CBC-SHA`, EXPORT ×2) |

**The last two columns are why the result has three lists rather than two.** `NULL-SHA` refused and
`RC4-SHA` unaskable are different facts: one is the server answering, the other is tflw's own crypto
stack declining to ask, and a report that folded them together would say "this host does not offer
RC4" about a question nobody put to it — on this platform that would be **10 of 18 candidates**
silently reported as clean. That distinction is `M136a`'s rule — *a scan that could not
ask is not a scan that found nothing* — and this listener is where it is exercised on live traffic
rather than only in a unit test. It also means the ceiling note prints on **every** enumeration on
this platform, because RC4, 3DES and the EXPORT suites are unaskable here whatever the server does.

### What the corpus does with it

`tflw-acceptance/security/ciphers.tflw`, under its own env `offeringTls`, and one assertion:

```
api GET /health
expect status equals 200
expect response not has no serious security violations
```

`/health` on purpose — nothing about the finding is a property of the response. The exact rule set is
pinned in `scripts/verify-security-acceptance.mjs`: `sec/hsts-missing` (nginx sets none on any
listener) and `sec/tls-weak-cipher`, with `sec/tls-version-old` in play at that floor and silent,
because a host offering a broken suite is not a host speaking a dead protocol and a corpus that could
not tell those apart would be grading half of `M128c` by accident.

**`probe ciphers` is granted on `offeringTls` and withheld on `secureLocal`, and both halves are
graded.** The withheld half is the one worth explaining: on 8443 the rule still applies, still finds
nothing, and prints a note saying it judged only the negotiated suite and naming the clause that
would widen it. That assertion passes either way — which is exactly why the note is asserted by name.
A rule that quietly stopped disclosing the limits of what it checked would leave every green line in
this corpus meaning slightly less than it says, and nothing would go red.

### The absence is gated too

`scripts/verify-vuln-slice-hidden.mjs` — which runs as `vuln-slice-hidden-check` in the regression
sweep, against a stack started **without** the flag — asserts that no TLS session can be established
on 8445. That is a different gating mechanism from every other plant in this file (an included nginx
config rather than a conditional Nest module), and a mechanism nothing checks is one that stops
working quietly. The failure it prevents is worse than a leaked route, too: a route is at least
discoverable by anyone reading the surface, whereas a listener left up would sit under every https
suite in this repo offering a suite with no encryption, and nothing would mention it — `probe
ciphers` is the only instrument that can see an offer, and no other env grants it.

The claim is *no handshake*, not a particular errno. Compose publishes 8445 unconditionally (a port
cannot be published only sometimes), so on a clean stack the host port accepts the TCP connection and
Docker's proxy resets it: `ECONNRESET` here, `ECONNREFUSED` on a stack without that proxy. Pinning
either would fail on a correct stack for a reason unrelated to the plant.

### Why the plant is a separate listener

8443 is the arc's clean-transport control and two ledger rows assert by name that
`sec/tls-weak-cipher` stays silent there. Putting the broken suite on 8443 would have made those rows
fail — not loudly, but in the way that gets an assertion "fixed". The same blast-radius rule every
plant in this file follows, applied to a port instead of a route.

## The committed baseline (`D445`)

`tflw-acceptance/security/security-baseline.json` — **8 accepted fingerprints**, and the definition of
this arc's precision gate:

```
precision  ==  no finding outside  (baseline ∪ plants)
```

`plan_v2.md` §4.2 originally defined scanner acceptance as *"find every planted flaw, **zero findings
elsewhere**"*. There have not been zero findings elsewhere for two milestones, and there should not be:
apiV2 sets no `X-Content-Type-Options`, sends `Server`, and returns a cacheable authenticated profile.
Those are true positives on real routes — a scanner noticing them is the scanner working. So the bar
became a set difference rather than a zero.

**What is in it, and why every entry is a real defect in the target:**

| rule | endpoints |
| --- | --- |
| `sec/nosniff-missing` | `GET /v1/health`, `GET /v1/auth/profile`, `POST /v1/auth/session-login` |
| `sec/hsts-missing` | `GET /v1/health`, `GET /v1/auth/profile`, `POST /v1/auth/session-login` |
| `sec/server-version-disclosure` | `GET /v1/health` |
| `sec/authenticated-response-cacheable` | `GET /v1/auth/profile` |

One file covers both envs because **a fingerprint does not depend on the env**: it is computed from the
scan, rule, endpoint, location and violation, so `sec/nosniff-missing` on `GET /v1/health` is
`b32982bffae63fa3` under `plaintext` and under `secureLocal` alike. The seven `hsts`/`cacheable`/
`server` entries are secureLocal's alone, because `sec/hsts-missing` is not-applicable over plaintext
where a browser ignores the header — which is why the staleness check below is accumulated across both
envs rather than asserted per-env.

**Plants are not in the baseline, and are not listed anywhere in it.** They are discriminated
structurally: every planted route is served at `/v1/vuln/…`, so the prefix *is* the plant set and a new
plant needs no edit to the grader. Keeping them out is what stops the gate being circular — a baseline
containing the plants would satisfy `baseline ∪ plants` by construction and measure nothing.

### Regenerating it — a reviewed diff, never a command run to make CI green

This is the one instruction that matters, and it lives here rather than in the plan because this is
where somebody staring at a red gate will look.

```sh
# generates a candidate — it does NOT produce the committed file
VULN_MODE=1 node cli.mjs start
node ../testFlow/packages/cli/dist/cli.cjs run --env secureLocal --baseline-write /tmp/candidate.json \
  positives.tflw negatives.tflw authz.tflw csrf.tflw      # from tflw-acceptance/security/
```

A `--baseline-write` run writes **every** finding it saw, plants included. Turning that into this file
is a manual step: drop every `/v1/vuln/…` entry, then **diff what remains against the committed file
and justify each line that moved.** A new entry is a claim that the target gained a real defect; a
removed one is a claim that somebody fixed it.

**The failure mode this discipline exists to prevent** is a baseline regenerated to clear a red gate,
which silently accepts a regression as the new normal. It is the reason `verify-security-acceptance.mjs`
does two things rather than one:

- **Findings outside `baseline ∪ plants` fail**, naming each one with its fingerprint and source line.
  Either the target changed and the finding is real, or a rule regressed and is firing where it should
  not — and the message says so, because those two have opposite fixes.
- **Baseline entries no run produced also fail.** A stale acceptance is a fixed defect nobody deleted,
  or a run that quietly stopped happening. If staleness were only ever a warning, a baseline could rot
  into a list of fingerprints that guard nothing while every gate stayed green.

### What is deliberately NOT baselined: the 45 `sec/oversized-input-accepted` findings

`D445`'s text asks for them ("the 45 oversized ones"). The target does not permit it, and this is
recorded rather than quietly skipped. Three independent reasons, any one of them sufficient:

1. **No gated run produces them.** They come only from `npm run sweep:input-volume`, which is not a
   `regression.mjs` phase and is not in CI. Every entry would sit permanently in the "stale, reported,
   never pruned" state — and under the staleness check above, would fail the gate forever.
2. **There is nothing committed to anchor to.** That sweep copies `tests/` to a *gitignored*
   `.sweep-input/` and synthesizes the input-handling assertions at run time.
3. **Their fingerprints are not stable, by this file's own measurement.** See `D380` above: *"the count
   and the class are stable; which routes supply them is not entirely"* — a third run substituted a
   `POST /v1/coupons` `code` finding. A fingerprint is computed from the endpoint and the field, so a
   substitution is a **new** fingerprint, which is exactly what a baseline fails on. The file would
   churn between runs *and* redden in the direction that matters.

They remain documented under `D380`, where a count and a class are the right instrument, and where
being a measurement rather than a gate is the honest description.

## Not planted, on purpose

- **~~TLS version and cipher.~~ Half of this row is now `V18`, and the half that is left is
  permanent.** `M128c` shipped `sec/tls-version-old` and `sec/tls-weak-cipher`, and the plan's §3
  said to decide their positives "on a real container, not now". Decided, on Fedora 43 / OpenSSL
  3.2.6 / Node 22, and re-measured on nginx:1.27-alpine 2026-08-18:

  | weakness | listener constructible? | reachable by tflw's own probe? |
  | --- | --- | --- |
  | TLS 1.0 / 1.1 | **no** — the distro crypto policy compiles the protocols out (`ERR_SSL_NO_PROTOCOLS_AVAILABLE`, and an internal error even at `@SECLEVEL=0`) | — |
  | 3DES, RC4, EXPORT | **no** — not in OpenSSL 3.2's default provider (`ERR_SSL_NO_CIPHER_MATCH`) | — |
  | `NULL-SHA256` (eNULL) | **yes** | **yes, since `M137g`** — under `probe ciphers`, which offers one suite per handshake at `@SECLEVEL=0`. Not reachable by a default ClientHello, which carries `!eNULL` |

  **The original row read those three lines as one fact and they are two.** A protocol that cannot be
  compiled into a listener is unconstructible forever on this platform; a *suite* that a listener
  will speak and a client will not ask for is unconstructible only for as long as the client refuses
  to ask. `D299` had said as much — *"enumerating a server's whole offer takes one handshake per
  suite"* — and it was written here as future work rather than as the missing half of a measurement,
  so for two milestones the two rules were quoted together as equally impossible. They were not.

  What stands:

  - **`sec/tls-version-old` — positive unverified by construction, permanently on this platform.**
    Its positive is covered by unit tests against synthetic handshake facts
    (`packages/runtime/test/security-rules.test.ts`); its live negative and not-applicable cases are
    demonstrated by `tflw-acceptance/security/`.
  - **`sec/tls-weak-cipher` — planted as `V18` and demonstrated live**, on nginx's 8445 listener.
    3DES and RC4 remain unconstructible, so eNULL is the only broken suite this repo can plant — and
    one is enough, because what the rule was missing was never a *particular* suite. See the section
    below.

  One consequence still worth reading twice, and now stated as the reason `V18` exists rather than as
  a limitation being accepted: the rule as `M128c` shipped it fired only on a host that gave a
  current client nothing better, so it could not see a server that merely still *offers* a broken
  suite alongside AES-GCM. That is the right answer for a per-response assertion, and `probe ciphers`
  is the audit that was missing.
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
- **A CSRF-unenforced mutating route (`sec/csrf-not-enforced`'s positive) — and the reason is that the
  positive and the negative control cannot coexist on one target.** Every mutating route in apiV2 is
  behind `AnyAuthGuard`, including the deliberately-broken ones
  (`apiV2/src/vuln/vuln-orders.controller.ts:51`), so nothing here would accept a token-less
  cookie-borne write. Planting one means either weakening that guard or writing a route that bypasses
  it — and the guard *is* the rule's negative control (D434). Weaken it and the silent case stops being
  a demonstration; bypass it and the plant no longer tells you anything about the guard the rest of the
  corpus relies on. Unlike the `sec/tls-*` rows above, this is not a limit of the platform: the
  positive is constructible and is built in tflw's own `node:http` fixture, where a defence written to
  be caught costs nothing because nothing else depends on it. So the rule's live evidence here is its
  **silent** and **not-applicable** states, and `verify:security-acceptance` prints the missing `fires`
  by name every run rather than letting the coverage table imply three ticks.
- **Anything in a real endpoint.** The suite's ~45 other files run against the clean app, and
  `plan_v2.md` §4.2's rule — real endpoints stay clean — is what makes their results mean anything.
  Tier 2 does not weaken this: `V6`–`V8` are dedicated routes, never a `VULN_MODE` branch inside
  `OrdersService.findOneScoped`. The cheaper version would exercise the genuine route with its
  genuine body, and it would put an authorization bypass inside authorization code, one misread
  environment variable away from being real.
