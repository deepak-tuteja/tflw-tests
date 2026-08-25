#!/usr/bin/env node
// `M154b` / `C3` — the server half of the workload plant: it counts what actually arrived.
//
// ## Why a server, and not the run report
//
// tflw's own account of a workload run is the thing under test. `spec --json` states the contract
// for `run N iterations [per user] across M users` in one sentence — *"count-bounded load with no
// duration; the count is exact and independent of `--workers`"* — and every word of that is a claim
// nothing in either repository has ever checked. Grading it against tflw's own iteration counter
// would be circular: a generator that issued 47 requests and reported 60 would pass.
//
// So the bar is `D726`'s, one milestone early and in its cheapest form: **the generator is graded
// against physics, not against its own report.** This process is the physics. It increments a
// counter when a socket delivers a request and it knows nothing about tflw.
//
// ## Why `run N iterations` is the shape that can be graded here rather than on the box
//
// `D727` sends arrival-*curve* grading to a scheduled `fedora-box` run, because a shared GitHub
// runner cannot produce a trustworthy arrival curve — `ramp`, `hold`, `step` and `spike` are all
// claims about *when* requests arrive, and a contended runner smears timing. `run N iterations` is
// the one workload shape whose ground truth is a **count**, and a count is exact under contention:
// a saturated CPU makes 60 requests arrive late, never 59. That is what `M154b`'s scope means by
// "the cheapest workload shape to ground-truth", and it is why this plant can gate on every PR
// while the other four wait for `M154e`.
//
// ## Deliberately not a fixture route in apiV2
//
// `D726` puts the eventual arrival-curve ground truth in `apiV2/src/load-admin/`, and that is right
// for `M154e`: those rungs need the real target under real load. This one needs the opposite — no
// database, no Docker stack, no seed, and no other tenant able to move the number. A standalone
// server makes the count a closed question, and makes this plant runnable by anyone with node.
//
// ## `M154e` — the same process now records *when*, and that inverts one line of `D726`
//
// `M154e` grades the five remaining workload shapes, and a shape is a claim about **when** requests
// arrive rather than how many. So every arrival is now timestamped and `/__curve` reports the
// binned curve beside the counts. The counting endpoints are untouched and `C3` still grades
// exactly what it graded before.
//
// **`M154e-D2` — the shape plants are graded against this server and NOT against apiV2, which is
// the opposite of what `D726` says, and the reason is physics rather than convenience.**
//
// `D726` reads "generalize it into apiV2's `load-admin`", on the principle that *the generator is
// graded against physics, not against its own report*. That principle is kept in full. What cannot
// be kept is the placement, because of what the target does to the measurement:
//
//   - In tflw's **closed** model (`N users`), a VU issues its next request when its previous one
//     returns. Arrival rate is therefore a function of *target latency*. Grade `ramp to 60 users
//     over 20s` against apiV2 and the curve you measure is Postgres's row-lock queue, not tflw's
//     spawn schedule — the instrument would be reading the target and calling it the generator.
//   - In the **open** model (`N rps`), the generator paces on its own clock, so the requirement is
//     the same from the other side: the target must never be the constraint. A target that
//     saturates makes a correct generator look like a broken one.
//
// A near-zero-latency, no-database, single-process target is not a cheaper stand-in here. It is the
// only target against which the claim under test is the one being measured. `D726`'s own sentence —
// graded against physics, not against its own report — is what forces this, so the departure is
// from the placement and not from the decision.
//
// The real ladder against the real apiV2 is not lost: that is the scheduled box run (`D733`),
// which answers a different question — how the three runners compare against a real target over
// time — and needs no arrival timestamps to answer it.
import { createServer } from 'node:http';

const PORT = Number(process.env.ARRIVAL_PORT ?? 4507);

/** Arrivals per path. A map rather than a counter because one run exercises two workload
 *  spellings, and they must not be able to pay each other's debts. */
const arrivals = new Map();

/** `M154e` — every arrival's offset in milliseconds from `epoch`, per path.
 *
 *  Offsets rather than absolute timestamps so a grader never has to reconcile two clocks, and
 *  `performance.now()` rather than `Date.now()` because a shape is a claim about elapsed time and
 *  the wall clock can step. Capped: a runaway generator must not be able to exhaust this process's
 *  memory and turn a plant's red into a crash, which reads as infrastructure rather than as a
 *  finding. `dropped` is reported so an exhausted buffer is visible instead of silently flattening
 *  the tail of a curve — a truncated curve that looked complete would be the worst possible failure
 *  for this instrument. */
const MAX_SAMPLES = 400_000;
const offsets = new Map();
let epoch = performance.now();
let dropped = 0;
/** Sockets opened, reported alongside the counts. Not asserted — it is a property of undici's pool,
 *  not of tflw's iteration accounting, and asserting it would tie the plant to a dependency. */
let connections = 0;

/** Min / median / max of the gaps between consecutive arrivals on one path. Null for fewer than
 *  two arrivals, because a single arrival has no gap and reporting `0` would be a made-up number. */
function gapStats(list) {
  if (list.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < list.length; i += 1) gaps.push(list[i] - list[i - 1]);
  const sorted = [...gaps].sort((a, b) => a - b);
  return {
    n: gaps.length,
    minMs: Math.round(sorted[0]),
    medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]),
    maxMs: Math.round(sorted[sorted.length - 1]),
  };
}

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/__arrivals') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ total: [...arrivals.values()].reduce((a, b) => a + b, 0), byPath: Object.fromEntries(arrivals), connections }));
    return;
  }
  if (path === '/__reset') {
    arrivals.clear();
    offsets.clear();
    epoch = performance.now();
    dropped = 0;
    connections = 0;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"reset":true}');
    return;
  }
  if (path === '/__curve') {
    // `bin` is the grader's choice, not the server's: a `hold` reads naturally in 1000 ms bins and
    // a `spike`'s burst needs finer ones. The server keeps the raw offsets and bins on demand, so
    // one run can be read at more than one resolution and no measurement is thrown away at record
    // time.
    const binMs = Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('bin') ?? 1000));
    const curve = {};
    for (const [p, list] of offsets) {
      const bins = [];
      for (const off of list) {
        const i = Math.floor(off / binMs);
        bins[i] = (bins[i] ?? 0) + 1;
      }
      curve[p] = {
        binMs,
        bins: Array.from(bins, (n) => n ?? 0),
        count: list.length,
        firstMs: list.length ? Math.round(list[0]) : null,
        lastMs: list.length ? Math.round(list[list.length - 1]) : null,
        // Inter-arrival gaps, for the one plant whose claim is about spacing rather than rate
        // (`pause`). Reported rounded, and only the extremes plus the median, because a plant that
        // shipped 10,000 raw gaps through a JSON body would be measuring the grader.
        gapsMs: gapStats(list),
      };
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ epochBinMs: binMs, dropped, byPath: curve }));
    return;
  }
  // Counted on *arrival*, before any work and before the response is written. A counter incremented
  // on the way out would undercount anything the process failed to answer, which is the opposite of
  // what this measures: the question is what tflw issued, not what it got back.
  arrivals.set(path, (arrivals.get(path) ?? 0) + 1);
  const list = offsets.get(path) ?? (offsets.set(path, []).get(path));
  if (list.length < MAX_SAMPLES) list.push(performance.now() - epoch);
  else dropped += 1;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"ok":true}');
});
server.on('connection', () => { connections += 1; });

server.listen(PORT, '127.0.0.1', () => {
  // The grader waits for this line rather than sleeping — a fixed sleep is a race that passes on a
  // fast machine and fails on the box under a forge render.
  process.stdout.write(`arrival-server listening on ${PORT}\n`);
});
