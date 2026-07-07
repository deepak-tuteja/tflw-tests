# testFlow-tests — PLAN

A purpose-built API + UI app whose only job is giving [tflw](../testFlow) (the `.tflw` DSL /
`tflw` CLI) something real to run against. It replaces `automationTestPOC` as tflw's own
dogfood/acceptance target (see `../testFlow/PLAN.md`'s "Dogfood / acceptance" section) — a
generic pre-existing POC that was never designed around tflw's needs. Everything here — the API
topology, the auth styles, the deliberately flaky endpoints, the frontend — exists specifically to
exercise a tflw feature, current or upcoming.

Resolved via a `/grill-me` session (2026-07-06); decisions are recorded in
`~/.claude/plans/compressed-coalescing-rain.md` and summarized in README.md.

## tflw consumption

Not a workspace member of tflw's monorepo — this app consumes tflw the way a real user would,
via `npm pack`'s tarball (proven in tflw's M2.7: self-contained `dist/cli.js`, zero `@tflw/*`
deps). `npm run refresh-tflw` re-packs `../testFlow/packages/cli`, drops the tarball in `vendor/`,
and reinstalls it. On-demand only — never auto-refreshed before a run, so a session doesn't get
surprised by an in-flight tflw change.

## Architecture

- **`api/core`** and **`api/auth`** — two named services (`tflw.config`'s multi-service support).
  `core` owns products/orders CRUD, a 4-stage order workflow (`wait until api` polling), a
  deliberately flaky endpoint (`retry`), an array-returning endpoint (`any`/`all` quantifiers),
  pagination, rate limiting (429 + `Retry-After`), and batch create (207 partial success) — every
  route reads its state from a per-`X-Test-NS`-header namespace (M1.5) so concurrent `--workers`
  runs never collide. `auth` owns two login flows: bearer-token and cookie-based session — proving
  tflw's `session` blocks work over either transport; it stays a single shared (unnamespaced)
  process since nothing about it races under parallel test files.
- **`frontend/`** — plain HTML/JS, no build step, no framework: a login page, a CRUD list/detail
  view, a form, a dialog, a toast. Not exercised by any `.tflw` test until tflw's M3 browser
  binding ships, but built now (cheap, no build step) so M3 dogfooding can start immediately.
  **Roadmap:** once tflw's browser features mature past the basics (past tiered selector
  resolution into e.g. dynamic re-renders, client routing), consider rewriting the frontend in
  something like React for a harder, more realistic DOM to prove selectors against.
- **`tests/`** — one `.tflw` file per feature/scenario (not per tflw milestone number — milestone
  numbers have already been re-scoped twice upstream). Grows as tflw grows. `tests/helpers/` holds
  JS escape-hatch helpers; `tests/shared/` holds cross-file `action`s; `tests/.demo-fail/` and
  `tests/.checkonly/` are dot-directories (excluded from tflw's default discovery) holding
  intentionally-broken fixtures that showcase failure/diagnostic reporting rather than green
  coverage — see the M1.5 section below and README's "Demo-fail / check-only fixtures".

## Milestones

| Milestone | Status | Tied to tflw | Notes |
|---|---|---|---|
| M1 — API showcase | ✅ done | M0–M2.9 (shipped) | This session's build |
| M1.5 — parallel-safety, negative cases & richer scenarios | ✅ done | M2.65 (`--workers`) | Namespacing, tags/hooks retrofit, demo-fail/check-only fixtures |
| M2 — UI showcase | ⬜ not started | M3 (browser half) | Playwright binding, tiered selectors, dialogs/toasts/forms |
| M3 — watch-mode showcase | ⬜ not started | M5 (coding UX) | `tflw watch`, `tflw pick` |
| M4 — reuse-pass showcase | ⬜ not started | M6 (reuse pass) | Deliberately duplicated flows to prove `tflw refactor apply` |
| M5 — full acceptance parity | ⬜ not started | M7 (1.0 gate) | Whatever this app's suite needs to stand in for tflw's own 1.0 acceptance gate |

### M1 — API showcase

- [x] `api/core`: products/orders CRUD, one slow/flaky endpoint, one array-returning endpoint
- [x] `api/auth`: bearer login, cookie-session login
- [x] `frontend/`: login, list/detail, form, dialog, toast — driven live in a browser via Playwright
- [x] `tflw.config`: two named services, a bearer session, a cookie session
- [x] `scripts/refresh-tflw.mjs` + first tarball install
- [x] `tests/*.tflw`: auth, sessions, crud-lifecycle, retry-and-flake, quantifiers, data-tables,
      generators, actions-and-helpers — all green
- [x] `testflow-tests-app` skill to start/stop the api+frontend processes

**Verified by:** see PROGRESS.md's M1 section — 15/15 `.tflw` tests green via the real installed
tarball, frontend driven live in a browser via Playwright, redaction confirmed through the JS
escape hatch.

### M1.5 — parallel-safety, negative cases & richer scenarios

Resolved via a `/grill-me` session (2026-07-06): M1's suite exercised almost none of tflw's
shipped-but-unused-here surface (`--workers`, tags, hooks, negative cases beyond one 401, richer
API scenarios). Scope decision: **tflw itself stays untouched** — a DSL gap hit while building
this milestone gets written down in `TFLW-FEATURE-GAPS.md`, not fixed upstream (that happens in a
separate testFlow-side session; see `../testFlow/PLAN.md` decision 86 for the 3 items that *were*
fixed upstream as a prerequisite, before this milestone's own work began).

- [x] `api/core`: per-namespace state via an `X-Test-NS` header (`nsState(ns)`, falls back to a
      `default` bucket when absent — today's exact unnamespaced behavior, so the frontend is
      unaffected), a 4-stage order state machine (pending/processing/shipped/delivered, replacing
      the old binary processing/ready), paginated `GET /products`, `POST
      /rate-limited-widget` (429 + `Retry-After`), `POST /products/batch` (207, per-item partial
      success)
- [x] `tflw.config`: `defaults: timeout wait 5s`
- [x] A per-each `before` hook (`let ns = random string 12`) + `X-Test-NS` header retrofitted onto
      every file that touches `api/core`, plus a tag taxonomy (`@auth`, `@crud`, `@sessions`,
      `@flaky`, `@workflow`, `@pagination`, `@ratelimit`, `@batch`, `@interleave`, …) across all 8
      existing files and every new one
- [x] 4 tier-1 negative-case tests added to existing files, suite stays 100% green (non-admin
      403, missing-field 400, duplicate-email 400, logout-then-401)
- [x] 5 new all-green scenario files: `order-workflow.tflw`, `pagination.tflw` (+ JS
      page-walk helper), `rate-limit.tflw` (+ JS Retry-After helper), `batch.tflw` (`with each`
      driven), `interleaved-sessions.tflw` (two identities live in one test)
- [x] `tests/.demo-fail/*.tflw` (4 files, tag-gated `@demofail`, dot-directory-excluded from the
      default `tflw run`): retry-exhausted, wait-timeout, bad-assertion, soft-check-mixed
- [x] `tests/.checkonly/*.tflw` (3 files, invalid syntax, dot-directory-excluded from the default
      `tflw check`): TF011/TF014/TF028 diagnostics
- [x] `TFLW-FEATURE-GAPS.md` — genuinely open tflw gaps found while building this (page-walk
      primitive, Retry-After-aware retry, `wait until api` header limitation, one-session-per-test)
- [x] README: reporting section, demo-fail/check-only docs, tag table

**Rejected:** restructuring tests to avoid state overlap instead of namespacing (fragile as more
tests get added, doesn't demonstrate real isolation design); folding the demo-fail/check-only
fixtures into the default suite behind `--tag` alone (tflw's file discovery has no ignore-glob —
`--tag` only filters *within* already-discovered files, so an intentionally-broken `.checkonly`
file would break a bare `tflw check` regardless of tags; dot-directories are the only mechanism
that actually works, per `testFlow/packages/cli/src/cli.ts`'s `discoverTests`).

**Verified by:** full 8-step verification pass, 2026-07-07 — see PROGRESS.md's M1.5 section for
the complete evidence (parallel-safety falsify/prove, green default run, demo-fail/check-only
diagnostics, negative-case regression, seed replay, tag-filter smoke test, workers 1 vs 4
sign-off).

## Runtime

Plain Node processes (`node api/core/server.js`, etc.) — no Docker. Matches tflw's own
zero-heavy-deps ethos and starts in milliseconds. **Roadmap:** if this app grows enough services
that plain-process orchestration becomes unmanageable, revisit with a docker-compose setup
modeled on `automationTestPOC`'s.
