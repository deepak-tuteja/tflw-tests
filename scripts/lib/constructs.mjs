// The construct ledger: which of tflw's constructs this dogfood grades with a known answer, which
// it does not yet, and what each plant is the answer to.
//
// `M154b`, testFlow `PLAN_M154_DOGFOOD_CONFORMANCE.md` (`D722`–`D732`, and `D739`–`D741` below).
// Direct sibling of `scripts/lib/plants.mjs`, deliberately: that file did this for the pentest
// arc's eighteen planted weaknesses, and `D724`'s whole content is *generalize `VULNS.md` past
// security*. The design decisions it argues — this file is the source and the markdown is checked
// against it (`D489`), the grader-vs-gradee axis that makes importing this not a mirroring
// violation (`D488`), a retired row stays and is asserted absent (`D492`) — are adopted here rather
// than re-argued, and where this file departs from it the departure is written down.
//
// ## What the two lists below are, and why there are two
//
// `PLANTS` is the roster: one row per construct this repository grades with a **known answer** —
// a deliberate defect or a deliberate arrangement whose expected verdict is written down, so the
// row could go red. `D722` sets that bar and rejects the presence-only alternative explicitly,
// because under presence-only the fourteen constructs with exactly one occurrence each are already
// green and the whole milestone is a formality.
//
// `RATCHET` is everything else tflw ships. It is `D730`'s "uncovered list that may only shrink",
// and its point is not the coverage — it is the **anti-regression property**: a construct that
// arrives in `tflw spec --json` and appears on neither list turns this gate red on the day it
// ships. That property is the one that actually decayed. Nothing was watching, seven step keywords
// reached zero occurrences, and four of six workload shapes were never executed by anything.
//
// **`D739` — "uncovered" here means *unrostered*, and the distinction is load-bearing.**
// `step:api` is on `RATCHET` and it has 1139 occurrences. `expect` has 1692. Reading the list as
// "constructs this suite never exercises" would be false of a good third of it, and a list nobody
// believes is a list nobody defends. What a `RATCHET` entry says is exactly this: *no row in
// `CONSTRUCTS.md` states what its known answer is.* For the well-exercised constructs of the
// census's §2.4 that will usually be a cheap row to write, because the evidence already exists and
// only the claim is missing; for the seven at zero it is a plant that does not exist yet. Both are
// unrostered, they cost very different amounts, and the gate deliberately does not pretend to know
// which is which — that is what the milestones after this one are for.
//
// **`D740` — the ceiling is what gives "may only shrink" teeth.**
// `RATCHET` is a tracked list, so growing it is a visible diff. That is social, not mechanical, and
// this pair of repositories has a documented history of properties that held because nobody got
// round to breaking them. `RATCHET_CEILING` is a pinned integer the list's length must not exceed,
// on `scripts/verify-test-counts.mjs`'s `EXPECTED` model — the precedent `D730` names. Adding an
// entry therefore requires two edits in two places, and the second one is a number going *up* in a
// file whose entire purpose is that it goes down. Lowering it is the ordinary business of every
// milestone after this one and needs no ceremony.

/** The scripts that grade this ledger. Same shape and same purpose as `plants.mjs`'s `GRADERS`:
 *  `gated` is the field with teeth, because a row whose only grader runs by hand is a row nobody
 *  grades on any day nobody was looking — which is `M137e-01` exactly, filed against the previous
 *  ledger for the same reason. */
export const GRADERS = {
  coverage: { script: 'scripts/verify-construct-coverage.mjs', phase: '(acceptance-check job)', gated: true },
  acceptance: { script: 'scripts/verify-construct-acceptance.mjs', phase: 'construct-acceptance', gated: true },
  // `M154f` (`D752`). The security tier is not graded by `verify-construct-acceptance.mjs` and should
  // not be: three gates already grade it, they have graded it for six milestones, and each states its
  // known answers as *data* — `LEDGER`, `DECLINES`, `APPLICABILITY_PROBES` — rather than as prose in a
  // plant row. `D724` folds `VULNS.md` in by reference rather than by duplication; this is the same
  // move on the construct axis, and `D752` is what makes the reference an assertion instead of a
  // claim.
  security: { script: 'scripts/verify-security-acceptance.mjs', phase: 'security-acceptance-gate', gated: true },
  redaction: { script: 'scripts/verify-redaction.mjs', phase: 'safety-redaction-check', gated: true },
  diagnostics: { script: 'scripts/verify-check-diagnostics.mjs', phase: 'check-diagnostics', gated: true },
};

/**
 * One row per construct with a known answer.
 *
 * `construct` is the **manifest id**, matched exactly against `tflw spec --json`. It is opaque by
 * tflw's own contract (`M154a`, `spec-data.ts`): unique across the manifest and stable across
 * builds, and *not* to be split apart for its family or name. So this file never parses it —
 * `family` below is its own field, stated rather than derived.
 *
 * `evidence` names the file that carries the plant and the spelling that must appear in it. That
 * pair is the cheap half of the gate: a row whose test was deleted, renamed, or quietly rewritten
 * to stop using the construct goes red statically, in seconds, without a stack.
 *
 * `knownAnswer` is prose for `CONSTRUCTS.md` and for a reader looking at a red. The machine form of
 * it lives in the grader, because it is three different shapes for three different tiers and
 * flattening them into data here would just move the grader into this file.
 *
 * `blockedOn` is `D734`: a plant that goes red because tflw is genuinely broken keeps its row, gets
 * a ledger row in tflw, and is named here — counted as *covered but currently failing for a known
 * reason*, never deleted and never quietly moved to `RATCHET`. Without it, this milestone's
 * successes and its bugs look identical.
 */
export const PLANTS = [
  {
    id: 'C1',
    construct: 'step:check',
    family: 'step',
    tier: 'api',
    title: 'the soft assertion records a failure and keeps going',
    target: 'apiV2/src/soft-check/ — `GET /v1/soft-check/known-answer`, a frozen six-field payload',
    evidence: { file: 'tests/.constructs/soft-check-known-answer.tflw', pattern: '^\\s*check\\s+\\S', min: 6 },
    graders: ['acceptance'],
    knownAnswer:
      'Six `check` rows, of which exactly two fail — `body.currency` and `body.falsy` by name — and ' +
      'the `expect status equals 200` after them runs and passes. A `check` that failed fast would ' +
      'produce four rows and no `expect`; one that recorded nothing would produce six rows, zero ' +
      'failures and a passing test. All three exit non-zero-or-zero in ways a summary line cannot tell apart.',
    catches: '`check` regressing to `expect` semantics, or to no semantics.',
    blockedOn: null,
  },
  {
    id: 'C2',
    construct: 'step:accept',
    family: 'step',
    tier: 'ui',
    title: 'the dialog handler is armed, and is one-shot',
    target: "webV2/admin — the bulk out-of-stock delete's two short-circuited `confirm()`s",
    evidence: { file: 'tests/.constructs/dialog-one-shot.tflw', pattern: '^\\s*accept dialog\\s*$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Two states of the same click, and the pair is the claim. With nothing armed the first confirm ' +
      'is dismissed by default and `#bulk-delete-state` reads `cancelled`; with one `accept dialog` ' +
      'the first is accepted by the armed handler, the second falls through to the default, and the ' +
      'state reads `cancelled-final`. A step that armed nothing would leave `cancelled` both times; ' +
      'a handler that stayed armed would navigate away and produce neither.',
    catches: 'a handler that stays armed, and a step that arms nothing.',
    // The third state — both confirms accepted — is **unreachable**, not merely unasserted: see
    // `M154b-02`. `blockedOn` stays null deliberately. `D734` reserves it for a plant that goes red
    // for a known tflw defect, and this plant is green; the defect is next to it, not under it.
    // Recording an unreachable case as a blocked assertion would make the row look like outstanding
    // work when what it actually is, is a language gap with a ledger row.
    blockedOn: null,
  },
  {
    id: 'C3',
    construct: 'step:run',
    family: 'step',
    tier: 'workload',
    title: 'count-bounded load lands exactly the count it was given',
    target: 'tflw-acceptance/conformance/arrival-server.mjs — a standalone counter, no stack behind it',
    evidence: { file: 'tflw-acceptance/conformance/iterations.tflw', pattern: '^\\s*run\\s+\\d+\\s+iterations\\b', min: 2 },
    graders: ['acceptance'],
    knownAnswer:
      '`run 60 iterations across 6 users` lands exactly 60 requests on `/shared`; ' +
      '`run 12 iterations per user across 5 users` lands exactly 60 on `/per-user`. Equal totals by ' +
      'unequal arithmetic, on distinct paths, so neither spelling can be satisfied by the other’s ' +
      "traffic — and the count is read from the server's own arrival counter, never from tflw's " +
      'report. Repeated under `--workers 1` and `--workers 4`, which is the "independent of ' +
      '`--workers`" half of the contract stated in `tflw spec`.',
    catches: 'a mis-paced or miscounted generator that still reports green, and a dropped `per user`.',
    blockedOn: null,
  },
  {
    id: 'C4',
    construct: 'declaration:retry',
    family: 'declaration',
    tier: 'api',
    title: 'the retry budget is three attempts of the whole test, and it is bounded at both ends',
    target: 'apiV2/src/lifecycle/ — a per-key attempt counter and a mark counter, read back after the run',
    evidence: { file: 'tests/.constructs/retry-attempt-budget.tflw', pattern: '^test .* retry 2$', min: 2 },
    graders: ['acceptance'],
    knownAnswer:
      'Two keys, one inside the budget and one past it. `c4-settles` answers 200 on attempt 3 and ' +
      'its test passes `flaky`; `c4-exhausts` answers 200 on attempt 4 and its test ends red — and ' +
      'BOTH keys are attempted exactly 3 times. A `retry N` meaning *N total attempts* never reaches ' +
      'the first; a retry that ignored its budget passes the second. The `c4-preamble` mark, set by ' +
      'the step BEFORE the one that fails, reaches 3: that separates re-running the whole test from ' +
      're-running the failing step, which every existing endpoint settles identically under.',
    catches: 'an off-by-one retry budget, an unbounded retry, and a step-level retry wearing a test-level spelling.',
    blockedOn: null,
  },
  {
    id: 'C5',
    construct: 'declaration:after',
    family: 'declaration',
    tier: 'api',
    title: 'teardown runs in both scopes, and runs for the test that failed',
    target: 'apiV2/src/lifecycle/ — two labelled counters the hooks mark instead of cleaning up',
    evidence: { file: 'tests/.constructs/after-hook-scopes.tflw', pattern: '^after( file)?$', min: 2 },
    graders: ['acceptance'],
    knownAnswer:
      '`c5-after-file` == 1 and `c5-after-test` == 2, over a file whose second test ends red on ' +
      'purpose. Three defects fall out of those two integers: a hook that never runs leaves 0, one ' +
      'that skips failed tests leaves 1, and an `after file` implemented at test scope leaves 2. ' +
      'The second is the clause `tflw spec` states for this construct — *runs whether the test ' +
      'passed or failed* — and nothing in this repository had ever observed it.',
    catches: 'a teardown that silently does not run, and the two hook scopes collapsing into one.',
    blockedOn: null,
  },
  {
    id: 'C6',
    construct: 'matcher:fails',
    family: 'matcher',
    tier: 'api',
    title: 'a transport failure, and not an HTTP error response',
    target: 'port 9 under `env unreachableHost`, against `/flaky-widget`\'s first-attempt 503 under `env local`',
    evidence: { file: 'tests/.constructs/request-fails-live-control.tflw', pattern: '^\\s*expect request fails\\b', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Two runs under two envs, and the pair is the claim. Against a closed port `fails` passes; ' +
      'against a server that answered 503 it MUST NOT, and the red must land on that line rather ' +
      'than on the 503 above it. `SPEC` §6.2.2 puts this matcher at the transport layer, and a ' +
      '`fails` that treated any non-2xx as a failure passes every existing test in this repository ' +
      '— the closed-port one included — while reclassifying every 4xx and 5xx in the suite.',
    catches: 'a `fails` matcher that has drifted from the transport layer up to the status code.',
    blockedOn: null,
  },
  {
    id: 'C7',
    construct: 'matcher:connects',
    family: 'matcher',
    tier: 'api',
    title: 'the complement of `fails`, asserted on both sides of the same boundary',
    target: 'the same two runs as `C6` — this is one plant graded as two claims, not two plants',
    evidence: { file: 'tests/.constructs/request-fails-unreachable.tflw', pattern: '^\\s*expect request connects\\s*$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      '`connects` fails against the closed port and passes against the 503 — the exact inverse of ' +
      '`C6` on the same two requests. Rostered here rather than left on the ratchet because the ' +
      'plant already grades it: asserting only that `fails` passes where it should would be ' +
      'satisfied by a matcher that passes unconditionally, so the complement is what rules that out ' +
      'and it costs one row to say so.',
    catches: 'a `connects` that is a tautology, and the pair drifting apart.',
    blockedOn: null,
  },
  {
    id: 'C8',
    construct: 'generator:transform-base64',
    family: 'generator',
    tier: 'api',
    title: 'the standard alphabet, not the URL-safe one',
    target: 'none — a pure value transform, graded against a literal (see `D743`)',
    evidence: { file: 'tests/.constructs/value-transforms.tflw', pattern: '^\\s*let encoded = base64 encode\\(', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      '`base64 encode("M154c xÿ?>~a+b/c d=e")` is `TTE1NGMgeMO/Pz5+YStiL2MgZD1l` — an input chosen ' +
      'so the output carries BOTH `+` and `/`, the two characters the URL-safe alphabet spells ' +
      'differently. Derivable rather than merely observed: `TF054` refuses a URL-safe literal to ' +
      '`base64 decode`, so an `encode` emitting one would produce output its own `decode` rejects. ' +
      'The decode direction is checked against a hand-written literal, not against `encoded`, so ' +
      'the pair cannot be wrong in the same direction twice and still pass.',
    catches: 'an alphabet swap, which every round-trip test in this repository passes.',
    blockedOn: null,
  },
  {
    id: 'C9',
    construct: 'generator:transform-hex',
    family: 'generator',
    tier: 'api',
    title: 'lowercase digits, two per byte, over a multi-byte input',
    target: 'none — a pure value transform, graded against a literal (see `D743`)',
    evidence: { file: 'tests/.constructs/value-transforms.tflw', pattern: '^\\s*let encoded = hex encode\\(', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      '21 bytes of UTF-8 to 42 lowercase digits, `4d31…3d65`, with `ÿ` as `c3bf` — so this is ' +
      'asserted as a byte transform rather than a character one. **The case is pinned by this plant ' +
      'and by nothing else**: `SPEC` §7.6 does not state it. Recorded as `M154c-02` in tflw rather ' +
      'than asserted here as though it were specified, because a plant that quietly promotes an ' +
      'implementation detail to a contract is how a spec gap becomes invisible.',
    catches: 'an uppercase drift, and a character-level transform mistaken for a byte-level one.',
    blockedOn: null,
  },
  {
    id: 'C10',
    construct: 'generator:transform-url',
    family: 'generator',
    tier: 'api',
    title: 'encodeURIComponent, not form-urlencoding',
    target: 'none — a pure value transform, graded against a literal (see `D743`)',
    evidence: { file: 'tests/.constructs/value-transforms.tflw', pattern: '^\\s*let encoded = url encode\\(', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Three discriminators in one literal: space is `%20` and not `+`, `~` is left alone and not ' +
      '`%7E`, and `+`/`/`/`=` are all escaped where `encodeURI` would leave them. Fully ' +
      'spec-derived — `SPEC` §7.6 names `encodeURIComponent` outright — which makes this the one ' +
      'transform whose known answer needed no judgement at all.',
    catches: 'form-urlencoding and `encodeURI`, the two near-misses a round trip cannot see.',
    blockedOn: null,
  },
  {
    id: 'C11',
    construct: 'matcher:matches-file',
    family: 'matcher',
    tier: 'api',
    title: 'byte equality that actually discriminates',
    target: 'apiV2/src/uploads/ — the golden file round-tripped, compared against itself and against a near miss',
    evidence: { file: 'tests/.constructs/bytes-near-miss.tflw', pattern: '^\\s*expect body bytes matches file\\b', min: 2 },
    graders: ['acceptance'],
    knownAnswer:
      'Two 34-byte files — `A U+00A0 B` against `A SP SP B` — of **identical length**, differing in ' +
      'two bytes, and indistinguishable in any editor or diff. The first comparison passes and the ' +
      'second MUST fail. `file-formats.tflw` has used this matcher on three formats since `F2`, but ' +
      'every one of them compares a file against itself: a `matches file` returning true ' +
      'unconditionally passes all three, and so does one that compares lengths.',
    catches: 'a matcher that has stopped comparing bytes — which no existing use could notice.',
    blockedOn: null,
  },
  {
    id: 'C12',
    construct: 'step:give',
    family: 'step',
    tier: 'api',
    title: 'the named value, and not the two other values in reach',
    target: 'apiV2/src/soft-check/ — `C1`\'s frozen constant, reused so no seed or fixture is involved',
    evidence: { file: 'tests/.constructs/action-give.tflw', pattern: '^\\s*give\\s+\\S', min: 2 },
    graders: ['acceptance'],
    knownAnswer:
      'The action gives `first` and captures `second` afterwards, and the caller binds `first` too, ' +
      'to a different string. So three named wrong answers exist and each has its own assertion: ' +
      '`caller-value` if scoping leaked, `EUR` if `give` returned the last capture rather than the ' +
      'named expression, and a missing suffix if a parameter never arrived. The only live `give` in ' +
      'this repository feeds a path segment — it can catch a `give` returning nothing, and nothing else.',
    catches: 'a `give` returning the wrong value rather than no value.',
    blockedOn: null,
  },
  // ---------------------------------------------------------------------------------------------
  // `M154d` — the UI tier opens with one artifact and ten rows, because six of tflw's locators and
  // three of its steps cannot be graded apart from each other. See
  // `tests/.constructs/locator-near-miss.tflw`'s header for the full argument; the short version is
  // that `button`/`text`/`css`/`field` carry 93/92/69/65 uses between them and **not one of those
  // uses could tell "resolved the right element" from "resolved an element"**, because every one of
  // them names something unique on its page.
  // ---------------------------------------------------------------------------------------------
  {
    id: 'C13',
    construct: 'locator:button',
    family: 'locator',
    tier: 'ui',
    title: 'the button, and not the three decoys wearing its text',
    target: 'webV2 `/locator-fixture` — one `<button>` and three same-text decoys with different roles',
    evidence: { file: 'tests/.constructs/locator-near-miss.tflw', pattern: '^\\s*click button "Archive', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'A link, a `menuitem` and a bare `<div>` all carry the identical accessible text "Archive ' +
      'shipment", and each writes its own token. The answer is `button/true`. A `button` locator ' +
      'that had degenerated into a text search reports a decoy\u2019s token or hard-errors on ' +
      'ambiguity \u2014 and would still pass all ninety-three existing uses, which name things that ' +
      'are unique on their page.',
    catches: 'a `button` locator that stopped resolving by role.',
    blockedOn: null,
  },
  {
    id: 'C14',
    construct: 'locator:text',
    family: 'locator',
    tier: 'ui',
    title: 'rendered content, not the four attributes that spell the same phrase',
    target: 'webV2 `/locator-fixture` — the phrase repeated in a `value`, an `alt`, a `title` and an `aria-label`',
    evidence: { file: 'tests/.constructs/locator-near-miss.tflw', pattern: '^\\s*click text "', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Only the `<p>` renders "Restock queued" as text; four decoys carry it somewhere a content ' +
      'match must not look. The answer is `text/true`, and any attribute starting to match makes ' +
      'the step ambiguous rather than merely wrong. The decoy input is deliberately `type="text"`: ' +
      'Playwright\u2019s text engine matches `input[type=button|submit]` by `value` **by design**, so ' +
      'making it a submit would turn a correct engine red.',
    catches: 'a `text` locator that widened past rendered text content.',
    blockedOn: null,
  },
  {
    id: 'C15',
    construct: 'locator:field',
    family: 'locator',
    tier: 'ui',
    title: "`D6`'s cascade has a fixed priority, and this is the only thing that grades the order",
    target: 'webV2 `/locator-fixture` — two inputs answering to "Ship to", one by `<label>` and one by placeholder',
    evidence: { file: 'tests/.constructs/locator-near-miss.tflw', pattern: '^\\s*fill field "Ship to"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '`field` is a closed three-step cascade \u2014 label, then placeholder, then `role=textbox` \u2014 ' +
      'checked in that fixed order every poll (`D6`, `browser.ts:579`). The label input must receive ' +
      '`GLASGOW` and the placeholder decoy must still hold `UNTOUCHED`. **An order that flipped would ' +
      'pass all sixty-five existing `fill field` uses in this repository**, because no other page ' +
      'collides a label with a placeholder.',
    catches: 'a reordered or short-circuited `field` cascade.',
    blockedOn: null,
  },
  {
    id: 'C16',
    construct: 'locator:list',
    family: 'locator',
    tier: 'ui',
    title: 'the named list, told from its twin only by its accessible name',
    target: 'webV2 `/locator-fixture` — two `<ul>`s, each holding a button named exactly "Remove"',
    evidence: { file: 'tests/.constructs/locator-near-miss.tflw', pattern: '^\\s*within list "', min: 2 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Zero uses before this file. Both lists hold a button named "Remove", so an unscoped click on ' +
      'it is ambiguous **by construction** \u2014 the pair of assertions can only pass if `list` picked ' +
      'the list its accessible name names. Answers `list/items` then `list/suppliers`, in that order; ' +
      'either one alone would be satisfied by a locator that ignored the name.',
    catches: 'a `list` locator that resolves any role=list rather than the named one.',
    blockedOn: null,
  },
  {
    id: 'C17',
    construct: 'locator:css',
    family: 'locator',
    tier: 'ui',
    title: 'the third of four identical siblings, not the first',
    target: 'webV2 `/locator-fixture` — four `<li>`s whose buttons are indistinguishable by name',
    evidence: { file: 'tests/.constructs/locator-near-miss.tflw', pattern: '^\\s*click css "\\[data-group-list=\'css\'\\]', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'The four buttons are identical in text and role, so `:nth-child(3)` is the entire answer. ' +
      '`css/3`. A resolution that quietly took the first match reports `css/1` \u2014 a failure mode ' +
      'invisible to all sixty-nine existing `css` uses, which select things that are unique anyway.',
    catches: 'a `css` locator that stopped honouring structural position.',
    blockedOn: null,
  },
  {
    id: 'C18',
    construct: 'locator:xpath',
    family: 'locator',
    tier: 'ui',
    title: "the `xpath=` prefix is load-bearing, and a leading `//` hides that",
    target: 'webV2 `/locator-fixture` — four indistinguishable buttons, answered by `last()`',
    evidence: { file: 'tests/.constructs/locator-near-miss.tflw', pattern: '^\\s*click xpath "\\(//', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Zero uses before this file. Playwright auto-detects a selector beginning with `//` or `..` as ' +
      'XPath, **so an implementation that forgot `browser.ts:590`\u2019s `xpath=` prefix would still pass ' +
      'an xpath test written the usual way.** The expression here opens with `(`, which defeats the ' +
      'auto-detect and would be parsed as CSS; `last()` is the second half, since CSS cannot express ' +
      'it over a parenthesised group. Answer `xpath/4`.',
    catches: 'a dropped `xpath=` prefix, which a `//`-leading expression cannot see.',
    blockedOn: null,
  },
  {
    id: 'C19',
    construct: 'step:within',
    family: 'step',
    tier: 'ui',
    title: 'the scope narrows the search, proven by an inner name that is ambiguous outside it',
    target: 'webV2 `/locator-fixture` — the same button name in both lists',
    evidence: { file: 'tests/.constructs/locator-near-miss.tflw', pattern: '^\\s*within ', min: 2 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Twenty-five uses before this file and none of them could fail for the right reason: each ' +
      'scopes to a container whose inner locator would have resolved uniquely on the whole page ' +
      'anyway, so a `within` that scoped to nothing would pass them all. Here the inner ' +
      '`click button "Remove"` is ambiguous at page scope \u2014 tflw hard-errors on N>1 (`D7`) \u2014 so a ' +
      'lost scope is a red step, not a wrong element.',
    catches: 'a `within` that resolves its scope and then searches outside it.',
    blockedOn: null,
  },
  {
    id: 'C20',
    construct: 'step:click',
    family: 'step',
    tier: 'ui',
    title: 'a click that was really dispatched, against one that only resolved',
    target: 'webV2 `/locator-fixture` — every candidate writes a token, and nothing else does',
    evidence: { file: 'tests/.constructs/locator-near-miss.tflw', pattern: '^\\s*click ', min: 6 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'The readout starts at `none` and the first assertion in the file says so. Every later token ' +
      'exists only because a click really reached the DOM, so a `click` that resolved its locator ' +
      'and dispatched nothing leaves `none` standing and fails on the next line rather than passing ' +
      'silently. Six clicks, each landing on a different element.',
    catches: 'a `click` that waits for a locator and never fires the event.',
    blockedOn: null,
  },
  {
    id: 'C21',
    construct: 'step:fill',
    family: 'step',
    tier: 'ui',
    title: 'the text arrived in the input the cascade chose, and in no other',
    target: 'webV2 `/locator-fixture` — the label/placeholder collision, read back from both inputs',
    evidence: { file: 'tests/.constructs/locator-near-miss.tflw', pattern: '^\\s*fill field ', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Read back from **both** inputs by id, so "the right one was filled" and "the wrong one was ' +
      'not" are two separate assertions. The decoy starts at `UNTOUCHED` rather than empty on ' +
      'purpose: not-filled is then a positive observation instead of a claim about an empty string.',
    catches: 'a `fill` that types into the wrong element, or into both.',
    blockedOn: null,
  },
  {
    id: 'C22',
    construct: 'matcher:has-value',
    family: 'matcher',
    tier: 'ui',
    title: 'the value matcher reads the live control, and discriminates',
    target: 'webV2 `/locator-fixture` — one input filled, one deliberately left alone',
    evidence: { file: 'tests/.constructs/locator-near-miss.tflw', pattern: 'has value "', min: 2 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '**Zero uses in this repository before this file** \u2014 a shipped matcher nothing exercised. ' +
      'The two assertions are a pair by design: `GLASGOW` on one input and `UNTOUCHED` on the other, ' +
      'so a `has value` that returned true unconditionally fails the second, and one that read the ' +
      '`value` *attribute* rather than the live `.value` property fails the first (React sets the ' +
      'property; the attribute keeps its initial markup).',
    catches: 'a `has value` that always passes, or that reads the attribute instead of the property.',
    blockedOn: null,
  },
  // ===========================================================================
  // `C23`-`C38` — the UI tier's real flows, `D729`'s first preference
  //
  // Every row below points at a test that already existed and already went red for the right
  // reason. Nothing here is a new fixture page, and that is the point: `D729` orders real flows
  // first, and for these sixteen constructs `M40`/`M41`/`M43`/`M48` had already built one. What
  // was missing was never the exercise — it was the *written-down known answer*. In several cases
  // the answer was sitting in a test comment, unread by any gate, which is exactly the state
  // `D724` exists to end.
  //
  // **Evidence pointing outside `tests/.constructs/` is deliberate and it carries a risk.** A
  // plant living in a real suite file can be edited by work that has never heard of this roster.
  // That is what the acceptance grader is for: the static half catches the spelling disappearing,
  // and the per-step half catches the assertions being loosened while the spelling stays. `C3`
  // set the precedent by pointing at `tflw-acceptance/conformance/iterations.tflw`.
  {
    id: 'C23',
    construct: 'step:open',
    family: 'step',
    tier: 'ui',
    title: 'a navigation reaches the named path, interpolated segment and all',
    target: 'webV2 storefront — `/orders/:id`, a route that exists only for an order really placed',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*open "/orders/\\{orderId\\}"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '75 uses and every one of them navigates somewhere the next assertion needs, so `open` was ' +
      'never at risk of being unexercised — what none of them isolate is the **interpolated ' +
      'segment**. `/orders/{orderId}` is the one path in the suite whose target does not exist ' +
      'until the test creates it: the id comes from a `POST /orders` two steps earlier, and the ' +
      '"Order confirmed" heading is rendered by no other route. An `open` that dropped the ' +
      'interpolation lands on `/orders/%7BorderId%7D` and 404s; one that ignored its argument ' +
      'stays on the login page it arrived from.',
    catches: 'an `open` that does not interpolate, or does not navigate.',
    blockedOn: null,
  },
  {
    id: 'C24',
    construct: 'step:double',
    family: 'step',
    tier: 'ui',
    title: 'two independent clicks against a DOM that changes between them',
    target: 'webV2 storefront — `ProductQuickViewModal`, whose backdrop self-closes',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*double click button "Quick view"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'The known answer is a **hidden** modal, and that is stronger than a visible one. Playwright ' +
      "resolves the target position once, so both clicks land on the same screen point; the first " +
      'opens the Quick View modal, whose full-viewport backdrop then covers that point, and the ' +
      "second lands on the backdrop and closes it. So `expect button \"Close\" is hidden` only " +
      'passes if two *separate* click events were dispatched against the live DOM. A step that ' +
      'coalesced them into one gesture, or fired one click, leaves the modal open and fails.',
    catches: 'a `double click` that is one click, or one synthetic gesture.',
    blockedOn: null,
  },
  {
    id: 'C25',
    construct: 'step:right',
    family: 'step',
    tier: 'ui',
    title: 'the secondary button dispatches no `click` at all',
    target: 'webV2 storefront — the row-scoped Add to cart button and its toast',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*right click button "Add to cart"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'A **negative** known answer, and the only honest one available: browsers reserve the ' +
      'secondary button for `contextmenu` and never dispatch `click`, so the add-to-cart toast ' +
      'must not appear. `expect text "Added 1 × Bulk Item 6 to your cart." is hidden` is therefore ' +
      'red for a `right click` that has degenerated into an ordinary click — the single most ' +
      'likely way this step breaks — and the surrounding steps prove the button is real and ' +
      'reachable, so the absence is not an absence of everything.',
    catches: 'a `right click` implemented as `click`.',
    blockedOn: null,
  },
  {
    id: 'C26',
    construct: 'step:press',
    family: 'step',
    tier: 'ui',
    title: 'a named key reaches the focused document',
    target: 'webV2 storefront — the Quick View modal, re-opened so that Escape is what closes it',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*press "Escape"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'The modal is asserted open on the step **immediately** before the key and closed on the step ' +
      'after, with nothing between them but the key. Adjacency is the whole row, and it is a repair: ' +
      'until `M154d` the `press` sat after a successful add-to-cart, which `handleAdd` already ' +
      'closes — so the `is hidden` after it was satisfied by the add, and **deleting the `press` ' +
      'line left the test green**. That is how it was found. Now a `press` that sent nothing, or ' +
      'sent the literal five characters `Escape` as text, leaves `button "Close"` visible.',
    catches: 'a `press` that types its key name instead of pressing it, and an assertion something else satisfies.',
    blockedOn: null,
  },
  {
    id: 'C27',
    construct: 'step:select',
    family: 'step',
    tier: 'ui',
    title: 'the option chosen really drives the page, both ways',
    target: 'webV2 storefront — `CatalogPage`’s Category `<select>`, combined with Search',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*select "Electronics" from field "Category"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Two selections against one search term, and the pair is the claim: "Wireless Mouse" under ' +
      '**Books** yields `has count 0`, and the same term under **Electronics** yields `has count ' +
      '1`. A `select` that silently did nothing leaves whichever category was active, so one of ' +
      'the two counts is wrong whichever it was; a `select` that matched by position rather than ' +
      'by label picks the wrong category and fails the same way. Asserting only the positive case ' +
      'would pass for a dropdown that never filtered at all.',
    catches: 'a `select` that no-ops, or selects by index rather than by option text.',
    blockedOn: null,
  },
  {
    id: 'C28',
    construct: 'step:tick',
    family: 'step',
    tier: 'ui',
    title: 'the checkbox ends checked, read off the control',
    target: 'webV2 storefront — `/a11y-demo`’s labelled, accessible checkbox',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*tick field "Subscribe to updates"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Graded against the field’s actual `checked` state rather than against "the click did not ' +
      'error", and bracketed: `not is checked` before, `is checked` after. The control opens ' +
      'unchecked, so a `tick` that toggled instead of setting would still pass here — which is why ' +
      '`C29` immediately unticks and `C30` grades the matcher that reads both.',
    catches: 'a `tick` that clicks without settling, or asserts nothing about state.',
    blockedOn: null,
  },
  {
    id: 'C29',
    construct: 'step:untick',
    family: 'step',
    tier: 'ui',
    title: 'the checkbox returns to unchecked, from a state it was really in',
    target: 'webV2 storefront — the same `/a11y-demo` checkbox, immediately after `C28`',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*untick field "Subscribe to updates"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'The half that makes `C28` mean something. `untick` runs on a control the previous assertion ' +
      'just proved was checked, and the state afterwards is asserted, not assumed — so an ' +
      '`untick` that is really a toggle, and an `untick` that is really a no-op, are told apart ' +
      'from a working one and from each other.',
    catches: 'an `untick` that no-ops on an already-checked control.',
    blockedOn: null,
  },
  {
    id: 'C30',
    construct: 'matcher:state-word',
    family: 'matcher',
    tier: 'ui',
    title: 'the state words read the live element, and negate',
    target: 'webV2 storefront — the `/a11y-demo` checkbox and the Quick View modal',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*expect field "Subscribe to updates" (not )?is checked', min: 2 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'The same subject asserted in both states within one test — `not is checked`, `is checked`, ' +
      '`not is checked` — so a matcher that always returns true fails the negations and one that ' +
      'always returns false fails the positive. `is visible`/`is hidden` are graded in the same ' +
      'file by `C24`’s and `C26`’s modal, which is the other half of this id: the manifest ' +
      'spells every state word as one construct.',
    catches: 'a state matcher stuck at one answer, or a broken `not`.',
    blockedOn: null,
  },
  {
    id: 'C31',
    construct: 'step:drag',
    family: 'step',
    tier: 'ui',
    title: 'the row really moves, and the order is read back position by position',
    target: 'webV2 storefront — the cart’s drag-to-reorder handles',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*drag css "\\.drag-handle', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Both rows are asserted by name **and by position** after the drag, with the names read from ' +
      'the API first rather than assumed from insertion order. So a `drag` that dropped nothing ' +
      'leaves row 1 where it was and fails the first assertion; one that moved both rows, or moved ' +
      'the wrong one, fails the second. A single-row assertion would pass for a table that had ' +
      'merely re-rendered.',
    catches: 'a `drag` that fires no drop, or reorders something else.',
    blockedOn: null,
  },
  {
    id: 'C32',
    construct: 'step:drop',
    family: 'step',
    tier: 'ui',
    title: 'a real file reaches a drop zone that has no file input to fill',
    target: 'webV2 storefront — `/support`’s drop zone, whose field id changes per render',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*drop file "\\.\\./payloads/sample\\.csv" onto ', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'The zone accepts nothing but a real `DataTransfer` drop — there is no file input to fill and ' +
      'no click that would open one — and it echoes the dropped file’s **name** back into the page. ' +
      '`expect text "sample.csv" is visible` therefore fails for a step that dispatched a bare ' +
      '`drop` event with no payload, which is the shape this breaks in.',
    catches: 'a `drop` with an empty or missing file payload.',
    blockedOn: null,
  },
  {
    id: 'C33',
    construct: 'step:stub',
    family: 'step',
    tier: 'ui',
    title: 'the stub intercepts by method, and its status surfaces through the app',
    target: 'webV2 storefront — the cross-origin iframe payment widget at `payments.example.test`',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*stub (GET|POST) "https://payments\\.example\\.test', min: 2 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Two stubs on **one URL** and they disagree on purpose: `GET` answers 200 with a token named ' +
      '`tok_wrong_method`, `POST` answers 500. The widget issues a POST, so the page must show the ' +
      'gateway-declined message and `status of request to … with method "POST"` must equal 500. A ' +
      'stub that matched on URL alone would serve the GET row, the payment would appear to ' +
      'succeed, and the token name in the report says which rule fired. The host resolves nowhere: ' +
      'without interception the request fails outright rather than passing by accident.',
    catches: 'a `stub` that ignores the method, or that never intercepts.',
    blockedOn: null,
  },
  {
    id: 'C34',
    construct: 'matcher:matches-snapshot',
    family: 'matcher',
    tier: 'ui',
    title: 'the baseline catches a real change, and the mask absorbs the same one',
    target: 'webV2 storefront — `/render-fixture` (M45), the harness page this arc keeps citing',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: 'matches snapshot "render-fixture-', min: 4 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'One state change, asserted four times against two baselines. Unmasked: matches before the ' +
      'checkbox is ticked, `not matches` after — so a comparison that always passed fails the ' +
      'second. Masked over that same checkbox: matches in **both** states — so a mask that was ' +
      'ignored fails there. The pair is what separates "the matcher compares pixels" from "the ' +
      'matcher compares pixels it was told to skip".',
    catches: 'a snapshot compare that always passes, and a `mask` clause that is decorative.',
    blockedOn: null,
  },
  {
    id: 'C35',
    construct: 'matcher:has-no-a11y-violations',
    family: 'matcher',
    tier: 'ui',
    title: 'the scanner finds real violations, and severity is a floor',
    target: 'webV2 storefront — `/a11y-demo`’s deliberately inaccessible section (M48)',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: 'has no (minor |moderate |serious |critical )?a11y violations', min: 4 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Both directions in one file: clean on the happy-path product and catalog pages, and red on ' +
      '`/a11y-demo`, which carries real `color-contrast` (serious) and `image-alt`/`label` ' +
      '(critical) violations probed empirically rather than guessed. The floor is the sharp half — ' +
      '`not has no moderate a11y violations` passes only under genuine "moderate or worse" ' +
      'semantics, because **zero** violations on that page are actually tagged moderate. An ' +
      'exact-match implementation reports that floor clean.',
    catches: 'a scanner that never fires, and a severity filter that matches exactly instead of as a floor.',
    blockedOn: null,
  },
  {
    id: 'C36',
    construct: 'step:switch',
    family: 'step',
    tier: 'ui',
    title: 'the popup is caught, and the numbered tab is really the one in front',
    target: 'webV2 storefront — the order confirmation page’s `target="_blank"` receipt link',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*switch to (new tab|tab \\d)', min: 3 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '`switch to new tab` arms `waitForEvent(\'page\')` **before** running its block, so it goes ' +
      'red on its own if the click opens nothing — the mechanics half needs no assertion. The ' +
      'numbered half is graded by what follows: `switch to tab 1` then "Order confirmed" is ' +
      'visible, which is true on tab 1 and false on the receipt PDF in tab 2, so a `switch to tab ' +
      'N` that no-opped or was off by one fails there.',
    catches: 'a `switch to new tab` that misses the popup, and a `switch to tab N` that stays put.',
    blockedOn: null,
  },
  {
    id: 'C37',
    construct: 'step:close',
    family: 'step',
    tier: 'ui',
    title: 'the tab that closes is the one in front, and the run survives it',
    target: 'webV2 storefront — the second tab opened by the receipt link',
    evidence: { file: 'tests/mixed/storefront.tflw', pattern: '^\\s*close tab\\s*$', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'The close is preceded by `switch to tab 2` and followed by an assertion that only holds on ' +
      'tab 1, so the two failure directions separate cleanly: a `close tab` that closed the wrong ' +
      'tab takes the order page with it and the assertion has nowhere to run, and one that closed ' +
      'nothing leaves the receipt PDF in front and "Order confirmed" is not on it.',
    catches: 'a `close tab` that closes the wrong tab, or none, or does not restore focus.',
    blockedOn: null,
  },
  {
    id: 'C38',
    construct: 'step:download',
    family: 'step',
    tier: 'ui',
    title: 'a real download event fires, and the name it binds comes from the server',
    target: 'webV2 admin console — the dashboard’s Download orders CSV link, streamed BFF-style from apiV2',
    evidence: { file: 'tests/.env-specific/webv2-admin.tflw', pattern: '^\\s*expect \\{file\\} equals "orders-export\\.csv"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Two halves, and only the first was graded before `M154d`. The step waits on ' +
      "`waitForEvent('download')`, so a link that navigated instead of downloading goes red " +
      'unaided. What was prose until now is the **binding**: `orders-export.csv` is set by ' +
      '`orders.controller.ts`’s `Content-Disposition` and forwarded intact by the console’s BFF ' +
      'route, and it appears nowhere in the markup — the link reads "Download orders CSV" and ' +
      'points at `/orders/export`. So a step that bound the anchor text, the URL’s last segment, ' +
      'or nothing at all fails an assertion that passes today.',
    catches: 'a `download as` that binds the wrong string, or the right one by coincidence.',
    blockedOn: null,
  },

  // ---------------------------------------------------------------------------------------------
  // `M154d`, third artifact — the five constructs the UI tier had left, and the one it gave back.
  //
  // These are the expensive half, and the reason is uniform: each already had uses that assert
  // nothing about the step's own effect. `hover` and `scroll to` land on a button on `/a11y-demo`
  // and are never observed; `screenshot` writes an artifact nothing reads; `dismiss dialog` takes
  // the SAME code branch as no arming at all. Unlike `C23`-`C38`, no amount of asserting harder on
  // the existing pages closes them — the pages do not react, so a surface had to be built.
  //
  // `webV2/src/pages/StepFixturePage.tsx` is that surface, and the third harness page in this
  // repository after `RenderFixturePage` (M45) and `LocatorFixturePage` (`C13`-`C22`). It is NOT
  // built onto `/a11y-demo` where the existing uses live, and that is deliberate: `/a11y-demo` is
  // `C35`'s axe-count target, and a hover tooltip plus a scroll sentinel are exactly the markup
  // that moves an axe score. A plant that broke another plant to grade itself is not a plant.
  //
  // **`step:pause` was scoped into this batch and is deliberately NOT here.** `TF033`: "`pause` is
  // only legal inside a workload-bearing `test`". It is `M67`'s per-iteration pacing, not a general
  // wait, so no browser page can grade it and the fixture section built for it was deleted. It
  // stays on the ratchet and belongs to `M154e`, where `D726` already grades workload shape against
  // a server-observed arrival curve. The UI tier is 31 constructs, not 32 — found by writing the
  // test and running `tflw check`, not by reading the manifest.
  {
    id: 'C39',
    construct: 'step:hover',
    family: 'step',
    tier: 'ui',
    title: 'the pointer arrives without clicking, and the page can tell which happened',
    target: 'webV2 storefront — the step fixture page’s menu button, which records pointer events',
    evidence: { file: 'tests/.constructs/step-observables.tflw', pattern: '^\\s*hover button "Open menu"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Both wrong answers are named rather than merely absent, which is what the one pre-existing ' +
      'use could not do. `onMouseEnter` writes `hovered:menu` and `onClick` writes `clicked:menu` ' +
      'to the same readout, so a `hover` that did nothing leaves `none` and one implemented as a ' +
      'click reports `clicked:menu` — and the test then clicks the very same button to show that ' +
      '`clicked:menu` is reachable, so the contrast is demonstrated rather than asserted. A ' +
      'tooltip that is absent from the DOM until the pointer arrives is the same event observed a ' +
      'second time, in the language’s own idiom, so the row does not rest on one `data-` attribute.',
    catches: 'a `hover` that is a click, and a `hover` that is a no-op.',
    blockedOn: null,
  },
  {
    id: 'C40',
    construct: 'step:scroll',
    family: 'step',
    tier: 'ui',
    title: 'the viewport really moves, latched so nothing else can satisfy the assertion',
    target: 'webV2 storefront — the step fixture page’s sentinel, below a 2400px spacer',
    evidence: { file: 'tests/.constructs/step-observables.tflw', pattern: '^\\s*scroll to button "Bottom marker"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'An `IntersectionObserver` latches on first intersection and never resets, so the readout ' +
      'flips from `no` to `yes` only if something genuinely scrolled the sentinel into the real ' +
      'viewport. Latching is load-bearing twice over: the assertion must not depend on the element ' +
      'still being on screen when it runs, and — the trap this row exists to avoid — Playwright ' +
      'visibility has NOTHING to do with the viewport, so `expect <the marker> is visible` passes ' +
      'before any scrolling at all. A row written the obvious way would have graded nothing.',
    catches: 'a `scroll to` that resolves the element and never scrolls, which visibility cannot see.',
    blockedOn: null,
  },
  {
    id: 'C41',
    construct: 'step:screenshot',
    family: 'step',
    tier: 'ui',
    title: 'the shot is taken at `evidence full`, is skipped below it, and says which',
    target: 'webV2 storefront — the step fixture page, captured at two evidence levels',
    evidence: { file: 'tests/.constructs/step-observables.tflw', pattern: '^\\s*screenshot "step-fixture-observables"', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '**The only row in the roster whose known answer is a report fact, and it has to be.** ' +
      '`interpreter.ts:3496` — "`screenshot` is an evidence step, never an assertion" — so the ' +
      'step ALWAYS passes and no `.tflw` assertion can go red when it breaks. The grader runs the ' +
      'plant twice: at `evidence full` the step reports `captured`, and at `headers-only` it ' +
      'reports `not captured (evidence level)` while still passing. Words alone would be a weak ' +
      'instrument, so the grader also decodes the base64 in `results.json` and reads the PNG’s own ' +
      'IHDR — a real capture is 1280x720, the run’s actual viewport.',
    catches: 'a step that reports a capture it did not make, and evidence gating that stopped working.',
    blockedOn: null,
  },
  {
    id: 'C42',
    construct: 'config:key:viewport',
    family: 'config',
    tier: 'ui',
    title: 'the configured window size is the one the browser actually gets',
    target: 'webV2 storefront — the step fixture page’s window readout, under two configs',
    evidence: { file: 'tests/.constructs/viewport/configured.tflw', pattern: '^\\s*expect css "#viewport-readout\\[data-size=.900x600.\\]" is visible', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'A pair across two configs, because one alone measures Playwright rather than tflw: the ' +
      'root config sets no `viewport` and the page reads **1280x720** (Playwright’s own default, ' +
      'confirmed by running it, not assumed); `tests/.constructs/viewport/tflw.config` sets ' +
      '`viewport 900 600` and the same page reads **900x600**. The value differs from the default ' +
      'in BOTH dimensions on purpose — a key read for width and dropped for height would pass a ' +
      'plant that moved only one. The separate directory is not a preference: `viewport` is legal ' +
      'only in `defaults` (`TF025`), which is project-wide, and declaring it at the root would ' +
      'have re-laid-out the storefront underneath `C34`’s snapshot baselines and `C35`’s axe counts.',
    catches: 'a `viewport` key that is parsed and never reaches `newContext`.',
    blockedOn: null,
  },
  {
    id: 'C43',
    construct: 'step:dismiss',
    family: 'step',
    tier: 'ui',
    title: 'dismissal is unobservable directly, so the plant grades the arming it overwrites',
    target: 'webV2 admin console — the bulk out-of-stock delete’s two confirms',
    evidence: { file: 'tests/.constructs/dialog-one-shot.tflw', pattern: '^\\s*dismiss dialog\\s*$', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Closes `M154b-01`. `browser.ts:232` is `void (armed === \'accept\' ? dialog.accept() : ' +
      'dialog.dismiss())`, so **`dismiss` and nothing-armed take the same branch** and the step is ' +
      'genuinely indistinguishable from its absence by direct observation — which is why the two ' +
      'uses elsewhere in this repository prove nothing and why the step sat on the ratchet WITH ' +
      'uses. What it does that its absence cannot is overwrite a prior arming (a single slot, ' +
      '`browser.ts:220`). So the plant arms `accept`, overwrites it with `dismiss`, and clicks ' +
      'once with no dialog in between: a real `dismiss` leaves `cancelled`, a no-op leaves the ' +
      'accept standing and produces `cancelled-final` — the state the preceding step in that same ' +
      'test just demonstrated, so the wrong answer is reachable and not hypothetical.',
    catches: 'a `dismiss dialog` that does not arm, which no direct observation can detect.',
    blockedOn: null,
  },
  // --- M154e: the perf tier -------------------------------------------------------------------
  //
  // Every row here is graded against `arrival-server.mjs`'s recorded arrival TIMES rather than
  // against tflw's report of what it did — `D745` in that file argues why the target is a
  // zero-latency counter and not apiV2, which inverts `D726`'s placement to keep `D726`'s
  // principle. Three of the four shapes had zero occurrences anywhere in this repository; `ramp`
  // had uses and had never been checked against anything but its own report.
  {
    id: 'C44',
    construct: 'step:ramp',
    family: 'step',
    tier: 'workload',
    title: 'a linear ramp lands exactly half of what the same flat rate lands',
    target: 'tflw-acceptance/conformance/arrival-server.mjs — the recorded arrival curve, no stack behind it',
    evidence: { file: 'tflw-acceptance/conformance/shapes.tflw', pattern: '^\\s*ramp\\s+to\\s+\\d+\\s+rps\\s+over\\b', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer: '`ramp to 50 rps over 4s` lands ~100 requests where `hold 50 rps for 4s` lands ~200 — a triangle is half its bounding rectangle, so the discriminator is arithmetic rather than a tolerance. Its opening bins are near zero and its closing bins carry more than twice its opening ones, so a `ramp` that had become a flat half-rate — right total, wrong shape — still fails.',
    catches: 'a ramp implemented as a hold (doubles the count), and a ramp that starts at its target instead of at zero.',
    blockedOn: null,
  },
  {
    id: 'C45',
    construct: 'step:hold',
    family: 'step',
    tier: 'workload',
    title: 'a flat target is at full rate from the start, with no ramp-in',
    target: 'tflw-acceptance/conformance/arrival-server.mjs — the recorded arrival curve',
    evidence: { file: 'tflw-acceptance/conformance/shapes.tflw', pattern: '^\\s*hold\\s+\\d+\\s+rps\\s+for\\b', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer: '`hold 50 rps for 4s` lands ~200 requests AND is already at ~25 per 500ms bin in its second bin. `tflw spec` says "a flat target for the whole duration, **with no ramp-in**", and the only way to be wrong about that while landing the right total is to ramp — so the opening rate is asserted against the target, not merely against zero.',
    catches: 'a hold that ramps in, and a hold whose steady rate drifts.',
    blockedOn: null,
  },
  {
    id: 'C46',
    construct: 'step:step',
    family: 'step',
    tier: 'workload',
    title: 'a staircase of instant jumps, each stage held for its own duration',
    target: 'tflw-acceptance/conformance/arrival-server.mjs — the recorded arrival curve',
    evidence: { file: 'tflw-acceptance/conformance/shapes.tflw', pattern: '^\\s*step\\s+rps\\s*$', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer: '20 rps for 2s then 80 rps for 2s lands ~200 requests — **which is exactly what `hold 50 rps for 4s` lands.** That collision is deliberate: the totals cannot tell the two shapes apart, so the plant asserts the two plateaus and their 1:4 ratio. A grader that only counted would pass a build that had collapsed the staircase into its flat average.',
    catches: 'a step collapsed to its mean rate, and a staircase that slopes between stages instead of jumping.',
    blockedOn: null,
  },
  {
    id: 'C47',
    construct: 'step:spike',
    family: 'step',
    tier: 'workload',
    title: 'baseline, burst, recovery — and the recovery is the half a step up would also pass',
    target: 'tflw-acceptance/conformance/arrival-server.mjs — the recorded arrival curve',
    evidence: { file: 'tflw-acceptance/conformance/shapes.tflw', pattern: '^\\s*spike\\s+rps\\s*$', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer: '`hold 10 for 2s` / `to 120 over 1s` / `hold 10 for 2s` lands ~105 requests with a peak bin more than 3x its baseline and a tail that returns to baseline. `tflw spec` says a spike "mixes flat and ramped stages in any order", which is the part a two-stage shape cannot demonstrate; the recovery assertion is what a build that simply held the burst would fail.',
    catches: 'a spike that never returns to baseline, and a burst that is a rounding artefact rather than a burst.',
    blockedOn: null,
  },
  {
    id: 'C48',
    construct: 'step:cleanup',
    family: 'step',
    tier: 'workload',
    title: 'cleanup opts a workload back into the after-each hook, and omitting it really does skip teardown',
    target: 'tflw-acceptance/conformance/verdict.tflw + arrival-server.mjs — a marker path the file\'s `after each` hook hits',
    evidence: { file: 'tflw-acceptance/conformance/verdict.tflw', pattern: '^\\s*cleanup\\s*$', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer: 'The marker path receives exactly 8 requests — one per iteration of the test that carries `cleanup`, and **none** from the sibling test that omits it. The contrast is the plant: 16 would mean teardown ran unconditionally, which is precisely what `D26` says must not happen under load, and 0 would mean the opt-in does nothing. **Graded against the construct that exists, not the one the manifest describes** — `tflw spec --json` gets this row wrong in three ways and the defect is filed as `M154e-01`.',
    catches: 'teardown running under load when nothing asked for it (double request volume, polluted latency), and a `cleanup` line that is a no-op.',
    blockedOn: null,
  },
  {
    id: 'C49',
    construct: 'step:threshold',
    family: 'step',
    tier: 'workload',
    title: "a workload's verdict comes from its thresholds and from nothing else",
    target: 'tflw-acceptance/conformance/verdict.tflw — a 50ms path, one threshold that breaches and one that does not',
    evidence: { file: 'tflw-acceptance/conformance/verdict.tflw', pattern: '^\\s*threshold\\s+p95\\s+duration\\b', min: 2 },
    graders: ['acceptance', 'coverage'],
    knownAnswer: 'Two tests issue the same request against the same 50ms path, and every `expect status equals 200` in both succeeds. The one bounded at 5000ms passes; the one bounded at 10ms **fails with every assertion in it green**. That is the claim `tflw spec` makes — "decided once, after the run, against the run\'s aggregate metrics" — and the reason it matters is on the record: on 2026-08-05 a rung that declared no threshold ran at a 100% error rate and reported PASS.',
    catches: 'a verdict computed from the steps rather than the metrics, and a threshold that cannot breach.',
    blockedOn: null,
  },
  {
    id: 'C50',
    construct: 'step:pause',
    family: 'step',
    tier: 'workload',
    title: 'pause paces the iterations and is excluded from the duration it is not part of',
    target: 'tflw-acceptance/conformance/pacing.tflw + arrival-server.mjs — inter-arrival gaps for one VU',
    evidence: { file: 'tflw-acceptance/conformance/pacing.tflw', pattern: '^\\s*pause\\s+\\d+ms\\s*$', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer: 'One VU, twelve iterations: every recorded gap is >=200ms with `pause 200ms`, and <50ms without it on an otherwise identical control path. Second and independent: tflw\'s reported p50 duration stays under 50ms, because the report\'s own column is labelled "pause-excluded" — pacing is time the test chose to spend, not latency the server imposed. **Handed back by `M154d`**, where it was scoped into the browser tier before `TF033` refused it: `pause` is legal only inside a workload-bearing test.',
    catches: 'a `pause` that became a no-op (zero occurrences anywhere before this plant), and a build that stopped subtracting pacing from the duration — which would silently make every paced workload\'s threshold measure the wrong thing.',
    blockedOn: null,
  },

  // ---------------------------------------------------------------------------------------------
  // `M154f` — the security tier (`C51`–`C58`), rostered by reference under `D752`.
  //
  // Every row below names a grader that is **not** `verify-construct-acceptance.mjs`, and that is the
  // milestone's whole shape. These eight constructs have been graded since the pentest arc, by
  // scripts that state their known answers as data — `LEDGER`, `DECLINES`, `APPLICABILITY_PROBES`,
  // `verify-redaction.mjs`'s ground-truth fetch — and re-stating those answers as new plants here
  // would produce a second, weaker copy of an assertion that already runs. What was missing was never
  // the evidence; it was the *index*. `D752` supplies it, and makes it bidirectional so the index
  // cannot drift from the assertions it points at.
  //
  // **Three security constructs are deliberately NOT here**, and the reason is the milestone's
  // finding rather than an omission: `config:probe:oversized`, `config:probe:traversal` and
  // `matcher:has-no-input-handling-violations` are Tier 3, and Tier 3's grader
  // (`verify-input-acceptance.mjs`) asserts, exits non-zero, and **runs in no automated pass** —
  // `regression.mjs` does not carry it and neither does CI. It could fail; nothing would notice. A
  // row pointing at it would read as evidence while nothing evaluated it, which is `M141`'s vacuity
  // class wearing a roster row. They stay on `RATCHET` and the condition is named below.
  {
    id: 'C51',
    construct: 'config:probe:ciphers',
    family: 'config',
    tier: 'security',
    title: 'the cipher probe asks a question the negotiated handshake cannot answer',
    target: "nginx's 8445 offering listener (`V18`, `nginx/offering.conf`, `VULN_MODE=1` only) — it offers `NULL-SHA256` beside a modern suite and negotiates the modern one",
    evidence: { file: 'tflw-acceptance/security/tflw.config', pattern: '^\\s*probe ciphers\\s*$', min: 1 },
    graders: ['security', 'coverage'],
    knownAnswer:
      'A granted/withheld pair on one rule, and the target is chosen so that **every per-response ' +
      'assertion reads the host as impeccable**: it negotiates TLSv1.3 with an ordinary client, so ' +
      '`sec/tls-version-old` is silent and the negotiated half of `sec/tls-weak-cipher` is clean. ' +
      'Granted (`offeringTls`), `sec/tls-weak-cipher` fires anyway — one handshake per candidate ' +
      'suite — and the report names the suites tflw\'s own OpenSSL **could not offer** at all, which ' +
      'is `D486`\'s ceiling asserted rather than assumed. Withheld (`secureLocal`), the same rule is ' +
      'silent and the assertion **passes carrying the note "judged only the suite this host gave"**. ' +
      'Both halves are green; the note is the entire difference between a rule that ran and a rule ' +
      'that asked half its question.',
    catches: 'a `probe ciphers` that opens no second handshake — indistinguishable from the withheld half without the note — and an opt-in honoured against a target that never granted it.',
    blockedOn: null,
  },
  {
    id: 'C52',
    construct: 'config:probe:mutating',
    family: 'config',
    tier: 'security',
    title: 'the opt-in sends the write, and a replay can judge only the verb that does not destroy',
    target: 'apiV2 under `secureLocal`, which grants the opt-in — `DELETE /vuln/orders/{id}` (`V8`) against the idempotent `PUT` (`V9`), one probe set, one variable',
    evidence: { file: 'tflw-acceptance/security/tflw.config', pattern: '^\\s*probe mutating\\s*$', min: 1 },
    graders: ['security', 'coverage'],
    knownAnswer:
      'Two mutating verbs under the **same four principals** on the same host, differing in exactly ' +
      'one thing — whether the verb destroys what it touches. The `DELETE` comes back `total: 4, ' +
      'inconclusive: 1, refused: 3` and yields no verdict, because a replay cannot judge ' +
      'destruction; the idempotent `PUT` comes back `total: 4, leaked: 2, inconclusive: 1, refused: ' +
      '1` and finds the leak. That is a controlled comparison rather than two observations, and it ' +
      'de-confounds the `DELETE`: "could not be judged" is otherwise equally consistent with *nobody ' +
      'in the probe set could have answered anyway*. The opt-in genuinely deletes orders, which is ' +
      'the argument for requiring the word rather than a side effect of it. **The withheld half — ' +
      'the identical `DELETE` under a target that grants nothing, coming back `4 not probed` with ' +
      'each decline naming the missing word — is graded, and graded well, in this script\'s ' +
      '*ungated* half, so it is not part of this row\'s claim.** See `M154f-01`.',
    catches: 'a `probe mutating` that sends nothing while the assertion stays green, and a destructive verb scored as a verdict when a replay cannot judge it.',
    blockedOn: null,
  },
  {
    id: 'C53',
    construct: 'config:key:authorized',
    family: 'config',
    tier: 'security',
    title: 'the affirmation is refused three ways before a single request is sent',
    target: '`tflw check` over `tflw-acceptance/security/` and the `publicTarget` env — an RFC 2606 `.invalid` host, so the control grades offline',
    evidence: { file: 'tflw-acceptance/security/tflw.config', pattern: '^\\s*authorized target\\s+"', min: 4 },
    graders: ['diagnostics', 'coverage'],
    knownAnswer:
      'Three refusals and their three silences, all before anything is reached. `TF060` fires when a ' +
      'security assertion runs under an env whose `authorized target` does not name its base, and is ' +
      'silent when one does. `TF065` refuses a **public** target with no affirmation on the command ' +
      'line, `TF066` refuses one naming an origin this run never scans, and both go silent under the ' +
      'affirmation the run actually needs. The `publicTarget` env satisfies `allow hosts` **and** ' +
      'declares the origin on purpose, so a refusal cannot be the allowlist\'s or `TF060`\'s — strip ' +
      'either line and the case still goes red for the wrong reason and the proof turns vacuous.',
    catches: 'a scan reaching a host nobody affirmed, and an affirmation accepted for an origin the run never touches.',
    blockedOn: null,
  },
  {
    id: 'C54',
    construct: 'config:key:evidence',
    family: 'config',
    tier: 'security',
    title: 'the evidence level set in a config does what the flag does',
    target: 'webV2 storefront — the same `screenshot` step as `C41`, under a config that sets the key instead of a command line that passes the flag',
    evidence: { file: 'tests/.constructs/evidence/tflw.config', pattern: '^\\s*evidence\\s+full\\s*$', min: 1 },
    // `run` exists because of this plant, and the reason is worth the field. For every other
    // `acceptance` plant `evidence.file` is a `.tflw`, so the driver could execute the same path
    // the coverage grader greps. This construct is a **config key whose only witness is the config**
    // — pointing `evidence.file` at `configured.tflw` would have hidden the finding that motivated
    // the plant (`evidence` had zero occurrences as a key in this repository; every existing use is
    // the `--evidence` flag). So the two readings are separated: `evidence.file` is where the
    // construct is *witnessed*, `run` is what the acceptance driver *executes*.
    run: 'configured.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '`C41` proves the *level* changes what a `screenshot` step does; this proves the **key** is the ' +
      'thing that sets it. Same step, same page, two config roots and no `--evidence` anywhere: under ' +
      'the root config the step reports `not captured (evidence level)`, and under a corpus config ' +
      'whose only difference is `evidence full` it reports `captured` and the decoded PNG\'s IHDR ' +
      'reads 1280x720. A pair of configs rather than a pair of runs, which is `C42`\'s shape and for ' +
      '`C42`\'s reason. **The key is set nowhere else in this repository** — every existing use of the ' +
      'level is the CLI flag, so before this plant a key parsed and dropped on the floor would have ' +
      'been invisible.',
    catches: 'an `evidence` key that is parsed and never reaches the runtime — the defect `C42` found for `viewport` — and a level that only the flag can set.',
    blockedOn: null,
  },
  {
    id: 'C55',
    construct: 'config:key:redact',
    family: 'config',
    tier: 'security',
    title: 'real PII, fetched behind tflw\'s back, appears in none of the artifacts',
    target: 'apiV2 `GET /v1/profile/export` — five real values read by a direct `fetch`, so the grader never asks tflw what the truth was',
    evidence: { file: 'tflw.config', pattern: '^\\s*redact\\s+body\\.', min: 1 },
    graders: ['redaction', 'coverage'],
    knownAnswer:
      'Ground truth comes from a direct fetch against apiV2, bypassing tflw entirely — the assertions ' +
      'inside `safety-redaction.tflw` always see the *unmasked* value by design, so they can never be ' +
      'the proof. None of the five values appears in any step\'s `request.body`, `response.bodyText` ' +
      'or printed `detail` across `report/results.json`. And the half that stops it being vacuous: ' +
      '`results.json` **and** `report.html` must each carry at least one `[redacted]` marker, because ' +
      'a pattern that matched nothing would pass a leak check by having nothing left to leak. ' +
      '**And the half `M154g` added, because it was not true:** each of those three field kinds has ' +
      'to be *present* in the run at all. The corpus was three `GET`s, so no step in any run carried ' +
      'a `request.body` — a third of the surface this row names was asserted over an empty set, ' +
      'under a closing line that claimed the whole request/response trace. A covered field now goes ' +
      'out in a request body and at least one recorded request body must show a marker, so ' +
      '`redactRequest` is proven to have fired rather than assumed silent.',
    catches: 'a `redact` that stopped covering a step\'s printed `detail` (the upstream gap closed 2026-07-26) or stopped reaching `redactRequest`, a ground-truth value the endpoint renamed silently leaving the search, and a pattern that matches nothing while the leak check passes vacuously.',
    blockedOn: null,
  },
  {
    id: 'C56',
    construct: 'declaration:crawl',
    family: 'declaration',
    tier: 'security',
    title: 'the walk is graded by where each finding came from, and by the door it could not open',
    target: 'apiV2\'s documented surface walked as a non-owner, plus webV2\'s admin console (`:8091`) and its client-rendered storefront (`:8090`)',
    evidence: { file: 'tflw-acceptance/security/crawl.tflw', pattern: '^crawl\\s+"', min: 1 },
    graders: ['security', 'coverage'],
    knownAnswer:
      'Graded by **finding provenance** rather than by a verdict: each planted route is asserted ' +
      'reached *via* the crawl, and the documented public surface is asserted walked. The sharp half ' +
      'is the negative — the storefront on `:8090` is a client-rendered SPA that a fetching spider ' +
      'cannot walk, and that gap is asserted as a **named decline with count 1**, matched exactly ' +
      'rather than by shape, so the day somebody teaches the spider to render this row fails and the ' +
      'claim is revisited on purpose. A blind spot arriving as an empty result is the failure this ' +
      'plant exists to refuse.',
    catches: 'a crawl that enumerates the logged-out shell and calls it the surface — which is exactly tflw `M137f-01`, found by this plant — and a blind spot reported as a zero.',
    blockedOn: null,
  },
  {
    id: 'C57',
    construct: 'matcher:has-no-security-violations',
    family: 'matcher',
    tier: 'security',
    title: 'every rule in play is named on both sides of the line',
    target: 'three envs over one app — `secureLocal` through the TLS sidecar, `plaintext` straight to apiV2, `offeringTls` against the broken listener',
    evidence: { file: 'tflw-acceptance/security/positives.tflw', pattern: 'has no .*security violations', min: 6 },
    graders: ['security', 'coverage'],
    knownAnswer:
      'Twenty-odd ledger rows, each naming the rules that must **fire** and the rules that are in ' +
      'play at that floor and must be **silent** — because a rule that never ran also produces no ' +
      'finding, and only the pair tells them apart. `D445`\'s precision property is the second half: ' +
      'every finding a run produces lies inside `baseline ∪ plants` and nothing lies elsewhere, ' +
      'against a **committed** baseline that is a reviewed diff rather than a command run to make CI ' +
      'green. The third is `scanCoverage`, which turns silence from a necessary condition into a ' +
      'sufficient one: a rule the census says applied, which fired nowhere in that same run, ran and ' +
      'found nothing.',
    catches: 'a rule that stops firing, a rule that fires where it should not, and a severity floor read as a band rather than as a minimum — a mistake two drafts of the ledger made.',
    blockedOn: null,
  },
  {
    id: 'C58',
    construct: 'matcher:has-no-authorization-violations',
    family: 'matcher',
    tier: 'security',
    title: 'the probe set is arithmetic, and one human holding three credentials gets three answers',
    target: "apiV2's ownership-scoped routes, re-issued under every non-owning principal the config declares",
    evidence: { file: 'tflw-acceptance/security/authz.tflw', pattern: 'has no authorization violations', min: 3 },
    graders: ['security', 'coverage'],
    knownAnswer:
      'Every assertion\'s probe set is graded as four numbers — `total`, `leaked`, `inconclusive`, ' +
      '`refused` — and the corpus declares the same user three times so the numbers mean something: ' +
      'cookie **with** a `csrf from` clause completes a mutating probe, bearer completes one, cookie ' +
      '**without** the clause is refused before authorization is ever consulted and is reported ' +
      '`inconclusive`. Same human, same permissions, three credentials, three outcomes — so an ' +
      'outcome is a fact about the credential. `privileged` removes a principal from every set and ' +
      'the report says the set shrank rather than shrinking it quietly.',
    catches: 'a probe set silently emptied until nobody is left to answer — every principal excluded for a correct reason, the assertion green, nothing asked — and a destructive verb scored as a verdict when a replay cannot judge it.',
    blockedOn: null,
  },

];

/**
 * Rosters that cover a whole manifest **family** by citing the gate that already grades it, rather
 * than by one hand-written row per construct (`D751`). `M154g` step 1.
 *
 * A row here is a **rule, not a list** (`D763`). It names a family and a grader; membership is
 * whatever `tflw spec --json` says is in that family on the day the gate runs, so the set cannot go
 * stale the way a transcribed list of sixty-six ids would. `expandReferenceRosters()` below is the
 * only thing that turns it into ids, and it does so against the manifest.
 *
 * Three conditions, all three required, and they are `D751`'s — checked by
 * `verify-construct-coverage.mjs` rather than trusted: the cited grader is **tracked**, it is
 * **gated** (a row citing a script nothing runs is `M137e-01` wearing a roster row), and it derives
 * its expected set **from the manifest** rather than from a constant of its own.
 *
 * That third condition is what this list buys and it is also what it costs. Because membership is
 * derived, a diagnostic code that ships tomorrow is rostered here the moment it appears in the
 * manifest — the coverage gate will *not* go red for it. The anti-regression duty moves, whole, to
 * the cited grader: `verify-check-diagnostics.mjs` demands a fixture for every code the installed
 * bundle assigns and fails without one, which is a stronger red than "this id is on neither list"
 * and is documented in that script's header as a breaking change for this repository's `main`. A
 * family may be rostered this way only where that is true of its grader.
 */
export const REFERENCE_ROSTERS = [
  {
    id: 'C59',
    family: 'diagnostic',
    grader: 'diagnostics',
    tier: 'check',
    title: 'every code tflw assigns is proved against a real `tflw check`, and the expected set is read out of tflw',
    target:
      'tests/.checkonly/ (test dialect), CONFIG_FIXTURES (config dialect), and five generated-config ' +
      'fixtures — each run through the installed CLI, not simulated',
    knownAnswer:
      'Each code has a fixture that provokes it and the run asserts the code actually appears in ' +
      "`tflw check`'s output, several of them alongside the silence they must not break — `TF051` " +
      'fires at exactly the declared number of sites, `TF057`/`TF058` are each other’s negative ' +
      'control, `TF060`/`TF065`/`TF066` each name their repair and each leave the security test ' +
      'alone. Completeness is not a claim this ledger makes: `assignedCodes()` reads the assigned ' +
      "list out of the **installed bundle's own §17 manifest**, so a code tflw ships without a " +
      'fixture here is red on the day it merges, and a fixture naming a code tflw retired is red too.',
    catches:
      'a diagnostic that stops firing, a fixture kept for a code that no longer exists, and — the ' +
      'reason the family is rostered by reference at all — sixty-six hand-written rows going stale ' +
      'silently while reading as evidence.',
    blockedOn: null,
  },
];

export const PLANT_IDS = PLANTS.map((p) => p.id);
export const COVERED_CONSTRUCTS = PLANTS.map((p) => p.construct);
export const plantsFor = (grader) => PLANTS.filter((p) => p.graders.includes(grader));
export const plantFor = (construct) => PLANTS.find((p) => p.construct === construct) ?? null;
export const REFERENCE_ROSTER_IDS = REFERENCE_ROSTERS.map((r) => r.id);

/**
 * Turn every `REFERENCE_ROSTERS` row into the construct ids it covers, against a manifest.
 *
 * Only `shipped` constructs are claimed: `D731`/`D736` keep a `planned` construct out of the
 * covered set so it lands in the coverage gate's unaccounted bucket, exactly as it would for a
 * hand-written plant. A family that expands to **nothing** is returned as an empty list rather than
 * skipped, because that is the interesting failure — a family renamed in tflw leaves a roster row
 * that reads like sixty-six graded constructs and covers zero.
 *
 * @param {Array<{id: string, family: string, status: string}>} manifestConstructs `tflw spec --json`'s `constructs`
 * @returns {Map<string, string[]>} roster id -> the construct ids it covers
 */
export const expandReferenceRosters = (manifestConstructs) =>
  new Map(
    REFERENCE_ROSTERS.map((roster) => [
      roster.id,
      manifestConstructs.filter((c) => c.family === roster.family && c.status === 'shipped').map((c) => c.id),
    ]),
  );

/**
 * Every construct tflw ships that has no row above. Measured against `tflw spec --json` at
 * tflw `5cba2da` (`M154a`), the build that first emitted a manifest to measure against.
 *
 * Read `D739` before reading this list: an entry here means *no known-answer row*, not *never
 * exercised*. `step:api` sits here with 1139 occurrences behind it.
 */
export const RATCHET = [
  // --- declaration (10) ---
  // The family `M154a` missed and `M154c`/`D742` added; `declaration:after` and `declaration:retry`
  // are rostered above, so ten of the twelve land here. Five of these are `test`-header clauses
  // rather than top-level words, and three of those five (`tags`, `with-each`, `concurrency`) are
  // manifest ids for constructs the language spells differently — `@…`, `with each`, and
  // `parallel`/`sequential`. Read them as ids, never as keywords (`M154a`, `spec-data.ts`).
  //
  // `declaration:crawl` left at `M154f` — `C56`, graded by finding provenance and by the one origin
  // the fetching spider cannot walk. Nine remain.
  'declaration:test', 'declaration:action', 'declaration:import',
  'declaration:use', 'declaration:before', 'declaration:tags', 'declaration:with-each',
  'declaration:as', 'declaration:concurrency',
  // --- step (6) ---
  // What is left here are the workhorses `D739` is about — `api` alone has 1139 occurrences, and
  // `expect` 1692. A `RATCHET` entry says only that no row in `CONSTRUCTS.md` states their known
  // answer; for these six the evidence already exists and it is the claim that is missing, which is
  // the cheap end of `D739`'s two very different costs.
  //
  // The seven that used to sit under this heading are rostered as of `M154e`: `ramp`, `hold`,
  // `step`, `spike`, `threshold` and `cleanup` — the perf tier — plus `pause`, the one construct
  // `M154d` handed BACK. It had been filed here as a browser step needing an observable, and it is
  // not one: `TF033` says "`pause` is only legal inside a workload-bearing `test`", so it is
  // `M67`'s per-iteration pacing and its known answer is an inter-arrival gap.
  'step:api', 'step:wait', 'step:expect', 'step:let', 'step:capture', 'step:log',
  // --- matcher (9) ---
  // Tier 1 and Tier 2 left at `M154f` (`C57`, `C58`). **`matcher:has-no-input-handling-violations`
  // stays**, and it is the milestone's finding rather than an oversight: Tier 3's grader
  // (`verify-input-acceptance.mjs`) states its known answers in full, asserts them, and exits
  // non-zero — and it runs in **no automated pass**, neither `regression.mjs` nor CI, because a Tier 3
  // assertion costs an order of magnitude more requests than a Tier 2 one (`D380`) and the cost was
  // judged too high for every-PR. So it can fail and nothing would notice, which is exactly what a
  // roster row must not be built on. **Rosters when the Tier 3 grader runs on something that
  // reports** — a condition, not a milestone number (`M131`).
  'matcher:equals', 'matcher:contains', 'matcher:matches-regex', 'matcher:matches-subset',
  'matcher:matches-schema', 'matcher:greater-less-than', 'matcher:has-count', 'matcher:was-made',
  'matcher:has-no-input-handling-violations',
  // --- generator (12) ---
  'generator:unique-prefix', 'generator:unique-email', 'generator:unique-number', 'generator:unique-like',
  'generator:unique-uuid', 'generator:random-number', 'generator:random-date', 'generator:random-of',
  'generator:random-string', 'generator:random-like', 'generator:random-uuid', 'generator:random-password',
  // --- locator (0) ---
  // The first family to empty, at `M154d`'s locator harness. The header stays so the seven
  // families read in manifest order and an emptied one is visibly empty rather than absent.
  // --- config (18) ---
  // Five left at `M154f`: `authorized` (`C53`), `evidence` (`C54`), `redact` (`C55`), `probe
  // mutating` (`C52`) and `probe ciphers` (`C51`). **`probe oversized` and `probe traversal` stay
  // for the same reason as the Tier 3 matcher above** — their rules are Tier 3's pack, so the only
  // script that grades them is the one nothing runs. All three roster together, on that condition.
  'config:directive:defaults', 'config:directive:env', 'config:directive:session',
  'config:directive:require', 'config:directive:exclude', 'config:key:header', 'config:key:timeout',
  'config:key:workers', 'config:key:report', 'config:key:web', 'config:key:api', 'config:key:insecure',
  'config:key:cert', 'config:key:key', 'config:key:allow',
  'config:key:log',
  'config:probe:oversized', 'config:probe:traversal',
  // --- diagnostic (0) ---
  // Emptied at `M154g` step 1, and by a **rule** rather than by sixty-six rows: `C59` in
  // `REFERENCE_ROSTERS` rosters the whole family by citing `verify-check-diagnostics.mjs`, which
  // reads the assigned-code list out of the installed bundle's own §17 manifest and fails when a
  // code has no fixture (`D751`, `D763`). The ids are not transcribed here or anywhere else — the
  // coverage gate expands the family against `tflw spec --json` on the day it runs, so this heading
  // stays at zero even when tflw assigns its sixty-seventh code. The header stays for the same
  // reason `locator` kept one: an emptied family should read as empty, not as absent.
];

/**
 * `RATCHET.length` must not exceed this (`D740`). Lower it as milestones roster constructs; raising
 * it is the edit this pin exists to make loud.
 *
 * **`120` -> `54` at `M154g` step 1, and it is the largest single drop this pin will ever see.**
 * Sixty-six of the hundred and twenty were the diagnostic family, and not one of them gained an
 * assertion: `verify-check-diagnostics.mjs` had been proving every one of them against a real `tflw
 * check` since `M49`, and against a list read out of tflw's own manifest since `M86`. What was
 * missing was the *claim*, which is `D739`'s cheap end taken to its limit — and `D751` says the
 * claim is a citation rather than sixty-six restatements of somebody else's enforced completeness.
 *
 * The number to read this against is not the drop, it is what is left: **54**, and they are the
 * expensive end. Twelve generators that need an observable built before presence proves anything,
 * eighteen config constructs, nine matchers, nine declarations and the six workhorse steps.
 *
 * `140` is the whole manifest (178 constructs) minus the thirty-eight plants rostered so far, and
 * acceptance clause 5 is that it reaches 0. **The clause named `M154f` and now names `M154g`** — not
 * because the bar moved but because `M154f` is the security tier and the security tier is eleven
 * constructs, so the clause had been pinned to a milestone whose scope could never have met it.
 *
 * `M154f` took eight of those eleven and **left three on purpose**, which is the one thing on this
 * list worth reading before the numbers: `config:probe:oversized`, `config:probe:traversal` and
 * `matcher:has-no-input-handling-violations` are Tier 3, their grader asserts and exits non-zero,
 * and nothing runs it. Rostering them would have made the ratchet fall by eleven and made the
 * roster three rows less true.
 *
 * `M154d`'s second artifact took it down another sixteen, and cost no new target-app surface at
 * all: every one of those sixteen already had a real flow that already went red for the right
 * reason. What was missing was the written-down known answer, and in three cases (`double click`,
 * `right click`, `download as`) the answer was sitting in a test comment that no gate read. One
 * assertion was added to the whole batch — `download as`'s bound filename, which its own comment
 * had claimed and nothing had checked.
 *
 * That is the cheap half of this tier, and it is now spent. The four steps left in the `step`
 * family below — `hover`, `scroll`, `screenshot`, `pause` — all have uses that assert nothing
 * about the step's own effect, so each needs an observable built before it can be rostered;
 * `dismiss` needs an argument before it needs a surface.
 *
 * `M154d`'s first artifact took it down ten in one step — six locators and three steps that cannot
 * be graded apart from them, plus `matcher:has-value`, which had **zero** uses in this repository.
 * Four of those ten are among the most-used constructs here (`button` 93, `text` 92, `css` 69,
 * `field` 65), which is worth saying beside the number: the ratchet fell by ten and the *volume* of
 * newly-graded usage is far larger, because `D739`'s "unrostered, not unexercised" cuts both ways.
 *
 * It went **up** once, from `M154b`'s `163` to `M154c`'s `166`, and that is the one direction this
 * pin exists to make loud — so it is worth leaving the reason on the record. Twelve constructs
 * arrived at once when `tflw spec --json` grew the family it had been missing, and nine were
 * rostered in the same milestone; the arithmetic was `163 + 12 - 9`. What the ratchet measures is
 * the unrostered remainder, and a remainder can only be honest about a denominator that has itself
 * just been corrected upwards.
 */
export const RATCHET_CEILING = 54;

/**
 * `CONSTRUCTS.md` carries one row per plant and prose a human reads; this asserts their id sets
 * agree. The same one machine-checked invariant `VULNS.md` gained in `M139`, and for the same
 * reason (`D489`): parsing prose to build the oracle would let a typo in a markdown table retune
 * what the graders expect, so the markdown gets checked *against* the data rather than read as it.
 *
 * @param {string} markdown the contents of `CONSTRUCTS.md`
 * @param {(msg: string) => void} fail
 */
/**
 * `M154f-02`. The acceptance driver executes `run ?? basename(evidence.file)` inside the plant's
 * corpus, while the coverage grader greps `evidence.file` for `evidence.pattern`. Those are two
 * incompatible readings of one field whenever the witness is not itself a test file, and nothing
 * checked that they agreed — `C54` shipped pointing the driver at a `tflw.config`, which `tflw run`
 * refuses by name (*"`tflw.config` is not a `.tflw` test file"*).
 *
 * It is asserted here rather than fixed silently because the failure mode is a **skip**, not a
 * throw: the block below `if (!report)` records `skipped: 'no report'` and moves on, so a plant that
 * can never run reads in the summary as one that ran and answered nothing. That is `M141`'s vacuity
 * class arriving through the back door, and the ratchet would have kept counting `C54` as rostered.
 *
 * @param {string} root repository root, so the runnable path can be checked on disk
 * @param {(p: string) => boolean} exists
 * @param {(msg: string) => void} fail
 */
export function assertAcceptancePlantsAreRunnable(root, exists, fail) {
  for (const plant of plantsFor('acceptance')) {
    const dir = plant.evidence.file.slice(0, plant.evidence.file.lastIndexOf('/'));
    const target = plant.run ?? plant.evidence.file.slice(plant.evidence.file.lastIndexOf('/') + 1);
    if (!target.endsWith('.tflw')) {
      fail(`${plant.id} is graded by \`acceptance\`, which runs \`${target}\` as a test file, but that is not a \`.tflw\`. `
        + `Give the plant a \`run\` naming the test file beside its evidence.`);
      continue;
    }
    if (!exists(`${root}/${dir}/${target}`)) {
      fail(`${plant.id}'s acceptance target \`${dir}/${target}\` does not exist on disk.`);
    }
  }
}

export function assertLedgerIds(markdown, fail) {
  const documented = new Set([...markdown.matchAll(/^\|\s*`(C\d+)`\s*\|/gm)].map((m) => m[1]));
  // A reference roster (`C59`, `D763`) is a row in this file and a row in the markdown exactly like
  // a plant, and it is checked here for the same reason: the markdown is where a human reads what
  // the citation claims, and a citation nobody can find is the failure this ledger keeps having.
  const rostered = [...PLANT_IDS, ...REFERENCE_ROSTER_IDS];
  for (const id of rostered) {
    if (!documented.has(id)) fail(`${id} is rostered in scripts/lib/constructs.mjs with no row in CONSTRUCTS.md`);
  }
  for (const id of documented) {
    if (!rostered.includes(id)) fail(`CONSTRUCTS.md has a row for ${id}, which is rostered nowhere in scripts/lib/constructs.mjs`);
  }
}
