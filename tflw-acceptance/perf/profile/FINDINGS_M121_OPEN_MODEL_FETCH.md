# M121 / `M118-02` — the open model's `fetch` reported the inter-arrival gap as service time

**Status:** fixed in tflw `M121` (D206). This file is the record, not a test. Sibling of
[`FINDINGS_M35B_ROOT_CAUSE.md`](./FINDINGS_M35B_ROOT_CAUSE.md), which is the *first* time an undici
behaviour cost tflw a measurement — this is the second, at the one client path M45 declined to move.

If you are here because a `hold N rps` / `ramp to N rps` run reports a latency floor that has no
business existing on a fast endpoint, and `hold 1 users` against that same endpoint reports ~0 —
this is that, and the tflw you are running predates `M121`.

---

## The symptom

`GET /health` on tflw's own demo service, p50 **0.2 ms** measured standalone:

| workload | model | client | reported p50 |
|---|---|---|---|
| `hold 1 users for …` | closed | pinned `node:http` | **0 ms** over 210,116 iterations |
| `hold 10 rps for …` | open | `fetch` | **36 ms** over 100 |

Same endpoint, same process, same run. Two models disagreeing by ~100× about one service.

## What it was *not*

`M118-02` was originally filed as *"arrival scheduling counted as request duration"* — a request due
at `T` but dispatched at `T+40` appearing 40 ms slower than it was. **That mechanism is wrong.**
`interpreter.ts` captures `iterStart` *after* the `await sleep`, so scheduling delay was already
excluded. The inflation is real wall-clock time spent inside the client after the request is on the
wire.

The clue that should have killed the scheduling theory immediately was already in the original
evidence: a bare Node server, unrelated to the demo service, produced an *identical* distribution.
Two unrelated servers agreeing to the millisecond means the number is being produced by the client.

## The chain, each link measured

1. **Reported latency tracks the inter-arrival gap at every rate** — 10 rps → max 101 ms, 25 → 43,
   50 → 24, 100 → 17, 200 → 7. The error is `U(0, gap)`.
2. **Not the target.** A probe server stamping its own arrivals saw them land *on schedule* (median
   gap 100.9 ms against a 100 ms target) and answered in **0.12 ms avg, 1.7 ms max**.
3. **Not tflw.** A 12-line script with no tflw in it reproduces it: one process, one server,
   identical pacing — `fetch` **48.3 ms avg** vs `node:http` **0.8 ms avg**. 60×, and the gap is in
   getting response *headers* back (the body adds 0.1 ms).
4. **Node 26 only**, OS held constant (Fedora, Docker):

   | Node | avg |
   |---|---|
   | 22.23.2 | 1.7 ms |
   | 24.19.0 | 1.6 ms |
   | **26.7.0** | **48.5 ms** |

   Node 26 is the first release shipping undici 8 (Node 24 ships undici 7).

## The trigger, isolated

Neither ingredient alone reproduces it. Same server, Node 26 vs 24:

| shape | Node 26 | Node 24 |
|---|---|---|
| sequential, awaited, no timer pending | 1.5 avg | 2.3 avg |
| sequential, awaited, 10 s timeout pending | 0.3 avg | 1.4 avg |
| sequential, awaited, 100 ms timer pending | 0.3 avg | 1.3 avg |
| 25 concurrent, awaited together, **no pacing** | 13.0 avg | 11.4 avg |
| **paced, fire-and-forget** | **48.5 avg / max 101** | **1.6 avg / max 2.3** |

It needs *both*: a `fetch` started **inside a timer callback** and **not awaited by that loop**,
whose completion is then deferred to roughly the next timer tick.

Confirmed by a controlled pair rather than inferred: an unrelated `setInterval(fn, 1)` collapses the
same loop to **2.3 ms**, and removing it restores **49.0 ms**. A 1 ms heartbeat means "the next timer
tick" is never more than 1 ms away — exactly the size of the residual.

That last row is precisely the open model's dispatch shape: the arrival scheduler `await`s until the
next arrival is due and then fires `runIteration()` **without awaiting it**, because an open model's
schedule must not wait on completion.

### Why the size of the error varies so much

tflw runs `startSelfDiagnosis(sampleMs = 100)` for the duration of every workload — a 100 ms
`setInterval`. That is itself a heartbeat, and it bounds the deferral at ~100 ms. It is why the error
saturates at the inter-arrival gap up to 100 ms and stops growing after: at 10 rps the gap and the
heartbeat coincide, which is the worst case, and is the rate the original report happened to use.

## Blast radius

| path | client | affected |
|---|---|---|
| functional `tflw run` (every `api` step) | `fetch` | **no** — sequential and awaited |
| closed model (`users`) | pinned `node:http` | **no** — structurally immune |
| **open model (`rps`)** | `fetch` | **yes**, on Node 26 |
| `wait until api` | `fetch` | no — awaited in its own poll loop |

**No published number is retracted.** Every corpus under `tflw-acceptance/perf/**` uses
`ramp to N users` — closed — so `M47`–`M49`'s k6/Artillery comparisons stand, and CI (Node 22 + 24)
never saw it. What was hit is the open model, the one SPEC §4.5 calls the only model that honestly
validates an SLA, and hardest exactly when the target is fast and the rate low — i.e. when someone
is measuring a *healthy* service. A slow target hides it rather than escaping it: a
scheduling-sized term against tens-of-milliseconds service times is invisible in the total.

## The fix, and how it was verified

`M121`/D206 routes open-model arrivals through `sendPinnedRequest` (`node:http`), the path M45 built
for the closed model. One keep-alive agent pair per *scenario*, shared by every arrival (D207) — not
per arrival, which would put a fresh TCP handshake in front of every sample.

Verified on Node 26.7.0 in a container on the Fedora box, running the shipped `runProgram` path
against a loopback fixture, `hold 10 rps` vs `hold 1 users` on one endpoint:

| duration | with the fix | fix reverted |
|---|---|---|
| `for 600ms` | open p50 **1 ms** (3/3) | open p50 **5, 7, 7, 8, 8 ms** |
| `for 3s` | open p50 **0, 1, 1 ms** | open p50 **4, 5, 6, 8, 11 ms** |
| `for 10s` | open p50 **0 ms** (2/2) | open p50 **15, 16, 22 ms** |

Closed-model p50 was **0 ms** in every one of those runs, fixed and reverted alike.

### Why there is no timing test in the suite

The milestone gate required running the intended regression test on Node 26 *with the fix reverted*,
to prove the instrument could see the thing. It could not, and the table above is why: the closed
model reports **0**, so the planned "the two models agree within an order of magnitude" assertion is
a ratio against zero — it admits anything under its own floor, and the reverted 600 ms run passed it
4 times in 5. The separation that does exist is absolute, and an absolute millisecond threshold is
the flake generator that `M115-02` and `M119-02` already cost this project twice. Stabilising p50
needs `for 10s` per model — 20 s on every CI run, to assert something neither Node version CI uses
can falsify.

So the shipped guard is **structural**: `load.test.ts` asserts that arrivals from all four open
grammars carry no `sec-fetch-mode` header (emitted by `fetch`, by nothing in `node:http` — verified
present-then-absent on 22.23.2, 24.19.0 and 26.7.0 rather than assumed), and that they share one
pooled connection rather than opening one each. Those fail deterministically, on every Node version,
the moment the routing is reverted.

**A test that catches a defect one run in five, while reading as a guard, is worse than no test.**

## Upstream

Reported against `nodejs/undici` (D211). No pre-existing issue matched a search of the tracker; the
nearest, #3410, is about connect-timeouts under CPU load and is a different thing. tflw does not
depend on the outcome — D206 is a fix, not a workaround.

## Reproducing it

`open-model-fetch-repro.mjs` in this directory is the ~40-line standalone reproduction — no tflw, no
network. It needs no arguments and prints a table; run it under Node 24 and Node 26 to see the split:

```
node open-model-fetch-repro.mjs
docker run --rm -v "$PWD":/w -w /w node:26-slim node open-model-fetch-repro.mjs
docker run --rm -v "$PWD":/w -w /w node:24-slim node open-model-fetch-repro.mjs
```
