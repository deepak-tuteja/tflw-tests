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
  // --- step (34) ---
  'step:api', 'step:wait', 'step:expect', 'step:let', 'step:capture', 'step:log', 'step:give', 'step:open',
  'step:click', 'step:double', 'step:right', 'step:fill', 'step:select', 'step:tick', 'step:untick',
  'step:press', 'step:hover', 'step:scroll', 'step:within', 'step:dismiss', 'step:switch', 'step:close',
  'step:download', 'step:drag', 'step:drop', 'step:screenshot', 'step:stub', 'step:pause', 'step:ramp',
  'step:hold', 'step:step', 'step:spike', 'step:threshold', 'step:cleanup',
  // --- matcher (18) ---
  'matcher:equals', 'matcher:contains', 'matcher:matches-regex', 'matcher:matches-subset',
  'matcher:matches-schema', 'matcher:matches-file', 'matcher:greater-less-than', 'matcher:has-count',
  'matcher:has-value', 'matcher:state-word', 'matcher:connects', 'matcher:fails', 'matcher:was-made',
  'matcher:has-no-a11y-violations', 'matcher:has-no-security-violations',
  'matcher:has-no-authorization-violations', 'matcher:has-no-input-handling-violations',
  'matcher:matches-snapshot',
  // --- generator (15) ---
  'generator:unique-prefix', 'generator:unique-email', 'generator:unique-number', 'generator:unique-like',
  'generator:unique-uuid', 'generator:random-number', 'generator:random-date', 'generator:random-of',
  'generator:random-string', 'generator:random-like', 'generator:random-uuid', 'generator:random-password',
  'generator:transform-base64', 'generator:transform-hex', 'generator:transform-url',
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
 * `163` is the whole manifest minus this milestone's three plants — the honest starting state, and
 * `M154f`'s acceptance clause 5 is that it reaches 0.
 */
export const RATCHET_CEILING = 163;

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
