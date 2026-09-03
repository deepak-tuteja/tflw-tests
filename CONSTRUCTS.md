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
sixty-eight at once — sixty-six of which it proves by provoking a real `tflw check`, and two of
which (`TF079`, `TF080`) no `check` can emit at all, so it names the plant and the gate that prove
them by running (`D806h`).

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
program under test cannot disagree. Since tflw's `M159` that is **180 constructs**: 12
declarations, 36 step keywords, 18 matchers, 15 generators, 6 locators, 25 config words, 68
diagnostic codes.

The two most recent moves are worth a line each, because neither is what the arithmetic looks like.
`M157` **removed** a step keyword — `cleanup` — and put a config key in its place, `teardown`, which
is why 37/24 became 36/25 with the total unchanged. `M159` added **two diagnostics** —
`TF079` and `TF080` — and nothing else, although it added a good deal of language: `accept dialog
with` is the same `step:accept` construct with more syntax, and `dialog message`/`dialog type` are
value *subjects*, which live inside matcher rows rather than as constructs of their own. A milestone
can grow the surface a reader has to learn without moving this number at all.

It was **166** four milestones ago, and the twelve that arrived are worth a sentence because they are
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
| `C2` | `accept dialog` (`step:accept`) | ui | three states of one click — nothing armed leaves `#bulk-delete-state` at `cancelled`, one `accept dialog` leaves it at `cancelled-final`, two accept both confirms and the products are really gone (asked of the API); and across the kinds, a `prompt` returns `null` / `""` / the typed answer under the three armings, an `alert` leaves the same counter under all of them, and `dialog type` moves from `alert` to `confirm` in one attempt | a handler that stays armed, a step that arms nothing, a queue that keeps only one, a `dialog type` fixed at `confirm`, and an `accept dialog with` whose answer never leaves the arming |
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
| `C31` | `drag … to …` (`step:drag`) | ui | both cart rows asserted by name **and** by position after the drag, with the names read from the API first — and the fixture **creates both rows** (`D819`) | a `drag` that fires no drop, or reorders something else |
| `C32` | `drop file … onto …` (`step:drop`) | ui | `sample.csv` echoed back by a zone with no file input to fill and no click that would open one | a `drop` with an empty or missing file payload |
| `C33` | `stub` (`step:stub`) | ui | two stubs on one URL that disagree — `GET` 200 `tok_wrong_method` against `POST` 500 — and the POST must win; the fixture **creates the row it checks out** (`D819`) | a `stub` that ignores the method, or that never intercepts |
| `C34` | `matches snapshot` (`matcher:matches-snapshot`) | ui | one state change, four assertions: unmasked catches it, masked absorbs the same one | a snapshot compare that always passes, and a `mask` clause that is decorative |
| `C35` | `has no a11y violations` (`matcher:has-no-a11y-violations`) | ui | clean on the happy path, red on `/a11y-demo`, and `not has no **moderate**` passes although zero violations are tagged moderate | a scanner that never fires, and a severity filter that matches exactly instead of as a floor |
| `C36` | `switch to new tab` / `switch to tab N` (`step:switch`) | ui | the popup wait goes red unaided; `switch to tab 1` is then graded by a heading that exists on tab 1 and not on the receipt PDF | a `switch to new tab` that misses the popup, and a `switch to tab N` that stays put |
| `C37` | `close tab` (`step:close`) | ui | closing tab 2 leaves an assertion that only holds on tab 1 — so closing the wrong one, or none, both fail | a `close tab` that closes the wrong tab, or none, or does not restore focus |
| `C38` | `download as` (`step:download`) | ui | the bound name is `orders-export.csv`, which comes from apiV2's `Content-Disposition` and appears nowhere in the markup | a `download as` that binds the wrong string, or the right one by coincidence |
| `C39` | `hover` (`step:hover`) | ui | `onMouseEnter` and `onClick` write **different** tokens to one readout, and the test clicks the same button to show the wrong answer is reachable | a `hover` that is a click, and a `hover` that is a no-op |
| `C40` | `scroll to` (`step:scroll`) | ui | an `IntersectionObserver` below a 2400px spacer, latched — because Playwright visibility ignores the viewport, so `is visible` on the marker would pass unscrolled | a `scroll to` that resolves the element and never scrolls |
| `C41` | `screenshot` (`step:screenshot`) | ui | graded from the **report**, not the run: `captured` at `evidence full`, `not captured (evidence level)` below it, and the PNG's own IHDR reads 1280x720 | a step that reports a capture it did not make, and evidence gating that stopped working |
| `C42` | `viewport` (`config:key:viewport`) | ui | a pair across two configs — 1280x720 unconfigured, 900x600 under a corpus config that sets it; differing in **both** dimensions | a `viewport` key that is parsed and never reaches `newContext` |
| `C43` | `dismiss dialog` (`step:dismiss`) | ui | the step is indistinguishable from its absence, so the plant grades the **order it is answered in**: `dismiss` → `accept` → one click must leave `cancelled`, with confirm #2 never raised | a `dismiss dialog` that does not arm, an arming order that is a stack or a slot, and a queue that answers out of order |
| `C44` | `ramp` (`step:ramp`) | workload | a triangle is half its rectangle: `ramp to 50 rps over 4s` lands ~100 where `hold` at the same rate and duration lands ~200 | a ramp implemented as a hold, and a ramp that starts at its target |
| `C45` | `hold` (`step:hold`) | workload | at full rate by its **second** 500ms bin — "a flat target … with no ramp-in" is the claim, and ramping is the only way to be wrong while landing the right total | a hold that ramps in, and a steady rate that drifts |
| `C46` | `step` (`step:step`) | workload | 20/2s + 80/2s lands ~200, **which is what `hold 50 rps for 4s` lands too** — so the totals cannot discriminate and the plateaus and their 1:4 ratio are the claim | a staircase collapsed to its mean rate, or sloped instead of stepped |
| `C47` | `spike` (`step:spike`) | workload | peak >3x baseline **and a tail that returns to it** — the recovery is the half a plain step up would also pass | a spike that holds its burst, and a burst that is a rounding artefact |
| `C48` | `teardown` (`config:key:teardown`) | workload | one file run at three levels of the key: a marker path sees **8** by default (every iteration, the failing ones included), **0** at `never` with `ℹ teardown: disabled` on the summary, **4** at `on success` — and the reported p95 does not move across the three, against a hook that costs 50 ms | a build that ignores the key, one that reinstates `D26`'s default-off gate, teardown skipping the iterations that failed, `on success` reading the *run*'s verdict instead of the iteration's, and hook time back in the reported duration |
| `C49` | `threshold` (`step:threshold`) | workload | the same request, the same path, every assertion green — and the test bounded at 10ms is **red** while the one bounded at 5000ms is green | a verdict computed from the steps rather than the aggregate metrics |
| `C50` | `pause` (`step:pause`) | workload | gaps ≥200ms against a <50ms control on an identical path, **and** a reported p50 under 50ms because the column is pause-excluded | a `pause` that is a no-op, and a build that stopped subtracting pacing from duration |
| `C51` | `probe ciphers` (`config:probe:ciphers`) | security | a granted/withheld pair on one rule, against a host that **negotiates a modern suite** — granted, `sec/tls-weak-cipher` fires and names the suites tflw could not offer; withheld, it is silent and the passing assertion carries `judged only the suite this host gave` | a `probe ciphers` that opens no second handshake, and an opt-in honoured where it was not granted |
| `C52` | `probe mutating` (`config:probe:mutating`) | security | two verbs, one probe set, one variable: the `DELETE` is `4 probed — 1 inconclusive, 3 refused` and yields no verdict, the idempotent `PUT` is `4 probed — 2 leaked, 1 inconclusive, 1 refused` and finds the leak — plus the withheld half, the same `DELETE` under a target granting nothing coming back `4 not probed` with each decline naming the missing word (`M163c`) | a `probe mutating` that sends nothing while the assertion stays green, and a destructive verb scored as a verdict |
| `C53` | `authorized target` (`config:key:authorized`) | security | three refusals and their three silences before anything is sent — `TF060` on a base the affirmation does not name, `TF065` on a public target with no command-line affirmation, `TF066` on one naming an origin the run never scans | a scan reaching a host nobody affirmed, and an affirmation accepted for an origin the run never touches |
| `C54` | `evidence` (`config:key:evidence`) | security | the same `screenshot` step, no `--evidence` anywhere: `captured` with a 1280x720 IHDR under a config that sets `evidence full`, `not captured (evidence level)` under one that sets nothing | an `evidence` key parsed and never reaching the runtime — `C42`'s defect one key over |
| `C55` | `redact` (`config:key:redact`) | security | five PII values fetched **directly from apiV2**, present in no step's `request.body`, `response.bodyText` or `detail`; each of those three field kinds actually present in the run, including a request body carrying a covered field (`M154g` — until then there was none, on any step, in any run); and `[redacted]` in both `results.json` and `report.html`, so a pattern matching nothing cannot pass by having nothing to leak | a `redact` that stopped covering printed `detail` or stopped reaching `redactRequest`, a ground-truth set that silently shrank, and a vacuously-passing leak check |
| `C56` | `crawl` (`declaration:crawl`) | security | graded by finding **provenance** — each plant reached *via* the crawl — and by the SPA the fetching spider cannot walk, asserted as a named decline with count 1 rather than a silent zero | a crawl that walks the logged-out shell and calls it the surface (tflw `M137f-01`), and a blind spot reported as a zero |
| `C57` | `has no … security violations` (`matcher:has-no-security-violations`) | security | every ledger row names what must fire **and** what is in play at that floor and must be silent; plus `D445` precision (`baseline ∪ plants`, nothing elsewhere) and the `scanCoverage` census that makes silence sufficient | a rule that stops firing, a rule that fires where it should not, and a floor read as a band |
| `C58` | `has no authorization violations` (`matcher:has-no-authorization-violations`) | security | probe sets graded as four numbers, over one human declared three times — cookie+`csrf from` completes, bearer completes, cookie without the clause is `inconclusive` | a probe set silently emptied until nobody can answer, and a destructive verb scored as a verdict |
| `C59` | **the whole `diagnostic` family — 68 codes, two of which no `tflw check` can emit** (`diagnostic:TF001`…, by rule not by list) | check | every code the installed tflw assigns is provoked by a fixture and asserted to appear in real `tflw check` output, several against the silence they must not break; and the expected set is read out of **tflw's own §17 manifest**, so a code that ships without a fixture here is red on the day it merges | a diagnostic that stops firing, a fixture kept for a retired code, and 68 hand-written rows going stale silently while reading as evidence |
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
| `C73` | `test` (`declaration:test`) | api | three declarations, **three** verdicts under their three declared names, and the third one **passes** although the first two failed. Graded on the meant-to-fail plant deliberately: in a green file "the next test still ran" is not a claim about anything | a runner that reports per file rather than per test, and one that abandons a file at its first failing test |
| `C74` | `import` (`declaration:import`) | api | the imported file offers an `action` **and** a `test`, and both mark the server. After the run, `c74action` has arrived once and `c74importedtest` has never arrived — the action is what makes the absence mean *excluded* rather than *never loaded* | an `import` that registers the imported file's tests, and one that quietly imports nothing at all |
| `C75` | `with each` (`declaration:with-each`) | api | three rows → **three** reported tests with three interpolated names, and three distinct labels at one each. Aimed at a wrong implementation that is not broken: rows looped inside one reported test pass every existing use here and differ only in the summary | a `with each` that reports its rows as one test, runs a row twice, or does not interpolate the row into the name |
| `C76` | `@tag` (`declaration:tags`) | api | four runs of one file compared against the arrival counter — unfiltered, `--tag c76alpha`, `--tag c76beta`, `--tag c76alpha,c76beta` — and what carries the row is what is **absent** from runs 2 and 3. `--exclude-tag` is run too, and must come back `unknown flag` | a `--tag` that filters nothing, filters everything, or reads only the first tag on a declaration |
| `C77` | `action` (`declaration:action`) | api | the caller marks, the action marks, and then the caller asserts on `body` again — and reads **its own** response, although the action's request was strictly later (`FU-12`). The action's mark is required too, so the negative cannot be satisfied by a body that never ran | an `action` whose response leaks into the caller's scope, and one whose body never executed |
| `C78` | `use` (`declaration:use`) | api | two claims, two instruments. The export returns `c78-51f2ab95`, a hash the DSL has no arithmetic to compute; and two files differing by **one** `use` line make the same bogus call, `TF037` on the one without and silence on the one with. The control is load-bearing | a `use` that imports nothing, a call that returns its argument, and a checker that "improves" `TF037` by peeking at a module it must not execute |
| `C79` | `before` (`declaration:before`) | api | after a three-test run the server holds `c79file` at **1** and `c79each` at **3**; the three tests assert ordinals 1, 2, 3 off the bare hook's own capture. The fourth claim — `before file`'s scope sealed off — is a file that must **not** compile, graded as `TF030` | a `before file` that runs per test, a bare `before` that runs once per file, and a `before file` whose scope leaks into a test |
| `C80` | `as` (`declaration:as`) | api | **no new fixture.** `tests/examples/sessions-explained.tflw` has been running the pair all along: the same `GET /orders/all` answers 200 in a test declared `as admin` and 401 in one with no clause. The grader requires both verdicts *and* that they came from the same request | an `as` clause that applies no credential, and one that authorizes every test in the file whether it opted in or not |
| `C81` | `unique("prefix")` (`generator:unique-prefix`) | api | `W3-Widget-0/-1/-2` — the prefix verbatim, then three **consecutive** counter values, identical under two seeds and two run clocks. Plus `SPEC` §7.2's bolded retry clause: three attempts, three distinct values, one mark each | a `unique("…")` that drops its prefix, repeats, became seed-derived, or replays across a retried test's attempts |
| `C82` | `unique email` (`generator:unique-email`) | api | `user<n>@example.test` where `<n>` continues **`C81`'s** sequence — the plant reads `user3@…` because the test above it drew three prefixes. One counter, shared by the whole group, and nothing in the suite said so | a `unique email` that repeats, stops being an address, or acquires a per-construct counter and so stops being collision-safe against its siblings |
| `C83` | `unique number` (`generator:unique-number`) | api | the shared counter unwrapped, continuing from `C82`'s last index. **No other site in the repository** — this row and its plant are its entire evidence | a `unique number` that repeats, returns non-digits, or runs off a sequence of its own |
| `C84` | `unique uuid` (`generator:unique-uuid`) | api | v4-shaped with the counter in its last eight hex digits — `…0000000c/d/e` parsed as 12, 13, 14. Under a changed seed the uuid moves and those digits do not. The counter also jumps by **four**, not one, which is `M154g-07`'s evidence | a `unique uuid` whose tail stopped being the counter, silently downgrading a guarantee to 122 bits of luck |
| `C85` | `random number` (`generator:random-number`) | api | inclusive (pinned by `random number 7 to 7`, which an exclusive bound cannot answer at all), repeats under one seed, moves under another, ignores the clock, and refuses an empty range in both forms. Seed-sensitivity asserted on the **decimal**, because a 1-to-100 integer collides one run in a hundred | an exclusive upper bound, a generator that ignores `--seed` or consults the run clock, and a silently-accepted empty range |
| `C86` | `random date` (`generator:random-date`) | api | the row that needed a **fourth run**: same seed, `--now` a year later, and `random date in past` must move by about a year while `random string 12` must not. `--seed` and `--now` are two promises and three runs cannot separate them | a `random date` that ignores `--now`, puts a "past" date in the future, leaves `between` unbounded, or accepts a reversed or string-typed bound |
| `C87` | `random of` (`generator:random-of`) | api | membership is satisfied by a generator stuck on the head of the list, so the plant draws three times and the grader requires more than one element — sound rather than lucky because the seed is pinned | a `random of` that returns something outside its list, and one stuck on a single element |
| `C88` | `random string` (`generator:random-string`) | api | graded as a **pair with `C81` in one retried test**: `random string 10` marked three times as one value, `unique("W3-Retry")` marked once each as three. Plus `0` legal / `-3` refused, with the silence asserted inside a file that *does* report `TF054` | a wrong length or alphabet, an ignored seed, a `0` that started erroring, and a `random` value that stopped replaying across a retry |
| `C89` | `random like` (`generator:random-like`) | api | `SKU-####-??` → four digits and two letters. The discriminator is that the two placeholders draw from **different alphabets**: one shared alphanumeric pool gives the right length and the right skeleton | a pattern filler using one alphabet for both placeholders, dropping the literals, or ignoring the seed |
| `C90` | `random uuid` (`generator:random-uuid`) | api | the whole row is its **contrast with `C84`** — both are v4-shaped, so shape cannot tell them apart and the 26 sites here say nothing. Under a changed seed this one's trailing digits move; `unique uuid`'s do not | a `random uuid` that bypasses the run seed (breaking `--seed` replay everywhere), and one that acquired a counter and so became `unique uuid` |
| `C91` | `random password` (`generator:random-password`) | api | 16 when 16 was asked for, 12 by default, **all four character classes present**, seed-reproducible, and `random password 2` refused because four classes cannot fit in two characters. The refusal and the classes are one fact from two directions | a password missing a class (making the refusal arbitrary), a wrong or ignored length, a changed default, an ignored seed |
| `C92` | `env` (`config:directive:env`) | check | a nine-cell grid: `api extra` clean under the env that declares it, `TF026` under the one that does not, and the `default` marker's no-flag output **byte-identical** to `--env one`. `--env nosuch` is refused naming both envs | an `--env` that selects nothing and leaves the first env active, a `default` marker parsed and ignored, and named services resolved from the union of every env |
| `C93` | `defaults` (`config:directive:defaults`) | check | one `allow hosts` line in `defaults` fires `TF036` under **both** envs; the identical line moved into `env one` leaves that env unchanged and silences the other. Plus `TF022` for a second `defaults` block, over a config whose env is inside its own allowlist so no other code can fire | a `defaults` block honoured only for the default env, an env-level setting leaking to its siblings, and a duplicate block taking a silent last-wins reading |
| `C94` | `session` (`config:directive:session`) | check | `session scoped for env one` and `session everywhere` are identical but for the clause: under `--env two` the first is a `TF028` quoting its own clause back, the second is clean. `C80` already grades `as`; this is the half `as` cannot see | a `for env` clause parsed and ignored, and a session table built from the wrong env |
| `C95` | `require` (`config:directive:require`) | check | refused naming both variables with neither set; refused naming **`C95_UNUSED` alone** — which the config references nowhere — with the other set; past the gate and dead at port 9 with both. And `tflw check` over the identical config prints an advisory note naming both unset variables beside *no problems found* and an exit 0, which **vanishes** once they are set — `D779`, reversing this row's own `M154g-11` | a `require env` guarding only interpolated variables, a refusal arriving after the first request, the note regressing to silence or hardening into a refusal that breaks `check` in a secretless CI job, and a note printed unconditionally instead of for the variables actually unset |
| `C96` | `exclude` (`config:directive:exclude`) | check | **1 file checked** with the line and **2** without, over an unchanged two-file corpus — and naming the excluded file explicitly checks it under **both** configs, which is the manifest's own *"names a folder rather than a file"* clause asserted rather than paraphrased | an `exclude` that stops filtering discovery, and one that hardens into a refusal so a named file can no longer be checked |
| `C97` | `api` (`config:key:api`) | api | `api GET /alpha` under a base whose own URL carries `/base` arrives at **`/base/alpha`** — a bare-origin base could not tell *joined* from *replaced* — and `api second GET /gamma` arrives at `/second/gamma`. Exactly three requests, and nowhere else | a base URL whose path is discarded, a named service resolved to the default base, and a step fanned out to every declared service |
| `C98` | `header` (`config:key:header`) | api | the manifest says *"on every `api` step"*, and **every** is what a total cannot check: the server records each arrival's headers separately, so one `defaults` line is seen on all three. `header … for second` arrives on that service and is **absent** from the other two | a header attached to the first request of a run rather than to each, and per-service scoping that decorates instead of narrowing |
| `C99` | `timeout` (`config:key:timeout`) | api | `timeout step 10ms` against a 50 ms path fails and the detail quotes **`10ms`** back; `5s` passes; and a step carrying its own `timeout 5s` passes under the tight config, so it is a default rather than a refusal to wait. Plus the narrowing (`M155`/`D768`), as a swapped pair: `timeout step 5s, api 10ms` fails the request that `timeout step 10ms, api 5s` passes, so the narrow key is read **and** the broad key stopped reaching HTTP — either config alone is satisfied by a resolver that reads only one of them. Replaces the old `M154g-10` leg, which asserted `timeout api 5s` was a `TF010` and was written to go red the day tflw implemented the spelling; it did | a `timeout` key parsed and never applied, a per-step override that stopped winning, and a `timeout api`/`timeout browser` that resolves but reaches nothing — or that reaches the other transport |
| `C100` | `allow hosts` (`config:key:allow`) | api | `localhost` and `127.0.0.1` are one machine and two entries, so the two configs differ by one word: **zero** arrivals at `/blocked` under the narrow list, **one** under the wide one, and the socket counter moves only in the second. An absence proven against something that would have recorded a presence | an allowlist enforced by discarding the response rather than never sending the request, and a host matched by address instead of by name |
| `C101` | `workers` (`config:key:workers`) | api | the rendezvous the `RATCHET` was waiting for. At `workers 1` the watermark is **1** and both holders wait out their deadline alone; at `workers 2` it is **2** and both are released as a pair. One digit, unchanged corpus, and both legs green either way | a `workers` key that never reaches the scheduler, and file concurrency that ignores what the config asked for |
| `C102` | `report` (`config:key:report`) | api | all four artifacts — `report.html`, `results.json`, `junit.xml`, `.last-run.json` — land under `artifacts/custom`, a nested directory the run creates, and **`report/` is not written at all**; remove the line and all four are back. Zero occurrences of this key existed in this repository before the plant | a `report` key honoured by one writer and ignored by the other three, and a relocation that leaves a stale default directory behind |
| `C103` | `log` (`config:key:log`) | api | three configs, one fixture: `warn` keeps the `debug` call off the console and `debug` lets it through; `destination console` keeps both out of `report.html` and `html` puts both in and neither on the console. Under **all three**, `results.json` carries both identically — filtering is a rendering decision | a `log level` that drops a step from `results.json` instead of from the console, and a `log destination` that reaches one renderer and not the other |
| `C104` | `parallel`/`sequential` (`declaration:concurrency`) | api | not a config key, and it rosters here because one instrument answered both questions. Two `parallel` tests reach a watermark of **2** and are released as a pair; the same two marked `sequential` reach **1**. Both legs under `workers 1`, so the file axis is pinned and the modifier is the only difference | a `parallel` batch executed one test at a time, and a `sequential` marker that no longer serializes |
| `C105` | `insecure` (`config:key:insecure`) | security | with the line the request completes against a CA the container invented at start-up; without it the same request fails naming the certificate — the half `env secureLocal` has never had. Plus the run-summary banner present in one leg and absent in the other, and `--forbid-insecure` **refusing** rather than failing | an `insecure` key that never reaches the agent, a run that disables verification quietly, and a CI policy flag that fails a run instead of refusing it |
| `C106` | `cert` (`config:key:cert`) | security | one unchanged file, two config lines: a 200 through `ssl_verify_client on`, and nginx's own **400** with `cert`/`key` deleted — the pair that has always run under two envs in two files, now as one. The negative fails on the *status*, so the connection was made and refused by the listener | a `cert` parsed and never presented, and an mTLS listener that stopped requiring one |
| `C107` | `key` (`config:key:key`) | security | moved rather than removed, because deleting `key` deletes `cert`'s answer too: `server.key` is a real key the same container generated and does not belong to `client.pem`. The run fails **at the transport**, before any status exists — which is exactly what tells it from `C106`'s server-chosen 400 | a `key` read and never paired with `cert`, and a mismatched pair accepted locally and refused as an authorization failure instead |
| `C108` | `web` (`config:key:web`) | ui | a two-by-two grid, because one cell proves nothing: `.product-grid` exists only in the storefront and `testFlow-tests admin console` only in the console, so the diagonal passes and the off-diagonal fails. A `web` key ignored for one hard-coded base lights a **column** instead. A **third column** for the cell where the key must do nothing: an absolute `open` target is the address itself, so one file passes under *both* bases while each bare-path file passes under exactly one | a `web` base ignored for a bare path, an env switch that moves the `api` base without moving the browser's, and a `web` base prepended to an absolute `open` target — which composes an address a catch-all SPA route SERVES, so the run fails later and somewhere else |
| `C109` | `has no … input handling violations` (`matcher:has-no-input-handling-violations`) | security | seven ledger rows graded on the **full** counts line — `[rules, applicable, notApplicable, violations]` — because the interesting Tier 3 failure moves `applicable` and the violation count alone reads the same; every rule demonstrated firing, silent and not-applicable, with the two stand-down *reasons* graded apart; `TF067`'s runtime refusal underneath, read from stderr because there is no report | a rule that stops applying while its assertion stays green, an opt-in dropped from a config, and a stand-down reported without the reason that says what to do about it |
| `C110` | `probe oversized` (`config:probe:oversized`) | security | a granted/withheld pair where **nothing else moves**: granted, `sec/oversized-input-accepted` is applicable and fires twice on one body at two leaves; withheld, the identical assertion lists it not-applicable and **names the missing word**. The reason string is graded, not the count — an opt-in read and never sent looks exactly like a correct withheld half | an opt-in honoured where it was not granted, and one accepted in the config and never sent — both leave the assertion green |
| `C111` | `probe traversal` (`config:probe:traversal`) | security | the same pair, plus the thing that makes it a different row: **where the grant lives was measured**. Through the sidecar the rule reported applicable, 9 probes sent, 9 answered, no violation — nginx normalises the payload away first, so the app is vulnerable and its deployment is not. The grant sits on `plaintext`, where it fires (`V11`); the sidecar env is the withheld half | a probe class granted where the deployment eats it — indistinguishable from a clean target — and a traversal rule that stands down without saying why |
| `C112` | `was made` (`matcher:was-made`) | ui | four known answers off one page load: the URL the page fetched **was** made, the same URL under a method it never used was **not**, a URL it never touched was **not**, and the `/health` request **tflw itself** sent was **not** — that last one is what says the observation set is the browser's log rather than the runner's. Two `check` rows are the same assertions with `not` dropped and must fail in the same run | a `was made` that answers `true` for anything observed, one that ignores the `with method` clause, and one that counts the runner's own requests as the page's |
| `C113` | `unique like "ORD-######"` (`generator:unique-like`) | api | the ratchet's last entry, cleared by tflw rather than by this repository. Three claims, and the shape one is the weakest: `#` fills with digits and three draws are distinct — which is what this plant asserted for a year while the construct had **no guarantee at all**. So the row is graded on what a sample cannot fake: the value is **identical under a second seed and a moved clock**, which is the only thing separating it from `random like` (same pattern language, same regex, moves with the seed); and inside the `retry 2` test it yields three distinct values where `random string` yields one three times. Measured: **3/4 against the pre-fix build, 4/4 after**, and seed-independence is the claim that moved | a `unique like` whose distinctness went back to being probabilistic (it would move under a second seed, since the only way to draw is to consult the RNG), one that replays a value across a retried test's attempts, and one that silently wrapped its pattern instead of refusing to overflow it |

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

### `C2` — the dialog handler is armed, the armings queue, and the answer arrives

**Target.** `webV2/admin`'s bulk out-of-stock delete, whose form runs two `confirm()`s in one
short-circuited handler and records which one it stopped at. **Plant.**
`tests/.constructs/dialog-one-shot.tflw`.

`accept dialog` arms a handler for the **next** native dialog; armings queue, one dialog each, in
order (tflw `D797`), and without one the browser dismisses silently. A single-confirm flow can only
distinguish *armed* from *not armed*. Two confirms give four outcomes, and since `M159` tflw can
reach all of them:

| arming | dialog 1 | dialog 2 | `#bulk-delete-state` | products |
|---|---|---|---|---|
| none — *the control* | dismissed by default | never shown | `cancelled` | intact |
| `accept dialog` once | accepted by the handler | dismissed by default | `cancelled-final` | intact |
| `dismiss` then `accept` — *`C43`* | dismissed by the arming | never shown | `cancelled` | intact, one arming left over |
| `accept dialog` twice | accepted | accepted | (navigates) | **deleted** |

The claim is the **set**, not any one row. Same page, same button, different arming, different
state: a step that armed nothing would leave `cancelled` every time, and a handler that stayed armed
past its first dialog would reach the fourth state from the second row.

Without the status line the first two would be indistinguishable from outside the browser — nothing
was deleted either way — and the assertion would hold whether or not `accept dialog` did anything.
That is a vacuous check, the class `M141`/`D538` spent an order of the ledger removing, and it is
why the status line is part of the feature rather than scaffolding: a two-step destructive
confirmation that tells you which step you are on is the honest form of it (`D729`).

The bulk action is scoped to `stock === 0` **and** to the list page's own filter, in both
directions. A plant that damages the fixtures every other test reads is not a plant, it is an
outage. The fourth row deletes only the two products that test created under a `unique uuid` prefix.

**`M154b-02` is closed, and the row it filed is the reason the fourth state exists.** It was
*unreachable*, not merely unasserted: `armedDialog` was a single slot, so two consecutive
`accept dialog` steps armed one handler, and the two dialogs come from a single `click` with no step
boundary between them to arm again. Nothing refused the program — tflw accepted a script and
silently did half of it. tflw's `D797` made the arming a queue and the same script now means what a
reader always thought it meant. It is asserted in a **second `test`** in the same file (`D806f`),
because it is terminal: it deletes the products that make the button exist, and the block before it
deliberately leaves an arming unconsumed that a later dialog in the same attempt would inherit
(`D803`).

**Two more things this row cost, both worth carrying.**

- The plant first used `unique("C2 Dialog Plant")` for its fixture prefix and collided with its own
  previous run. `unique("prefix")` promises collision-safety *"across tests/workers/retries"* and
  that list does not include **runs** — it is a run-scoped counter, and the database survives
  between runs. tflw's contract says exactly what it covers; the plant had assumed one word more.
  `unique uuid` guarantees distinctness and is what the plant uses now.
- **A plant grades the semantics it was written against, and a language can change under it.**
  `C43` — the third row of the table, and `dismiss dialog`'s own claim — used to grade the one thing
  a single slot let a dismissal do that its absence could not: **overwrite a prior arming**. `D797`
  deleted the slot, so that block went red against tflw's `M159` branch on 2026-08-30 — at exactly
  that block, with `C2`'s other rows green beside it. Nothing had regressed; the plant was grading
  semantics the language no longer had. The replacement (`D806e`) grades what a queue *does*
  promise, by writing the dismissal **first**: a real one answers confirm #1 and the form stops
  there, while a `dismiss` that armed nothing — or a stack — lets the accept behind it take confirm
  #1 and lands on `cancelled-final`, the state the row above just produced. Dismissal is still
  unobservable in isolation (`M154b-01` stands, and the browser's unhandled default *is* dismissal);
  what closes the row is that **order** makes its effect visible. `expect dialog message` then reads
  confirm #1's text, which is true only if #2 was never raised — the half the page state cannot say.

#### The other three kinds (`M159f-c`)

**Target.** Three more `webV2/admin` features — the products list's stock-health `alert()`, the
product detail's rename `prompt()`, and an unsaved-reply `beforeunload` guard. **Plant.**
`tests/.constructs/dialog-kinds.tflw`, its own `tflw run` under the same `--env webv2Admin`.

Everything above raises one kind, `confirm`, because that is the only kind the bulk delete has. Two
claims were vacuous because of it, and **neither could be repaired by more confirm-testing**:

- `dialog type` has a **closed set of four values** and this repository could produce one of them.
  A subject hardcoded to `"confirm"` passed every dialog assertion in both repositories.
- `accept dialog with`'s only use here is `dialog-one-shot.tflw`'s `TF080` witness, which asserts
  that the answer went **nowhere** — the text is ignored on a `confirm`, by design. So an
  implementation of `with` that parsed the value and never handed it to Playwright satisfied that
  test *by construction*. The happy path was not merely unproven, it was **anti-proven**, and only a
  `prompt` tells the two apart.

`prompt` is the one that carries the weight, because it returns three distinguishable things and one
button separates all three:

| arming | `prompt()` returns | `#rename-state` | the product's name |
|---|---|---|---|
| none, or `dismiss dialog` | `null` | `cancelled` | unchanged |
| `accept dialog` | `""` | `empty` | unchanged |
| `accept dialog with "…"` | the answer | (navigates) | **renamed**, read back off the API |

The middle row is why the fixture handles empty separately instead of folding it into cancel: SPEC
§9.1 says a bare `accept dialog` answers with the empty string, and nothing outside tflw's own unit
tests had ever checked it. Measured control: replacing `accept dialog with "…"` with a bare `accept
dialog` lands on `empty` and the plant goes red at the renamed heading.

`alert` is the honest one. It has **one button**, so accepting and dismissing it do the same thing to
the page — there is no page state anywhere that can tell an armed handler from an unarmed one, and a
plant claiming otherwise would be measuring Playwright's default. So the test asserts the *sameness*
(three armings, the same counter moving each time, which is also what proves the handler ran) and
puts its discriminating weight on the dialog itself: it raises an `alert` and then a `confirm` in one
attempt and watches `dialog type` **move**. Measured control: making the fixture raise a `confirm`
instead turns it red on the type.

`beforeunload` was tflw `M159`'s **prediction 5 — that a headless click would not qualify as the user
gesture browsers gate the kind on, and the plant would have to be documented rather than built.**
It is falsified. A real click into the reply box, a real navigation, and the guard fires first try.
The graded half is the **accept** branch — accept means *leave*, and the default dismissal means
*stay*, so deleting the arming turns it red (measured). The dismiss branch is `M154b-01`'s vacuous
shape and is deliberately not graded as if it were not; it earns its line by establishing that the
kind is raised and reported at all. `dialog message` is not asserted for this kind: Chromium supplies
its own text and ignores the page's, so an assertion on it would grade the browser's UI copy.

The control is the third block, and it has to come last. Same page, same link, **nothing typed** — so
no dialog is raised at all, and without it both branches above would hold just as well against a
guard that blocked every navigation unconditionally. No step can assert an absence, so the evidence
is the arming going unconsumed: **`TF079`, at its own line**, asserted by the acceptance grader.
Last, because an arming survives to the end of the attempt (tflw `D803`) — put it first and the
leftover would be inherited by the dismiss branch's own dialog and answer it wrongly.

**No roster row was added, and that is the arithmetic tflw's `D805` predicted wrong.** It expected
178 → 181, one row per new construct. `accept dialog with` is `step:accept` with more syntax, and
`dialog message`/`dialog type` are value subjects inside matcher rows, so the total moved to 180 on
the two new diagnostics alone. This is corpus strength rather than a roster obligation — which is
exactly the case `D724` cannot see, and the reason a coverage percentage is not the same thing as
coverage.

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

**All three are specified now, and the route each took there is worth stating.** `SPEC` §7.6 names
`encodeURIComponent` outright, so `url` needed no judgement. `base64`'s alphabet is derivable from
the other end — `TF054` refuses a URL-safe literal to `base64 decode`, so an `encode` emitting one
would produce output its own `decode` rejects. **`hex`'s case was pinned by this plant and by
nothing else** until tflw's `M161` (`D814`): `SPEC` §7.6 now states that `hex encode` emits
lowercase and `hex decode` accepts either case, and names `M154c-02` — the row this plant's silence
was filed as — as the reason it says so. The plant asserts the contract rather than *being* it,
which is the right way round; a plant that quietly promotes an implementation detail to a contract
is how a spec gap becomes invisible.

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
| `C48` | The plant is a **contrast across three runs of one file**, because no single count means anything on its own: a build that ignored the key answers 8 three times and a build that reinstated the old default-off gate answers 0 three times, since no file can opt in any more. The sharp clause is `on success`: the first test is **red by threshold while all four of its iterations pass**, so keeping its teardown is what distinguishes *reads the iteration* from *reads the run* — a build doing the latter answers 0 and looks plausible. The fourth clause is one no plant here could make before `M157a`: the reported p95 is unchanged across all three levels, which is what proves hook time left the metric (`D782`) — and the hook is deliberately expensive, 50 ms, because that clause is a **null result** and against the zero-latency marker it used to hit, the effect it denied was one local request, smaller than its own tolerance (`M157g`, `M155-03`). *Unchanged* is evidence only when *changed* would have been visible. Re-pointed from `step:cleanup` by `M157f`/`D789` rather than deleted — `D724` forbids dropping coverage of a construct that still exists in changed form, and the ratchet would not have caught it. |
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

**Closed 2026-08-29 by tflw's `M157`, and not by correcting the sentence.** The row was filed
rather than fixed because the repair was a choice between two readings of what `cleanup` was for and
`D26` argued for the implemented one. `M157` measured `D26` instead of choosing: the gate existed to
keep teardown's request volume out of the reported latency, and an **ungated `before` hook** was
measured polluting the same percentile identically — 96 ms against a 37 ms control, with the dogfood
suite running 61 bare `before` blocks against 4 bare `after`. So correcting the manifest sentence
would have written down a rule the code does not keep. The keyword is gone (`D781`), hook time left
the reported duration (`D782`), and a `teardown` config key replaced the opt-in (`D783`). `C48` was
re-pointed at that key. **A second defect closed with it that the row never knew about**: the
interpreter put the `after each` loop behind `if (!exec.ok) throw`, so a failing iteration leaked —
measured at created 5 / closed 0 before, created 5 / closed 5 after.

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

**`C52` was narrower than it looked, and `M163c` widened it back.** The known answer for
`probe mutating` is the granted/withheld contrast: the same `DELETE` comes back *probed and
answered* under a target that grants the opt-in and *`4 not probed`* under one that does not, each
decline naming the missing word. `M154f-01` found that contrast graded exactly — and graded in this
script's **ungated** half, because `D493` had drawn the gate line above `APPLICABILITY_PROBES`. So
the row was narrowed to what the gated half proved instead: two verbs under the same four
principals, differing only in whether the verb destroys what it touches.

`M163b` moved that probe loop above the gate line (`D823`), so the withheld half is now asserted by
the same automated phase as everything else here, and the row claims the whole contrast again. **The
claim was never wrong — the grader was unreachable**, and `verify-construct-coverage.mjs` was right
to refuse a plant whose graders are all ungated rather than let the roster carry a row nothing ran.
Narrowing the claim was the correct move while that was true and the wrong thing to leave standing
once it was fixable; `M154f-01` said so and is closed by this.

The measured cost of making it reachable was **1.09 s** on `fedora-box` — the phase went from
~1.65 s to ~3.3 s (`D824`, `M163a`). `M154f-01` had deferred the move on the assumption that "a
Tier 2 probe run costs a corpus run per probe"; it costs a *single-file* run per probe, and nobody
had measured it.

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

Sixty-eight hand-written rows would have restated that as sixty-eight claims *nothing* enforces. The
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
row covers nothing and 68 constructs fall to unaccounted), the citation moved to another grader (the
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

### `C73`–`C76` — the four declarations that decide which tests exist

`test`, `import`, `with each` and `@tag` answer a question that is settled *before* any step runs:
which tests are there, and which of them will execute. Every one of them is used constantly here,
and in each case the shape of this suite is what hides the effect.

**`@tag` is the clearest.** Every file under `tests/` carries tags, and a `--tag` that silently
matched everything would leave the entire suite green — because the suite's ordinary runs are
unfiltered. The construct is exercised thousands of times and its effect has never once been
observed. So the plant is built as the partition it describes: three tests, three labels, three
tag-sets, run four times, compared against the arrival counter.

| run | expected to arrive | rules out |
|---|---|---|
| unfiltered | `c76alpha` `c76beta` `c76both` | a filter that is on by default |
| `--tag c76alpha` | `c76alpha` `c76both` — **not** `c76beta` | a `--tag` that matches everything |
| `--tag c76beta` | `c76beta` `c76both` — **not** `c76alpha` | a `--tag` reading only a declaration's first tag |
| `--tag c76alpha,c76beta` | all three | a comma-list treated as one literal tag |

The load-bearing readings are the two absences. Runs 1 and 4 are satisfied by a `--tag` that filters
nothing at all, and run 2 alone is satisfied by one that reads only the first tag on each
declaration — it is run 3, the exact complement, that leaves no such implementation standing.

That last claim was **run, not argued**. Dropping `@c76beta` from the both-tagged test builds
exactly the first-tag-only implementation, and the gate goes red on **one** assertion — run 3 —
while run 2 stays green. A plant whose stated reason for an extra case can be demonstrated by
removing it is worth more than one whose extra case is merely defended.

`c76both` is expected in **all four** because `--tag` selects a test carrying *any* listed tag, not
one tagged exclusively. And the row states the negative too: there is no exclusion flag, so the
grader runs `--exclude-tag` and requires `unknown flag` back. That negative is why this row exists
at all — reading the manifest to write it is what found tflw's `M154g-03`, where
`declaration:tags`'s own summary advertised an `--exclude-tag` that has never existed, contradicting
`SPEC` §4.1 in the same breath.

**`import` is the one whose existing uses prove the wrong half.** There are many imports in this
suite and every one of them is load-bearing in a single direction: a file imports a shared action,
calls it, the call works. That demonstrates the action arrived. The manifest's actual claim is a
negative — *"its tests never run"* — and no positive use can reach it.

The two halves need each other, and that is the whole design of the pair. `imported-suite.tflw`
offers an `action` **and** a `test`, and both mark the server. On its own, "no imported test ran" is
satisfied by an import that failed silently, or resolved to nothing, or did nothing whatever. The
action arriving is what makes the absence mean *excluded* rather than *never loaded*. The imported
test is deliberately a **passing** one, for the same reason: a test that never runs and a test that
runs and fails are different claims, and a failing import-test would also turn the run red, which is
the wrong signal entirely.

**`with each` is aimed at an implementation that is not broken.** Rows executed in a loop inside a
single reported test would satisfy every existing use in this repository — the requests all go out,
the expectations all hold — and would differ only in the summary saying one test passed instead of
three. So the row's value is spent on a label the server counts, and two surfaces are read that
disagree only under that implementation: `results.json` must carry three tests from the file with
three distinct interpolated names, and the counter must hold three distinct labels at one each. The
in-band `expect body.count equals 1` covers the opposite direction — a row executed twice, which
changes no test count at all.

**`test` is graded on the file that fails.** Three declarations must produce three verdicts under
their three declared names, and the third must **pass** although the first two failed. Count alone
is not enough: a runner that reports per file and one that abandons a file at its first failing test
both produce one verdict, so the third test's *verdict* is asserted and not merely its presence. In
a file where everything passes, "the next test still ran" is not a claim about anything — which is
why this row rides `hard-stop-semantics.tflw`, and costs no run of its own.

**What is not claimed.** `import`'s cycle and path-resolution behaviour, and `with each from
"<file.csv>"` — the CSV spelling has real uses elsewhere and its own failure modes, and the table
spelling is what these three rows observe. The four `@tag` runs cost four corpus executions of three
one-step tests, which is the most expensive plant in this file and still under a second.

### `C77`–`C80` — the four declarations about scope and identity, and the one that stays

Step 2c took the declarations that decide *which tests exist*. These four decide *what a test can
see* — its response scope, its callable names, its setup bindings, its credential — and they are the
last rows in the `declaration` family with an observable. After them the family holds one entry.

| construct | the claim nothing here observed | how it is graded |
|---|---|---|
| `action` | a call never publishes its response to the caller (`FU-12`) | run, then assert on `body` **after** the call |
| `use` | one `use` makes `TF037` undecidable for the file | two files, one line apart, under `tflw check` |
| `before` | bare runs per test and shares scope; `file` runs once and is sealed | arrival counts 3 vs 1, plus a file that must not compile |
| `as` | the clause is what authorizes the request | a file that was **already running** the pair |

**Two of these are graded by a refusal rather than a run, which is new in this tier.** `C78`'s second
claim and `C79`'s fourth are both negatives about the *checker*, and the files that would state them
by executing do not exist — they cannot, because they do not compile. So the observation is the
diagnostic, and each ships with a control whose entire diff is one line. That control is not
ceremony: "no `TF037` on the file with `use`" is satisfied exactly as well by a checker that never
emits `TF037` at all, and "`TF030` on a test reading a `before file` binding" says nothing about
`before` unless the identical capture from a *bare* `before` is accepted in the same breath. Each
pair is one keyword apart for that reason.

`C78`'s pair is worth one more sentence, because the obvious optimisation is the bug. The `use`d
module is real, resolvable, and does **not** export the name the fixture calls — and `tflw check` is
required to stay silent anyway. A checker that enumerated the module's exports would report `TF037`
there and be *wrong* by the manifest, since it would have had to execute the code it was checking to
be right. The quiet diagnostic is the correct answer to an undecidable question, not a missed one.

**`C80` needed no fixture, and that is the finding rather than the shortcut.** The discriminating
pair has been running in `tests/examples/sessions-explained.tflw` since long before this milestone:
one `GET /orders/all` at 200 under `as admin`, the same `GET /orders/all` at 401 with no clause, same
file, same run. `M154a` counted that file as evidence of `as` and never asked what it proved. This is
`D722` in a single row — presence is not sufficiency — and it cuts the way that is easy to forget: a
ratchet entry is a missing *sentence* at least as often as it is missing coverage. The grader adds
the one thing the file leaves implicit, requiring both verdicts to have come from the **same**
request, because two tests that merely disagree about a status code are not a pair.

**What is left of `declaration` is one entry and a condition.** `declaration:concurrency` stays on
the ratchet because `parallel` against `sequential` is a claim about two tests overlapping *in time*,
and the arrival counter every plant in this tier leans on counts arrivals rather than their
concurrency — so both settings leave it byte-identical. It needs a server-side overlap watermark in
apiV2: an endpoint that holds a request open and reports the high-water mark of simultaneous holders.
That is real target surface, not a roster row, and the entry rosters when apiV2 has one.

### `C81`–`C91` — the generator family, and the counter nobody had written down

Eleven rows, one plant, and **four runs of it**. The family was scoped as this milestone's expensive
end and it was the expensive end, but not for the predicted reason. The prediction was that each
generator needed an observable built. What it actually needed was a *grader that runs the same file
more than once*: every claim this family makes is about a **relationship between values** — distinct
from each other, identical across a seed, moving with a clock — and a `.tflw` file holds exactly one
run's values and cannot do arithmetic on them.

    A  --seed 4242 --now 2026-07-06     the reference run
    B  --seed 4242 --now 2026-07-06     same seed, same clock  ->  every `random` value repeats
    C  --seed 9999 --now 2026-07-06     same clock, new seed   ->  the seeded values move
    D  --seed 4242 --now 2027-07-06     same seed, new clock   ->  only the clock-derived ones move

D is not redundant with C, and it is the run this repository most lacked. `SPEC` §7.5 makes **two**
promises — one run seed and one run clock — and C alone cannot tell them apart, because a date
derived purely from the seed satisfies it. D separates them: `random date in past` must move by about
a year and `random string 12` must not.

**The family's real known answer is a single shared counter, and it was invisible in 60-odd sites.**
Measured on `fedora-box`:

    unique("W3-Widget")  ->  W3-Widget-0        W3-Widget-1        W3-Widget-2
    unique email         ->  user3@example.test user4@example.test user5@example.test
    unique number        ->  6                  7                  8
    unique uuid          ->  …09350000000c      …33e90000000d      …37d60000000e

`unique email` reads `user3@…` *because the test above it drew three prefixes*. One counter, read by
every `unique` construct, restarting at 0 each run — so two `unique` values are distinct because of
**ordering across the whole run**, not because each construct has a private sequence and not because
of entropy. That also makes them identical across runs, which is the exact opposite of the `random`
group and the reason the two are separate constructs at all. `unique uuid`'s trailing eight hex
digits are that counter, which is what turns v4's usual low collision *probability* into a
guarantee, and the pair `C84`/`C90` is the only place that difference is stated.

`D739`'s cheap/expensive distinction lands here too, from the other side. `random password` has 29
sites in this suite and every one of them posts the value to a registration endpoint — so what they
prove is that **apiV2's** password policy accepts it, which would stay true of a generator emitting
one constant. `unique email` has 32 sites and none says what an address looks like. `unique number`
and `unique like` have **none**: `M154g` step 1's discovery leg found four constructs like that, and
the first move on them is to write a use, not a grader.

**The retry pair is the one to read if only one thing is read.** Inside a single `retry 2` test that
settles on its third attempt, `unique("W3-Retry")` is marked three times as three distinct values
while `random string 10` is marked three times as *one*. `SPEC` §7.2 and §7.3 promise exactly that,
in opposite directions, and it decides which generator an idempotency key may come from — and
nothing in this repository had ever observed either half, because `retry-and-flake.tflw` retries
against a `random string 8` key and passes under both readings.

**`generator:unique-like` was the twelfth, and this table is how it was found.** The counter jumps
8 → 12 above. The three missing ticks were the three `unique like` draws in the test between them:
the construct **advanced the counter and then spent it as a sub-seed**, filling its pattern from the
resulting stream. Two runs at one seed produced the identical triple, and `random like "SKU-####-??"`
→ `SKU-8562-VQ` shared its digits with `unique like "ORD-######"` → `ORD-856286`, which was one
stream being read twice — so its distinctness was 10⁶-probabilistic rather than guaranteed on a
construct whose whole purpose is keys under a uniqueness constraint. Filed as `M154g-07`; **tflw
fixed it on 2026-08-28**, rendering the counter into the pattern's own placeholders through a
permutation keyed by the pattern alone. The gap in the table therefore stays, and now says *sharing*
rather than *loss*. It stayed off the roster until then rather than being rostered against a manifest
saying the opposite, which is the laundering `D722` exists to refuse — and it rostered as `C113` on
the day its stated condition was met, taking the ratchet to zero. **The two claims it is actually
graded on are neither of the two this paragraph could see**; `C113` below is the row.

**The `unique uuid` line above re-derived on 2026-08-29 and the counter tail did not**, which is
tflw's `D815` stated in one row. `unique uuid` drew its random half from the same sub-seed space a
test's own `random` stream is keyed in (`M154g-15`); it has its own domain now, so `9f77` became
`0935` while `0000000c` stayed, because that half is the counter. No other line here moved, and
`SKU-8562-VQ` did not either — `D815` keys the test domain to the mixing identity so every `random`
stream replays bit-for-bit.

The check-time half of four rows lives in `tests/.checkonly/invalid-literal-operand.tflw`, which this
step **extended rather than copied**: `SPEC` §7.3's generator-operand table had seven rows and four
were already dogfooded there, so the remaining three went in beside them. A second file restating
`random number 5 to 1` would have been two sites for one fact, drifting apart. Note what the gate
asks of that file is a different sentence from what `C59` asks: `C59` asks *does `TF054` fire*, and
these rows ask *does **this generator** refuse **this operand***.

### `C92`–`C96` — the config directives, where the fixture holds still and the config moves

Five rows, seven committed configs, and **no stack on any leg**. This is the first group in the
roster whose every claim is about the *config* rather than about a test, and that inverts the plant.
Nothing a `.tflw` file asserts can see which `env` was selected, whether a `defaults` block was
shared, or that a run was refused before it began — by the time a step executes, the selection has
happened and left nothing a step can read. So the fixtures under
`tests/.checkonly/config-directives/` never change and the **config beside them** is the operand
that varies.

**The configs are committed files, not strings in the grader**, which is
`verify-check-diagnostics.mjs`'s own rule applied to the half that is the subject here: *"the
fixture stays a real, readable file in the repo — it is dogfood, not a string in a script"*. When
the config is what the row is about, the config is what has to be reviewable in a diff. Each pair
differs by one line or one indentation level and by nothing else — `defaults-shared.config` against
`defaults-per-env.config` is the same `allow hosts` line in a different block; `exclude-on.config`
against `exclude-off.config` is that line present or absent.

**The diagnostics are the instrument, not the subject.** `TF026`, `TF028`, `TF036` and `TF022` all
appear above, and `C59` already proves by rule that each of them fires. What these rows ask is a
different sentence with the same codes — not *does `TF026` fire* but *does the **active env** decide
which named services exist*. That is the distinction step 3 drew for `TF054`, one family over.

**Every negative control is a second file or a second env, never an argument.** `C92`'s grid would
be equally consistent with `env two` simply being unusable, so `unscoped-session.tflw` is checked
clean under it. `C94`'s `TF028` would be equally consistent with sessions not resolving in that env
at all, so the unscoped session resolves there. `C93`'s positive alone is consistent with an
allowlist that is global wherever it is written, so the line moves and the second env goes quiet.
Five adversarial mutations were run against the finished rows and each landed on exactly one row:
declaring `api extra` in `env two` took `C92` to 2/3 recall, deleting `for env one` took `C94` to
1/3, swapping the shared config for the per-env one took `C93` to 3/4 and 1/2, deleting the
`exclude` line took `C96` to 2/3, and dropping the unreferenced variable took `C95` to 1/3.

**`C95` is the row that found something — and then got its own finding overturned.** `tflw spec
--json` summarises `require` as *"environment variables that must be set before a run starts, so a
missing secret fails at **check time** rather than mid-suite"*. The guarantee is real — the run is
refused before a socket exists, and the refusal names the variable nothing in the config
references, so it is a precondition on the environment rather than a check on use sites. But `tflw
check` over that same config reported *"1 file checked, no problems found"*.

This row filed that as `M154g-11` and argued the repair was **the sentence, never the gate**:
`cli.ts:1520` gates the secrets inside the run path under the comment *"`check` never reaches this
— no execution, no need for real credentials"*, and `P#75` makes doing no I/O the reason `tflw
check` runs in CI with no secrets at all. Moving the gate, the argument went, would contradict both.

**tflw's `M156` reversed it, and the reversal is left visible here on purpose.** Two things the
argument had not checked. `P#75` forbids touching a live **API**, not the filesystem (`D777`), and
`loadAndValidate` had been resolving the environment — `.env` file included — for *both* commands
since M87, so nothing new had to be read. And the far larger point: the gate only ever protected
the names an author remembered to *declare*. An `env(NAME)` no `require env` covers was invisible
to it, and died mid-suite on whichever iteration reached it first — the manifest's own failure
mode, with `require env` present and correct.

`D774` is the rule that decided it, and it is the reusable part: *a divergence is a documentation
defect when the sentence describes a guarantee nothing could deliver at acceptable cost, and an
implementation defect when the guarantee is deliverable and merely absent — and the evidence is a
costed route, not a preference.* What settled it was not the argument but a count. Switching the new
`TF077` on turned **nine of tflw's own documentation samples red**, and reported **sixteen**
undeclared variables in *this* suite across three files that had been green for a year. The docs
were not describing a guarantee the code failed to keep; they were teaching the defect.

What replaces the retired leg is a **pair**: the check now prints an advisory note naming the unset
variables beside *no problems found* and an exit 0 — a note rather than a gate (`D779`), because
erroring would break §3.2's promise that `check` runs without secrets — and, with both set, the note
is **absent**, which is `D776` and is what stops the first leg being satisfied by a line printed
unconditionally.

One thing worth carrying out of the rewrite. The retired assertion was `clean()`, which is
`/no problems found/` — and the note does not disturb that string. **It would still be passing
today**, in a row whose claim had inverted underneath it. A gate that survives the reversal of the
thing it asserts is the failure this corpus exists to catch, found inside the corpus.

The rest of the `config` family — eleven keys and the two Tier 3 probes — is not here. The keys need
a running target and in several cases a paired config with a stack behind it, which is a different
kind of work from anything in this section and is scoped as the rest of step 4.

### The three constructs this tier did **not** roster — and why the reason did not survive

`config:probe:oversized`, `config:probe:traversal` and `matcher:has-no-input-handling-violations`
are Tier 3. `M154f` left them on the ratchet; **`M154g` step 5 rostered them as `C109`–`C111`**, and
the section is kept rather than replaced because half of what it said was right and half of it was a
citation nobody had checked.

**The right half.** Their grader, `scripts/verify-input-acceptance.mjs`, is not missing and not weak:
it states its ledger rows in full, grades the three states apart — including the two *different*
reasons a rule can be not-applicable, which Tier 1's grader cannot distinguish — asserts them, and
exits non-zero. And it ran in **no automated pass**: neither `regression.mjs` nor CI carried it. A row
pointing at a gate nothing runs reads as evidence while nothing evaluates it, which is `M141`'s
vacuity class wearing a roster row, and this repository already refuses it —
`verify-construct-coverage.mjs` fails any plant whose graders are all ungated, in as many words:
*"that is `M137e-01` recurring in a new ledger"*. Holding the three back was correct.

**The half that was wrong.** The *reason* the grader ran nowhere was given as: *a Tier 3 assertion
costs an order of magnitude more requests than a Tier 2 one (`D380`), and that price was judged too
high for every PR.* **`D380` does not decide that.** It decides that the ~45 real test files are
Tier 3's *negative corpus and its volume measurement* — a claim about attaching the tier to a real
suite, which is `scripts/sweep-input-volume.mjs` and its 240 observed requests. That is a different
script, against a different corpus, answering a different question. The grader has a corpus built for
it and prints its own price at the bottom of every run: **7 assertions, 80 extra requests**. No entry
in tflw's `DECISIONS.md` ever placed it outside CI; the only sentence that did was the script's own
closing paragraph, unsourced.

**And the cost is the other way round.** Measured live on `fedora-box` against the full
`VULN_MODE=1` stack: this grader passes — 7 ledger rows, 2 applicability probes, 1 `TF067` probe, 0
failures — in **0.91-1.05 s**. `security-acceptance-gate`, the Tier 1/2 phase every sweep has run
since `M139-5`, costs **1.70-1.99 s** on the same box in the same state. Six runs each, taken on two
days and at two commits, because one triple is a reading rather than a measurement:
0.97/0.97/1.05 against 1.99 at `1e3fa9c`, and 0.97/0.91/0.92 against 1.84/1.70/1.70 at step 5's own
tree. The gate nobody ran was half the price of the gate everybody ran, both times. Filed as
`M154g-13`.

So the remedy needed no new mechanism. `D493` already settled it for Tier 1/2 — put the asserting
script in `regression.mjs` — and `D765` does the same thing one tier over: **`input-acceptance`**, an
ordinary gated phase with `VULN_MODE=1`, beside the sibling it was always the other half of.
Deliberately **not** `M154h`'s `localOnly` venue: `D761` exists for a gate CI genuinely cannot judge,
and a one-second gate against the same Docker stack is not one.

**The rule that came out of it is `D764`: a ratchet condition is audited against the decision it
cites, never read as provenance.** `D739` says what a `RATCHET` entry *asserts*; nothing said what
its stated condition has to *be*. It has to name a requirement, and a decision it cites has to
actually state that requirement. A `D`-number in a sentence reads as already-checked, and for two
milestones that is exactly what it bought.

### `C97`–`C108` — the config keys, and the split inside the family that step 4a got wrong

Step 4a's handoff predicted that every one of the eleven `config:key:*` entries needs a running
target. **Seven of them need no stack at all**, and the reason is what a config key actually claims:
it is a statement about *the request tflw was about to make*, so the place it is readable is the
**wire**. `arrival-server.mjs` is that wire — `D745`'s target, chosen for `C3` and the perf tier on
the argument that a real target with a database measures the database rather than tflw.

Three things were added to it, each for one claim a counter cannot answer:

- a **per-arrival header log**, because `C98`'s manifest sentence is *"a request header sent on every
  `api` step"* and **every** is a per-request question — a header attached to the first request of a
  run satisfies any total;
- a **`/gate` rendezvous** that holds a request until a second joins it or its deadline passes, and
  reports the high-water mark of simultaneous holders. That is the overlap watermark, and it grades
  `C101` *and* `C104`;
- **nothing at all** for `C100`, which needs only that the server would have recorded an arrival had
  one been sent. An absence is only provable against something that would have shown a presence.

**`C104` is not a config key**, and it is here because the rendezvous is the endpoint its own
`RATCHET` condition asked for. That condition read *"needs a server-side overlap watermark … rosters
when apiV2 has one"*. The watermark was the right requirement and apiV2 was the wrong address —
`D745` had already answered why. One endpoint, two entries, and the deadline changes only how long
the serialized leg takes (~3 s against ~30 ms), never which answer it gives.

**Two of the seven had zero occurrences anywhere in this repository** — `report` and `workers` — and
`header` had one, written for `C95` a step earlier. These are the rare `RATCHET` rows where the entry
really did mean *unexercised* rather than `D739`'s usual *unrostered*: every other `header` line in
this repo is inside a `session` block, which is a different construct.

**`C105`–`C108` are the other four, and they are a different kind of work.** `insecure`, `cert` and
`key` are claims about a TLS handshake and `web` is a claim about which application a browser
reached; none is readable off a wire, so all four need the compose stack — the nginx sidecar's two
listeners and both webV2 apps. What they share is the shape `D739` is sharpest about: **each already
had a positive running in this suite and no negative.** `env secureLocal` passes whether or not
`insecure` does anything; `mtls.tflw` and `mtls-rejection.tflw` are a pair split across two envs and
two files, so nothing said they were a pair; and the admin suite passing is equally consistent with
both webV2 apps being served from one port. Every row here moves **one config line over one
unchanged fixture** and states what the other side looks like.

`C107` is the hardest of the four to state alone, because deleting `key` deletes `cert`'s answer
too. So it is **moved rather than removed**: `server.key` is a real, well-formed private key the same
container generated, and it does not belong to `client.pem`. The run then fails at the *transport*,
before any HTTP status exists — which is precisely what tells it from `C106`'s server-chosen 400.

**The grader copies the three PEM files beside the config rather than pointing at `nginx/certs/`**,
because `cert`/`key` resolve against the config's own directory (`M104-01`, `D183`) and the container
reissues all three at every start. That property found a live defect in the offload driver while
these rows were being written: `scripts/exec.mjs`'s rsync had no exclusion for `nginx/certs/`, so an
`exec` against an already-running stack pushed this machine's stale copies over the ones the
container had just issued — and the resulting failure is `400 No required SSL certificate was sent`,
i.e. indistinguishable from the negative case `C106` exists to prove. Recorded as `M154g-12`.

### `C109`–`C112` — the four rows the ratchet's own conditions were hiding

These four did not become gradable in step 5. **They were gradable all along**, and the ratchet said
otherwise in four sentences nobody had audited. Acceptance clause 5 asked whether a ceiling of five
conditioned entries was the floor; taking that as a judgement meant reading each condition as a claim
to be checked rather than as a note already checked by whoever wrote it, and four of the five did not
survive. The floor is **1**.

**`C109`, `C110`, `C111` — three conditions, one bad citation.** All three read *"their rules are
Tier 3's pack, so the only script that grades them is the one nothing runs"*, resting on a cost claim
attributed to `D380`. The section above has the full retraction; in one line, `D380` is about the
whole-suite volume sweep and not about this grader, and the measurement inverts the price anyway.
They are rostered **by reference** against `scripts/verify-input-acceptance.mjs`, exactly as
`C51`–`C58` are rostered against the Tier 1/2 grader and for the same reason (`D752`, and `D724`'s
cite-don't-duplicate one axis over): that script already states its known answers as *data* —
`LEDGER`, `APPLICABILITY_PROBES`, `TF067_PROBE` — and restating them as prose here would be a copy
with no guard.

**The citation is checked from both ends, and on what the run actually did.** The grader ends by
deriving which constructs this run answered and comparing that set against the rows claiming it, in
both directions. Answered is derived from **states demonstrated**, never from a line being reached —
`M154f-03`'s open half is that the Tier 1/2 grader's `answers(...)` records a code path, which a
grader asserting nothing would also reach. Here each of the two config keys needs a *pair*: the same
rule firing where the config grants the opt-in and standing down, naming the missing word, where it
does not. A run that only ever fired, or only ever stood down, answers neither.

**`C112` — the condition that was never a requirement at all.** `matcher:was-made` sat on the ratchet
under *"a browser-network assertion and does not belong in an API fixture — it rosters with the UI
work, not here"*. "The UI work" is `M154d`, which **closed**. So the sentence was an **address**, and
an address goes stale silently while still reading like a live condition — the purest form of the
`declaration:concurrency` mistake step 4b found, which at least named the right requirement at the
wrong door. The requirement it meant is a browser fixture with observable network traffic, and both
halves already existed: `tflw-acceptance/webv2/tflw/02-checkout-iframe-network.tflw` runs one, and
`C108` had already proved this harness can drive and grade a browser tier.

What the construct's three existing uses could not do is **fail**. All three are positive — *this
request was made* — so a matcher that answered `true` for anything observed, that ignored the `with
method` clause, or that read the runner's own request log instead of the browser's would satisfy
every one of them. `D739` at its sharpest, and the same shape `C105`–`C108` had: the evidence was
everywhere and could not have caught the defect.

So the plant is a **grid on one page load**, not a pair. `tests/.constructs/network-was-made.tflw`
opens the storefront's catalog page and then asserts four things whose only overlap is the matcher
itself — one URL the page fetched, the same URL under a method it did not use, a URL it never
touched, and a `/health` request **tflw's own runner** sent before the browser started. No single
wrong implementation satisfies all four. The two `check` rows at the end are those same assertions
with the negation dropped: they must fail, in that same run, so the wrong answers are demonstrated
reachable rather than assumed to be — the control step 2 established and every step since has paid
for.

### `C113` — the last ratchet entry, and the only one another repository cleared

`generator:unique-like` was the twelfth member of a family whose other eleven rostered together in
step 3, and it stayed behind on a condition: *rosters when tflw's `unique like` embeds the counter,
or when the manifest stops promising it does*. On 2026-08-28 tflw did the first. The row follows,
and the ratchet is **empty** — `RATCHET_CEILING` is `0`.

**That is the case for writing conditions instead of dates.** Four of the five entries alive at step
5 died of a bad citation, which is why `D764` exists; this one is the other outcome. Its condition
named a requirement rather than an address, the requirement was legible to somebody who did not
write it, and when the sibling repository met it there was no judgement left to make. An entry whose
exit is a sentence someone else can satisfy is a debt with an address. Nothing here was waived,
re-worded, or aged out.

**What this plant did while it waited was find the defect.** The eleven-row grader reads the counter
off the constructs either side of `unique like` and asserts the gap — 8 to 12, three ticks for three
draws. Those ticks were real and the values did not carry them: the construct advanced the shared
counter and then spent it as a *sub-seed*, filling its pattern from the resulting stream. So its
distinctness was 10⁶-probabilistic on a construct whose entire purpose is keys under a uniqueness
constraint, and `SPEC` §7.2's bolded retry clause was false for it. Filed as `M154g-07`, fixed in
tflw, and the ledger row's own account of the mechanism was corrected in the same pass — it said the
counter was *discarded*, and it was spent.

**The row is not graded on the thing the plant asserts in-band.** `expect {a} not equals {b}` across
three draws is the assertion that passed for a year against an implementation with no guarantee
behind it, and it would pass again tomorrow against the same one: a sample of three cannot tell a
guarantee from a high probability. `D722` in its sharpest form yet — not *presence is not evidence*
but **a passing assertion is not evidence**, when what it samples is the thing in question.

So the two graded claims are both invisible to a single run. The first is **seed-independence**:
`unique like` must return the identical value under a second seed and a moved clock, which places it
with `C81`–`C84` and against `C89`. That matters more than it sounds, because `random like` shares
this construct's pattern language, its shape, and the grader's own regex — *which run moves the
value is the only thing that tells the two constructs apart*, and nothing in either repository
asserted it. It is also the claim that caught the fix's own first draft, which keyed the pattern
permutation on the run seed and would have made one member of a family of five move under `--seed`.
The second is the **retry** clause, read off the same `retry 2` test that grades `C81` and `C88`:
three distinct values marked once each, where `random string` beside them is one value marked three
times.

**That mark was written at step 3 and read for the first time here, and reading it corrected the
record.** `M154g-07` asserted twice — in the ledger row and in this plant's own header — that
`SPEC` §7.2's bolded retry clause was *false* for `unique like`. It never was. The claim followed
from the mechanism theory the row also got wrong: if the pattern came from the test's replayed
`random` stream, a retried attempt would reproduce the earlier value, and the clause would fail. But
the old build keyed its RNG on `uniqueSeq.next()` — the *shared* counter, which advances across a
retried test's attempts — so the three values already differed. The construct was probabilistic and
seed-dependent; it was never a retry hazard.

The instrument that would have settled it was **built here at step 3 and never consulted**:
`g3r|unique-like|{el}` has been posted by every run of this plant since, and no grader read the
slot. So the same file simultaneously carried a claim and the measurement refuting it, for two
milestones. `D722` says presence is not evidence; this is the sharper form — *an observation nobody
reads is not evidence either*, and it is worse than an absent one, because the file looks like it
already checked. Two lines of grader is the whole cost, and the reason it went unwritten is that
the claim it would have tested was one nobody doubted.

## Blocked plants (`D734`)

A plant that goes red because tflw is genuinely broken **keeps its row**, gets a row in tflw's
ledger, and is marked `blocked-on:<row>` here — counted as *covered but currently failing for a
known reason*, never deleted and never quietly moved to the ratchet. Without this convention, this
ledger's successes and its bugs look identical.

**None at present**, and every plant passes. `C1`–`C50` were last measured 2026-08-25 (the first three against tflw `5cba2da`, `C4`–`C12` against
the `M154c` build that added the `declaration` family, `C13`–`C43` against `M154c`'s `main`,
`C44`–`C50` against `M154d`'s); `C51`–`C91` on `fedora-box` 2026-08-26/27 across `M154f` and
`M154g`'s first three steps; `C92`–`C96` on 2026-08-28, and those five need no stack at all;
`C97`–`C108` on `fedora-box` 2026-08-28 with step 4b; `C109`–`C112` there the same day with step 5 —
the three Tier 3 rows through `verify-input-acceptance.mjs` (7 ledger rows, 2 applicability probes,
1 `TF067` probe, 0 failures, `D752` index resolving both ways) and `C112` at recall 4/4, precision
3/3.

This paragraph carried a **count** for four milestones — *"All fifty plants pass"* through three that
added forty of them, then a corrected number that was stale again within a step. The count is now
gone rather than corrected a third time, which is `D767`: a number in prose that no gate reads is a
copy with no guard, so the repair is to stop asserting it, not to re-derive it. The plant total is
`verify-construct-coverage.mjs`'s to state, and it states it on every run.

The stale sentence is worth one line of memory even so, because it is the same defect the ratchet
exists to catch, one level up. That gate checks `CONSTRUCTS.md` documents exactly the plants the
manifest module defines, so a missing *row* is caught — a stale *sentence* was not. `M154g-03`'s
class, on this side of the pair.

`M154e-01` was likewise **not** a `blocked-on` marking, for the same reason `M154b-02` is not: `C48`
was green. The defect was in the manifest's *description* of `cleanup`, not in `cleanup`, and the
plant graded the construct the runtime implements. What the row would have blocked is a plant
written the way `D723` says to write one — from the manifest — which is why it was recorded beside
`C48` rather than under it. Closed by `M157` (see above); the reasoning is kept because the
distinction it draws — a row beside a plant rather than under it — is what the marking is for, and
it outlives the row that occasioned it.

`M154b-02` is deliberately **not** a `blocked-on` marking. `D734` reserves that for a plant that
goes red for a known tflw defect, and `C2` is green; the defect sits beside the plant, not under it.
Recording an unreachable language case as a blocked assertion would make this row look like
outstanding work when what it actually is, is a gap with a ledger row.
