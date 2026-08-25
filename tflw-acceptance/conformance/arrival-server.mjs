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
import { createServer } from 'node:http';

const PORT = Number(process.env.ARRIVAL_PORT ?? 4507);

/** Arrivals per path. A map rather than a counter because one run exercises two workload
 *  spellings, and they must not be able to pay each other's debts. */
const arrivals = new Map();
/** Sockets opened, reported alongside the counts. Not asserted — it is a property of undici's pool,
 *  not of tflw's iteration accounting, and asserting it would tie the plant to a dependency. */
let connections = 0;

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/__arrivals') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ total: [...arrivals.values()].reduce((a, b) => a + b, 0), byPath: Object.fromEntries(arrivals), connections }));
    return;
  }
  if (path === '/__reset') {
    arrivals.clear();
    connections = 0;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"reset":true}');
    return;
  }
  // Counted on *arrival*, before any work and before the response is written. A counter incremented
  // on the way out would undercount anything the process failed to answer, which is the opposite of
  // what this measures: the question is what tflw issued, not what it got back.
  arrivals.set(path, (arrivals.get(path) ?? 0) + 1);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"ok":true}');
});
server.on('connection', () => { connections += 1; });

server.listen(PORT, '127.0.0.1', () => {
  // The grader waits for this line rather than sleeping — a fixed sleep is a race that passes on a
  // fast machine and fails on the box under a forge render.
  process.stdout.write(`arrival-server listening on ${PORT}\n`);
});
