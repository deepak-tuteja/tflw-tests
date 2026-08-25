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
program under test cannot disagree. Since tflw's `M154c` that is **178 constructs**: 12
declarations, 37 step keywords, 18 matchers, 15 generators, 6 locators, 24 config words, 66
diagnostic codes.

It was **166** one milestone ago, and the twelve that arrived are worth a sentence because they are
not new language. `M154a` built the manifest out of six tables and shipped without a seventh: the
declaration dialect — `test`, `crawl`, `action`, `import`, `use`, `before`, `after`, and the five
`test`-header clauses — was simply absent. Under `D723` and `D724` together that made a whole
dialect one this gate **could never go red for**, including two constructs `M154c` was scoped to
plant. tflw added the family as `D742`; the ratchet ceiling went up by twelve and back down by nine
in the same milestone, which is the one direction that pin exists to make loud, so the arithmetic is
written out beside it in `scripts/lib/constructs.mjs`.

Three of the twelve ids name a construct the language spells differently — `tags` is `@…`,
`with-each` is `with each`, `concurrency` is `parallel`/`sequential`. They are **ids, not keywords**,
and tflw's own vocabulary guard refuses to let them be written as keywords.

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
| `C4` | `retry N` (`declaration:retry`) | api | both keys attempted **exactly 3 times** — one settles inside the budget, one is stopped one short of the answer it wanted — and the pre-failure step ran 3 times | an off-by-one retry budget, an unbounded retry, and a step-level retry wearing a test-level spelling |
| `C5` | `after` / `after file` (`declaration:after`) | api | `c5-after-file` == 1 and `c5-after-test` == **2**, over a file whose second test ends red on purpose | a teardown that silently does not run, and the two hook scopes collapsing into one |
| `C6` | `request fails` (`matcher:fails`) | api | passes against a closed port; **must not** pass against a server that answered 503, and the red must land on that line | a `fails` matcher that has drifted from the transport layer up to the status code |
| `C7` | `request connects` (`matcher:connects`) | api | the exact inverse of `C6` on the same two requests | a `connects` that is a tautology, and the pair drifting apart |
| `C8` | `base64 encode/decode` (`generator:transform-base64`) | api | `TTE1NGMgeMO/Pz5+YStiL2MgZD1l` — an output carrying **both** `+` and `/`, the two characters the URL-safe alphabet spells differently | an alphabet swap, which every round-trip test here passes |
| `C9` | `hex encode/decode` (`generator:transform-hex`) | api | 21 UTF-8 bytes to 42 **lowercase** digits, `ÿ` as `c3bf` | an uppercase drift, and a character-level transform mistaken for a byte-level one |
| `C10` | `url encode/decode` (`generator:transform-url`) | api | `encodeURIComponent`: space is `%20` not `+`, `~` is left alone, `+`/`/`/`=` are all escaped | form-urlencoding and `encodeURI`, the two near-misses a round trip cannot see |
| `C11` | `matches file` (`matcher:matches-file`) | api | two **34-byte** files, `A U+00A0 B` against `A SP SP B` — the first comparison passes, the second must fail | a matcher that has stopped comparing bytes, which no existing use could notice |
| `C12` | `give` (`step:give`) | api | the action's own `first`, and not `caller-value`, `EUR`, or a missing suffix — three named wrong answers, one assertion each | a `give` returning the wrong value rather than no value |
| `C13` | `button "…"` (`locator:button`) | ui | `button/true` — a link, a `menuitem` and a bare `<div>` carry the identical text and each writes its own token | a `button` locator that stopped resolving by role |
| `C14` | `text "…"` (`locator:text`) | ui | `text/true` — the phrase also sits in a `value`, an `alt`, a `title` and an `aria-label`, and none of them may match | a `text` locator that widened past rendered text content |
| `C15` | `field "…"` (`locator:field`) | ui | the `<label>` input holds `GLASGOW` and the placeholder decoy still holds `UNTOUCHED` — `D6`'s cascade order, which nothing else grades | a reordered or short-circuited `field` cascade |
| `C16` | `list "…"` (`locator:list`) | ui | `list/items` then `list/suppliers`, from two lists holding the identical button name | a `list` locator that resolves any role=list rather than the named one |
| `C17` | `css "…"` (`locator:css`) | ui | `css/3` — the third of four siblings identical in text and role | a `css` locator that stopped honouring structural position |
| `C18` | `xpath "…"` (`locator:xpath`) | ui | `xpath/4`, from an expression opening with `(` so Playwright's `//` auto-detect cannot stand in for the `xpath=` prefix | a dropped `xpath=` prefix, which a `//`-leading expression cannot see |
| `C19` | `within` (`step:within`) | ui | the inner `button "Remove"` is ambiguous at page scope, so a lost scope is a red step rather than a wrong element | a `within` that resolves its scope and then searches outside it |
| `C20` | `click` (`step:click`) | ui | the readout starts at `none` and only a really-dispatched click ever changes it — six clicks, six different elements | a `click` that waits for a locator and never fires the event |
| `C21` | `fill` (`step:fill`) | ui | read back from **both** inputs by id: the right one filled, the wrong one not | a `fill` that types into the wrong element, or into both |
| `C22` | `has value` (`matcher:has-value`) | ui | `GLASGOW` on one input and `UNTOUCHED` on the other — a pair, so an unconditional true fails the second | a `has value` that always passes, or that reads the attribute instead of the property |
| `C23` | `open` (`step:open`) | ui | `/orders/{orderId}` — the one path whose target the test creates first, so a dropped interpolation 404s and a no-op stays on the login page | an `open` that does not interpolate, or does not navigate |
| `C24` | `double click` (`step:double`) | ui | the Quick View modal ends **hidden** — the second click lands on the backdrop the first one opened | a `double click` that is one click, or one synthetic gesture |
| `C25` | `right click` (`step:right`) | ui | the add-to-cart toast never appears, because the secondary button dispatches `contextmenu` and never `click` | a `right click` implemented as `click` |
| `C26` | `press` (`step:press`) | ui | the modal is asserted open on the step **immediately** before the key and closed on the step after — adjacency, after a repair | a `press` that types its key name instead of pressing it, and an assertion something else satisfies |
| `C27` | `select` (`step:select`) | ui | one search term, two categories: `has count 0` under Books and `has count 1` under Electronics | a `select` that no-ops, or selects by index rather than by option text |
| `C28` | `tick` (`step:tick`) | ui | `not is checked` before, `is checked` after, read off the control rather than off the click | a `tick` that clicks without settling, or asserts nothing about state |
| `C29` | `untick` (`step:untick`) | ui | back to `not is checked`, from a state the previous assertion proved it was really in | an `untick` that no-ops on an already-checked control |
| `C30` | `is checked` / `is visible` / `is hidden` (`matcher:state-word`) | ui | the same subject asserted in both states within one test, so neither a stuck answer nor a broken `not` survives | a state matcher stuck at one answer, or a broken `not` |
| `C31` | `drag … to …` (`step:drag`) | ui | both cart rows asserted by name **and** by position after the drag, with the names read from the API first | a `drag` that fires no drop, or reorders something else |
| `C32` | `drop file … onto …` (`step:drop`) | ui | `sample.csv` echoed back by a zone with no file input to fill and no click that would open one | a `drop` with an empty or missing file payload |
| `C33` | `stub` (`step:stub`) | ui | two stubs on one URL that disagree — `GET` 200 `tok_wrong_method` against `POST` 500 — and the POST must win | a `stub` that ignores the method, or that never intercepts |
| `C34` | `matches snapshot` (`matcher:matches-snapshot`) | ui | one state change, four assertions: unmasked catches it, masked absorbs the same one | a snapshot compare that always passes, and a `mask` clause that is decorative |
| `C35` | `has no a11y violations` (`matcher:has-no-a11y-violations`) | ui | clean on the happy path, red on `/a11y-demo`, and `not has no **moderate**` passes although zero violations are tagged moderate | a scanner that never fires, and a severity filter that matches exactly instead of as a floor |
| `C36` | `switch to new tab` / `switch to tab N` (`step:switch`) | ui | the popup wait goes red unaided; `switch to tab 1` is then graded by a heading that exists on tab 1 and not on the receipt PDF | a `switch to new tab` that misses the popup, and a `switch to tab N` that stays put |
| `C37` | `close tab` (`step:close`) | ui | closing tab 2 leaves an assertion that only holds on tab 1 — so closing the wrong one, or none, both fail | a `close tab` that closes the wrong tab, or none, or does not restore focus |
| `C38` | `download as` (`step:download`) | ui | the bound name is `orders-export.csv`, which comes from apiV2's `Content-Disposition` and appears nowhere in the markup | a `download as` that binds the wrong string, or the right one by coincidence |

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

### `C4` — the retry budget is bounded at both ends, and it re-runs the whole test

**Target.** `apiV2/src/lifecycle/` — a per-key attempt counter and a mark counter, read back from
`GET /v1/lifecycle/counts` after the run. **Plant.** `tests/.constructs/retry-attempt-budget.tflw`.

`retry N` is not an unexercised construct — it has five occurrences, and
`tests/api/mechanics/retry-and-flake.tflw` asserts a real recovery. The `D739` distinction is the
whole point here: what those uses cannot see.

| defect | `retry-and-flake.tflw` | this plant |
|---|---|---|
| retry never retries | **red** | red |
| `retry N` means *N total attempts* | green — settles on attempt 3 either way | **red** — `c4-settles` never reaches 200 |
| retry ignores its budget entirely | green — it succeeded, eventually | **red** — `c4-exhausts` would pass |
| only the *failing step* re-runs | green — same endpoint, same count | **red** — `c4-preamble` stays at 1 |

Two keys, deliberately: `c4-settles` answers 200 on attempt 3 and `c4-exhausts` on attempt 4, so the
budget is pinned from **both** sides. One key alone is satisfied by either of the first two defects.

The third row is what `c4-preamble` is for. It is marked by the step *before* the one that fails, so
a test-level retry drives it to 3 and a step-level retry leaves it at 1 — and `SPEC` §4.4 says "re-runs
the whole test". Every flaky endpoint in this repository settles on attempt 3 under either reading,
which is why no existing file could tell them apart.

tflw's own `attempts[]` is checked too, against the server's counters. Not as the bar: a
disagreement between the report and the arrivals is a different and more interesting defect than
either being wrong alone. `SPEC` §4.4's *flaky, never silently green* clause is asserted for the same
reason — a pass after retrying that reported a plain pass would satisfy every count above.

### `C5` — teardown runs in both scopes, and runs for the test that failed

**Target.** `apiV2/src/lifecycle/` again, two labelled counters. **Plant.**
`tests/.constructs/after-hook-scopes.tflw`, whose second test ends red on purpose.

This row exists because of a specific, checkable claim about the existing evidence:
`tests/examples/hooks-explained.tflw` has an `after` hook that deletes what its test created, and
**if that hook simply never ran, nothing in that file would fail.** The test has already passed; the
cleanup is invisible to it. It is a construct exercised in a way that cannot go red in the direction
that matters — `D722`'s bar stated as a defect rather than as a policy.

So the hooks here do not clean anything up. They mark a counter, and two integers separate three
defects:

| what `after` does | `c5-after-file` | `c5-after-test` |
|---|---|---|
| both scopes correct | **1** | **2** |
| never runs | 0 | 0 |
| skips the failed test | 1 | 1 |
| `after file` is really test-scoped | 2 | 2 |

The middle row is the clause `tflw spec` states for this construct — *runs whether the test passed or
failed* — and nothing in this repository had ever observed it, because nothing had ever put a
deliberately red test under a hook and then looked.

The grader also asserts that this plant attempted **no** settle key at all. That is not idle: it is
the proof that the `before file` reset really ran, and therefore that `C4`'s counters above were
`C4`'s own. Both plants use fixed names, so their runs are read back in order and never batched.

### `C6`, `C7` — the transport boundary, asserted from both sides

**Target.** port 9 under `env unreachableHost` (the discard port, guaranteed closed), and
`/flaky-widget`'s first-attempt 503 under `env local`. **Plants.**
`tests/.constructs/request-fails-unreachable.tflw` and `request-fails-live-control.tflw`.

`SPEC` §6.2.2 puts these two matchers at the **transport** layer: either the request reached a server
and came back, or it did not. `tests/.env-specific/unreachable-host.tflw` has proved the positive
half since `M29`. The half nobody had asserted is the one that makes the matcher mean anything —
**an HTTP error response is not a request failure.**

A `fails` that treated any non-2xx as a failure passes every existing test in this repository, the
closed-port one included, while quietly reclassifying every 4xx and 5xx in the suite as a connection
problem. So the control runs against a server that is very much up and answering 503.

|  | closed port | live 503 |
|---|---|---|
| `expect request fails` | passes | **must fail** |
| `expect request connects` | **must fail** | passes |

Neither run alone says anything: the first column is satisfied by a `fails` that always passes, the
second by a `connects` that never fails. The claim is the 2×2, which is why `matcher:connects` is
rostered here as its own row rather than left on the ratchet — the plant already grades it, and it
costs one row to say so.

**The control is three `api` calls, not one, and `tflw check` is why.** `TF031` refuses `expect
status` on the same request as `connects`/`fails` — *"there is no response to check once a
connection-level failure is being asserted on"* — which is correct, and was found by running the
checker over the first draft of this plant. Each claim therefore gets its own request to its own
fresh key, every one a first attempt and so every one a 503.

The grader reads **which step** failed rather than the exit status. A file that goes red for the
wrong reason and one that goes red for the right reason are indistinguishable from outside.

### `C8`, `C9`, `C10` — the value transforms, against literals rather than against each other

**Target.** none. **Plant.** `tests/.constructs/value-transforms.tflw`.

This is the one plant in the ledger with no endpoint behind it, and that is a deliberate departure
from `D725` recorded as `D743`: these are pure value transforms (`SPEC` §7.6), so a server hop would
prove the HTTP client works and nothing whatever about the transform.

All six directions are already exercised, in
`tests/api/mechanics/actions-and-helpers.tflw`, like this:

```
let hexed = hex encode("{tag}")
let unhexed = hex decode(hexed)
```

**That is a round trip, and a round trip holds for any pair of mutually inverse functions —
including a wrong pair.** A `base64` on the URL-safe alphabet round-trips perfectly. A `url encode`
emitting form-urlencoding round-trips perfectly. Six constructs, twelve lines of evidence, and not
one of them can go red for a wrong encoding.

So every line in the plant compares against a **hand-written literal**, and the encode and decode
directions are checked against *separate* literals rather than against each other — a pair that is
wrong in the same direction twice cannot pass. One input, `M154c xÿ?>~a+b/c d=e`, chosen so that
each transform's most plausible wrong implementation produces a visibly different answer:

| construct | the known answer | the wrong answer it rules out |
|---|---|---|
| `base64 encode` | `TTE1NGMgeMO/Pz5+YStiL2MgZD1l` | `…eMO_Pz5-…` — the URL-safe alphabet |
| `hex encode` | `4d3135…3d65`, lowercase, `ÿ` as `c3bf` | uppercase; a character-level transform |
| `url encode` | `M154c%20x%C3%BF%3F%3E~a%2Bb%2Fc%20d%3De` | `+` for space, `%7E` for `~`; `encodeURI` |

**Two of the three are derived and one is pinned, and the difference is worth stating.** `SPEC` §7.6
names `encodeURIComponent` outright, so `url` needed no judgement. `base64`'s alphabet is derivable
from the other end — `TF054` refuses a URL-safe literal to `base64 decode`, so an `encode` emitting
one would produce output its own `decode` rejects. **`hex`'s case is pinned by this plant and by
nothing else**: `SPEC` §7.6 does not state it. That is filed as `M154c-02` in tflw rather than
asserted here as though it were specified, because a plant that quietly promotes an implementation
detail to a contract is how a spec gap becomes invisible.

The grader asserts the literal is still present in the file, character for character, as well as
that the tests pass. That second half is what stops the plant being weakened into a tautology later.

### `C11` — byte equality that actually discriminates

**Target.** `apiV2/src/uploads/`, round-tripping a committed golden file. **Plant.**
`tests/.constructs/bytes-near-miss.tflw`, whose second test ends red on purpose.

`tests/api/orders/file-formats.tflw` has used `matches file` on CSV, TXT and PDF since `F2`, and
those uses are real — they would catch a corrupted round trip. What they cannot show is that the
matcher **discriminates**, because every one of them compares a file against itself. A `matches
file` that returned true unconditionally passes all three; so does one that compares lengths, or
content types, or the first sixteen bytes.

| file | bytes | length |
|---|---|---|
| `constructs-golden.txt` | `… A` `C2 A0` `B` | 34 |
| `constructs-near-miss.txt` | `… A` `20 20` `B` | 34 |

**Identical length, two bytes different, and indistinguishable in every editor and every diff.** A
length check passes it, an eyeball passes it, and byte equality is the only thing that fails. The
day the second test goes green, this matcher has stopped comparing bytes — and `file-formats.tflw`
would not notice.

### `C12` — `give` returns the named value, not the two others in reach

**Target.** `apiV2/src/soft-check/` — `C1`'s frozen constant, reused so that no seed, fixture or
other test's data is involved. **Plant.** `tests/.constructs/action-give.tflw`.

`give` has three occurrences here and exactly one live one: `tests/shared/catalog.tflw`'s `give id`,
whose value the caller uses as a path segment. That *can* fail — a `give` returning nothing produces
`/products/` and a 404 shortly after. What it cannot distinguish is **which** value came back, and
`SPEC` §8 is specific: `give <expr>` returns the expression, resolved in the action's own scope.

So the action gives `first` and captures `second` *afterwards*, and the caller binds a variable
called `first` too, to a different string. Three named wrong answers, one assertion each:

| if `give` were… | it would return | asserted against |
|---|---|---|
| resolved in the caller's scope | `caller-value` | `expect {got} equals "known-answer"` |
| "the most recent capture" | `EUR` | `expect {got} not equals "EUR"` |
| dropping its parameter | `-echoed` | `expect {got} equals "M154c-echoed"` |

And `expect {first} equals "caller-value"` closes the loop in the other direction: the call left the
caller's own binding alone. Actions are file-scoped with no globals (`P#17`), so a leak in either
direction turns one of those four lines red.

### `C13`–`C22` — the locator near-miss harness

**Target.** `webV2/src/pages/LocatorFixturePage.tsx`, at the public route `/locator-fixture`.
**Plant.** `tests/.constructs/locator-near-miss.tflw`, one test, ten rows.

Ten rows from one artifact because six locators and three steps are not separable: you cannot grade
`within` without a locator to scope, or `fill` without knowing which input received the text.

**What was wrong before it existed.** `button`, `text`, `css` and `field` carry **93, 92, 69 and 65**
uses between them — four of the most-used constructs in this repository — and not one of those uses
could tell *resolved the right element* from *resolved an element*. Every one of them names something
that is unique on its page, so a `button` locator that had quietly degenerated into a text search
passes all ninety-three. `list` and `xpath` were at **zero**, and so was `has value`.

**Why it is a fixture page.** `D729` orders real flows first and this is the fallback it allows, for
a reason specific to locators: the plant has to grade that the locator resolved *this* element and
not a plausible neighbour, and that needs a **deliberate** near-miss — a link wearing a button's
text, a placeholder colliding with another field's label, four identical buttons where only the
third is the answer. A storefront that shipped those collisions would be a bug in the storefront.
The precedent is `RenderFixturePage.tsx` (M45), which exists for the same shape of reason.

**How a wrong resolution is observed.** Every candidate on the page — the true target *and* every
decoy — writes its own token into `#locator-readout` when interacted with. A locator that lands on a
decoy therefore does not fail by not-found; it fails by reporting **the decoy's token**. The wrong
answers are named, not merely absent, which is the same bar `C12` sets for `give`.

Three of the ten are worth reading on their own:

| row | the near-miss, and why it is not obvious |
|---|---|
| `C15` | `field` is a closed three-step cascade — label, then placeholder, then `role=textbox` — checked in that **fixed priority** every poll (`D6`, `browser.ts:579`). Two inputs answer to "Ship to". **An order that flipped would pass all sixty-five existing `fill field` uses**, because no other page in this repository collides a label with a placeholder. |
| `C18` | Playwright auto-detects a selector beginning with `//` or `..` as XPath. So an implementation that dropped `browser.ts:590`'s `xpath=` prefix would still pass an xpath test written the usual way — the auto-detect silently stands in for it. The expression here opens with `(`, which is parsed as CSS if the prefix is missing. |
| `C19` | Twenty-five `within` uses existed and none could fail for the right reason: each scopes to a container whose inner locator resolves uniquely on the whole page anyway, so a `within` that scoped to nothing passes them all. Here the inner name is ambiguous at page scope, and tflw hard-errors on N>1 (`D7`). |

**The decoy input in `C14` is deliberately `type="text"`.** Playwright's text engine matches
`input[type=button]` and `input[type=submit]` by their `value` **by design**, so "fixing" that decoy
into a submit would turn a correct engine red. The page says so at the decoy.

**Every one of the ten was run in its failure direction** before being rostered, on `fedora-box`
against the same stack: a probe flipped each assertion to the decoy's own token — `button/decoy-link`
for `C13`, `css/1` for `C17`, the placeholder input for `C15`, and the control after a click for
`C20` — and all nine went red, 0/9 passed.

`C19`'s failure direction is the one that is **not** a flipped token, and it is the only one kept in
the plant rather than recorded here. The plant's second test clicks the same inner locator with the
`within` removed, and must end red on ambiguity; the grader asserts the failure is an ambiguity error
naming **exactly two** matches, not a not-found and not a timeout. It is kept because `C19` is the
row whose twenty-five pre-existing uses could not fail for the right reason — leaving its only proof
in prose would repeat precisely that mistake. The same reasoning `C11` follows for `matches file`.

### `C23`–`C38` — the UI tier's real flows

**Targets.** The webV2 storefront and the admin console, unchanged. **Plants.**
`tests/mixed/storefront.tflw` (fifteen rows) and `tests/.env-specific/webv2-admin.tflw` (one).

Sixteen rows and **no new target-app surface at all** — the opposite of `C13`–`C22`, and the reason
`D729` puts real flows first. Every construct here already had a flow that already went red for the
right reason, built by `M40`, `M41`, `M43` and `M48`. What was missing was never the exercise. It was
the **written-down known answer**, and in three cases (`C24`, `C25`, `C38`) the answer was sitting in
a test comment that no gate read.

**Exactly one assertion was added to the whole batch.** `download as file` ended
`webv2-admin.tflw` with nothing after it, under a comment claiming the step binds "the exact filename
apiV2's own `Content-Disposition` sets". The mechanics half was already graded — the step waits on a
real `download` event and goes red unaided if the link merely navigates — but the *binding* half was
prose. `expect {file} equals "orders-export.csv"` is now `C38`, and the literal is load-bearing: the
link reads "Download orders CSV" and points at `/orders/export`, so a step that bound the anchor text
or the URL's last segment fails an assertion that passes today.

**Three of these known answers are an absence, and that is what makes them sharp:**

| row | the answer, and why the negative is the strong form |
|---|---|
| `C24` | The Quick View modal ends **hidden**. Playwright resolves the target position once, so both clicks land on the same point; the first opens the modal, whose full-viewport backdrop then covers that point, and the second closes it. So `is hidden` passes only if two *separate* clicks hit a DOM that changed between them. A step that coalesced them into one gesture leaves the modal open. |
| `C25` | The add-to-cart toast never appears, because browsers reserve the secondary button for `contextmenu` and dispatch no `click` at all. That makes the single likeliest regression — `right click` degenerating into `click` — the one thing this row catches. The absence is not an absence of everything: an ordinary click on the same control raises that toast elsewhere in the same file, and the grader checks it. |
| `C35` | `not has no **moderate** a11y violations` passes although **zero** violations on `/a11y-demo` are tagged moderate — only serious and critical exist. It therefore holds under genuine floor semantics and fails under exact-match, which no other severity assertion in the file distinguishes. |

**Evidence pointing outside `tests/.constructs/` is deliberate, and it carries a risk this ledger has
to answer for.** A plant living in an ordinary suite file can be edited by work that has never heard
of this roster — and the dangerous edit is not deleting the step, it is *loosening the assertion while
the step stays*. The static gate would not notice `C24`'s `is hidden` flipped to `is visible`. So the
acceptance grader checks the **shape** of each known answer, not just its colour: that `C24` asserts
hidden and nothing asserts visible, that `C27` still has one count-0 case beside its count-1, that
`C30`'s three state assertions still bracket the tick and the untick in that order, that `C33`'s GET
near-miss still answers 200 while the POST row answers 500, that `C37`'s close still happens with
tab 2 in front. `C3` set the precedent for evidence outside `.constructs/` by pointing at
`tflw-acceptance/conformance/iterations.tflw`.

**Every one of the sixteen was run in its failure direction**, on `fedora-box` against the same
stack, before being rostered. A generated probe took one flipped copy of each real test — the
opposite state word, a missing key, the count-0 case turned positive, the drag asserted not to have
moved, `has no moderate` without its `not`, `equals "export"` for the download.

**Fifteen went red. `C26` went green, and that is the finding of this batch.** The probe deleted
`press "Escape"` from a test named *"…and closes on Escape"* and the test still passed, because
`ProductQuickViewModal.tsx`'s `handleAdd` calls `onClose()` on a successful add — the modal was
already gone before the key was ever sent. The `press` and the `expect button "Close" is hidden`
after it had been sitting there since `M43` asserting nothing, and no gate could have said so:
the step is present, the assertion is present, the test is green, and the *cause* is a line in a
React component. It is exactly `D722`'s could-fail bar failing in the field, and it is the second
time this arc has found one (`M154c`'s `check` at scale was the first).

The repair is three lines in the same test rather than a new fixture: record the close the add
already performed, re-open the modal, *then* press the key. `handleKeyDown` has always had the
Escape branch — it had simply never been the thing under test. Re-probed after the repair, and the
same deletion now goes red. `C26`'s grader assertion is **adjacency**, not presence: the step
immediately before the key must prove the modal open, because a first-match search for "is visible"
anywhere earlier would still pass on the old, vacuous shape.

**Cost, for `D732`'s sake.** One `tflw run` of `tests/mixed/storefront.tflw` — 16 tests, **18.4 s** on
the box — grades fifteen of the sixteen rows. `C38` needs its own run because `web` is one base URL
per env (SPEC §3.2) and the admin console lives on its own port; that one is 0.5 s plus start-up. The
per-construct cost of this batch is therefore roughly a second apiece, against `C13`–`C22`'s new page,
new plant and new grader.

## Blocked plants (`D734`)

A plant that goes red because tflw is genuinely broken **keeps its row**, gets a row in tflw's
ledger, and is marked `blocked-on:<row>` here — counted as *covered but currently failing for a
known reason*, never deleted and never quietly moved to the ratchet. Without this convention, this
ledger's successes and its bugs look identical.

**None at present.** All thirty-eight plants pass, measured on `fedora-box` 2026-08-25 — the first
three against tflw `5cba2da`, `C4`–`C12` against the `M154c` build that added the `declaration`
family, and `C13`–`C38` against `M154c`'s `main`.

`M154b-02` is deliberately **not** a `blocked-on` marking. `D734` reserves that for a plant that
goes red for a known tflw defect, and `C2` is green; the defect sits beside the plant, not under it.
Recording an unreachable language case as a blocked assertion would make this row look like
outstanding work when what it actually is, is a gap with a ledger row.
