// perf-0 (PLAN_WEBV2_TARGETS.md §2 / tflw PLAN_BROWSER_PERF_SECURITY.md D27) — the load-arc's
// deliberately-contended target: a single hot product whose row every load VU races via
// OrdersService.persistOrderAtomically's conditional `UPDATE ... WHERE stock >= :qty`. Real
// Postgres row-lock serialization on that one row is the contention (not stock scarcity — the
// baseline stock is deliberately huge so a run measures lock-queueing latency, not a flood of
// "insufficient stock" 409s polluting the error-rate metric).
//
// Shared between seed.ts (creates the row) and LoadAdminService (resets it) so the two can never
// drift apart.
export const LOAD_HOT_PRODUCT_NAME = 'Load Test Widget';
export const LOAD_HOT_PRODUCT_BASELINE_STOCK = 1_000_000;

// Pinned rather than left to `@PrimaryGeneratedColumn('uuid')`, for exactly the reason the name and
// the baseline stock above are shared: so nothing that references this row can drift away from it.
// The perf ladder's `dogfood-post-uncontended` rung hardcodes this id on all three sides (tflw, k6,
// Artillery) *on purpose* — that rung measures a POST with zero capture/interpolation overhead, so
// resolving the id at run time would change what it measures. With a random UUID, every fresh
// `node cli.mjs start` silently invalidated all three, and the tflw side then ran at a 100 % error
// rate while still reporting PASS (it declared no `threshold`, tflw `TF033`/M60) — found live
// 2026-08-05, three reseeds after the id it named last existed.
//
// Deliberately unmistakable rather than random: `10ad7e57` reads as "loadtest". Valid v4 shape
// (version nibble `4`, variant `8`) so nothing that parses a UUID strictly rejects it.
//
// A pre-existing Postgres volume keeps whatever id it was seeded with — the row is looked up by
// name and never recreated. `node cli.mjs stop` drops the volume (`down -v`), which is what makes
// the next `start` pick this up.
export const LOAD_HOT_PRODUCT_ID = '10ad7e57-0000-4000-8000-000000000001';

export const LOAD_USER_EMAIL =
  process.env.LOAD_USER_EMAIL ?? 'load@example.com';
export const LOAD_USER_PW = process.env.LOAD_USER_PW ?? 'load-pw-123';
