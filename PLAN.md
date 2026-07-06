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
  `core` owns products/orders CRUD plus a deliberately slow/flaky endpoint (retry, `wait until
  api`) and an array-returning endpoint (`any`/`all` quantifiers). `auth` owns two login flows:
  bearer-token and cookie-based session — proving tflw's `session` blocks work over either
  transport.
- **`frontend/`** — plain HTML/JS, no build step, no framework: a login page, a CRUD list/detail
  view, a form, a dialog, a toast. Not exercised by any `.tflw` test until tflw's M3 browser
  binding ships, but built now (cheap, no build step) so M3 dogfooding can start immediately.
  **Roadmap:** once tflw's browser features mature past the basics (past tiered selector
  resolution into e.g. dynamic re-renders, client routing), consider rewriting the frontend in
  something like React for a harder, more realistic DOM to prove selectors against.
- **`tests/`** — one `.tflw` file per feature/scenario (not per tflw milestone number — milestone
  numbers have already been re-scoped twice upstream). Grows as tflw grows.

## Milestones

| Milestone | Status | Tied to tflw | Notes |
|---|---|---|---|
| M1 — API showcase | 🟨 in progress | M0–M2.9 (shipped) | This session's build |
| M2 — UI showcase | ⬜ not started | M3 (browser half) | Playwright binding, tiered selectors, dialogs/toasts/forms |
| M3 — watch-mode showcase | ⬜ not started | M5 (coding UX) | `tflw watch`, `tflw pick` |
| M4 — reuse-pass showcase | ⬜ not started | M6 (reuse pass) | Deliberately duplicated flows to prove `tflw refactor apply` |
| M5 — full acceptance parity | ⬜ not started | M7 (1.0 gate) | Whatever this app's suite needs to stand in for tflw's own 1.0 acceptance gate |

### M1 — API showcase

- [ ] `api/core`: products/orders CRUD, one slow/flaky endpoint, one array-returning endpoint
- [ ] `api/auth`: bearer login, cookie-session login
- [ ] `frontend/`: login, list/detail, form, dialog, toast (built, not yet tested)
- [ ] `tflw.config`: two named services, a bearer session, a cookie session
- [ ] `scripts/refresh-tflw.mjs` + first tarball install
- [ ] `tests/*.tflw`: auth, sessions, crud-lifecycle, retry-and-flake, quantifiers, data-tables,
      generators, actions-and-helpers — all green
- [ ] `testflow-tests-app` skill to start/stop the api+frontend processes

**Verified by:** _(fill in once M1 lands — build/run evidence + `tflw run` pass count.)_

## Runtime

Plain Node processes (`node api/core/server.js`, etc.) — no Docker. Matches tflw's own
zero-heavy-deps ethos and starts in milliseconds. **Roadmap:** if this app grows enough services
that plain-process orchestration becomes unmanageable, revisit with a docker-compose setup
modeled on `automationTestPOC`'s.
