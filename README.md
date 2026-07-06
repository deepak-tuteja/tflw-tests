# testFlow-tests

A purpose-built API + UI showcase app for [tflw](../testFlow) — a testing-only DSL/CLI. This
project exists solely to give tflw's current and upcoming features something real to run
against; it replaces `automationTestPOC` as tflw's dogfood/acceptance target.

## Layout

```
api/core/       products/orders CRUD, a slow/flaky endpoint, an array-returning endpoint
api/auth/       bearer-token login + cookie-session login
frontend/       plain HTML/JS pages (no build step) — ready for tflw's browser half (M3)
tests/          .tflw test files, one per feature/scenario
vendor/         npm-packed tflw tarball (regenerated, not committed)
scripts/        refresh-tflw.mjs
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

## Why a separate project, not another folder in testFlow/

See `../testFlow/PLAN.md`'s "Dogfood / acceptance" section and this project's own `PLAN.md`.
Short version: automationTestPOC is a generic Playwright+Docker POC that predates tflw and was
never designed around it. testFlow-tests/ is deliberately shaped around tflw's actual feature
set — two named services, both bearer and cookie auth, deliberately flaky endpoints, array
responses — and grows a UI showcase once tflw's browser binding (M3) ships.
