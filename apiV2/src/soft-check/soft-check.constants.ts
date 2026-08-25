// The frozen payload behind `GET /v1/soft-check/known-answer`, and the arithmetic that makes it a
// known answer (`M154b` / `C1`).
//
// Every field is a literal. Nothing here is seeded, computed from the database, or derived from
// another fixture — which is the whole point. `B6-15` is the standing record of what happens when a
// fixture id is copied across three tools and drifts: it cost a 98% k6 failure at `M48` and a 100%
// tflw failure on 2026-08-05. A plant whose expected value can change without anybody editing the
// plant is not a known answer.
//
// `CONSTRUCTS.md`'s `C1` row states the pair of numbers below and
// `scripts/verify-construct-acceptance.mjs` asserts them against the run report. Change a value
// here and that grader goes red naming this file, which is the intended coupling.
export const SOFT_CHECK_ANSWER = {
  label: 'known-answer',
  /** The number of `check` lines in the plant that are true of this payload. */
  truthy: 4,
  /** The number that are false. Not derived from `truthy` — two independent literals, so a grader
   *  cannot be satisfied by a payload that merely adds up. */
  falsy: 2,
  price: 42,
  currency: 'EUR',
  inStock: true,
  tags: ['plant', 'soft-assertion'],
} as const;

/** Exactly the two subjects the plant asserts falsely. Named so the grader can demand *which* two
 *  rows failed rather than merely how many — a `check` implementation that failed the wrong two
 *  would otherwise pass a count. */
export const SOFT_CHECK_FALSE_SUBJECTS = [
  'body.currency',
  'body.falsy',
] as const;
