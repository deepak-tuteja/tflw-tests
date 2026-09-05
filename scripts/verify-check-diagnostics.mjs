#!/usr/bin/env node
// M49 (PLAN_WEBV2_M45.md): `tests/.checkonly/` only covered 3 of 22 assigned TF0xx codes
// (TF011/TF014/TF028), manually run per its own header comments, never wired into
// regression.mjs/CI. Durable, repeatable proof for every remaining code: 13 via static fixtures
// under `tests/.checkonly/` (checked against this project's own real `tflw.config`, same as the
// 3 pre-existing fixtures), and 7 config-dialect codes (TF020-025, TF029) via inline fixture
// content written to a throwaway scratch directory and checked there — `tflw.config` is always
// read from `cwd` (`packages/cli/src/cli.ts`), so the config dialect's own diagnostics can't be
// triggered against a real file living inside this project without breaking the whole suite.
// TF004-009/TF017-019 are reserved, not assigned — nothing to dogfood there (SPEC.md).
//
// DRIFT CLOSED (M86, 2026-08-04). The closing line used to read "All N assigned TF0xx codes" where
// N was `Object.keys(...).length` — this script's own fixture count, not the count of codes tflw
// assigns. The two were equal at M49 and stopped being equal the next time tflw added a code, and
// the sentence went on claiming completeness for a year of milestones: at the point this was
// noticed, `TF033`/`TF034`/`TF035` had no fixture at all and the line still said "all". A
// completeness claim with nothing enforcing it is not a strong claim that might be stale — it is
// already stale, and it is exactly the class of defect the launch review was opened to find.
//
// The repair is `assignedCodes()` below: the expected list is read out of the *installed tflw
// bundle's* own §17 manifest, so adding a code to tflw and not dogfooding it here fails this
// script. tflw's `packages/lang/test/diagnosticsCoverage.test.ts` (M86) is the other half — it
// keeps that manifest in step with `Codes`, which is what makes it worth reading.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// IF YOU ARE READING THIS BECAUSE THIS SCRIPT WENT RED, RUN THIS FIRST (M132b, D351):
//
//     npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs
//
// **AND ITS SIBLING, SINCE `M137a`:** `node scripts/verify-artifact-contract.mjs`, off the same
// re-pack. These two repositories are joined at *two* seams — code assignment, which this script
// guards, and the shape of a consumed artifact, which that one does. `M136c-01` is what the second
// one cost while it had no gate: `M136a` renamed a field in `findings.sarif`, no code moved, this
// script was green and correct throughout, and eleven SARIF entries failed in an acceptance phase.
//
// `refresh-tflw` re-packs from the local tflw checkout, so this answers in seconds, on your own
// machine, with no Docker, no regression sweep, no PR and no merge. **This is the whole of the fix
// for `M130-07`, and it is a discipline rather than machinery** — nothing forces anyone to run it,
// and that is a decision (D350) rather than an omission.
//
// WHAT THE RED USUALLY MEANS. A tflw milestone that assigns a diagnostic code is a **breaking
// change for this repository's `main`, with no additive path**: the moment it merges, CI here
// re-packs tflw from its live `main` (`.github/workflows/ci.yml`, checkout deliberately unpinned —
// pinning a `ref:` would kill the dogfooding exactly when it matters, and has been rejected twice)
// and this script demands a fixture that does not exist yet. So the tflw PR and the companion PR
// here are one unit of work: **a tflw milestone that adds a code is not done until both have
// merged**, and they merge back-to-back to keep the red window as short as a human can make it.
//
// The window is **not bounded by anything automatic**, and that is deliberate. Nothing in this
// repository re-runs when tflw merges; a cron would make the red *more* visible without making it
// shorter, which is the opposite of the pain. Observed three times (`M129`, `M130b2`, and once on
// `M131`'s PR in the reverse direction), each time correctly, each time with the repair already
// known. When `main` goes red here the gate is **telling the truth** — a code really did ship and
// the fixture really is missing — so an unbounded window means a true statement goes unobserved,
// not that a bug goes unfixed.
//
// **Reopen `M130-07` if a code reaches tflw `main` with no fixture here and the red is found by
// someone other than whoever caused it.** That is the condition under which discipline has
// demonstrably stopped working and machinery becomes worth its cost.
// ─────────────────────────────────────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTflw } from './lib/tflw-bin.mjs';
import { readSpec } from './lib/tflw-provenance.mjs';
import { REFERENCE_ROSTERS, expandReferenceRosters, GRADERS } from './lib/constructs.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// The *installed* tflw by default, which is the question this proof exists to answer: does the tflw
// a user would get have a fixture for every code it assigns. `TFLW_CLI_ENTRY` asks the other
// question — does a build in hand — and it is the same D9 split `check-acceptance.mjs`'s `TFLW_BIN`
// makes, for the same reason. It matters more here than it looks: this script reads tflw's
// diagnostic manifest out of the bundle, so against a stale vendored tarball it grades the fixtures
// against a *stale list of codes* and can fail in either direction — missing fixtures for codes
// that shipped, or "stale" fixtures for codes that had not yet. `M128-04` is the driver that made
// that easy to hit; this is how you check a branch build without reinstalling one.
const CLI_ENTRY = resolveTflw('released', { label: 'verify-check-diagnostics' }).entry;

let violations = 0;

/**
 * The codes this run actually saw a real `tflw check` emit.
 *
 * `M154g` step 1 (`D752`). `CONSTRUCTS.md`'s `C59` rosters the whole diagnostic family by citing
 * this script, and a citation is only worth what the cited run did — not what its fixture tables
 * declare. So the set is recorded at the point a fixture's output is matched, and the check at the
 * bottom of this file compares it against the family as `tflw spec --json` reports it, both ways.
 *
 * Deliberately narrower than `dogfooded` below, which is keyed off the fixture tables. A fixture
 * whose code stopped firing fails its own assertion first — but if one were ever added and never
 * asserted, `dogfooded` would count it and this would not.
 */
const witnessed = new Set();
const reports = (code, out) => {
  const fired = out.includes(`[${code}]`);
  if (fired) witnessed.add(code);
  return fired;
};

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

// Both streams, whatever the exit code — and `spawnSync` rather than `execFileSync` for exactly
// that reason. `execFileSync` hands back **stdout only** on success and reaches stderr solely via
// the thrown error, so the old success branch here could return `''` and be right: every shipped
// diagnostic was error-severity, so anything that reported also exited 2 and took the catch.
//
// tflw M97e/D147 ended that. `TF043`'s run tier is a **warning**, written to stderr at exit 0, so
// a fixture whose only diagnostic is a warning would have had its output discarded and been
// reported here as not reporting its code — a loud failure, but one blaming tflw for a defect in
// this script. The guard is supposed to be the thing that can be trusted when the two disagree.
function runCheck(args, opts = {}) {
  const { stdout, stderr } = spawnSync('node', [CLI_ENTRY, 'check', '--no-color', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  return (stdout ?? '') + (stderr ?? '');
}

// --- test-dialect codes: real fixtures under tests/.checkonly/, checked against the real project
// tflw.config (same as the 3 pre-existing fixtures, now also wired in here rather than only ever
// run by hand per their own header comments) ------------------------------------------------------
const FILE_FIXTURES = {
  TF001: 'stray-character.tflw',
  TF002: 'unterminated-string.tflw',
  TF003: 'bad-indent.tflw',
  TF010: 'missing-path.tflw',
  TF011: 'bad-keyword.tflw',
  TF012: 'unknown-method.tflw',
  TF013: 'unknown-subject.tflw',
  TF014: 'unknown-matcher.tflw',
  TF015: 'empty-block-body.tflw',
  TF016: 'bare-toplevel-step.tflw',
  TF026: 'unknown-api-service.tflw',
  TF027: 'unknown-table-column.tflw',
  TF028: 'bad-session.tflw',
  TF030: 'unbound-variable.tflw',
  TF031: 'request-and-response-combined.tflw',
  TF032: 'malformed-upload-type.tflw',
  TF033: 'workload-without-threshold.tflw',
  TF034: 'threshold-unknown-label.tflw',
  TF035: 'duplicate-action.tflw',
  TF037: 'unknown-call.tflw',
  TF038: 'call-wrong-arity.tflw',
  TF039: 'assert-before-any-request.tflw',
  TF040: 'call-in-dead-position.tflw',
  TF041: 'value-subject-misplaced.tflw',
  TF042: 'matcher-subject-mismatch.tflw',
  TF043: 'missing-referenced-file.tflw',
  TF044: 'action-call-cycle.tflw',
  TF045: 'unbalanced-bracket.tflw',
  TF046: 'empty-tag.tflw',
  TF047: 'unknown-escape.tflw',
  TF048: 'tab-indent.tflw',
  TF049: 'hidden-character.tflw',
  TF050: 'confusable-word.tflw',
  TF052: 'mask-without-snapshot.tflw',
  TF053: 'capture-uncapturable-subject.tflw',
  TF054: 'invalid-literal-operand.tflw',
  // TF055's second operand is this project's own `defaults timeout wait 5s`, so unlike TF051 and
  // TF057/TF058 below it needs no scratch config — the real config already withholds the budget.
  TF055: 'hold-exceeds-wait-timeout.tflw',
  TF056: 'data-table-extension.tflw',
  TF059: 'service-with-absolute-url.tflw',
  // TF060 is NOT here — it moved to its own scratch-config pair below when the root config gained
  // an `authorized target` (M130c). See that block for why.
  //
  // The pentest arc's Tier 2 (tflw `M130b2`). Three codes, not the two the plan budgeted, because a
  // diagnostic code is one *repair* rather than one topic: TF062 says move the credential into a
  // `session`, TF063 says give the assertion an identity to subtract, TF064 says poll first and
  // assert after. The fourth constraint in that family — the same assertion inside a
  // workload-bearing test — is `TF033`, filed with its neighbours for exactly the same reason, and
  // is why `workload-without-threshold.tflw` above is still TF033's only fixture.
  //
  // These three were written a milestone before they could be wired: this script grades against the
  // *installed* bundle in both directions, so a row here for an unshipped code fails as loudly as a
  // missing one. Wiring them is what proves the tflw the vendored tarball resolves really does
  // assign them (M130c).
  TF062: 'authz-step-names-own-credential.tflw',
  TF063: 'authz-assertion-without-owner.tflw',
  TF064: 'authz-assertion-in-wait-until.tflw',
  //
  // The pentest arc's Tier 3 (tflw `M134a`). **One** code, where Tier 2 needed three, and the
  // shortfall is the tier's defining property rather than an oversight: Tier 3 changes no identity,
  // so there is no owner to require and no credential to be confused by — `TF062`/`TF063` have no
  // analogue, and the fixture asserts those two silences deliberately. `TF064` is not re-listed
  // because it was **widened**, not duplicated: the same code and the same repair now cover both
  // scans inside `wait until api`, since what makes that construct wrong is a property of the
  // polling loop that does not know which scan is asking.
  //
  // Coupled with its tflw half and red until that half merges (D350/D382) — a row for an unshipped
  // code fails here exactly as loudly as a missing one, which is the whole reason this file is worth
  // reading. The local pre-flight is `npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs`
  // (D351), which trips the gate in seconds rather than in a CI cycle.
  TF067: 'input-assertion-no-mutable-input.tflw',
  //
  // The pentest arc's Tier 4 (tflw `M137c`). **Two** codes for one construct, and the pair is worth
  // reading together: `TF068` is *this crawl has no surface* and `TF070` is *this step does not belong
  // in a crawl* — one repair each, which is the bar a code has to clear.
  //
  // Neither is a scan rule. They are the first two codes in this arc about a **declaration** rather
  // than about an assertion's setting, because Tier 4 added a top-level construct where the three
  // tiers before it added only matchers. That is also why the two fixtures spend most of their prose
  // on what must stay *silent*: a new construct reaches none of the checker's existing passes by
  // default, so every pass wired to it and every pass deliberately left unwired is a decision, and
  // `TF039`'s silence inside a crawl body is the one that would look like an oversight.
  //
  // **`TF069` is skipped permanently** (tflw D456/D463) — a withdrawn code, not a missing one, and the
  // completeness check below is what would otherwise read the gap as a hole.
  //
  // Coupled with its tflw half and red until that half merges (D350/D382), exactly as Tier 3's row
  // above was. The local pre-flight is `npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs`
  // (D351) — which is how this row's absence was caught before tflw's PR merged rather than after.
  TF068: 'crawl-without-seed.tflw',
  TF070: 'crawl-body-not-an-assertion.tflw',
  //
  // The ledger drawdown's Order 6 (tflw `M147c`). **Two codes here and one in `CONFIG_FIXTURES`
  // below**, and the split across the two blocks is the finding rather than an accident of filing:
  // all three refuse something the language had accepted in silence, and which dialect each lands in
  // is decided by where the mistake can be written, not by what kind of mistake it is.
  //
  // `TF072` is a `with each` header declaring one column name twice — the second wins, every cell
  // under the first is discarded, and before this the table simply ran with half its data. `TF073`
  // is an `import` naming a file that is present and does not parse: `tflw check <entry>` printed
  // *no problems found* about a program that cannot start, because the resolver parsed the imported
  // file, kept the verdict and discarded the diagnostics. Neither is a new rule the runtime learnt —
  // both are rules the runtime already enforced, moved to the place that can say them first.
  //
  // **`TF073` is the one row here whose fixture needs a second file**, `unparseable-import-target.tflw`,
  // which carries no row of its own: checked directly it reports an ordinary lexer error, and which
  // one is not what this proves. `rows.txt` sits beside `data-table-extension.tflw` for the same
  // reason.
  //
  // Coupled with its tflw half and red until that half merges (D350/D382), as Tier 3's and Tier 4's
  // rows above were. The local pre-flight is
  // `npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs` (D351).
  TF072: 'duplicate-table-column.tflw',
  TF073: 'unparseable-import.tflw',
  // The drawdown's Order 6, Cluster 3 (tflw `M147e`, `A3-14`, D643) — and the only code in this file
  // whose fixture proves the checker **returns at all**.
  //
  // Every other entry here proves a diagnostic says the right thing. This one proves there is a
  // diagnostic: before `M147e`, `tflw check` on a file whose expression nests deeply enough printed
  // `error: Maximum call stack size exceeded`, exit 2, with no filename, no line and no caret —
  // `parseSource` throwing a raw V8 `RangeError` out of a function documented at `index.ts:122` as
  // never throwing for a syntax error. Not a bad message but none, which is why the fixture matters
  // more than its wording: a suite that only ever checks well-formed files cannot tell a parser that
  // refuses from one that dies.
  //
  // 300 unary minuses, against a limit of 256 — deliberately just past it rather than at the 30 000
  // the row was filed from, because what is being proved is the *refusal*, and a file large enough to
  // exhaust a stack proves the same thing while making this fixture slow to read and slow to lex.
  // Unary minus is the only production in the grammar that recurses per token; `+ - * /` chains
  // iterate, `within` nesting is bounded by the lexer, and a JSON body goes through `JSON.parse`, so
  // this one shape covers the whole surface.
  //
  // Coupled with its tflw half and red until that half merges (D350/D382). The local pre-flight is
  // `npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs` (D351).
  TF075: 'expression-nested-too-deeply.tflw',
  // tflw `M156` (`D774`-`D780`): an `env(NAME)` no `require env` line declares. The row that
  // produced it, `M154g-11`, was filed as *correct the sentence* — the manifest promised a missing
  // secret "fails at check time" and `tflw check` said nothing — and `D774` reversed that
  // disposition on evidence rather than preference: the guarantee was deliverable, statically, with
  // no secret and no socket, so the absent half was the implementation.
  //
  // **This repository is where that was demonstrated.** Against the unfixed tree the new code
  // reported **60** violations here — 50 under bare discovery and 10 more in `tests/.env-specific/`
  // — every one of them a real hole in the suite's own declaration, in three files that had been
  // green for a year. The fix was `tflw.config`'s three `require env` lines, not a suppression.
  //
  // The fixture carries a **declared** reference beside the undeclared one. Without it the file
  // cannot tell a rule that reads the declared set from one that flags `env()` on sight, and that
  // is precisely the mistake this code would be if it were written wrong.
  //
  // Coupled with its tflw half and red until that half merges (D350/D382). The local pre-flight is
  // `npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs` (D351).
  TF077: 'undeclared-env-ref.tflw',
};

for (const [code, file] of Object.entries(FILE_FIXTURES)) {
  const out = runCheck([`tests/.checkonly/${file}`]);
  ok(`${code}: tests/.checkonly/${file} reports ${code}`, reports(code, out), out.trim().split('\n')[0]);
}

// --- config-dialect codes: inline fixture content, own scratch tflw.config per case -------------
const CONFIG_FIXTURES = {
  TF020: 'env local default\n  api "http://localhost:4001"\n  headr "Accept" is "application/json"\n',
  TF021: 'env local default\n  api "http://localhost:4001"\n\ntest "not allowed here"\n  api GET /health\n',
  TF022: 'workers 3\n\nenv local default\n  api "http://localhost:4001"\n',
  TF023: 'defaults\n  timeout step 5x\n\nenv local default\n  api "http://localhost:4001"\n',
  TF024: 'env local default\n  api "http://localhost:4001"\n\nenv other default\n  api "http://localhost:4002"\n',
  TF025: 'defaults\n  web "http://localhost:8090"\n\nenv local default\n  api "http://localhost:4001"\n',
  TF029:
    'env local default\n  api "http://localhost:4001"\n\nsession admin\n  api POST /auth/login body { email: "a@a.test", password: "x" }\n\nsession admin\n  api POST /auth/login body { email: "a@a.test", password: "x" }\n',
  // tflw M85 (review cluster C1 / `A4-10`): the active env's own base URL against its own
  // `allow hosts`. It has to be the *default* env here — the check is env-scoped, and this script
  // runs `tflw check` with no `--env`.
  TF036: 'env local default\n  api "http://localhost:4001"\n  allow hosts "example.com"\n',
  // tflw M128b (pentest arc Tier 1 / D291): a declaration that authorizes nothing. A wildcard is
  // rejected here even though `allow hosts` accepts one, and the two only look alike: `allow hosts`
  // bounds where ordinary traffic may go, and a bound expressed as a pattern is still a bound. This
  // one is an author affirming they are permitted to scan a named host — and nobody is authorized
  // to scan `*.example.com`, because a pattern records a claim whose scope its author could not
  // have known when they wrote it. (The sibling case, a target with no scheme, reports the same
  // code one step earlier: `TF060` compares origins, and a bare hostname has none.)
  TF061:
    'defaults\n  authorized target "https://*.example.com" reason "staging sweep"\n\nenv local default\n  api "http://localhost:4001"\n',
  // tflw `M147c` (review `A2-09`, D631): a setting whose value cannot configure anything. `workers 0`
  // is a worker pool that can run no test, and it parsed cleanly until this milestone — as did
  // `viewport 0 0` and the fractional `retry 2.5`.
  //
  // **The zeros this does NOT refuse are the reason the rule has a per-slot floor**, and a fixture
  // that read `workers 0 is refused, so zero is refused` would be describing a language this is not:
  // `retry 0` and `timeout expect 0s` are meaningful settings — *do not re-run*, *evaluate once and
  // do not poll* — and both stay legal. The question is never whether the number is zero; it is
  // whether the setting can still keep its promise at that value.
  //
  // Config dialect because `workers` is a config directive, while `TF072` and `TF073` above are test
  // dialect. One code, both dialects: the parser raises this for `retry` and `up to` inside a test
  // file too, and the checker raises it for a typo under the reserved `tflw://` scheme (`M118-01`).
  //
  // The `defaults` block is not decoration here: `workers` is a `defaults` directive, and written at
  // the top level it reports `TF022` instead — which is `TF022`'s own fixture above, three lines of
  // this object apart. Writing this one the short way produced exactly that, and the gate said so.
  TF071: 'defaults\n  workers 0\n\nenv local default\n  api "http://localhost:4001"\n',
  // tflw `M147d` (review `M137f-02`, D642): `session <name> for env <a>[, <b>...]` naming an env
  // this config does not declare. The clause itself is the milestone's widening — a `session` was
  // top level and therefore had to resolve under *every* env, which forced one origin's service
  // name, its `allow hosts` entry and its `authorized target` affirmation into env blocks that never
  // touch it.
  //
  // **Why a typo in that clause is worth a code of its own rather than tolerated silence, which is
  // the whole reason this fixture exists.** A `session` is a member of every Tier 2 authorization
  // probe set (`D306`), so a `for env` clause naming an env that is not there narrows the session to
  // *nothing* — and the effect is that an identity disappears from every `has no authorization
  // violations` assertion in the suite while every one of them stays green. That is `M130-01`'s
  // shape, reachable by misspelling one word, and it is exactly the failure this repo exists to
  // catch: silent narrowing looks identical to a passing run from the outside.
  //
  // Config dialect because `for env` can only be written in `tflw.config` — both halves of the
  // question, the clause and the `env` blocks it names, are in that one file, so the check needs no
  // resolved env and fires in the editor on the config alone. The sibling mistake, an unknown
  // *session* name in a test file, is `TF028` and was **widened** by the same milestone rather than
  // split: "no such session" and "declared, but not for this env" are one mistake with two repairs.
  //
  // Coupled with its tflw half and red until that half merges (D350/D382). The local pre-flight is
  // `npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs` (D351).
  TF074:
    'env local default\n  api "http://localhost:4001"\n\nsession admin for env locl\n  api POST /auth/login body { email: "a@a.test", password: "x" }\n',
  // tflw `M147f` (review `M147-07`, D647): `header "X" is "Y" for <service>` naming a service no
  // `env` declares. **`TF074`'s twin, one row later and in a clause that had already shipped** —
  // which is the part worth recording here rather than only in the tflw ledger. Order 6 spent a code
  // on silent narrowing in `session … for env`, and then found the identical shape sitting
  // unchecked in `header … for <service>`, where it had been since the clause was written.
  //
  // The narrowing is total: the interpreter sets a header only where the clause is absent or matches
  // the step's own service, so a name matching nothing attaches the header to **no request at all**.
  // `tflw check` prints no problems, exit 0, the run is green, and every request goes out missing a
  // header the config plainly says it carries. From the outside that is indistinguishable from a
  // passing run — the same reason this repo exists, and the same reason `TF074` got a code.
  //
  // Config dialect, and the fixture needs the service name to be a *near miss* of nothing in
  // particular: `shp` against a declared `shop` also exercises the `did you mean` branch, which is
  // the whole value of the diagnostic in the case that actually happens.
  //
  // **The rule is the union of every service the file declares, not the active env's**, so a
  // one-env fixture proves less than it looks like it does. That is deliberate on tflw's side — a
  // `header` in `defaults` may legitimately scope to a service one env declares — and the
  // under-approximation it accepts is pinned by tflw's own tests, not here.
  //
  // Coupled with its tflw half and red until that half merges (D350/D382). The local pre-flight is
  // `npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs` (D351).
  TF076: 'env local default\n  api shop "http://localhost:4001"\n  header "X-Tenant" is "acme" for shp\n',
  // tflw `M156` (`D778`): `"{env(NAME)}"` inside a string literal. This language has `{var}`
  // interpolation and it has `env(NAME)` as a value, and the braced spelling looks exactly like both
  // while being neither — it is eight-plus characters of literal text, and it ships over the wire.
  //
  // **Config dialect deliberately, because that is where the real instance was.** This repository's
  // own `tests/.checkonly/config-directives/require.config` was written this way, and its header
  // comment said the variable "reaches a header" for as long as the fixture existed. It reached
  // nothing. `"Bearer {env(TOKEN)}"` is the natural spelling of the commonest thing anyone does with
  // a secret and it fails as a 401 with nothing anywhere pointing at the cause.
  //
  // **A warning, not an error, and `D775` is why**: it asks whether the author meant the text, which
  // is a question about intent rather than an observation about a name nothing declares. `TF077`
  // structurally cannot see this case — a braced `env()` is not a reference the parser produces —
  // which is the whole reason the two codes shipped together rather than one.
  //
  // Note what this fixture reaches that tflw's own probe harness does not: `M156-01` records that
  // the harness's `wrap: 'config'` branch composes a hand-listed subset of the passes `tflw check`
  // runs, and did not run either pass that emits this code. This runs the real binary, so it is the
  // stronger of the two gates on exactly this row.
  //
  // Coupled with its tflw half and red until that half merges (D350/D382). The local pre-flight is
  // `npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs` (D351).
  TF078:
    'defaults\n  header "X-Token" is "Bearer {env(C156_TOKEN)}"\n\nenv local default\n  api "http://localhost:4001"\n',
  // tflw `M165` (`D829`-`D832`): a config key declared **twice in one block**. The second assigns
  // and the first reaches nothing — `resolveConfig` walks a block's entries in order and the last
  // write wins — so before this the config plainly said one thing and the run did another, with no
  // diagnostic anywhere.
  //
  // **The fixture is `workers` and it has to be a single-valued key, which is the whole content of
  // the rule.** Four keys are exempt because they accumulate rather than override — `header`,
  // `allow hosts`, `authorized target` and `redact` — and a fixture doubling any of those would be
  // asserting the opposite of what it looks like it asserts. tflw grades that exemption set against
  // `resolveConfig`'s own behaviour (`config-key-arity.test.ts`) rather than against a written list,
  // and this row deliberately does not restate the set: it proves the code exists and fires, and the
  // membership question is measured where the resolver is.
  //
  // **Both declarations are inside `defaults`, and that is not tidiness.** `D832` makes the rule
  // per-block: a key set in `defaults` and again in an `env` is the reason both blocks exist, so it
  // stays silent and the env wins. Written across the two blocks this fixture would report nothing
  // at all — the same last-one-assigns mechanism, one line apart in `resolve.ts`, and opposite in
  // the rule.
  //
  // Coupled with its tflw half and red until that half merges (D350/D382). The local pre-flight is
  // `npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs` (D351).
  TF081: 'defaults\n  workers 2\n  workers 4\n\nenv local default\n  api "http://localhost:4001"\n',
};

const scratchDir = mkdtempSync(path.join(tmpdir(), 'tflw-check-config-'));
try {
  for (const [code, content] of Object.entries(CONFIG_FIXTURES)) {
    writeFileSync(path.join(scratchDir, 'tflw.config'), content);
    const out = runCheck([], { cwd: scratchDir });
    ok(`${code}: a scratch tflw.config reports ${code}`, reports(code, out), out.trim().split('\n')[0]);
  }
} finally {
  rmSync(scratchDir, { recursive: true, force: true });
}

// --- TF051: the two-operand code — a real fixture file, checked against generated configs -------
//
// Every other test-dialect fixture above is checked against this project's own `tflw.config`.
// `TF051` cannot be, and that is a property of the rule rather than an inconvenience: it fires on
// the gap between what a step needs and what the active env declares, and every env in this
// project declares an `api` base while the two that run browser steps declare `web` too. That is
// the correct state for a suite that works — so no file dropped into `tests/.checkonly/` can
// trigger it, and hijacking one of the api-only envs (`unreachableHost`, `mtlsSidecar`) with
// `--env` would cover only the `web` half while coupling this proof to an env that exists for an
// unrelated reason.
//
// So the fixture stays a real, readable file in the repo — it is dogfood, not a string in a script
// — and gets copied into a scratch directory that supplies the second operand. Each config
// withholds one half, and the *same unmodified file* reports a different diagnostic under each,
// which is the demonstration that the rule reads the config rather than the source text.
//
// The counts are asserted, not just the presence of the code. Under a config with no `web` exactly
// one site fires; under a config with no default `api` exactly two do — the un-prefixed request
// line and the relative `matches schema … from` source. Presence alone would stay green if the
// named-service control (`api orders GET /health`) started reporting, and that control is the one
// with real blast radius: it is the shape this project's own `env local` uses for `api inventory`.
const ENV_FIXTURE_FILE = 'missing-base-url.tflw';
const ENV_FIXTURES = [
  {
    label: 'an env that declares `api` but no `web`',
    config: 'env local default\n  api "http://localhost:4001"\n  api orders "http://localhost:5000"\n',
    expect: '`open` needs a `web` base URL',
    forbid: 'needs an `api` base URL',
    count: 1,
  },
  {
    label: 'an env that declares `web` but no default `api`',
    config: 'env local default\n  web "http://localhost:8090"\n  api orders "http://localhost:5000"\n',
    expect: 'needs an `api` base URL',
    forbid: 'needs a `web` base URL',
    count: 2,
  },
];

const envDir = mkdtempSync(path.join(tmpdir(), 'tflw-check-env-'));
try {
  copyFileSync(path.join(ROOT, 'tests', '.checkonly', ENV_FIXTURE_FILE), path.join(envDir, ENV_FIXTURE_FILE));
  // The fixture's last test names `./schema.json` relative to itself. Present so the run under test
  // is a clean `TF051` rather than `TF051` plus a `TF043` warning about a file this proof never
  // meant to be missing.
  writeFileSync(path.join(envDir, 'schema.json'), '{}\n');
  for (const { label, config, expect, forbid, count } of ENV_FIXTURES) {
    writeFileSync(path.join(envDir, 'tflw.config'), config);
    const out = runCheck([ENV_FIXTURE_FILE], { cwd: envDir });
    const fired = out.split('[TF051]').length - 1;
    ok(`TF051: ${ENV_FIXTURE_FILE} under ${label} reports TF051`, reports('TF051', out), out.trim().split('\n')[0]);
    ok(`TF051: ${label} names the missing half`, out.includes(expect), `expected to see "${expect}"`);
    ok(`TF051: ${label} stays silent on the half it declares`, !out.includes(forbid), `unexpectedly saw "${forbid}"`);
    ok(`TF051: ${label} fires at exactly ${count} site(s)`, fired === count, `fired at ${fired} — a control regressed, or a site was added`);
  }
} finally {
  rmSync(envDir, { recursive: true, force: true });
}

// --- TF057/TF058: one file, two configs, and the absence of a declaration is the operand --------
//
// The same shape as `TF051` above and for the same reason — the rule has two operands and one of
// them is the config — but with an inversion worth stating outright, because it is the only place
// in the language where *not* declaring something means more enforcement rather than less. An
// absolute URL under an env that declares `allow hosts` is merely unportable (`TF057`, "`--env`
// will not move it"). The identical line under an env that declares none is a request the run will
// **refuse to send** (`TF058`), because writing an absolute URL is what opts a suite into declaring
// where it may reach.
//
// So neither code can be proven against this project's own `tflw.config`: `env local` declares
// `allow hosts "localhost", "127.0.0.1"`, which settles the choice at `TF057` and makes `TF058`
// unreachable from any file dropped into `tests/.checkonly/`. Hijacking `env webv2Admin` — which
// happens to declare no allowlist — would work and is exactly what `TF051`'s header argues against:
// it couples this proof to an env that exists for an unrelated reason, so the day someone adds an
// allowlist to the admin console's env this proof would go quiet rather than red.
//
// Each case forbids the other's message as well as asserting its own, since the failure that
// matters here is not "no diagnostic" but "the *other* diagnostic" — the two are chosen between,
// and a rule that picked wrong would still report something.
const ALLOWLIST_FIXTURE_FILE = 'absolute-url.tflw';
const ALLOWLIST_FIXTURES = [
  {
    label: 'an env that declares an allowlist',
    // `localhost` belongs in this allowlist even though the fixture never asks for it: an env whose
    // own `api` base is not in its own `allow hosts` is `TF036`, an *error*, and the check stops
    // there — so the first draft of this case proved nothing about `TF057` and said so by reporting
    // `TF036` instead. A scratch config that declares an allowlist has to allow its own base.
    config:
      'env local default\n  api "http://localhost:4001"\n  web "http://localhost:8090"\n  allow hosts "localhost", "api.example.com", "example.com"\n',
    code: 'TF057',
    forbid: 'TF058',
  },
  {
    label: 'an env that declares no allowlist',
    config: 'env local default\n  api "http://localhost:4001"\n  web "http://localhost:8090"\n',
    code: 'TF058',
    forbid: 'TF057',
  },
];

const allowDir = mkdtempSync(path.join(tmpdir(), 'tflw-check-allow-'));
try {
  copyFileSync(
    path.join(ROOT, 'tests', '.checkonly', ALLOWLIST_FIXTURE_FILE),
    path.join(allowDir, ALLOWLIST_FIXTURE_FILE),
  );
  for (const { label, config, code, forbid } of ALLOWLIST_FIXTURES) {
    writeFileSync(path.join(allowDir, 'tflw.config'), config);
    const out = runCheck([ALLOWLIST_FIXTURE_FILE], { cwd: allowDir });
    ok(
      `${code}: ${ALLOWLIST_FIXTURE_FILE} under ${label} reports ${code}`,
      reports(code, out),
      out.trim().split('\n')[0],
    );
    ok(
      `${code}: ${label} does not also report ${forbid}`,
      !out.includes(`[${forbid}]`),
      `both codes fired — the rule stopped choosing between them`,
    );
  }
} finally {
  rmSync(allowDir, { recursive: true, force: true });
}

// --- TF060: one file, two configs, and the absence of a declaration is the operand --------------
//
// **This case used to be a plain `FILE_FIXTURES` row, and M130c is what proved it could not stay
// one.** A `.checkonly` fixture is checked from the repo root, so it reads the *root* `tflw.config`
// — and `TF060` fires on the absence of an `authorized target`. That made the proof depend on the
// shared config never declaring one, which is a dependency on an **absence**, invisible at both
// ends: nothing in the fixture said so, and nothing in `tflw.config` said "adding this here breaks
// a proof over there".
//
// It broke exactly that way. `M130c` gave env `local` an `authorized target` so the dogfood suite
// could run `authz-generated.tflw`, and this row went red with `1 file checked, no problems found`
// — the fixture still existed, still parsed, and had quietly stopped demonstrating anything.
//
// This is the shape `TF051`'s and `TF057`/`TF058`'s headers already argue against; `TF060` was the
// one that had not been converted yet. Its own scratch configs make the operand explicit, and the
// conversion buys a case the old form could not express at all: the **positive** direction, where a
// declared target silences the diagnostic. An absence-based proof can only ever assert the absence.
const AUTHZ_TARGET_FIXTURE_FILE = 'security-without-authorized-target.tflw';
const AUTHZ_TARGET_FIXTURES = [
  {
    label: 'an env that declares no `authorized target`',
    config: 'env local default\n  api "http://localhost:4001"\n',
    expect: 'TF060',
  },
  {
    label: 'an env that declares one naming the base',
    config:
      'env local default\n  api "http://localhost:4001"\n  authorized target "http://localhost:4001" reason "self-hosted fixture"\n',
    expect: null,
  },
];

const targetDir = mkdtempSync(path.join(tmpdir(), 'tflw-check-target-'));
try {
  copyFileSync(
    path.join(ROOT, 'tests', '.checkonly', AUTHZ_TARGET_FIXTURE_FILE),
    path.join(targetDir, AUTHZ_TARGET_FIXTURE_FILE),
  );
  for (const { label, config, expect } of AUTHZ_TARGET_FIXTURES) {
    writeFileSync(path.join(targetDir, 'tflw.config'), config);
    const out = runCheck([AUTHZ_TARGET_FIXTURE_FILE], { cwd: targetDir });
    if (expect) {
      ok(
        `${expect}: ${AUTHZ_TARGET_FIXTURE_FILE} under ${label} reports ${expect}`,
        reports(expect, out),
        out.trim().split('\n')[0],
      );
    } else {
      // The half that matters most after M130c: a suite that *has* permission must not be nagged,
      // and this is what would have caught the old row going quiet instead of red.
      ok(
        `TF060: ${AUTHZ_TARGET_FIXTURE_FILE} under ${label} is silent`,
        !out.includes('[TF060]'),
        out.trim().split('\n')[0],
      );
    }
  }
} finally {
  rmSync(targetDir, { recursive: true, force: true });
}

// --- TF065/TF066: one file, one config, and the operand is the COMMAND LINE ---------------------
//
// The same scratch-pair shape as `TF060` directly above, with the one difference that is the whole
// point of the control: here the second operand is not a config at all. D21 §3.2(3) says a public
// target's affirmation must live somewhere a committed `tflw.config` cannot reach, so the three
// cases below share **one** config and differ only in the invocation — which is exactly the
// property under test, stated as the shape of the test rather than as a comment.
//
// Three outcomes, and the middle one is the reason there are two codes rather than one. A missing
// flag is repaired by adding it; a flag naming the wrong origin is repaired by fixing its value.
// One code for both would have made a generated codes-reference row false, which is the defect
// class `M92` spent a milestone on.
//
// `.invalid` is RFC 2606's never-resolves TLD, so nothing here can reach a host even by accident —
// and under tflw's literal, no-DNS classification it is `public` with no lookup, which is what
// makes an offline fixture able to exercise a control about the internet at all.
const PUBLIC_TARGET_FIXTURE_FILE = 'authz-scan-public-target.tflw';
const PUBLIC_TARGET_CONFIG = [
  'env staging default',
  '  api "https://staging.example.invalid/v1"',
  '  allow hosts "staging.example.invalid"',
  // Declared, so `TF060` is satisfied and cannot be what refuses the run. Without this line the
  // third case below would go red for a reason that has nothing to do with the flag, and the
  // evidence would be vacuous.
  '  authorized target "https://staging.example.invalid" reason "fixture target, never resolved"',
  '',
  'session shopper',
  '  api POST /auth/login body { email: "a@example.invalid", password: "x" }',
  '  expect status equals 200',
  '',
].join('\n');
const PUBLIC_TARGET_FIXTURES = [
  {
    label: 'no affirmation on the command line',
    flags: [],
    expect: 'TF065',
    says: '--allow-public-target https://staging.example.invalid',
  },
  {
    label: 'an affirmation naming an origin this run never scans',
    flags: ['--allow-public-target', 'https://other.example.invalid'],
    expect: 'TF066',
    says: 'matches nothing this run would scan',
  },
  {
    label: 'the affirmation this run actually needs',
    flags: ['--allow-public-target', 'https://staging.example.invalid'],
    expect: null,
  },
];

const publicDir = mkdtempSync(path.join(tmpdir(), 'tflw-check-public-'));
try {
  copyFileSync(
    path.join(ROOT, 'tests', '.checkonly', PUBLIC_TARGET_FIXTURE_FILE),
    path.join(publicDir, PUBLIC_TARGET_FIXTURE_FILE),
  );
  writeFileSync(path.join(publicDir, 'tflw.config'), PUBLIC_TARGET_CONFIG);
  for (const { label, flags, expect, says } of PUBLIC_TARGET_FIXTURES) {
    const out = runCheck([...flags, PUBLIC_TARGET_FIXTURE_FILE], { cwd: publicDir });
    if (expect) {
      ok(`${expect}: ${PUBLIC_TARGET_FIXTURE_FILE} with ${label} reports ${expect}`, reports(expect, out), out.trim().split('\n')[0]);
      ok(`${expect}: names the repair`, out.includes(says), `expected to see "${says}"`);
    } else {
      // The half a missing-flag-only proof cannot express: a suite that *has* affirmed the target
      // must not be nagged. This is also the only case that would catch the gate widening to cover
      // origins it should not.
      ok(`TF065/TF066: ${PUBLIC_TARGET_FIXTURE_FILE} with ${label} is silent`, !out.includes('[TF065]') && !out.includes('[TF066]'), out.trim().split('\n')[0]);
    }
    // D341, asserted in every one of the three: the Tier 1 assertion in that file inspects a
    // response the suite already asked for, so no invocation of this flag has anything to say
    // about it. A gate that quietly widened to cover `security violations` would pass every other
    // check in this script.
    ok(`D341: ${label} leaves the security-violations test alone`, !out.includes('security scan against'), out.trim().split('\n')[0]);
  }
} finally {
  rmSync(publicDir, { recursive: true, force: true });
}

// --- completeness: the expected list comes from tflw, not from this file ------------------------

/**
 * Every TF0xx code the *installed* tflw assigns, read out of the shipped bundle's own SPEC §17
 * manifest (`DIAGNOSTICS` in `@tflw/lang`'s `spec-data.ts`, inlined into `dist/cli.cjs` by esbuild
 * — `{ code: "TF001", meaning: …, example: … }`). `code:` followed by a quoted `TF` number is that
 * manifest and nothing else; SPEC prose elsewhere in the bundle mentions codes in running text, not
 * in that shape.
 *
 * Reading a bundle with a regex is the least appealing part of this script, and it is still the
 * right trade: tflw publishes exactly one file with one `bin` entry and no library export, so the
 * alternatives are a new public API existing only for this test (the `runLoad` mistake — a public
 * export with no production caller), or a second hand-maintained list of codes, which is precisely
 * the thing that drifted. If the bundle shape ever changes, this throws loudly by design: fix the
 * pattern, do not delete the guard.
 */
function assignedCodes() {
  const bundle = readFileSync(CLI_ENTRY, 'utf8');
  const codes = new Set([...bundle.matchAll(/\bcode:\s*["'](TF\d{3})["']/g)].map((m) => m[1]));
  if (codes.size === 0) {
    throw new Error(
      `could not read tflw's diagnostic manifest out of ${CLI_ENTRY}. The bundle's shape changed — ` +
        'update the pattern in assignedCodes() (see @tflw/lang spec-data.ts DIAGNOSTICS). Do not ' +
        'drop this check: without it the summary below is a claim about this file, not about tflw.',
    );
  }
  return codes;
}

const dogfooded = new Set([
  ...Object.keys(FILE_FIXTURES),
  ...Object.keys(CONFIG_FIXTURES),
  'TF051',
  ...ALLOWLIST_FIXTURES.map((f) => f.code),
  ...AUTHZ_TARGET_FIXTURES.map((f) => f.expect).filter(Boolean),
  ...PUBLIC_TARGET_FIXTURES.map((f) => f.expect).filter(Boolean),
]);
const assigned = assignedCodes();

/**
 * `M159f` (`D806h`) — the codes no `tflw check` can emit, and where their proof lives instead.
 *
 * Every fixture in this file provokes a code by running the **checker**, and until tflw's `M159`
 * that was the only kind of diagnostic there was. `TF080` fires when an `accept dialog with`'s
 * answer reaches a dialog with nowhere to put it, and `TF079` when an arming no dialog ever
 * consumed outlives its test — neither is decidable before a real page raises a real dialog, so
 * this file's whole method is structurally unable to reach them and no fixture will ever exist.
 *
 * **Which codes those are is read from tflw, not decided here.** `tflw spec --json` publishes
 * `phase: 'check' | 'run'` per diagnostic (tflw `D806d`), derived there from whether the row's
 * evidence is a probe or a runtime test. A hard-coded set in this file would be the wordlist `D659`
 * refuses: the next runtime code would ship and this gate would demand a fixture that cannot be
 * written, or someone would add the code to the set and prove nothing at all.
 *
 * **This gate stays stack-free, so it delegates rather than proves.** Its value is that
 * `npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs` answers in seconds with no
 * Docker (`D351`); requiring a browser here to prove two codes would cost that for all sixty-eight.
 * So a `run` code names the plant that provokes it and the gate that grades it, and this file
 * checks the two halves a static read can check: the plant exists and contains the line that
 * provokes the code, and the grading script names the code. `verify-construct-acceptance.mjs` does
 * the rest, against a real report from a real browser.
 *
 * That is a pointer rather than a proof, and it is the same shape — with the same named weakness —
 * as the `runtime` evidence tflw's own manifest carries for these two rows (`D806a`). What keeps it
 * out of `D722`'s "a gate whose presence is not evidence" is that both halves resolve: a renamed
 * plant, a deleted arming, or a grader that stopped asserting the code each turn this red.
 */
const RUNTIME_FIXTURES = {
  TF079: {
    plant: 'tests/.constructs/dialog-one-shot.tflw',
    // The arming written *behind* the dismissal, which the form's short circuit leaves unconsumed.
    provokes: /^\s*dismiss dialog\s*$\n\s*accept dialog\s*$/m,
    gradedBy: 'scripts/verify-construct-acceptance.mjs',
    as: 'C43 — the leftover arming the ordering block deliberately does not consume',
  },
  TF080: {
    plant: 'tests/.constructs/dialog-one-shot.tflw',
    provokes: /^\s*accept dialog with "/m,
    gradedBy: 'scripts/verify-construct-acceptance.mjs',
    as: 'C2 — `accept dialog with` against a `confirm`, which takes no answer',
  },
};

// One reading of `tflw spec --json`, used by the phase split here and by the roster cross-check
// below. Two calls would be two subprocesses and, worse, two answers that could differ.
const spec = readSpec(CLI_ENTRY);
const phaseByCode = new Map(
  spec.constructs.filter((c) => c.family === 'diagnostic').map((c) => [c.name, c.phase]),
);
const runCodes = [...assigned].filter((code) => phaseByCode.get(code) === 'run').sort();
const checkCodes = [...assigned].filter((code) => phaseByCode.get(code) !== 'run').sort();

// A build that predates `D806d` emits no `phase` at all, and would silently classify every code as
// check-time — which is the answer this gate gave before `M159` and is wrong the moment a runtime
// code exists. Refused rather than defaulted: `M153b-01`'s lesson is that against a stale build this
// gate must not give a confident wrong answer.
ok(
  `the installed tflw publishes a phase per diagnostic (tflw D806d)`,
  [...assigned].every((code) => phaseByCode.get(code) === 'check' || phaseByCode.get(code) === 'run'),
  `${[...assigned].filter((c) => !phaseByCode.has(c) || phaseByCode.get(c) === undefined).sort().join(', ')} carry no \`phase\` in \`tflw spec --json\`.\n` +
    `    Either the build predates tflw's D806d — run \`npm run refresh-tflw\` against a sibling checkout that has it — or the\n` +
    `    manifest stopped emitting the field, which is a contract break this gate must not paper over by assuming 'check'.`,
);

for (const code of runCodes) {
  const entry = RUNTIME_FIXTURES[code];
  ok(
    `${code}: phase \`run\` — delegated to a runtime witness`,
    Boolean(entry),
    `tflw says ${code} is decided at run time and this file has no RUNTIME_FIXTURES entry for it. A code no \`tflw check\` can\n` +
      `    emit cannot have a fixture here; it needs a plant whose report carries the warning, and a line in RUNTIME_FIXTURES\n` +
      `    naming that plant and the gate that grades it.`,
  );
  if (!entry) continue;
  const plantPath = path.join(ROOT, entry.plant);
  const plantSource = existsSync(plantPath) ? readFileSync(plantPath, 'utf8') : null;
  ok(
    `${code}: its plant ${entry.plant} still provokes it`,
    plantSource !== null && entry.provokes.test(plantSource),
    plantSource === null
      ? `${entry.plant} does not exist. The witness for ${code} was moved or deleted; the code is unproven until it is named again.`
      : `${entry.plant} exists and no longer matches ${entry.provokes}. The line that provokes ${code} was edited away, so the\n` +
        `    plant can pass without ever raising it — which is exactly the vacuous state this file exists to refuse.`,
  );
  const graderPath = path.join(ROOT, entry.gradedBy);
  ok(
    `${code}: ${entry.gradedBy} still asserts it`,
    existsSync(graderPath) && readFileSync(graderPath, 'utf8').includes(code),
    `${entry.gradedBy} does not name ${code}. The plant may still raise the warning, and nothing would be reading it —\n` +
      `    a witness nobody grades is the half of this delegation that fails silently.`,
  );
}

// Neither half may be empty. A `runCodes` that came back empty would make every assertion above
// vacuous and this gate would go on reporting completeness for a manifest it had misread.
ok(
  `the phase split is non-empty on both sides`,
  runCodes.length > 0 && checkCodes.length > 0,
  `run: ${runCodes.length}, check: ${checkCodes.length} — one side is empty, so either the manifest changed shape or the read above is wrong.`,
);

const uncovered = checkCodes.filter((code) => !dogfooded.has(code)).sort();
ok(
  `completeness: every check-time TF0xx code the installed tflw assigns has a fixture here`,
  uncovered.length === 0,
  uncovered.length
    ? `no fixture for ${uncovered.join(', ')} — add one under tests/.checkonly/ (test dialect) or CONFIG_FIXTURES (config dialect).\n` +
      `    A tflw milestone that assigns a code is not done until its companion PR here lands: adding the code is a breaking\n` +
      `    change for this repo's main, and there is no additive path. Check before you open either PR with:\n` +
      `        npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs`
    : '',
);

// And a `run` code may not be satisfied by a check fixture. The two proofs are not interchangeable:
// accepting either for either is the design this gate rejected (tflw `D806d`), because it would let
// a check-time rule be proved only by a runtime witness and never say so.
const misfiled = runCodes.filter((code) => dogfooded.has(code)).sort();
ok(
  `no runtime-only code is claimed by a check fixture`,
  misfiled.length === 0,
  `${misfiled.join(', ')} is \`phase: run\` and has a fixture here. Either tflw's manifest is wrong about the phase, or the\n` +
    `    fixture provokes some other code and is mislabelled — both are worth reading before deleting either.`,
);

const stale = [...dogfooded].filter((code) => !assigned.has(code)).sort();
ok(
  `completeness: every fixture here names a code the installed tflw still assigns`,
  stale.length === 0,
  stale.length
    ? `${stale.join(', ')} is dogfooded but is not in the installed tflw's manifest. Either its tflw-side PR has not merged\n` +
      `    yet — merge it, then re-run — or the code was retired, in which case delete the fixture. The first has happened;\n` +
      `    the second never has. To tell them apart locally:\n` +
      `        npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs`
    : '',
);

// --- the roster row that cites this script, checked in both directions (`D752`) -----------------
//
// `CONSTRUCTS.md`'s `C59` rosters tflw's whole diagnostic family — sixty-eight constructs — by
// pointing at this script instead of writing sixty-eight rows (`D751`, `D763`). `D752` is what stops
// that being a promise: the citation is checked from both ends, and against what this run actually
// did rather than against the fixture tables' declarations.
//
// The two failure modes are opposite and both silent. A roster row can go on claiming a construct
// after the proof for it stopped running — `M154f-01` is that exact case, one ledger over. And this
// script can prove a code that no roster row claims, which is the direction that leaves a construct
// counted as unrostered while a gate quietly grades it.
//
// The cross-check is worth more than it looks, because the two sides are read out of the bundle by
// two different means: `assignedCodes()` greps the §17 manifest for `code:` literals, while the
// family below comes from `tflw spec --json`'s emitted construct list. They must agree.
const SELF = 'scripts/verify-check-diagnostics.mjs';
const citingRosters = REFERENCE_ROSTERS.filter((r) => GRADERS[r.grader]?.script === SELF);
ok(
  `${SELF} is cited by a roster row`,
  citingRosters.length > 0,
  `no row in REFERENCE_ROSTERS cites this script, but this script proves or delegates ${assigned.size} constructs — either the row was deleted, ` +
    'in which case the diagnostic family is being graded and counted as unrostered, or the citation moved and nobody ' +
    'told the ledger',
);

const manifestById = new Map(spec.constructs.map((c) => [c.id, c]));
const expansion = expandReferenceRosters(spec.constructs);
for (const roster of citingRosters) {
  // The construct id is opaque by tflw's own contract (`M154a`), so the code comes from the
  // manifest entry's `name` field rather than from splitting the id apart.
  const claimed = (expansion.get(roster.id) ?? []).map((id) => manifestById.get(id)?.name).filter(Boolean);

  // `M159f` (`D806h`) — a `phase: 'run'` code is claimed by `C59` like every other member of the
  // family, and cannot be witnessed here by construction: nothing in this file runs a browser. It is
  // proved by the delegation asserted above, so it is excluded from *this* check rather than from
  // the roster. Excluding it from the roster instead would leave a shipped code counted as
  // unrostered while a gate really does grade it, which is the direction `D752` exists to catch.
  const claimedHere = claimed.filter((code) => phaseByCode.get(code) !== 'run');
  const unproven = claimedHere.filter((code) => !witnessed.has(code)).sort();
  ok(
    `${roster.id}: every construct it rosters by reference was proved by this run`,
    claimedHere.length > 0 && unproven.length === 0,
    claimed.length === 0
      ? `the \`${roster.family}\` family expanded to nothing against this build's manifest — the row covers no construct at all`
      : `${unproven.join(', ')} — rostered by ${roster.id}, and no fixture in this run saw a real \`tflw check\` emit it.\n` +
          `    The roster claims a known answer that nothing here answered. Either the fixture stopped provoking the code\n` +
          `    (it will have failed above too) or the code is proved only by an assertion about silence, which cannot carry\n` +
          `    a roster row on its own.`,
  );

  const unclaimed = [...witnessed].filter((code) => !claimed.includes(code)).sort();
  // Both directions of the phase split, against the roster's own expansion: a `run` code must be in
  // the family (so `C59` still counts it) and must not be in what this run witnessed.
  const runInFamily = runCodes.filter((code) => claimed.includes(code)).sort();
  ok(
    `${roster.id}: the runtime-only codes are inside the family it rosters, and outside what this run proved`,
    runInFamily.length === runCodes.length && runCodes.every((code) => !witnessed.has(code)),
    `run codes ${runCodes.join(', ')}; in the family: ${runInFamily.join(', ') || 'none'}; witnessed here: ${runCodes.filter((c) => witnessed.has(c)).join(', ') || 'none'}.\n` +
      `    A run code missing from the family would be graded by nothing and counted as rostered; one witnessed HERE would mean\n` +
      `    \`tflw check\` emitted a code its own manifest says it cannot.`,
  );
  ok(
    `${roster.id}: every code this run proved is inside the family it rosters`,
    unclaimed.length === 0,
    `${unclaimed.join(', ')} — proved here, and not in \`tflw spec --json\`'s \`${roster.family}\` family.\n` +
      `    The two readings of the bundle disagree: \`assignedCodes()\` greps the §17 manifest, the roster expands the\n` +
      `    emitted construct list. A code in one and not the other means tflw's manifest and its spec output have drifted.`,
  );
}

if (violations > 0) {
  console.error(`\n${violations} check-diagnostic proof violation(s).`);
  process.exit(1);
}
console.log(
  `\n${checkCodes.length} of the ${assigned.size} TF0xx diagnostic codes the installed tflw assigns are dogfooded against a real \`tflw check\`` +
    ` (${Object.keys(FILE_FIXTURES).length} test-dialect fixtures, ${Object.keys(CONFIG_FIXTURES).length} config-dialect,` +
    ` ${ENV_FIXTURE_FILE} against ${ENV_FIXTURES.length} generated configs, ${ALLOWLIST_FIXTURE_FILE} against` +
    ` ${ALLOWLIST_FIXTURES.length} more, and ${AUTHZ_TARGET_FIXTURE_FILE} against ${AUTHZ_TARGET_FIXTURES.length}).` +
    (runCodes.length
      ? `\nThe other ${runCodes.length} — ${runCodes.join(', ')} — are \`phase: run\` in tflw's own manifest and no \`tflw check\` can emit them;` +
        ` each is delegated to a named plant and grader, checked here for existing and left to \`verify-construct-acceptance.mjs\` to prove.`
      : ''),
);
