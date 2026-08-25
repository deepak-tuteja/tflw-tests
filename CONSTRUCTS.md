# CONSTRUCTS.md — the known-answer ledger for tflw's own language surface

<sub>**Notation.** `P#n`, `D<n>` and `M<n>` name blocks in design records neither repository
publishes; each resolves in tflw's [DECISIONS.md](https://github.com/deepak-tuteja/tflw/blob/main/DECISIONS.md), which lifts the block verbatim.
**Both repositories number their milestones from 1**, so an unqualified `M<n>` here is tflw's —
this repository's own are written `testFlow-tests M22`, and are published nowhere.</sub>

Sibling of [VULNS.md](VULNS.md), one axis over. That file answers *which deliberately-flawed
response is which tflw security rule the answer to*; this one answers the same question about
**tflw's language surface itself** — every construct the tool ships, and what in this dogfood could
catch it breaking.

`VULNS.md` is **not** merged into it (`D724`). It stays the specialist ledger for the `VULN_MODE`
slice and is cited from here rather than duplicated; its eighteen rows are graded by four scripts
asking four different questions, and flattening that into a construct roster would lose all of it.

## Why this file exists

`testFlow-tests` was built as a target for tflw to run against and it is a good one: 30 apiV2
controllers, two frontends, 126 `.tflw` files, a known-answer vulnerability ledger, a three-way perf
ladder. What it never had is an answer to *does it actually exercise tflw?*

Measured 2026-08-25, at tflw `cfca17c` / tflw-tests `d12d725`, over the whole corpus:

- **seven step keywords at literally zero occurrences** — `download as`, `pause`, `hold`, `step`,
  `spike`, `run … iterations`, `cleanup`
- **fourteen more at exactly one occurrence in exactly one file**
- **four of tflw's six workload shapes never executed by anything.** Every rung in
  `tflw-acceptance/perf/` uses `ramp`; the perf arc shipped five shapes and the dogfood proved one.
- **`check` used 9 times against `expect`'s 1692.** The soft/hard split is a first-class language
  decision (`SPEC` §6.4, `P#16`) and this suite tested one side of it.

None of that was decided. It happened because nothing was watching — the same shape as
`M141`/`D538`'s unconditionally-green `jest --passWithNoTests` and `M149f-01`'s
report-but-never-fail scan. A property that holds because nobody got round to breaking it is not a
property.

## The rule

**No construct without a row, and no row without a plant.** Carried over verbatim from `VULNS.md`'s
`no route without a row, no row without a route`, which is where it was learned.

A construct is **rostered** when a row below states its known answer and a plant exists that could
produce a red. Presence is necessary and not sufficient (`D722`): a construct that appears in a file
and is never asserted about proves that it parses, which is not what this ledger is for.

Everything not rostered is on the **ratchet** in
[`scripts/lib/constructs.mjs`](scripts/lib/constructs.mjs), which may only shrink.

## What "uncovered" means here, and what it does not (`D739`)

A ratchet entry says exactly one thing: **no row in this file states its known answer.** It does
*not* say the construct is never exercised. `step:api` is on the ratchet with 1139 occurrences
behind it; `step:expect` with 1692; `step:capture` with 523. For those, the row will usually be
cheap — the evidence already exists and only the claim is missing. For the seven at zero it is a
plant that does not exist yet. Both are unrostered, they cost very different amounts, and the gate
deliberately does not pretend to know which is which.

This distinction is written down because a list that reads as "constructs this suite never
exercises" would be false of a third of it, and a list nobody believes is a list nobody defends.

## Ground truth is the binary (`D723`)

The construct set is **not a list in this repository**. It comes from `tflw spec --json`, emitted by
the vendored build — the same artifact every other grader here runs — so the checklist and the
program under test cannot disagree. At tflw `5cba2da` that is **166 constructs**: 37 step keywords,
18 matchers, 15 generators, 6 locators, 24 config words, 66 diagnostic codes.

A hand-maintained list was rejected on `D659` grounds (this repository's guards do not maintain
wordlists, and a stale one reports green for ever — which is the exact failure being closed).

## How to run against it

```
npm run verify:construct-coverage    # static, seconds, no stack — the roster and the ratchet
npm run verify:construct-acceptance  # the plants themselves; needs the stack and a browser
```

The first refuses outright if the vendored tflw is not current with the sibling checkout, and the
second reports its provenance beside its verdict. That refusal is `M153b-01`'s close condition:
against a stale build this gate does not give an old answer, it gives a confident wrong one — a
construct that shipped after the vendored build was packed is simply absent from its manifest, the
ratchet matches, and the gate goes green on exactly the day it was built to go red.

## The roster

| id | construct | tier | known answer | catches |
|---|---|---|---|---|
| `C1` | `check` (`step:check`) | api | six `check` rows, exactly two failed — `body.currency` and `body.falsy` by name — and the `expect` after them ran and passed | `check` regressing to `expect` semantics, or to no semantics |
| `C2` | `accept dialog` (`step:accept`) | ui | two states of one click — nothing armed leaves `#bulk-delete-state` at `cancelled`, one `accept dialog` leaves it at `cancelled-final` | a handler that stays armed, and a step that arms nothing |
| `C3` | `run … iterations` (`step:run`) | workload | exactly 60 arrivals on `/shared` and exactly 60 on `/per-user`, counted by the server, under `--workers 1` and `--workers 4` alike | a mis-paced or miscounted generator that still reports green, and a dropped `per user` |

### `C1` — the soft assertion records a failure and keeps going

**Target.** `apiV2/src/soft-check/` — `GET /v1/soft-check/known-answer`, a frozen six-field payload
with no seed or database behind it. **Plant.** `tests/.constructs/soft-check-known-answer.tflw`,
which asserts six things of which exactly two are deliberately false.

The known answer is three-valued, and that is the point — a summary line cannot tell these apart:

| what `check` does | rows in the report | trailing `expect` | verdict |
|---|---|---|---|
| records and continues — **correct** | 6, two failed | ran, passed | FAIL, 2 of 6 |
| fails fast like `expect` | 4, one failed | never reached | FAIL, looks the same |
| records nothing | 6, none failed | ran, passed | PASS — silently wrong |

The payload is a constant rather than seed data on purpose. `B6-15` is the standing record of what a
shared fixture id costs when it drifts: a 98% k6 failure at `M48` and a 100% tflw failure on
2026-08-05. A plant whose expected value can change without anybody editing the plant is not a known
answer. `body.truthy` and `body.falsy` are the endpoint's own statement of the answer, so the two
deliberate falsehoods are asserted against numbers the payload itself carries.

### `C2` — the dialog handler is armed, and is one-shot

**Target.** `webV2/admin`'s bulk out-of-stock delete, whose form runs two `confirm()`s in one
short-circuited handler and records which one it stopped at. **Plant.**
`tests/.constructs/dialog-one-shot.tflw`.

`accept dialog` arms a **one-shot** handler; without it Playwright dismisses every dialog silently.
A single-confirm flow can only distinguish *armed* from *not armed*, so it proves the step fires and
says nothing about how long it stays armed. Two confirms give three outcomes, and **tflw can reach
exactly two of them**:

| arming | dialog 1 | dialog 2 | `#bulk-delete-state` | products |
|---|---|---|---|---|
| none — *the control* | dismissed by default | never shown | `cancelled` | intact |
| `accept dialog` once — *the plant* | accepted by the handler | dismissed by default | `cancelled-final` | intact |
| `accept dialog` twice | accepted | accepted | (navigates) | **unreachable — `M154b-02`** |

The claim is the **pair**, not either row. Same page, same button, different arming, different
state: a step that armed nothing would leave `cancelled` both times, and a handler that stayed armed
past its first dialog would navigate away and produce neither. Taken alone the control measures
Playwright rather than tflw, and taken alone the plant cannot rule out a sticky handler.

Without the status line the two would be indistinguishable from outside the browser — nothing was
deleted either way — and the assertion would hold whether or not `accept dialog` did anything. That
is a vacuous check, the class `M141`/`D538` spent an order of the ledger removing, and it is why the
status line is part of the feature rather than scaffolding: a two-step destructive confirmation that
tells you which step you are on is the honest form of it (`D729`).

The bulk action is scoped to `stock === 0` **and** to the list page's own filter, in both
directions. A plant that damages the fixtures every other test reads is not a plant, it is an
outage.

**Two findings came out of this row's first run, and neither is worked around.**

- **`M154b-02` (S3)** — the third state is *unreachable*, not merely unasserted.
  `BrowserPageState.armedDialog` is a single slot rather than a queue, so two consecutive
  `accept dialog` steps arm one handler; and the two dialogs arrive from a single `click`, so there
  is no step boundary at which to arm again. Nothing refuses the program, so tflw accepts a script
  and silently does not do what it says. Asserting it here would be a plant that is *wrong* rather
  than a plant that is *blocked* — the distinction `D734` exists to keep visible — so it is a ledger
  row and this file grades what the language actually promises.
- **`M154b-01` (S4)** — the two `dismiss dialog` uses already in this repository are vacuous by
  construction, and this milestone does not fix them because they may not be fixable in the tests:
  Playwright's default *is* dismissal, so no observable distinguishes the step from its absence.
  Filed rather than quietly rostered, which is why `step:dismiss` stays on the ratchet.

One more thing this row cost, worth carrying: the plant first used `unique("C2 Dialog Plant")` for
its fixture prefix and collided with its own previous run. `unique("prefix")` promises
collision-safety *"across tests/workers/retries"* and that list does not include **runs** — it is a
run-scoped counter, and the database survives between runs. tflw's contract says exactly what it
covers; the plant had assumed one word more. `unique uuid` guarantees distinctness and is what the
plant uses now.

### `C3` — count-bounded load lands exactly the count it was given

**Target.** `tflw-acceptance/conformance/arrival-server.mjs` — a standalone counter, no database, no
Docker stack, nothing else able to move the number. **Plant.**
`tflw-acceptance/conformance/iterations.tflw`.

`tflw spec` states the contract in one sentence: *count-bounded load with no duration; the count is
exact and independent of `--workers`*. Every word of that was unchecked, by anything, ever — the
construct had **zero occurrences** across 126 files.

The count is read from the server's own arrival counter and never from tflw's report. Grading a
generator against its own iteration counter is circular: one that issued 47 requests and reported 60
would pass. This is `D726`'s bar — *the generator is graded against physics, not against its own
report* — one milestone early, in the only form that fits a shared CI runner.

| spelling | arithmetic | path | expected arrivals |
|---|---|---|---|
| `run 60 iterations across 6 users` | 60 total, shared among 6 VUs | `/shared` | 60 |
| `run 12 iterations per user across 5 users` | 12 each, 5 VUs | `/per-user` | 60 |

Equal totals by unequal routes, on distinct paths, so neither spelling can be satisfied by the
other's traffic: a build that dropped `per user` would land 12 on the second path, and one that read
the first as per-user would land 360 on the first.

**Why this shape and not the other four.** `D727` sends arrival-*curve* grading to a scheduled
`fedora-box` run, because a shared GitHub runner cannot produce a trustworthy curve — `ramp`,
`hold`, `step` and `spike` are all claims about *when* requests arrive, and a contended runner
smears timing. `run N iterations` is the one shape whose ground truth is a **count**, and a count is
exact under contention: a saturated CPU makes 60 requests arrive late, never 59. That is why it can
gate on every PR while the other four wait for `M154e`.

## Blocked plants (`D734`)

A plant that goes red because tflw is genuinely broken **keeps its row**, gets a row in tflw's
ledger, and is marked `blocked-on:<row>` here — counted as *covered but currently failing for a
known reason*, never deleted and never quietly moved to the ratchet. Without this convention, this
ledger's successes and its bugs look identical.

**None at present.** All three plants pass against tflw `5cba2da`, measured on `fedora-box`
2026-08-25: `C1` recall 4/4 precision 2/2, `C2` recall 4/4 precision 1/1, `C3` recall 5/5
precision 4/4.

`M154b-02` is deliberately **not** a `blocked-on` marking. `D734` reserves that for a plant that
goes red for a known tflw defect, and `C2` is green; the defect sits beside the plant, not under it.
Recording an unreachable language case as a blocked assertion would make this row look like
outstanding work when what it actually is, is a gap with a ledger row.
