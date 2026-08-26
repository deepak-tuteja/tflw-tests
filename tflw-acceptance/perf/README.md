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

## What checks `k6/` and `artillery/` — and what still does not

**This section used to be titled "what is still *not* checked", and `M154e` changed the answer.**
`check:acceptance` covers the `.tflw` third of this ladder and structurally cannot cover the rest:
it discovers corpora by walking for a `tflw.config`, and JavaScript and YAML will never hold one.
`verify-external-targets.mjs` walks the same roots and inherited the same blind spot, so **the host
a k6 script or an Artillery scenario pointed at was fenced by nothing at all** — found while scoping
`M154e`, and the more serious half of the two.

The fix is not a better walk. `scripts/lib/perf-ladder.mjs` is a **declared inventory** — which
rungs exist, in which runner, which fixture values they must agree on, and which k6 sub-metric each
one is measured on — and `npm run verify:perf-parity` checks the filesystem against it. Five
properties: every host is ours, every fixture copy equals the constant in
`apiV2/src/load-admin/load-target.constants.ts`, every file under the three runner directories is
rostered, every missing runner has a written reason, and every declared `k6Tag` really appears in
the k6 file that is supposed to emit it.

That last one exists because of `D749`: tflw's percentiles are **successful-only** (`SPEC` §12,
`M89a`) and k6's bare `http_req_duration` is not, so the comparison must read
`http_req_duration{name:<k6Tag>,expected_response:true}`. `../README.md` §M89 records that this
exact mismatch made `M49`'s published 3.54% p95 gap a comparison of two different populations, held
together only by a near-zero error rate — *"that was luck, not design."* The tag is never the rung's
own name (`checkout-burst` measures `checkout`), so an extractor that guessed would have been wrong
on all seven rungs.

The cost of not having had this is on record twice, both times on the one fixture that hardcodes a
`productId`:

- **M48** (`../README.md`, "a methodology note on why k6's D/E re-run needed a full stack reset"): a
  k6 run collapsed to ~200/s at a **98% `http_req_failed` rate** after a stack reset regenerated the
  load target's UUID. Diagnosed by hand, fixed by hand in all three files.
- **2026-08-05**, three reseeds later: the tflw copy at **65,119 iterations / 100.00% error rate**,
  reporting `PASS` and exit 0 — the `threshold` line that catches it now did not exist yet. The k6
  and Artillery copies were dead at the same moment, and a parity run would have compared two
  100 %-erroring rungs and called them equal.

The drift scan is the half with teeth: it looks for literals of each fixture's *shape* in every
ladder file and refuses any that is not the value the constant defines, so a new rung that hardcodes
last month's product id goes red on the day it lands whether or not anybody rostered it.

`B6-15` remains an explicit **withdrawal candidate at the 1.0 final review** — these two trees were
built to answer *"is tflw's load engine comparable to the incumbents?"*, M46–M49 answered it and
applied a stop condition. What changed is only that the ladder is now checked rather than trusted.

## The run on `fedora-box` — on demand, and as a phase of the sweep

**The schedule is disarmed, and this section is written in the order the design actually moved.**

`D727` puts arrival-curve grading on a box run rather than in CI: GitHub's shared runners cannot
produce a trustworthy arrival curve and the box can. `D733` makes that run a **registered box
tenant**, so `statsctl check` and `statsctl conflict --for` can see it and a forge render is never
surprised by it. Both still hold. What no longer holds is the *nightly timer* `D733` also asked for.

**`D754` disarmed it, on measurement rather than taste.** The box was suspended or powered off at
04:30 on all three nights the timer could have fired — 0 of 3 — and `Persistent=false` makes a
missed run a silent skip rather than a catch-up. A regression net that never runs and never says so
is worse than no net, because the plan claims one exists. The units, both checkouts and the
`tflwperf` tenant row stay **installed and inert**: `D733` is not reversed, and a scheduled run as a
registered tenant is still the right end state.

**The obvious replacement was scoped and rejected before any code** (`D755`): an auto-triggered
daytime run that notifies, waits for explicit approval, and offers to delay. Selectivity, not
notification, is the hard part — this run needs a quiet box, a quiet box during working hours is one
nobody is using, and the prompt would mostly read *"may I kill what you are doing, in order to
measure something?"*. Its kill list is also the eviction clause wearing consent, and the box's
registry decided conflicts are **refused, not auto-evicted**. `D756` declines to reopen
`fedora-box-dashboard` to carry the notification: its freeze names one reopening trigger and this is
not it, and the tenant script's own header already calls a dashboard button that launches a
twenty-minute load run the worst available reading of that carve-out.

**What replaced it has no trigger at all** (`D758`): the measured gate is now a phase of the
regression sweep — `perf-ladder`, `node scripts/perf-conformance.mjs --profile sweep --in-sweep` —
so it rides a command a developer already runs on purpose before pushing. Inside the sweep the box
lease is **inherited from `exec.mjs`, verified, and neither re-taken nor waived** (`D759`);
`boxlock.sh` is a whole-box mutex and is not reentrant, so a second `acquire` would deadlock against
its own parent, while `--no-lease` would stamp *"not trustworthy"* onto a run that genuinely was
exclusive. The phase runs a `sweep` profile — `ladder` + `functional`, omitting the breaking-point
`curve` (`D760`) — and off the box it exits 3 and is rendered `⊘ skipped`, never a pass (`D761`).
Its artifacts land in `~/tflw-perf/results/sweep/` and never touch `latest.json`, because an
in-sweep run grades a dirty working tree while every other run grades a checkout reset to
`origin/main`.

**Unattendedness is deferred, not delivered.** `M124-03` is re-deferred against **publish** (`D757`)
rather than left closed on a timer that never fired.

```sh
npm run perf:conformance -- --dry-run              # what would run, and against which commit
npm run perf:conformance -- --profile curve        # the C44-C50 arrival-curve tier only
npm run perf:conformance -- --profile full         # curve + the three-runner ladder
```

Three things about it are decisions rather than details:

- **It leases as `tflw:load:conformance`, class `tflw:load`** (`D746`). `D733` asked for a new
  `tflw:perf` class; measured against the real table, `classify('tflw:perf')` returns `load-run`
  (prefix `tflw:`, the union) whose `requires` is empty — silently dropping the `quiet` requirement
  that is the only thing this run needs from the mutex, while still returning perfectly real
  answers. `tflw:load` already declares `requires: ('quiet',)` and was declared in advance for
  exactly this caller.
- **It acquires through `boxlock.sh acquire`, never plain `flock`** (`D747`). The dashboard
  identifies holders by walking /proc for `boxlock.sh acquire` processes, so a job that takes the
  same lock directly is reported as `holder: null` / `stale_holder` *while it is genuinely running*
  — observed live on 2026-08-25 (dashboard finding 196). Registering as a tenant is worthless if the
  mutex cannot see the tenant.
- **It measures `origin/main` in its own checkout** (`D748`), never `~/tflw-exec/testFlow-tests` —
  that is the rsync target a Mac session maintains, so a gate pointed at it grades whatever was last
  pushed there, attributable to no commit. The artifact records the sha it measured.

Operating it, from the Mac:

```sh
ssh fedora-box '~/boxd/tenants/tflwperfctl.sh status'      # armed? when? what did the last run say?
ssh fedora-box '~/boxd/tenants/tflwperfctl.sh preflight'   # never mutates; exit 75 means "not now"
ssh fedora-box '~/boxd/tenants/tflwperfctl.sh start'       # ARM the timer — not "run it now"
```

`start`/`stop` arm and disarm the schedule rather than launching a run, deliberately — and since
`D754` the schedule stays disarmed, so `start` is the verb nobody should be reaching for today: a
mutating
verb that kicked off a twenty-minute load run because someone clicked a dashboard button would be
the worst available reading of the dashboard's start/stop carve-out. (That carve-out is numbered in
`fedora-box-dashboard`'s own sequence, which is a **different namespace** from the `D<n>` used here:
the **Notation** paragraph promises a bare `D<n>` resolves in tflw's `DECISIONS.md`, and at that
same number tflw has an unrelated decision about active-scanner scope. So the dashboard's is spelled
out rather than cited — `verify:provenance` caught the first draft of this paragraph citing it, and
a reader following the number would have landed somewhere else entirely.)

**The artifact judges itself** (`D750`). `perf-conformance.mjs` writes
`~/tflw-perf/results/<stamp>.json` plus `latest.json`, and folds the comparison verdict *into* the
artifact, so whatever reads it later sees the verdict without needing the baseline or the script.
The bands are ratios of tflw to its co-runner **in the same run**, not absolute numbers: absolutes
on this box move with thermal state, the 2.4 GHz link and whoever else holds the lease, so a gate on
them is a flake generator until it is widened into vacuity. Two rules exist regardless of
calibration — a rung with **no co-runner present is a failure, not a pass** (nothing was compared,
so reporting "no regression" would be vacuous), and every rung's **error rate must stay under 1%**,
which is the bound whose absence let a rung report PASS at a 100% error rate on 2026-08-05.

`tflw-acceptance/perf/baseline.json` ships with `established: false` and every band `null`. **The
first run in anger sets them, and that same run is what closes `B6-15`**, whose condition is
verbatim *"reopens when the parity ladder is next run in anger"*.
