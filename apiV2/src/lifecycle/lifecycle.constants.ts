// The known answers behind `GET /v1/lifecycle/*` — the run-lifecycle plants (`M154c` / `C4`, `C5`).
//
// What this module observes is **tflw's own run lifecycle, from the server side**: how many times a
// retried test actually executed, and whether a teardown hook ran at all. Both are things tflw
// states about itself in `tflw spec --json` and neither has ever been checked, for the same reason
// in both cases — the existing evidence cannot fail in the interesting direction.
//
//   `tests/api/mechanics/retry-and-flake.tflw` runs `retry 2` against a flaky endpoint and asserts
//   the eventual 201. That does catch a `retry` that never retries. It cannot tell `retry N` = "N
//   extra attempts" from "N total attempts", cannot tell a re-run of the *whole test* from a re-run
//   of the failing *step*, and cannot see a retry that kept going past its budget — the endpoint
//   succeeds on attempt 3 either way.
//
//   `tests/examples/hooks-explained.tflw` has an `after` hook that deletes what the test created.
//   If the hook simply never ran, **nothing in that file fails**. It is a construct exercised in a
//   way that cannot go red, which is `D722`'s bar in one sentence.
//
// So the counters below are read back by the grader after the run, and the plant's claim is stated
// as a set of exact integers rather than as "the test passed".
//
// Per-key and in-memory, the same "pure test scaffolding, no persistence" pattern `flaky-widget`
// and `retry-demo` already use — and deliberately **not** `retry-demo`, which serves the *step*
// level `api … retry honoring "Retry-After" up to N` (a transport concern, `P#102b`). The
// test-header `retry N` graded here is a different construct that happens to share a keyword.

/** The fixed attempt keys `C4` uses. Fixed, not `random string 8`, because the grader reads these
 *  counters back by name after the run — a fresh key per run would leave it nothing to ask for.
 *  `POST /v1/lifecycle/reset` in the plant's `before file` is what keeps that repeatable.
 *
 *  Note that `random` would not even have been wrong for the *retry* mechanics: tflw replays a
 *  `random` value identically on every attempt of a retried test (`SPEC` §4.4), which is exactly
 *  why `tests/examples/retry-explained.tflw` can use one. It is the *grader* that needs the name,
 *  not the plant. */
export const LIFECYCLE_KEYS = {
  /** Answers 200 on attempt 3 — inside a `retry 2` budget. */
  settles: 'c4-settles',
  /** Answers 200 on attempt 4 — one past it. The budget-exhausted control. */
  exhausts: 'c4-exhausts',
} as const;

/** The attempt on which each `C4` key starts answering 200. The pair pins the budget from both
 *  sides: a `retry N` meaning *N total attempts* never reaches `settles`, and a retry that ignored
 *  its budget would reach `exhausts`. One key alone is satisfied by either defect. */
export const LIFECYCLE_SUCCEEDS_ON: Readonly<Record<string, number>> = {
  [LIFECYCLE_KEYS.settles]: 3,
  [LIFECYCLE_KEYS.exhausts]: 4,
};

/** The labels the plants mark, and the count each must reach.
 *
 *  `C4`'s `preamble` is the one that separates *the whole test re-ran* from *the failing step
 *  re-ran*: it is marked by the step **before** the one that fails, so a step-level retry leaves it
 *  at 1 while a test-level retry drives it to 3. `SPEC` §4.4 says "re-runs the whole test", and
 *  nothing in this repository has ever been able to tell the difference — `retry-and-flake.tflw`'s
 *  endpoint settles on attempt 3 under either reading.
 *
 *  `C5`'s two are the hook scopes. `after file` runs once for the file; `after` runs once per test
 *  **including the test that failed**, which is the clause `tflw spec` states for this construct
 *  ("runs whether the test passed or failed") and the half no existing evidence can observe — an
 *  `after` hook that simply never ran would leave `tests/examples/hooks-explained.tflw` green. */
export const LIFECYCLE_MARKS = {
  preamble: { label: 'c4-preamble', expected: 3 },
  afterFile: { label: 'c5-after-file', expected: 1 },
  afterTest: { label: 'c5-after-test', expected: 2 },
} as const;
