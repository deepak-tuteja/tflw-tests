#!/usr/bin/env node
// `npm run verify:input-acceptance` — D383's measurement (testFlow M134c,
// PLAN_M134_PENTEST_TIER3.md).
//
// The Tier 3 sibling of `verify-security-acceptance.mjs`, and deliberately a **separate file** rather
// than more rows in that one. The two graders read the same report shape and share the same counts
// line, but they grade different packs against different corpora with different opt-in preconditions,
// and M130c already recorded what happens when a row is graded against the wrong pack: a confident
// wrong answer rather than an error. One more reason, specific to this tier: a Tier 3 assertion
// *costs requests*, so this script is the only place in the repo that can state the price, and a
// price buried among twelve hygiene rows is a price nobody reads.
//
// ## The three states, and how each is measured here
//
// | state | how it is measured | exact? |
// | --- | --- | --- |
// | **fires** | the rule id appears in the failure listing | yes |
// | **silent** | the rule was in play at that floor, was counted applicable, and did not appear | yes |
// | **not applicable** | only when D285's no-power-to-fail listing prints, which names every rule *and its unmet precondition* | yes, for the cases a floor or a withheld opt-in isolates |
//
// Tier 3's third state is **better instrumented than Tier 1's**, and that is worth stating because it
// is the one thing this tier got for free. D285's listing here does not merely name the rule, it
// names *why* — and there are two distinct whys, which this script grades apart:
//
//   - `no payload for this rule was sent — its class needs an opt-in this target does not grant`
//     (`probe traversal` / `probe oversized` withheld), and
//   - `N probes carried this invariant and none was answered` (no `probe mutating`, so the writes
//     were never sent).
//
// Collapsing those two into "not applicable" would lose the distinction between *the operator did not
// grant this* and *the target refused to answer*, which is the difference between a coverage gap and
// a finding.
//
// ## What this cannot see
//
// The same limit `verify-security-acceptance.mjs` names: on a **passing** assertion the report gives
// the not-applicable *count* but not the names. So `silent` here is a necessary condition — in play,
// counted applicable, did not fire — plus the ledger's own claim, drawn from `VULNS.md`, that the
// response meets the rule's precondition. `M128-01` is the open row that would make it sufficient.

// ## Where this runs, and the sentence that was wrong for three milestones
//
// **`M154g` step 5 (`D765`): this is the `input-acceptance` phase of `regression.mjs`.** Until then
// it ran in no automated pass at all — not here, not in CI — which is `M137e-01`'s exact shape for
// the third time: a script that states its known answers in full, asserts them, exits non-zero, and
// could fail with nothing noticing. `D493` settled the remedy for Tier 1/2 in `M139-5`; this is that
// remedy, unchanged.
//
// What kept it out was a sentence in this file's own closing paragraph — *"a manual measurement,
// deliberately not in CI"* — carrying no decision behind it, and three `RATCHET` entries in
// `constructs.mjs` that cited `D380` for the cost claim underneath it. **`D380` does not make that
// claim.** It decides that the ~45 real test files are Tier 3's *negative corpus and its volume
// measurement*, which is `sweep-input-volume.mjs`'s subject and its 240 observed requests — a
// different script, against a different corpus, answering a different question. This grader has a
// corpus built for it and prints its own price at the bottom: 7 assertions, 80 extra requests.
//
// **Measured rather than argued** (`M154g-13`, `fedora-box`, full `VULN_MODE=1` stack): this script
// passes in **0.91-1.05 s**, against **1.70-1.99 s** for `security-acceptance-gate` — the Tier 1/2
// phase every sweep has run since `M139-5`. Six runs each, on two days and two commits, because a
// single triple is a reading rather than a measurement: 0.97/0.97/1.05 against 1.99 at `1e3fa9c`,
// and 0.97/0.91/0.92 against 1.84/1.70/1.70 at step 5's own tree. The gate nobody ran was half the
// price of the gate everybody ran, both times. `D764` is the rule that came out of it: a stated condition is audited against
// the decision it cites, never read as provenance.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTflw } from './lib/tflw-bin.mjs';
import { plantsFor as constructPlantsFor } from './lib/constructs.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const corpus = join(repoRoot, 'tflw-acceptance', 'security');

/**
 * The Tier 3 pack, mirrored from `inputRules.ts`. Duplicated on purpose, for the third time in this
 * repo and for the same reason: a grader that imported the thing it grades would agree with it by
 * construction. If tflw re-grades a rule's severity, this file disagreeing is the signal.
 *
 * Listed critical-first to match the severity order, which is also the order D285's listing prints
 * them in — one fewer thing to sort when reading a failure.
 */
const INPUT_PACK = [
  ['sec/path-traversal-read', 'critical'],
  ['sec/error-detail-disclosure', 'serious'],
  ['sec/reflected-input-unescaped', 'moderate'],
  ['sec/oversized-input-accepted', 'minor'],
];
const RANK = { minor: 0, moderate: 1, serious: 2, critical: 3 };
const inPlay = (floor) =>
  INPUT_PACK.filter(([, sev]) => (floor ? RANK[sev] >= RANK[floor] : true)).map(([id]) => id);

/**
 * The known-answer ledger, keyed by the test name in the corpus.
 *
 * Every number below was **read from a live run against the real stack**, not predicted. That matters
 * more here than in the two tiers before it: a Tier 3 assertion's counts depend on the target's
 * deployment (nginx rejects the traversal payload before the app sees it) and on Node's own limits
 * (a 64 KiB query is refused `431` before a handler runs), so a plausible-looking hand-written number
 * would be wrong in ways that look like a rule regression.
 *
 * `counts` is `[rules, applicable, notApplicable, violations]`, verbatim from the counts line.
 * Graded in full rather than just `violations`, because the interesting Tier 3 failures move
 * `applicable` — an opt-in silently dropped from the config turns a firing rule into a
 * not-applicable one, and the violation count alone reads the same as a corpus that never covered it.
 */
const LEDGER = [
  // ── secureLocal (https://localhost:8443), `input.tflw` ───────────────────────────────────────
  //
  // **`silent` on a *positive* row.** `moderate` puts three rules in play; traversal is
  // not-applicable (its opt-in is withheld on this env), reflection fires, and
  // `error-detail-disclosure` is applicable and finds nothing — this route's only error path is the
  // router's. So V10's row demonstrates two states at once, and the disclosure rule's silence here is
  // load-bearing evidence rather than a side effect.
  {
    env: 'secureLocal',
    test: 'sec/reflected-input-unescaped fires on a query echoed into markup (V10)',
    floor: 'moderate',
    fires: ['sec/reflected-input-unescaped'],
    silent: ['sec/error-detail-disclosure'],
    counts: [3, 2, 1, 1],
    mutations: { sites: 1, sent: 6, answered: 6 },
  },
  // `serious` reaches traversal + disclosure. Traversal is withheld on this env, so one rule is
  // applicable and it fires: V12.
  {
    env: 'secureLocal',
    test: 'sec/error-detail-disclosure and sec/oversized-input-accepted fire on one body, at two leaves (V12, V13)',
    floor: 'serious',
    fires: ['sec/error-detail-disclosure'],
    silent: [],
    counts: [2, 1, 1, 1],
    mutations: { sites: 2, sent: 22, answered: 22 },
  },
  // **The two-leaf row, and the only place `violations` exceeds the number of distinct rules.** Three
  // violations from two rules: disclosure once on `text`, oversized twice — once on `text` and once
  // on `title`. `violations: 3` is asserted separately from `fires` precisely because the set of ids
  // cannot express it, and per-site attribution is the thing V13 exists to demonstrate. If this ever
  // reads `2`, one leaf stopped being probed and the id set would not notice.
  {
    env: 'secureLocal',
    test: 'sec/error-detail-disclosure and sec/oversized-input-accepted fire on one body, at two leaves (V12, V13)',
    floor: 'minor',
    fires: ['sec/error-detail-disclosure', 'sec/oversized-input-accepted'],
    silent: [],
    counts: [4, 2, 2, 3],
    violations: 3,
    mutations: { sites: 2, sent: 22, answered: 22 },
  },
  // The negative, and the row carrying **two** silences. `q` reaches Postgres full-text search
  // through a parameterised query — the same journey V12's `text` makes unparameterised — so
  // disclosure is applicable and quiet. Oversized is applicable and quiet for a different reason
  // worth knowing: the 64 KiB value is refused `431` by Node before any handler runs, which is not a
  // 2xx and therefore not an acceptance (D400, measured).
  {
    env: 'secureLocal',
    test: 'the pack stays silent against a correct endpoint that has inputs to mutate',
    floor: null,
    fires: [],
    silent: ['sec/error-detail-disclosure', 'sec/oversized-input-accepted'],
    counts: [4, 2, 2, 0],
    mutations: { sites: 1, sent: 6, answered: 6 },
  },
  // **The row that closes the reflection rule's third state, and the reason it needed its own
  // route.** The negative above cannot do it: that route answers JSON, and `reflectedInputUnescaped`
  // declines a JSON echo by design, so the rule is *not applicable* there — a different cell of the
  // table, already filled. Silence has to be earned against a `text/html` body that escapes.
  //
  // Deliberately identical to `V10`'s row but for the violation count: same floor, same three rules
  // in play, same one withheld, same 6 probes over 1 site. The pair differs in exactly one property
  // of the application — whether it escapes — and the ledger shows that difference and nothing else.
  // If a future change made this route serve JSON, `applicable` would drop to 1 and this row would
  // go red rather than quietly demonstrating not-applicable a second time.
  {
    env: 'secureLocal',
    test: 'sec/reflected-input-unescaped stays silent when the same markup route escapes (V14)',
    floor: 'moderate',
    fires: [],
    silent: ['sec/reflected-input-unescaped', 'sec/error-detail-disclosure'],
    counts: [3, 2, 1, 0],
    mutations: { sites: 1, sent: 6, answered: 6 },
  },
  // ── plaintext (http://localhost:4001), `input-plaintext.tflw` ────────────────────────────────
  //
  // **V11 lives here and not on the sidecar env, and that was measured rather than chosen.** nginx
  // decodes and normalises the request URI, so `..%2f..%2f..%2f..%2fetc%2fpasswd` comes back `400`
  // from the proxy and never reaches the app. Run through the sidecar this assertion reported the
  // rule as applicable, nine probes sent, nine answered and *no violation* — a rule that looks tested
  // and is not. The app is vulnerable and its deployment is not, which is exactly the kind of thing a
  // scan against a single base can never learn.
  {
    env: 'plaintext',
    test: 'sec/path-traversal-read fires when a path segment reaches a file read (V11)',
    floor: 'critical',
    fires: ['sec/path-traversal-read'],
    silent: [],
    counts: [1, 1, 0, 1],
    mutations: { sites: 1, sent: 9, answered: 9 },
  },
  // Traversal's silence, which nothing else in either corpus provides. It needs a route with an
  // identifier-shaped path segment that does *not* read files — `isIdentifierSegment` accepts a UUID,
  // so a real product id is a mutation site while a slug would not be (`TF067`). The id is captured
  // rather than written down: the fixtures re-seed and the UUID changes every time.
  {
    env: 'plaintext',
    test: 'sec/path-traversal-read stays silent on a real id route',
    floor: 'critical',
    fires: [],
    silent: ['sec/path-traversal-read'],
    counts: [1, 1, 0, 0],
    mutations: { sites: 1, sent: 9, answered: 9 },
  },
];

/**
 * Assertions run purely to make D285's not-applicable listing print, which is the only place the
 * report names a rule that stood down. Each is **expected to fail** — that is the mechanism, not a
 * defect (D399). An assertion where nothing applied fails by design, so these states cannot be
 * written as passing corpus tests and have to live here.
 *
 * `expectReason` is the half Tier 1 had no equivalent of: this tier's listing says *why* a rule stood
 * down, and the two reasons mean different things to an operator.
 */
const APPLICABILITY_PROBES = [
  {
    // The withheld-opt-in reason, isolated by a `critical` floor to exactly one rule. Note `5
    // answered`: probes really were sent and answered here — the traversal *class* simply was not
    // among them. "Not applicable" and "not probed" are not the same statement.
    env: 'secureLocal',
    source:
      'test "traversal withheld on the sidecar env"\n' +
      '  api GET /vuln/items/7\n' +
      '  expect response has no critical input handling violations\n',
    expectNotApplicable: ['sec/path-traversal-read'],
    expectReason: /needs an opt-in this target does not grant \(`probe traversal`\)/,
    expectMutations: { sites: 1, sent: 5, answered: 5 },
  },
  {
    // The other reason, and the only probe that names all four rules at once — `minor` is the lowest
    // rank so it narrows nothing. Over plaintext there is no `probe mutating`, so every write-bearing
    // probe is declined unsent: `0 requests sent, 28 not probed`. Oversized is listed for the *first*
    // reason (its opt-in is withheld here) while the other three are listed for the second, which is
    // why one probe can grade both mechanisms.
    env: 'plaintext',
    source:
      'test "nothing mutating is probed over plaintext"\n' +
      '  api POST /vuln/notes body { text: "hello", title: "a note" }\n' +
      '  expect response has no minor input handling violations\n',
    expectNotApplicable: [
      'sec/error-detail-disclosure',
      'sec/reflected-input-unescaped',
      'sec/path-traversal-read',
      'sec/oversized-input-accepted',
    ],
    expectReason: /probes carried this invariant and none was answered/,
    expectMutations: { sites: 2, sent: 0, 'not probed': 28 },
  },
];

/**
 * `TF067`'s runtime twin, and the one case in this file that is graded from **stderr rather than the
 * report** — because there is no report. An assertion with nothing to mutate is a *diagnostic*, not a
 * failing step: tflw exits `2` and writes no `results.json` at all.
 *
 * `M134a` shipped a check-only fixture for `TF067` and its own comment named this run as belonging to
 * the acceptance corpus rather than the checker's. This is that run. It matters because the check-time
 * and run-time paths reach the conclusion by different routes — the checker reasons about the written
 * request, this reasons about the one actually sent — and only the second can see a path whose shape
 * was decided at runtime.
 */
const TF067_PROBE = {
  env: 'plaintext',
  source:
    'test "an endpoint with no mutable input at all"\n' +
    '  api GET /health\n' +
    '  expect response has no input handling violations\n',
  expectCode: 'TF067',
  expectHelp: /its path has no identifier segment, it has no query string, and its body is not a JSON object/,
};

const COUNTS = /(\d+) rules? — (\d+) applicable, (\d+) not applicable, (\d+) violations?/;
const VIOLATION = /^\s*- \[(critical|serious|moderate|minor)\] (sec\/[a-z0-9-]+):/gm;
const STOOD_DOWN = /^\s*- (sec\/[a-z0-9-]+) applies when: (.+)$/gm;

/**
 * **The Tier 3 discriminator**, and the reason this script needs one for the same reason the Tier 2
 * grader did: all three tiers write the same counts line and the same `sec/` id prefix. Tier 2's
 * unique line counts *principals*; this one counts *requests against inputs*. A hygiene assertion has
 * neither.
 *
 * Matches `1 site, 6 requests sent, 6.0 per site — 6 answered` and the declined form
 * `2 sites, 0 requests sent, 0.0 per site — 28 not probed`.
 */
const MUTATIONS = /(\d+) sites?, (\d+) requests? sent, ([\d.]+) per site — ([^\n:)]+)/;

/**
 * `1 site, 6 requests sent, 6.0 per site — 6 answered` →
 * `{ sites: 1, sent: 6, perSite: 6, answered: 6 }`.
 *
 * Returns `null` for a step that is not a Tier 3 assertion, which is how this grader refuses to grade
 * a hygiene or authz step it was pointed at by mistake. Outcome names are taken verbatim rather than
 * mapped to an enum, exactly as Tier 2's `parseProbes` does: the point of duplicating tflw's
 * vocabulary is that a rename shows up as a mismatch, and a mapping table would absorb it.
 */
function parseMutations(detail) {
  const m = MUTATIONS.exec(detail);
  if (!m) return null;
  const out = { sites: Number(m[1]), sent: Number(m[2]), perSite: Number(m[3]) };
  for (const part of m[4].split(',')) {
    const p = /^\s*(\d+) (.+?)\s*$/.exec(part);
    if (p) out[p[2]] = Number(p[1]);
  }
  return out;
}

function inputSteps(report) {
  const out = [];
  for (const t of report.tests ?? []) {
    for (const s of t.steps ?? []) {
      const detail = s.detail ?? '';
      if (!COUNTS.test(detail)) continue;
      out.push({
        test: t.name,
        ok: s.ok,
        detail,
        fired: [...detail.matchAll(VIOLATION)].map((m) => m[2]),
        stoodDown: [...detail.matchAll(STOOD_DOWN)].map((m) => m[1]),
        reasons: Object.fromEntries([...detail.matchAll(STOOD_DOWN)].map((m) => [m[1], m[2]])),
        counts: COUNTS.exec(detail).slice(1).map(Number),
        mutations: parseMutations(detail),
      });
    }
  }
  return out;
}

/**
 * **Never `npx tflw`** (`M115-03`, and `scripts/exec.mjs`'s D9). `npx` resolves this suite's
 * *vendored* `tflw-0.1.0.tgz`, which predates the entire pentest arc — a grader run through it would
 * report that none of the four rules exist and be perfectly happy about it.
 */
const TFLW_BIN = resolveTflw('branch', { label: 'verify-input-acceptance' }).entry;

/**
 * The corpus declares `require env …`, and tflw auto-loads `.env` from the *config* directory — which
 * would mean a second copy of real credentials under `tflw-acceptance/security/`. Copying a secret to
 * make a path shorter is how a secret ends up committed, so this reads the root `.env` once and
 * passes the values through to the child instead.
 */
function rootEnv() {
  let text;
  try {
    text = readFileSync(join(repoRoot, '.env'), 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || line.trimStart().startsWith('#')) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const CHILD_ENV = { ...rootEnv(), ...process.env };

/**
 * `allowNoReport` exists for exactly one caller: the `TF067` probe, whose whole point is that tflw
 * refuses the assertion at runtime and writes no report. Everywhere else a missing report is fatal,
 * because grading one env's corpus against another env's stale `results.json` produces a long list of
 * confident, meaningless mismatches — it did exactly that once.
 */
function runCorpus(env, files, { allowNoReport = false } = {}) {
  rmSync(join(corpus, 'report', 'results.json'), { force: true });
  const args = [TFLW_BIN, 'run', '--env', env, '--no-color', ...files];
  const r = spawnSync(process.execPath, args, {
    cwd: corpus,
    encoding: 'utf8',
    shell: false,
    env: CHILD_ENV,
  });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  let report = null;
  try {
    report = JSON.parse(readFileSync(join(corpus, 'report', 'results.json'), 'utf8'));
  } catch (e) {
    if (!allowNoReport) {
      console.error(`could not read the run report for --env ${env}: ${e.message}`);
      console.error(`  (tflw binary: ${TFLW_BIN})`);
      console.error(output.trimEnd().split('\n').slice(-25).join('\n'));
      process.exit(1);
    }
  }
  return { report, output, status: r.status };
}

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`✗ ${msg}`);
};

/** Which rules this run demonstrated in each state. */
const seen = { fires: new Set(), silent: new Set(), notApplicable: new Set() };
/** The two distinct not-applicable *reasons*, tracked apart — see the header. */
const seenReason = { withheld: new Set(), unanswered: new Set() };
/** Every mutation line this run produced, for the price table at the end. */
const volume = [];
/** Ledger rows that reached their per-row verdict, for `D752` below. Counted rather than assumed:
 *  a corpus that failed to start produces zero and must not be able to answer a construct. */
let ledgerRowsGraded = 0;
/** Whether the `TF067` runtime refusal actually held this run — see `D752` below. */
let tf067Held = false;

// --- the fired set, per case, exact ------------------------------------------

const FILES = {
  secureLocal: ['input.tflw'],
  plaintext: ['input-plaintext.tflw'],
};

for (const env of ['secureLocal', 'plaintext']) {
  const { report } = runCorpus(env, FILES[env]);
  const steps = inputSteps(report);
  const rows = LEDGER.filter((l) => l.env === env);

  const byTest = new Map();
  for (const s of steps) byTest.set(s.test, [...(byTest.get(s.test) ?? []), s]);

  for (const row of rows) {
    const list = byTest.get(row.test);
    if (!list || list.length === 0) {
      fail(`[${env}] no input-handling assertion found for ledger row "${row.test}" — the corpus and the ledger have drifted`);
      continue;
    }
    const step = list.shift();

    // The tier the step actually is, versus the tier the ledger says it is. All three tiers share the
    // counts line, so a row pointing at the wrong test would otherwise be graded happily against the
    // wrong pack. The mutation line is present on exactly one of them.
    if (step.mutations === null) {
      fail(`[${env}] "${row.test}" has no mutation line — this is not a Tier 3 assertion, and grading it against the input pack would be a confident wrong answer`);
      continue;
    }
    volume.push({ env, test: row.test, floor: row.floor, ...step.mutations });

    // Counts first, because they explain every other mismatch below. A dropped opt-in moves
    // `applicable` and leaves `violations` looking plausible.
    const wantCounts = row.counts;
    if (wantCounts && JSON.stringify(wantCounts) !== JSON.stringify(step.counts)) {
      fail(
        `[${env}] "${row.test}" @${row.floor ?? 'no floor'} counts [rules, applicable, notApplicable, violations]\n` +
          `    expected: ${JSON.stringify(wantCounts)}\n    actual:   ${JSON.stringify(step.counts)}`,
      );
      continue;
    }

    // The request price, graded exactly. This is the number that turns into a CI surprise if it only
    // ever lives in a plan, and the number a corpus edit changes without anyone noticing.
    if (row.mutations) {
      const got = step.mutations;
      const want = row.mutations;
      const keys = [...new Set([...Object.keys(want), ...Object.keys(got)])]
        .filter((k) => k !== 'perSite')
        .sort();
      const diff = keys.filter((k) => (want[k] ?? 0) !== (got[k] ?? 0));
      if (diff.length > 0) {
        fail(
          `[${env}] "${row.test}" @${row.floor ?? 'no floor'} mutation volume\n` +
            `    expected: ${JSON.stringify(want)}\n    actual:   ${JSON.stringify(got)}`,
        );
        continue;
      }
    }

    const expected = [...row.fires].sort();
    const actual = [...new Set(step.fired)].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      fail(
        `[${env}] "${row.test}" @${row.floor ?? 'no floor'}\n` +
          `    expected: ${expected.join(', ') || '(none)'}\n    actual:   ${actual.join(', ') || '(none)'}`,
      );
      continue;
    }

    // **The count of violations, separately from the set of rule ids.** V13 fires the same rule at two
    // leaves of one body, so three violations come from two ids. Nothing about the id set can express
    // that, and per-site attribution is the property V13 exists to demonstrate.
    if (row.violations !== undefined && step.counts[3] !== row.violations) {
      fail(`[${env}] "${row.test}" @${row.floor ?? 'no floor'} expected ${row.violations} violation(s) from ${actual.length} rule(s), got ${step.counts[3]} — a leaf stopped being probed`);
      continue;
    }

    for (const id of actual) seen.fires.add(id);

    // Silence, and exactly how strongly it is verified: the rule was in play at this floor, it did not
    // fire, and the applicable count leaves room for it. A necessary condition, not a sufficient one —
    // see the header.
    const [, applicable] = step.counts;
    const claimed = row.silent ?? [];
    const notInPlay = claimed.filter((id) => !inPlay(row.floor).includes(id));
    if (notInPlay.length > 0) {
      fail(`[${env}] "${row.test}" @${row.floor} claims ${notInPlay.join(', ')} stayed silent, but a ${row.floor} floor does not even consider ${notInPlay.length === 1 ? 'it' : 'them'}`);
      continue;
    }
    if (applicable < actual.length + claimed.length) {
      fail(`[${env}] "${row.test}" @${row.floor ?? 'no floor'} claims ${claimed.length} silent + ${actual.length} fired, but only ${applicable} rules were applicable`);
      continue;
    }
    for (const id of claimed) seen.silent.add(id);

    const price = `${step.mutations.sent} request(s) over ${step.mutations.sites} site(s)`;
    ledgerRowsGraded += 1;
    console.log(`✓ [${env}] ${row.test} @${row.floor ?? 'no floor'} — ${step.counts[3]} finding(s) from ${actual.length} rule(s), ${price}, exactly as the ledger says`);
  }
  for (const [test, leftover] of byTest) {
    if (leftover.length > 0) {
      fail(`[${env}] "${test}" ran ${leftover.length} input-handling assertion(s) the ledger does not grade — add rows, or the corpus is claiming coverage nothing checks`);
    }
  }
}

// --- the third state, from D285's listing ------------------------------------

/**
 * Written into the corpus directory rather than passed on stdin, because the corpus directory *is* the
 * config root: a probe run anywhere else would not be covered by the `authorized target` declaration
 * that permits an input-handling assertion at all, and would fail as `TF060` instead of demonstrating
 * anything. **Not dot-prefixed** — a leading `.` makes the file invisible to tflw's discovery, and
 * passing an undiscoverable path does not error, it quietly falls back to discovering the whole
 * directory.
 */
function withProbeFile(probe, name, fn) {
  writeFileSync(join(corpus, name), probe.source);
  try {
    return fn(name);
  } finally {
    rmSync(join(corpus, name), { force: true });
  }
}

for (const [i, probe] of APPLICABILITY_PROBES.entries()) {
  const name = `input-probe-${i}-${probe.env}.tflw`;
  const { report } = withProbeFile(probe, name, (n) => runCorpus(probe.env, [n]));
  const step = inputSteps(report)[0];
  if (!step) {
    fail(`[${probe.env}] the applicability probe produced no input-handling assertion`);
    continue;
  }
  if (step.ok) {
    fail(`[${probe.env}] an assertion where every rule stood down PASSED — D285 has been removed`);
    continue;
  }
  const missing = probe.expectNotApplicable.filter((id) => !step.stoodDown.includes(id));
  const extra = step.stoodDown.filter((id) => !probe.expectNotApplicable.includes(id));
  if (missing.length || extra.length) {
    fail(`[${probe.env}] not-applicable listing mismatch\n    missing: ${missing.join(', ') || '(none)'}\n    extra:   ${extra.join(', ') || '(none)'}`);
    continue;
  }
  // **The reason, not just the name.** This is the half Tier 1's listing does not have, and the half
  // that tells an operator whether to grant an opt-in or point the assertion somewhere else.
  if (probe.expectReason) {
    const unmatched = step.stoodDown.filter((id) => !probe.expectReason.test(step.reasons[id] ?? ''));
    if (unmatched.length === step.stoodDown.length) {
      fail(`[${probe.env}] no rule's stand-down reason matched ${probe.expectReason}\n    reasons: ${JSON.stringify(step.reasons, null, 2)}`);
      continue;
    }
    for (const id of step.stoodDown) {
      const why = step.reasons[id] ?? '';
      if (/needs an opt-in this target does not grant/.test(why)) seenReason.withheld.add(id);
      else if (/none was answered/.test(why)) seenReason.unanswered.add(id);
    }
  }
  if (probe.expectMutations) {
    const got = step.mutations ?? { sites: 0, sent: 0 };
    const keys = [...new Set([...Object.keys(probe.expectMutations), ...Object.keys(got)])]
      .filter((k) => k !== 'perSite')
      .sort();
    const diff = keys.filter((k) => (probe.expectMutations[k] ?? 0) !== (got[k] ?? 0));
    if (diff.length > 0) {
      fail(`[${probe.env}] declined-mutation-set mismatch\n    expected: ${JSON.stringify(probe.expectMutations)}\n    actual:   ${JSON.stringify(got)}`);
      continue;
    }
  }
  for (const id of step.stoodDown) seen.notApplicable.add(id);
  console.log(`✓ [${probe.env}] D285 fired and named ${step.stoodDown.length} rule(s) that stood down, with reasons, exactly as the ledger says`);
}

// --- TF067's runtime twin, graded from stderr because there is no report ------

{
  const name = 'input-probe-tf067.tflw';
  const { report, output, status } = withProbeFile(TF067_PROBE, name, (n) =>
    runCorpus(TF067_PROBE.env, [n], { allowNoReport: true }),
  );
  if (report !== null) {
    fail('the TF067 probe produced a run report — tflw ran an assertion it should have refused before sending anything');
  } else if (!new RegExp(`error\\[${TF067_PROBE.expectCode}\\]`).test(output)) {
    fail(`the TF067 probe did not raise ${TF067_PROBE.expectCode}; tflw exited ${status}\n${output.trimEnd().split('\n').slice(-15).join('\n')}`);
  } else if (!TF067_PROBE.expectHelp.test(output)) {
    fail(`${TF067_PROBE.expectCode} was raised but its help text no longer explains which three mutation sites were absent — the diagnostic is the whole value here`);
  } else {
    tf067Held = true;
    console.log(`✓ [${TF067_PROBE.env}] ${TF067_PROBE.expectCode} refused an assertion with nothing to mutate, at runtime, before any request was sent`);
  }
}

// --- the coverage table, gaps included ---------------------------------------

console.log('\nD383 coverage — one row per input-handling rule, three states:\n');
const gaps = [];
console.log(`  ${'rule'.padEnd(34)} fires  silent  n/a`);
for (const [id] of INPUT_PACK) {
  const f = seen.fires.has(id);
  const s = seen.silent.has(id);
  const n = seen.notApplicable.has(id);
  if (!f || !s || !n) gaps.push([id, { fires: f, silent: s, notApplicable: n }]);
  console.log(`  ${id.padEnd(34)} ${f ? '  ✓  ' : '  ·  '}  ${s ? '  ✓ ' : '  · '}   ${n ? ' ✓' : ' ·'}`);
}

if (gaps.length > 0) {
  console.log('\nNot demonstrated live by this run, and named rather than rounded off — a coverage claim');
  console.log('with a silent gap in it is the thing this milestone exists to avoid:\n');
  for (const [id, states] of gaps) {
    console.log(`  ${id}: ${Object.entries(states).filter(([, v]) => !v).map(([k]) => k).join(', ')}`);
  }
}

// The two not-applicable *reasons*, reported apart. A tier where every stand-down had the same cause
// would be a tier whose opt-in model is untested in one direction.
console.log('\nD285 stand-down reasons, demonstrated separately:\n');
console.log(`  opt-in withheld by the target : ${[...seenReason.withheld].sort().join(', ') || '(none)'}`);
console.log(`  probes sent but unanswered    : ${[...seenReason.unanswered].sort().join(', ') || '(none)'}`);
if (seenReason.withheld.size === 0 || seenReason.unanswered.size === 0) {
  fail('only one of the two not-applicable reasons was demonstrated — the opt-in model is untested in one direction');
}

// --- D380: the price of the tier, derived rather than asserted ----------------

/**
 * **The price, printed rather than discovered.** Tier 2's grader records what an authorization
 * assertion costs in principals; this records what an input-handling assertion costs in requests, and
 * it is the larger of the two by an order of magnitude. Derived from the run rather than hard-coded,
 * because the corpus is what determines it: the same assertion against a two-leaf body costs nearly
 * four times what it costs against a one-parameter query.
 */
console.log('\nD380 — what a Tier 3 assertion costs, from this run:\n');
console.log(`  ${'assertion'.padEnd(58)} sites  sent  per site`);
let totalSent = 0;
for (const v of volume) {
  totalSent += v.sent;
  const label = `[${v.env}] @${v.floor ?? 'none'} ${v.test}`.slice(0, 58);
  console.log(`  ${label.padEnd(58)} ${String(v.sites).padStart(5)} ${String(v.sent).padStart(5)} ${String(v.perSite).padStart(9)}`);
}
console.log(`\n  ${volume.length} assertion(s), ${totalSent} extra request(s) against the target in total.`);
console.log('  Strictly sequential, one in flight, per D21 layer 5 — so this is also seconds, not just');
console.log('  packets: measured at 0.91-1.05s on fedora-box against a full VULN_MODE=1 stack, which is');
console.log('  half of security-acceptance-gate\'s 1.70-1.99s. This runs as the `input-acceptance` regression');
console.log('  phase (D765). The sweep that answers the whole-suite question is D380\'s, and it is a');
console.log('  different measurement under its own command — `npm run sweep:input-volume`.');

// --- D752: the construct index, both directions ------------------------------
//
// `CONSTRUCTS.md`'s `C109`-`C111` roster three constructs against this script rather than against a
// plant row of their own, exactly as `C51`-`C58` are rostered against the Tier 1/2 grader. `D752` is
// what makes that citation an assertion instead of a claim: this end has to agree, in both
// directions, and it has to agree **on what the run did**.
//
// **Answered off the run's evidence, never off a code path.** `M154f-03`'s open half is that
// `verify-security-acceptance.mjs`'s `answers(...)` records reaching a line, which a grader that
// asserted nothing would also reach. Each id below is instead derived from the states this run
// actually demonstrated, and every one of the three needs a *pair*: for the two config keys, the
// same rule firing where the config grants the opt-in and standing down — naming the missing word —
// where it does not. A run that only ever fired, or only ever stood down, answers neither.
const CONSTRUCTS_ANSWERED = new Set();
{
  const bothWays = (rule) => seen.fires.has(rule) && seenReason.withheld.has(rule);
  if (ledgerRowsGraded === LEDGER.length && seen.fires.size > 0 && seen.silent.size > 0 && seen.notApplicable.size > 0 && tf067Held) {
    CONSTRUCTS_ANSWERED.add('matcher:has-no-input-handling-violations');
  }
  if (bothWays('sec/oversized-input-accepted')) CONSTRUCTS_ANSWERED.add('config:probe:oversized');
  if (bothWays('sec/path-traversal-read')) CONSTRUCTS_ANSWERED.add('config:probe:traversal');

  const rostered = constructPlantsFor('input');
  for (const plant of rostered) {
    if (!CONSTRUCTS_ANSWERED.has(plant.construct)) {
      fail(
        `${plant.id} rosters \`${plant.construct}\` against this script (CONSTRUCTS.md), and nothing in this run answered it.\n` +
          '    A roster row is a claim that this gate states that construct\'s known answer and would go red without it.\n' +
          '    Either the states it needs stopped being demonstrated, or the row points at the wrong grader.',
      );
    }
  }
  for (const id of CONSTRUCTS_ANSWERED) {
    if (!rostered.some((p) => p.construct === id)) {
      fail(
        `this run answered \`${id}\` and no row in CONSTRUCTS.md names it against this script.\n` +
          '    The reverse direction, and the one that catches a construct quietly graded here while the ledger\n' +
          '    still says it is unrostered. Add the row (`D724`/`D752`), or drop the claim.',
      );
    }
  }
  if (rostered.length > 0 && rostered.every((p) => CONSTRUCTS_ANSWERED.has(p.construct)) && CONSTRUCTS_ANSWERED.size === rostered.length) {
    console.log(
      `\n✓ D752 — the construct index resolves both ways: ${rostered.length} rostered construct(s) ` +
        `(${rostered.map((p) => p.id).join(', ')}), ${CONSTRUCTS_ANSWERED.size} answered by this run, no drift`,
    );
  }
}

console.log(`\n${failures === 0 ? '✓' : '✗'} ${LEDGER.length} ledger row(s), ${APPLICABILITY_PROBES.length} applicability probe(s), 1 TF067 probe — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
