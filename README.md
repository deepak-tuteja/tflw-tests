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
docker-compose.yml   postgres (ephemeral per-run volume) + api + nginx (TLS sidecar), healthchecked
nginx/               TLS sidecar (M22) — self-signed :8443 + mTLS-requiring :8444, proxying
                     unchanged to api:4001; certs generated fresh at every container start
tests/               .tflw test files, one per feature/scenario (being ported to v2, M1-M5)
tests/helpers/       JS escape-hatch helpers (page-walk, Retry-After sleep-and-retry, etc.)
tests/shared/        actions shared across files (e.g. `create product`)
tests/.demo-fail/    intentionally-failing fixtures, tag-gated + dot-dir-excluded from `tflw run`
tests/.checkonly/    invalid-syntax fixtures, demonstrated via `tflw check <file>` only
tflw.config          services, sessions, env, `defaults: timeout wait 5s`
vendor/              npm-packed tflw tarball (regenerated, not committed)
scripts/             refresh-tflw.mjs
TFLW-FEATURE-GAPS.md genuine tflw DSL gaps found while building the v1 (plain-Node) suite
```

## Setup

```sh
cp .env.example .env   # Postgres creds, JWT secrets, seeded admin/userA/userB/OAuth-client credentials
node cli.mjs start     # docker compose up -d --build --wait (postgres + api :4001 + nginx TLS sidecar)
npm run refresh-tflw   # packs ../testFlow/packages/cli and installs the tarball
npx tflw run           # runs tests/*.tflw against the running api
npm run test:mtls      # runs tests/mtls.tflw against the sidecar's mTLS-requiring listener (own env, M22)
npm run test:safety    # runs tests/safety-redaction.tflw with `redact` active (own env, M23)
node cli.mjs stop      # docker compose down -v — drops the DB too (ephemeral per-run isolation)
```

Or use the `testflow-tests-app` skill to start/stop the stack.

### Full regression sweep (M21)

`npm run regression` — the thorough check to run after any change to apiV2 or `tests/*.tflw`: the
full suite, then each feature-area tag alone (`identityOps`/`catalogOps`/`orderOps`/`adminOps`),
then `@smoke` alone, then each `smoke,<area>` cross-axis combo — 10 phases, each on its own fresh
Docker restart (`scripts/regression.mjs`; restarting every phase isn't optional — `unique(...)`'s
counter resets per `tflw run` invocation but Postgres data doesn't, so chained phases on the same
DB reproduce false collisions). Exits non-zero if any phase fails.

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
| `@auth` | auth.tflw, sessions.tflw, generators.tflw, session-refresh-and-oauth2.tflw, mtls.tflw, oauth-token-endpoint.tflw |
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

### Demo-fail / check-only fixtures

Two small sets of fixtures are deliberately excluded from the default `tflw run`/`tflw check` —
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
```

See `TFLW-GAPS.md` for genuine tflw DSL gaps found while building this suite (no page-walk
primitive, no arbitrary retry-backoff logic — most other findings there are fixed).

## Why a separate project, not another folder in testFlow/

See `../testFlow/PLAN.md`'s "Dogfood / acceptance" section and this project's own `PLAN.md`.
Short version: automationTestPOC is a generic Playwright+Docker POC that predates tflw and was
never designed around it. testFlow-tests/ is deliberately shaped around tflw's actual feature
set — two named services, both bearer and cookie auth, deliberately flaky endpoints, array
responses — and grows a UI showcase once tflw's browser binding (M3) ships.
