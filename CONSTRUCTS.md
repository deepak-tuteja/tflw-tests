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

## Blocked plants (`D734`)

A plant that goes red because tflw is genuinely broken **keeps its row**, gets a row in tflw's
ledger, and is marked `blocked-on:<row>` here — counted as *covered but currently failing for a
known reason*, never deleted and never quietly moved to the ratchet. Without this convention, this
ledger's successes and its bugs look identical.

**None at present.** All twenty-two plants pass, measured on `fedora-box` 2026-08-25 — the first
three against tflw `5cba2da`, `C4`–`C12` against the `M154c` build that added the `declaration`
family, and `C13`–`C22` against `M154c`'s `main`.

`M154b-02` is deliberately **not** a `blocked-on` marking. `D734` reserves that for a plant that
goes red for a known tflw defect, and `C2` is green; the defect sits beside the plant, not under it.
Recording an unreachable language case as a blocked assertion would make this row look like
outstanding work when what it actually is, is a gap with a ledger row.
