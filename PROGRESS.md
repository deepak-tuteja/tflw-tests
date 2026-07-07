# testFlow-tests — PROGRESS

Build tracker, same discipline as [testFlow's own PROGRESS.md](../testFlow/PROGRESS.md): flip a
milestone to in-progress when it starts, check items off as they land, fill in **Verified by**
with real evidence before marking it done.

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done

| Milestone | Status | Started | Finished |
|---|---|---|---|
| M1 — API showcase | ✅ | 2026-07-06 | 2026-07-06 |
| M1.5 — parallel-safety, negative cases & richer scenarios | ✅ | 2026-07-06 | 2026-07-07 |
| M2 — UI showcase | ⬜ | — | — |
| M3 — watch-mode showcase | ⬜ | — | — |
| M4 — reuse-pass showcase | ⬜ | — | — |
| M5 — full acceptance parity | ⬜ | — | — |

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
