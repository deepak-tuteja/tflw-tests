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
//   - **`held`** — added by `M176e` for `M168-05`. A real tally with **no** false clause: the plant
//     produced its known answer, every clause it reached held, and it is red only because the rest
//     of its fixture was refused. It cannot be `covers` — nothing went false — but it did not
//     assert nothing either, which is what filing it `refusal` had been claiming. Two rows, both
//     under `require-env-guards-only-the-first-name-on-the-line`.
//
// `read-mutation-matrix.mjs` DERIVES all four from the row's fields and refuses if the stored label
// disagrees, so this vocabulary is a function of the measurement rather than a judgement taken once
// per census. `assertion` and `held` are told apart by `failed`, and whether the fixture was refused
// is a separate `skipped` field — because packing "what did it assert" and "was it refused" into one
// word is precisely how two of this census's relations ended up with nowhere honest to go.
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
// ## `M190`, 2026-09-14 — the re-census, and the table's first whole replacement
//
// `D980`: a census is one directory and a new census is a new one, so this table was re-read
// against a fresh matrix rather than resumed — 286 candidates, 106 plants, 311 kill relations, of
// which **35 `assertion`**. Sixteen rows were added, all for mutations that did not exist or plants
// that did not exist when the rows above were written; the nineteen already here were checked
// against the new `kill-detail.json` field by field and none needed a word changed, which is the
// measurement `D842` wanted from a hand table: it survives a re-census untouched where the
// measurement agrees and is refused where it does not.
//
// Nine of the sixteen cover — the nine `M189b` mutations, each killing the plant whose hand row
// became it — and that moves `D841`'s covering set from 7 to **15** and `D846`'s *covered* bin from
// 7 plants to 15. The seven collateral rows are two shapes and both were already in this file:
// the arrival-count control (`C49`, `C50`, and `C48` under the pool overrun) is `C107`'s "the control
// working rather than the plant covering", and the displaced diagnostic (`C78`, `C79`, `C114`) is
// the paragraph under `C79` above, now with a plant fifteen milestones younger in it. One
// `assertion` relation the census recorded is **not** here because it was retracted before this
// table was read: `C48` under `empty-tag-on-every-tag`, a timing clause gone false under a mutation
// the plant never reaches — the reach control's refusal is what `M190-02` is about.
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
    // grader: `✗ C97  recall 2/4  precision 3/4` (`M164-03`, 2026-09-03)
    //         `✗ C100 recall — and exactly one request arrived when "localhost" was added …`
    //         `✗ C100 precision — the socket counter rose only in the permitted leg (1 -> 1) …`
    C97: {
      covers: true,
      why:
        'the plant\'s own construct and its own claim. `config:key:api` is the base-URL key and this mutation is the '
        + 'base-URL composition, so `D842`\'s question — is the clause that went false this plant\'s claim about this '
        + 'plant\'s construct — is answered by the construct name alone. Three of eight clauses went false and the '
        + 'arithmetic reconciles: `(4-2) + (4-3) = 3`, against exactly three `✗ C97` lines. Both false recall clauses read '
        + 'the arrival server\'s recorded path — `/base/http://127.0.0.1:4507/absolute` and '
        + '`/other/http://127.0.0.1:4507/absolute`, the concatenation written out verbatim — and the false precision clause '
        + 'is the pair of them: the base moved and the wire moved with it, which is the one cell where it must not. '
        + '**Widened after the fact and recorded as such** (`M164-03`): `C97.catches` did not name the absolute case until '
        + 'this row, and the mutation has existed since `M125b1`. `PLAN_M164_03` §6 is the argument — §5.2 forbids choosing '
        + 'a mutation to fit the suite, not correcting a claim toward a property the construct already had. '
        + 'The surviving precision clause is a guard rather than a discriminator and was predicted to hold: it refuses a '
        + 'runtime that fans one step out across every declared service, which no other clause here would notice.',
    },
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
    // `M190`, 2026-09-14: three more plants ran and went red under this lexer break, and all three are the
    // displaced-diagnostic shape rather than `C99`'s destroyed-input shape. Their fixtures carry a `5s`, which
    // now lexes as `5` followed by the name `s`, and `TF001` fires before the diagnostic each plant asserts.
    // grader: `✗ C78 recall — with the world closed, the same bogus call is a TF037 (got: error[TF001]: exponent notation is not supported — this reads as 5 followed by the name s)`
    C78: {
      covers: false,
      why:
        "`C78` is `use` and asserts a `TF037`; it got a `TF001` from the lexer one pass earlier. The same clause went "
        + "false under `require-env-guards-only-the-first-name-on-the-line` for the same reason with a different code, and "
        + "the observation there stands: a plant asserting the presence of a specific diagnostic is falsified by any "
        + "earlier diagnostic. Its other recall clause and both precision clauses held.",
    },
    // grader: `✗ C79 recall — a test that reads a before file binding does not compile (got: error[TF001]: exponent notation is not supported — this reads as 5 followed by the name s)`
    C79: {
      covers: false,
      why:
        "`C79`'s single clause is that a test reading a `before file` binding does not compile *for that reason*, and it "
        + "did not compile for the lexer's. The third time this plant has been red in a census and the third time by "
        + "displacement; it has still never been red for `before`.",
    },
    // grader: `✗ C114 recall — the locator in subject position is judged by the kind rule, and the refusal names the kind (got: error[TF001] …)`
    //         `✗ C114 recall — the diagnostic points at line 13, the subject-position leg`
    C114: {
      covers: false,
      why:
        "`C114` asserts one `TF042` at line 13 and got `TF001` from the `5s` in its fixture. Its precision clauses held "
        + "(2/2) because they assert silence on lines 16 and 18, and a lexer refusal is one diagnostic for the whole file. "
        + "Compare the row under `locator-subject-skips-the-kind-rule`, where the same two recall clauses went false with "
        + "*no diagnostic at all* — that is the construct broken, this is its input.",
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
    // `M190`, 2026-09-14. grader: `✗ C114 recall — … (got: error[TF077]: ADMIN_PW is read here but no require env line declares it)`
    //                             `✗ C114 precision — exactly one diagnostic from the whole file (got 9: TF077 ×9)`
    C114: {
      covers: false,
      why:
        "`C114` (`subject:locator`) did not exist when this mutation's 74-refusal storm was first read; it does now, and "
        + "its fixture reads a second environment variable, so it is in the storm too — nine `TF077`s where it asserts "
        + "one `TF042`. Collateral by the same argument as `C78` and `C79`, and the reason the argument was worth writing "
        + "down: a plant added fifteen milestones later fell into it unchanged.",
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

  // ── `M168-02`, 2026-09-03 ───────────────────────────────────────────────────────────────────
  //
  // Not a new mutation. `absolute-open-target-still-gets-the-web-base-prepended` has been in tflw's
  // registry since `M125b1`; the census measured it on 2026-09-01 and it **survived, killing
  // nothing**, because the only two plants for `config:key:web` both `open "/"` and the mutation
  // changes behaviour for absolute targets alone. What changed here is the roster, not the registry
  // — `C108` gained a third column — and re-measuring it needed `--remeasure`, because a settled
  // verdict is skipped by `settled()` and `--only` narrows the candidates *before* that filter runs.
  //
  // `C108.catches` was **widened at `M168-02`, after this mutation already existed**, which is the
  // one thing about this relation a reader should be told without having to dig for it. The argument
  // for doing it: the boundary of a key — what `web` does *not* govern — is part of what the key
  // means, and `M125b1`'s own source comment says `FU-18` filed two halves, both about the web base.
  // `PLAN_M168` §5.2 forbids choosing the *mutation* to fit the suite; the mutation here predates the
  // claim by ten milestones.
  'absolute-open-target-still-gets-the-web-base-prepended': {
    // grader: `✗ C108 recall — an absolute open target reaches the console while the web base names the storefront`
    //         `✗ C108 precision — the one config line that inverts a bare path's verdict leaves the absolute target's alone`
    C108: {
      covers: true,
      why:
        "`recall 3/4, precision 2/3`, and the four clauses that held are the original diagonal — the mutation deletes "
        + "the `isAbsoluteUrl` early return from `resolveWebUrl` and leaves bare-path composition untouched, so `open \"/\"` "
        + "still resolves against the base under both configs. What went false is the third column and the contrast clause "
        + "built on it, which is `C108.catches` clause three verbatim: *a `web` base prepended to an absolute `open` "
        + "target*. **The direction of the fixture turned out to be load-bearing, and not for the reason it was chosen.** "
        + "It was written against the console's port under the storefront's base because a prepended base is *quiet* "
        + "there — `webV2/nginx.conf`'s `try_files $uri /index.html` serves the composed "
        + "`http://localhost:8090/http://localhost:8091/` as a 200 with the SPA shell, the `FU-18` defect verbatim. The "
        + "measured reason is stronger: the **other** leg passed under the mutation. The admin console redirects an "
        + "unknown path to `/login`, whose heading is the very text that leg asserts, so `http://localhost:8091/http://"
        + "localhost:8091/` renders a page that satisfies it. Both applications swallow a garbage path; only one of them "
        + "swallows it into a page that lacks the answer. A fixture written only in the console-base direction would have "
        + "passed under this mutation and killed nothing.",
    },
  },

  // ── `M189b` / `M190`, 2026-09-14 — the nine runtime mutations, re-censused ────────────────────
  // `M189b` authored nine mutations against the constructs `M189a`'s reading found reached-but-not-
  // asserted, and `M189c` deepened the plants they aim at. `M190` measured them over the whole roster
  // in one census (`D981`): 9 of 9 killed, 12 `assertion` relations, of which nine cover and three are
  // collateral — all three the same shape, an iteration-count overrun falsifying another plant's
  // arrival-count *control*. Every `covers: true` here is the first time its plant has been covered.
  'shared-iteration-pool-runs-one-too-many': {
    // grader: `✗ C3 recall — --workers 1: /shared received exactly 60 request(s) (got 61) — counted by the server, not by tflw`
    //         `✗ C3 recall — --workers 4: /shared received exactly 60 request(s) (got 64)`
    //         `✗ C3 recall — the counts are identical at --workers 1 and --workers 4 — the "independent of --workers" half of the contract`
    C3: {
      covers: true,
      why:
        "`C3` is `step:run` and its known answer is two numbers counted by the server: `/shared` receives exactly 60, at "
        + "`--workers 1` and at `--workers 4` alike. It got 61 and 64 — one surplus per shard that received a VU, which "
        + "is the mutation's `what` to the digit — and the independence clause went false with them. The two per-user "
        + "clauses held (that spelling is the entry one line down), and all four precision clauses held: nothing landed "
        + "off the two declared paths. The first mutation in either census to make `C3` red by assertion; it had been "
        + "refusal-only through `M164` and `M168`.",
    },
    // grader: `✗ C48 recall — by default every iteration tears down, the failing ones included: 9 marker(s), 7 expected`
    //         `✗ C48 recall — --teardown on-success tears down the passing iterations only: 5 marker(s), 4 expected`
    C48: {
      covers: false,
      why:
        "`C48` is `teardown`, and teardown did what it should after every iteration that ran — there were simply more "
        + "of them. 9 markers against 7 is the default rule applied to two extra iterations; 5 against 4 is `on-success` "
        + "applied to one extra passing one. The grader's own message names the inverted rule's answer as 3, and 5 is not "
        + "3: the plant discriminated correctly over a wrong denominator. Collateral, and the cleanest kind — the "
        + "mutated construct is one the fixture consumes, not the one it watches.",
    },
    // grader: `✗ C49 precision — both tests really ran: 18 request(s) reached /slow (16 expected, 8 iterations each)`
    C49: {
      covers: false,
      why:
        "all three of `C49`'s recall clauses held — the satisfied threshold passed, the breaching one failed, and it "
        + "failed with every assertion green — so the verdict still came from the threshold. What went false is the "
        + "control that both tests really ran: 18 arrivals where 8 + 8 were expected, one surplus per test. Collateral.",
    },
    // grader: `✗ C50 precision — both tests issued their full 12 iterations (/paced 13, /unpaced 13) — pacing slowed them, it did not drop them`
    C50: {
      covers: false,
      why:
        "the same control clause as `C49`'s, in `pause`'s plant: 13 and 13 where 12 and 12 were expected. Its recall "
        + "clauses — that pacing stretched the paced test's wall time and not the unpaced one's — all held. Collateral, "
        + "and the third plant this one mutation reached through an arrival count.",
    },
  },
  'per-user-iterations-run-one-too-many': {
    // grader: `✗ C3 recall — --workers 1: /per-user received exactly 60 request(s) (got 65)`
    //         `✗ C3 recall — --workers 4: /per-user received exactly 60 request(s) (got 65)`
    C3: {
      covers: true,
      why:
        "the other spelling: `run 12 iterations per user across 5 users` landed (12 + 1) × 5 = 65 at both worker "
        + "counts, the `what`'s arithmetic exactly, while the shared-pool clauses held at 60. Worth one sentence: the "
        + "independence clause *held* here (65 = 65), because a per-VU overrun is the same size in every shard — so of "
        + "`C3`'s three kinds of clause, only the exact count can see this mutation, and it did. The sibling wrote `C3` "
        + "with both spellings for exactly this reason (`M189c`), and the pair of rows is the evidence that the two "
        + "branches are graded separately.",
    },
  },
  'teardown-on-success-tears-down-the-failures-instead': {
    // grader: `✗ C48 recall — --teardown on-success tears down the passing iterations only: 3 marker(s), 4 expected — the inverted rule answers 3, the default 7`
    C48: {
      covers: true,
      why:
        "one clause false and it is the one the mutation is about: under `on-success` the run left 3 markers, and 3 is "
        + "the number the grader's message had computed in advance for the inverted rule. The default clause held at 7 "
        + "(`always` is untouched), the `never` clause held, and the marker count is read off the server. This kill exists "
        + "because `M189c` made the passing and failing iteration counts *differ* (4 against 3) — the mutation's own `what` "
        + "records that the earlier `teardown.tflw` counted the same number of markers under either rule. `C48`'s first "
        + "cover; it had been collateral once and refusal-only otherwise.",
    },
  },
  'defaults-merged-for-the-default-env-only': {
    // grader: `✗ C93 recall — at run time, under --env two — the env that is NOT the default — both arrivals carried the defaults header (got: {"/base/alpha":[null],"/base/beta":[null]})`
    C93: {
      covers: true,
      why:
        "`C93` is the `defaults` directive. Its four `tflw check` legs held — the checker has its own merge and the "
        + "mutation leaves it alone — and the one run-time leg went false: under `--env two`, neither arrival carried the "
        + "header the shared block declares. That leg is the one `M189c` added, for the reason the mutation's `what` "
        + "states: four check legs cannot see a runtime merge. The first cover of a plant whose construct is a config "
        + "directive read at run time rather than at check time.",
    },
  },
  'a-lone-exclude-line-is-ignored': {
    // grader: `✗ C96 recall — discovery reports 1 file with the exclude line (got 2: 2 files checked, no problems found.)`
    C96: {
      covers: true,
      why:
        "`C96` is `exclude`, and its discovery half went false — two files checked where the single `exclude` line "
        + "should have left one — while the explicit-path half held, exactly the split the `what` predicts (an explicit "
        + "file argument runs either way). The mutation is an off-by-one on the *number of lines*, which is why it is "
        + "visible to a plant whose config has one `exclude` and would be invisible to one with two; every config in the "
        + "sibling writes one.",
    },
  },
  'scoped-header-loses-its-scope': {
    // grader: `✗ C98 precision — the scoped header is absent from the two arrivals it does not name, so scoping narrows rather than decorates`
    C98: {
      covers: true,
      why:
        "`C98` is the `header` key. All three recall clauses held — every header arrived where it should — and the "
        + "precision clause asking whether the scoped one is *absent* from the two services it does not name went false. "
        + "That clause is the difference between scoping that narrows and scoping that decorates, which is the "
        + "mutation's `what` verbatim, and it is the clause `M189c` added: a plant that asks only \"is it there?\" stays "
        + "green under this.",
    },
  },
  'workers-key-pinned-to-one': {
    // grader: `✗ C101 recall — at workers 2 it is 2 and both were released as a pair — one digit, over an unchanged corpus (got: {"peakWaiting":1,"gatePaired":0,"gateAlone":2,…})`
    C101: {
      covers: true,
      why:
        "`C101` is the `workers` key and reads the rendezvous watermark off the wire: at `workers 2` both files should "
        + "arrive at the gate together. `gatePaired 0, gateAlone 2` is the answer the `what` says the mutation gives — "
        + "\"alone\" — and the `workers 1` clause held, since resolving to 1 is what that leg asks for. One digit in a "
        + "config, and the plant is the only thing in either repository that would notice, because `--workers` on the "
        + "command line still works.",
    },
  },
  'report-key-ignored': {
    // grader: `✗ C102 recall — all four artifacts were written under artifacts/custom, a nested directory the run created (got: none)`
    //         `✗ C102 precision — report/ was not written at all under the custom key, so the artifacts moved rather than being copied`
    C102: {
      covers: true,
      why:
        "`C102` is the `report` key. Both halves of its known answer went false together: nothing under the configured "
        + "directory, and `report/` written after all — the artifacts did not move. The other recall and precision "
        + "clauses held (the `--report` flag still moves them, which the `what` says is why an operator reading the flag's "
        + "documentation would not notice the key). Cover, and the precision clause is what makes it one: a plant that "
        + "only looked in `artifacts/custom` would have gone red without saying where the files went.",
    },
  },
  'locator-subject-skips-the-kind-rule': {
    // grader: `✗ C114 recall — the locator in subject position is judged by the kind rule, and the refusal names the kind (got: no diagnostic at all)`
    //         `✗ C114 recall — the diagnostic points at line 13, the subject-position leg`
    //         `✗ C114 precision — exactly one diagnostic from the whole file … (got 0: none)`
    C114: {
      covers: true,
      why:
        "`C114` is `subject:locator`, and the mutation exempts exactly that subject kind from the matcher-compatibility "
        + "rule. Its first leg went silent — *no diagnostic at all* where a `TF042` naming the kind is asserted — and the "
        + "count clause went false with it (0, not 1), while the precision clause that lines 16 and 18 stay silent held, "
        + "because they stay silent under the mutation too. That is the `what`'s last sentence measured: one leg goes "
        + "quiet and the other two were always quiet, which is the row's whole reason for having three. The first cover "
        + "of a checker-rule plant in either census; the roster's other diagnostic plants have only ever been displaced.",
    },
  },
};

/** Flattened `[{ mutation, plant, covers, why }]`, for callers that want the relation list. */
export const COVER_ROWS = Object.entries(COVERS).flatMap(([mutation, plants]) =>
  Object.entries(plants).map(([plant, v]) => ({ mutation, plant, ...v })),
);
