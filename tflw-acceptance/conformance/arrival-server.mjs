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
// **`D745` — the shape plants are graded against this server and NOT against apiV2, which is
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

// ---------------------------------------------------------------------------------------------
// `M154g` step 4b — what a *config key* does to a request, recorded on the wire
// ---------------------------------------------------------------------------------------------
//
// Three additions, and each is here for `D745`'s reason rather than for convenience. A config key
// is a claim about the request tflw is about to make, and tflw's own report is the thing under
// test: a `header` key that reached the report and not the socket would pass any assertion written
// inside a `.tflw` file. So the socket is what records it.
//
//   - `headerLog` — the headers of each arrival, per path. `C98` asks whether a `header` key
//     reaches **every** `api` step, which is a per-arrival question a total cannot answer.
//   - `/gate` + `waiting` — a rendezvous. Two requests that arrive together are released together;
//     one that arrives alone is released alone when its deadline passes. `peakWaiting` is the
//     high-water mark of simultaneous holders, which is the overlap watermark `config:key:workers`
//     and `declaration:concurrency` both need and neither could get from a counter. **This is the
//     endpoint `constructs.mjs` says "rosters when apiV2 has one" about, and it does not belong in
//     apiV2**: `D745` already decided that a claim about tflw's own scheduling is measured against
//     a zero-latency target, because a real one makes the database the instrument.
//   - `/blocked` — an ordinary counted path that exists only to be *unreachable*. `C100`'s claim is
//     that `allow hosts` refuses before a socket is opened, and the only way to prove an absence is
//     against a listener that would have recorded a presence.

/** Per-path header maps, capped. `C98` reads two or three arrivals; the workload plants push
 *  hundreds of thousands through the same process, so this is capped hard and separately from
 *  `MAX_SAMPLES` — a header log is per-arrival *objects*, which is a different order of cost from
 *  a float. Nothing reads a path with more than `MAX_HEADERS` arrivals. */
const MAX_HEADERS = 50;
const headerLog = new Map();

/** The rendezvous. `GATE_HOLD_MS` is the deadline a lone holder waits before being released on its
 *  own — long enough that two genuinely concurrent files always meet, short enough that the
 *  one-worker leg costs seconds rather than a timeout budget. It is a *duration*, never a verdict:
 *  both legs answer 200 and both tests pass, because the finding lives in `peakWaiting` and not in
 *  whether tflw liked the response. A plant whose known answer was "the step failed" would be
 *  indistinguishable from a broken target. */
const GATE_N = 2;
const GATE_HOLD_MS = Number(process.env.ARRIVAL_GATE_HOLD_MS ?? 1500);
let waiting = [];
let peakWaiting = 0;
let gatePaired = 0;
let gateAlone = 0;

/** Release everyone currently held. `paired` is recorded per release rather than per request: what
 *  the plant asks is whether anybody was *ever* in there at the same time as somebody else. */
function releaseWaiting(paired) {
  const held = waiting;
  waiting = [];
  for (const w of held) {
    clearTimeout(w.timer);
    if (paired) gatePaired += 1; else gateAlone += 1;
    w.res.writeHead(200, { 'content-type': 'application/json' });
    w.res.end(JSON.stringify({ ok: true, gate: true, paired }));
  }
}

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

/** One arrival: the count, the offset, and the headers. Factored out when `M154g` added the header
 *  log so the two counted branches could not drift — `/slow` and the default branch used to carry
 *  the same three lines twice, and a header recorded on only one of them would have made `C98`
 *  silently path-dependent. */
function count(path, req) {
  arrivals.set(path, (arrivals.get(path) ?? 0) + 1);
  const list = offsets.get(path) ?? (offsets.set(path, []).get(path));
  if (list.length < MAX_SAMPLES) list.push(performance.now() - epoch);
  else dropped += 1;
  const hs = headerLog.get(path) ?? (headerLog.set(path, []).get(path));
  if (hs.length < MAX_HEADERS) hs.push({ ...req.headers });
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
    headerLog.clear();
    epoch = performance.now();
    dropped = 0;
    connections = 0;
    // A holder left over from a previous plant would be counted into the next one's watermark, so
    // the reset releases rather than forgets: dropping the references would leave two sockets open
    // until their deadlines and the run's own `--parallel` accounting waiting on them.
    releaseWaiting(false);
    peakWaiting = 0;
    gatePaired = 0;
    gateAlone = 0;
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
  if (path === '/__headers') {
    // The header name is the caller's choice for the same reason `/__curve`'s bin is: the server
    // records what arrived and decides nothing about which part of it a plant is asking about.
    const name = (new URL(req.url, 'http://x').searchParams.get('name') ?? '').toLowerCase();
    const byPath = {};
    for (const [p, list] of headerLog) byPath[p] = list.map((h) => h[name] ?? null);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ name, byPath }));
    return;
  }
  if (path === '/__peak') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ peakWaiting, gatePaired, gateAlone, holdMs: GATE_HOLD_MS, gateN: GATE_N }));
    return;
  }
  if (path === '/gate') {
    count(path, req);
    const entry = { res, timer: null };
    entry.timer = setTimeout(() => {
      // Alone at the deadline. Released on its own, and recorded as such — the release is what the
      // watermark means, so a lone holder must never be able to look like half of a pair.
      waiting = waiting.filter((w) => w !== entry);
      gateAlone += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, gate: true, paired: false }));
    }, GATE_HOLD_MS);
    waiting.push(entry);
    if (waiting.length > peakWaiting) peakWaiting = waiting.length;
    if (waiting.length >= GATE_N) releaseWaiting(true);
    return;
  }
  // `M154e` / `C49` — one path that is deliberately slow, and it is the only thing in this file
  // that delays anything. `threshold` decides a workload's verdict from the run's *aggregate*
  // metrics, and a plant for it needs a latency it can predict: against the zero-latency paths
  // above, p95 sits at 1 ms and no duration threshold can be written that is neither vacuous nor
  // flaky. 50 ms is far above any scheduling jitter this process can suffer and far below any
  // sensible timeout, so `p95 duration is less than 10ms` breaches on every machine and
  // `less than 5000ms` passes on every machine. Both halves are needed: a threshold plant that only
  // ever showed the red half would not distinguish "the verdict comes from thresholds" from
  // "the verdict is always red".
  if (path === '/slow') {
    count(path, req);
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true,"slow":true}');
    }, 50);
    return;
  }
  // `M157g` — the second deliberately-slow path, and it exists for the same reason `/slow` above
  // does, one clause further on. `C48`'s fourth clause grades `D782`: hook time leaves the reported
  // iteration duration, so the reported p95 must NOT move when the number of hooks per iteration
  // does. That is a **null result**, and a null result is only evidence if the effect it denies
  // would have been visible. This path was zero-latency, so the effect being denied was one local
  // request — 1-3 ms — against a tolerance of 5 ms and a hosted runner's jitter of up to 12 ms
  // (measured: three of four GitHub runs of the clause failed on noise alone, spreads 5.5, 9 and
  // 12 ms, while `fedora-box` passed every time). The clause could not have distinguished a build
  // that put hook time back into the duration from one that did not, on any machine.
  //
  // 50 ms, matching `/slow`, and for the same argument: far above any scheduling jitter, far below
  // any timeout. A regression of `D782` now moves the reported p95 by ~50 ms per iteration and the
  // clause's tolerance can sit above the noise floor without becoming vacuous. **Raise the effect,
  // do not loosen the test** — loosening it toward the jitter would have kept the clause green and
  // left it measuring nothing, which is what it was already doing.
  //
  // Nothing else requests this path (`teardown.tflw`'s `after` hook is its only caller), so the
  // delay is scoped to the one plant that needs it and costs it 400 ms in the `always` arm.
  if (path === '/after-each-marker') {
    count(path, req);
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true,"marker":true}');
    }, 50);
    return;
  }
  // Counted on *arrival*, before any work and before the response is written. A counter incremented
  // on the way out would undercount anything the process failed to answer, which is the opposite of
  // what this measures: the question is what tflw issued, not what it got back.
  count(path, req);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"ok":true}');
});
server.on('connection', () => { connections += 1; });

server.listen(PORT, '127.0.0.1', () => {
  // The grader waits for this line rather than sleeping — a fixed sleep is a race that passes on a
  // fast machine and fails on the box under a forge render.
  process.stdout.write(`arrival-server listening on ${PORT}\n`);
});
