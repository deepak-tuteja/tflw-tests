# Contributing to testFlow-tests

<sub>**Notation.** `P#n`, `D<n>` and `M<n>` name blocks in design records neither repository
publishes; each resolves in tflw's [DECISIONS.md](https://github.com/deepak-tuteja/tflw/blob/main/DECISIONS.md), which lifts the block verbatim.
**Both repositories number their milestones from 1**, so an unqualified `M<n>` here is tflw's —
this repository's own are written `testFlow-tests M22`, and are published nowhere.</sub>

This repository is not a library — it is **tflw's target**. A realistic e-commerce API (NestJS +
Postgres), two browser front-ends, an mTLS sidecar, a deliberately vulnerable slice, and the
`.tflw` suites that exercise all of it. Everything here exists so that a change to
[tflw](https://github.com/deepak-tuteja/tflw) has something real to fail against.

That shapes the gates: they are slower than a library's, they need Docker and a `.env`, and one of
them is not about this repo at all.

**This file is not a summary.** The gate list below is held to `.github/workflows/` by
`scripts/verify-contributing.mjs`, which runs in CI as a step of the `acceptance-check` job. Every
gate's command string is compared **exactly**, in both directions: a gate missing here turns the
build red, and a command presented here as a gate that CI does not run turns it red too. Edit the
list and the classification table in that script in the same commit, or one of the two will refuse.

The guard exists because the gate set used to live in five incomplete places — this repo's
`README.md` twice, tflw's `README.md`, the ledger row filed about the problem, and the plan written
to close that row. The row omitted a gate. The plan, five days later, omitted a *different* one:
`verify:external-targets`, which had landed in this file's own CI job in the meantime.

---

## Setup

The gates below assume the stack is up. See [README's Setup section](README.md#setup) for the full
sequence — briefly:

```sh
cp .env.example .env      # dev-safe defaults; the same values docker-compose.yml falls back to
node cli.mjs start        # postgres + api :4001 + TLS sidecar + webV2 :8090 + inventory-service
npm run refresh-tflw      # packs ../testFlow/packages/cli and installs the tarball
npx playwright install --with-deps chromium
```

**`--with-deps` here and not in CI, deliberately.** It runs `apt-get install`, and your machine may
genuinely be missing a shared library an engine needs; you pay that once, on one machine. CI dropped
it in `M143c` because it pays it on every job of every run against a mirror that is sometimes very
slow — on run 32270050039 two legs sat in that step for over three hours while their siblings, same
step and same run, finished in eleven and fourteen minutes. `ubuntu-latest` already ships
Playwright's real dependency closure; the same reasoning and the full measurement live in tflw's
`ci.yml` beside its own copy of the step (`M143a`).

`refresh-tflw` is also this repo's own dependency install — there is nothing else in
`package.json`. It packs tflw from **your local checkout**, and CI packs it from tflw's live
`main`, unpinned on purpose: pinning would kill the dogfooding exactly when it matters.

`node cli.mjs stop` tears the stack down with `-v`, dropping both databases. That is deliberate —
per-run isolation — so do not keep state you care about in them.

## The gates

CI is the gate. The two tiers below are how you avoid finding out from CI — a tier is a schedule,
not a subset of the truth.

<!-- gates:begin -->

### Triage — seconds, no Docker, run constantly

```sh
npm run check:acceptance
npm run verify:external-targets
npm run verify:perf-parity
npm run verify:perf-baseline
npm run verify:contributing
npm run verify:sweep-size
npm run verify:tflw-resolution
npm run verify:provenance
npm run verify:provenance:self-test
npm run verify:construct-coverage
npm run verify:redaction:self-test
npm run read:mutation-matrix:gate
npm run verify:argv-contract
```

**And when you add, rename or renumber a milestone or decision** in a `PLAN_*.md` or
`PROGRESS.md` — this repository's records are `.gitignore`d, so this is the only machine that can
tell whether the manifest still matches them. It says what to run when it fails:

```sh
npm run verify:own-identifiers
```

**And when a tflw milestone assigns or changes a `TF0xx` diagnostic code**, before opening either
PR:

```sh
npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs
```

### Before pushing — the whole set

```sh
npm --prefix apiV2 run lint
xvfb-run -a npm run regression
```

CI deals the sweep into four duration-packed groups and runs them as parallel legs. Locally you can
do the same, which is also how you re-run just the leg that failed:

```sh
xvfb-run -a npm run regression -- --group core
xvfb-run -a npm run regression -- --group tooling
xvfb-run -a npm run regression -- --group safety
xvfb-run -a npm run regression -- --group security-ui
```

<!-- gates:end -->

**What each one is for:**

- **`npm run check:acceptance`** — every corpus under `tflw-acceptance/` still parses against
  current tflw. That tree is excluded from bare discovery on purpose, and before this gate existed
  nothing checked it either: two checker tightenings silently un-parsed 10 of 12 files across four
  milestones, with nothing red anywhere.
- **`npm run verify:external-targets`** — the one host this repo does not own stays fenced
  (functional API tests only: no load runs, no security scans, not on CI and not on any repeated
  schedule), and **a new external target anywhere in the repo fails until somebody writes down what
  it is for.** All three fences held before this existed, by omission rather than by design.
- **`npm run verify:perf-parity`** — the perf ladder's three runners agree on the fixture values
  they share, every rung file is rostered in `scripts/lib/perf-ladder.mjs`, and **every host a load
  generator points at is one of ours.** That last one was asserted by nothing before this gate: the
  step above discovers corpora by walking for a `tflw.config`, so `perf/k6/`'s JavaScript and
  `perf/artillery/`'s YAML are not overlooked but ineligible. The fixture half exists because the
  shared product id has drifted twice with a comment in each file saying it must not — 98% k6
  failure at `M48`, and on 2026-08-05 a 100% error rate reported as PASS. `D744` records why the
  three copies stay literal and are *checked* against the constant rather than resolved from it at
  run time: the rung they sit in exists to measure a POST with zero capture or interpolation
  overhead, so importing the id would change what it measures, by a different amount in each of the
  three runners.
- **`npm run verify:perf-baseline`** — the static half of the perf regression gate. Every rung with
  a co-runner has a row in `tflw-acceptance/perf/baseline.json`, no row names a rung that does not
  exist, and no band spans more than 3x. The *comparison* runs on `fedora-box`, because a ratio
  needs a measurement; what is checked here is the document. **It is no longer a scheduled run.**
  `D733` put the measurement on a nightly timer, and that timer is disarmed (`D754`) — the box was
  asleep or powered off at 04:30 on all three nights measured, so the job would have fired 0 of 3
  times, and `Persistent=false` meant each miss was skipped in silence. The measurement now rides
  the sweep as its `perf-ladder` phase (`D758`), and can still be run alone with
  `npm run perf:conformance`. `D750` records why the bands are ratios of tflw to its co-runner **in the same run**
  rather than absolute numbers — absolutes on that box move with thermal state, the 2.4 GHz link and
  whoever else holds the lease, so a gate on them is a flake generator until it is widened into
  vacuity. Until the ladder is next run in anger the bands are `null` and the gate says so out loud;
  the rule with teeth from day one is the error-rate ceiling, which needs no calibration and is the
  bound whose absence let a rung report PASS at a 100% error rate on 2026-08-05.
- **`npm run verify:contributing`** — this document against `.github/workflows/`. It is in the set
  it guards, which is the point rather than an oversight.
- **`npm run verify:tflw-resolution`** — **which tflw a script is grading is declared, printed, and
  asked in exactly one place.** Before `M141` this repo held seven answers to that one question: three
  environment variable names, three defaults, and nowhere that printed which had won, so the same
  command could grade the vendored 0.1.0 or your branch build and the log looked identical
  (`M115-03`, `M128-04`). Every script now calls `resolveTflw('released')` or `resolveTflw('branch')`
  — the question is an argument, not an inference — and the resolver announces the entry path and a
  sha prefix on every call. The gate has two halves: the resolver's own refusals (asking for the
  branch build and being handed the vendored one is an error, not a shrug), and a sweep of
  `scripts/` proving nothing resolves a tflw any other way. **Its allow-list is the honest part** —
  the files that legitimately do are named there, each with a reason.
- **`npm run verify:provenance:self-test`** — **the gate above reads two different corpora, and
  this is what says the difference is deliberate.** `testFlow-tests M169d1` split it: resolution widened to every
  tracked non-prose file, while the escaping-link and `**Notation.**` rules stayed on the 14
  markdown files, because a `.ts` file cannot carry a declaration paragraph and 394 of them cite
  something — widening rule 2 with the rest would redden 394 files with no repair that is not
  absurd. A split like that is indistinguishable from an accident unless something states what
  breaks if the two are merged, so this measures that 394 rather than asserting it in a comment
  that can go stale, checks the two corpora are disjoint and non-empty, and checks that **every
  exclusion excludes something in this tree** — a rule matching nothing is a rule nobody has
  tested, and it will be wrong on the day it first matches. It also holds the declared-unresolvable
  list honest from both ends: an entry that stops being cited is stale, and an entry that starts
  resolving in tflw's index is a declared non-existence that quietly became a lie. Milliseconds, no
  sibling checkout needed.

- **`npm run verify:own-identifiers`** — **what this repository defines for itself, written down
  so the other repository's index cannot answer for it.** tflw pins what this repository *cites*
  and nothing recorded what it *defines*, and that asymmetry is where the two sequences collide in
  silence: 69 identifiers are anchored in both record sets and **63 are already published by
  tflw**, so a bare `testFlow-tests M22` in `docker-compose.yml` resolves to tflw's coverage audit
  instead of this repository's nginx mTLS sidecar — a real entry about the wrong thing, delivered
  green. `scripts/own-identifiers.json` is generated from this repository's records by
  `npm run refresh:own-identifiers` and committed; this checks it is current. It is **absent from
  CI on purpose**: the records are `.gitignore`d, so only your machine can tell whether the
  manifest still matches them. Run it after adding or renaming a milestone or decision in a
  `PLAN_*.md` or `PROGRESS.md`. Omitting an identifier is not a red — it is a wrong answer nobody
  is told about, which is why this is a discipline rather than a convenience.

- **`npm run verify:construct-coverage`** — **every construct tflw ships is either graded here with
  a known answer or explicitly listed as not yet graded, and a new one is neither.** The construct
  set is not a list in this repository: it comes from `tflw spec --json`, emitted by the vendored
  build, so the checklist and the program under test cannot disagree (`M154b`, `D723`). The roster
  is [`CONSTRUCTS.md`](CONSTRUCTS.md) and everything else is a ratchet in
  `scripts/lib/constructs.mjs` that may only shrink — with a pinned ceiling, so growing it takes two
  edits and the second is a number going the wrong way (`D730`, `D740`).
  **This gate refuses to run** against a vendored tflw that is not current with the sibling
  checkout, and says so by name (`D741`). That is not fussiness: its ground truth *is* the manifest
  that build emits, so a stale copy does not give an old answer, it gives a green one on exactly the
  day a newly-shipped construct should have turned it red. Run `npm run refresh-tflw` first.
  Why it is worth its seconds: nothing was watching before it, and the measurement is unflattering —
  **seven step keywords at literally zero occurrences across 126 `.tflw` files, fourteen more at
  exactly one, four of six workload shapes never executed by anything.**
  The plants themselves are graded by `npm run verify:construct-acceptance`, which needs the stack
  and a browser and runs as the `construct-acceptance` regression phase.
- **`npm run verify:redaction:self-test`** — **the redaction gate's guards are held to the inputs
  they exist for.** `scripts/verify-redaction.mjs` proves real PII never reaches
  `report/results.json`, and it needs apiV2, a real `--env safetyRedaction` run and a direct
  ground-truth fetch to do it — so it runs as the `safety-redaction-check` regression phase, not
  here. Its *guards* need none of that: this drives them against synthetic reports and asserts each
  one fires, and that none fires on the control (`M154g`, carrying `M154f-03`).
  Why it exists: that gate could shrink its own ground-truth set silently, and one of the three
  fields it claims to walk — `request.body` — **was never present in any run**, because the corpus
  was three `GET`s. A third of the surface was asserted over an empty set under a closing line that
  said the whole trace was clean. `M154f` had already caught a recurrence guard passing a case
  deliberately broken to test it; a gate written and never failed is decoration, and this is the
  cheapest place to keep that from being true again.
- **`npm run read:mutation-matrix:gate`** — **the hand-authored half of the mutation kill matrix
  still describes the measured half.** `M164b` applied all 271 of tflw's bundle-reachable mutations
  and recorded which roster plants went red; `M164c` re-ran the ten that killed anything and split
  those kills by *how* the plant died. 195 of 207 were the mutated build refusing the plant's
  fixture at check time — the plant produced no report and asserted nothing — and **six** were the
  plant running, producing its known answer, and the answer being false. Those six are labelled by
  hand in `scripts/lib/mutation-covers.mjs`, one line of reasoning each (`D842`), and this gate
  refuses in both directions: a measured assertion-kill with no label, or a label for a relation
  that no longer happens.
  Why it exists rather than a coverage ratchet: the measured covering set is **one mutation
  protecting one plant of 102**, and `D851` declined to pin that — a job named for roster vacuity
  that asserted only `C94`'s session scoping would claim far less than its name. This asserts
  nothing about coverage. It only keeps a hand-maintained table from drifting away from the
  measurement it annotates, which is the seam `D767` keeps finding.
  The census itself is in `tflw-acceptance/mutation/` and is a measurement with a date on it, not a
  baseline. Re-running it needs the box, the stack and about seven hours: `npm run
  discover:mutation-kills`.
  **What this gate cannot tell you, stated because it is the interesting half.** It compares two
  committed files, so it never re-measures a kill. If tflw's session scoping regressed tomorrow,
  `C94`'s own acceptance plant would catch the regression — that is what the plant is for — but the
  *claim that `C94` discriminates* is verified once, by hand, on the census date. `M164`'s seventh
  acceptance clause asked for an automated re-measurement and is recorded **not met** rather than
  reworded to fit what shipped (`D853`).
  So the reader reports how stale it is instead of pretending otherwise (`D854`): it derives the
  sweep's wall clock from the matrix rows' own stamps and compares the census's two denominators —
  tflw's registry size and this repository's graded-plant count — against the live ones, naming any
  drift. That line informs and does not fail, because a mutation added in tflw is the right change
  and reddening this repository's CI for it would leave the person who tripped it with a
  seven-hour box run as their only remedy.
- **`npm run verify:argv-contract`** — **the census script's flags are validated and read from one
  table, and the cases proving it are held against the implementation they replaced.**
  `discover-mutation-kills.mjs` decides whether a retraction's stated cause is recorded, whether a
  capped sweep is capped, and whether the baseline bracket runs at all. Until `M164-04` it validated
  with a set of spellings and read with index arithmetic over raw `argv` — two independently written
  things that nothing made agree — so each flag could be wrong in its own way, and four of nine
  were. An eighteen-word `--why` recorded one word (observed live, in `M164-03`'s own retraction);
  `--limit=5` validated and was read by nothing, so a capped sweep ran uncapped; `--limit` with a
  forgotten value became `NaN`, and `.slice(0, NaN)` is empty, so the sweep swept **zero**
  candidates and exited 0; `--window` with a forgotten value became `NaN`, and `NaN > 0` is false,
  so **the baseline bracket was silently disabled** — the state that script's own help text names as
  "how the first census corrupted itself".
  Not one of those printed a diagnostic, which is why the gate's own cases are the interesting part.
  Each declares whether it *discriminates* — comes out differently under the previous
  implementation, which is reimplemented in the file — or is a regression guard, and the gate
  refuses if a case marked either way is actually the other. That check has already fired twice
  against its own author: once on an unfaithful model of the old parser, once on a case classified
  as a repair demonstration that the old parser also passed. It also enforces the rule the old
  block's comment could only state — a flag declared in the spec and read by no `flag()`/`has()`
  call is refused, which is exactly how `--help` and `--out` each shipped as decoration.
  A contributor gate rather than ci-only because it is milliseconds, needs no stack, and the person
  who will next add a flag is the one who should learn immediately that spelling it is not wiring
  it.
- **`npm run verify:sweep-size`** — **no tracked file says how many phases the sweep has.** `D504`
  keeps the phase *list* out of prose because a copy of it would be a copy with no guard. A count is
  that same copy compressed, and `D767` deleted it for exactly that reason after `M154g-14` found
  three sentences here claiming 30 while `PHASES` held 38.
  It drifted again anyway, and *how* is the reason this gate exists rather than a third correction.
  `M154g`'s repair named **four files** and removed seven occurrences; the guard it left behind reads
  **one** of them, this document. Eight days later the count was still in **six** files, in three
  disagreeing numbers — and one of the six is `scripts/regression.mjs`, which that repair's own
  close-claim lists as finished (`M166-02`; `git log -L 9,9` puts the line's last write two days
  *before* the repair, so the pass missed a line already sitting there). The stale sentence was also
  the warning: it ended *"don't let this number drift the way README.md's once did"*, and README had
  drifted again. **A repair spanning six files with a guard covering one looks complete for exactly
  as long as nobody counts.**
  So the guard is now the whole tracked tree rather than a list somebody wrote down. It forbids a
  numeral bound to `phase`/`phases` with at most one word between them, and **exempts text inside
  double quotes** (`D857`): the paragraph above quotes the sentence that carried the defect, and a
  rule that forced that to be paraphrased would delete the evidence in the name of the finding. You
  may quote a stale count; you may not assert one. It states its own limits in its header — a size
  written without the word, or spelled out, gets past it — and it runs its guards, negative controls
  included, on every invocation rather than behind a flag.
- **`npm run verify:provenance`** — **nothing in this repository's prose points somewhere a reader
  cannot follow.** Three claims, checked as one because they are one claim from the reader's side.
  Eight markdown links pointed at `../testFlow/…`, and a relative link cannot climb above a
  repository root — every one of them 404s for anyone whose disk does not happen to hold both
  checkouts side by side, which is exactly why they survived a year. Four of the eight named a
  `PLAN_*.md` that tflw's `.gitignore` excludes, so even the right URL would have 404'd. Second,
  every file that cites tflw's `P#n`/`D<n>`/`M<n>` notation **declares which sequence it means**:
  both repositories number their milestones from 1, and 35 identifiers are defined in both record
  sets — `testFlow-tests M22` is the nginx mTLS sidecar and `tflw M22` is a coverage audit — so an
  unqualified one resolving to a real entry about the wrong thing is worse than one resolving to
  nothing. Each file
  declares a default and spells out the minority (`tflw M128a`, `testFlow-tests M22`). Third, every
  unqualified citation has an entry in tflw's published `DECISIONS.md`, and tflw's tracked pin of
  this repository's citations agrees with this repository's prose **in both directions** — a pin
  that has gone stale makes tflw's index publish entries nothing asks for, and this is the only
  place in either repository that can see both sides.

  **This is one of the few gates that cannot run on fedora-box, and it now says so rather than
  guessing.** Its corpus is `git ls-files '*.md'`, and `scripts/exec.mjs` copies files, not history
  — the box's working tree has a `.git` skeleton with no index, so git answers *zero tracked files*
  without failing. That answer used to make every check below vacuous in the same direction, and
  the gate then reported tflw's entire pin as stale with a remedy attached: re-pin it. The remedy
  was wrong, and following it would have discarded a correct pin to satisfy a tree that could not
  read itself. A plausible finding with an actionable fix is more dangerous than a crash, so the
  gate now checks its own input first and fails with the true reason. It still does **not** skip.
- **`npm --prefix apiV2 run lint`** — eslint over the target app. **The prefix is not decoration:**
  a bare `npm test` at this repo's root is `tflw run`, a Docker-dependent suite of `.tflw` files, and
  it is a completely different thing from anything inside `apiV2/`.

  **`--fix` came off this command in `M141`.** An autofixing linter's failure surface is only the
  subset eslint cannot repair, so the job was reporting clean on a tree it had just silently
  rewritten — and on CI, where nothing commits the rewrite, the repairs were discarded every run
  (`M141-01`).

### apiV2 has no unit tests, and that is a decision

`npm --prefix apiV2 test` used to be on the list above and in the `apiv2` CI job. It was
`jest --passWithNoTests` over a tree with no test files: a gate green unconditionally (`M138b-01`,
found by running this page's own list for the first time, three days after the page existed). It has
been **deleted rather than filled in**, and this paragraph is the deliverable of that change —
without it, the next person reads the diff as coverage quietly dropped and puts it back.

**apiV2 is a dogfood target, not a product.** It exists to give tflw something realistic to point at,
and it is expected to keep being rewritten as tflw grows: new auth shapes, new error surfaces, new
endpoints invented specifically to exercise a feature that does not exist yet. Unit tests would pin
the layer that is supposed to move, and each one would be work spent defending a fixture against its
own purpose.

What holds apiV2 honest instead is the **`.tflw` regression sweep**, asserted from outside
over HTTP — the layer that stays stable across all that reshaping, and the same interface tflw's own
users see. That is the stronger check of the two, and it was already the only one doing anything.

If apiV2 ever stops being a target and starts being something whose internals other code depends on,
this decision expires. That is the condition; it is deliberately not tied to a milestone number.
- **`xvfb-run -a npm run regression`** — the whole sweep, each phase on its own fresh Docker
  restart — **plus one phase that runs only off CI**, see `perf-ladder` below. Restarting is
  not optional: `unique(...)`'s counter resets per `tflw run` while Postgres
  data does not, so chained phases on one database reproduce false collisions. `xvfb-run -a` is not
  optional either — the `watch-check` phase spawns a real `tflw watch`, which always forces a headed
  browser.
  **The phases are deliberately not listed here, and since `M154g`/`D767` they are not *counted*
  here either.** `scripts/regression.mjs`'s `PHASES` is the authoritative list, and `PHASE_GROUPS` is
  already held to it by a partition guard that exits 1 on an ungrouped, unknown or duplicated phase.
  A copy of that list in prose would be a copy with no guard — in the document whose entire subject
  is copies with no guards. **A count is that same copy compressed**, and it drifted exactly as
  `D504` predicted the list would: these three sentences said "30-phase sweep" while `PHASES` held
  **38**, through eight phases arriving across six milestones, and nothing anywhere could notice
  (`M154g-14`). The number is gone rather than corrected — correcting it would have restored a claim
  with no guard to a document that is about not doing that.
  **`perf-ladder` is the one phase CI never runs** (`D758`). It is the *measured* half of the perf
  gate — the ladder's seven rungs plus the functional leg, `node scripts/perf-conformance.mjs
  --profile sweep --in-sweep` — and it needs what a GitHub runner cannot give it: `fedora-box`, k6,
  and exclusive use of the machine. The bands it is judged against are ratios of tflw to its
  co-runner taken under a whole-box lease (`D750`), so a number from a shared runner is not
  comparable to them at all. The breaking-point `curve` tier is deliberately left out of the phase
  (`D760`): it is the longest leg and the one most sensitive to a neighbour, and a gate people start
  skipping is worth less than a smaller gate they keep running. On any other machine the phase prints
  its reason and reports `⊘ skipped` — never a pass (`D761`), because a green line that measured
  nothing is how a perf gate goes a month without running and nobody notices. To include it, sweep
  through the box: `node scripts/exec.mjs exec -- npm run regression`, which takes the box lock the
  phase then inherits rather than deadlocking against — `boxlock.sh` is a whole-box mutex and is not
  reentrant, so the phase *verifies* the inherited lease instead of taking a second one or waiving it
  (`D759`). It measures your working tree, dirty or not, and writes to
  `~/tflw-perf/results/sweep/` rather than over the `latest.json` that reports the box's own state.

  For a fast local pass there is `npm run regression:smoke`: one Docker restart, `--tag smoke` plus
  the cheapest restart-agnostic checks. It is **not** a substitute for the sweep and is not a gate.

## Writing a browser test: own the rows you assert on

**A test creates the records it puts in a cart or reviews. It does not drive a seeded fixture by
name** (`D819`, `M162`). The seeded `Bulk Item …` catalog is fine to *read* — filter it, page
through it, assert a count against it. It is not fine to consume.

This is a convention and deliberately **not** a gate (`D822`), because the condition that catches it
is "run one file six times without dropping the database", and a CI job that did that would cost
more than the defect and be switched off the first time it made a build take an hour. So it is
written here instead, with the reason, measured on 2026-08-31:

- A seeded product's `stock` is finite (`Bulk Item 100` starts at 20), **the seed never replenishes
  it** — `apiV2/src/seed/seed.ts` skips any name that already exists, so `restart` does nothing and
  only `node cli.mjs stop` (`down -v`) restores it — and every checkout decrements it.
- `tests/mixed/storefront.tflw` consumed four units of one product per run. On the **sixth**
  consecutive run against one stack the storefront rendered the add-to-cart control `disabled`, and
  four tests each spent the full 30-second actionability timeout. The file went from 18 s to 134 s
  and two acceptance plants went red for a reason that had nothing to do with what they grade.
- A review is worse: it cannot be undone at all. The 409 is keyed on `(userId, productId)` and
  `apiV2` has no `DELETE` for a review at any route, so a test that reviews a fixed product as a
  fixed user gets **one** run per stack — and cannot even be looped to investigate a flake in it.

If you are about to assert a stateful outcome on something you did not create, that is the moment to
create it instead. `tests/ui/storefront/review-submission.tflw` is the pattern.

## The cross-repo pair — the gate that belongs to two repositories

```sh
npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs
```

**A tflw milestone that assigns a `TF0xx` code is not done until its companion PR here has merged
too.** Adding a code is a breaking change for this repository's `main` with no additive path: CI
here re-packs tflw from its live `main`, and `verify-check-diagnostics.mjs` then demands a fixture
for a code that has no fixture yet. The two PRs are one unit of work and merge back-to-back, **tflw
first**.

Nothing automatic catches this, and that is a decision rather than an oversight — nothing here
re-runs when tflw merges. The command above is the whole of the enforcement: `refresh-tflw` packs
from your local tflw checkout, so it answers in seconds, before any PR exists. **It would have
caught all three times this has happened**, and `M132` found that nobody knew it existed.

This section lives here, in the repo where the failure actually happens, and tflw's
[`CONTRIBUTING.md`](https://github.com/deepak-tuteja/tflw/blob/main/CONTRIBUTING.md) points at it rather than repeating it. Two homes
for one command become one correct home and one stale one.

### `BREAKING:`, and the box run that reads it (`M154f`)

**Two things changed here, and neither of them is enforcement.** "Nothing automatic catches this"
above was true for nine milestones and is now half-true, which is worth stating precisely rather
than quietly editing.

*A tflw commit that changes what this repository's corpus or gates will accept says `BREAKING:` in
its message.* A new `TF0xx` code, a renamed field in a consumed artifact, a construct added to or
removed from the manifest, a grammar change. Nothing checks that you wrote it — that is the
complaint `M124-03` makes about the pre-push-hook shape, and it applies to a convention just as
much.

What reads it is the box's `perf-conformance` run — **on demand or as the sweep's `perf-ladder`
phase, no longer nightly** (`D754`, `D758`) — whose **functional leg** packs tflw from
its live `origin/main` into its own checkout and runs the four gates whose ground truth is that
binary: `verify-check-diagnostics.mjs` (the code seam), `verify-construct-coverage.mjs` (the
manifest seam), `check-acceptance.mjs` (the grammar seam) and `verify-artifact-contract.mjs` (the
consumed-artifact seam — `M136c-01`, where a renamed SARIF field left every code in place, every
gate green, and eleven entries broken).

When that leg goes red, the artifact names the tflw commits since the last measured sha that
declared themselves `BREAKING`. So the convention is not a gate; it is **attribution**. `M124-03`'s
objection to a scheduled sibling run was that it *"catches it late and blames the wrong commit"* —
late is real and unfixable from here, since a tflw push cannot block on a repository it does not
know about, but the blame half is what the marker buys back. `M124-03` itself is **open again**
(`D757`): it was closed on the timer's deployment, the timer never ran, and *deployed* was the wrong
condition — *ran* was. It is now deferred against **publish**, because the choice between a
late-but-automatic catch and a marker that catches only what someone labelled is guesswork until
there is a published artifact for a sibling to break against.

**A red with no `BREAKING` commit behind it is not a failure of the convention.** It is the more
interesting case — an unintended break — and it is exactly the one a hook reading labels would have
missed. The command at the top of this section is still the enforcement, and it still answers in
seconds before any PR exists.

**The pre-push hook half stays refused.** A hook is an untracked file in one person's `.git/`; a
guarantee that lives there is a guarantee for one machine.

## Merge order, when a change spans both repos

**tflw first, then here, chained.** Two independent reasons, and they point the same way:

1. A new diagnostic code is breaking for this repo's `main` with no additive predecessor (above).
2. `verify-contributing.mjs` reads `../testFlow/CONTRIBUTING.md` out of a checkout of tflw's live
   `main` and **does not skip when it is absent** — a guard that passes when the thing it guards is
   missing is green about nothing.

Between the two merges this repo's `main` is red. That window is accepted and is the reason to push
both branches in one command rather than two.

## Where these actually run — and the part nothing checks

> **This section is not guarded.** Everything above is held to `.github/workflows/`. What follows
> has no CI counterpart to compare against, so it can go stale and nothing will say so.

The sweep is ~35 minutes with a Docker stack behind it, and on this project it runs on a Fedora box
over SSH rather than on the laptop, through `scripts/exec.mjs` — which is **untracked by decision**
and which a fresh clone will not have. Without it, run the gates locally; nothing above needs the
box.

Two traps worth writing down, both of which have cost a real debugging session:

- **[tflw](https://github.com/deepak-tuteja/tflw) has its own `scripts/exec.mjs`, and your working directory decides which one
  runs** — and therefore which copy on the box. Driving the wrong one produces `MODULE_NOT_FOUND`
  for a script that plainly exists.
- **A trailing `| tail` makes the pipeline's exit status `tail`'s.** The shell reports success while
  the log says the run failed. Read the log, not the summary line.

`.env` here holds **real credentials** for the local stack. It is gitignored and stays that way; so
do the `.env` files under `tflw-acceptance/`.
