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

---

## Part D — M6: realistic-scale gap hunting (planned, not yet built)

Gaps #1 (cookie jar) and #2 (partial-object matching) from M5's `TFLW-GAPS.md` are fixed in tflw
and dogfooded here. 5 gaps remain (#3-#7), already ranked with proof fixtures. This round extends
gap-hunting toward realistic-scale scenarios — large JSON bodies, long chains of requests where one
response's data becomes the next request's body, mixed request-body types, and a second auth
scheme — before resuming the one-gap-at-a-time fix cadence on the combined backlog. Same North
Star as M5: **no tflw code changes this round** — this is investigation, mirroring M5's shape.
Scoped via a `/grill-me` session, 2026-07-07.

### Decisions locked during grilling
1. **Sequencing:** investigate first (build these scenarios, discover/rank whatever gaps surface),
   *then* merge into the existing #3-#7 backlog and resume the one-gap-at-a-time fix cadence — not
   finish #3-#7 first.
2. **Domain:** stretch the existing e-commerce domain rather than introduce a new resource —
   reuses all existing auth/session/error infra.
3. **Partial-replace need** turned out to be two distinct things once unpacked: (a) a real
   nested-resource `PATCH /orders/:id/items/:itemId` endpoint (doesn't exist today — PATCH is
   shallow-field-only everywhere, and there's no way to update one item inside an order's items
   array without resending the whole array), and (b) a captured value from one response
   substituted into a large external JSON template consumed by a later request — which turned out
   to **already work** (`body from "./payloads/x.json"` + `{var}` interpolation,
   `packages/lang/src/parser.ts:809-826`, `packages/runtime/src/interpreter.ts:743-753`) and just
   needs to be exercised at real scale, not designed.
4. **Scale:** realistic app-scale — tens to low hundreds (50-200 array elements, 3-4 levels deep
   nesting), not thousands. True large-N (thousands+) would need real bulk-seed infra that doesn't
   exist and risks conflating "DSL expressiveness gap" with "this is slow because it's a lot of
   data" — a different, non-language problem.
5. **Response verification:** deliberately probe two things found during grounding — gap #3
   (correlated array-element predicates) rescaled to realistic volume, and a genuinely new
   candidate: failure diffs are completely untruncated
   (`packages/runtime/src/matcher.ts:130-134`, bare `JSON.stringify`, no length cap, no per-field
   ignore/exclude) — a large nested mismatch produces a wall of unreadable JSON today. At least one
   test deliberately fails on a large body on purpose to get real evidence, not a hunch.
6. **Long-lasting auth** = the refresh lifecycle itself, compressed — short configurable TTLs (like
   the existing 5s access token) proving a session survives several expire→`POST
   /auth/refresh`→continue cycles across many sequential requests. *Not* a new "remember me"
   long-lived token family — the auth module already has real rotation
   (`apiV2/src/auth/auth.service.ts#refresh`, revokes old jti, issues new pair); no new backend
   auth-lifetime work needed, just a scenario exercising what's there.
7. **Long chain of requests:** the existing suite chains ids into URL paths constantly but never
   chains substantive response *data* into a subsequent request *body* more than 1-2 hops. Add a
   genuinely long chain (5+ hops: category → product → order → fetch → patch-item using data read
   back → review referencing patched data → fetch-and-cross-check) that deliberately covers all
   four combinations of the interpolation matrix, so every case is proven with real chained data:
   - inline body, **partial** replacement (some fields from a prior response, some static)
   - inline body, **complete** replacement (every value a `{var}` hole, nothing static)
   - `body from` file, **partial** replacement (file mixes static fields and holes)
   - `body from` file, **complete** replacement (file is a full template, every value a hole)
8. **Request-body-type coverage:** `form k=v` (urlencoded) and `upload "..." as "field"`
   (multipart) already exist in tflw's grammar (`packages/lang/src/ast.ts:164-184`) but **zero**
   endpoints in apiV2 accept non-JSON content types today — neither is exercised anywhere in this
   repo. Fix: `POST /auth/login` also accepts `application/x-www-form-urlencoded` (classic
   HTML-form login, branching on `Content-Type` the same way the existing 406/415
   content-negotiation cluster already does); new `POST /products/:id/image` (admin-only,
   multipart, stores just `filename`/`mimeType`/`sizeBytes` metadata — no real file
   persistence/serving, matching this repo's "simulate the realistic surface, don't build
   unnecessary infra" pattern already used for async jobs).
9. **Auth-type coverage:** bearer (already extensive) and HTTP **Basic** — apiV2 has no Basic guard
   at all today (only `bearer-auth.guard.ts`/`session-auth.guard.ts`). Extend the existing
   multi-scheme combinator (`AnyAuthGuard`) to also accept `Authorization: Basic
   base64(email:password)` against the same user credentials, applied uniformly rather than as a
   separate parallel surface. tflw has no `base64(...)` generator function, so a declarative Basic
   header may itself be a real finding (forced JS escape hatch, or confirmed-by-design) — the test
   is written to surface that either way, not to presuppose the answer.

### apiV2 changes
1. **Seed expansion** (`apiV2/src/seed/seed.ts`) — keep the 5 hand-written products, add ~120
   generated ones round-robined across a widened category list (+2-3 categories), same idempotent
   upsert-by-name pattern. Gives `GET /products` pagination/filter/sort/search real volume.
2. **Nested embedding in order responses** (`apiV2/src/orders/orders.service.ts`) — deepen
   `relations: { items: true }` to `relations: { items: { product: { category: true } } }` in
   `findOneScoped`/`findOwn`/`findAllAdmin`; attach the already-fetched product (with its category)
   onto each created `OrderItem` in `create()`. `OrderItem.product` and `Product.category` relation
   columns **already exist** on the entities — this is a `relations`-option change, not a
   migration. Result: order → items[] → product{name,price,category{name}}, genuine 3-level nesting
   on every order read.
3. **`PATCH /orders/:id/items/:itemId`** — same guard/ownership pattern as `GET :id/items` (reuse
   `findOneScoped`, then locate the item within `order.items`, 404 if it doesn't belong to that
   order). `UpdateOrderItemDto` — `quantity?: number` only, shallow merge (mirrors `PATCH
   /products/:id`'s convention). Deliberately no ETag/If-Match concurrency — `OrderItem` has no
   `VersionColumn` today; out of scope this round.
4. **Form-urlencoded login**, **product image upload** — see decision 8 above.
5. **Basic auth** — see decision 9 above.

### testFlow-tests changes
New `tests/payloads/` directory (sibling to `tests/helpers/`) holding external JSON templates
consumed via `body from`. New/extended `.tflw` files:
- `tests/large-order.tflw` — large templated order body via `body from`; verifies the large nested
  response with `has count` + `matches subset` + `any`/`all` at scale; extends gap #3's existing
  correlated-predicate proof (`tests/order-items.tflw`) to real volume (50+ items, not 2).
- `tests/large-catalog.tflw` — pages/filters/sorts/searches the now-substantial catalog at
  realistic volume using count/quantifier assertions instead of listing every row.
- `tests/order-item-patch.tflw` — exercises the new nested-item PATCH, verifying just the patched
  item's new state via `matches subset` without restating the whole order.
- `tests/refresh-lifecycle.tflw` — compressed-TTL session, several expire→refresh→continue cycles
  across many sequential requests (reuses `tests/helpers/wait-seconds.ts`'s existing pattern from
  `token-expiry.tflw`).
- `tests/.demo-fail/large-response-diff.tflw` — one deliberate, intentionally-failing large-body
  assertion (mirrors the existing `.demo-fail/` convention), captured specifically to get real
  `report.html`/error-message evidence of the untruncated-diff behavior.
- `tests/request-chain.tflw` + `tests/payloads/chain-partial.json` + `tests/payloads/chain-full.json`
  — the 5+ hop chain covering all four interpolation-matrix combinations (decision 7).
- `tests/body-types.tflw` — `form email={u}, password={p}` against urlencoded-capable
  `/auth/login`; `upload "./payloads/sample.png" as "image"` against the new product-image
  endpoint; alongside existing all-JSON coverage for contrast.
- `tests/basic-auth.tflw` — exercises Basic auth against an existing bearer-guarded endpoint
  (e.g. `GET /orders/all` as admin), noting whichever way decision 9's finding lands.

### Deliverable
- `TFLW-GAPS.md` updated with whatever's actually observed after running the above against the
  real API: confirmed-working entries (in "Evaluated, found not to be gaps") for whichever of
  `body from`-at-scale / refresh-lifecycle / Basic-auth-header turn out fully declarative, a ranked
  new entry for the untruncated-diff/no-ignore-list finding if the deliberate failure confirms it,
  and a rescaled evidence note on gap #3. Gap numbers stay stable; new findings get the next
  number(s) after 7.
- `PROGRESS.md` — new `## M6 — realistic-scale gap hunting` section (mirrors M5's format).

### Verification
1. Fresh `node cli.mjs stop && node cli.mjs start` (rebuilds apiV2 with the seed/entity/endpoint
   changes).
2. `npx tflw check` — all files including new ones parse clean.
3. `npx tflw run` — full suite green except the intentionally-excluded `.demo-fail/` file.
4. Manually run `.demo-fail/large-response-diff.tflw` directly to capture real report.html/CLI
   output as evidence for the diff-size finding.
5. Repeat `npx tflw run --workers 4` on another fresh restart — confirm the new large/bulk-seeded
   data doesn't break parallel-safety at the new scale.
6. Update `TFLW-GAPS.md`/`PROGRESS.md` with actual findings from steps 3-5, not speculative ones.
7. Commit + push testFlow-tests changes (apiV2 + tests + docs) as one milestone, matching the M1-M5
   commit convention. Update project memory afterward.
8. Checkpoint with the user: report the merged, re-prioritized backlog (existing #3-#7 + any new
   findings) and stop before starting the one-gap-at-a-time fix cadence, per their standing
   instruction.
