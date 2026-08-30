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
  // `M154g` step 5 (`D765`). Tier 3's grader, and the newest `gated: true` in this table — it was
  // `gated: false` in everything but the field, because the field did not exist and the script ran
  // nowhere. `D764` is what found it: three ratchet entries held themselves back on the sentence
  // *"a Tier 3 assertion costs an order of magnitude more requests than a Tier 2 one (`D380`)"*, and
  // `D380` does not say that — it decides that the ~45 real test files are Tier 3's negative corpus
  // and its **volume measurement**, which is `sweep-input-volume.mjs`'s 240 observed requests and a
  // different script entirely. Measured instead of argued: this grader costs 7 assertions and 80
  // extra requests and finishes in **0.91-1.05 s** on `fedora-box`, against **1.70-1.99 s** for
  // `security-acceptance-gate`, the Tier 1/2 phase the sweep has run since `M139-5` — six runs each,
  // two days, two commits. The premise was not merely misattributed, it was inverted.
  input: { script: 'scripts/verify-input-acceptance.mjs', phase: 'input-acceptance', gated: true },
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
    title: 'the dialog handler is armed, the armings queue, and the answer reaches the kind that takes one',
    target:
      "webV2/admin — the bulk out-of-stock delete's two short-circuited `confirm()`s, plus (`M159f-c`) " +
      'the stock-health `alert()`, the rename `prompt()` and the unsaved-reply `beforeunload` guard',
    evidence: { file: 'tests/.constructs/dialog-one-shot.tflw', pattern: '^\\s*accept dialog\\s*$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Three states of the same click, and the set is the claim. With nothing armed the first ' +
      'confirm is dismissed by default and `#bulk-delete-state` reads `cancelled`; with one ' +
      '`accept dialog` the first is accepted and the second falls through to the default, reading ' +
      '`cancelled-final`; with **two**, both are accepted, the form submits and both products are ' +
      'really gone (asked of the API, not of the page that claims it). A step that armed nothing ' +
      'would leave `cancelled` every time; a handler that stayed armed past its first dialog would ' +
      'reach the third state from the second row. ' +
      '**And, since `M159f-c`, across the kinds** (`tests/.constructs/dialog-kinds.tflw`): a ' +
      '`prompt` returns three distinguishable things and one button separates them — `null` ' +
      'unarmed, `""` under a bare `accept dialog`, and the typed answer under `accept dialog ' +
      'with`, which is read back off the *product* rather than off the page; an `alert` leaves ' +
      'the same counter under all three armings, because it has one button and there is nothing ' +
      'else to grade; and `dialog type` moves from `alert` to `confirm` inside one attempt, which ' +
      'a single-kind corpus cannot show at all.',
    catches:
      'a handler that stays armed, a step that arms nothing, an arming queue that keeps only one, a ' +
      '`dialog type` fixed at `confirm`, and an `accept dialog with` whose answer never leaves the ' +
      'arming.',
    // `M159f-c` — the second target, and the reason for it. Everything above raises ONE kind, and
    // two claims were vacuous because of it: `dialog type` has a closed set of four values this
    // repository could produce one of, and `accept dialog with`'s only use here is the `TF080`
    // witness, which asserts that the answer went NOWHERE — so an implementation that parsed the
    // value and never handed it to Playwright satisfied it by construction. Only a `prompt`
    // separates those. `evidence` stays on `dialog-one-shot.tflw`: the static roster wants one
    // file per row, and the kind plant is acceptance evidence for the same construct, not another.
    //
    // No roster row was added. `accept dialog with` is `step:accept` with more syntax, and
    // `dialog message`/`dialog type` are value subjects inside matcher rows — which is why the
    // total stayed at 180 where tflw's `D805` predicted 181.
    // `M154b-02` is CLOSED by tflw's `D797`: the third state was unreachable under a single slot —
    // two consecutive armings arm one handler, and the two dialogs come from one `click` with no
    // step boundary between them — and a queue makes it the ordinary reading of the same script.
    // It is asserted in a second `test` in the same file (`D806f`) because it is terminal: it
    // deletes the products that make the button exist. `blockedOn` stays null and always did.
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
    title: 'dismissal is unobservable in isolation, so the plant grades the order it is answered in',
    target: 'webV2 admin console — the bulk out-of-stock delete’s two confirms',
    evidence: { file: 'tests/.constructs/dialog-one-shot.tflw', pattern: '^\\s*dismiss dialog\\s*$', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Closes `M154b-01`. **`dismiss` and nothing-armed take the same branch** — the browser\'s ' +
      'unhandled default IS dismissal — so the step is indistinguishable from its absence by direct ' +
      'observation, which is why the two uses elsewhere in this repository prove nothing. What a ' +
      'QUEUE (tflw `D797`) makes visible is *which* dialog it answers: the plant writes the ' +
      'dismissal FIRST, so confirm #1 is dismissed, the form returns false and confirm #2 is never ' +
      'raised — `cancelled`, with the accept behind it left unconsumed. A `dismiss` that armed ' +
      'nothing lets that accept slide onto confirm #1, and a STACK answers #1 with it too; both ' +
      'land on `cancelled-final`, the state the preceding block of that same test just produced, so ' +
      'the wrong answer is reachable rather than hypothetical. `dialog message` then reads the ' +
      'FIRST confirm\'s text, which is only true if #2 was never raised.',
    catches: 'a `dismiss dialog` that does not arm, an arming order that is a stack or a slot, and a queue that answers out of order.',
    // `M159f` (`D806e`) replaced this row's mechanism, not its subject. It used to grade the
    // OVERWRITE — the one thing a single slot let `dismiss` do that its absence could not — and
    // `D797` deleted the slot. Measured red on 2026-08-30 at exactly that block, with `C2`'s two
    // rows still green beside it: the plant was grading the old semantics, not finding a defect.
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
    // `M157f` (`D789`) — re-pointed, not deleted. This row graded `step:cleanup`, the construct
    // `M157` removed; deleting it would have dropped coverage of a construct that still exists in
    // changed form, which `D724` forbids and the ratchet would not catch. What it grades now is
    // strictly more than what it graded before: the old plant was a two-way contrast (opted in vs.
    // not), this one is three-way and includes the failing-iteration case the old construct got
    // wrong and `M154e-01` never knew about.
    construct: 'config:key:teardown',
    family: 'config',
    tier: 'workload',
    title: 'teardown decides when a workload iteration tears down, and `on success` reads the iteration rather than the run',
    target: 'tflw-acceptance/conformance/teardown.tflw + arrival-server.mjs — one file run three times, at each level of the key',
    evidence: { file: 'tflw-acceptance/conformance/teardown.tflw', pattern: '^\\s*api GET /after-each-marker\\s*$', min: 1 },
    graders: ['acceptance', 'coverage'],
    knownAnswer: 'One file, eight iterations, three runs, three different marker counts — the contrast is the plant. **Default** -> **8**: every iteration of both tests, *including the four that failed*, which is the half `M154e-01` did not know about (until `M157b` the interpreter threw on a failing body above the hook loop, so a run at a 5% error rate cleaned up after 95% of its iterations and leaked on exactly the 5% worth investigating). **`--teardown never`** -> **0**, with `ℹ teardown: disabled` on the summary, and the exit code unchanged. **`--teardown on-success`** -> **4**, the first test\'s iterations only. The first test is **red by threshold while all four of its iterations pass**, so `on success` keeping them is the sharp clause: a breached `threshold` is a run-level judgement made after every iteration has finished, and a build reading the test\'s verdict instead of the iteration\'s would answer 0 and look plausible doing it. Fourth clause, and the one no plant here could make before: the reported **p95 is unchanged across all three runs**, which is what proves hook time left the metric (`D782`).',
    catches: 'a build that ignores the key (8 three times), one that reinstates the old default-off gate (0 three times, since no file can opt in any more), teardown skipping the iterations that failed, `on success` reading the run\'s verdict instead of the iteration\'s, and hook time leaking back into the reported duration.',
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
  // **Three security constructs were deliberately NOT here, and `M154g` step 5 added them as
  // `C109`-`C111`.** The reason they were held back was sound in form and wrong in fact: Tier 3's
  // grader asserts, exits non-zero, and ran in **no automated pass**, so a row pointing at it would
  // have read as evidence while nothing evaluated it. That half was true, and it is the half `D765`
  // fixed — the grader is now the `input-acceptance` regression phase, which is `D493`'s remedy for
  // `M137e-01` applied a third time. What was never true is the reason given for leaving it
  // ungated: *"a Tier 3 assertion costs an order of magnitude more requests than a Tier 2 one
  // (`D380`)"*. `D380` decides something else entirely, and the measurement inverts the claim
  // (0.91-1.05 s against `security-acceptance-gate`'s 1.70-1.99 s). See `D764` and `M154g-13`.
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

  {
    id: 'C60',
    construct: 'matcher:equals',
    family: 'matcher',
    tier: 'api',
    title: '`equals` is exact, and is not a prefix comparison',
    target: 'tests/.constructs/matcher-discrimination.tflw against `GET /v1/soft-check/known-answer` — `C1`\'s frozen constant, so every expected value is a literal',
    evidence: { file: 'tests/.constructs/matcher-discrimination.tflw', pattern: '^\\s*expect body\\.\\S+ not equals ', min: 3 },
    graders: ['acceptance'],
    knownAnswer:
      '`body.price` is `42` and `body.truthy` is `4`, so `expect body.price not equals 4` is the ' +
      'assertion an `equals` written as a prefix or `startsWith` comparison fails — and that ' +
      'implementation passes all 1581 other uses of `equals` in this repository. Two more `not` ' +
      'lines pin the two remaining cheap mistakes: folding case (`"Known-Answer"`) and trimming ' +
      'whitespace (`"known-answer "`). Every negative was run with its `not` dropped and every one ' +
      'of them went red, so none of them is decoration.',
    catches: 'an `equals` that folds case, trims, or compares prefixes — none of which any positive ' +
      'assertion in this suite can see.',
    blockedOn: null,
  },
  {
    id: 'C61',
    construct: 'matcher:contains',
    family: 'matcher',
    tier: 'api',
    title: '`contains` is substring on a string and membership on an array, and the two are different',
    target: 'tests/.constructs/matcher-discrimination.tflw against `GET /v1/soft-check/known-answer` — `C1`\'s frozen constant, so every expected value is a literal',
    evidence: { file: 'tests/.constructs/matcher-discrimination.tflw', pattern: '^\\s*expect body\\.\\S+ not contains ', min: 2 },
    graders: ['acceptance'],
    knownAnswer:
      '`"plan"` is a substring of the element `"plant"` and of the JSON text of the whole array, ' +
      'and it is not an element of it — so `expect body.tags not contains "plan"` is red for an ' +
      'implementation that stringified the array and searched it, which is the ordinary way to get ' +
      'this wrong. The string half is asserted from the middle of the value (`"own-ans"`), so an ' +
      'implementation anchored at either end fails it.',
    catches: 'a `contains` that searches a stringified array instead of its elements, and one anchored at ' +
      'either end of a string.',
    blockedOn: null,
  },
  {
    id: 'C62',
    construct: 'matcher:matches-regex',
    family: 'matcher',
    tier: 'api',
    title: '`matches` is a regular expression, not a substring search',
    target: 'tests/.constructs/matcher-discrimination.tflw against `GET /v1/soft-check/known-answer` — `C1`\'s frozen constant, so every expected value is a literal',
    evidence: { file: 'tests/.constructs/matcher-discrimination.tflw', pattern: '^\\s*expect body\\.\\S+ matches "EUR\\|USD"', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Every `matches` in this repository is a literal — `"json"`, `"nginx"`, `"Secure"`, ' +
      '`"session="` — so `String.includes` passes all 31 of them. `expect body.currency matches ' +
      '"EUR|USD"` is the one assertion that separates the two: no field in the payload contains ' +
      'those eight characters, so a substring implementation goes red. `not matches "^eur$"` adds ' +
      'case-sensitivity, and `^known-[a-z]+$` adds anchoring.',
    catches: 'a `matches` implemented as a substring search, which every existing use in this suite is ' +
      'blind to.',
    blockedOn: null,
  },
  {
    id: 'C63',
    construct: 'matcher:matches-subset',
    family: 'matcher',
    tier: 'api',
    title: '`matches subset` ignores the keys it was not given, and fails on one wrong value',
    target: 'tests/.constructs/matcher-discrimination.tflw against `GET /v1/soft-check/known-answer` — `C1`\'s frozen constant, so every expected value is a literal',
    evidence: { file: 'tests/.constructs/matcher-discrimination.tflw', pattern: '^\\s*expect body not matches subset ', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Two keys of seven are listed, so a `matches subset` implemented as deep equality is red on ' +
      'the positive — that is the matcher\'s whole reason to exist. The negative names the same two ' +
      'keys with `price` off by one, so an implementation that checked only that the listed keys ' +
      'were *present*, or that stopped at the first match, is red on it. The pair is the claim; ' +
      'either alone is satisfied by a wrong implementation.',
    catches: 'a subset that is really equality, and a subset that checks presence rather than value.',
    blockedOn: null,
  },
  {
    id: 'C64',
    construct: 'matcher:matches-schema',
    family: 'matcher',
    tier: 'api',
    title: '`matches schema` validates against the API\'s own document, and rejects a document the body ' +
      'does not fit',
    target: 'tests/.constructs/matcher-discrimination.tflw against `GET /v1/soft-check/known-answer` — `C1`\'s frozen constant, so every expected value is a literal',
    evidence: { file: 'tests/.constructs/matcher-discrimination.tflw', pattern: '^\\s*expect body not matches schema "ProductResponseDto"', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'The positive validates the frozen payload against `SoftCheckAnswerDto` out of apiV2\'s live ' +
      '`/openapi.json`. The negative points the *same* matcher at `ProductResponseDto` in the same ' +
      'document and demands a rejection — which is the half that means anything, because a matcher ' +
      'that resolved the `$ref` to nothing, or that read "no errors reported" as "valid", passes ' +
      'the positive against literally any body. `matchers-explained.tflw` asserts ' +
      '`ProductResponseDto` *positively* against a real product, so across the two files one schema ' +
      'is shown discriminating in both directions.',
    catches: 'a schema matcher that validates nothing and reports success — the failure mode a ' +
      'positive-only assertion cannot distinguish from a pass.',
    blockedOn: null,
  },
  {
    id: 'C65',
    construct: 'matcher:greater-less-than',
    family: 'matcher',
    tier: 'api',
    title: '`is greater than` and `is less than` are strict at the boundary',
    target: 'tests/.constructs/matcher-discrimination.tflw against `GET /v1/soft-check/known-answer` — `C1`\'s frozen constant, so every expected value is a literal',
    evidence: { file: 'tests/.constructs/matcher-discrimination.tflw', pattern: '^\\s*expect body\\.\\S+ not is (greater|less) than ', min: 2 },
    graders: ['acceptance'],
    knownAnswer:
      '`body.price` is `42`, and all four assertions sit on the boundary: `> 41` and `not > 42`, `< ' +
      '43` and `not < 42`. `>=` masquerading as `>` passes the two positives and is red on the two ' +
      'negatives. No other use of this matcher in the repository sits within one of its bound — `is ' +
      'greater than 0`, `is less than 5000ms` — so none of them could ever notice.',
    catches: 'a comparison that is inclusive where the language says it is strict, in either direction.',
    blockedOn: null,
  },
  {
    id: 'C66',
    construct: 'matcher:has-count',
    family: 'matcher',
    tier: 'api',
    title: '`has count` is an exact length, not a lower bound',
    target: 'tests/.constructs/matcher-discrimination.tflw against `GET /v1/soft-check/known-answer` — `C1`\'s frozen constant, so every expected value is a literal',
    evidence: { file: 'tests/.constructs/matcher-discrimination.tflw', pattern: '^\\s*expect body\\.\\S+ not has count ', min: 2 },
    graders: ['acceptance'],
    knownAnswer:
      '`body.tags` has two elements, and the two negatives are one either side: `not has count 1` ' +
      'is red for an implementation written as `length >= N`, and `not has count 3` is red for one ' +
      'written as `length <= N`. A `has count` that returned true for anything fails both. The ' +
      'positive alone distinguishes none of the three.',
    catches: 'a `has count` that is a lower bound, an upper bound, or not a count at all.',
    blockedOn: null,
  },
  {
    id: 'C67',
    construct: 'step:api',
    family: 'step',
    tier: 'api',
    title: 'one `api` step issues exactly one request',
    target: 'tests/.constructs/step-workhorses.tflw against `POST /v1/lifecycle/mark` — the same counter module `C4` and `C5` read back, so the observable is the server\'s own arrival count',
    evidence: { file: 'tests/.constructs/step-workhorses.tflw', pattern: 'label: "c67once"', min: 2 },
    graders: ['acceptance'],
    knownAnswer:
      'The server answers each mark with its own arrival count for that label, so the numbers are ' +
      'the claim: the first `api` step against `c67once` comes back `count: 1`, the second `count: ' +
      '2`, and the grader reads `marks.c67once == 2` back with no other label from this test. An ' +
      '`api` that fired twice, retried silently, or sent a preflight nobody asked for moves those ' +
      'numbers and **nothing else in this repository would notice** — all 1139 existing uses assert ' +
      'on the last response, and a duplicate request leaves the last response identical.',
    catches: 'a step that issues more than one request per `api` line, in any of the ways that leave the final response unchanged.',
    blockedOn: null,
  },
  {
    id: 'C68',
    construct: 'step:expect',
    family: 'step',
    tier: 'api',
    title: '`expect` fails the test immediately — the step after it never runs',
    target: 'tests/.constructs/hard-stop-semantics.tflw, a file meant to fail; graded from the report\'s truncated step list and from a marked label that must be absent server-side',
    evidence: { file: 'tests/.constructs/hard-stop-semantics.tflw', pattern: 'label: "c68after"', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'The test marks `c68before`, fails one `expect`, then marks `c68after`. The known answer is ' +
      '`marks.c68before == 1` with `c68after` **absent**, and a report whose step list ends at the ' +
      'failing `expect`. `C1` is deliberately the same shape built on `check` and proves the ' +
      'opposite — that the step after it ran — so the two rows together pin the single difference ' +
      'between the language\'s hard and soft assertion. All 1692 uses of `expect` are blind to it, ' +
      'because in the ordinary shape of a test the assertion is the last thing that happens.',
    catches: '`expect` degrading into `check`: recording its failure and carrying on.',
    blockedOn: null,
  },
  {
    id: 'C69',
    construct: 'step:capture',
    family: 'step',
    tier: 'api',
    title: '`capture` fails on nothing to capture, and binds the value rather than a live reference',
    target: 'tests/.constructs/hard-stop-semantics.tflw — one failing test for the contract `tflw spec` states, and one passing test for the half that contract does not mention',
    evidence: { file: 'tests/.constructs/hard-stop-semantics.tflw', pattern: '^\\s*capture body\\.thereIsNoSuchField as missing', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Two halves, and the second is not in the manifest. The stated contract — "a capture that ' +
      'resolves to nothing fails the step rather than binding `undefined`" — is graded as a ' +
      '`capture` step with `ok: false` and a `c69after` mark that never arrives. The unstated one ' +
      'is that a capture binds **at capture time**: the third test captures, issues another ' +
      'request, and then asserts the first value, which a lazy read against "the response in scope" ' +
      'would answer `c69second`. Not one of the 523 existing captures can see that, because none of ' +
      'them issues a request between a capture and its use.',
    catches: 'a capture that binds `undefined` silently, and one that re-reads the response at use time instead of at capture time.',
    blockedOn: null,
  },
  {
    id: 'C70',
    construct: 'step:let',
    family: 'step',
    tier: 'api',
    title: '`let` binds once — a name is not re-evaluated at each interpolation',
    target: 'tests/.constructs/step-workhorses.tflw against `POST /v1/lifecycle/mark`, with the bound value used as the label so the server can count how many distinct ones it saw',
    evidence: { file: 'tests/.constructs/step-workhorses.tflw', pattern: 'label: "c70-\\{tag\\}"', min: 2 },
    graders: ['acceptance'],
    knownAnswer:
      '`let tag = random string 8`, then two marks against `c70-{tag}`. Bound-once answers `count: ' +
      '1` then `count: 2` and leaves the server holding **one** label; re-evaluated-at-use answers ' +
      '`count: 1` twice and leaves **two**, while every assertion about status stays green. The ' +
      'generator is load-bearing rather than decorative: with a literal on the right-hand side the ' +
      'two implementations are indistinguishable, which is what makes the existing uses of `let` no ' +
      'evidence at all.',
    catches: 'a `let` that is a macro over its source expression rather than a binding of its value.',
    blockedOn: null,
  },
  {
    id: 'C71',
    construct: 'step:log',
    family: 'step',
    tier: 'api',
    title: '`log` reaches the report, interpolated, at the level it was given',
    target: 'tests/.constructs/step-workhorses.tflw — graded out of `report/results.json`, because `log` is never an assertion and so cannot be graded from a verdict',
    evidence: { file: 'tests/.constructs/step-workhorses.tflw', pattern: '^\\s*log warn "c71 observed \\{subject\\}"', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'The step arrives in `report/results.json` as `kind: log`, `level: warn`, `destination: ' +
      'both`, with its detail reading `c71 observed c71logged` — the captured `{subject}` resolved. ' +
      'Three wrong implementations, one reading each: a `log` that only reached stdout leaves ' +
      'nothing in the report, one that stored its source line leaves `{subject}` unexpanded, and ' +
      'one that dropped the level reports the default. Like `C41`\'s `screenshot` this is a fact ' +
      'about the report rather than a test outcome, and the same weaker instrument — it grades what ' +
      'tflw says it did.',
    catches: 'a log line that never reaches the report, loses its level, or is stored unexpanded.',
    blockedOn: null,
  },
  {
    id: 'C72',
    construct: 'step:wait',
    family: 'step',
    tier: 'api',
    title: '`wait until api` re-issues until its condition holds, and stops when it does',
    target: 'tests/.constructs/step-workhorses.tflw against `POST /v1/lifecycle/attempt`, whose `c72settles` key answers 503 on attempts 1 and 2 and 200 on attempt 3',
    evidence: { file: 'tests/.constructs/step-workhorses.tflw', pattern: '^\\s*wait until api POST /lifecycle/attempt', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Three independent readings of the same number, which is what makes the row worth having. The ' +
      'plant asserts `body.attempt equals 3` in-band; the report\'s own step detail reads `passed ' +
      'after 3 attempts`; and the grader reads `attempts.c72settles == 3` back off the server. The ' +
      'first two prove it **re-issued** — a single request with a generous timeout sees `settled: ' +
      'false` and dies — and the third proves it **stopped**, which the first two cannot: a wait ' +
      'that kept polling its budget out after the condition held is green on both of them.',
    catches: 'a `wait` that issues one request behind a long timeout, and one that does not stop polling once its condition is met.',
    blockedOn: null,
  },
  // --- `M154g` step 2c: the four declarations that decide which tests exist ------------------
  //
  // `test`, `import`, `with each` and `@tag` are the constructs that answer, before a single step
  // runs, *which tests are there and which of them will execute*. Every one of them is used
  // constantly here and every one of those uses observes something else: the suite's ordinary runs
  // are unfiltered, so a `@tag` that selected nothing leaves the whole suite green.
  {
    id: 'C73',
    construct: 'declaration:test',
    family: 'declaration',
    tier: 'api',
    title: '`test` is the unit of *reporting* and of *isolation* — N declarations, N verdicts, and one failure does not end the file',
    target: 'tests/.constructs/hard-stop-semantics.tflw, graded out of `report/results.json` — the same run `C68` and `C69` already pay for',
    evidence: { file: 'tests/.constructs/hard-stop-semantics.tflw', pattern: '^test "', min: 3 },
    graders: ['acceptance'],
    knownAnswer:
      'Three `test` declarations produce **three** reported tests carrying their three declared ' +
      'names in declaration order, and the third one **passes** although the first two failed. ' +
      'Both halves are needed and neither is observable in an ordinary green file. A runner that ' +
      'reported a file as one unit produces one verdict, and so does one that abandoned the file at ' +
      'its first failing test — the two wrong implementations are indistinguishable from each other ' +
      'by count alone, which is why the third test\'s *verdict* is asserted and not just its ' +
      'presence. Graded on the meant-to-fail plant on purpose: in a file where everything passes, ' +
      '"the next test still ran" is not a claim about anything.',
    catches: 'a runner that reports per file rather than per test, and one that stops a file at its first failing test.',
    blockedOn: null,
  },
  {
    id: 'C74',
    construct: 'declaration:import',
    family: 'declaration',
    tier: 'api',
    title: '`import` brings actions across and leaves tests behind',
    target: 'tests/.constructs/import-brings-actions-only.tflw + tests/.constructs/imported-suite.tflw, against `POST /v1/lifecycle/mark`',
    evidence: { file: 'tests/.constructs/import-brings-actions-only.tflw', pattern: '^import "\\./imported-suite\\.tflw"', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'The manifest\'s claim is a negative — *"pull in another suite\'s `action`s; its tests never ' +
      'run"* — and every existing `import` in this repository proves only the positive half, ' +
      'because a file that imports a shared action and calls it demonstrates that the action ' +
      'arrived and nothing else. The imported file here offers **both**: an action that marks ' +
      '`c74action` and a test that marks `c74importedtest`. After the importer runs, the report ' +
      'carries exactly **one** test and none of it from the imported file, the server has **never ' +
      'seen** `c74importedtest`, and it has seen `c74action` exactly once. That third reading is ' +
      'what makes the absence mean *excluded* rather than *never loaded* — without it, an `import` ' +
      'that silently resolved to nothing passes.',
    catches: 'an `import` that registers the imported file\'s tests, and — via the action — one that quietly imports nothing at all.',
    blockedOn: null,
  },
  {
    id: 'C75',
    construct: 'declaration:with-each',
    family: 'declaration',
    tier: 'api',
    title: '`with each` reports one test per row, not one test that loops',
    target: 'tests/.constructs/with-each-rows.tflw against `POST /v1/lifecycle/mark`, the row value spent on the label',
    evidence: { file: 'tests/.constructs/with-each-rows.tflw', pattern: '^\\s*\\| "(alpha|beta|gamma)" +\\|', min: 3 },
    graders: ['acceptance'],
    knownAnswer:
      'Three rows produce **three** reported tests from this file, with three distinct names each ' +
      'carrying its own row value interpolated, and the server holds three distinct labels at one ' +
      'each. The wrong implementation this is aimed at is not a broken one: a `with each` that ran ' +
      'its rows in a loop inside a *single* reported test satisfies every existing use in this ' +
      'suite — the requests all go out and the expectations all hold — and differs only in the ' +
      'summary saying one test passed instead of three. The in-band `expect body.count equals 1` ' +
      'covers the other direction, a row executed twice, which changes no test count at all.',
    catches: 'a `with each` that reports its rows as one test, one that runs a row twice, and one that does not interpolate the row into the name.',
    blockedOn: null,
  },
  {
    id: 'C76',
    construct: 'declaration:tags',
    family: 'declaration',
    tier: 'api',
    title: '`@tag` partitions a run — and the partition is proved by what is ABSENT',
    target: 'tests/.constructs/tag-selection.tflw, run four times under four selections and compared against the arrival counter',
    evidence: { file: 'tests/.constructs/tag-selection.tflw', pattern: '^@constructs @c76alpha @c76beta$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Three tests, three labels, three tag-sets, four runs. Unfiltered leaves all three labels; ' +
      '`--tag c76alpha` leaves `c76alpha` and `c76both` and **not** `c76beta`; `--tag c76beta` is ' +
      'the exact complement; `--tag c76alpha,c76beta` leaves all three, which is the OR the manifest ' +
      'claims. Each run rules out a different wrong answer that the others pass: a `--tag` matching ' +
      'everything passes runs 1 and 4, and one matching only a test\'s first-listed tag passes run ' +
      '2 while failing run 3. `c76both` is expected in **all four**, because `--tag` selects a test ' +
      'carrying *any* listed tag rather than one tagged exclusively. The row also states the ' +
      'negative the manifest used to get wrong (tflw `M154g-03`): there is no exclusion flag, and ' +
      'the grader proves it by running `--exclude-tag` and requiring `unknown flag` back.',
    catches: 'a `--tag` that filters nothing, filters everything, or reads only the first tag on a declaration.',
    blockedOn: null,
  },
  {
    id: 'C77',
    construct: 'declaration:action',
    family: 'declaration',
    tier: 'api',
    title: "an `action` gets its own response scope — `give` is the only thing that crosses back (`FU-12`)",
    target: 'tests/.constructs/action-response-scope.tflw, against `POST /v1/lifecycle/mark`',
    evidence: { file: 'tests/.constructs/action-response-scope.tflw', pattern: '^action c77 marks inside\\(label\\)$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'The caller marks `c77outer`, calls an action which marks `c77inner`, and then asserts on ' +
      '`body` again — and reads its own response, not the action\'s, although the action\'s request ' +
      'was strictly later. The manifest joins two claims with a "so", and the 51 existing `action` ' +
      'declarations in this repository observe only the first: a call is followed by an assertion ' +
      'on the value it gave, never by an assertion on `body`, so an action that published its ' +
      'response into the caller\'s scope is invisible in every one of them. The grader also ' +
      'requires the server to have seen `c77inner` exactly once, which is what stops the negative ' +
      'from being satisfied by an action that never ran at all.',
    catches: 'an `action` whose response leaks into the caller\'s scope, and — via the mark — one whose body never executed.',
    blockedOn: null,
  },
  {
    id: 'C78',
    construct: 'declaration:use',
    family: 'declaration',
    tier: 'api',
    title: '`use` makes a JS export callable — and makes `TF037` undecidable for the whole file',
    target: 'tests/.constructs/use-js-helper.tflw at runtime, plus the `tflw check` pair check-unknown-call-{without,with}-use.tflw',
    evidence: { file: 'tests/.constructs/use-js-helper.tflw', pattern: '^use "\\.\\./helpers/c78-digest\\.ts"$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Two claims in one sentence, needing two instruments. The export answers `c78-51f2ab95` for ' +
      '`"conformance"` — a 31-based rolling hash in hex, and the DSL has no arithmetic, no loop ' +
      'over code points and no hex formatting, so no `use` that imported nothing can produce it. ' +
      'The second claim is a negative about the **checker** and cannot be observed by running ' +
      'anything: two files identical but for one `use` line make the same bogus call, and ' +
      '`tflw check` reports `TF037` on the one without and stays silent on the one with. The ' +
      'control is load-bearing — "no `TF037` here" is equally satisfied by a checker that never ' +
      'emits `TF037` at all. Nineteen files already `use` a helper and not one of them states ' +
      'either half: they sleep, paginate or sign, so a `use` resolving to nothing would surface, ' +
      'if at all, as some later step failing for an unrelated-looking reason.',
    catches: 'a `use` that imports nothing, one whose call returns the argument unchanged, and a checker that "improves" `TF037` by peeking at a module it must not execute.',
    blockedOn: null,
  },
  {
    id: 'C79',
    construct: 'declaration:before',
    family: 'declaration',
    tier: 'api',
    title: 'bare `before` runs per test and shares its scope; `before file` runs once and is sealed off from every test',
    target: 'tests/.constructs/before-scopes.tflw against the arrival counter, plus check-before-file-scope-isolated.tflw under `tflw check`',
    evidence: { file: 'tests/.constructs/before-scopes.tflw', pattern: '^before file$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Four claims in one manifest sentence; ~90 uses in this repository observe one of them. Both ' +
      'hooks mark, and after a three-test run the server holds `c79file` at **1** and `c79each` at ' +
      '**3** — the cardinality half, which no existing file states, because a `before file` that ' +
      'ran before every test would reset the database more often and leave every one of them just ' +
      'as green. The shared-scope half rides the same request: bare `before` captures the count it ' +
      'just caused and each test asserts its own ordinal, 1, 2, 3, which is one line carrying two ' +
      'claims — the binding is visible inside the test body, and it was re-evaluated rather than ' +
      'reused. The fourth claim cannot be written as a running test at all: a file that reads a ' +
      '`before file` binding from a test does not compile, so the observation is `TF030` and the ' +
      'fixture is a file that must fail to check. Its twin does exactly the same capture from a ' +
      'bare `before` and passes, which keeps the refusal a fact about `before` rather than about ' +
      '`capture`.',
    catches: 'a `before file` that runs per test, a bare `before` that runs once per file, a hook whose bindings are invisible to the test, and a `before file` whose scope leaks into one.',
    blockedOn: null,
  },
  {
    id: 'C80',
    construct: 'declaration:as',
    family: 'declaration',
    tier: 'api',
    title: '`as <session>` is what makes the request authorized — the same GET is 200 with it and 401 without',
    target: 'tests/examples/sessions-explained.tflw, graded out of report/results.json — an existing file, no new fixture',
    evidence: { file: 'tests/examples/sessions-explained.tflw', pattern: '^test ".*" as admin$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'The only row in this tier that needed no fixture written, and saying so is the point: the ' +
      'discriminating pair was **already running**. `GET /orders/all` answers 200 in a test ' +
      'declared `as admin` and 401 in a test with no clause, in the same file, in the same run, ' +
      'against the same path — so the clause and nothing else is what moved the status. The grader ' +
      'reads both verdicts out of the report and additionally requires the two tests to have ' +
      'issued the **same** request, because two tests that merely disagree about a status code are ' +
      'not a pair. A third test, `as admin, shopper`, covers the manifest\'s "one or more": both ' +
      'sessions\' contributions land, later-listed winning a conflict. What this row adds over the ' +
      'file is the *statement* — `M154a` counted this file as evidence of `as` and never asked ' +
      'what it proved (`D722`).',
    catches: 'an `as` clause that applies no credential, and one that authorizes every test in the file whether it opted in or not.',
    blockedOn: null,
  },

  // --- `M154g` step 3: the generator family, eleven of twelve ---------------------------------
  //
  // One plant and one grader serve all eleven, because every claim in this family is about a
  // *relationship between values* and the relationships overlap: the same four runs that show
  // `random string` repeating under one seed show `unique("…")` ignoring the seed entirely, and the
  // counter that makes `unique number` meaningful is the one `unique email` and `unique uuid` are
  // also reading. Splitting that into eleven fixtures would have produced eleven weaker claims.
  //
  // `generator:unique-like` is the twelfth and it joined them in the `M154g-07` fix batch, as `C113`
  // at the end of this list — it stayed on `RATCHET` through step 3 on a stated condition, and the
  // condition was met by tflw rather than by this repository. It reads with them, not apart: its
  // whole claim is which half of this family it belongs to.
  {
    id: 'C81',
    construct: 'generator:unique-prefix',
    family: 'generator',
    tier: 'api',
    title: '`unique("prefix")` appends a run-wide counter — its distinctness is ordering, not entropy',
    target: 'tests/.constructs/generator-known-answers.tflw, against `POST /v1/lifecycle/mark` and `/attempt`',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let a = unique\\("W3-Widget"\\)$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Three draws yield `W3-Widget-0`, `-1`, `-2`: the prefix verbatim, then three **consecutive** ' +
      'integers. The grader states that as arithmetic, which is what separates this row from the ' +
      '~60 `unique("…")` sites in this suite — every one of them spends the value on a request and ' +
      'asserts on the response, so a generator returning a constant passes the lot. It also runs ' +
      'the plant under two seeds and two run clocks and requires the value to be **identical** in ' +
      'all four, because a counter is not seeded, which is the whole difference from the `random` ' +
      'group. The last claim is `SPEC` §7.2\'s bolded retry clause: inside a `retry 2` test that ' +
      'settles on attempt 3, the counter keeps advancing, so the server sees three distinct values ' +
      'marked once each. Nothing in this repository had observed that — `retry-and-flake.tflw` ' +
      'retries against a `random string 8` key, which is the opposite promise and passes either way.',
    catches: 'a `unique("…")` that drops or mangles its prefix, that repeats within a run, that became seed-derived, or that replays a value across a retried test\'s attempts.',
    blockedOn: null,
  },
  {
    id: 'C82',
    construct: 'generator:unique-email',
    family: 'generator',
    tier: 'api',
    title: '`unique email` is `user<n>@example.test` off the **same** counter every other `unique` reads',
    target: 'tests/.constructs/generator-known-answers.tflw, against `POST /v1/lifecycle/mark`',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let a = unique email$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'The 32 sites this construct has in the suite all use it as an address and none of them says ' +
      'what the address is. It is `user<n>@example.test`, and `<n>` is not this construct\'s own ' +
      'sequence — the grader requires the first address to be `user{k+1}` where `k` is the last ' +
      'index `C81`\'s test drew, so the plant reads `user3@example.test` **because the test above ' +
      'it drew three prefixes**. That is the family\'s real known answer and it is stated nowhere ' +
      'else: two `unique` values are distinct because of ordering across the whole run, not ' +
      'because each construct has a private counter.',
    catches: 'a `unique email` that repeats, that stops being a routable-looking address, or that acquires a per-construct counter and so stops being collision-safe against its siblings.',
    blockedOn: null,
  },
  {
    id: 'C83',
    construct: 'generator:unique-number',
    family: 'generator',
    tier: 'api',
    title: '`unique number` is the shared counter itself, unwrapped',
    target: 'tests/.constructs/generator-known-answers.tflw, against `POST /v1/lifecycle/mark`',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let a = unique number$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'This construct has **no site anywhere in the repository** — `M154g` step 1\'s discovery leg ' +
      'found four like it, and the first move on those is to write a use, not a grader. So this ' +
      'row and its plant are its entire evidence. Three draws are three consecutive integers, and ' +
      'they continue directly from `C82`\'s last address index, which is the third of the four ' +
      'observations that pin the counter as shared.',
    catches: 'a `unique number` that repeats, that returns something other than digits, or that runs off a sequence of its own.',
    blockedOn: null,
  },
  {
    id: 'C84',
    construct: 'generator:unique-uuid',
    family: 'generator',
    tier: 'api',
    title: '`unique uuid` carries the counter in its last eight hex digits — the guarantee `random uuid` does not have',
    target: 'tests/.constructs/generator-known-answers.tflw, against `POST /v1/lifecycle/mark`',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let a = unique uuid$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'v4-shaped, and its trailing eight hex digits are the same run-wide counter — `…0000000c`, ' +
      '`…0000000d`, `…0000000e` is 12, 13, 14. The grader parses them and requires consecutive ' +
      'integers, which is what turns "distinct" from a probability into a guarantee. It also ' +
      'requires that under a **different seed** the uuid changes while those eight digits do not: ' +
      'the two halves of this construct have different sources and only one of them carries the ' +
      'promise. That comparison against `C90` is the documented difference between the two uuid ' +
      'constructs, and it existed nowhere. The counter also jumps by four rather than one between ' +
      '`C83`\'s last draw and this one, because the three `unique like` draws in between spend three ' +
      'ticks of the same shared sequence (`SPEC` §7.5). That gap used to be `M154g-07`\'s evidence — ' +
      'the ticks were spent and the values did not carry them — and it is now just the counter being ' +
      'one counter. It is still asserted, because it is the only place the *sharing* is visible: ' +
      'four constructs reading one sequence is what makes `C82`\'s and `C83`\'s continuations mean ' +
      'anything, and an implementation that gave each construct its own would pass every other claim here.',
    catches: 'a `unique uuid` whose tail stopped being the counter (silently downgrading a guarantee to 122 bits of luck), and one that is no longer v4-shaped.',
    blockedOn: null,
  },
  {
    id: 'C85',
    construct: 'generator:random-number',
    family: 'generator',
    tier: 'api',
    title: '`random number`/`random decimal` are inclusive, seed-reproducible, clock-independent, and refuse an empty range',
    target: 'tests/.constructs/generator-known-answers.tflw + tests/.checkonly/invalid-literal-operand.tflw',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let n = random number 1 to 100$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Four claims. The value is inside its range, and `random number 7 to 7` pins **inclusivity** ' +
      'from both ends, since an exclusive bound has nothing to return. Two runs at one seed repeat ' +
      'it exactly; a different seed moves it; a different `--now` does not. And `random number 5 ' +
      'to 1` / `random decimal 5 to 1` are refused in the source (`TF054`), which is `SPEC` §7.3\'s ' +
      'generator-operand rule for this construct. The seed-sensitivity half is asserted on the ' +
      '**decimal** only, deliberately: a 1-to-100 integer collides across seeds one run in a ' +
      'hundred, and a gate that flakes at 1% is worse than one that asserts less.',
    catches: 'an exclusive upper bound, a generator that ignores `--seed` or wrongly consults the run clock, and a silently-accepted empty range.',
    blockedOn: null,
  },
  {
    id: 'C86',
    construct: 'generator:random-date',
    family: 'generator',
    tier: 'api',
    title: '`random date` derives from the run **clock**, which `--seed` alone cannot reproduce',
    target: 'tests/.constructs/generator-known-answers.tflw + tests/.checkonly/invalid-literal-operand.tflw',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let past = random date in past$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'The row that needed a fourth run. `SPEC` §7.5 makes **two** promises — one run seed and one ' +
      'run clock — and three runs cannot tell them apart, because a date derived purely from the ' +
      'seed satisfies all of them. So the grader adds a run at the same seed and a `--now` one year ' +
      'later, and requires `random date in past` to move by about a year while `random string 12` ' +
      'does not. Alongside: `in past` and `in future` straddle the pinned instant, `between today - ' +
      '10 days and today` lands inside its window, and both `between` refusals are stated in the ' +
      'source — bounds reversed, and a quoted string that is never a date on any run.',
    catches: 'a `random date` that ignores `--now`, that puts a "past" date in the future, that leaves `between` unbounded, or that accepts a reversed or string-typed bound.',
    blockedOn: null,
  },
  {
    id: 'C87',
    construct: 'generator:random-of',
    family: 'generator',
    tier: 'api',
    title: '`random of` picks from its inline list, and picks more than one of them',
    target: 'tests/.constructs/generator-known-answers.tflw, against `POST /v1/lifecycle/mark`',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let a = random of "red", "blue", "green"$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Membership is the obvious half and it is satisfied by a generator that always returns the ' +
      'head of the list — which one draw cannot exclude and which the construct\'s single other ' +
      'site in this repository does not either. So the plant draws three times and the grader ' +
      'requires more than one distinct element, plus the whole sequence repeating under one seed. ' +
      'The three-draw assertion is sound rather than lucky because the seed is pinned: the ' +
      'sequence is a fixed fact about seed 4242, not a coin flip.',
    catches: 'a `random of` that returns something outside its list, and one stuck on a single element.',
    blockedOn: null,
  },
  {
    id: 'C88',
    construct: 'generator:random-string',
    family: 'generator',
    tier: 'api',
    title: '`random string N` is N alphanumerics, `0` is legal, `-3` is not — and it **replays** across a retry',
    target: 'tests/.constructs/generator-known-answers.tflw + tests/.checkonly/invalid-literal-operand.tflw',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let s = random string 12$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'The retry half is the one that matters and it is graded as a **pair with `C81`**, in one ' +
      'test: inside a `retry 2` that settles on attempt 3, `random string 10` is marked three ' +
      'times as one value while `unique("W3-Retry")` is marked once each as three. That is `SPEC` ' +
      '§7.2 and §7.3\'s opposite promises observed together, and it is the fact a reader needs when ' +
      'choosing which generator an idempotency key comes from. Alongside: twelve alphanumerics, ' +
      'repeat-under-one-seed / move-under-another / ignore-the-clock, and the operand table\'s ' +
      'asymmetry — `random string 0` is legal and yields `""` while `random string -3` is refused. ' +
      'That silence is asserted inside a file that *does* report `TF054`, so "no error on `0`" ' +
      'cannot be satisfied by a rule that fires nowhere.',
    catches: 'a wrong length or alphabet, a generator that ignores the seed, a `0` that started erroring, a `-3` that stopped, and a `random` value that stopped replaying across a retried test\'s attempts.',
    blockedOn: null,
  },
  {
    id: 'C89',
    construct: 'generator:random-like',
    family: 'generator',
    tier: 'api',
    title: '`random like` fills `#` from digits and `?` from letters — two alphabets, not one',
    target: 'tests/.constructs/generator-known-answers.tflw, against `POST /v1/lifecycle/mark`',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let a = random like "SKU-####-\\?\\?"$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      '`SKU-####-??` must come back as four digits and two letters in those exact positions. The ' +
      'discriminating part is that the two placeholders draw from **different** alphabets: an ' +
      'implementation using one alphanumeric pool for both produces a string of the right length ' +
      'and the right literal skeleton, and the construct\'s single other site in this repository ' +
      'would not notice. Plus seed reproducibility, as for every member of this group.',
    catches: 'a pattern filler that uses one alphabet for both placeholders, that drops the literal characters, or that ignores the seed.',
    blockedOn: null,
  },
  {
    id: 'C90',
    construct: 'generator:random-uuid',
    family: 'generator',
    tier: 'api',
    title: '`random uuid` is v4 all the way to its last digit — collisions allowed, and the seed reaches them',
    target: 'tests/.constructs/generator-known-answers.tflw, against `POST /v1/lifecycle/mark`',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let a = random uuid$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'The whole content of this row is its **contrast with `C84`**, and it is the reason the two ' +
      'constructs exist separately. Both are v4-shaped, so shape alone cannot tell them apart and ' +
      'the 26 sites this one has in the suite say nothing. Under a changed seed, `random uuid`\'s ' +
      'trailing eight hex digits move and `unique uuid`\'s do not — one is entropy, the other is ' +
      'the run-wide counter. It is also seed-reproducible, which a uuid drawn from the platform\'s ' +
      'own entropy source would not be, and that is the observation that catches a `random uuid` ' +
      'quietly reimplemented as `crypto.randomUUID()`.',
    catches: 'a `random uuid` that bypasses the run seed (breaking `--seed` replay for every test that uses one), and one that acquired a counter and so silently became `unique uuid`.',
    blockedOn: null,
  },
  {
    id: 'C91',
    construct: 'generator:random-password',
    family: 'generator',
    tier: 'api',
    title: '`random password` carries four character classes at the length asked for, defaults to 12, and refuses 2',
    target: 'tests/.constructs/generator-known-answers.tflw + tests/.checkonly/invalid-literal-operand.tflw',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let p = random password 16$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'This construct has 29 sites here and every one of them posts the value to a registration or ' +
      'login endpoint, so what they actually prove is that **apiV2\'s** password policy accepts it ' +
      '— which would stay true of a generator that emitted one constant. The grader asserts the ' +
      'value itself: sixteen characters when sixteen were asked for, twelve when nothing was, all ' +
      'four classes (upper, lower, digit, symbol) present, seed-reproducible, and `random password ' +
      '2` refused in the source because four classes cannot fit in two characters. The refusal and ' +
      'the four classes are the same fact from two directions, which is why they are one row.',
    catches: 'a password missing a character class (making the refusal rule arbitrary), a wrong or ignored length, a changed default, and a generator that stopped honouring the seed.',
    blockedOn: null,
  },
  // --- M154g step 4a: the five config directives ------------------------------------------------
  //
  // The config dialect's top-level words, and the first family in this ledger whose every claim is
  // about the **config** rather than about a test. Nothing a `.tflw` file asserts can see which
  // `env` was selected or whether a `defaults` block was shared — by the time a step runs the
  // selection has happened and left no trace a step can read. So the plant is inverted: one
  // fixture file whose text never changes, and a **committed** config beside it that does. Every
  // config operand lives in `tests/.checkonly/config-directives/` as a readable file rather than a
  // string in the grader, which is `verify-check-diagnostics.mjs`'s own stated rule (*"the fixture
  // stays a real, readable file in the repo — it is dogfood, not a string in a script"*) applied to
  // the half that is the subject here.
  //
  // **`evidence.file` is the config and `run` is the fixture beside it, for `C54`'s reason** —
  // the coverage grader greps where the construct is *witnessed*, and `env two`, `defaults` and
  // `require env` are written in a config and nowhere else. Unlike `C54` the acceptance driver
  // never executes these: each block below builds its own scratch corpus, because the operand
  // being varied is the file `tflw run` would otherwise pick up implicitly.
  //
  // **No stack on any leg.** Four are `tflw check`; the fifth is a `tflw run` against
  // `127.0.0.1:9`, a port the fetch standard blocks, so nothing is ever dialled. These rows grade
  // identically with apiV2 down — the property `C78`/`C79` have — and they are the reason step 4
  // could be split with the cheap half first.
  {
    id: 'C92',
    construct: 'config:directive:env',
    family: 'config',
    tier: 'check',
    title: 'the active env decides what an unchanged file means, and the `default` marker is a third reading of the same grid',
    target: 'three fixture files under `two-envs.config`, checked with no flag, `--env one` and `--env two`',
    evidence: { file: 'tests/.checkonly/config-directives/two-envs.config', pattern: '^env two$', min: 1 },
    run: 'named-service.tflw',
    graders: ['acceptance'],
    knownAnswer:
      'A nine-cell grid over three files and three selections, and the diagnostics are the ' +
      'instrument rather than the subject — `C59` already proves `TF026` fires somewhere, so what ' +
      'is asked here is whether the **active env** is what decides. `named-service.tflw` writes ' +
      '`api extra`, which `env one` declares and `env two` does not: clean, clean, `TF026`. The ' +
      'first column is the `default` marker and is a separate reading, not a repetition of the ' +
      'second — it is the only leg in which nothing on the command line names an env at all, and a ' +
      'tflw that ignored the marker and took the first env would produce the identical answer, so ' +
      'the row also asserts `--env nosuch` is refused **naming both envs**, which is the marker ' +
      'and the roster being read out of the same file. `unscoped-session.tflw` is clean in all ' +
      'three cells, which is what stops the grid from being a fact about `--env two` being broken.',
    catches: 'an `--env` that selects nothing and leaves the first env active, a `default` marker that is parsed and ignored, and named services resolved from the union of every env rather than from the active one.',
    blockedOn: null,
  },
  {
    id: 'C93',
    construct: 'config:directive:defaults',
    family: 'config',
    tier: 'check',
    title: 'one line written once is read by every env — and a second `defaults` block is refused',
    target: 'three configs differing by which block one `allow hosts` line sits in, and by how many `defaults` blocks there are',
    evidence: { file: 'tests/.checkonly/config-directives/defaults-shared.config', pattern: '^defaults$', min: 1 },
    run: 'kept.tflw',
    graders: ['acceptance'],
    knownAnswer:
      'The manifest states two clauses in one sentence — *settings shared by every environment; at ' +
      'most one per config* — and the row is those two clauses. Sharing is a **pair of configs ' +
      'differing by one indentation level**: with `allow hosts "example.test"` in `defaults`, ' +
      '`TF036` fires under `--env one` *and* under `--env two`; with the identical line moved into ' +
      '`env one`, `--env one` is unchanged and `--env two` goes silent. The positive alone is ' +
      'consistent with an allowlist that is global wherever it is written, which would make ' +
      '`defaults` a word the parser accepts rather than a scope it honours. The second clause is ' +
      '`TF022` over a config with two blocks, whose env is deliberately **inside** its own ' +
      'allowlist so `TF036` cannot fire and the asserted code is the only one in the output.',
    catches: 'a `defaults` block parsed and dropped for every env but the default one, an env-level setting that leaks to its siblings, and a duplicate block silently taking the last-wins reading.',
    blockedOn: null,
  },
  {
    id: 'C94',
    construct: 'config:directive:session',
    family: 'config',
    tier: 'check',
    title: 'the `for env` clause is the difference between a session that exists here and one that does not',
    target: 'two sessions in one config, identical but for the clause, against two files identical but for the name they cite',
    evidence: { file: 'tests/.checkonly/config-directives/two-envs.config', pattern: '^session scoped for env one$', min: 1 },
    run: 'scoped-session.tflw',
    graders: ['acceptance'],
    knownAnswer:
      '`C80` already grades `as` — the same `GET` at 200 with it and 401 without — so what is left ' +
      'for the **declaration** is the half `as` cannot see: which envs the identity exists in. ' +
      '`session scoped for env one` and `session everywhere` carry the same login step, the same ' +
      'capture and the same header, and differ only in the clause. Under `--env two` the file ' +
      'citing `scoped` is a `TF028` whose help text quotes the clause back (*"declared `for env ' +
      'one`"*), and the file citing `everywhere` is clean. That second file is the whole reason ' +
      'this is a row and not an observation: without it the `TF028` is equally consistent with ' +
      'sessions not resolving in `env two` at all.',
    catches: 'a `for env` clause parsed and ignored (every session resolving everywhere), and a session table built per-env from the wrong env.',
    blockedOn: null,
  },
  {
    id: 'C95',
    construct: 'config:directive:require',
    family: 'config',
    tier: 'check',
    title: 'the run is refused before a socket exists, the unreferenced variable is required just as hard, and `tflw check` says nothing',
    target: '`require.config` — two required variables, one of them referenced nowhere, over an `api` base on a port the fetch standard blocks',
    evidence: { file: 'tests/.checkonly/config-directives/require.config', pattern: '^require env C95_TOKEN, C95_UNUSED$', min: 1 },
    run: 'kept.tflw',
    graders: ['acceptance'],
    knownAnswer:
      'Three legs, and the third is the finding. **Neither set:** the run is refused naming both ' +
      'variables. **`C95_TOKEN` set:** still refused, naming `C95_UNUSED` **alone** — and that one ' +
      'is referenced nowhere in the config, so the directive is a precondition on the environment ' +
      'rather than a check on use sites. **Both set:** the same run reaches the transport and dies ' +
      'on port 9 (*"no socket was opened"*), which is how "refused before it started" is told from ' +
      '"ran and failed" without a stack. **The third leg asserts a silence tflw\'s own manifest ' +
      'denies**: the summary for this construct reads *"a missing secret fails at **check time** ' +
      'rather than mid-suite"*, and `tflw check` over the identical config reports *"1 file ' +
      'checked, no problems found"*. The guarantee users get is real and is a run-start one; the ' +
      'sentence describing it is wrong, and it is wrong against tflw\'s own principle rather than ' +
      'against an accident: `cli.ts:1520` gates the secrets in the *run* path under the comment ' +
      '*"`check` never reaches this — no execution, no need for real credentials"*, and `P#75` ' +
      'makes doing no I/O the reason `tflw check` can run in CI without secrets at all. So the ' +
      'repair is the sentence, never the gate. Asserted as measured and filed as `M154g-11`.',
    catches: 'a `require env` that only guards the variables something interpolates, a refusal that arrives after the first request instead of before it, and the manifest sentence quietly becoming true or the behaviour quietly changing under it.',
    blockedOn: null,
  },
  {
    id: 'C96',
    construct: 'config:directive:exclude',
    family: 'config',
    tier: 'check',
    title: 'discovery skips the folder and an explicit path still does not',
    target: 'a two-file corpus checked under one config with an `exclude` line and one without',
    evidence: { file: 'tests/.checkonly/config-directives/exclude-on.config', pattern: '^exclude "excluded"$', min: 1 },
    run: 'kept.tflw',
    graders: ['acceptance'],
    knownAnswer:
      'The corpus is `kept.tflw` and `excluded/skipped.tflw`, identical but for their directory, ' +
      'and the two configs are identical but for one line. Discovery reports **1 file checked** ' +
      'with the line and **2 files checked** without it. The third leg is the manifest\'s own ' +
      'qualifier — *"when a run names a folder rather than a file"* — asserted rather than ' +
      'paraphrased: naming `excluded/skipped.tflw` on the command line checks it under **both** ' +
      'configs, so `exclude` is a discovery filter and not an access rule. That distinction is the ' +
      'one with consequences here, because this repository\'s own root config excludes ' +
      '`tflw-acceptance` while several graders run files inside it by path.',
    catches: 'an `exclude` that stops filtering discovery, and one that hardens into a refusal so an explicitly named file can no longer be checked.',
    blockedOn: null,
  },
  {
    id: 'C97',
    construct: 'config:key:api',
    family: 'config',
    tier: 'api',
    title: 'the base URL is joined onto the step\'s path, and each named service has its own',
    target: '`arrival-server.mjs` — three steps under one config, graded by the paths the server recorded',
    evidence: { file: 'tests/.constructs/config-keys/services.config', pattern: '^\\s*api second\\s+"', min: 1 },
    run: 'two-steps.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'The base URL carries a path segment on purpose, because a bare-origin base cannot tell '
      + '*joined* from *replaced*: `api GET /alpha` under `api "http://127.0.0.1:4507/base"` must '
      + 'arrive at **`/base/alpha`**, and it does. `api second GET /gamma` arrives at '
      + '**`/second/gamma`** — a different base, chosen by the name on the step. Ground truth is the '
      + 'server\'s own path counter, never tflw\'s report of where it sent things: a run that '
      + 'resolved `/alpha` against the wrong service, or concatenated the base and dropped its path, '
      + 'produces an identical green summary and a different set of paths on the wire.',
    catches: 'a base URL whose own path is discarded when a step\'s path is appended, and a named service resolved to the default base.',
    blockedOn: null,
  },
  {
    id: 'C98',
    construct: 'config:key:header',
    family: 'config',
    tier: 'api',
    title: 'the configured header is on **every** request, and a service-scoped one is on exactly one',
    target: '`arrival-server.mjs` — the same three steps, with the headers each arrival carried read back off the wire',
    evidence: { file: 'tests/.constructs/config-keys/services-headers.config', pattern: '^\\s*header\\s+"X-Second"\\s+is\\s+".*"\\s+for second\\s*$', min: 1 },
    run: 'two-steps.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '`tflw spec --json` summarises this key as *"a request header sent on every `api` step"*, and '
      + '**every** is the word an ordinary test cannot check: a header attached to the first request '
      + 'of a run satisfies any assertion written after it. The server records the headers of each '
      + 'arrival separately, so the answer is per-request — `X-Plant` on all three, including the one '
      + 'addressed to the named service. The precision half is the same key\'s *scoped* form '
      + '(SPEC §3.2): `header "X-Second" is … for second` arrives on `/second/gamma` and is **absent** '
      + 'from the other two, which is what stops "the header is everywhere" from being satisfied by a '
      + 'runtime that ignores scoping and sends everything. **The key had one occurrence in this '
      + 'repository before this plant** — a `defaults` header written for `C95` — because every other '
      + '`header` line here is inside a `session` block, which is a different construct.',
    catches: 'a header applied to the first request of a run rather than to each one, and per-service scoping that leaks a header onto every service.',
    blockedOn: null,
  },
  {
    id: 'C99',
    construct: 'config:key:timeout',
    family: 'config',
    tier: 'api',
    title: 'the configured budget is the one the request gets, and a step may overrule it',
    target: '`arrival-server.mjs`\'s 50 ms `/slow` path — two configs differing by one duration',
    evidence: { file: 'tests/.constructs/config-keys/timeout-tight.config', pattern: '^\\s*timeout step 10ms\\s*$', min: 1 },
    run: 'slow.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '`timeout step 10ms` against a 50 ms path fails on every machine and `timeout step 5s` passes '
      + 'on every machine, so the *value* is what decides rather than the presence of a timeout at '
      + 'all — and the failure detail quotes the configured duration back (*"request timed out after '
      + '10ms"*), which is the strongest available statement that the number was read. Two things stop '
      + 'it being vacuous. `slow-override.tflw` is the identical request carrying its own `timeout 5s` '
      + 'clause (SPEC §5.1) and **passes under the tight config**, so what was proven is a default a '
      + 'step can overrule, not a hard-wired refusal to wait. And since `M155`/`D768` the plant grades '
      + 'the **narrowing**, as a swapped pair: `timeout step 5s, api 10ms` must fail the request that '
      + '`timeout step 10ms, api 5s` passes. Either config alone is satisfied by a resolver reading '
      + 'only one of the two keys — the tight one passes on a resolver that ignores `step`, the loose '
      + 'one on a resolver that never narrowed anything — so it is their disagreement, on identical '
      + 'corpora one number-swap apart, that says the narrow key is read AND that the broad key '
      + 'stopped reaching HTTP. This leg replaces the old `M154g-10` one, which asserted `timeout api '
      + '5s` was a `TF010` and was written to go red on purpose the day tflw implemented the spelling. '
      + 'It did.',
    catches: 'a `timeout` key parsed and never applied, a per-step override that stopped winning, and a `timeout api`/`timeout browser` that resolves but reaches nothing — or that reaches the other transport.',
    blockedOn: null,
  },
  {
    id: 'C100',
    construct: 'config:key:allow',
    family: 'config',
    tier: 'api',
    title: 'the refusal happens before a socket, proven against a listener that would have recorded one',
    target: '`arrival-server.mjs` — one absolute-URL step, two allowlists differing by one entry',
    evidence: { file: 'tests/.constructs/config-keys/allow-narrow.config', pattern: '^\\s*allow hosts "127\\.0\\.0\\.1"\\s*$', min: 1 },
    run: 'absolute.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '`localhost` and `127.0.0.1` are one machine and two allowlist entries, so the two configs '
      + 'differ by one word and point at the same listener. SPEC §3.7 says a violating request is '
      + 'refused *"before any network I/O — no connection ever attempted, not just a request that then '
      + 'fails"*, and **an absence is only provable against something that would have recorded a '
      + 'presence**: under the narrow list the server records **zero** arrivals at `/blocked`, under '
      + 'the wide one exactly **one**, and its socket counter goes up only in the second. '
      + '`tests/.demo-fail/allow-hosts-blocked.tflw` has dogfooded the *verdict* of this guardrail for '
      + 'two arcs; what it cannot show is that nothing was sent, because a refused request and a '
      + 'rejected one produce the same red.',
    catches: 'an allowlist enforced by discarding the response rather than by never sending the request, and a host matched by address instead of by name.',
    blockedOn: null,
  },
  {
    id: 'C101',
    construct: 'config:key:workers',
    family: 'config',
    tier: 'api',
    title: 'two files either meet inside the target or they do not, and one digit decides',
    target: '`arrival-server.mjs`\'s `/gate` rendezvous — two files, two configs differing by one digit',
    evidence: { file: 'tests/.constructs/config-keys/workers-two.config', pattern: '^\\s*workers 2\\s*$', min: 1 },
    run: 'gate-a.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '**The entry `constructs.mjs` said "rosters when apiV2 has one" about.** `/gate` holds a request '
      + 'until a second joins it or its deadline passes, and reports the high-water mark of '
      + 'simultaneous holders — the overlap watermark a counter cannot produce. At `workers 1` the '
      + 'watermark is **1**, nobody is ever paired and both holders are released alone; at `workers 2` '
      + 'it is **2**, both are released as a pair and nobody waits out a deadline. Exact in both '
      + 'directions and not a timing judgement: the deadline changes how long the serialized leg '
      + 'takes (~3 s against ~30 ms), never which answer it gives, and both legs pass every assertion '
      + 'either way. **`workers` is the `--parallel` axis, not the `--workers` flag** (SPEC §12) — '
      + '`C3` already proves an iteration count is independent of the second one, so this ledger now '
      + 'states both halves of a distinction the two names invite readers to collapse.',
    catches: 'a `workers` key parsed and never reaching the scheduler, and file concurrency that runs regardless of what the config asked for.',
    blockedOn: null,
  },
  {
    id: 'C102',
    construct: 'config:key:report',
    family: 'config',
    tier: 'api',
    title: 'all four artifacts move together, and nothing is left behind at the default location',
    target: 'one green run, twice — the identical corpus with and without the key',
    evidence: { file: 'tests/.constructs/config-keys/report-custom.config', pattern: '^\\s*report "artifacts/custom"\\s*$', min: 1 },
    run: 'one-step.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'With `report "artifacts/custom"` the run writes `report.html`, `results.json`, `junit.xml` and '
      + '`.last-run.json` into that nested directory — created, not required to exist — and **`report/` '
      + 'is not written at all**. With the key removed and nothing else changed, the same four land in '
      + '`report/`. Both halves are needed: a key that moved `report.html` alone would satisfy any '
      + 'assertion that only looked for the file the CLI prints, and a key that copied rather than '
      + 'moved would leave a stale `report/results.json` that every other plant in this gate reads. '
      + '**The key had zero occurrences in this repository** before this plant — `report` is the '
      + 'default nobody ever had a reason to write down.',
    catches: 'a `report` key honoured by one writer and ignored by the other three, and a relocation that leaves the default directory populated.',
    blockedOn: null,
  },
  {
    id: 'C103',
    construct: 'config:key:log',
    family: 'config',
    tier: 'api',
    title: 'the two keys change what is *rendered* and neither changes what is *recorded*',
    target: 'one file with a `debug` and a `warn` call, under three configs',
    evidence: { file: 'tests/.constructs/config-keys/log-warn.config', pattern: '^\\s*log level warn\\s*$', min: 1 },
    run: 'logged.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Three configs, one fixture, and the invariant is the interesting half. `log level warn` keeps '
      + 'the `debug` line off the console and `log level debug` lets it through; `log destination '
      + 'console` keeps both lines out of `report.html` and `log destination html` puts both in and '
      + 'neither on the console. Under **all three**, `results.json` carries both lines identically — '
      + 'SPEC §3.8\'s *"never affects whether it is recorded"*, which is the claim a reader is most '
      + 'likely to get wrong and the one no ordinary run can observe, because a suite that greps its '
      + 'own console output would see a level filter as data loss. `env logConfig` and '
      + '`verify-logging.mjs` have exercised these keys since `M51`; what neither states is that '
      + 'filtering is a rendering decision.',
    catches: 'a `log level` that drops a step from `results.json` instead of from the console, and a `log destination` that reaches one renderer and not the other.',
    blockedOn: null,
  },
  {
    id: 'C104',
    construct: 'declaration:concurrency',
    family: 'declaration',
    tier: 'api',
    title: '`parallel` and `sequential` decide whether two tests are ever in the target at once',
    target: 'the same `/gate` rendezvous, one file, two tests, one word per header',
    evidence: { file: 'tests/.constructs/config-keys/pair-parallel.tflw', pattern: '^test ".*" parallel$', min: 2 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '**Not a config key, and it rosters here because one instrument answered both questions.** This '
      + 'entry sat on the ratchet on a stated condition — *"needs a server-side overlap watermark; '
      + 'rosters when apiV2 has one"* — and `D745` is why the endpoint is not in apiV2: a claim about '
      + 'tflw\'s own scheduling measured against a real target measures the target. Two `parallel` '
      + 'tests reach a watermark of **2** and are released as a pair; the same two marked `sequential` '
      + 'reach **1** and each waits out its deadline alone. Both files run under `workers 1`, so the '
      + 'file-concurrency axis is pinned and the header modifier is the only thing that moved — '
      + 'without that control the plant would be `C101` written twice.',
    catches: 'a `parallel` batch executed one test at a time, and a `sequential` marker that no longer serializes.',
    blockedOn: null,
  },
  {
    id: 'C105',
    construct: 'config:key:insecure',
    family: 'config',
    tier: 'security',
    title: 'the verification it disables is really happening, and the trade is never silent',
    target: 'the nginx sidecar\'s plain-TLS listener (`:8443`), whose certificate is signed by a CA the container invents at every start',
    evidence: { file: 'tests/.constructs/config-keys/tls-insecure.config', pattern: '^\\s*insecure true\\s*$', min: 1 },
    run: 'health.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'The same request, twice, one config line apart: with `insecure true` it is a 200 whose `server` '
      + 'header is nginx\'s, and without it the run fails naming the certificate. That second half is '
      + 'the one nothing here had: `env secureLocal` has carried the key since `M128a` and every run '
      + 'under it passes, so **the suite could not tell a key that disabled verification from a '
      + 'target whose certificate verified**. Two precision halves keep it from being a bare '
      + 'on/off: SPEC §3.5 promises the run *"carries a visible warning in the CLI summary and the '
      + 'report header — never a silent trade-off"*, so the banner must be present in the one leg and '
      + 'absent in the other; and `--forbid-insecure` must refuse the run **before any test executes**, '
      + 'which is a different thing from failing it.',
    catches: 'an `insecure` key that is parsed and never reaches the agent, a run that disables verification quietly, and a CI policy flag that fails a run instead of refusing it.',
    blockedOn: null,
  },
  {
    id: 'C106',
    construct: 'config:key:cert',
    family: 'config',
    tier: 'security',
    title: 'the client certificate is what gets past `ssl_verify_client on`',
    target: 'the nginx sidecar\'s mTLS listener (`:8444`) — the same `GET /health` under two configs',
    evidence: { file: 'tests/.constructs/config-keys/mtls-matched.config', pattern: '^\\s*cert "client\\.pem"\\s*$', min: 1 },
    run: 'health.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'With `cert`/`key` the request is a 200 through the listener; with both lines deleted and '
      + 'nothing else changed the same request is nginx\'s **400 `No required SSL certificate was '
      + 'sent`**. Both halves already run in this suite — `tests/api/identity/mtls.tflw` and '
      + '`tests/.env-specific/mtls-rejection.tflw` — and they run under two *different envs* in two '
      + 'different files, so what has never been stated is that the pair is a pair: this row runs one '
      + 'unchanged file and moves only the two config lines. The certificate is regenerated at every '
      + 'container start, which is why the grader copies it beside the config rather than referring '
      + 'to a path (`M104-01`/`D183`: `cert`/`key` resolve against the config\'s own directory).',
    catches: 'a `cert` key parsed and never presented, and an mTLS listener that stopped requiring one.',
    blockedOn: null,
  },
  {
    id: 'C107',
    construct: 'config:key:key',
    family: 'config',
    tier: 'security',
    title: 'the private key is loaded and paired with the certificate, not carried beside it',
    target: 'the same listener and the same file, with `key` pointing at a real key that belongs to somebody else',
    evidence: { file: 'tests/.constructs/config-keys/mtls-mismatched-key.config', pattern: '^\\s*key "server\\.key"\\s*$', min: 1 },
    run: 'health.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      '`key` is the hardest of the four to state on its own, because deleting it deletes `cert`\'s '
      + 'answer too — so it is moved rather than removed. `server.key` is a real, well-formed private '
      + 'key the same container generated, and it does not belong to `client.pem`. The run fails '
      + '**before any HTTP status exists**, which is the whole discrimination: `C106`\'s negative is a '
      + '400 the server chose to send, and this one never reaches a server, because the pair is '
      + 'refused where it is assembled. A `key` that were decorative — parsed, stored, never handed '
      + 'to the TLS context — would produce `C106`\'s 200 here.',
    catches: 'a `key` that is read and never paired with `cert`, and a mismatched pair accepted locally and refused as an authorization failure instead.',
    blockedOn: null,
  },
  {
    id: 'C108',
    construct: 'config:key:web',
    family: 'config',
    tier: 'ui',
    title: 'two files, two `web` bases, and each is at home under exactly one of them',
    target: 'webV2\'s SPA storefront (`:8090`) and its SSR admin console (`:8091`) — `open "/"` under each',
    evidence: { file: 'tests/.constructs/config-keys/web-admin.config', pattern: '^\\s*web "http://localhost:8091"\\s*$', min: 1 },
    run: 'open-admin.tflw',
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'A two-by-two grid rather than a pair, because one cell proves nothing: `open "/"` names a path, '
      + 'and the same path under two `web` bases reaches two genuinely different applications. '
      + '`.product-grid` exists only in the storefront and the heading `testFlow-tests admin console` '
      + 'only in the console, so the diagonal passes and the off-diagonal fails — a `web` key that '
      + 'were ignored in favour of one hard-coded base would light up a whole column instead. This is '
      + 'the key `env webv2Admin` exists for, and until now the only thing establishing that it worked '
      + 'was that the admin suite passed, which is equally consistent with both apps being served '
      + 'from one port.',
    catches: 'a `web` base ignored for a bare path, and an env switch that moves the `api` base without moving the browser\'s.',
    blockedOn: null,
  },

  // ===========================================================================
  // `M154g` step 5 — the four rows the ratchet's own conditions were hiding
  // (`D764`, `D765`, `D766`)
  // ===========================================================================
  //
  // These four did not become gradable in this step. They were gradable all along, and the ratchet
  // said otherwise in four sentences nobody had audited — which is what `D764` is: a stated
  // condition has to name a **requirement**, and a decision it cites has to actually state that
  // requirement. Three of the four cited `D380` for a cost claim `D380` does not make, and the
  // fourth cited a milestone (`M154d`) that had closed.
  //
  // `C109`-`C111` are graded by `verify-input-acceptance.mjs`, by reference and in both directions
  // (`D752`), exactly as `C51`-`C58` are graded by the Tier 1/2 script. `C112` is an ordinary plant
  // in the acceptance harness.
  {
    id: 'C109',
    construct: 'matcher:has-no-input-handling-violations',
    family: 'matcher',
    tier: 'security',
    title: 'the third state is instrumented, and the two reasons a rule stands down mean different things',
    target: "apiV2's `/vuln/*` input surface under two envs — `secureLocal` through the TLS sidecar and `plaintext` straight to the app, which grant different probe opt-ins",
    evidence: { file: 'tflw-acceptance/security/input.tflw', pattern: 'has no .*input handling violations', min: 4 },
    graders: ['input', 'coverage'],
    knownAnswer:
      'Seven ledger rows, each grading the full counts line — `[rules, applicable, notApplicable, ' +
      'violations]` — rather than the violation total, because the interesting Tier 3 failure moves ' +
      '`applicable`: an opt-in silently dropped from the config turns a firing rule into a ' +
      'not-applicable one and the violation count alone reads identically. Every rule in the pack is ' +
      'demonstrated **firing**, **silent** and **not applicable**, and the two not-applicable ' +
      'reasons are graded apart — *the operator did not grant this opt-in* against *probes were sent ' +
      'and none was answered* — because collapsing them loses the difference between a coverage gap ' +
      'and a finding. `TF067` is the runtime floor under all of it: an assertion with nothing to ' +
      'mutate is refused before a request leaves, and it is graded from stderr because there is no ' +
      'report to read.',
    catches: 'a rule that stops applying while its assertion stays green, an opt-in dropped from a config, and a stand-down reported without the reason that tells an operator which of the two things to do about it.',
    blockedOn: null,
  },
  {
    id: 'C110',
    construct: 'config:probe:oversized',
    family: 'config',
    tier: 'security',
    title: 'the same rule, the same corpus, and the only variable is whether the config grants the word',
    target: 'apiV2 `POST /vuln/notes` under both envs — `secureLocal` grants `probe oversized`, `plaintext` deliberately does not',
    evidence: { file: 'tflw-acceptance/security/tflw.config', pattern: '^\\s*probe oversized\\s*$', min: 1 },
    graders: ['input', 'coverage'],
    knownAnswer:
      'A granted/withheld pair on one rule, and the discrimination is that **nothing else moves**: ' +
      'granted, `sec/oversized-input-accepted` is applicable and fires twice on one body at two ' +
      'leaves; withheld, the identical assertion lists it as not applicable and names `probe ' +
      'oversized` as the missing word. The 64 KiB value is the whole probe class, so an opt-in that ' +
      'was read but ignored produces a green assertion over an unsent payload — which is the same ' +
      'observable as a correct withheld half, and is why the reason string is graded rather than the ' +
      'count.',
    catches: 'an opt-in honoured against a target that never granted it, and one accepted in the config and never sent — both of which leave the assertion green.',
    blockedOn: null,
  },
  {
    id: 'C111',
    construct: 'config:probe:traversal',
    family: 'config',
    tier: 'security',
    title: 'the grant is on the env the payload can actually reach, and that was measured rather than chosen',
    target: '`GET /vuln/files/{seg}` over `plaintext`, which grants `probe traversal` — the sidecar env withholds it because nginx normalises the payload away before the app sees it',
    evidence: { file: 'tflw-acceptance/security/tflw.config', pattern: '^\\s*probe traversal\\s*$', min: 1 },
    graders: ['input', 'coverage'],
    knownAnswer:
      'The same granted/withheld pair as `C110` and one thing more, which is the reason this row is ' +
      'not a duplicate of it: **where the grant lives was decided by a measurement**. Run through ' +
      'the sidecar, the traversal assertion reported the rule applicable, nine probes sent, nine ' +
      'answered and no violation — a rule that looks tested and is not, because nginx decodes and ' +
      'normalises the URI and returns `400` before the app is reached. The app is vulnerable and its ' +
      'deployment is not. So the grant sits on `plaintext`, where the rule fires (`V11`), and the ' +
      'sidecar env is the withheld half that names the missing word. Its silence is earned ' +
      'separately, on an identifier-shaped path segment that reads no files.',
    catches: 'a probe class granted where the deployment eats it, which is indistinguishable from a clean target — and a traversal rule that stands down without saying which of the two reasons applies.',
    blockedOn: null,
  },
  {
    id: 'C112',
    construct: 'matcher:was-made',
    family: 'matcher',
    tier: 'ui',
    title: 'a grid on one page load: the URL, the method, and whose request log is being read',
    target: "webV2's SPA storefront on `:8090` under `env local` — one `open \"/\"`, whose catalog page fetches `/v1/products` and nothing else this row names",
    evidence: { file: 'tests/.constructs/network-was-made.tflw', pattern: '^\\s*(?:expect|check) request to .* (?:not )?was made$', min: 6 },
    graders: ['acceptance', 'coverage'],
    knownAnswer:
      'Four known answers off one page load, arranged so that no single wrong implementation can ' +
      'satisfy them: the URL the page fetched **was** made, the same URL under a method it never ' +
      'used was **not**, a URL it never touched was **not**, and the `/health` request **tflw ' +
      'itself** sent was **not** — that last one is what says the observation set is the browser\'s ' +
      'network log rather than the runner\'s. The two `check` rows at the end are the same ' +
      'assertions with the negation dropped: they must fail, in this same run, so the wrong answers ' +
      'are demonstrated reachable rather than assumed to be.',
    catches: 'a `was made` that answers `true` for anything observed, one that ignores the `with method` clause, and one that counts the runner\'s own requests as the page\'s.',
    blockedOn: null,
  },
  // --- the `M154g-07` fix batch: the ratchet's last entry, and the only one tflw cleared ---------
  //
  // This row exists because a *stated condition* was met by the repository the condition named.
  // `generator:unique-like` sat on `RATCHET` from step 3 saying it would roster *when tflw's
  // `unique like` embeds the counter, or when the manifest stops promising it does*, and tflw did
  // the first. It reads beside `C81`-`C91` and shares their plant and their four runs, because its
  // claim is not about a value at all — it is about **which half of the generator family this
  // construct belongs to**, and that question only exists relative to the other eleven.
  {
    id: 'C113',
    construct: 'generator:unique-like',
    family: 'generator',
    tier: 'api',
    title: '`unique like` renders the counter, not a draw — it is in the `unique` half of the family and not the `random` half',
    target: 'tests/.constructs/generator-known-answers.tflw, against `POST /v1/lifecycle/mark` and `/attempt`',
    evidence: { file: 'tests/.constructs/generator-known-answers.tflw', pattern: '^  let a = unique like "ORD-######"$', min: 1 },
    graders: ['acceptance'],
    knownAnswer:
      'Three claims, and the shape one is the weakest of them. `#` fills with digits and the three ' +
      'draws are distinct — but a sample of three cannot tell a guarantee from a high probability, ' +
      'and for a year this construct passed exactly that assertion while having no guarantee at ' +
      'all. So the row is graded on the two things a sample cannot fake. First, the value is ' +
      '**identical under both seeds and both run clocks**, which places it with `C81`-`C84` and ' +
      'against `C89`: `random like` shares this construct\'s entire pattern language and moves with ' +
      'the seed, so *seed-independence is the only thing that tells the two constructs apart*, and ' +
      'nothing here or in tflw asserted it. It is also the claim that discriminates, measured: this ' +
      'row scored **3/4 against the pre-fix build and 4/4 after**, and seed-independence is the one ' +
      'that moved. Second, `SPEC` §7.2\'s **bolded** retry clause — a retried attempt cannot ' +
      'reproduce a value an earlier attempt used — is read off the same `retry 2` test that grades ' +
      '`C81` and `C88`: three distinct values, marked once each, where `random string` beside them ' +
      'is one value marked three times. **That mark was written at step 3 and read for the first ' +
      'time here, and reading it corrected the record.** `M154g-07` twice asserted the clause was ' +
      '*false* for this construct and it never was: the old build keyed its RNG on the shared ' +
      'counter, which advances across a retried test\'s attempts, so the three values already ' +
      'differed. The claim was inferred from a mechanism theory that was itself wrong, while the ' +
      'instrument that would have settled it sat unread in this file.',
    catches: 'a `unique like` whose distinctness went back to being probabilistic (it would move under a second seed, since the only way to draw is to consult the RNG), one that replays a value across a retried test\'s attempts, and one that silently wrapped its pattern instead of refusing to overflow it.',
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
  // --- declaration (0) ---
  // The family `M154a` missed and `M154c`/`D742` added: twelve constructs, of which `after` and
  // `retry` were rostered above, `crawl` left at `M154f` (`C56`), the four that decide **which
  // tests exist** left at `M154g` step 2c (`C73`-`C76`), and the four about **scope and identity**
  // left at step 2d — an action's own response scope (`C77`, `FU-12`), a JS helper's exports
  // becoming callable together with the `TF037` undecidability one `use` line buys (`C78`), bare
  // `before` against `before file` in both cardinality and scope (`C79`), and `as` (`C80`), which
  // needed no fixture at all because the discriminating pair was already running in
  // `tests/examples/sessions-explained.tflw`.
  //
  // Five of the original twelve are `test`-header clauses rather than top-level words, and three of
  // those five (`tags`, `with-each`, `concurrency`) are manifest ids for constructs the language
  // spells differently — `@…`, `with each`, and `parallel`/`sequential`. Read them as ids, never as
  // keywords (`M154a`, `spec-data.ts`).
  //
  // **`declaration:concurrency` left at `M154g` step 4b (`C104`), and its stated condition was met
  // by a different endpoint than the one it named.** The condition read *"needs a server-side
  // overlap watermark — an endpoint that holds a request open and reports the high-water mark of
  // simultaneous holders — which is real target surface, not a roster row. Rosters when apiV2 has
  // one."* The watermark was the right requirement and apiV2 was the wrong address: `D745` had
  // already decided that a claim about tflw's own *scheduling* is measured against a zero-latency
  // target, because a real one makes the database the instrument. `arrival-server.mjs` grew the
  // rendezvous instead, and the same endpoint rostered `config:key:workers` (`C101`) — which is
  // what the condition should have said, since the two constructs were always waiting on one thing.
  // --- step (0) ---
  // Empty as of `M154g` step 2b. The last six were the workhorses `D739` is about — `api` with 1139
  // occurrences behind it, `expect` with 1692 — and they are the clearest case the distinction was
  // written for: a `RATCHET` entry says *no row states their known answer*, never *never exercised*.
  // The evidence was everywhere and the claim was nowhere, because every one of those uses points
  // the construct at something else. `C67`-`C72` state the four things `tflw spec --json` says about
  // them that an ordinary test cannot observe: that one `api` step is one request, that `expect`
  // ends the test where `check` does not, that `capture` binds a value rather than a reference, and
  // that `wait` re-issues and then stops.
  //
  // Before that, `M154e` took `ramp`, `hold`, `step`, `spike`, `threshold` and `cleanup` — the perf
  // tier — plus `pause`, the one construct `M154d` handed BACK. It had been filed here as a browser
  // step needing an observable, and it is not one: `TF033` says "`pause` is only legal inside a
  // workload-bearing `test`", so it is `M67`'s per-iteration pacing and its known answer is an
  // inter-arrival gap.
  // --- matcher (0) ---
  // Eight of the nine left at `M154g` step 2 (`C60`-`C66`), on one plant whose every assertion is a
  // *pair*: `tests/.constructs/matcher-discrimination.tflw`. Tier 1 and Tier 2 left at `M154f`
  // (`C57`, `C58`).
  //
  // **The last two left at `M154g` step 5, and neither of their conditions survived being audited
  // rather than read (`D764`).**
  //
  // `matcher:was-made`'s said *"a browser-network assertion … it rosters with the UI work, not
  // here"*. "The UI work" was `M154d`, which closed — so the sentence was an **address**, and it
  // never named a requirement at all. The requirement it meant is a browser fixture with observable
  // network traffic, and both halves already existed: `02-checkout-iframe-network.tflw` runs one,
  // and step 4b's `C108` had already driven and graded a browser tier from this harness. `C112`.
  //
  // `matcher:has-no-input-handling-violations`'s said Tier 3's grader runs in **no automated pass**
  // *"because a Tier 3 assertion costs an order of magnitude more requests than a Tier 2 one
  // (`D380`)"*. `D380` does not say that, and the cost is the other way round: 0.91-1.05 s against
  // `security-acceptance-gate`'s 1.70-1.99 s, measured live. `D765` puts the grader in `regression.mjs`
  // as the `input-acceptance` phase, which is `M137e-01`'s remedy (`D493`) for the third time rather
  // than a new mechanism. `C109`.
  // --- generator (0) ---
  // Eleven of the twelve left at `M154g` step 3 (`C81`-`C91`), on one plant and four runs of it.
  // The family was scoped as this milestone's expensive end and it was, but not for the predicted
  // reason: the cost was not building an observable, it was that **every claim here is about a
  // relationship between values** — distinct from each other, identical across a seed, moving with
  // a clock — and a `.tflw` file holds one run and cannot do arithmetic. The observable was the
  // grader running the same plant four times.
  //
  // **The twelfth, `generator:unique-like`, left in the `M154g-07` fix batch (`C113`), and it is
  // the only entry in this list's history that left because the *language* changed rather than
  // because this repository finally wrote down what it already had.** It sat here on a stated
  // condition — *rosters when tflw's `unique like` embeds the counter, or when the manifest stops
  // promising it does* — and the condition was met by the first of those. `D739`'s distinction is
  // at its sharpest in the pair: the construct was exercised the whole time, and every exercise of
  // it passed against an implementation with no guarantee behind it.
  // --- locator (0) ---
  // The first family to empty, at `M154d`'s locator harness. The header stays so the seven
  // families read in manifest order and an emptied one is visibly empty rather than absent.
  // --- config (0) ---
  // Five left at `M154f`: `authorized` (`C53`), `evidence` (`C54`), `redact` (`C55`), `probe
  // mutating` (`C52`) and `probe ciphers` (`C51`). **`probe oversized` and `probe traversal` left at
  // `M154g` step 5 (`C110`, `C111`)**, together with the Tier 3 matcher above and on the same
  // finding: all three had been held back by the same unaudited sentence about `D380`, and the
  // condition it stated was not one `D380` makes. They roster together, as they always said they
  // would — just not on the condition that was written down.
  //
  // The five **directives** left at `M154g` step 4a (`C92`-`C96`), and they are the first rows in
  // this ledger whose witness is a config rather than a test. A `.tflw` file cannot observe which
  // `env` was selected or whether a `defaults` block was shared, so the plant is inverted — the
  // fixture is held fixed and the *config beside it* is the operand that varies. Every one of them
  // grades with no stack at all, which is why the config family was split with these first.
  //
  // **Seven of the eleven **keys** left at `M154g` step 4b (`C97`-`C103`), and the split inside the
  // family was not the one step 4a predicted.** That handoff said every key needs a running target;
  // seven of them need no stack, because what a config key claims is a property of *the request
  // tflw was about to make*, and `arrival-server.mjs` is where that is readable — paths, per-arrival
  // headers, a rendezvous watermark, and, for `allow hosts`, the absence of an arrival at all. Two
  // of the seven (`report`, `workers`) had **zero occurrences anywhere in this repository** and
  // `header` had one, so these are the rare `RATCHET` rows where the entry did mean *unexercised*
  // and not only `D739`'s *unrostered*.
  //
  // **The other four went in the same step (`C105`-`C108`) and they are a different kind of work**:
  // `insecure`, `cert` and `key` are claims about a TLS handshake and `web` is a claim about which
  // application a browser reached, so all four need a real target and none of them can be graded on
  // a wire. Every one of them had a *positive* already running in this suite and no negative:
  // `env secureLocal` passes whether or not `insecure` does anything, and the admin suite passing
  // is equally consistent with both webV2 apps being served from one port. That is `D739`'s
  // distinction at its sharpest — the evidence was there, and it could not have caught the defect.
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

 * **`M154g` step 2d took the last four `declaration` rows that had an observable, 37 -> 33**, and
 * the family is down to a single entry. Three of the four needed a fixture and one did not: `as`
 * (`C80`) is graded off `tests/examples/sessions-explained.tflw`, which has been running the
 * discriminating pair — the same `GET /orders/all` at 200 under `as admin` and 401 with no clause
 * — since long before this milestone existed. That is `D722` in one row: the construct was present,
 * exercised and *already discriminating*, and it sat on the ratchet anyway because nothing had
 * written down what the pair proved. A ratchet entry is a missing sentence at least as often as it
 * is missing coverage.
 *
 * Two of the four are also the first rows in this tier graded by `tflw check` rather than by a run.
 * `C78`'s second half and `C79`'s fourth claim are both **negatives about the checker** — one `use`
 * makes `TF037` undecidable, and a `before file` binding is unreadable from a test — and neither
 * can be observed by executing anything, because the files that would state them do not compile.
 * Each therefore ships with a control whose diff is one line, since "the diagnostic stayed quiet"
 * is otherwise satisfied by a checker that never emits it at all.
 * * `RATCHET.length` must not exceed this (`D740`). Lower it as milestones roster constructs; raising
 * it is the edit this pin exists to make loud.
 *
 * **`5` -> `1` at `M154g` step 5, and this is the drop that says the least about coverage and the
 * most about the pin itself.** Acceptance clause 5 asked whether five conditioned entries were the
 * floor. Taking that as a judgement meant *auditing* the five rather than reading them, and four did
 * not survive: three cited `D380` for a cost claim it does not make, and one cited a milestone that
 * had closed. Nothing about the language changed and no new capability was built — what changed is
 * that four sentences were checked for the first time since they were written. `D764` is the rule
 * that came out of it: **a condition is audited against the decision it cites, never read as
 * provenance**, because a `D`-number in a sentence reads as already-checked and for two milestones
 * that is exactly what it bought.
 *
 * **`1` -> `0` in the `M154g-07` fix batch, and the ratchet is empty.** Step 5 called the last entry
 * a real floor and it was one — its condition named a requirement, cited a defect that reproduced,
 * and was blocked on a repository this milestone does not own. What cleared it is the thing a
 * stated condition is *for*: tflw's `unique like` now embeds the counter, so the condition was met
 * by the sibling and the row followed (`C113`). No entry here was ever waived, re-worded or aged
 * out. That is the whole case for `D730`/`D740`'s shape — an entry whose exit is a sentence someone
 * else can satisfy is a debt with an address, and the four that left at step 5 for a bad citation
 * are the counter-example that made `D764` necessary.
 *
 * An empty ratchet is not a finished one. `RATCHET_CEILING` at `0` means the next construct that
 * cannot be rostered has to *raise* it, which is exactly the edit this pin exists to make loud.
 *
 * **`41` -> `37` at `M154g` step 2c: the four declarations that decide which tests exist.** `test`,
 * `import`, `with each` and `@tag` answer, before a step runs, *which tests are there and which of
 * them execute* — and each is a case where the suite's own shape hides the effect. Every existing
 * `import` proves an action arrived and none proves the manifest's actual claim, which is the
 * negative: the imported file's tests never run. Every ordinary run of this suite is unfiltered, so
 * a `@tag` that selected nothing would leave all of it green. `with each` is used widely and the
 * wrong implementation it is aimed at is not a broken one — rows run in a loop inside one reported
 * test pass every existing assertion and differ only in the summary. And `test` is graded on the
 * meant-to-fail plant on purpose, because in a green file "the next test still ran" claims nothing.
 *
 * The five declarations left are about **scope and identity** rather than selection. `action`,
 * `use`, `before` and `as` all have observables and are step 2d. `declaration:concurrency` does
 * not, and stays on a stated condition: `parallel` against `sequential` is a claim about two tests
 * overlapping *in time*, and the arrival counter these plants lean on counts arrivals rather than
 * their concurrency, so both settings leave it identical. It needs a server-side overlap watermark
 * in apiV2 — real target surface, not a roster row.
 *
 * **`47` -> `41` at `M154g` step 2b, and the `step` family is now empty.** The six workhorses are
 * `D739`'s cheap end at its most extreme — 1139 occurrences behind `api`, 1692 behind `expect`, 523
 * behind `capture`, and no evidence at all for any of the three, because every one of those uses
 * points the construct at something else. A test that creates a product and asserts its price says
 * nothing that would change if `api` fired the request twice. Two fixtures state what an ordinary
 * test structurally cannot: `step-workhorses.tflw` reads a server-side arrival counter, so *one
 * step, one request* becomes a number, and `hard-stop-semantics.tflw` is meant to fail, so
 * `expect`'s "immediately" becomes a marked label that must be **absent**. That last one is the
 * pair to `C1` — `check` records and continues, `expect` stops, and until now nothing here could
 * tell the two constructs apart.
 *
 * **`54` -> `47` at `M154g` step 2, and this one is the opposite kind of drop: seven rows, one new
 * fixture, and every assertion in it a *pair*.** The seven matchers had 1581 + 50 + 31 + 44 + 14 +
 * 43 + 62 uses between them and not one of those uses could tell a working matcher from a broken
 * one, because every one of them is positive. `tests/.constructs/matcher-discrimination.tflw` adds
 * twelve `not` lines against `C1`'s frozen payload, each aimed at a *plausible* wrong
 * implementation rather than at a broken one — prefix comparison, substring-over-stringified-array,
 * `String.includes` for a regex, subset-as-equality, a schema matcher that validates nothing,
 * `>=` for `>`, `length >= N` for a count. All twelve were then run with the `not` dropped, and all
 * twelve went red. That control is what makes the row an assertion rather than a hope, and it is
 * cheap enough that step 3 and step 4 should both do it.
 *
 * **`120` -> `54` at `M154g` step 1, and it is the largest single drop this pin will ever see.**
 * Sixty-six of the hundred and twenty were the diagnostic family, and not one of them gained an
 * assertion: `verify-check-diagnostics.mjs` had been proving every one of them against a real `tflw
 * check` since `M49`, and against a list read out of tflw's own manifest since the drift closure
 * of 2026-08-04, which found three assigned codes with no fixture at all. What was
 * missing was the *claim*, which is `D739`'s cheap end taken to its limit — and `D751` says the
 * claim is a citation rather than sixty-six restatements of somebody else's enforced completeness.
 *
 * The number to read this against is not the drop, it is what is left: **37** as of step 2c, and
 * they are the expensive end. Twelve generators that need an observable built before presence proves
 * anything, eighteen config constructs, five declarations, and two matchers. Seven of the nine
 * matchers went in step 2, all six steps in step 2b and four of the nine declarations in step 2c;
 * what remains in those three families is there for stated reasons, not for lack of a turn.
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
 * roster three rows less true. **Still true as written, and step 5 took them anyway** — by making
 * something run it (`D765`) rather than by lowering the bar. What did not survive is the *cost*
 * reason attached to that hold; see the ceiling's own note below.
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
export const RATCHET_CEILING = 0;

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
