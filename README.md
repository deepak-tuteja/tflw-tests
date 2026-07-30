# testFlow-tests

A purpose-built, realistic e-commerce API (NestJS + Postgres, Dockerized) for
[tflw](../testFlow) — a testing-only DSL/CLI. This project exists solely to give tflw's current
and upcoming features something real to run against, and to surface genuine tflw DSL gaps by
writing the scenarios a user would naturally reach for. See `plan_v2.md` for the full v2 rewrite
plan and `PROGRESS.md` for build status.

> **v2 rewrite in progress (2026-07-07):** the plain-Node `api/core`+`api/auth`+`frontend` app has
> been retired in favor of `apiV2/` (NestJS+Postgres, Dockerized). `tests/*.tflw` still target the
> old API shape and are red until they're ported starting M1 — expected during the rewrite, not a
> regression. See `plan_v2.md`'s milestone phasing.

## Layout

```
apiV2/               NestJS + TypeORM + Postgres e-commerce API — users/categories/products/
                     orders/order_items/reviews; migrations + deterministic idempotent seed
                     run on container start; /v1 prefix; OpenAPI at /openapi.json + /docs
docker-compose.yml   postgres (ephemeral per-run volume) + api + nginx (TLS sidecar) + webv2 +
                     webv2-admin, healthchecked
nginx/               TLS sidecar (M22) — self-signed :8443 + mTLS-requiring :8444, proxying
                     unchanged to api:4001; certs generated fresh at every container start
webV2/               React+Vite+TS SPA storefront (webV2-0) — tflw's browser-arc dogfood target
                     (PLAN_WEBV2_TARGETS.md); own nginx image serves the build + proxies /v1/*
                     to api:4001 so the storefront and API share an origin; :8090
webV2/admin/         SSR admin console (webV2-1) — moderation/coupons/categories/tickets over
                     apiV2, plain Express+EJS full-page navigations (a different flake class
                     than the SPA above); talks to api:4001 server-to-server, no proxy needed; :8091
tests/               .tflw test files, split into a real api/ui/mixed layer structure (E1,
                     PLAN_ENTERPRISE_REGRESSION.md) — folder placement communicates the layer to
                     a human, an `@api`/`@ui`/`@mixed` tag on every test lets `tflw run --tag`
                     select across it (combinable with area tags, e.g. `--tag ui,orgOps`)
tests/api/           API-only tests, one subfolder per business area: identity/, catalog/,
                     orders/, admin/, plus mechanics/ for DSL-mechanism demos that aren't tied to
                     one business area (actions-and-helpers, body-types, logging, retry-and-flake)
tests/ui/            UI-only tests (E2, PLAN_ENTERPRISE_REGRESSION.md) — no `api` step in the
                     asserted test body, only in `before`/`before file` setup hooks; storefront/
                     backfill lives at tests/ui/storefront/ (login, catalog browse/search, product
                     detail, add-to-cart, checkout, review submission, support, a11y-demo — every
                     top-level nav destination the storefront exposes). The admin console's
                     UI-only backfill is NOT here — see tests/.env-specific/ui-admin/ below; it
                     needs the admin console's own `web` base (:8091), which conflicts with this
                     folder's default `env local` (:8090), the same env-conflict reason
                     `tests/.env-specific/webv2-admin.tflw` already has its own dedicated home.
tests/mixed/         tests that drive the browser and assert through the API/DB together
                     (storefront.tflw today; tests/.env-specific/webv2-admin.tflw too, tagged
                     `@mixed` but kept under .env-specific/ for its own unrelated env-conflict
                     reason, see below)
tests/helpers/       JS escape-hatch helpers (page-walk, Retry-After sleep-and-retry, etc.)
tests/shared/        actions shared across files (e.g. `create product`)
tests/.demo-fail/    intentionally-failing fixtures, tag-gated + dot-dir-excluded from `tflw run`
tests/.checkonly/    invalid-syntax fixtures, demonstrated via `tflw check <file>` only
tests/.env-specific/ passing tests whose assertions only hold under a non-default env (M25),
                     dot-dir-excluded from `tflw run`/`tflw check` for the same reason; also home
                     to ui-admin/ (E2) — the SSR admin console's own UI-only backfill, run via
                     `npm run test:ui-admin` (`--env webv2Admin`), same reason as webv2-admin.tflw
tflw.config          services, sessions, env, `defaults: timeout wait 5s`
vendor/              npm-packed tflw tarball (regenerated, not committed)
scripts/             refresh-tflw.mjs
TFLW-FEATURE-GAPS.md genuine tflw DSL gaps found while building the v1 (plain-Node) suite
```

## Setup

```sh
cp .env.example .env   # Postgres creds, JWT secrets, seeded admin/userA/userB/OAuth-client credentials
node cli.mjs start     # docker compose up -d --build --wait (postgres + api :4001 + nginx TLS sidecar + webV2 :8090)
npm run refresh-tflw   # packs ../testFlow/packages/cli and installs the tarball
npx tflw run           # runs the whole tests/ tree (api/ui/mixed) against the running api
npm run test:mtls      # runs tests/api/identity/mtls.tflw against the sidecar's mTLS-requiring listener (own env, M22)
npm run test:mtls-rejection  # runs .env-specific/mtls-rejection.tflw — no client cert, real rejection (M25)
npm run test:safety    # runs tests/api/identity/safety-redaction.tflw with `redact` active (own env, M23)
npm run test:ui-admin  # runs tests/.env-specific/ui-admin/*.tflw against the SSR admin console (own env, E2)
node cli.mjs stop      # docker compose down -v — drops the DB too (ephemeral per-run isolation)
```

Or use the `testflow-tests-app` skill to start/stop the stack.

### Full regression sweep (M21)

`npm run regression` — the thorough check to run after any change to apiV2 or `tests/*.tflw`: the
full suite, then each feature-area tag alone (`identityOps`/`catalogOps`/`orderOps`/`adminOps`),
then `@smoke` alone, then each `smoke,<area>` cross-axis combo, then `mtls-rejection`/
`safety-redaction-check`, then (M29) `demo-fail-check`/`cli-flags-check` — 14 phases, each on its
own fresh Docker restart (`scripts/regression.mjs`; restarting every phase isn't optional —
`unique(...)`'s counter resets per `tflw run` invocation but Postgres data doesn't, so chained
phases on the same DB reproduce false collisions). Exits non-zero if any phase fails.

### webV2 — browser-arc dogfood target (webV2-0)

`http://localhost:8090` after `node cli.mjs start` — a React+Vite+TS SPA storefront (catalog →
product → cart → checkout) over apiV2's REST + session-cookie auth, the Tier-A ("clean": proper
ARIA roles, `<label>`-associated inputs, one unambiguous "Add to cart" button per product) target
tflw's upcoming browser steps (`PLAN_BROWSER_PERF_SECURITY.md` M3a) will run against once they
ship — no `.tflw` coverage yet, since tflw itself has no browser support until M3a lands. Log in as
any seeded user (e.g. `alice@example.com` / `alice-pw-123`); its own nginx image (`webV2/Dockerfile`
+ `webV2/nginx.conf`) builds the SPA and reverse-proxies `/v1/*` to `api:4001` so the storefront and
API share an origin — required because apiV2 sets no CORS headers and its session-cookie/CSRF
pairing (`apiV2/src/auth/auth.service.ts`) assumes same-origin. Deliberately its own nginx service,
not the mTLS sidecar above (that one is scoped to TLS/mTLS testing, M22, and serves nothing static).
`npm run dev` (port 5190) proxies the same way for local iteration against a host-run apiV2.

### webV2 admin — SSR full-page-nav dogfood target (webV2-1)

`http://localhost:8091` after `node cli.mjs start` — a plain Express+EJS console (no client JS,
no bundler) over apiV2's moderation (product reviews' reply endpoint), coupons, categories, and
tickets domains, the "full-page navigations" flake class `PLAN_WEBV2_TARGETS.md` calls out as
distinct from the storefront's async client-side re-renders: every page is a real server-rendered
HTML response, every mutation is a `<form method="post">` that redirects on success (assign/claim/
start/resolve a ticket, reply to a review, create a coupon). Log in as `admin@example.com` /
`admin-pw-123` (full access) or `carol@example.com` / `carol-pw-123` (agent — tickets only, no
coupons); a plain `user`-role login is rejected at the login form, since none of these four
domains are user-facing. Architecture: this app never talks to apiV2 through nginx or the browser
at all — it holds the apiV2 session cookie + CSRF token server-side (in its own `express-session`,
a small BFF) and calls `api:4001` directly container-to-container, so there's no same-origin
question to solve the way webV2's SPA has one. It carries its own CSRF token (separate from
apiV2's) on every form, since a plain session-cookie-authenticated app with no such token would
otherwise be genuinely vulnerable to CSRF from the browser's side. Two apiV2 surface gaps shaped
the design, both documented in code comments: `coupons` has no listing endpoint (creation shows a
one-time confirmation page, nothing to browse afterward), and there's no cross-product reviews
listing (moderation is reached by browsing to a product's detail page, not a flat review inbox).

### webV2 Tier B corners (webV2-2)

Still `http://localhost:8090` — the storefront's Tier-A happy path (`ProductPage`'s single, cleanly
-labelled "Add to cart") is untouched; these are added corners living alongside it, per
`PLAN_WEBV2_TARGETS.md`'s "realistic mess" tier. The catalog grid now has an "Add to cart" *and* a
"Quick view" button in every row (12 identical pairs per page, each `<li>` carrying
`aria-label={product.name}` so `within row "…"` scoping resolves it) — "Add to cart"'s label is
also split across two `<span>`s. Clicking it optimistically bumps the header cart count before the
request resolves, then settles to the server's true count once it does (a real bump-then-correct,
not scripted). A top-right async toast (`role="status"`/`"alert"`, auto-dismissing after 2.5s)
confirms the add. "Quick view" opens a hand-rolled focus-trap modal (`role="dialog"`, Tab/Shift+Tab
wrap at its own boundary, Escape closes, focus restores to the button that opened it) with its own
add-to-cart form. `/catalog/all` ("Browse all products") hand-rolls a windowed list over the full
~100-product catalog — a fixed-height scroll viewport mounts only the visible rows (spacer div
carries the full scroll height) — plus a placeholder-only filter input with no `<label>` anywhere
on the page, forcing name resolution down to the placeholder text alone.

### webV2 Tier C corners + a11y flag (webV2-3)

Still `http://localhost:8090` — the final tier, per `PLAN_WEBV2_TARGETS.md`'s "hostile" tier plus
its a11y-flag corner. Again purely additive; Tier A and Tier B stay untouched. The cart's checkout
form embeds a same-origin static page (`/payment-widget.html`) via `<iframe title="Payment">` — a
plain card form that `postMessage`s `{ type: 'payment-authorized' }` to the parent on a
valid-looking submit, which is the only thing that enables the Checkout button; filling it out
requires real frame traversal. Cart rows are reorderable via native HTML5 drag-and-drop (a
`draggable` handle cell) — purely a client-side display order, since cart items have no backend
position column. Every product row now links to `/products/:id/reviews`, a page built around a
real shadow-DOM Web Component (`<star-rating>`, `customElements.define`) for submitting a 1–5 star
rating — its buttons live inside an `open` shadow root, invisible to a plain
`document.querySelector` from outside — next to a `<canvas>` bar chart of the rating distribution
with nothing semantic underneath it; clicking a bar hit-tests pixel coordinates to filter the
review list by that star rating. A new `/support` page (nav-linked, requires login) has a real
drag-and-drop drop zone (distinct from a plain file input) hitting apiV2's existing `/uploads`
endpoint (csv/txt/pdf), plus a "Subject" field whose `id` is recomputed with `Math.random()` on
every render (not just mount) — the `<label>`'s `htmlFor` stays in sync each time, so accessible-
name resolution never breaks even though the id itself never stops changing. A new `/a11y-demo`
page (nav-linked) pairs an accessible section (labelled checkbox, real button, `alt`-bearing image)
with a deliberately inaccessible twin (unlabelled checkbox with no accessible name at all, a
clickable `<div>` standing in for a button with no role/tabindex, low-contrast text, an `alt`-less
image) — the inaccessible half is gated behind a genuine **build-time** flag
(`VITE_ENABLE_A11Y_VIOLATIONS`, a Docker build arg threaded into `ENV` before `npm run build`,
defaulted to `true` in `docker-compose.yml`), so disabling it tree-shakes the violations out of the
shipped JS bundle entirely rather than just hiding them at runtime.

## Reporting

A plain `npx tflw run` already exercises a lot of what to look for in `report/report.html` and
`report/junit.xml`:

- **Retries** — `retry-and-flake.tflw`'s flaky-widget test fails twice then passes; the report
  shows a `flaky` badge with every attempt's evidence (failed attempts collapsed above the final
  one), and `junit.xml`'s `<system-out>` names the attempt count.
- **Soft checks** — several files use `check` (soft) alongside `expect` (hard); a soft failure
  doesn't abort the test, so multiple check rows can appear per test.
- **Tags** — `npx tflw run --tag pagination` (or `batch`/`ratelimit`/`workflow`/`interleave`/…)
  isolates just that scenario; see the tag table below for the full taxonomy.
- **Seed replay** — `npx tflw run --seed 12345` twice produces byte-identical generated values
  (including this suite's `X-Test-NS` namespace draws), reproducing a failure exactly.
- **Parallel workers** — `npx tflw run --workers 4` runs files concurrently; every file that
  touches `api/core` carries its own `X-Test-NS` namespace (a `before` hook + header, generated via
  `random string 12`, not `unique` — see `TFLW-FEATURE-GAPS.md` for why) so concurrent files never
  collide on shared products/orders/flaky-attempt/rate-limit state.

### Tag taxonomy

| Tag | Files |
|---|---|
| `@auth` | auth.tflw, sessions.tflw, generators.tflw, session-refresh-and-oauth2.tflw, mtls.tflw, `tests/.env-specific/mtls-rejection.tflw`, oauth-token-endpoint.tflw |
| `@crud` | auth.tflw, crud-lifecycle.tflw, quantifiers.tflw, data-tables.tflw, generators.tflw, actions-and-helpers.tflw, pagination.tflw, batch.tflw |
| `@sessions` | sessions.tflw, interleaved-sessions.tflw |
| `@flaky` | retry-and-flake.tflw |
| `@workflow` | order-workflow.tflw |
| `@quantifiers` | quantifiers.tflw |
| `@tables` | data-tables.tflw |
| `@generators` | generators.tflw |
| `@actions` | actions-and-helpers.tflw |
| `@pagination` | pagination.tflw |
| `@ratelimit` | rate-limit.tflw |
| `@batch` | batch.tflw |
| `@interleave` | interleaved-sessions.tflw |
| `@safety` | safety-redaction.tflw, `tests/.demo-fail/allow-hosts-blocked.tflw` |
| `@contract` | contract-and-retry.tflw, `tests/.demo-fail/contract-drift.tflw` |
| `@retryafter` | contract-and-retry.tflw, `tests/.demo-fail/retry-after-not-honored.tflw` |
| `@demofail` (+ per-scenario `@retryexhausted`/`@waittimeout`/`@badassertion`/`@softmixed`/`@safety`/`@contract`/`@retryafter`) | `tests/.demo-fail/*.tflw` |
| `@requestlifecycle` | `tests/.env-specific/unreachable-host.tflw` (M29) |
| `@httpProtocolCorners` | `http-protocol-corners.tflw` (M30 — `without redirects`, gzip decompression) |
| `@reviewThreads` | `review-threads.tflw` (M31 — arbitrary-depth, self-referencing reply threads under a review) |
| `@orderReceipts` | `order-receipts.tflw` (M32 — a real, `/FlateDecode`-compressed PDF order receipt; first genuinely binary response body) |
| `@orderWebhooks` | `order-webhooks.tflw` (M33 — a real order-completion webhook, delivered to a JS-escape-hatch throwaway HTTP receiver) |
| `@lifecycle` | token-refresh-lifecycle.tflw, user-lifecycle.tflw (`PLAN_LIFECYCLE.md` L3 — attribute enrich→conflict→retry→redact, then soft async self-deletion, as one realistic chain) |
| `@orderReturns` | return-requests.tflw (`PLAN_RETURNS.md` R3 — order return/refund requests: owner submits, admin approves/rejects, an approved decision fires a real async refund job) |
| `@ticketing` | tickets.tflw (`PLAN_TICKETING.md` T3 — a third role (`AGENT`) scoped to specific resource instances, role-filtered comment visibility, a cross-endpoint cancel/resolve race, and the suite's first collection-level `wait until` combined with `has count`) |
| `@fileFormats` | file-formats.tflw (`PLAN_FILEFORMATS.md` F2 — upload→download round-trips for CSV/TXT/PDF in both response-envelope modes, `body csv`/`body pdf text` against real generated content (the orders CSV export, a naturally multi-page order receipt), `tests/.demo-fail/malformed-{csv,pdf}-upload.tflw` for the loud-error negative cases; closes TFLW-GAPS.md gap #19, tflw M25) |
| `@logging` | logging.tflw (`PLAN_LOG_CONSUME.md` M51 — `log` statement consumption: config-default `log destination`/`log level` resolution, override-not-accumulate semantics, and "an explicit `to …` clause always wins" over both config and `--log-output`/`--log-level`; every other file also gets one narration `log` line in its own clearest test, untagged) |

### Demo-fail / check-only / env-specific fixtures

Three small sets of fixtures are deliberately excluded from the default `tflw run`/`tflw check` —
tflw's file discovery walks every `.tflw` file except dot-prefixed entries (there's no ignore-glob
config key), so a dot-directory is the only way to keep them out:

```sh
# intentionally-failing tests, showing what a real failure/timeout/retry-exhaustion/contract-
# drift/un-honored-rate-limit looks like in report.html — never part of the green default suite
npx tflw run tests/.demo-fail/*.tflw --tag demofail

# 3 deliberately invalid-syntax files, showing tflw check's teaching diagnostics
# (TF011 unrecognised keyword, TF014 unrecognised matcher, TF028 undeclared session)
npx tflw check tests/.checkonly/bad-keyword.tflw
npx tflw check tests/.checkonly/unknown-matcher.tflw
npx tflw check tests/.checkonly/bad-session.tflw

# genuinely passing tests (M25) whose assertions are only true under a non-default env — unlike
# mtls.tflw (whose assertions hold under any backend, so it stays in default discovery),
# mtls-rejection.tflw's `expect status equals 400` is only true through the no-cert-rejecting
# mTLS sidecar, so it would break the default green suite if left undotted
npm run test:mtls-rejection

# M29: `expect request connects`/`fails` (SPEC §6.2.2) proven for real against a closed local
# port (env unreachableHost) — a genuine connection-layer failure, unlike mtls-rejection.tflw's
# own HTTP-level 400 (a wrong-CA client cert was tried first and empirically confirmed to degrade
# to that same soft-400 shape, not a hard connection failure — see the file's own header comment)
npm run test:unreachable-host
```

See `TFLW-GAPS.md` for genuine tflw DSL gaps found while building this suite (no page-walk
primitive, no arbitrary retry-backoff logic — most other findings there are fixed).

## Why a separate project, not another folder in testFlow/

See `../testFlow/PLAN.md`'s "Dogfood / acceptance" section and this project's own `PLAN.md`.
Short version: automationTestPOC is a generic Playwright+Docker POC that predates tflw and was
never designed around it. testFlow-tests/ is deliberately shaped around tflw's actual feature
set — two named services, both bearer and cookie auth, deliberately flaky endpoints, array
responses — and grows a UI showcase once tflw's browser binding (M3) ships.
