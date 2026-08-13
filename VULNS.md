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
```

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
| `V8` | `DELETE /v1/vuln/orders/:id` | **positive** | `sec/authz-object-leak` (under `probe mutating` only) | critical |

`V1`–`V5` are Tier 1's, and they are claims a response makes about *itself* — headers and cookie
flags. `V6`–`V8` are Tier 2's, and they are claims about *who is allowed to see what*, which is a
different kind of fixture: nothing in the response is malformed, and every one of them is a `200` a
correct endpoint would also have returned to somebody.

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
  destructive; `order_items`, `jobs` and `return_requests` all cascade on the order FK.

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

**The table above is Tier 1's twelve rules only.** `sec/authz-object-leak` and
`sec/authz-collection-leak` do not appear because no tflw ships them yet — `M130a` planted their
target, `M130b` builds the rules, and `M130c` is what adds their two rows here and teaches
`verify-security-acceptance.mjs` to grade them. Until then the absence is a sequencing fact, not a
gap in the measurement.

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
- **Injection (SQLi, command, template).** Tier 3. Finding it needs request *mutation* against a
  strict oracle, not a re-attributed replay of a request the suite already made, and a planted
  injection point with no fuzzer behind it is the same cost-with-no-coverage this list keeps
  refusing.
- **Anything in a real endpoint.** The suite's ~45 other files run against the clean app, and
  `plan_v2.md` §4.2's rule — real endpoints stay clean — is what makes their results mean anything.
  Tier 2 does not weaken this: `V6`–`V8` are dedicated routes, never a `VULN_MODE` branch inside
  `OrdersService.findOneScoped`. The cheaper version would exercise the genuine route with its
  genuine body, and it would put an authorization bypass inside authorization code, one misread
  environment variable away from being real.
