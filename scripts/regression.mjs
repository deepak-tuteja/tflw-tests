#!/usr/bin/env node
// Full regression sweep: runs the whole suite, then each feature-area tag alone, then each
// layer tag alone, then `@smoke` alone, then each smoke+area cross-axis combo — everything
// M17-M20's manual verification passes already exercised by hand, scripted so it runs the same
// way every time (M21). M25 adds two more phases (mtls-rejection, safety-redaction-check)
// matching what CI needs per PLAN_CI.md decision 8. E5 (PLAN_ENTERPRISE_REGRESSION.md) adds the
// LAYER_TAGS axis (`--tag api`/`--tag ui`/`--tag mixed`, alone-phases only, no smoke cross — see
// LAYER_TAGS's own comment below for why). `M154h` adds `perf-ladder` (`D758`), the first phase in
// this file that deliberately does not run in CI. Current total: 31 phases — **30 grouped, which is
// what CI's four legs run, plus one `localOnly`** — and PHASES below is the source of truth for the
// exact count, not this comment; don't let this number drift the way README.md's once did (fixed in
// E2a). Everything else in this repository that names the sweep is naming the grouped sweep
// and stays true; only this file counts the array.
//
// Every phase gets its own fresh Docker restart first. Necessary, not just cautious: `unique(...)`
// resets its counter each `tflw run` invocation, but Postgres data persists across invocations —
// chaining phases on the same DB reproduces the exact "unique(...)-email/data collision" false
// failures this project has already hit and documented twice (PROGRESS.md M20, M21). A phase's
// result is only trustworthy in isolation.
import { rmSync } from 'node:fs';
import { tflwCommand } from './lib/tflw-bin.mjs';

/** **`released`, and this is the loudest declaration of it in the repo.** The sweep is
 *  this project's primary dogfood gate, and until M141 it opened every phase with a literal
 *  `npx tflw` — which resolves the VENDORED tarball through `node_modules/.bin`. So the gate a
 *  contributor reads as "my change still passes" has always graded the *released* build, and
 *  nothing anywhere said so (`M115-03`). The program is unchanged; the question is now declared
 *  and the entry is printed once per run. To sweep a branch build instead, set `TFLW_BIN`. */
const TFLW = tflwCommand('released', { label: 'regression' });
import { ARCHIVE_DIR, CI_VERBOSE, archivePhaseReport, passedPhasesWithFailingJunit, restart, run } from './lib/regression-shared.mjs';

// PLAN_CI.md decision 9 wants every phase's report.html/junit.xml/results.json uploaded, not just
// a green run's — but every phase writes to the same `report/`, and the next phase's restart
// doesn't touch it (only tflw's next `run` overwrites it in place). archivePhaseReport (shared
// lib) archives each phase's output into its own subdirectory immediately after that phase
// finishes, before the next phase's `tflw run` can clobber it. See the shared lib for the
// demo-fail-check junit-renaming history (M35).

// E3 (PLAN_ENTERPRISE_REGRESSION.md) adds `orgOps` as a 5th area tag — its own `--tag orgOps` and
// `smoke,orgOps` phases below fall out of the existing per-area-tag map, no separate wiring
// needed.
const AREA_TAGS = ['identityOps', 'catalogOps', 'orderOps', 'adminOps', 'orgOps', 'inventoryOps'];

// E5 (PLAN_ENTERPRISE_REGRESSION.md): a second, orthogonal axis over the same suite — cutting by
// *how* a test executes (api-only / browser-only / crosses a service boundary) rather than *which
// feature area* it covers. Every test already carries exactly one of these three alongside its
// area tag (E1's suite reorg put them there structurally, per directory: tests/api/, tests/ui/,
// tests/mixed/). Its own alone-phases only, matching AREA_TAGS's own `--tag <area>` alone-phase
// pattern — deliberately no `smoke,<layer>` cross: `--tag smoke` alone already runs a mixed sample
// across all three layers together, so a per-layer smoke cross would just be re-slicing that same
// set, not proving anything new the way `smoke,<area>` does for a specific feature area.
const LAYER_TAGS = ['api', 'ui', 'mixed'];

// `--verbose` only under real GitHub Actions (CI_VERBOSE, imported above) — a local `npm run
// regression` stays exactly as compact as it's always been; a CI run gets grouped per-step detail
// automatically, no other YAML wiring needed. Deliberately no `--bail` here even in CI: decision 9
// (PLAN_CI.md) wants every phase's *complete* artifact uploaded, pass or fail — bailing at the
// first failing test would leave a truncated report for exactly the run you'd most want full
// evidence from.

// Most phases share the plain `tflw run --no-color [args]` shape; a phase may instead supply its
// own `cmd` (mtls-rejection needs a non-default `--env` + explicit file path; safety-redaction-check
// isn't a `tflw run` invocation at all, it's the report-artifact proof script from M25).
//
// Bare `tflw run`'s no-file-args discovery is scoped by tflw.config's own `exclude
// "tflw-acceptance"` (tflw 0.1.0 M58, D127/PLAN_DISCOVERY_EXCLUDE.md) — that second, independent
// suite (own sessions/env, moved in from `testFlow` by PLAN_UNIFIED_RUN_DOGFOOD_REORG.md Phase 2)
// is excluded at the config level now, so every below-`args`-array phase can rely on plain bare
// discovery again; explicit-`cmd` phases already name their own files regardless.
const PHASES = [
  { name: 'full suite', args: [] },
  ...AREA_TAGS.map((tag) => ({ name: `--tag ${tag}`, args: ['--tag', tag] })),
  ...LAYER_TAGS.map((tag) => ({ name: `--tag ${tag}`, args: ['--tag', tag] })),
  { name: '--tag smoke', args: ['--tag', 'smoke'] },
  ...AREA_TAGS.map((tag) => ({ name: `--tag smoke,${tag}`, args: ['--tag', `smoke,${tag}`] })),
  {
    name: 'mtls-rejection',
    cmd: [TFLW, 'run', '--no-color', ...CI_VERBOSE, '--env', 'mtlsSidecarNoCert', 'tests/.env-specific/mtls-rejection.tflw'].join(' '),
  },
  { name: 'safety-redaction-check', cmd: 'node scripts/verify-redaction.mjs' },
  // M29 (plan_v2.md Part R, coverage audit): the tests/.demo-fail/ set and 6 previously-unproven
  // CLI flags had no repeatable, regression-catching proof before this — only ad-hoc manual runs
  // during past milestones. Same "script it, don't trust a one-time manual check forever" reasoning
  // as safety-redaction-check above.
  { name: 'demo-fail-check', cmd: 'node scripts/verify-demofail.mjs' },
  { name: 'cli-flags-check', cmd: 'node scripts/verify-cli-flags.mjs' },
  // M42 (PLAN_WEBV2_M40.md decision 3): CLI-verb dogfooding for `migrate`/`watch` — same "script it,
  // don't trust a one-time manual check forever" reasoning, now covering the two remaining
  // scriptable CLI verbs (`refactor apply` is deliberately one-off/mutating/human-reviewed, not
  // scripted here; `pick` is deliberately manual, see PROGRESS.md's M42 section).
  { name: 'migrate-check', cmd: 'node scripts/verify-migrate.mjs' },
  { name: 'watch-check', cmd: 'node scripts/verify-watch.mjs' },
  // M47 (PLAN_WEBV2_M45.md): --forbid-insecure/--evidence had stale "already covered" claims in
  // verify-cli-flags.mjs's own comment — neither was actually invoked/proven anywhere. Same
  // reasoning as migrate-check/watch-check above, own phase since both are safety/policy knobs.
  { name: 'safety-flags-check', cmd: 'node scripts/verify-safety-flags.mjs' },
  // M49 (PLAN_WEBV2_M45.md): tests/.checkonly/ only covered 3 of 22 assigned TF0xx codes, manually
  // run per its own header comments, never wired into any automated check. Same "script it, don't
  // trust a one-time manual check forever" reasoning as every other *-check phase above.
  { name: 'check-diagnostics', cmd: 'node scripts/verify-check-diagnostics.mjs' },
  // M137a (`M136c-01`): the sibling of `check-diagnostics`, for the *other* seam between these two
  // repositories. That one guards `TF0xx` assignment; this one guards the shape of an artifact this
  // repo reads. `M136a` renamed a field in `findings.sarif`, no code moved, `check-diagnostics`
  // stayed green, and the break surfaced as eleven failed entries in `sarif-acceptance` — the
  // slowest route available. Both are static and answer in milliseconds; both are in the `safety`
  // group, beside each other, because they are one idea with two objects.
  { name: 'artifact-contract', cmd: 'node scripts/verify-artifact-contract.mjs' },
  // M50 (PLAN_WEBV2_M45.md): `tflw pick` had only one manual, non-scripted verification pass
  // (PROGRESS.md's M42 checklist) — a real click still isn't automatable (no CDP endpoint exposed,
  // deliberately manual by design), but launching + a clean Ctrl+C exit now is, same "script it"
  // reasoning as watch-check/migrate-check above.
  { name: 'pick-check', cmd: 'node scripts/verify-pick.mjs' },
  // M51 (PLAN_LOG_CONSUME.md): --log-output/--log-level had zero proof anywhere in this suite —
  // a genuine, never-closed gap, not a stale claim. Same "script it, don't trust a one-time manual
  // check forever" reasoning as every other *-check phase above.
  { name: 'logging-check', cmd: 'node scripts/verify-logging.mjs' },
  // PLAN_REPORT_OVERFLOW.md: a real report.html was scrolling the whole page sideways on a long
  // unbroken token (a JWT) — fixed upstream in tflw, re-proven here against the real vendored
  // build's actual output, not just tflw's own unit test.
  { name: 'report-overflow-check', cmd: 'node scripts/verify-report-no-overflow.mjs' },
  // E2 (PLAN_ENTERPRISE_REGRESSION.md): `tests/.env-specific/ui-admin/`'s new UI-only admin
  // console tests need their own `--env webv2Admin` phase for the same reason the file it lives
  // alongside (`webv2-admin.tflw`) needs `env webv2Admin` at all — the default `env local`'s `web`
  // base points at the storefront's :8090, not this console's :8091.
  {
    name: 'ui-admin-check',
    cmd: [TFLW, 'run', '--no-color', ...CI_VERBOSE, '--env', 'webv2Admin', 'tests/.env-specific/ui-admin/*.tflw'].join(' '),
  },
  // Pre-E3 housekeeping (found during E2, deliberately deferred there): `webv2-admin.tflw` itself
  // — the pre-existing *mixed* admin test living alongside `ui-admin/` — had never been wired into
  // this sweep at all, unlike every other `.env-specific/` file. Same `--env webv2Admin` reason as
  // `ui-admin-check` above. E3 (PLAN_ENTERPRISE_REGRESSION.md) adds `orgs-mixed.tflw` to this same
  // phase — an explicit file list, not a `.env-specific/*.tflw` glob, since that directory also
  // holds `mtls-rejection.tflw`/`unreachable-host.tflw`, which need their own different envs.
  {
    name: 'webv2-admin-check',
    cmd: [TFLW, 'run', '--no-color', ...CI_VERBOSE, '--env', 'webv2Admin', 'tests/.env-specific/webv2-admin.tflw', 'tests/.env-specific/orgs-mixed.tflw'].join(' '),
  },
  // M128a (testFlow PLAN_M128_PENTEST_TIER1.md, D293): the pentest arc's target. Two phases,
  // because they need two different things from the stack and only one of them needs anything
  // unusual.
  //
  // `secure-local-check` is an ordinary `tflw run` against the clean app through the 8443 TLS
  // sidecar — `--env secureLocal`, same reason `mtls-rejection` needs its own `--env`.
  {
    name: 'secure-local-check',
    cmd: [TFLW, 'run', '--no-color', ...CI_VERBOSE, '--env', 'secureLocal', 'tests/.env-specific/secure-local.tflw'].join(' '),
  },
  // `security-target-check` is the only phase that needs the stack itself brought up differently
  // (`VULN_MODE=1`, the fixture slice — Tier 1's hygiene routes plus, since M130a, Tier 2's
  // broken-authorization ones). It asserts VULNS.md's claims against the running target — no rule
  // pack for either tier's findings runs here, so a failure means apiV2/nginx/VULNS.md disagree,
  // never that tflw regressed. It is in the sweep from day one rather than "once M128c needs it" for the
  // reason its own header gives: the acceptance numbers M128c will publish are only as true as the
  // assumption that this target still answers the way the ledger says.
  {
    name: 'security-target-check',
    cmd: 'node scripts/verify-security-target.mjs',
    stackEnv: { VULN_MODE: '1' },
  },
  // M137e (testFlow PLAN_M137_PENTEST_TIER4.md, D438): the complement of the phase above, and the
  // **only** reason it is a separate phase is that it needs the other stack. `security-target-check`
  // asserts the fixture slice is there and correct; this one asserts it is not there at all, which
  // is only a meaningful question without `VULN_MODE=1` — hence no `stackEnv`, like every ordinary
  // phase.
  //
  // It exists because M137e narrowed a safety property: `VulnReportsController` is deliberately
  // documented in `/openapi.json` (D438, so a crawl's OpenAPI seed can enumerate it), and the whole
  // argument for that being safe is that the route is absent without the flag. Nothing checked that
  // before, and nothing would have noticed it stop being true — every other file in this repo runs
  // against the default stack and none of them assert what is missing from it.
  //
  // Placed immediately after its sibling so the pair reads as a pair, at the cost of one extra stack
  // restart between two phases that want different flags. That cost is the reason they are adjacent
  // rather than the reason to merge them.
  {
    name: 'vuln-slice-hidden-check',
    cmd: 'node scripts/verify-vuln-slice-hidden.mjs',
  },
  // M135c (testFlow PLAN_M135_SARIF.md, D415): the SARIF document, graded against `VULNS.md`.
  //
  // The **first** acceptance script in this repo to run in CI, and what earned it that place is the
  // one asymmetry that makes SARIF different from every other artifact here: a wrong document
  // **uploads successfully and produces no alerts**, with nothing anywhere to read.
  // `verify:input-acceptance` publishes coverage numbers a human reads; this one guards a file a
  // machine consumes silently, so nobody would ever notice it going wrong.
  //
  // It is no longer the *only* one. What stood here until M139-5 — "the only acceptance script in this
  // repo that runs in CI" — was true when written, and `M137e-01` is the row that said the sentence
  // had to be corrected by whatever change made it false: D493 splits `verify:security-acceptance` and
  // gates its asserting half as `security-acceptance-gate` below. SARIF's silent-when-wrong asymmetry
  // was always a reason to gate SARIF and never a reason to leave precision ungated.
  //
  // `VULN_MODE=1` for the same reason `security-target-check` needs it — it grades the planted
  // routes — and it is placed immediately after that phase because the two share the stack shape.
  // The document itself is copied into `report/` by the script, so `archivePhaseReport` carries it
  // into `report-by-phase/sarif-acceptance/` and CI's existing upload archives it (D415's artifact)
  // with no workflow change.
  {
    name: 'sarif-acceptance',
    cmd: 'node scripts/verify-sarif-acceptance.mjs',
    stackEnv: { VULN_MODE: '1' },
  },
  // M139-5 (testFlow PLAN_M139_LEDGER_ACCEPTANCE.md, D493): `verify:security-acceptance`'s asserting
  // half, and only that half. `--gate` runs the three envs' corpus runs, the per-row ledger grading,
  // the declines/functional/crawl/spider graders, D445's precision bar and its staleness check, and
  // then exits. The coverage tables stay a report run by hand, because their gaps are recorded and
  // accepted (D295's four, D495's one) and a phase whose red no fix closes only teaches people to
  // ignore a red.
  //
  // This is what closes `M137e-01`: the one thing asserting that this repo's security scan is
  // *precise* — that nothing fires outside (baseline u plants) — ran in no automated pass at all,
  // neither here nor in CI. `M137g` raised the stakes by making that same ungated script the sole
  // grader of `V18` and of both `probe ciphers` notes.
  //
  // `VULN_MODE=1` for the same reason its two neighbours above need it: the corpus grades the planted
  // routes, so the fixture slice has to be there.
  {
    name: 'security-acceptance-gate',
    cmd: 'node scripts/verify-security-acceptance.mjs --gate',
    stackEnv: { VULN_MODE: '1' },
  },
  // `M154g` step 5 (`D765`). Tier 3's grader, and `M137e-01` for the **third** time: a script that
  // states its known answers in full, asserts them, and exits non-zero — running in no automated
  // pass at all. `D493` settled that remedy for Tier 1/2 in `M139-5` and the phase directly above is
  // it; this is the same move, and it needs no new mechanism because the mechanism is that one.
  //
  // **Why it took three milestones to notice.** Three constructs sat on the ratchet citing this
  // script's own footer — *"a Tier 3 assertion costs an order of magnitude more requests than a Tier
  // 2 one (`D380`), too high for every-PR"* — and that sentence was unsourced. `D380` decides that
  // the ~45 real test files are Tier 3's negative corpus and its **volume measurement**, which is
  // `sweep-input-volume.mjs` and its 240 observed requests: a different script, a different corpus,
  // a different question. Nothing in `DECISIONS.md` ever placed this grader outside CI.
  //
  // **And the cost is inverted, measured rather than argued.** On `fedora-box` against the full
  // `VULN_MODE=1` stack this grader passes — 7 ledger rows, 2 applicability probes, 1 `TF067` probe,
  // 0 failures — in 0.91-1.05 s, printing its own price of 7 assertions and 80 extra requests.
  // `security-acceptance-gate` costs 1.70-1.99 s in the same state. Six runs each across two days and
  // two commits, because one triple is a reading and not a measurement. The gate nobody ran was half
  // the price of the gate everybody ran, both times (`D764`, `M154g-13`).
  //
  // NOT `localOnly`. `M154h`'s `perf-ladder` exception exists for a gate CI genuinely cannot judge
  // (`D750`, `D761`); a one-second gate against the same Docker stack every other phase here uses is
  // not one, and borrowing a real exception to avoid re-measuring a wrong number is the same error
  // one layer up.
  //
  // `VULN_MODE=1` for the reason its three neighbours above need it: the Tier 3 corpus grades routes
  // under `/vuln/`, so the fixture slice has to be there.
  {
    name: 'input-acceptance',
    cmd: 'node scripts/verify-input-acceptance.mjs',
    stackEnv: { VULN_MODE: '1' },
  },
  // M154b (`D722`, `D726`, `D732`). The construct ledger's three plants, graded against their known
  // answers. Needs everything: the stack for `C1`, a browser and the admin console for `C2`, and a
  // standalone arrival counter this script starts itself for `C3`.
  //
  // NOT `VULN_MODE=1`, unlike its three neighbours above — deliberately, and `D725` is the reason.
  // A known answer is not a vulnerability: `vuln/` earns its gate because it serves live flaws,
  // while `apiV2/src/soft-check/` serves a frozen constant and `webV2/admin`'s bulk delete is an
  // ordinary admin feature. Gating them would double the CI legs for nothing and force the five
  // existing demo modules to move.
  //
  // Its static half — is every construct tflw ships accounted for at all — is NOT here. That costs
  // seconds and needs no stack, so it runs as its own step in the `acceptance-check` job on every
  // PR (`D727`). Two questions, two instruments, two failure meanings: a red here says a plant
  // stopped producing its known answer, and a red there says the roster and the language disagree.
  {
    name: 'construct-acceptance',
    cmd: 'node scripts/verify-construct-acceptance.mjs --gate',
  },
  // `M154h` (`D758`, `D761`). The perf ladder, measured — and the **only** phase in this file that
  // deliberately does not run in CI.
  //
  // It is here because the schedule that used to own this question is gone. `D733` put the measured
  // perf gate on a nightly systemd timer; `D754` disarmed it, on evidence that the box was asleep or
  // powered off at 04:30 on all three measured nights, and deferred the automated shape to publish.
  // Disarming it closed a job that never ran — but it also left the underlying gap exactly where it
  // was: a perf regression introduced on a branch is invisible until somebody remembers to measure,
  // and "remembers to" is the failure mode this whole file exists to replace.
  //
  // CI is not the place, and that is a measurement result rather than a preference (`D750`): the
  // bands are ratios of tflw to k6 *within one run*, calibrated on this box under a whole-box lease,
  // and a shared GitHub runner produces neither the exclusivity nor the neighbours those ratios were
  // taken against. What CI keeps is the static half it can actually answer — `verify:perf-parity`
  // and `verify:perf-baseline` already run in `acceptance-check`, guarding that the ladder's
  // declaration stays coherent. The split is not new here; this phase is the other half of it
  // finally having a home.
  //
  // `localOnly` is a real marker read by the partition guard below, not a comment. A phase that is
  // in no group is normally an error in this file — the check exists because a silently-ungrouped
  // phase is a phase CI never runs while four legs go green. This one is ungrouped **on purpose**,
  // so it says so in a field the guard can see; the guard then asserts the converse, that a
  // `localOnly` phase never appears in a group. Exempting it silently would have disabled the
  // invariant for every future phase that forgot.
  //
  // **It takes the ordinary fresh restart, and the first draft of this phase did not.** That draft
  // stopped the stack instead, reasoning that the ladder drives its own managed echo target on :4099
  // and that an idle apiV2 is only background load on a measurement whose lease class declares
  // `requires: quiet`. Both halves of that sentence are true and the conclusion was wrong: **six of
  // the ladder's eight rungs target apiV2** (`checkout-burst`, `dogfood-get-only`,
  // `dogfood-post-uncontended`, `search-read`, `ticket-write`, `generator-saturation-demo`) and only
  // the two `echo-*` rungs use the managed target. Stopping the stack would have failed their
  // pre-flight health check and reddened the phase every time — not subtly, but it would have
  // reddened it for a reason that reads like a perf failure. Caught by running it and reading the
  // per-rung `health` block, which is exactly what that block is for.
  {
    name: 'perf-ladder',
    cmd: 'node scripts/perf-conformance.mjs --profile sweep --in-sweep',
    localOnly: true,
    // perf-conformance exits 3 for "this machine is not the box" (no boxlock.sh, no k6). Rendered
    // as `⊘ skipped`, never as a pass: a contributor sweeping on a laptop must not read a green
    // summary line as evidence the perf gate ran.
    skipCode: 3,
  },
];

// PLAN_CI.md decision 16 (Round 3, 2026-08-03 grill-me): duration-balanced static groups for a
// GitHub Actions matrix (4 legs) — greedy LPT (longest-processing-time-first) bin-packing against
// real per-phase CI timings pulled from run 30802717073 (2026-08-03, post-reorg; see PLAN_CI.md
// Round 3 for the full table). Static, not computed at runtime: re-pack by hand if PHASES' own
// shape changes enough to meaningfully skew a group's total (a phase added/removed), not for a
// few seconds of drift between runs. `--group <name>` runs only that group's phases; with no
// flag, every phase runs, unchanged from before this existed (a plain local `npm run regression`
// never needs to know groups exist).
//
// Names are a readability label for each bin's dominant theme, chosen after the fact — the
// packing itself is duration-driven, not semantic, so don't read a name as a strict partition
// (e.g. `safety` also carries `--tag mixed`, and `core` carries `demo-fail-check`).
//
// M128a adds two short phases. They are placed on the two smallest bins by count rather than by
// measured duration — both are seconds of work dominated by the restart every phase pays anyway —
// so they should be folded into a real re-pack the next time per-phase CI timings are pulled,
// not treated as a considered placement.
//
// M137e adds `vuln-slice-hidden-check` on the same terms and to `security-ui`, one of the two bins
// tied for smallest by count. It is the third phase now placed by hand rather than by measurement,
// which is enough of them that the re-pack above should stop being deferred; it is not done here
// because the timings it needs come from CI and this milestone has no reason to have pulled them.
//
// M154b adds `construct-acceptance` to `tooling` — the fifth hand placement, and the first with no
// bin-count argument available, because all four bins are tied at 9 after `M139-5`. Placed on theme
// instead: `tooling` already carries `ui-admin-check`, so that leg is the one whose runner has paid
// for a browser, and this phase needs one. Its own cost is ~35s of graded work against a stack
// restart every phase pays regardless. Five hand placements is well past the point where the re-pack
// below should still be deferred, and this milestone did not pull the CI timings it needs either.
//
// M139-5 adds `security-acceptance-gate` to `core`, the fourth such placement and on the same terms
// with one measurement behind it: its graded work is ~2s on the box, so what it actually costs a leg
// is the stack restart every phase pays regardless. That makes bin *count* the only proxy worth
// using here, and `core` — 8 phases, the unique smallest — the placement. Four hand-placed phases is
// past the point where the re-pack above should still be deferred.
//
// M154g step 5 adds `input-acceptance` to `core`, the sixth hand placement, and this one is placed on
// *theme against count* rather than on either alone — which is worth saying plainly, because the four
// bins were tied at 9/10/9/9 and count alone would have said `safety` or `security-ui`. It goes to
// `core` because its two nearest neighbours are already there: `secure-local-check` runs the same
// `tflw-acceptance/security/` corpus and `security-acceptance-gate` is literally this script's Tier
// 1/2 sibling, so a red in one is read next to a red in the other. Its own graded work is ~1s
// measured on the box, against a stack restart every phase pays regardless, so what it moves is
// `core` from 9 to 10 — tied with `tooling` rather than exceeding it. The re-pack six placements have
// now deferred still needs CI timings this milestone had no reason to pull.
const PHASE_GROUPS = {
  core: ['full suite', '--tag orderOps', '--tag smoke,catalogOps', 'demo-fail-check', '--tag orgOps', '--tag inventoryOps', 'migrate-check', 'secure-local-check', 'security-acceptance-gate', 'input-acceptance'],
  tooling: ['--tag api', 'watch-check', 'pick-check', 'ui-admin-check', '--tag smoke,orgOps', '--tag smoke', 'report-overflow-check', 'security-target-check', 'sarif-acceptance', 'construct-acceptance'],
  safety: ['--tag identityOps', '--tag mixed', '--tag smoke,orderOps', '--tag adminOps', '--tag catalogOps', 'safety-flags-check', 'check-diagnostics', 'artifact-contract', 'safety-redaction-check'],
  'security-ui': ['--tag smoke,identityOps', 'cli-flags-check', '--tag smoke,adminOps', '--tag ui', 'webv2-admin-check', '--tag smoke,inventoryOps', 'logging-check', 'mtls-rejection', 'vuln-slice-hidden-check'],
};

// The groups are a hand-maintained partition of PHASES, and CI runs *only* the groups (a 4-leg
// matrix, PLAN_CI.md decision 16). So a phase that belongs to no group is not a phase that runs
// unbalanced — it is a phase that never runs in CI at all, silently, while four legs go green.
// That is this pair of repos' oldest recurring failure shape (see testFlow's M127: an empty shard
// is an error, not an early return), and the cheapest place to make it impossible is here, where
// the two lists are both in scope.
//
// `M154h`/`D761` adds the one exception this check has ever had, and adds it as a *declaration*
// rather than as a hole. `perf-ladder` is ungrouped deliberately — CI genuinely cannot judge it
// (`D750`) — so it carries `localOnly: true`, the guard skips it from the ungrouped complaint by
// name, and asserts the converse instead: a `localOnly` phase that turns up inside a group means
// somebody has quietly put a four-minute box measurement onto a GitHub runner, which fails in a way
// that reads as a perf regression. The invariant stays live for every other phase, which is the
// whole reason to spell the exception out instead of loosening the rule.
{
  const grouped = Object.values(PHASE_GROUPS).flat();
  const names = PHASES.map((p) => p.name);
  const localOnly = PHASES.filter((p) => p.localOnly).map((p) => p.name);
  const ungrouped = names.filter((n) => !grouped.includes(n) && !localOnly.includes(n));
  const unknown = grouped.filter((n) => !names.includes(n));
  const duplicated = grouped.filter((n, i) => grouped.indexOf(n) !== i);
  const smuggled = localOnly.filter((n) => grouped.includes(n));
  const problems = [
    ...ungrouped.map((n) => `phase "${n}" is in no group — CI would never run it`),
    ...smuggled.map((n) => `phase "${n}" is localOnly but sits in a group — CI would run it`),
    ...unknown.map((n) => `group entry "${n}" matches no phase`),
    ...duplicated.map((n) => `phase "${n}" appears in more than one group`),
  ];
  if (problems.length > 0) {
    console.error('PHASE_GROUPS is not a partition of PHASES:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

const groupFlagIndex = process.argv.indexOf('--group');
const groupArg = groupFlagIndex === -1 ? null : process.argv[groupFlagIndex + 1];
if (groupArg !== null && !PHASE_GROUPS[groupArg]) {
  console.error(`Unknown --group "${groupArg}" — expected one of: ${Object.keys(PHASE_GROUPS).join(', ')}`);
  process.exit(1);
}
const activePhases = groupArg === null ? PHASES : PHASES.filter((p) => PHASE_GROUPS[groupArg].includes(p.name));

rmSync(ARCHIVE_DIR, { recursive: true, force: true });

const results = [];
for (const phase of activePhases) {
  const envNote = phase.stackEnv
    ? ` — ${Object.entries(phase.stackEnv).map(([k, v]) => `${k}=${v}`).join(' ')}`
    : '';
  console.log(`\n=== ${phase.name} (fresh restart${envNote}) ===\n`);
  restart(phase.stackEnv);
  const cmd = phase.cmd ?? [TFLW, 'run', '--no-color', ...CI_VERBOSE, ...phase.args].join(' ');
  try {
    run(cmd);
    results.push({ ...phase, ok: true });
  } catch (error) {
    // `skipCode` (`D761`): a phase may declare one exit code that means "not applicable on this
    // machine" — distinct from both green and red, because the only other options are lying about
    // coverage or reddening a sweep for a machine the phase was never meant to grade.
    const skipped = phase.skipCode !== undefined && error?.status === phase.skipCode;
    results.push({ ...phase, ok: skipped, skipped });
  } finally {
    archivePhaseReport(phase.name);
  }
}

console.log('\n=== regression summary ===');
for (const r of results) console.log(`${r.skipped ? '⊘' : r.ok ? '✓' : '✗'} ${r.name}${r.skipped ? ' (skipped — not the box)' : ''}`);

const skippedPhases = results.filter((r) => r.skipped);
if (skippedPhases.length > 0) {
  console.log(`\n${skippedPhases.length} phase(s) skipped: ${skippedPhases.map((r) => r.name).join(', ')}.`);
  console.log('A skipped phase measured NOTHING. It is not a pass, and the sweep below does not count it as one.');
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.log(`\n${failed.length}/${results.length} phase(s) failed.`);
  process.exit(1);
}

// `M143d` — a phase that PASSED must not leave a failing `junit.xml` behind.
//
// This is the contradiction that cost twenty minutes of log-reading to attribute: `M141b`'s
// negative control (`D536`) ends `watch-check` with a deliberately-failing run, so the phase printed
// `✓ watch-check` while its archived report held one failed testcase. The leg went green and the
// SEPARATE `merge-reports` job went red, three jobs and one artifact-download away from the thing
// that caused it. `archivePhaseReport` already has the answer — a by-design failure is renamed to
// `junit-by-design.xml` — so this asserts the two agree, and it does it HERE, in the leg that ran
// the phase, where the phase name is still in scope.
//
// It is deliberately one-directional: a phase in JUNIT_EXCLUDED_PHASES that stops failing is not an
// error, because a control can legitimately be rewritten. What must never happen silently is the
// reverse.
const contradictory = passedPhasesWithFailingJunit(results);
if (contradictory.length > 0) {
  for (const { name, failures, path: p } of contradictory) {
    console.log(
      `\n✗ ${name} reported success but its archived report contains ${failures} failing testcase(s).\n` +
        `    ${p}\n` +
        `    Either the phase is wrong to call itself green, or the failure is BY DESIGN — a negative\n` +
        `    control, a demo fixture — and the phase belongs in JUNIT_EXCLUDED_PHASES in\n` +
        `    scripts/lib/regression-shared.mjs, which renames the file so no JUnit reporter reads it.\n` +
        `    Left alone, this passes here and fails in the merge-reports job instead, where nothing\n` +
        `    names the phase that caused it.`,
    );
  }
  process.exit(1);
}

const measured = results.length - skippedPhases.length;
console.log(`\nAll ${measured} phases passed${skippedPhases.length > 0 ? ` (${skippedPhases.length} skipped)` : ''}.`);
