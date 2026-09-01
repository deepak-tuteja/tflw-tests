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
// `D842`. So the hand-labelling is exactly the six `assertion` relations below, and the other 201
// are excluded by measurement rather than by judgement — which is the distinction `D842` was
// written to keep and `M164b`'s glyph could not.
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
};

/** Flattened `[{ mutation, plant, covers, why }]`, for callers that want the relation list. */
export const COVER_ROWS = Object.entries(COVERS).flatMap(([mutation, plants]) =>
  Object.entries(plants).map(([plant, v]) => ({ mutation, plant, ...v })),
);
