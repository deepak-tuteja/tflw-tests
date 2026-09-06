// The scripts that grade this repository's two ledgers — **one table, two subsets** (`M163-02`).
//
// ## Why this file exists
//
// `GRADERS` was defined twice, in `lib/plants.mjs` (the vulnerability ledger) and in
// `lib/constructs.mjs` (the construct roster), each carrying `{script, phase, gated}` for its own
// key set. Two of the keys — `security` and `input` — were in both, which made them one fact
// written down twice, and `M163e` found the copy that had gone stale: `M154g` step 5 (`D765`) gated
// Tier 3's grader and updated `constructs.mjs` while `plants.mjs` went on reading
// `input: { phase: null, gated: false }`.
//
// **The copy that went stale was the one with teeth.** `verify-security-acceptance.mjs` reads
// `plants.mjs` for its *"graded only by ungated script(s)"* check, and that check fires only when
// **every** grader on a plant is ungated. Five plants name `input` (`V10`-`V14`) and none names it
// alone, so the false verdict had no subject — the next plant graded solely by Tier 3 would have
// been the first reported as graded by nobody, which is `M137e-01`'s shape said backwards by the
// gate that exists to prevent it. `M163e` corrected the value. It deliberately did not deduplicate,
// and filed `M163-02` instead, because one table fed from the other is a change to both callers and
// to two different key sets.
//
// ## What merging cost, measured rather than argued
//
// The two entries for `security` were not identical. `plants.mjs` carried
// `script: 'scripts/verify-security-acceptance.mjs --gate'` and `constructs.mjs` the bare path.
// Measured before choosing: **`plants.mjs`'s `.script` is read by nothing.** Its three consumers in
// `verify-security-acceptance.mjs` (`:1597`, `:1602`, `:1611`) test key existence, `.gated` and
// `.phase`; `constructs.mjs`'s `.script` is read, and compared against a script's own path
// (`verify-check-diagnostics.mjs:960`, `verify-redaction.mjs`'s `rosterProblems`). So the bare path
// is the reading with consumers and the `--gate` suffix was a copy nothing could contradict — which
// is `D767` inside the table filed for being a duplicate.
//
// ## The property one table buys that two could not
//
// `gradersFor()` refuses a name this table does not define, and `unclaimedGraders()` refuses a
// grader this table defines that neither ledger claims. A grader can therefore no longer be added
// here and quietly grade nothing, and a ledger can no longer name a grader that does not exist —
// `D895`: a hand list that fails loudly on a member it does not know beats a declaration that it
// might be incomplete.

/**
 * Every grading script, keyed by the short name a ledger row uses.
 *
 * `gated` is the field with teeth: a row whose only graders are ungated is graded by nobody on any
 * day nobody was looking (`M137e-01`). `phase` is the `regression.mjs` phase that runs it, or a
 * parenthesised note where the runner is a CI job rather than a phase.
 */
export const ALL_GRADERS = Object.freeze({
  coverage: { script: 'scripts/verify-construct-coverage.mjs', phase: '(acceptance-check job)', gated: true },
  acceptance: { script: 'scripts/verify-construct-acceptance.mjs', phase: 'construct-acceptance', gated: true },
  // `M154f` (`D752`). The security tier is not graded by `verify-construct-acceptance.mjs` and should
  // not be: three gates already grade it, they have graded it for six milestones, and each states its
  // known answers as *data* — `LEDGER`, `DECLINES`, `APPLICABILITY_PROBES` — rather than as prose in a
  // plant row. `D724` folds `VULNS.md` in by reference rather than by duplication; this is the same
  // move on the construct axis, and `D752` is what makes the reference an assertion instead of a claim.
  security: { script: 'scripts/verify-security-acceptance.mjs', phase: 'security-acceptance-gate', gated: true },
  sarif: { script: 'scripts/verify-sarif-acceptance.mjs', phase: 'sarif-acceptance', gated: true },
  hidden: { script: 'scripts/verify-vuln-slice-hidden.mjs', phase: 'vuln-slice-hidden-check', gated: true },
  // `M154g` step 5 (`D765`). Tier 3's grader, and the newest `gated: true` in this table — it was
  // `gated: false` in everything but the field, because the field did not exist and the script ran
  // nowhere. `D764` is what found it: three ratchet entries held themselves back on the sentence
  // *"a Tier 3 assertion costs an order of magnitude more requests than a Tier 2 one (`D380`)"*, and
  // `D380` does not say that — it decides that the ~45 real test files are Tier 3's negative corpus
  // and its **volume measurement**, which is `sweep-input-volume.mjs`'s 240 observed requests and a
  // different script entirely. Measured instead of argued: this grader costs 7 assertions and 80
  // extra requests and finishes in **0.91-1.05 s** on the build box, against **1.70-1.99 s** for
  // `security-acceptance-gate`, the Tier 1/2 phase the sweep has run since `M139-5` — six runs each,
  // two days, two commits. The premise was not merely misattributed, it was inverted.
  //
  // This entry is the one `M163-02` is about: it read `{ phase: null, gated: false }` in the other
  // copy of this table for the whole of `M154g`.
  input: { script: 'scripts/verify-input-acceptance.mjs', phase: 'input-acceptance', gated: true },
  redaction: { script: 'scripts/verify-redaction.mjs', phase: 'safety-redaction-check', gated: true },
  diagnostics: { script: 'scripts/verify-check-diagnostics.mjs', phase: 'check-diagnostics', gated: true },
});

/** The subset a ledger claims, refusing a name this table does not define. */
export function gradersFor(names) {
  const unknown = names.filter((n) => !Object.hasOwn(ALL_GRADERS, n));
  if (unknown.length > 0) {
    throw new Error(
      `lib/graders.mjs defines no grader named ${unknown.map((n) => `\`${n}\``).join(', ')}. ` +
        `Known: ${Object.keys(ALL_GRADERS).join(', ')}. A ledger naming a grader that does not exist ` +
        'would grade its rows by nothing, so this refuses rather than returning a shorter table.',
    );
  }
  return Object.freeze(Object.fromEntries(names.map((n) => [n, ALL_GRADERS[n]])));
}

/** The inverse: a grader defined here and claimed by neither ledger. */
export function unclaimedGraders(...claimed) {
  const named = new Set(claimed.flatMap((g) => Object.keys(g)));
  return Object.keys(ALL_GRADERS).filter((n) => !named.has(n));
}
