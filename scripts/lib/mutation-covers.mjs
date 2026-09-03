// The hand-authored half of the kill matrix. `M164c`, testFlow `PLAN_M164_ROSTER_VACUITY.md`
// (`D842`, `D849`, `D850`).
//
// ## Why only six rows
//
// `D842` says the matrix carries two relations: *kills*, measured by `M164b`, and *covers*,
// asserted by a person one line of reasoning at a time. The census produced **207 kill relations**,
// which reads like 207 judgements. It is six, and the reduction is measured rather than argued.
//
// `M164c` re-ran the ten killing mutations keeping the acceptance grader's own per-plant page
// (`kill-detail.json`), and that page distinguishes two things the census's red glyph had merged:
//
//   - **`refusal`** — `recall n/a  precision n/a  (skipped: no report)`. The mutated build refused
//     the plant's fixture at check time, so `tflw run` produced no report and the plant asserted
//     **nothing**. 195 of 207.
//   - **`no-assertions`** — an empty tally with no skip reason, which the acceptance gate itself
//     fails on (`M154f-03`'s second loop). Six more, all workload plants, and the same story: no
//     known answer was produced.
//   - **`assertion`** — a real tally with a false clause in it. The plant ran, produced its known
//     answer, and the answer was wrong. **Six of 207.**
//
// A plant that asserted nothing cannot have been *covered* by anything, under any reading of
// `D842`. So the hand-labelling is exactly the `assertion` relations below, and the rest are
// excluded by measurement rather than by judgement — which is the distinction `D842` was written to
// keep and `M164b`'s glyph could not.
//
// ## `M168`, 2026-09-03 — the second batch, and why the ratio moved so far
//
// `D851` named one reopening condition: *if tflw's registry gains mutations for the constructs
// §12.5 lists as unmutated, the census is worth re-running over those*. tflw's `M168` authored five
// and the census was resumed over exactly them, so the paragraph above now describes the first
// batch rather than the table. Measured: **85 new relations, 11 of them `assertion`** — against six
// in 207. The ratio is not an improvement in the roster and nothing here should be read as one. It
// is what aiming a mutation at a plant's `catches` instead of at a construct's syntax does to the
// numerator, which is `M168` §8.1's rule and is the only variable that changed.
//
// Five of the eleven cover. They are the first evidence that `C95`, `C103`, `C104` and `C105`
// discriminate at all — four plants that had never been red in a census — and `C103` is covered
// twice, by two mutations that fail two different halves of one known answer. The other six are
// collateral, and two of them are the sharpest in either batch: see `C78` and `C79` below, where a
// mutation meant to weaken a precondition quietly turned out to make a *checker* refuse 74 configs
// out loud.
//
// ## What `covers` means here
//
// A relation is `covers: true` when the mutation breaks **the construct the plant is named for**,
// and the clause that went false is the plant's own claim about that construct. It is `false` when
// the plant's assertion was falsified by a break somewhere else — a different construct whose
// output the fixture happens to consume. That second case is not the shared-corpus-file collateral
// `D842` had in mind; it is sharper and worse, because the plant ran, asserted, and went red for a
// reason that has nothing to do with what it watches. `C100` below is the clearest instance in the
// whole census.
//
// Every row carries the failing clause text as the grader printed it, so the reasoning can be
// checked against what was measured rather than against a paraphrase.

/**
 * `mutation -> plant -> { covers, why }`. Keys must exactly match an `assertion`-kind relation in
 * `kill-detail.json`; `read-mutation-matrix.mjs` refuses if one is missing or extra, so this table
 * cannot silently drift from the measurement it annotates (`D767`).
 */
export const COVERS = {
  'session-scope-never-narrows': {
    // grader: `✗ C94 recall — and a TF028 under the env it does not (got: 1 file checked, no problems found.)`
    C94: {
      covers: true,
      why:
        "the mutation replaces the scope filter with `true`, so every session resolves in every env — which is the first "
        + "failure `C94.catches` names, word for word (\"a `for env` clause parsed and ignored (every session resolving "
        + "everywhere)\"). The plant asserted a `TF028` under the env the session is not scoped to and got a clean check. "
        + "This is the one cell in the census where a mutation's `what` and a plant's `catches` describe the same defect.",
    },
  },
  'session-scope-drops-the-unscoped': {
    // grader: `✗ C94 precision — the unscoped sibling resolves in that same env, so what was refused is the clause and not the session table`
    C94: {
      covers: true,
      why:
        "the mirror of the row above: `envs === null` stops meaning *every env* and starts meaning *no env*, so a session "
        + "written without a scope clause resolves nowhere. `C94`'s recall half stayed green — the scoped session still "
        + "refused — and its **precision** half went red, which is the half whose job is to prove the refusal was about the "
        + "clause rather than about the session table being broken. The plant discriminated in the direction it was built to.",
    },
    // grader: `✗ C92 precision — env two checks a file cleanly, so the TF026 above is about the named service and not about that env being unusable`
    C92: {
      covers: false,
      why:
        "`C92` is the `env` directive; this mutation is about the `session … for env` clause. Its precision clause tripped "
        + "because `env two` stopped checking cleanly — the plant correctly refusing to attribute a red to its own subject. "
        + "A negative control firing on a neighbour's break is the control working, not the plant covering the mutation.",
    },
    // grader: C80 never ran — refusal, so it is not in this table at all
  },
  'out-of-scope-map-always-empty': {
    // grader: `✗ C94 recall — and a TF028 under the env it does not (got: error[TF028]: unknown session "scoped")`
    C94: {
      covers: true,
      why:
        "scoping still works and the record of *why* a session is out of scope is dropped, so `TF028` fires with the generic "
        + "`unknown session` text instead of naming the scope clause. `C94.catches` does not spell out the message, but the "
        + "plant's known answer does — it asserts the refusal quotes the clause back — and that clause is what went false. "
        + "The mutation is about the `session … for env` diagnostic; so is the plant.",
    },
  },
  'absolute-api-target-still-gets-the-base-prepended': {
    // grader: `✗ C100 recall — and exactly one request arrived when "localhost" was added …`
    //         `✗ C100 precision — the socket counter rose only in the permitted leg (1 -> 1) …`
    C100: {
      covers: false,
      why:
        "the sharpest false positive in the census. `C100` watches `allow`: a request to a host outside the list must be "
        + "refused **before a socket**. The mutation prepends the base URL to an absolute target, so the fixture's "
        + "out-of-list `https://other/x` becomes a path under the permitted base — the allowlist is handed an allowed host, "
        + "correctly permits it, and nothing escapes. `allow` did not misbehave; the plant's *input* was rewritten out from "
        + "under it. Four of its five clauses went false and not one of them is evidence about `allow`.",
    },
  },
  'number-rule-broadened': {
    // grader: seven false clauses, `✗ C99 config:key:timeout recall 0/5 precision 0/2`
    C99: {
      covers: false,
      why:
        "the lexer stops requiring an exponent after a number, so `10ms` and `5s` lex as something else and every duration "
        + "in the fixture is wrong. `C99` watches whether the `timeout` key is applied and whether a per-step override wins; "
        + "it lost all seven clauses at once, which is the signature of a fixture whose inputs were destroyed rather than of "
        + "a key that stopped being read. `C99` is the only plant in the census that both ran and went red under a lexer "
        + "break, and it is still collateral.",
    },
  },

  // ── `M168`, 2026-09-03 ──────────────────────────────────────────────────────────────────────
  'require-env-guards-only-the-first-name-on-the-line': {
    // grader: `✗ C95 recall — neither variable set: the run is refused naming both (got: error: missing required environment variable: C95_TOKEN)`
    //         `✗ C95 recall — C95_UNUSED is referenced nowhere in that config and is required just as hard — the refusal names it alone`
    //         `✗ C95 recall — tflw check over the identical config now says so — an advisory note naming both variables`
    C95: {
      covers: true,
      why:
        "three of `C95`'s four recall clauses went false and all three are the plant's own subject. Its known answer is "
        + "written in three legs — neither variable set, `C95_TOKEN` set, both set — and the middle leg exists precisely "
        + "because `C95_UNUSED` is referenced nowhere in the config, which is what makes `require` a precondition on the "
        + "environment rather than a check on use sites. Requiring only the first name on the line collapses that leg: the "
        + "refusal names one variable where the plant asserts two, and `tflw check`'s advisory note (`D779`) reports one of "
        + "one over a config declaring two. This is the second cell in the whole census where a mutation's `what` and a "
        + "plant's `catches` describe the same defect, and the first that was authored to be one. Worth one "
        + "more sentence: the property that makes the middle leg interesting is also what kept this fixture out of the "
        + "`TF077` storm the same mutation caused everywhere else (see `C78`) — a variable that is declared and never read "
        + "cannot trip a rule about variables that are read and never declared. `C95` could assert *because* its subject is "
        + "the unreferenced name.",
    },
    // grader: `✗ C78 recall — with the world closed, the same bogus call is a TF037 (got: error[TF077]: ADMIN_PW is read here but no require env line declares it)`
    C78: {
      covers: false,
      why:
        "`C78` is `use`, and what went false in it is a diagnostic code rather than a behaviour. This mutation was written "
        + "to be quiet — `M168` §8's house rule is that the rule stays visibly present and quietly wrong — and it is the "
        + "loudest in the registry, because `requiredEnv` feeds two consumers and only one of them was thought about. The "
        + "runtime gate is the quiet one; the checker's `TF077` rule (*read here but no `require env` line declares it*) is "
        + "not, so dropping the tail of every declaration makes the checker refuse every config that reads a second "
        + "variable. **74 of this mutation's 77 kills are that refusal**, and `C78`'s own `TF037` never got the chance to "
        + "fire. `C100`'s shape one layer earlier: the plant's input was displaced rather than its construct broken.",
    },
    // grader: `✗ C79 recall — a test that reads a before file binding does not compile (got: error[TF077]: ADMIN_PW is read here but no require env line declares it)`
    C79: {
      covers: false,
      why:
        "the same displaced diagnostic as `C78`, in a plant whose subject is `before`. Its single recall clause asserts "
        + "that a test reading a `before file` binding does not compile *for that reason*, and the compile failed for "
        + "another one. A plant asserting the presence of a specific diagnostic is falsified by any earlier diagnostic, "
        + "which makes this class of clause collateral-prone in a way a behavioural assertion is not — worth saying because "
        + "the roster has many of them.",
    },
  },
  'log-level-filters-the-record-instead-of-the-console': {
    // grader: `✗ C103 precision — results.json carries both calls identically under all three configs (got 3 / 4 / 4), so what these keys filter is rendering`
    C103: {
      covers: true,
      why:
        "`recall 3/3, precision 0/1` is the entire finding in two numbers. Every clause about what reaches the *console* "
        + "held — the mutation was built so the console output is byte-identical, because a below-threshold line was "
        + "already being suppressed one layer further out — and the single clause about what reaches `results.json` went "
        + "false, with the record carrying 3 / 4 / 4 entries where the plant asserts it carries them identically. That is "
        + "SPEC §3.8's *never affects whether it is recorded*, it is `C103.catches` clause one word for word, and it is the "
        + "half of the invariant the plant's own known answer calls *the one no ordinary run can observe*. tflw's suite "
        + "could not see this mutation at all until `M168-03` was repaired; this plant saw it on the first run.",
    },
  },
  'log-destination-console-reaches-the-html-report-too': {
    // grader: `✗ C103 recall — log destination console keeps both calls out of report.html and log destination html puts them in (got 2 / 2)`
    C103: {
      covers: true,
      why:
        "the other half of the same plant, and the reason `C103` needed two mutations rather than a `level`/`destination` "
        + "split (`M168-01`). Here the recall clause is the one that fails and the precision clause holds — the mirror of "
        + "the row above — because the record is untouched and it is the *renderer* that stopped honouring the key. "
        + "`C103.catches` clause two, *a `log destination` that reaches one renderer and not the other*, taken in the "
        + "direction that adds rather than drops. One plant, two mutations, two different halves of one known answer, and "
        + "neither mutation is visible in the other's clause.",
    },
  },
  'sequential-tests-batch-with-each-other': {
    // grader: `✗ C104 recall — the same two marked sequential never did (got: {"peakWaiting":2,"gatePaired":2,"gateAlone":0,...})`
    C104: {
      covers: true,
      why:
        "the plant is a server-side overlap watermark and it read **2** where its known answer is 1. `C104` exists because "
        + "`D745` refused to measure tflw's scheduling against a real target, and this is the payoff: nothing in a report "
        + "distinguishes a batch of two from two batches of one, so an assertion about a *report* could not have caught a "
        + "partitioner generalised from *a run of `parallel` tests* to *a run of tests agreeing about concurrency*. "
        + "`C104.catches` clause two, *a `sequential` marker that no longer serializes*. Both files run under `workers 1`, "
        + "so the file-concurrency axis was pinned and the header modifier is the only thing that moved.",
    },
    // grader: `✗ C31 recall — "cart rows are drag-drop reorderable…" is green (got ok=false)`
    C31: {
      covers: false,
      why:
        "`C31` is `drag`, and dragging did not break — its isolation did. The plant's browser scenario reorders cart rows "
        + "and now runs concurrently with the test next to it against one shared target, so it fails on interference. This "
        + "is the collateral `D842` had in mind and the only kind in either batch that is genuinely about sharing a target "
        + "rather than about sharing a corpus file.",
    },
    // grader: `✗ C79 recall — all three tests passed (got 1/3): each read the binding its own before made, one ordinal apart`
    C79: {
      covers: false,
      why:
        "the closest call in this table, and still collateral. `C79`'s clause is literally about `before` — *each test read "
        + "the binding its own `before` made, one ordinal apart* — so it reads at first like the plant discriminating. It "
        + "is not: `before` still made one binding per test, and what broke is that the tests stopped being one at a time, "
        + "so an assertion written on ordinals could not hold. `D850` settles it — the clause that went false must be the "
        + "plant's claim about *its own* construct, and this one is a claim about `before` that only holds while something "
        + "else is true. `C99` under `number-rule-broadened` is the first batch's version of this.",
    },
  },
  'insecure-arms-the-tls-switch-only-on-the-second-acquire': {
    // grader: `✗ C105 recall — with insecure true the request completes against a certificate signed by a CA the container invented at start-up`
    C105: {
      covers: true,
      why:
        "`recall 1/2, precision 2/2`, and the precision half is what makes this the sharpest covering relation in either "
        + "batch. The recall clause that failed is the plant's whole reason for existing — `env secureLocal` has carried "
        + "this key since `M128a` and every run under it passed, so the suite could not tell a key that disabled "
        + "verification from a target whose certificate verified. Both precision clauses **held**: SPEC §3.5's banner is "
        + "still in the CLI summary and the report header. So the plant did not merely go red, it reported the exact "
        + "shape of the defect — verification announced as disabled and not disabled — which is `C105.catches` clause one, "
        + "*an `insecure` key that is parsed and never reaches the agent*.",
    },
    // grader: `✗ C106 recall — the client certificate gets the request past ssl_verify_client on` (and two more)
    C106: {
      covers: false,
      why:
        "`C106` is `cert` and this mutation is about `insecure`, which its fixture needs before the client certificate is "
        + "ever examined. The mTLS listener presents the same invented CA, so a run that no longer disables verification "
        + "dies in the handshake and never reaches `ssl_verify_client`. All three of its clauses went false and not one of "
        + "them is evidence about `cert`.",
    },
    // grader: `✗ C107 precision — the matching pair over the identical fixture passes, so what failed above is the pairing and not the listener`
    C107: {
      covers: false,
      why:
        "`C107`'s recall held and its **precision** clause fired, which is the control working rather than the plant "
        + "covering. That clause is a negative control: it proves a failure above was about the certificate/key *pairing* "
        + "by showing the matching pair passes over the identical fixture. With verification never disabled the matching "
        + "pair does not pass either, so the control correctly refused to attribute. Same reading as `C92` under "
        + "`session-scope-drops-the-unscoped` in the first batch.",
    },
  },
};

/** Flattened `[{ mutation, plant, covers, why }]`, for callers that want the relation list. */
export const COVER_ROWS = Object.entries(COVERS).flatMap(([mutation, plants]) =>
  Object.entries(plants).map(([plant, v]) => ({ mutation, plant, ...v })),
);
