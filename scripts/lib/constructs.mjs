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
];

export const PLANT_IDS = PLANTS.map((p) => p.id);
export const COVERED_CONSTRUCTS = PLANTS.map((p) => p.construct);
export const plantsFor = (grader) => PLANTS.filter((p) => p.graders.includes(grader));
export const plantFor = (construct) => PLANTS.find((p) => p.construct === construct) ?? null;

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
  'declaration:test', 'declaration:crawl', 'declaration:action', 'declaration:import',
  'declaration:use', 'declaration:before', 'declaration:tags', 'declaration:with-each',
  'declaration:as', 'declaration:concurrency',
  // --- step (33) ---
  'step:api', 'step:wait', 'step:expect', 'step:let', 'step:capture', 'step:log', 'step:open',
  'step:click', 'step:double', 'step:right', 'step:fill', 'step:select', 'step:tick', 'step:untick',
  'step:press', 'step:hover', 'step:scroll', 'step:within', 'step:dismiss', 'step:switch', 'step:close',
  'step:download', 'step:drag', 'step:drop', 'step:screenshot', 'step:stub', 'step:pause', 'step:ramp',
  'step:hold', 'step:step', 'step:spike', 'step:threshold', 'step:cleanup',
  // --- matcher (15) ---
  'matcher:equals', 'matcher:contains', 'matcher:matches-regex', 'matcher:matches-subset',
  'matcher:matches-schema', 'matcher:greater-less-than', 'matcher:has-count',
  'matcher:has-value', 'matcher:state-word', 'matcher:was-made',
  'matcher:has-no-a11y-violations', 'matcher:has-no-security-violations',
  'matcher:has-no-authorization-violations', 'matcher:has-no-input-handling-violations',
  'matcher:matches-snapshot',
  // --- generator (12) ---
  'generator:unique-prefix', 'generator:unique-email', 'generator:unique-number', 'generator:unique-like',
  'generator:unique-uuid', 'generator:random-number', 'generator:random-date', 'generator:random-of',
  'generator:random-string', 'generator:random-like', 'generator:random-uuid', 'generator:random-password',
  // --- locator (6) ---
  'locator:button', 'locator:field', 'locator:text', 'locator:list', 'locator:css', 'locator:xpath',
  // --- config (24) ---
  'config:directive:defaults', 'config:directive:env', 'config:directive:session',
  'config:directive:require', 'config:directive:exclude', 'config:key:header', 'config:key:timeout',
  'config:key:workers', 'config:key:report', 'config:key:web', 'config:key:api', 'config:key:insecure',
  'config:key:cert', 'config:key:key', 'config:key:allow', 'config:key:authorized', 'config:key:evidence',
  'config:key:redact', 'config:key:viewport', 'config:key:log', 'config:probe:mutating',
  'config:probe:oversized', 'config:probe:traversal', 'config:probe:ciphers',
  // --- diagnostic (66) ---
  'diagnostic:TF001', 'diagnostic:TF002', 'diagnostic:TF003', 'diagnostic:TF010', 'diagnostic:TF011',
  'diagnostic:TF012', 'diagnostic:TF013', 'diagnostic:TF014', 'diagnostic:TF015', 'diagnostic:TF016',
  'diagnostic:TF020', 'diagnostic:TF021', 'diagnostic:TF022', 'diagnostic:TF023', 'diagnostic:TF024',
  'diagnostic:TF025', 'diagnostic:TF026', 'diagnostic:TF027', 'diagnostic:TF028', 'diagnostic:TF029',
  'diagnostic:TF030', 'diagnostic:TF031', 'diagnostic:TF032', 'diagnostic:TF033', 'diagnostic:TF034',
  'diagnostic:TF035', 'diagnostic:TF036', 'diagnostic:TF037', 'diagnostic:TF038', 'diagnostic:TF039',
  'diagnostic:TF040', 'diagnostic:TF041', 'diagnostic:TF042', 'diagnostic:TF043', 'diagnostic:TF044',
  'diagnostic:TF045', 'diagnostic:TF046', 'diagnostic:TF047', 'diagnostic:TF048', 'diagnostic:TF049',
  'diagnostic:TF050', 'diagnostic:TF051', 'diagnostic:TF052', 'diagnostic:TF053', 'diagnostic:TF054',
  'diagnostic:TF055', 'diagnostic:TF056', 'diagnostic:TF057', 'diagnostic:TF058', 'diagnostic:TF059',
  'diagnostic:TF060', 'diagnostic:TF061', 'diagnostic:TF062', 'diagnostic:TF063', 'diagnostic:TF064',
  'diagnostic:TF065', 'diagnostic:TF066', 'diagnostic:TF067', 'diagnostic:TF068', 'diagnostic:TF070',
  'diagnostic:TF071', 'diagnostic:TF072', 'diagnostic:TF073', 'diagnostic:TF074', 'diagnostic:TF075',
  'diagnostic:TF076',
];

/**
 * `RATCHET.length` must not exceed this (`D740`). Lower it as milestones roster constructs; raising
 * it is the edit this pin exists to make loud.
 *
 * `166` is the whole manifest (178 constructs since `M154c`/`D742` added the `declaration` family)
 * minus the twelve plants rostered so far, and `M154f`'s acceptance clause 5 is that it reaches 0.
 *
 * It went **up** from `M154b`'s `163`, and that is the one direction this pin exists to make loud —
 * so it is worth saying plainly why it is not a regression. Twelve constructs arrived at once when
 * `tflw spec --json` grew the family it had been missing, and nine were rostered in the same
 * milestone; the arithmetic is `163 + 12 - 9`. Coverage went from 3/166 to 12/178. What the ratchet
 * measures is the unrostered remainder, and a remainder can only be honest about a denominator that
 * has itself just been corrected upwards.
 */
export const RATCHET_CEILING = 166;

/**
 * `CONSTRUCTS.md` carries one row per plant and prose a human reads; this asserts their id sets
 * agree. The same one machine-checked invariant `VULNS.md` gained in `M139`, and for the same
 * reason (`D489`): parsing prose to build the oracle would let a typo in a markdown table retune
 * what the graders expect, so the markdown gets checked *against* the data rather than read as it.
 *
 * @param {string} markdown the contents of `CONSTRUCTS.md`
 * @param {(msg: string) => void} fail
 */
export function assertLedgerIds(markdown, fail) {
  const documented = new Set([...markdown.matchAll(/^\|\s*`(C\d+)`\s*\|/gm)].map((m) => m[1]));
  for (const id of PLANT_IDS) {
    if (!documented.has(id)) fail(`${id} is a plant in scripts/lib/constructs.mjs with no row in CONSTRUCTS.md`);
  }
  for (const id of documented) {
    if (!PLANT_IDS.includes(id)) fail(`CONSTRUCTS.md has a row for ${id}, which is not a plant in scripts/lib/constructs.mjs`);
  }
}
