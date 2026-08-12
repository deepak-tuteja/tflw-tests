# VULNS.md — the known-answer ledger for tflw's pentest arc

Every deliberately-flawed and deliberately-hardened response this suite can produce, and which
tflw rule each one is the answer to. Written for testFlow `M128a`
([PLAN_M128_PENTEST_TIER1.md](../testFlow/PLAN_M128_PENTEST_TIER1.md), D293/D295); consumed by
`M128c`'s acceptance pass, which measures the Tier 1 rule pack's precision and recall against it.

**A planted flaw with no row here is how a target drifts out of sync with the acceptance that
depends on it.** So the rule is: no route in `apiV2/src/vuln/` without a row, and no row without a
route. `scripts/verify-security-target.mjs` enforces both halves against the running stack —
it curls every case below and asserts the header and cookie facts this file claims.

**Nothing in this file is a real vulnerability in a real endpoint.** The `vuln/` slice is
header-and-cookie-flags only, gated behind `VULN_MODE=1`, and absent from the app entirely without
it. Application-logic flaws (broken object authorization, injection) are Tier 2's problem and are
deliberately not here — see `apiV2/src/vuln/vuln.controller.ts` for why.

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

**Two of the five are clean, and that is the part worth reading twice.** Clean apiV2 gives
`csp-missing`, `x-frame-options` and `cors-wildcard-with-credentials` their *not-applicable* case —
its responses are JSON and same-origin, so those rules never engage. A rule that never engaged has
not been shown to stay silent, so `V2` and `V5` exist to supply the **negative** that clean apiV2
structurally cannot.

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
- **Broken object authorization (BOLA/IDOR).** Tier 2. A passive header scan cannot see it, so
  planting it now would be cost with no coverage behind it.
- **Anything in a real endpoint.** The suite's ~45 other files run against the clean app, and
  `plan_v2.md` §4.2's rule — real endpoints stay clean — is what makes their results mean anything.
