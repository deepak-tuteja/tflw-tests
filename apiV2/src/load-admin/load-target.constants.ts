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

export const LOAD_USER_EMAIL =
  process.env.LOAD_USER_EMAIL ?? 'load@example.com';
export const LOAD_USER_PW = process.env.LOAD_USER_PW ?? 'load-pw-123';
