# testFlow-tests — PROGRESS

Build tracker, same discipline as [testFlow's own PROGRESS.md](../testFlow/PROGRESS.md): flip a
milestone to in-progress when it starts, check items off as they land, fill in **Verified by**
with real evidence before marking it done.

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done

| Milestone | Status | Started | Finished |
|---|---|---|---|
| M1 — API showcase | ✅ | 2026-07-06 | 2026-07-06 |
| M1.5 — parallel-safety, negative cases & richer scenarios | ✅ | 2026-07-06 | 2026-07-07 |
| ~~M2 — UI showcase~~ / ~~M3 — watch-mode~~ / ~~M4 — reuse-pass~~ / ~~M5 — full acceptance parity~~ | superseded | — | — |

**Superseded 2026-07-07** by `plan_v2.md` — the v2 rewrite (NestJS+Postgres, dogfood gap-discovery)
retires the plain-Node app, so the old M2–M5 UI/watch-mode/reuse-pass/acceptance milestones no
longer apply. See the v2 tracker below.

---

## v2 rewrite — realistic Dockerized API (plan_v2.md)

| Milestone | Status | Started | Finished |
|---|---|---|---|
| M0 — NestJS+Postgres+Docker scaffold | ✅ | 2026-07-07 | 2026-07-07 |
| M1 — Auth & authz cluster | ✅ | 2026-07-07 | 2026-07-07 |
| M2 — Errors & schema-contract cluster | ✅ | 2026-07-07 | 2026-07-07 |
| M3 — HTTP maturity & cookies cluster | ✅ | 2026-07-07 | 2026-07-07 |
| M4 — Async & query cluster | ✅ | 2026-07-07 | 2026-07-07 |
| M5 — Gap-provoking scenarios + TFLW-GAPS.md | ✅ | 2026-07-07 | 2026-07-07 |

---

## M0 — NestJS+Postgres+Docker scaffold ✅

- [x] `apiV2/` NestJS project (TypeORM + `pg`, `@nestjs/config`, `@nestjs/swagger`,
      `@nestjs/jwt`+`@nestjs/passport` installed ahead of M1, `class-validator`/`class-transformer`,
      `cookie-parser`, `bcrypt`)
- [x] Domain entities: `User` (role enum), `Category`, `Product` (FK→category, `@VersionColumn`
      for the M3 ETag/If-Match cluster), `Order` (FK→user, nullable-unique `idempotencyKey` for
      the M3 cluster — Postgres treats NULLs as distinct so non-idempotent requests never
      collide), `OrderItem` (FK→order+product, price snapshot), `Review` (unique per user+product)
- [x] `src/data-source.ts` (shared by the TypeORM CLI and `TypeOrmModule.forRootAsync`) +
      generated `InitSchema` migration, applied cleanly against a real Postgres
- [x] `src/seed/seed.ts` — deterministic, idempotent (upsert-by-natural-key) seed: admin + two
      distinct users (alice/bob, for M1's cross-user authz tests), 3 categories, 5 products
- [x] `GET /v1/health` (checks DB via `SELECT 1`), global `/v1` prefix, global `ValidationPipe`
- [x] OpenAPI via `@nestjs/swagger`: spec at `/openapi.json`, UI at `/docs` (both outside the
      `/v1` prefix, as Swagger mounts directly rather than as a controller)
- [x] `Dockerfile` (node:22-alpine, single-stage, `npm ci && npm run build`) + `docker-entrypoint.sh`
      (migration:run → seed → `node dist/main.js`) + `docker-compose.yml` (postgres healthchecked,
      no named volume — ephemeral per-run DB per plan_v2.md's isolation model; api depends on
      postgres's healthcheck, itself healthchecked via `wget` on `/v1/health`)
- [x] `cli.mjs` rewritten to wrap `docker compose up -d --build --wait` / `down -v` / `ps` — same
      `start|stop|status` CLI contract, so the `testflow-tests-app` skill needed no logic changes
      (description text updated in both `.claude/skills/` and `.pi/skills/`, plus root `CLAUDE.md`)
- [x] Retired `api/core`, `api/auth`, `frontend`, the old plain-Node `cli.mjs`; root `package.json`
      scripts trimmed (`start:core`/`start:auth`/`start:frontend` removed); `.env`/`.env.example`
      updated to the v2 shape (DB creds, JWT secrets, admin+userA+userB credentials)

**Verified by:** full stack brought up twice via `node cli.mjs start`/`stop` against real Docker
(2026-07-07):
1. `docker compose up -d --build --wait` builds the image, waits for both `postgres` and `api`
   healthchecks — both report `Healthy`.
2. `curl /v1/health` → `200 {"status":"ok","db":"ok"}`; `curl /openapi.json` → `200`; `curl /docs`
   → `200`.
3. `psql` against the running container confirms the seed ran: 3 users
   (`admin@example.com`/admin, `alice@example.com`/user, `bob@example.com`/user), 5 products
   across 3 categories.
4. Seed idempotency confirmed independently (pre-Docker, against a temporary local Postgres):
   running `npm run seed` twice left row counts unchanged (3 users, 5 products) — no duplicates.
5. **Ephemeral-per-run isolation proven**: `node cli.mjs stop` (→ `docker compose down -v`)
   removes both containers, the network, *and* the postgres volume; a subsequent
   `node cli.mjs start` rebuilds from scratch, re-runs migrations+seed, and `select count(*) from
   users` again reports exactly 3 — confirming no state survives a stop/start cycle.
6. `node cli.mjs status` (→ `docker compose ps`) reports nothing when stopped, both containers
   when started.

---

## v2 M1 — Auth & authz cluster ✅

- [x] `TokenRecord` entity (`token_records` table) — one row per issued *revocable* token,
      shared by all three token families (bearer refresh, cookie session, cookie
      session_refresh); a `AddTokenRecords` migration applied cleanly. Renamed from an initial
      `RefreshToken`-only design once the cookie session itself needed real logout invalidation,
      not just client-side cookie clearing.
- [x] `TokensService` — four token families on two secrets: access-class (`access` bearer +
      `session` cookie) signed with `JWT_ACCESS_SECRET`; refresh-class (`refresh` bearer +
      `session_refresh` cookie) signed with `JWT_REFRESH_SECRET`. Each carries its own TTL
      (`JWT_ACCESS_TTL=5s`, `JWT_REFRESH_TTL=1h`, `JWT_SESSION_TTL=1h`,
      `JWT_SESSION_REFRESH_TTL=2h`) and a `typ` claim so one can't be replayed as another even
      though the signature would still verify.
- [x] `AuthService`/`AuthController` — `POST /auth/register|login|refresh|logout`, `GET
      /auth/profile` (bearer); `POST /auth/session-login|session-refresh|session-logout` (cookie,
      single Set-Cookie — used by tflw.config's cached `shopper` session) + `POST
      /auth/session-login-full` (cookie, dual Set-Cookie: session + session_refresh, for the
      dedicated refresh-cookie realism test only — kept off the shared session path specifically
      so replaying the captured `set-cookie` header as a plain `Cookie` header stays declarative;
      see plan_v2.md Part A / TFLW-FEATURE-GAPS.md)
- [x] Guards: `BearerAuthGuard`, `SessionAuthGuard` (+ CSRF check on mutating methods via
      `X-CSRF-Token` against a claim embedded in the session JWT), `AnyAuthGuard` (either
      transport), `RolesGuard` (+ `@Roles()`/`@CurrentUser()` decorators)
- [x] Minimal `ProductsModule` (read-only: `GET /products`, `GET /products/:id`) and
      `OrdersModule` (`POST /orders`, `GET /orders` (own), `GET /orders/all` (admin-only, RBAC),
      `GET /orders/:id` (owner-or-admin, 403 otherwise)) — just enough surface to prove
      user-scoped-resource authz; full CRUD/validation/nested-resource richness is M2's job
- [x] `tflw.config` rewritten for the single Dockerized service (`/v1` baked into the env's base
      URL, no more separate named `auth` service); `admin` session (bearer) and `shopper` session
      (cookie, single Set-Cookie only)
- [x] Ported/added `.tflw` files: `auth.tflw` (register/login/refresh-rotation/logout/RBAC/401),
      `sessions.tflw` (cookie login/profile/CSRF-protected mutation/logout-invalidation/dual-cookie
      attributes), `authz.tflw` (new — cross-user 403, owner/admin 200, own-orders-list scoping)
- [x] Not-yet-ported v1 files (target the retired API entirely; belong to M2–M4's clusters) moved
      to `tests/.pending-v2-port/` (dot-dir, excluded from default `tflw run`/`check`, same
      convention as `.demo-fail`/`.checkonly`) rather than left broken in the active suite —
      preserves the content for reference when each cluster ports it back

**Verified by:** fresh `node cli.mjs stop && node cli.mjs start` (clean DB), then curl'd and
`tflw run` against the live stack, 2026-07-07:
1. **Bearer flow**: register → 201 with a working access token; login with wrong password → 401;
   `GET /auth/profile` with no token → 401; access token genuinely expires at its configured
   5s TTL (`sleep 6` then profile → 401); `POST /auth/refresh` mints a new working pair and
   **revokes the old refresh token** (reusing it afterward → 401, proving rotation, not just
   reissue); `POST /auth/logout` revokes the refresh token immediately (next refresh attempt with
   it → 401).
2. **RBAC**: non-admin bearer hitting `GET /orders/all` → 403; admin → 200.
3. **User-scoped ownership**: alice creates an order; alice reads it → 200; bob (a different
   seeded user) reads it → 403; admin reads it → 200 — proving the 403 is a real ownership check,
   not "any authenticated user can see anything."
4. **Cookie session flow**: `POST /auth/session-login` sets exactly **one** Set-Cookie
   (`session`, HttpOnly, SameSite=Lax, Max-Age=3600) and the body contains only `{userId,
   csrfToken}` — never the session secret itself. Cookie-authed `GET /auth/profile` → 200.
   Mutating `POST /orders` via cookie **without** `X-CSRF-Token` → 403; **with** the matching
   token → 201.
5. **Genuine session-logout invalidation** (not just client-side cookie clearing): captured the
   raw `session` cookie value, called `POST /auth/session-logout`, then replayed the *same*
   captured cookie value directly against `GET /auth/profile` → 401. This only works because the
   session token carries a `jti` resolved against `token_records` on every request, same
   revocation mechanism as bearer refresh.
6. **`session-login-full`** sets two Set-Cookie headers (`session` HttpOnly/SameSite=Lax/Max-Age
   3600, `session_refresh` HttpOnly/SameSite=Strict/Max-Age=7200); `POST /auth/session-refresh`
   with a live `session_refresh` cookie reissues a **single** new `session` Set-Cookie (never
   re-sends session_refresh, keeping the refresh flow chainable in a plain declarative test); with
   no `session_refresh` cookie at all → 401.
7. **tflw suite**: `npx tflw check` → `3 files checked, no problems found`; `npx tflw run` on a
   freshly-restarted stack → `PASS 17/17 passed`, exit 0.
8. **Known, already-precedented flake** (not a regression): re-running the full suite repeatedly
   against the same still-live stack (no restart in between) occasionally 409s on
   `auth.tflw`'s `unique email` registration test — the exact "`unique(...)`'s within-a-run-only
   distinctness guarantee, exhausted by many manual reruns against a long-lived, non-restarted
   service" artifact already documented in M1.5's verification. A fresh `stop`/`start` between
   runs (or a single run, as CI would do) is clean every time — confirmed 3/3 on fresh restarts,
   including once under `--workers 4`.

---

## v2 M2 — Errors & schema-contract cluster ✅

- [x] `ProblemDetailsFilter` — a global `@Catch()` exception filter rendering every thrown error
      (Nest `HttpException`s and anything unanticipated, e.g. a raw Postgres FK-violation) as
      RFC7807 `application/problem+json`: `{type: 'about:blank', title, status, detail,
      ...(errors if present)}`. 5xx responses are logged server-side via `Logger`; the response
      body itself stays generic for those, never leaking a stack trace.
- [x] `ValidationProblemException`/`toValidationProblem()` — a custom `ValidationPipe`
      `exceptionFactory` that flattens class-validator's nested `ValidationError[]` (including
      `err.children`) into a flat `{field, message}[]` and throws a `422 Unprocessable Entity`
      (not Nest's default `400`) carrying that array as `errors`, picked up by the filter above.
- [x] `CategoriesModule` — minimal read-only `GET /categories` (`assertExists(id)` throws
      `NotFoundException` for FK validation elsewhere); exists purely so tests can capture a real
      category UUID for product creation, now that categories are a real FK relationship rather
      than free-text.
- [x] `ProductsModule` promoted from M1's read-only stub to full CRUD: `POST /`, `PATCH /:id`,
      `DELETE /:id` (`204`), all `AnyAuthGuard` + `RolesGuard(@Roles(ADMIN))`; `GET /` and `GET
      /:id` stay public. `CreateProductDto`/`UpdateProductDto` (the latter `PartialType`-derived)
      validate `name` (non-empty string), `price`/`stock` (numeric, `Min(0)`), `categoryId`
      (`IsUUID`), each field annotated with `@ApiProperty()` for the OpenAPI spec.
- [x] Nested sub-resource: `GET /orders/:id/items` — reuses `OrdersService.findOneScoped` so it
      inherits the exact same ownership rule as its parent (`403` for a non-owning, non-admin
      caller), then returns just the `items` array; proves nested resources don't need their own
      parallel authz logic when they can borrow the parent's.
- [x] Ported/rewrote `.tflw` files against the real Postgres-backed schema (categories are now FK
      UUIDs, not free-text): `crud-lifecycle.tflw` (full CRUD + 401/403/422-field-detail/404-shape
      negative cases + a `random`-generated-fields case folded in from the old `generators.tflw`),
      `data-tables.tflw` (`with each`, inline and file-backed, `{categoryId}` resolved from the
      enclosing `before` hook), `actions-and-helpers.tflw` (shared `action` + JS `use` escape
      hatch, chained in one flow), `order-items.tflw` (new — nested-resource read + its
      ownership-scoping negative case). `tests/data/products.json` dropped its old free-text
      `category` field to match.
- [x] Deliberately out of scope for M2 (belongs to M3's "HTTP maturity & cookies cluster" per
      plan_v2.md): 409 Conflict semantics, 405/406/415, ETag/If-Match, Idempotency-Key. Confirmed
      the FK-RESTRICT delete-with-references case (deleting a product still referenced by an
      order item) doesn't crash the server uncaught — `ProblemDetailsFilter`'s untyped `@Catch()`
      renders it as a generic (if imprecise) `500` problem+json body — precise handling deferred
      to M3 as planned.

**Verified by:** fresh `node cli.mjs stop && node cli.mjs start` (clean DB), then curl'd directly
and via `tflw run` against the live stack, 2026-07-07:
1. **RFC7807 shape**: every error response (401/403/404/422/500) comes back
   `Content-Type: application/problem+json` with `{type: 'about:blank', title, status, detail}`;
   422s additionally carry a `errors: [{field, message}, ...]` array.
2. **Full CRUD lifecycle** (admin bearer): create → `201` with the posted fields echoed; read →
   `200`; update (`PATCH price`) → `200` with the new price; delete → `204`; re-read after delete
   → `404` with the RFC7807 shape, not a stack trace.
3. **Authz on mutation**: `POST /products` with no token → `401`; with a non-admin bearer → `403`.
4. **Validation**: `POST /products` with `name: ""`, `price: -5`, `categoryId: "not-a-uuid"` →
   `422` with all three fields present in `errors[].field`.
5. **Nested resource + its own ownership scoping**: user A creates an order, reads
   `GET /orders/:id/items` → `200` with the correct item(s); user B (non-owner, non-admin) hitting
   the same nested route → `403`, proving it inherits the parent's authz rather than being an
   open sub-resource.
6. **`npx tflw check`**: `8 files checked, no problems found`.
7. **`npx tflw run`** on a freshly-restarted stack: `PASS 30/30 passed`, exit 0 (17 carried over
   from M1 + 13 new/rewritten M2 tests).
8. **Parallel-safety**: repeated the same fresh-restart + run cycle with `--workers 4` →
   `PASS 30/30 passed` again, confirming M2's new tests don't introduce cross-worker collisions
   (no shared unique-constraint fields written by concurrent product-creation tests).
9. No new `TFLW-FEATURE-GAPS.md` entry from M2 — RFC7807 errors, field-level validation detail,
   and nested resources were all cleanly expressible declaratively; nothing here forced a JS
   escape hatch or exposed a DSL gap.

---

## v2 M3 — HTTP maturity & cookies cluster ✅

- [x] **ETag / If-Match optimistic concurrency on products.** `Product.version` (a
      `@VersionColumn`, already present since M0's `InitSchema` migration — no new migration
      needed) backs an opaque `"<version>"` ETag. `GET /products/:id` and the create/update
      responses all set it; a matching `If-None-Match` on `GET` returns a bodyless `304`. `PATCH`
      honors `If-Match` only when the caller sends it (a courtesy check, not a mandatory lock): a
      stale value is `412 Precondition Failed`, a current one succeeds and returns the bumped
      ETag.
- [x] **Idempotency-Key on order creation** (`Order.idempotencyKey`, already a unique column since
      M0 — Postgres treats `NULL` as distinct so keyless requests never collide). A repeated key
      from the *same* user returns the original order (`200`, not `201` — the status code itself
      tells a replaying client whether anything new happened); a concurrent duplicate that loses
      the unique-constraint race gets the same replay instead of an error; a key reused by a
      *different* user is treated as a genuine `409 Conflict`, not a valid replay.
- [x] **Genuine `405 Method Not Allowed`** for verbs a resource deliberately doesn't support,
      rather than letting routing fall through to a bare `404` (Express/Nest don't do this
      automatically — it needs an explicit handler): `PUT /products/:id` (only partial `PATCH` is
      supported) and all of `POST /categories` / `PATCH /categories/:id` / `DELETE
      /categories/:id` (categories are read-only in this API).
- [x] **Genuine `409 Conflict`** for the FK-restrict-delete case M2 explicitly deferred: deleting a
      product still referenced by an order item now catches the Postgres FK-violation
      (`ProductsService.remove`, via a new `common/db-errors.ts` `isForeignKeyViolation()` helper)
      and throws `ConflictException` instead of leaking a generic 500.
- [x] **Content negotiation (406/415)** via a global Express middleware
      (`common/content-negotiation.middleware.ts`, registered in `main.ts` ahead of Nest's router,
      since Nest's exception filters don't see errors thrown from raw `app.use()` middleware): an
      `Accept` the API can't satisfy → `406`; a body-bearing request whose `Content-Type` isn't
      `application/json` → `415`. Both render the same RFC7807 shape as everything else, built
      by hand in the middleware rather than via `ProblemDetailsFilter` for that same reason.
- [x] **`/v1` versioning as a real routing boundary, not just a URL convention** — a second named
      service (`api root "http://localhost:4001"`) added to `tflw.config` alongside the default
      `/v1`-prefixed one, reaching the Swagger/OpenAPI mount (`@nestjs/swagger`'s `setup()`
      deliberately mounts outside whatever global prefix is set) and proving a versioned-only
      route genuinely 404s when hit unversioned, rather than the prefix being decorative.
- [x] New `tests/http-maturity.tflw` (ETag/If-Match ×2, 405 ×2, 409, Idempotency-Key ×2, 406, 415 —
      9 tests) and `tests/versioning.tflw` (2 tests) — both `as admin` except where a specific
      identity matters (the cross-user Idempotency-Key conflict needs two distinct users, same
      pattern as M1's authz tests).

**Verified by:** fresh `node cli.mjs stop && node cli.mjs start` (clean DB), then `tflw run`
against the live stack, 2026-07-07:
1. **ETag/If-None-Match**: create a product, capture its `ETag`; a plain re-`GET` returns the same
   value; the same value sent back as `If-None-Match` → `304`.
2. **If-Match**: `PATCH` with the just-captured (current) ETag → `200` with a new ETag; the same
   *stale* ETag replayed on a second `PATCH` → `412`; the fresh ETag from the successful `PATCH`
   → `200` again.
3. **405s**: `PUT /products/:id` → `405`; `POST`/`PATCH`/`DELETE` on `/categories` → `405` each.
4. **409 (FK-restrict)**: create a product, order it, then `DELETE` the product → `409` with
   `body.detail contains "referenced"`, not a 500 or a stack trace.
5. **Idempotency-Key**: same key replayed by the same user → second response is `200` with the
   *same* `body.id` as the first `201`; the same key replayed by a *different* user → `409`.
6. **Content negotiation**: `GET /products` with `Accept: application/xml` → `406`; `POST
   /products` with `Content-Type: text/plain` and a raw text body → `415`.
7. **Versioning**: `api root GET /openapi.json` → `200` with `body.openapi` containing `"3."`;
   `api root GET /health` → `404` (the unversioned root has no route there); the same path through
   the default `/v1`-prefixed service → `200`.
8. **One bug caught by this verification pass itself**: the first live run showed the ETag tests
   failing — `ProductsController.create` wasn't setting the `ETag` header, so the captured
   "current" ETag was actually Express's own auto-generated weak hash of the response body, not
   this API's version-based one, causing a spurious `412` on what should've been a fresh update.
   Fixed by setting `ETag` on the create response too, matching read/update; re-verified clean.
9. **`npx tflw check`**: `10 files checked, no problems found`.
10. **`npx tflw run`** on a freshly-restarted stack: `PASS 41/41 passed`, exit 0 (30 carried over
    from M0–M2 + 11 new M3 tests).
11. **Parallel-safety**: repeated fresh-restart + run with `--workers 4` → `PASS 41/41 passed`
    again.
12. No new `TFLW-FEATURE-GAPS.md` entry from M3 — conditional requests, idempotency-key replay,
    405/409/406/415, and the second named service were all cleanly expressible declaratively.

---

## v2 M4 — Async & query cluster ✅

- [x] **202-Accepted async job** (`Job` entity + `AddJobs` migration — a real table, generated via
      `migration:generate` against a temp Postgres, not hand-written): `POST /orders/:id/fulfill`
      (admin-only — a warehouse action) validates the order is `pending` (else `409`), transitions
      it to `processing` **synchronously** before responding (so an immediate repeat call race
      can't slip past the check — see bug #1 below), returns `202` with a `Location: /v1/jobs/:id`
      header and `{jobId, status}` body, then continues `processing → ready → fulfilled` as real
      fire-and-forget background work (small real delays, not instant). `GET /jobs/:id` is the
      pollable handle, scoped to its order's owner exactly like the order itself (403 for anyone
      else, admin sees all) — exercised via `wait until api`, the same construct v1's
      order-workflow.tflw used, now against a genuine job resource instead of an order that
      silently self-transitioned on its own timer.
- [x] **Rate limiting + `Retry-After`** on `POST /products/:id/reviews` (a new nested-resource
      hot path — see below): an in-memory sliding-window `RateLimitGuard` (3 requests/second),
      keyed by `(user id, product id)` rather than user id alone so parallel tests against their
      own fresh products never share a window — the suite's per-test-unique-facet isolation model,
      not a test-only header. Ported v1's `rate-limit.tflw` two-test shape (429 assertion, then a
      JS-escape-hatch `sleepAndRetry` honoring the real `Retry-After` value) onto it.
- [x] **New `ReviewsModule`** — `GET/POST /products/:id/reviews`, the plan's "nested list
      endpoint": creating enforces the existing `Unique(['userId','productId'])` DB constraint via
      a `409` (not a duplicate row); reads are public and **cursor (keyset) paginated**
      (`created_at, id` tie-break) with a `Link: <...>; rel="next"` response header when more
      results exist — the plan's other pagination style, deliberately different from products'
      offset pagination so the suite demonstrates both.
- [x] **Filter/sort/full-text search on `GET /products`** (`FindProductsQueryDto`): `categoryId`
      filter, `sort=name|-name|price|-price|stock|-stock` (unrecognized field → `400`, not a
      silent no-op), `q=<term>` full-text search via Postgres `to_tsvector`/`plainto_tsquery`.
      `page`+`pageSize` (both required together) switch the response into a
      `{data,page,pageSize,total,totalPages}` envelope; absent, the bare-array shape M1-M3's tests
      already assert is unchanged.
- [x] **Isolation-model adaptation, noted explicitly**: plan_v2.md's isolation model says pagination
      tests should each use "a unique category" as their per-test facet — but M2/M3 already made
      categories read-only (seeded only, `POST /categories` is a genuine `405`). Substituted a
      unique full-text search term (`q=<tag>` embedded in each test's own product names) as the
      per-test facet instead: it gives the identical exact-count, collision-free isolation
      guarantee the plan is actually after, without reopening that earlier decision, and doubles
      as its own test of the search feature.
- [x] Ported `tests/.pending-v2-port/{order-workflow,pagination,rate-limit}.tflw` onto the v2 API
      as `tests/jobs.tflw`, `tests/product-query.tflw`, and folded rate-limiting into
      `tests/reviews.tflw` (new); updated `tests/helpers/paginate.ts` for the v2 base URL and
      `{data,totalPages}` response shape (`X-Test-NS` header replaced by the `q` search-term
      facet); `tests/helpers/sleep-and-retry.ts` reused verbatim (already generic).

**Verified by:** fresh `node cli.mjs stop && node cli.mjs start` (clean DB, migrations included the
new `AddJobs` migration), then `tflw run` against the live stack, 2026-07-07:
1. **Async job**: create a product+order (`pending`) → `POST /orders/:id/fulfill` → `202` +
   `Location: /v1/jobs/<id>` + `body.status: "processing"`; `wait until api GET /jobs/:id` reaches
   `"completed"`; the order itself is then `"fulfilled"`. Only an admin can trigger it (`403` for
   the owning customer). A job is scoped like its order (`403` for a different user, `200` for the
   owner). Fulfilling a non-pending order → `409`.
2. **Rate limiting**: 3 invalid-body (`rating:0`, `422` each — the guard runs before validation,
   so each attempt still burns a window slot without creating a real review) requests followed by
   a 4th → `429` with `Retry-After` matching `^[0-9]+$`; capturing that value, waiting it out via
   the JS helper, then a valid request → `201` (first real review, proving the window reset).
3. **Reviews (nested resource)**: create + read-back via the nested list; a second review from the
   same user on the same product → `409` with `body.detail contains "already reviewed"`; no auth →
   `401`; 3 reviewers (admin + 2 users) with `limit=2` → page 1 has 2 items + a `Link` header
   matching `rel="next"`; following the captured `nextCursor` → the true remaining 1 item, no
   duplicate/missing row.
4. **Product query**: `q=<tag>&sort=price`/`sort=-price` order 3 same-tagged products correctly;
   combined `q`+`categoryId` still returns exactly 3; an unrecognized `sort` value → `400`; offset
   pagination over 5 same-tagged products reports `total:5`, `totalPages:3`, exact per-page
   counts; the JS-escape-hatch page-walk's aggregated count matches the same facet's `total`.
5. **One bug caught by this verification pass itself**: the cursor-pagination test's second page
   initially returned the previous page's boundary row again (a duplicate). Root cause: Postgres's
   `now()` (populating `created_at`) has microsecond precision, but the cursor is encoded from a
   JS `Date` (millisecond precision only) — the boundary row's own `created_at > :cursor` came out
   true against the millisecond-truncated cursor value, since its real sub-millisecond remainder
   was nonzero. Fixed by truncating the column to milliseconds (`date_trunc('milliseconds', ...)`)
   on both sides of the comparison; re-verified clean.
6. **`npx tflw check`**: `13 files checked, no problems found`.
7. **`npx tflw run`** on a freshly-restarted stack: `PASS 55/55 passed`, exit 0 (41 carried over
   from M0–M3 + 14 new M4 tests).
8. **Parallel-safety**: repeated fresh-restart + run with `--workers 4` → `PASS 55/55 passed`
   again — including the rate-limit tests (whose window-keying by `(user,product)` was the main
   parallel-safety risk in this milestone) and the async-job test (whose real ~600ms background
   delay was the main timing risk).
9. No new `TFLW-FEATURE-GAPS.md` entry from M4 beyond what v1 already logged (the page-walk
   escape hatch and `Retry-After`-aware retry, both already gaps #1/#2, now just re-proven against
   the v2 API) — everything newly built (async job polling, cursor pagination + Link header,
   filter/sort/search) was cleanly expressible declaratively.

---

## v2 M5 — Gap-provoking scenarios + TFLW-GAPS.md deliverable ✅

- [x] **New gap-provoking scenarios**, each with a working escape-hatch/N-statement version *and*
      an "ideal syntax" comment (plan_v2.md Part B's evidence pattern):
  - `tests/schema-and-shape.tflw` — partial-object/subtree RFC7807 shape assertion (N `expect`
    statements today) and schema validation against `/openapi.json` (`tests/helpers/schema-
    check.ts`, a minimal hand-rolled validator, no ajv dependency — throws to fail the test, same
    as every other "call itself is the assertion" JS helper in this suite).
  - `tests/order-items.tflw` (extended) — a genuine two-distinct-item order proving `any`/`all`
    quantifiers can't correlate two fields on the same array element (two independent `any`s can
    each be satisfied by a *different* item and still both pass); `tests/helpers/find-item.ts`
    does the real correlated check.
  - `tests/token-expiry.tflw` (new) — a real `JWT_ACCESS_TTL=5s` expiry → refresh chain (not
    mocked), the concrete scenario that needs `wait until api` to carry a per-poll bearer header;
    `tests/helpers/wait-seconds.ts` is the fixed-delay workaround.
  - `apiV2/src/products/dto/product-response.dto.ts` + `@ApiOkResponse` on `GET /products/:id` —
    a small, additive, swagger-only DTO so `/openapi.json` actually documents a response schema
    for `schema-and-shape.tflw` to validate against (zero runtime behavior change).
- [x] **`tests/.gaps/cookie-jar.tflw`** (new dot-dir, plan_v2.md Part B's "can't-express-at-all →
      `.gaps/`" convention) — executable proof that gap #5 (no cookie subject) is a genuine hard
      failure: replaying a dual `Set-Cookie` capture as a `Cookie` header throws
      `Headers.append: "...\n..." is an invalid header value`, confirmed empirically against the
      live API, not just reasoned about.
- [x] **`tests/.checkonly/wait-until-headers.tflw`** (new) — the parse-time companion proof for
      the same gap family (#4 in the new ranking): attaching a `header` line under `wait until
      api` is `TF010`, not a runtime issue — confirmed by actually running `tflw check` against it.
- [x] **Fixed two stale `tests/.demo-fail/` fixtures** found while auditing dot-dirs for this
      milestone: `retry-exhausted.tflw` (referenced v1's retired `/flaky-widget` dummy endpoint)
      and `wait-timeout.tflw` (used v1's free-text `category` field) — both had been invisible to
      every `tflw check`/`run` since M0 (dot-dirs are excluded from default discovery), so neither
      M0-M4's "keep the suite green" discipline ever caught their staleness. Ported onto the v2
      schema; both still demonstrate their intended reporting behavior.
- [x] **`TFLW-GAPS.md`** (new, successor to `TFLW-FEATURE-GAPS.md`, which is now a one-line
      redirect stub): a ranked table of 7 gaps (the original 5 re-verified + folded in, plus 2 new
      — partial-object matching and correlated JSON-path predicates, discovered by actually trying
      to write the scenarios above), each with severity×frequency, a proof link, proposed syntax,
      and a cross-check against a mainstream tool (Postman/Jest/RestAssured/Playwright). Also
      records two candidates that turned out **not** to be gaps once built (Idempotency-Key and
      ETag/If-Match ergonomics — both fully declarative in M3, zero JS) and the confirmed-by-design
      findings (page-walk, no-`sleep`) kept separate from the ranked list per the plan's criterion
      ("declarative/ergonomic, not a loop/branch punt").
- [x] **`testFlow/PLAN.md` milestone stub** — a new **M8 — API-hardening / declarative-
      expressiveness (proposed, not implemented)** entry in the sibling tflw repo, listing the same
      7 ranked gaps as actionable items and noting which promote an existing SPEC §16 parking-lot
      entry (P#33 cookie subject, P#14 partial-object matching, P#3 OpenAPI/contract) versus
      proposing a wholly new one (correlated JSON-path, `wait until api` headers, `Retry-After`
      retry, 2nd session per test). No grammar/runtime/SPEC edits — confirmed by leaving every
      other file in that repo untouched, including pre-existing unrelated uncommitted work found
      already in progress there (SPEC.md + several packages files) that this milestone correctly
      left alone. `PLAN.md` itself turned out to be `.gitignore`'d in that repo (local planning
      artifact, not published) — the edit stands on disk with nothing to commit.

**Verified by:** fresh `node cli.mjs stop && node cli.mjs start` (clean DB), then `tflw run`/`tflw
check` against the live stack, 2026-07-07:
1. **`npx tflw check`** (default discovery, unaffected by the new dot-dirs): `15 files checked, no
   problems found`.
2. **`npx tflw run`** on a freshly-restarted stack: `PASS 59/59 passed`, exit 0 (55 carried over
   from M0-M4 + 4 new gap-provoking tests in the default suite; `token-expiry.tflw`'s real ~6s wait
   included, total run time ~10s).
3. **Parallel-safety**: repeated fresh-restart + run with `--workers 4` → `PASS 59/59 passed`
   again.
4. **`.gaps/` runs as intended**: `npx tflw run tests/.gaps/cookie-jar.tflw` → `FAIL 0/1 passed`,
   the exact predicted `Headers.append` error — a real failure, not a graceful 4xx.
5. **`.checkonly/` checks as intended**: `npx tflw check tests/.checkonly/*.tflw` → all 4
   diagnostics fire correctly (`TF011`/`TF028`/`TF014` from the original M1.5 fixtures, plus the
   new `TF010` for the `wait until api` + `header` combination).
6. **`.demo-fail/` still demos correctly after the v2-schema fixes**: `npx tflw run
   tests/.demo-fail/*.tflw --tag demofail` → `FAIL 0/4 passed`, each failure showing its intended
   reporting shape (hard-fail, retry-exhausted, soft-check-mixed ×2, wait-timeout).
7. This is the **final milestone** in plan_v2.md's phasing — M0 through M5 are all ✅.

---

## Post-M5 — TFLW-GAPS.md gap #1 fixed upstream, consumed here (2026-07-07) ✅

`testFlow` shipped a first-class automatic cookie jar (decision 87, closing gap #1 — see that
repo's `PLAN.md`/`PROGRESS.md` M2.11/`SPEC.md` §3.3) directly in response to this suite's own M5
gap-provoking pass. Consumed here the same day:

- [x] `npm run refresh-tflw` repacked the vendored tarball from testFlow's rebuilt `packages/cli`
      — required a manual `rm -rf node_modules package-lock.json && npm install` (not just the
      script's own `npm install` step) since the tarball's filename/version were unchanged
      (`tflw@0.1.0`, pre-1.0 so no version bump), and npm's lockfile-pinned integrity hash treated
      the identical-looking `file:` dependency spec as already-satisfied rather than diffing the
      actual tarball bytes — worth remembering for any future same-version tarball refresh.
- [x] `tflw.config`'s `shopper` session and `tests/sessions.tflw`'s two CSRF tests dropped their
      manual `capture header "set-cookie"`/`header "Cookie" is …` lines — the jar carries cookies
      forward automatically now, both across a cached session and across one test's own sequential
      steps. The logout test's manual capture/replay was deliberately kept (see its own comment):
      it needs the *stale*, pre-logout cookie value specifically, to prove server-side revocation
      rather than "the jar correctly cleared it after a real logout."
- [x] `tests/.gaps/cookie-jar.tflw` (an intentionally-failing fixture proving the old crash) was
      replaced by `tests/cookie-jar.tflw` in the ordinary suite — the exact former-crash scenario,
      now passing with zero `capture`/`header` at all, plus a second test proving the *second*
      cookie (`session_refresh`) is independently tracked too.
- [x] `TFLW-GAPS.md` gap #1 marked fixed (a new "Fixed" section, cross-referencing testFlow's
      decision 87) rather than renumbering the remaining 6 gaps — gap numbers stay stable
      identifiers.

**Verified by:** fresh `node cli.mjs stop && node cli.mjs start`, `npx tflw check` → `16 files
checked, no problems found`, `npx tflw run` → `PASS 61/61 passed` (59 carried over + 2 new), and
`--workers 4` on another fresh restart → `PASS 61/61 passed` again. (An intermediate run against a
long-lived, non-restarted stack showed 5 failures — confirmed as the already-documented
`unique(...)` cross-run-collision artifact from repeated manual runs during the tarball-refresh
debugging above, not a regression; clean on every fresh restart.)

## Post-M5 — TFLW-GAPS.md gap #2 fixed upstream, consumed here (2026-07-07) ✅

`testFlow` shipped `matches subset {...}` (decision 88, closing gap #2 — see that repo's
`PLAN.md`/`PROGRESS.md` M2.12/`SPEC.md` §6.3.1) directly in response to this suite's own M5
gap-provoking pass. Consumed here the same day:

- [x] `npm run refresh-tflw` repacked the tarball again; hit the *exact same* stale-install gotcha
      as gap #1's consumption (same unchanged `tflw@0.1.0` version number) — confirmed via
      `grep -c subsetMatch node_modules/tflw/dist/cli.js` returning `0` right after the script's
      own `npm install` step, `5` inside the freshly-packed tarball itself. Same fix: `rm -rf
      node_modules package-lock.json && npm install`, confirmed by the grep count rising to `5`.
- [x] `tests/schema-and-shape.tflw`'s gap-demo test (previously `@gaps @shape`) now uses the real
      `matches subset { type: "about:blank", title: "Unprocessable Entity", status: 422 }` in place
      of its old three-line `equals`-per-field form and its commented-out "ideal syntax" line — the
      `@gaps` tag dropped since it's no longer demonstrating an open gap (the schema/contract test
      below it, still `@gaps @schema`, is untouched — gap #6 stays open).
- [x] The same two-line `body.type equals "..."` / `body.title equals "..."` pattern was folded
      into one `matches subset {...}` line (adding `status` too) in `crud-lifecycle.tflw` (2
      occurrences: 404, 422) and `http-maturity.tflw` (5 occurrences: 412, 405, 409, 406, 415).
      Assertions pairing a structural field with a `contains` substring check on `detail` kept that
      line separate (`matches subset` is equals-only per key, by design); `reviews.tflw`'s 409 test
      only ever asserted `detail`, so nothing there needed changing.
- [x] `TFLW-GAPS.md` gap #2 marked fixed (folded into the existing "Fixed" section alongside gap
      #1, cross-referencing testFlow's decision 88) rather than renumbering the remaining 5 gaps.

**Verified by:** fresh `node cli.mjs stop && node cli.mjs start`, `npx tflw check` → `16 files
checked, no problems found`, `npx tflw run` → `PASS 61/61 passed`, and `--workers 4` on another
fresh restart → `PASS 61/61 passed` again.

---

## M1 — API showcase ✅

Scaffolded via a `/grill-me` session (2026-07-06) that resolved testFlow-tests/ replacing
automationTestPOC as tflw's dogfood/acceptance target. See PLAN.md for the full checklist.

- [x] Project scaffold: git repo, package.json, PLAN.md/PROGRESS.md/README.md
- [x] `api/core` + `api/auth` services
- [x] `frontend/` pages
- [x] `tflw.config` + tarball consumption wired up
- [x] `.tflw` test files, all green
- [x] `testflow-tests-app` lifecycle skill

**Verified by:**
- `api/core` + `api/auth`: manually curl-tested (health, bearer login, cookie session-login,
  product CRUD, flaky-widget's 503→503→201 sequence, order processing→ready transition, 401
  without a token) — all as designed.
- `frontend/`: driven live in a real browser via Playwright — login (cookie session + bearer
  token fetch), product list render, create/edit form, delete confirmation `<dialog>`, toast —
  full round-trip against the running api/core+auth confirmed, including that the UI and the API
  share the same in-memory state.
- `scripts/refresh-tflw.mjs`: packed `tflw@0.1.0` from `../testFlow/packages/cli` into
  `vendor/tflw-0.1.0.tgz` and installed it; `npx tflw --version` → `0.1.0` from the installed
  binary (not a workspace shortcut).
- `tests/*.tflw` (8 files, 15 cases) against the running api/core (:4001) + api/auth (:4002):
  **PASS 15/15** — `npx tflw run --no-color`. Covers named services + cross-service
  capture-chaining (auth.tflw), both session transports (sessions.tflw, admin bearer used
  throughout), full CRUD (crud-lifecycle.tflw), `retry 2` on the per-key flaky endpoint —
  correctly flagged `(flaky)` (retry-and-flake.tflw), `wait until api` polling the
  processing→ready order status in 1209ms against a 1200ms server-side threshold
  (retry-and-flake.tflw), `any`/`all` quantifiers over `/orders` (quantifiers.tflw), inline +
  file-backed `with each` (data-tables.tflw), `unique email`/`unique(prefix)`/`random
  decimal`/`random of` (generators.tflw), and `action`+`import`+JS-escape-hatch chained
  together (actions-and-helpers.tflw). Redaction confirmed: `grep` of `report.html` finds zero
  plaintext credentials, and the JS helper's *return value* (`approved by
  •••(ADMIN_EMAIL)`) shows taint-tracking survives the escape hatch, same guarantee tflw's own
  dogfood proved.

## M1.5 — parallel-safety, negative cases & richer scenarios ✅

Scoped via a `/grill-me` session (2026-07-06); see PLAN.md for the full checklist and rejected
alternatives. tflw itself stays untouched by this milestone (see `../testFlow/PLAN.md` decision 86
for the 3 gaps fixed upstream as a prerequisite, before this milestone's work began); anything
discovered here goes in `TFLW-FEATURE-GAPS.md` instead.

- [x] `api/core`: `X-Test-NS` namespace middleware (`nsState(ns)`, `default` fallback), 4-stage
      order state machine, paginated `GET /products`, `POST /rate-limited-widget`, `POST
      /products/batch`
- [x] `tflw.config`: `defaults: timeout wait 5s`
- [x] Tags + a per-each `before` namespace hook retrofitted across all 8 existing files that touch
      `api/core`, plus every new file
- [x] 4 tier-1 negative-case tests added to existing files (suite stays green)
- [x] `order-workflow.tflw`, `pagination.tflw` (+ `helpers/paginate.ts`), `rate-limit.tflw` (+
      `helpers/sleep-and-retry.ts`), `batch.tflw`, `interleaved-sessions.tflw` — new, all green
- [x] `tests/.demo-fail/*.tflw` (4 files, tag-gated, excluded from the default `tflw run`)
- [x] `tests/.checkonly/*.tflw` (3 files, `tflw check`-only, excluded from default discovery)
- [x] `TFLW-FEATURE-GAPS.md` — 4 open-gap entries
- [x] README: reporting section, demo-fail/check-only docs, tag table

**Verified by:** full 8-step pass against freshly-restarted `api/core`(:4001)+`api/auth`(:4002),
2026-07-07.

1. **Parallel-safety falsified then proven** — temporarily stripped the `X-Test-NS` header from
   `pagination.tflw`'s "a single page reports its own shape" test, ran `npx tflw run --workers 4`
   ×10: every run showed the predicted contamination — `expect body.total equals 3` got `6`
   (another concurrent file's product-creates landing in the shared `default` bucket). Header
   restored, re-ran ×10: **zero** contamination failures across all 10 runs (the only failures seen
   were an unrelated, already-understood artifact — registering against the same long-lived,
   non-restarted `api/auth` process many times in a row exhausts `unique(...)`'s
   within-a-run-only distinctness guarantee; not a namespacing bug).
2. **Green default run** — `npx tflw run` → `PASS 26/26 passed ... 2629 ms`, exit 0. `grep` of
   `report/report.html` + `report/junit.xml` for every demo-fail/checkonly test/file name → zero
   matches. `npx tflw check` → `14 files checked, no problems found.`, exit 0.
3. **Demo-fail fails for the right reason** — `npx tflw run tests/.demo-fail/*.tflw --tag
   demofail` → `FAIL 0/4 passed, 4 failed`: wrong status (999 vs 200), flaky-widget exhausting a
   too-small retry budget (503 vs 201), 2 passing + 2 failing soft checks in one test, and a
   `wait until api` timeout at the configured 5s threshold (`timed out after 5000ms (17
   attempts)`).
4. **Check-only fixtures show the right diagnostic** — `bad-keyword.tflw` → `TF011` (unknown step
   `expct`), `unknown-matcher.tflw` → `TF014` (unknown matcher `eq`), `bad-session.tflw` →
   `TF028` (unknown session `ghost`); all exit 2.
5. **Negative-case regression-free** — the same green run in (2) includes all 4 new tier-1
   negative cases (non-admin 403, missing-field 400, duplicate-email 400, logout-then-401), each
   hitting its intended status, suite still 26/26.
6. **Seed replay** — two `npx tflw run --seed 12345` runs against fully-fresh services (both
   `api/core` and `api/auth` restarted between them, since the flaky-widget and registered-email
   endpoints are themselves stateful): diffing the two full outputs (stripping per-step ms timings
   and the wall-clock total) showed **zero content differences** — same 26/26, same test order,
   same `(flaky)` badge behavior, same generated values.
7. **Tag-filter smoke test** — `--tag pagination` (2/2), `--tag batch` (2/2), `--tag ratelimit`
   (2/2), `--tag workflow` (1/1), `--tag interleave` (1/1): each isolated exactly its file's
   test(s) and passed.
8. **Final sign-off** — `--workers 1` → `PASS 26/26 passed ... 2630 ms`; `--workers 4` (fresh
   services) → `PASS 26/26 passed ... 2938 ms`. Identical pass/fail counts; the ~300ms difference
   is ordinary worker-pool scheduling overhead, not a correctness signal.
