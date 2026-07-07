# testFlow-tests

A purpose-built API + UI showcase app for [tflw](../testFlow) — a testing-only DSL/CLI. This
project exists solely to give tflw's current and upcoming features something real to run
against; it replaces `automationTestPOC` as tflw's dogfood/acceptance target.

## Layout

```
api/core/            products/orders CRUD, a 4-stage order workflow, pagination, rate limiting,
                     batch create, a flaky endpoint, an array-returning endpoint — all
                     namespaced per `X-Test-NS` header for parallel-safe test isolation
api/auth/            bearer-token login + cookie-session login
frontend/            plain HTML/JS pages (no build step) — ready for tflw's browser half (M3)
tests/               .tflw test files, one per feature/scenario
tests/helpers/       JS escape-hatch helpers (page-walk, Retry-After sleep-and-retry, etc.)
tests/shared/        actions shared across files (e.g. `create product`)
tests/.demo-fail/    intentionally-failing fixtures, tag-gated + dot-dir-excluded from `tflw run`
tests/.checkonly/    invalid-syntax fixtures, demonstrated via `tflw check <file>` only
tflw.config          services, sessions, env, `defaults: timeout wait 5s`
vendor/              npm-packed tflw tarball (regenerated, not committed)
scripts/             refresh-tflw.mjs
TFLW-FEATURE-GAPS.md genuine tflw DSL gaps found while building this suite
```

## Setup

```sh
npm run refresh-tflw   # packs ../testFlow/packages/cli and installs the tarball
npm run start:core     # :4001
npm run start:auth     # :4002
npm run start:frontend # :4000
npx tflw run           # runs tests/*.tflw against the running services
```

Or use the `testflow-tests-app` skill to start/stop the three processes.

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
| `@auth` | auth.tflw, sessions.tflw, generators.tflw |
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
| `@demofail` (+ per-scenario `@retryexhausted`/`@waittimeout`/`@badassertion`/`@softmixed`) | `tests/.demo-fail/*.tflw` |

### Demo-fail / check-only fixtures

Two small sets of fixtures are deliberately excluded from the default `tflw run`/`tflw check` —
tflw's file discovery walks every `.tflw` file except dot-prefixed entries (there's no ignore-glob
config key), so a dot-directory is the only way to keep them out:

```sh
# 4 intentionally-failing tests, showing what a real failure/timeout/retry-exhaustion looks like
# in report.html — never part of the green default suite
npx tflw run tests/.demo-fail/*.tflw --tag demofail

# 3 deliberately invalid-syntax files, showing tflw check's teaching diagnostics
# (TF011 unrecognised keyword, TF014 unrecognised matcher, TF028 undeclared session)
npx tflw check tests/.checkonly/bad-keyword.tflw
npx tflw check tests/.checkonly/unknown-matcher.tflw
npx tflw check tests/.checkonly/bad-session.tflw
```

See `TFLW-FEATURE-GAPS.md` for genuine tflw DSL gaps found while building this suite (no
page-walk primitive, no `Retry-After`-aware retry, `wait until api` can't carry per-step headers,
only one `session` per test).

## Why a separate project, not another folder in testFlow/

See `../testFlow/PLAN.md`'s "Dogfood / acceptance" section and this project's own `PLAN.md`.
Short version: automationTestPOC is a generic Playwright+Docker POC that predates tflw and was
never designed around it. testFlow-tests/ is deliberately shaped around tflw's actual feature
set — two named services, both bearer and cookie auth, deliberately flaky endpoints, array
responses — and grows a UI showcase once tflw's browser binding (M3) ships.
