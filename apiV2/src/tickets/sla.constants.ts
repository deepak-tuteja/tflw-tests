// PLAN_TICKETING.md decision 4 — shared between TicketsService.create (stamps slaDeadline at
// creation time) and TicketSlaSweepService (polls for tickets past it). A single fixed window, no
// priority tiers — tiered SLA durations would just repeat the same breach-detection test with
// different numbers, not exercise new DSL surface.
export const SLA_WINDOW_MS = 1500;
export const SLA_SWEEP_INTERVAL_MS = 300;

// `M154f-08` — the sweep processes at most this many overdue tickets per tick.
//
// It had no bound at all, and `SLA_WINDOW_MS` being 1500 ms is what made that fatal: every ticket
// the load ladder creates is overdue 1.5 seconds later, so after `ticket-write`'s ~23,000-ticket
// rung a single sweep loaded ~23,000 entities and then did two awaited round-trips *per ticket* in
// a sequential loop. That takes far longer than one 300 ms tick, and `setInterval` does not care —
// it starts the next sweep anyway, so sweeps overlapped, each holding its own full array, and the
// process died of a heap OOM in about 70 seconds. Bounding one tick's work is half the fix; the
// re-entrancy guard in the service is the other half, and neither is sufficient alone.
//
// 500 is chosen so a tick's cost is bounded well under the interval while a backlog still drains
// quickly: 23,000 overdue tickets clear in roughly 14 seconds of ticks. Breach stamping is
// informational and monotone (`slaBreached = false` stops matching once flipped), so draining a
// backlog across several ticks changes when a breach is recorded, never whether it is.
export const SLA_SWEEP_BATCH = 500;
