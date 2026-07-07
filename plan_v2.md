# testFlow-tests v2 — a realistic Dockerized API to surface true tflw DSL gaps

## Context

`testFlow-tests/` is the dogfood/acceptance target for the `tflw` testing DSL. Today it is two
intentionally-minimal plain-Node servers (api/core :4001 bearer, api/auth :4002 cookie) + a static
frontend, all in-memory, with a 26-test green suite. It is deliberately far from a real-world API:
no relationships (orders aren't even tied to the authing user), no PATCH/ETag/idempotency, thin 4xx
variety, HMAC tokens with no expiry, pagination on `/products` only, and a test-only `X-Test-NS`
header smell. `TFLW-FEATURE-GAPS.md` already catalogs 4 confirmed DSL gaps found while building it.

The goal of this work is **not** a better product — it is **tflw DSL gap discovery**. tflw is a
deliberately *fenced* DSL (SPEC §7.5: loops/conditionals/computation live in the `use` JS escape
hatch). So we build a genuinely production-grade API, write the real-world scenarios a user would
naturally reach for, and every point of friction is triaged against a fixed criterion into either a
**true gap** (a missing *declarative* capability or first-class ergonomic — worth backlogging) or a
**working-as-intended punt** (branching/looping/computation — not a gap). The deliverable is a
ranked, evidence-backed gap report plus a landing-pad milestone stub in the tflw repo.

### Decisions locked during grilling
1. **North Star:** gap discovery is the deliverable; API realism is the instrument. **tflw itself
   (`testFlow/`) is NOT modified this round** — only a proposed, unimplemented milestone stub is added.
2. **Gap criterion:** a true gap = a missing *declarative* request/assertion capability a user would
   reasonably expect, OR first-class ergonomic/DRY friction. Anything needing loops/conditionals/
   computation stays in JS by design and is explicitly **not** a gap. Mainstream tools
   (Postman/Playwright/RestAssured/Karate/Bruno) are a cross-check only.
3. **Envelope:** drift from the plain-Node/in-memory philosophy is accepted — a full-fledged API in
   a Docker container behaving as close to real as possible.
4. **Rebuild:** fresh **v2** target inside `testFlow-tests`; retire the plain-Node servers; port the
   existing 26 tests where they still apply, then add gap-provoking scenarios.
5. **Stack:** **NestJS + Postgres**, Dockerized.
6. **Scope:** all four capability clusters (auth/authz, errors/schema, HTTP-maturity/cookies,
   async/query).
7. **Isolation:** **header-free, isolation-tolerant** suite (retire `X-Test-NS`) — ephemeral per-run
   DB, unique/random data for mutations, per-test unique facets for exact-count/pagination assertions.
8. **Expiry:** real short configurable JWT TTL (observed via `wait until api`).
9. **Domain:** deepened e-commerce (users, products+categories, orders→line-items, reviews, carts).
10. **Deliverable:** ranked evidence-backed `TFLW-GAPS.md` in testFlow-tests + a proposed
    (unimplemented) "API-hardening" milestone stub appended to `testFlow/PLAN.md`.

---

## Part A — The v2 realistic API (NestJS + Postgres, Dockerized)

**Location & lifecycle.** New app under `testFlow-tests/` (e.g. `apiV2/` NestJS project +
`docker-compose.yml` for `postgres` + `api`). Retire `api/core`, `api/auth`, `frontend`, and the
plain-Node `cli.mjs`/PID logic (`cli.mjs:12-16,39-48`). Rewrite `cli.mjs start|stop|status` to wrap
`docker compose up -d --wait` / `down` / `ps` (keep the same CLI contract so the
`testflow-tests-app` skill and its description keep working). Migrations + a deterministic seed run
on container start; API exposed on a single host port (e.g. :4001). `scripts/refresh-tflw.mjs` and
the `vendor/tflw-*.tgz` consumption model are unchanged; `npm test` still runs `tflw run` on the
host against the exposed container.

**Domain (deepened e-commerce):** `users`, `categories`, `products` (FK→category), `orders`
(FK→user) → `order_items` nested sub-resource (`/orders/{id}/items`), `reviews` (user↔product
many-to-many), optional `carts`. Real Postgres FKs/constraints → genuine 409s, cascades, and
unique-violation errors.

**Cluster 1 — Auth & authz realism**
- JWT **access + refresh** with **real, short, configurable TTL** (access ~3–5s in test, refresh
  longer). Standard `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/register`, `/auth/profile`.
- RBAC **roles + scopes** (NestJS guards); **user-scoped resources** — your orders ≠ my orders
  (user B GETting user A's order → 403/404). Multiple seeded identities (admin, two distinct users).
- Real cookie **session + refresh cookie + CSRF token**, with proper `Set-Cookie` attributes
  (HttpOnly/SameSite/Max-Age) — and **stop echoing `sessionId` in the body** (that echo only exists
  to dodge tflw's missing cookie subject; removing it is what surfaces the gap).

**Cluster 2 — Errors & schema contract**
- **RFC7807 problem+json** everywhere via a NestJS exception filter, with field-level validation
  detail (`{type,title,status,detail,errors:[{field,message}]}`) from class-validator DTOs → 422.
- **Auto-generated OpenAPI** via `@nestjs/swagger` (served at `/openapi.json` + Swagger UI) so
  scenarios can attempt schema/contract assertions.

**Cluster 3 — HTTP maturity & cookies**
- **ETag / If-Match** conditional requests (304 Not Modified, 412 Precondition Failed) on product
  reads/updates (optimistic concurrency).
- **Idempotency-Key** on order creation (repeat key → same result, no duplicate).
- Content negotiation (406/415), full status variety (**405** Method Not Allowed, **409** Conflict,
  **422**), and **/v1** versioning (a second named service base path in tflw.config).

**Cluster 4 — Async & query**
- **202-Accepted async jobs** (e.g. order fulfillment) returning `Location`, polled to completion —
  extends today's order state machine but via a real job.
- **Rate limiting + `Retry-After`** on a hot path.
- **Cursor + offset pagination** with `Link` headers; **filtering/sorting/full-text search** on
  products; nested list endpoints.

**Isolation model (header-free).** Ephemeral per-run DB (fresh compose volume). Mutating tests use
`unique`/`random` generators (existing house style). Exact-count & pagination tests each create and
query a **per-test unique facet** (e.g. a unique `category`) so `total`/page math is exact and
parallel-safe under `--workers` without any test-only header and without truncation.

---

## Part B — The tflw scenario suite (rewritten in `tests/*.tflw`)

Rewrite `tflw.config` (currently `tflw.config:12-28`) for the single Dockerized service + `/v1`
named service, new sessions (bearer `admin`, a second bearer `user`, cookie `shopper`), and drop
the `X-Test-NS` machinery. Port the 26 existing scenarios (auth, crud-lifecycle, sessions,
quantifiers, data-tables, batch, retry-and-flake, rate-limit, pagination, order-workflow,
interleaved-sessions, generators, actions-and-helpers) to the v2 API where they still apply, then
**add the gap-provoking scenarios**, each authored to hit a specific candidate gap:

| New scenario | Provokes candidate gap |
|---|---|
| Assert full RFC7807 nested error shape in one statement | **Partial-object / subtree matching** (declarative) |
| `expect body matches schema` against `/openapi.json` | **Schema/contract validation** (declarative) |
| Assert `Set-Cookie` attributes (HttpOnly/SameSite/Max-Age) | **Cookie subject** (declarative) |
| Rate-limit: retry honoring `Retry-After` | **Retry-After-aware retry** (#2) |
| Async job poll needing a per-poll header | **`wait until api` per-step headers** (#3) |
| Token-expiry → refresh chain (real short TTL) | **No fixed-delay/`sleep` primitive** (ergonomic) |
| user-A vs user-B vs admin authz in one test | **2nd session per test** (#4) |
| Idempotency-Key repeat-safety | header capture/replay ergonomics |
| ETag/If-Match 304/412 conditional flow | conditional-request ergonomics |
| Cursor pagination + `Link`-header follow | page-walk (**intended escape-hatch — confirms fence**) |
| Deep nested-resource path assertions | richer JSON-path needs |

**Evidence pattern (per the existing GAPS convention, richer):** for each candidate gap the suite
carries (1) a **working** scenario using today's workaround (JS escape hatch or N-line expansion) so
the green suite stays green, and (2) a commented **"ideal syntax"** block showing what we wish we
could write. Can't-express-at-all cases go in a `tests/.gaps/` dot-dir (excluded from the default
run, like today's `.demo-fail/`) as executable proof.

---

## Part C — The deliverable

1. **`testFlow-tests/TFLW-GAPS.md`** (successor to `TFLW-FEATURE-GAPS.md`): a **ranked** table of
   true gaps. Each entry: the ideal scenario, **why it qualifies** under the criterion
   (declarative/ergonomic — not a loop/branch punt), the **proof** (link to the escape-hatch
   scenario / `.gaps/` file), **severity × frequency** (how often it recurred across the suite),
   proposed DSL syntax, and a cross-check note vs. a mainstream tool. Intended escape-hatch findings
   (page-walk, arbitrary branching) are listed separately as **confirmed-by-design**, not gaps.
2. **`testFlow/PLAN.md` milestone stub** (the only change to the tflw repo): a proposed, **not
   implemented** "API-hardening / declarative-expressiveness" milestone that lists the ranked gaps as
   actionable items for a future tflw session, with SPEC §16 parking-lot promotions noted. No tflw
   grammar/runtime/SPEC edits.

---

## Build phasing (big-build convention: in-repo PLAN.md + PROGRESS.md + per-milestone tests)

- **M0** — NestJS+Postgres+Docker scaffold, `cli.mjs`→compose, migrations/seed, health, `/v1`,
  OpenAPI; retire plain-Node app.
- **M1** — Auth & authz cluster + port the auth/session/authz tests.
- **M2** — Errors & schema-contract cluster + port CRUD/validation tests; nested resources.
- **M3** — HTTP-maturity & cookies cluster (ETag/idempotency/status-variety/cookies).
- **M4** — Async & query cluster (jobs/rate-limit/pagination/search); port workflow/pagination/rate tests.
- **M5** — Gap-provoking scenarios + `.gaps/` proofs; write `TFLW-GAPS.md` (ranked) + `testFlow/PLAN.md` stub.

Each milestone keeps the ported subset of the suite green before adding the next.

---

## Verification (end-to-end, not just unit)

- `node cli.mjs start` → `docker compose up -d --wait` brings Postgres + API healthy; `curl`
  `/v1/health` and `/openapi.json` return 200.
- `npm run refresh-tflw` (re-pack tflw) → `npx tflw run` executes `tests/*.tflw` on the host against
  the container: the ported + green gap-workaround scenarios pass; `report/report.html` +
  `report/junit.xml` are produced.
- `npx tflw run --workers 4 --seed 12345` passes deterministically (proves the header-free isolation
  model is parallel-safe).
- `npx tflw run tests/.gaps/*.tflw` demonstrates the can't-express failures as intended.
- `node cli.mjs stop` tears the stack down cleanly.
- Confirm `TFLW-GAPS.md` is ranked with per-gap proof links, and the `testFlow/PLAN.md` stub is
  present and clearly marked "proposed, not implemented".
