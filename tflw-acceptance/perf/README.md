# The perf ladder — tflw vs. k6 vs. Artillery

<sub>**Notation.** `P#n`, `D<n>` and `M<n>` name blocks in design records neither repository
publishes; each resolves in tflw's [DECISIONS.md](https://github.com/deepak-tuteja/tflw/blob/main/DECISIONS.md), which lifts the block verbatim.
**Both repositories number their milestones from 1**, so an unqualified `M<n>` here is tflw's —
this repository's own are written `testFlow-tests M22`, and are published nowhere.</sub>

The same load scenarios written three times, against the same targets, so tflw's numbers can be
compared against two established tools rather than asserted. `PLAN_BROWSER_PERF_SECURITY.md` (D31,
M34/M39/M47/M48/M49) is the arc that built it; `../README.md`'s *"perf leg: tflw vs. k6"* section
carries the measured results and the analysis. This file is the operating manual: what the rungs
are, what has to be running before each one, and why every rung declares a threshold it does not
really care about.

## Layout

Four sibling trees, one per tool plus the profiling harness:

| Path | What it holds |
|---|---|
| `tflw/` | the `.tflw` rungs against the real dogfood target (apiV2 on `:4001`) |
| `k6/` | their k6 counterparts |
| `artillery/` | their Artillery counterparts |
| `profile/` | tflw-only measurement harnesses against local echo servers — no comparison, no real app |

Six directories hold a `tflw.config`, and each one is a separate root: `tflw/`, `profile/`, and
`profile/delayed/` here, plus `../tflw/`, `../restful-booker/` and `../webv2/tflw/` elsewhere in the
suite. **Run every rung from inside its own directory.** `profile/delayed/` exists as its own root
specifically so its slow-target rungs can never be fired at the fast profiling target, and
`profile/`'s config exists so the profiling harness can never be fired at the real app.

## Prerequisites, per tree

**`tflw/` and `k6/` and `artillery/` — the real target.** The Docker stack must be up and the load
fixtures reset:

```sh
cd ../..                 # testFlow-tests repo root
node cli.mjs start       # postgres + apiV2 on :4001, migrations + seed
```

`tflw/` additionally reads `LOAD_USER_EMAIL` / `LOAD_USER_PW` (its config `require env`s both) from
an **untracked** `tflw/.env`. It is not in git — recreate it after a fresh clone:

```sh
printf 'LOAD_USER_EMAIL=load@example.com\nLOAD_USER_PW=load-pw-123\n' > tflw/.env
```

Every mutating rung — `checkout-burst`, `dogfood-post-uncontended`, `ticket-write` — wants
`POST /admin/load/reset` (bearer admin auth) run first, or it measures a database still carrying the
last run's rows. `search-read` and `dogfood-get-only` are reads and need no reset.
`dogfood-post-uncontended` hardcodes a `productId` on all three sides, deliberately — that rung
measures a POST with zero capture/interpolation overhead, so resolving the id at run time would
change what it measures. It is now **pinned in the seed** (`LOAD_HOT_PRODUCT_ID` in
`apiV2/src/load-admin/load-target.constants.ts`), so a reseed no longer invalidates it. Change it in
one place and all four must move together.

**`profile/` — the zero-latency harness.** Start `echo-server.mjs` first; it listens on
`127.0.0.1:4099`, which is what `profile/tflw.config` points at.

```sh
cd profile && node echo-server.mjs &
```

**`profile/delayed/` — the slow harness.** `echo-server-delayed-connlog.mjs` on `127.0.0.1:4503`,
which `profile/delayed/tflw.config` points at.

```sh
cd profile && node echo-server-delayed-connlog.mjs &
```

## Running a rung

```sh
cd tflw     && npx tflw run checkout-burst.tflw --no-color
cd k6       && k6 run checkout-burst.js
cd artillery && npx artillery run checkout-burst.yml
```

`profile/`'s rungs are the same shape, run from `profile/` (or `profile/delayed/`) instead. Nothing
here is wired into `npm test` or the regression sweep, and that is deliberate: these take minutes,
need a stack in a known state, and produce numbers a human reads rather than a pass/fail anyone
should gate a merge on.

## Why every rung carries a `threshold` it does not care about

`TF033` requires at least one `threshold` on any workload-bearing `test` (tflw M60): a workload's
verdict comes *only* from its thresholds, so a test declaring none can report `✓ PASS` and exit 0
at a 100 % error rate. tflw has no "measure, don't gate" mode — SPEC §4.5's answer is to *"declare
a deliberately loose one"*, and that is what these rungs do.

The convention here is `threshold error rate is less than 1%`, chosen so it is loose but **not
vacuous** — every one of these targets should be erroring at essentially zero, so a breach means a
real defect (a stale fixture, a missed reset, a broken generator), never the load shape. Each file's
own comment says which. A `duration` threshold is deliberately *not* declared on the measurement
rungs, both because latency is the output rather than the bar, and because M89c pairs any duration
threshold with a mandatory unscoped `error rate` one — declaring one would mean writing two.

`checkout-burst.tflw` is the exception, and should stay one: it is the acceptance rung, so its p95
bound is the actual claim being made.

## Keeping it parsing

This ladder went un-runnable for four milestones without a single failure anywhere. Nothing ran
`tflw check` over it — `tflw.config`'s `exclude "tflw-acceptance"` (D127) keeps the whole suite out
of bare discovery, and that exclusion quietly took checking with it. `TF033` then tightened twice
(M60 required a threshold, M89c required the duration/error-rate pairing) and 10 of the 12 `.tflw`
files here stopped parsing, silently. The commit that consumed M89c touched two files: the two a
human had happened to run by hand.

The fix is `npm run check:acceptance` at the repo root — parse + checker over every corpus, config
roots discovered rather than listed, no stack and no browsers needed. It runs as its own CI job.
**Run it after any tflw upgrade**, and before assuming a rung still works.

## What is still not checked — `k6/` and `artillery/`

`check:acceptance` covers the `.tflw` third of this ladder and nothing else. There is no equivalent
for the other two trees, and the cost of that is on record twice, both times on the one fixture that
hardcodes a `productId`:

- **M48** (`../README.md`, "a methodology note on why k6's D/E re-run needed a full stack reset"): a
  k6 run collapsed to ~200/s at a **98% `http_req_failed` rate** after a stack reset regenerated the
  load target's UUID. Diagnosed by hand, fixed by hand in all three files.
- **2026-08-05**, three reseeds later: the tflw copy at **65,119 iterations / 100.00% error rate**,
  reporting `PASS` and exit 0 — the `threshold` line that catches it now did not exist yet. The k6
  and Artillery copies were dead at the same moment, and a parity run would have compared two
  100 %-erroring rungs and called them equal.

k6 and Artillery are not silent at *run* time — `http_req_failed` and `expect: statusCode` both
scream. What none of the three has is any check *before* a run that its target still exists. Pinning
the id closes the drift source; the asymmetry stays.

Tracked as `B6-15` in tflw's launch review, where it is an explicit **withdrawal candidate at the
1.0 final review**: these two trees were built to answer *"is tflw's load engine comparable to the
incumbents?"*, M46–M49 answered it and applied a stop condition, and what remains is two hand-
maintained fixture trees in languages this repo does not otherwise use. Retiring them — keeping
`../README.md`'s measured numbers as the record — is likely cheaper than building checkers for them.
