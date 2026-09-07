#!/usr/bin/env node
// `M181c` (testFlow `PLAN_M181_RUN_SCOPED_UNIQUE.md`, `D934`) — the guard `D822` refused, at the
// price the condition actually costs.
//
// ## What `D822` refused, and why this is not a reversal of it
//
// `D822` says *"no automated guard is built for accumulated-state degradation"*, and the reason it
// gives is a price: *"a gate that runs eight consecutive full-gate rounds to catch this would cost
// more than the defect and would be the only such gate in the repository."* `CONTRIBUTING.md`
// states the same number as *"run one file six times without dropping the database"*, and it was
// measured — six consecutive runs of `tests/mixed/storefront.tflw` is what it takes to drain a
// seeded product's stock to the point where the add-to-cart control renders `disabled`.
//
// That decision was right about the condition it priced. It was pricing **stock depletion**. There
// is a second condition underneath it that costs **two** runs of **one file**, and `M162-01`
// measured it: a `unique(...)` counter that restarts at 0 on every `tflw run`, against columns that
// outlive the run. Three whole-suite runs against one live stack went 323 pass -> 5 failed -> 8
// failed, and twelve of the thirteen failing steps were `POST /auth/register` answering *email
// already registered*.
//
// So this is `D822` amended on its own terms and not overruled (`D934`): the guard it refused is
// not the guard now available. `D896`'s rule applies to the difference — a gate declares its reach
// rather than widening — and the reach is stated below rather than left to be inferred from a
// green.
//
// ## What this reaches, and what it does not
//
// REACHES, in two runs: anything that makes a **second** `tflw run` against a stack the first run
// already wrote to fail — a re-issued `unique` value against a uniqueness constraint (the
// `M162-01` class, now repaired by `M181a`), and a test that asserts a stateful outcome it can only
// produce once, of which a review is the sharpest case: `apiV2` has no `DELETE` for one at any
// route and the 409 is keyed on `(userId, productId)`, so such a test gets exactly one run per
// stack.
//
// DOES NOT REACH: stock depletion, which is `D822`'s own measured six, and any other condition
// whose threshold is more than two. Running this phase twice does not make it a six-run guard, and
// nothing here should be read as retiring `CONTRIBUTING.md`'s convention — `D819` stays a
// convention because the class is wider than what two runs can see.
//
// And the reach is bounded by the corpus as well as by the count, which is worth stating rather
// than leaving for someone to discover from a green. **Of the two shapes above, only the first is
// currently exercised**: the smoke tag draws `unique` values against real constrained columns, and
// it contains no test that asserts a once-per-stack outcome — because `D819`'s convention is being
// followed, which is the good reason for that half to be latent rather than absent. It is a
// property of the mechanism and it costs nothing to keep; the day a smoke-tagged test starts
// driving a seeded fixture, this phase is what says so.
//
// ## Why `--tag smoke`, and why it is not vacuous
//
// The corpus is the smoke tag rather than a file written for this script, for the reason a plant
// written here could not have: it is **real tests**, it is a mixed sample across all three layers,
// and it grows when the suite grows. Measured on the build box: 12 tests, ~1.3 s a run, five
// `unique` draws of which two are addresses posted to `POST /auth/register` — the exact column
// `M162-01` failed on. So a re-issuing build fails this in the place the defect actually lands.
//
// A guard whose corpus might one day contain no `unique` draw at all would be a green that means
// nothing (`D285`'s no-power-to-fail shape), so the observed draw count is asserted rather than
// assumed, and zero is a failure with its own message.
//
// **Execution order has to be identical between the two runs, and here it is by default rather than
// by a flag.** The counter is spent in execution order, so a reshuffle between runs changes which
// draw gets which counter value — and under a re-issuing build that is what makes the collision
// *partial and shifting*, which is why six earlier sightings of this defect were all recorded as
// intermittents. tflw runs files sequentially unless asked otherwise, and this repository's
// `tflw.config` sets no `parallel`, so the two runs below spend the counter identically. That is an
// assumption about the config rather than about tflw, so it is **asserted rather than trusted**: the
// draws are paired by name in order, and a pairing that does not line up is reported as its own
// failure instead of being quietly skipped. If a smoke-tagged test ever declares `parallel`, this
// phase says so rather than going intermittent.
//
// ## The known answer, which is sharper than "it passed twice"
//
// Requiring only that the second run is green would be satisfied by a build that made `unique`
// values *random* — which would collide again eventually and would have thrown away the guarantee
// this family exists for. So the assertions are:
//
//   1. both runs pass;
//   2. each run drew at least one `unique` value (no-power-to-fail refusal);
//   3. the two runs' `unique` values are disjoint — no value the first run issued is issued again;
//   4. and the **counters are identical between the runs** while the values are not. That is the
//      mechanism, not just the outcome: `unique`'s distinctness inside a run is still ordering, the
//      counter still restarts at 0, and what separates one run from the next is the run namespace
//      beside it (`D929`). A "fix" that randomised the counter start would pass 1-3 and fail this.
//
// Run it against a stack that has already served at least one run — which inside `regression.mjs`
// is arranged by running the corpus twice here, on the phase's own ordinary fresh restart. It needs
// no extra restart, because not restarting is the condition.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTflw } from './lib/tflw-bin.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { entry: TFLW_BIN } = resolveTflw('released', { label: 'second-run' });
const REPORT = path.join(ROOT, 'report', 'results.json');

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

/**
 * One corpus run, returned with its report.
 *
 * The report is deleted before the run rather than overwritten, for the reason
 * `verify-construct-acceptance.mjs` states: a `tflw run` that dies before writing one leaves the
 * previous run's `results.json` in place, and this script would then compare a run against itself
 * and call the result disjoint — the one failure mode that would make a green here meaningless.
 */
function runOnce(label) {
  rmSync(REPORT, { force: true });
  const args = ['run', '--no-color', '--tag', 'smoke'];
  const r = spawnSync(process.execPath, [TFLW_BIN, ...args], { cwd: ROOT, encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  let report = null;
  try {
    report = JSON.parse(readFileSync(REPORT, 'utf8'));
  } catch {
    report = null;
  }
  return { label, report, output, status: r.status };
}

/** Every generated `unique` value in a report, in the order the run produced them. */
function uniqueDraws(report) {
  const draws = [];
  for (const test of report?.tests ?? []) {
    for (const step of test.steps ?? []) {
      const m = /^(.+?) = "?(.*?)"? \(unique\)$/.exec(step.detail ?? '');
      if (m) draws.push({ name: m[1], value: m[2] });
    }
  }
  return draws;
}

/**
 * The counter inside a generated value, for the four members that render it legibly.
 *
 * `unique like` is deliberately absent and that is not an omission: it renders the counter through a
 * permutation of the pattern's own value space, so there is no counter to read off the string — the
 * reason SPEC §7.2 calls its cross-run distinctness probabilistic where the other four's is
 * guaranteed. A draw whose counter cannot be read contributes to the disjointness claim and not to
 * the counter claim, and the count of each is printed so neither can go quietly empty.
 */
function counterOf(value) {
  const email = /^user-[0-9a-z]{6}-(\d+)@example\.test$/.exec(value);
  if (email) return Number(email[1]);
  const prefixed = /-[0-9a-z]{6}-(\d+)$/.exec(value);
  if (prefixed) return Number(prefixed[1]);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{4}([0-9a-f]{8})$/.exec(value);
  if (uuid) return Number.parseInt(uuid[1], 16);
  const number = /^\d+$/.test(value) ? Number(value) % 2 ** 23 : null;
  return number;
}

console.log('second-run — a second `tflw run` against a stack the first one already wrote to');
console.log('  corpus: --tag smoke, twice, no restart between');

const first = runOnce('first');
const second = first.report ? runOnce('second') : null;

if (!first.report || !second?.report) {
  const which = !first.report ? 'first' : 'second';
  fail(
    `the ${which} run produced no report/results.json. Is the stack up (\`node cli.mjs start\`)?\n` +
      (first.report ? second.output : first.output).trim().split('\n').slice(-12).join('\n'),
  );
} else {
  const drawsA = uniqueDraws(first.report);
  const drawsB = uniqueDraws(second.report);

  ok(`first run: ${first.report.tests?.length ?? 0} tests, ok=${first.report.ok}, ${drawsA.length} \`unique\` draw(s)`);

  if (first.report.ok !== true) {
    fail('the FIRST run failed, so nothing here is about a second run. Fix that first — this phase cannot tell you anything until the corpus passes once.');
  } else if (second.report.ok !== true) {
    const failed = (second.report.tests ?? []).filter((t) => t.ok === false).map((t) => t.name);
    fail(
      `the second run of the same corpus against the same stack FAILED where the first passed — ${failed.length} test(s): ${failed.join(', ')}\n` +
        '    That is accumulated state, the class `D822` deferred and `D934` re-priced at two runs. Two shapes reach it:\n' +
        '      · a `unique` value re-issued against a column that outlives the run (`M162-01`, repaired in `M181a` — a red here says it came back);\n' +
        '      · a test asserting a stateful outcome it can only produce once (a review is keyed on (userId, productId) and apiV2 deletes none — `D819`, CONTRIBUTING.md).\n' +
        '    Run `node cli.mjs stop && node cli.mjs start` and it will pass again, which is the point: it passing on a fresh stack is not evidence.',
    );
  } else {
    ok(`second run on the SAME stack: ${second.report.tests?.length ?? 0} tests, ok=true, ${drawsB.length} \`unique\` draw(s) — the claim this phase exists for`);
  }

  // `D285`'s shape. A corpus that drew nothing has no power to fail whatever the build does.
  if (drawsA.length === 0 || drawsB.length === 0) {
    fail(
      'the corpus produced no `unique` value at all, so both runs passing says nothing about the mechanism.\n' +
        '    Either `--tag smoke` no longer covers a test that generates one, or the report stopped recording generated values inline.',
    );
  } else {
    ok(`the corpus exercises the mechanism — ${drawsA.length} draw(s), including ${drawsA.filter((d) => d.value.includes('@')).length} address(es) posted against a unique column`);

    const shared = drawsA.map((d) => d.value).filter((v) => drawsB.some((d) => d.value === v));
    if (shared.length === 0) {
      ok(`and the two runs' values are disjoint — nothing the first run issued was issued again (${drawsA[0].value} -> ${drawsB[0]?.value})`);
    } else {
      fail(
        `${shared.length} value(s) were issued by BOTH runs: ${shared.slice(0, 5).join(', ')}\n` +
          '    A second run re-issuing the first run\'s values is `M162-01` exactly. Against a live database\n' +
          '    that outlives the run, that is a collision waiting for the first constrained column it lands on.',
      );
    }

    // The mechanism, not just the outcome (`D929`): same counters, different namespace.
    //
    // **Attempted only when both runs passed, and announced when it is not** (tflw's `D300` rule: a
    // claim blocked by a failed instrument is reported, never quietly skipped). A failed second run
    // stops early and records fewer draws, so the alignment check would fire on the truncation and
    // blame execution order — a diagnostic naming something that is not wrong, which is the exact
    // defect `M181`'s own investigation found in `tickets.tflw`. The failure above already says what
    // went wrong; a second, misleading one beside it makes the report worse, not more complete.
    const misaligned = drawsA.length !== drawsB.length || drawsA.some((d, i) => d.name !== drawsB[i]?.name);
    const paired = drawsA.map((d, i) => ({ a: d, b: drawsB[i] })).filter((p) => p.b && p.a.name === p.b.name);
    const readable = paired.filter((p) => counterOf(p.a.value) !== null && counterOf(p.b.value) !== null);
    const counterMoved = readable.filter((p) => counterOf(p.a.value) !== counterOf(p.b.value));
    if (first.report.ok !== true || second.report.ok !== true) {
      console.log(
        `  note: the counter claim was not attempted — it compares two complete runs, and the ${first.report.ok !== true ? 'first' : 'second'} run above failed.\n` +
          '        Fix that failure first; this claim is about how the values differ, not about whether they do.',
      );
    } else if (misaligned) {
      fail(
        `the two runs drew different values in a different order — ${drawsA.length} draw(s) named ` +
          `[${drawsA.map((d) => d.name).join(', ')}] then ${drawsB.length} named [${drawsB.map((d) => d.name).join(', ')}].\n` +
          '    The counter is spent in execution order, so this phase needs the two runs to execute identically.\n' +
          '    Most likely a smoke-tagged test now declares `parallel`, or `tflw.config` gained a `parallel` key.\n' +
          '    Reported rather than skipped: without it the counter claim below would go intermittent instead of red.',
      );
    } else if (readable.length === 0) {
      fail('no draw carried a readable counter, so the claim below could not be made. Every member but `unique like` renders one.');
    } else if (counterMoved.length === 0) {
      ok(
        `and it is the namespace that moved and not the counter — ${readable.length} draw(s) landed on the same counter in both runs ` +
          `(${readable.map((p) => counterOf(p.a.value)).join(', ')}). Distinctness inside a run is still ordering; what separates the runs sits beside it`,
      );
    } else {
      fail(
        `${counterMoved.length} draw(s) changed COUNTER between the two runs, not just namespace: ` +
          `${counterMoved.slice(0, 3).map((p) => `${p.a.name} ${counterOf(p.a.value)} -> ${counterOf(p.b.value)}`).join(', ')}\n` +
          '    Nothing about the two runs makes the counter move: `workers` defaults to 1 (tflw `resolve.ts`),\n' +
          '    this repository\'s config sets none, a test\'s own concurrency defaults to `sequential` (tflw `parser.ts`),\n' +
          '    and both runs select the same corpus with the same `--tag`. So the counter is spent identically.\n' +
          '    Values that differ because the counter moved are not values that differ because the run does —\n' +
          '    a generator that randomised its counter start would pass every other check here and still collide.',
      );
    }
  }
}

if (failures > 0) {
  console.log(`\n✗ second-run: ${failures} failure(s).`);
  process.exit(1);
}
console.log('\n✓ second-run: the corpus passes twice on one stack, and the second run reuses none of the first run\'s generated values.');
