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

**A row may cite a gate instead of carrying its own plant (`D751`), and one such row may cover a
whole family (`D763`).** That is a narrowing of *no row without a plant*, not an exception to it:
the plant still exists, it is just somebody else's and it is better than the one this ledger would
have written. Three conditions, all three machine-checked rather than promised — the cited gate is
tracked, it is **gated**, and it derives its expected set from tflw's manifest rather than from a
list of its own. `C51`–`C58` cite three such gates one construct at a time; `C59` cites one for
sixty-six at once.

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
| `C39` | `hover` (`step:hover`) | ui | `onMouseEnter` and `onClick` write **different** tokens to one readout, and the test clicks the same button to show the wrong answer is reachable | a `hover` that is a click, and a `hover` that is a no-op |
| `C40` | `scroll to` (`step:scroll`) | ui | an `IntersectionObserver` below a 2400px spacer, latched — because Playwright visibility ignores the viewport, so `is visible` on the marker would pass unscrolled | a `scroll to` that resolves the element and never scrolls |
| `C41` | `screenshot` (`step:screenshot`) | ui | graded from the **report**, not the run: `captured` at `evidence full`, `not captured (evidence level)` below it, and the PNG's own IHDR reads 1280x720 | a step that reports a capture it did not make, and evidence gating that stopped working |
| `C42` | `viewport` (`config:key:viewport`) | ui | a pair across two configs — 1280x720 unconfigured, 900x600 under a corpus config that sets it; differing in **both** dimensions | a `viewport` key that is parsed and never reaches `newContext` |
| `C43` | `dismiss dialog` (`step:dismiss`) | ui | the step is indistinguishable from its absence, so the plant grades the **arming it overwrites**: `accept` → `dismiss` → one click must leave `cancelled` | a `dismiss dialog` that does not arm, which no direct observation can detect |
| `C44` | `ramp` (`step:ramp`) | workload | a triangle is half its rectangle: `ramp to 50 rps over 4s` lands ~100 where `hold` at the same rate and duration lands ~200 | a ramp implemented as a hold, and a ramp that starts at its target |
| `C45` | `hold` (`step:hold`) | workload | at full rate by its **second** 500ms bin — "a flat target … with no ramp-in" is the claim, and ramping is the only way to be wrong while landing the right total | a hold that ramps in, and a steady rate that drifts |
| `C46` | `step` (`step:step`) | workload | 20/2s + 80/2s lands ~200, **which is what `hold 50 rps for 4s` lands too** — so the totals cannot discriminate and the plateaus and their 1:4 ratio are the claim | a staircase collapsed to its mean rate, or sloped instead of stepped |
| `C47` | `spike` (`step:spike`) | workload | peak >3x baseline **and a tail that returns to it** — the recovery is the half a plain step up would also pass | a spike that holds its burst, and a burst that is a rounding artefact |
| `C48` | `cleanup` (`step:cleanup`) | workload | a marker path sees exactly 8 — one per iteration of the test that opts in, **none** from its sibling that omits the line | teardown running under load unasked (`D26`), and an opt-in that is a no-op |
| `C49` | `threshold` (`step:threshold`) | workload | the same request, the same path, every assertion green — and the test bounded at 10ms is **red** while the one bounded at 5000ms is green | a verdict computed from the steps rather than the aggregate metrics |
| `C50` | `pause` (`step:pause`) | workload | gaps ≥200ms against a <50ms control on an identical path, **and** a reported p50 under 50ms because the column is pause-excluded | a `pause` that is a no-op, and a build that stopped subtracting pacing from duration |
| `C51` | `probe ciphers` (`config:probe:ciphers`) | security | a granted/withheld pair on one rule, against a host that **negotiates a modern suite** — granted, `sec/tls-weak-cipher` fires and names the suites tflw could not offer; withheld, it is silent and the passing assertion carries `judged only the suite this host gave` | a `probe ciphers` that opens no second handshake, and an opt-in honoured where it was not granted |
| `C52` | `probe mutating` (`config:probe:mutating`) | security | two verbs, one probe set, one variable: the `DELETE` is `4 probed — 1 inconclusive, 3 refused` and yields no verdict, the idempotent `PUT` is `4 probed — 2 leaked, 1 inconclusive, 1 refused` and finds the leak | a `probe mutating` that sends nothing while the assertion stays green, and a destructive verb scored as a verdict |
| `C53` | `authorized target` (`config:key:authorized`) | security | three refusals and their three silences before anything is sent — `TF060` on a base the affirmation does not name, `TF065` on a public target with no command-line affirmation, `TF066` on one naming an origin the run never scans | a scan reaching a host nobody affirmed, and an affirmation accepted for an origin the run never touches |
| `C54` | `evidence` (`config:key:evidence`) | security | the same `screenshot` step, no `--evidence` anywhere: `captured` with a 1280x720 IHDR under a config that sets `evidence full`, `not captured (evidence level)` under one that sets nothing | an `evidence` key parsed and never reaching the runtime — `C42`'s defect one key over |
| `C55` | `redact` (`config:key:redact`) | security | five PII values fetched **directly from apiV2**, present in no step's `request.body`, `response.bodyText` or `detail`; each of those three field kinds actually present in the run, including a request body carrying a covered field (`M154g` — until then there was none, on any step, in any run); and `[redacted]` in both `results.json` and `report.html`, so a pattern matching nothing cannot pass by having nothing to leak | a `redact` that stopped covering printed `detail` or stopped reaching `redactRequest`, a ground-truth set that silently shrank, and a vacuously-passing leak check |
| `C56` | `crawl` (`declaration:crawl`) | security | graded by finding **provenance** — each plant reached *via* the crawl — and by the SPA the fetching spider cannot walk, asserted as a named decline with count 1 rather than a silent zero | a crawl that walks the logged-out shell and calls it the surface (tflw `M137f-01`), and a blind spot reported as a zero |
| `C57` | `has no … security violations` (`matcher:has-no-security-violations`) | security | every ledger row names what must fire **and** what is in play at that floor and must be silent; plus `D445` precision (`baseline ∪ plants`, nothing elsewhere) and the `scanCoverage` census that makes silence sufficient | a rule that stops firing, a rule that fires where it should not, and a floor read as a band |
| `C58` | `has no authorization violations` (`matcher:has-no-authorization-violations`) | security | probe sets graded as four numbers, over one human declared three times — cookie+`csrf from` completes, bearer completes, cookie without the clause is `inconclusive` | a probe set silently emptied until nobody can answer, and a destructive verb scored as a verdict |
| `C59` | **the whole `diagnostic` family — 66 codes** (`diagnostic:TF001`…, by rule not by list) | check | every code the installed tflw assigns is provoked by a fixture and asserted to appear in real `tflw check` output, several against the silence they must not break; and the expected set is read out of **tflw's own §17 manifest**, so a code that ships without a fixture here is red on the day it merges | a diagnostic that stops firing, a fixture kept for a retired code, and 66 hand-written rows going stale silently while reading as evidence |
| `C60` | `equals` (`matcher:equals`) | api | `body.price` is `42` and `body.truthy` is `4`, so `not equals 4` is red for an `equals` written as a prefix comparison — the implementation that passes all 1581 other uses here; plus case (`"Known-Answer"`) and whitespace (`"known-answer "`) | an `equals` that folds case, trims, or compares prefixes |
| `C61` | `contains` (`matcher:contains`) | api | `"plan"` is a substring of the element `"plant"` and not an element of `body.tags`, so `not contains "plan"` is red for an implementation that searched the stringified array; the string half is asserted from the middle of the value | a `contains` that searches stringified JSON, and one anchored at either end |
| `C62` | `matches "<regex>"` (`matcher:matches-regex`) | api | every one of the 31 existing uses is a literal, so `String.includes` passes them all — `matches "EUR|USD"` is the one assertion that separates a regex engine from a substring search; `not matches "^eur$"` adds case, `^known-[a-z]+$` adds anchoring | a `matches` implemented as a substring search |
| `C63` | `matches subset {…}` (`matcher:matches-subset`) | api | two keys of seven, so deep equality is red on the positive; the same two keys with `price` off by one, so presence-only or stop-at-first-match is red on the negative | a subset that is really equality, and one that checks presence rather than value |
| `C64` | `matches schema "…" from "…"` (`matcher:matches-schema`) | api | the frozen payload validates against `SoftCheckAnswerDto` out of apiV2's live `/openapi.json`, and is **rejected** by `ProductResponseDto` in the same document — the half that a matcher validating nothing cannot fake | a schema matcher that reports success without validating |
| `C65` | `is greater than` / `is less than` (`matcher:greater-less-than`) | api | all four assertions sit on the boundary of `body.price` = 42 — `> 41`, `not > 42`, `< 43`, `not < 42` — so `>=` masquerading as `>` is red in both directions; no existing use sits within one of its bound | a comparison that is inclusive where the language says strict |
| `C66` | `has count <n>` (`matcher:has-count`) | api | `body.tags` has two elements and the negatives are one either side: `not has count 1` catches `length >= N`, `not has count 3` catches `length <= N` | a `has count` that is a lower bound, an upper bound, or not a count |
| `C67` | `api` (`step:api`) | api | the server counts arrivals per label, so *one step, one request* is a number: `c67once` at exactly 2 for two steps, and the corpus at exactly the 5 marks it declares — all 1139 existing uses assert on the last response, which a duplicate request leaves identical | a step that fires twice, retries silently, or sends a preflight nobody asked for |
| `C68` | `expect` (`step:expect`) | api | a file **meant to fail**: the test marks `c68before`, fails one `expect`, then marks `c68after`, and the known answer is that `c68after` never arrives. Re-run with that one assertion softened to `check`, it **does** arrive — so the absence is caused by `expect` and not by the assertion being false | `expect` degrading into `check`: recording its failure and carrying on |
| `C69` | `capture` (`step:capture`) | api | two halves — the stated contract (a capture of a missing path fails the *step*, and the step after it never runs) and one the manifest does not state: a capture binds at capture time, proven by issuing another request between the capture and its use | a capture that binds `undefined` silently, and one that re-reads the response at use time |
| `C70` | `let` (`step:let`) | api | `let tag = random string 8` used as a label twice: bound-once leaves the server holding **one** label marked twice, re-evaluated-at-use leaves **two** marked once, and every assertion about status is green either way. With a literal on the right-hand side the two implementations are indistinguishable | a `let` that is a macro over its source expression rather than a binding of its value |
| `C71` | `log` (`step:log`) | api | graded from `results.json`, since `log` is never an assertion: `kind: log`, `level: warn`, `destination: both`, and a detail reading `c71 observed c71logged` — the captured `{subject}` resolved | a log line that never reaches the report, loses its level, or is stored unexpanded |
| `C72` | `wait until api` (`step:wait`) | api | `c72settles` answers 503 twice then 200, and three independent readings agree on **3**: the plant's in-band `expect body.attempt equals 3`, the report's own `passed after 3 attempts`, and the server's attempt counter. The first two prove it re-issued; only the third proves it stopped | a `wait` that issues one request behind a long timeout, and one that keeps polling after its condition holds |

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

### `C44`–`C50` — the perf tier: four shapes, the verdict rule, and pacing

Three of the four shapes had **zero** occurrences anywhere in this repository before `M154e`, and
`ramp` — the one with uses — had only ever been graded against tflw's own report of what it did.
`pause` had zero, and arrives here because `M154d` scoped it into the browser tier and `TF033`
refused it: *"`pause` is only legal inside a workload-bearing `test`"*.

Every row is graded against `tflw-acceptance/conformance/arrival-server.mjs`'s recorded arrival
**times**. That file's `D745` argues why the target is a zero-latency counter and **not** apiV2,
which inverts `D726`'s placement in order to keep `D726`'s principle: in the closed model a VU
issues its next request when the last one returned, so a shape graded against a real database
measures the database's lock queue and calls it tflw's spawn schedule. In the open model the
requirement arrives from the other side — the target must never be the constraint.

| row | the answer, and why it is not satisfiable by the neighbouring shape |
| --- | --- |
| `C44` | The discriminator is **arithmetic, not a tolerance.** A linear ramp to the same target over the same duration is the triangle inside `hold`'s rectangle, so it lands half. A build that implemented `ramp` as `hold` doubles the count rather than perturbing it. The opening-bins assertion catches the remaining case — a flat *half*-rate, which lands the right total and the wrong shape. |
| `C45` | Flatness is asserted at the **start**, not on average. `tflw spec` says "with no ramp-in", and ramping is the only way to be wrong about that while still landing 200. |
| `C46` | Its total deliberately **collides** with `C45`'s. 20 rps for 2s plus 80 rps for 2s is 200, and so is a flat 50 rps for 4s — so a grader that only counted would pass a build that had collapsed the staircase into its mean. This is the row where the lazy instrument fails. |
| `C47` | The peak alone is not the claim; a step up has a peak too. The recovery to baseline is what only a spike does, and `tflw spec` calls out that a spike mixes flat and ramped stages in any order — which a two-stage shape cannot demonstrate at all. |
| `C48` | The plant is a **contrast between two sibling tests**, because the count alone means nothing: 8 markers is correct, 0 means the opt-in does nothing, and 16 means teardown ran unconditionally — precisely what `D26` forbids under load. See the note below: this row grades the construct that exists rather than the one the manifest describes. |
| `C49` | Every `expect status equals 200` in **both** tests passes — the server really does answer 200 — and one of them is still red. So the verdict cannot have come from the assertions. The cost of this going unchecked is on the record: 2026-08-05, a perf rung that declared no threshold ran at a 100% error rate and reported PASS. |
| `C50` | Two independent claims. The gap is the obvious one. The second — that tflw's reported duration **excludes** the pause, as its own column label says — is the one with consequences: a build that stopped subtracting pacing would leave every paced workload green while its thresholds silently measured the wrong quantity. |

**`M154e-01` — the manifest describes a `cleanup` that does not exist.** `tflw spec --json` is
`D723`'s ground truth for this entire gate, and its `cleanup` row is wrong in three ways at once:
it gives the syntax as `cleanup` + an indented block (a bare line; a block is `TF011`), the effect
as "steps that run once after a workload finishes" (the *file's* `after each` hooks, per iteration),
and the timing as "whatever its verdict" (only on an iteration's success path). `SPEC.md`'s own
prose contradicts its generated manifest table twelve lines further down the same document. Filed
against tflw; `C48` grades the implemented construct. This is the failure mode `D734` was written
for, arriving from the direction nobody expected — not a plant red for a real defect, but a plant
that would have been *confidently wrong* had it been written from the manifest as `D723` intends.

### `C51`–`C58` — the security tier, rostered by reference

**Not one of these eight rows added an assertion.** That is the milestone, and it is worth being
explicit about why it is not a shortcut.

The pentest arc built three graders that already state these constructs' known answers, and state
them as *data* rather than as prose: `verify-security-acceptance.mjs`'s `LEDGER`, `DECLINES` and
`APPLICABILITY_PROBES` tables, `verify-redaction.mjs`'s ground-truth fetch, and
`verify-check-diagnostics.mjs`'s per-code fixtures. Those tables are more exact than a plant row
could be — a `LEDGER` row names the rules that must fire *and* the rules that are in play at that
floor and must stay silent, which is a claim about a rule that produced nothing, and no roster row
has ever managed to say that. Writing eight new plants would have produced a second, weaker copy of
an assertion that already runs on every sweep.

So the fold is `D724`'s move one axis over: cite, do not duplicate. `D752` is what stops that from
being a promise — the reference is checked in both directions, so a roster row cannot name a known
answer no grader states, and a grader table cannot quietly stop answering a construct the roster
says it answers.

**`C52` is narrower than it looks, and the reason is worth reading before trusting any row here.**
The obvious known answer for `probe mutating` is the granted/withheld contrast: the same `DELETE`
comes back *probed and answered* under a target that grants the opt-in and *`4 not probed`* under one
that does not, each decline naming the missing word. That contrast is graded, exactly, and it lives
in this script's **ungated** half — `D493` drew the gate line above `APPLICABILITY_PROBES`, so the
withheld half asserts and exits non-zero and runs only when somebody types the command. So the row
claims what the gated half proves instead: two verbs under the same four principals, differing only
in whether the verb destroys what it touches. Filed as `M154f-01`.

**The one new plant is `C54`, and it exists because the census was measuring the wrong thing.**
`evidence` looked well covered — four files mention it, and `C41` already grades what the *level*
does to a `screenshot` step. But every one of those uses sets the level with the **`--evidence`
command-line flag**. As a config key, `evidence` had **zero occurrences in this repository**, so a
key the parser accepted and then dropped would have been invisible — which is exactly the defect
`C42` was built to catch for `viewport`, and it was found the same way: by writing the plant.

And it went red on its own PR, which is the part worth keeping (`M154f-02`). A plant record's
`evidence.file` is read two ways: the coverage grader **greps** it for `evidence.pattern`, the
acceptance driver **executes** it. Those agree only while every witness is itself a test file — and
`C54` is the first plant whose witness is a *config*, so the driver handed `tflw.config` to `tflw
run`, which refuses it by name. The failure surfaced as `skipped: no report`, not as a red row: a
plant that can never run and a plant that ran and said nothing look identical in the summary. The
two readings are now separate fields (`evidence.file` witnesses, `run` executes) and
`assertAcceptancePlantsAreRunnable()` checks every `acceptance` plant before the first corpus
starts, so the next config-key plant fails loudly instead of quietly abstaining.

### `C59` — the diagnostic family, rostered by a rule rather than by a list

**Sixty-six constructs, one row, and no new assertion — the largest single move this ledger will
ever make, and the one most worth reading sceptically.**

The proof was already here and it is older than this milestone. `scripts/verify-check-diagnostics.mjs`
has run every assigned `TF0xx` code through a real `tflw check` since `M49`, and since a drift
closure on 2026-08-04 it reads the *expected* list out of the installed bundle's own §17 manifest —
so the completeness claim is enforced by the binary under test rather than by anything anybody
maintains here. That closure is worth knowing before trusting this row: the script's summary line
had claimed *all* assigned codes for a year while counting **its own fixtures**, and three codes had
no fixture at all when somebody finally compared the two numbers. Its header states
the consequence plainly: a tflw milestone that assigns a code is **a breaking change for this
repository's `main` with no additive path**, and the fixture has to land in the companion PR.

Sixty-six hand-written rows would have restated that as sixty-six claims *nothing* enforces. The
roster would have got longer while the evidence got weaker, which is the failure this whole ledger
was opened to stop.

**What the row costs, stated rather than buried.** Membership is a rule evaluated against
`tflw spec --json`, not a list — so when tflw assigns its sixty-seventh code, the coverage gate does
**not** go red for it. It is rostered the moment it appears in the manifest. The anti-regression
duty moves, whole, to the cited gate, which demands a fixture for that code and fails without one:
a stronger red than *this id is on neither list*, arriving in the same CI run. A family may only be
rostered this way where that is true of its grader, and it is checked rather than assumed.

**The citation is checked from both ends, on what the run actually did (`D752`).** Inside the
diagnostics gate: every construct `C59` claims must have been seen emitted by a real `tflw check` in
**that run** — not merely present in a fixture table — and every code that run proved must lie
inside the family the roster names. The second direction is a genuine cross-check rather than
bookkeeping, because the two sides read the bundle by different means: `assignedCodes()` greps the
§17 manifest for `code:` literals, while the family comes from the emitted construct list. If those
ever disagree, this is where it surfaces.

All four failure directions were run before this row was written: the family renamed upstream (the
row covers nothing and 66 constructs fall to unaccounted), the citation moved to another grader (the
diagnostics gate reports that nothing rosters what it proves), the cited gate made ungated
(`M137e-01`'s rule fires — *a row pointing at a gate nobody runs reads as evidence while nothing
evaluates it*), and one code's fixture deleted (`C59` names `TF001` beside the completeness check's
own red).

### `C60`–`C66` — seven matchers, and the twelve `not` lines that make 1825 uses mean something

**The evidence was already everywhere and it proved nothing.** `equals` is used 1581 times in this
repository, `has count` 62, `contains` 50, `matches` 31, `matches subset` 44, `is greater/less than`
43, `matches schema` 14. Every single one of those uses is *positive*. A matcher that returned
`true` unconditionally passes all 1825 of them, and so does one that compared stringified JSON with
`includes` — which is `D722`'s vacuity in its purest form and the exact reason presence was rejected
as a coverage bar.

`tests/.constructs/matcher-discrimination.tflw` answers in **pairs**, against `C1`'s frozen payload
so every expected value is a literal the file can name. What makes the pairs worth writing down is
not the polarity — it is that each negative is aimed at a *plausible* implementation rather than a
broken one:

| matcher | the negative | the implementation it is red for |
|---|---|---|
| `equals` | `body.price not equals 4` | a prefix or `startsWith` comparison — `42` against `4` |
| `contains` | `body.tags not contains "plan"` | searching the array's stringified JSON instead of its elements |
| `matches` | `body.currency matches "EUR\|USD"` | `String.includes`, which passes all 31 existing uses because every one is a literal |
| `matches subset` | `not matches subset { …, price: 41 }` | checking that the listed keys are *present* rather than equal |
| `matches schema` | `not matches schema "ProductResponseDto"` | reading "no errors reported" as "valid" |
| `is greater than` | `not is greater than 42` | `>=` wearing `>`'s name |
| `has count` | `not has count 1` / `not has count 3` | `length >= N`, and `length <= N` |

**The negatives are not taken on trust.** `verify-construct-acceptance.mjs` runs the plant, and then
runs it again with every `not` mechanically removed and every `expect` softened to `check` — so one
red cannot abort a test and hide the rest — and demands that **all twelve fail**. Measured
2026-08-27 on `fedora-box`: twelve inverted, twelve red. A negative that stopped discriminating
would survive that run, and surviving is what the gate refuses.

**And the near-miss value itself is pinned, not just its presence.** `MATCHER_ROWS` in the grader
names each negative by its exact source text, so weakening `not equals 4` to `not equals 999` —
which is still a true assertion, still non-vacuous, and still passes the mutation control — is red
on the plant's own recall. That was run rather than reasoned: the weakened plant produced
`✗ C60 recall — \`not equals 4\` is in the plant and held (got no such step)`. Deleting a negative
outright produces four independent reds across two rows.

**What is not claimed.** These rows say the matcher discriminates on the payload the plant names.
They say nothing about the matcher's behaviour on types the payload has no instance of — `contains`
on a number, `has count` on `body bytes`, `matches subset` on a nested array — and `tests/.gaps/`
already holds the standing record of where quantifying stops working. The pair is a floor under
1825 uses, not a specification.

**`matcher:was-made` is not here, and the reason is the file it would go in.** It is a
browser-network assertion — `expect request to "…" with method "POST" was made` — and its two live
uses are in `tests/mixed/storefront.tflw`. A pair for it needs a page that issues a request and a
path that is never requested, which is UI-tier work in a UI fixture; putting it in an API plant
would be filing it where nobody looking for it would look. It stays on the ratchet with a reason
rather than a turn.

### `C67`–`C72` — the six workhorses, and the two things 3354 uses could not say

`api` appears 1139 times in this repository, `expect` 1692, `capture` 523. Between them they are
most of what this suite is written in, and before `M154g` step 2b not one of those uses was evidence
about the construct itself.

The reason is structural rather than careless. Every one of them is an *instrument*, pointed at
something else. A test that creates a product and asserts its price is evidence about the price; it
would read identically if `api` had issued the request twice, because an extra request leaves the
final response untouched and the final response is all any assertion looks at. A test that captures
an id and immediately spends it on a path would read identically if `capture` bound a lazy reference
rather than a value, because nothing happens in between. This is `D739`'s distinction at its most
extreme — the evidence was everywhere and the claim was nowhere — and it is why the ratchet said
`step:api` with 1139 occurrences behind it.

Two fixtures state what an ordinary test structurally cannot.

**`tests/.constructs/step-workhorses.tflw` makes the observable a server-side counter.**
`POST /v1/lifecycle/mark` answers with its own arrival count for that label — the same module `C4`
and `C5` read — so *one step, one request* stops being an assumption and becomes an integer. The
row that matters is not any single assertion but the corpus total: the file declares five marks, and
the grader requires the server to have seen exactly five. Any step that issued a request nobody
asked for lands there, and nowhere else.

The same counter settles `let`. `let tag = random string 8`, then two marks against `c70-{tag}`: a
binding leaves **one** label marked twice, a macro re-evaluated at each `{tag}` leaves **two** marked
once, and both spellings pass every assertion about status. The generator is load-bearing rather than
decorative — with a literal on the right-hand side the two implementations cannot be told apart —
and the grader pins that by reading the `let` step's own report detail and requiring an 8-character
random value. Weakening the plant to `let tag = "fixed8ch"` leaves the test green and turns the gate
**red**, which was measured, not assumed.

`wait` gets three readings of one number, which is the point of it: the plant asserts
`body.attempt equals 3` in-band, the report's step detail says `passed after 3 attempts`, and the
grader reads `attempts.c72settles == 3` off the server. The first two prove the wait **re-issued**.
Only the third proves it **stopped** — a wait that kept polling its budget out after the condition
held is green on both of the others.

`log` is the weakest row here and is labelled as such. `log` is never an assertion and cannot fail,
so like `C41`'s `screenshot` there is no verdict to grade; what is checked is the shape of the step
in `results.json` — `level: warn`, `destination: both`, and a detail with `{subject}` resolved. It
grades what tflw says it did.

**`tests/.constructs/hard-stop-semantics.tflw` is meant to fail**, and its known answer is a label
the server never sees. `expect` is specified to fail the test *immediately*; `check` is specified to
record and continue, which is `C1`. Until now nothing in this repository could tell the two
constructs apart — if `expect` had silently become `check`, `C1` would still be green and every one
of the 1692 uses would still pass. The plant marks `c68before`, fails one `expect`, then marks
`c68after`, and the claim is that `c68after` never arrives.

An absence is a weak observation, so it is made twice. The leading mark rules out a test that never
started. And the grader then re-runs the same file with that one assertion softened to `check` and
requires `c68after` to **appear**. That control is step 2's instrument pointed the other way: there
a mutation had to make passing assertions fail, here it has to make a missing arrival happen.

The control earns its place. Renaming the plant's `c68after` mark to something else — a plausible
edit that leaves the fixture looking fine — keeps the recall assertion green, because the label is
still absent, *trivially*. Only the control catches it, and it does: measured 2026-08-27 on
`fedora-box`, that mutation produced exactly one red, `with the same assertion written as check, the
step after it DOES run (got absent)`.

`capture` rides the same file for the same reason. The manifest states one half — "a capture that
resolves to nothing fails the step rather than binding `undefined`" — and the plant grades it as a
`capture` step with `ok: false` and a `c69after` that never arrives. The other half is not in the
manifest at all: a capture binds *at capture time*. The third test captures, issues another request,
and then asserts the first value, which a lazy read against "the response in scope" would answer
`c69second`. None of the 523 existing captures can see it, because none of them issues a request
between a capture and its use.

**What is not claimed.** `api`'s optional clauses are not graded here. `without redirects` already
has a real discriminating pair in `tests/api/catalog/http-protocol-corners.tflw` — the same product
fetched with and without the clause, 200 against 302 plus its `location` — and `timeout <dur>` has
no plant at all. The row states the contract those 1139 uses could not: one step, one request.

### The three constructs this tier did **not** roster

`config:probe:oversized`, `config:probe:traversal` and `matcher:has-no-input-handling-violations`
are Tier 3, and they stay on the ratchet.

Their grader, `scripts/verify-input-acceptance.mjs`, is not missing and not weak: it states its
ledger rows in full, grades the three states apart — including the two *different* reasons a rule
can be not-applicable, which Tier 1's grader cannot distinguish — asserts them, and exits non-zero.
It runs in **no automated pass**. Neither `regression.mjs` nor CI carries it, deliberately: a Tier 3
assertion costs an order of magnitude more requests than a Tier 2 one (`D380`), and that price was
judged too high for every PR.

A row pointing at a gate nothing runs reads as evidence while nothing evaluates it. That is
`M141`'s vacuity class wearing a roster row, and this repository already has the rule that refuses
it — `verify-construct-coverage.mjs` fails any plant whose graders are all ungated, in as many
words: *"that is `M137e-01` recurring in a new ledger"*. Rostering these three would have required
either lying about the grader or switching that check off.

**They roster when the Tier 3 grader runs on something that reports.** A condition, not a milestone
number, per the rule `M131` set: the milestone that gives an expensive grader a scheduled home is
the one that closes them, whichever milestone that turns out to be.

## Blocked plants (`D734`)

A plant that goes red because tflw is genuinely broken **keeps its row**, gets a row in tflw's
ledger, and is marked `blocked-on:<row>` here — counted as *covered but currently failing for a
known reason*, never deleted and never quietly moved to the ratchet. Without this convention, this
ledger's successes and its bugs look identical.

**None at present.** All fifty plants pass, measured on `fedora-box` 2026-08-25 — the first three
against tflw `5cba2da`, `C4`–`C12` against the `M154c` build that added the `declaration` family,
`C13`–`C43` against `M154c`'s `main`, and `C44`–`C50` against `M154d`'s.

`M154e-01` is likewise **not** a `blocked-on` marking, for the same reason `M154b-02` is not: `C48`
is green. The defect is in the manifest's *description* of `cleanup`, not in `cleanup`, and the
plant grades the construct the runtime implements. What the row would have blocked is a plant
written the way `D723` says to write one — from the manifest — which is why it is recorded beside
`C48` rather than under it.

`M154b-02` is deliberately **not** a `blocked-on` marking. `D734` reserves that for a plant that
goes red for a known tflw defect, and `C2` is green; the defect sits beside the plant, not under it.
Recording an unreachable language case as a blocked assertion would make this row look like
outstanding work when what it actually is, is a gap with a ledger row.
