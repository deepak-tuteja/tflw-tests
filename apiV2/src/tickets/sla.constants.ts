// PLAN_TICKETING.md decision 4 — shared between TicketsService.create (stamps slaDeadline at
// creation time) and TicketSlaSweepService (polls for tickets past it). A single fixed window, no
// priority tiers — tiered SLA durations would just repeat the same breach-detection test with
// different numbers, not exercise new DSL surface.
export const SLA_WINDOW_MS = 1500;
export const SLA_SWEEP_INTERVAL_MS = 300;
