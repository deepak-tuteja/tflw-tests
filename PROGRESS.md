# testFlow-tests — PROGRESS

Build tracker, same discipline as [testFlow's own PROGRESS.md](../testFlow/PROGRESS.md): flip a
milestone to in-progress when it starts, check items off as they land, fill in **Verified by**
with real evidence before marking it done.

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done

| Milestone | Status | Started | Finished |
|---|---|---|---|
| M1 — API showcase | 🟨 | 2026-07-06 | — |
| M2 — UI showcase | ⬜ | — | — |
| M3 — watch-mode showcase | ⬜ | — | — |
| M4 — reuse-pass showcase | ⬜ | — | — |
| M5 — full acceptance parity | ⬜ | — | — |

---

## M1 — API showcase 🟨

Scaffolded via a `/grill-me` session (2026-07-06) that resolved testFlow-tests/ replacing
automationTestPOC as tflw's dogfood/acceptance target. See PLAN.md for the full checklist.

- [x] Project scaffold: git repo, package.json, PLAN.md/PROGRESS.md/README.md
- [x] `api/core` + `api/auth` services
- [x] `frontend/` pages
- [x] `tflw.config` + tarball consumption wired up
- [x] `.tflw` test files, all green
- [ ] `testflow-tests-app` lifecycle skill

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
