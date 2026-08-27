#!/usr/bin/env node
// `npm run verify:construct-coverage` — every construct tflw ships is rostered or ratcheted, and a
// new one is neither.
//
// `M154b`, testFlow `PLAN_M154_DOGFOOD_CONFORMANCE.md` (`D723`, `D724`, `D730`, and `D739`–`D741`).
//
// ## The question, and why nothing could answer it before
//
// `testFlow-tests` was built as a target for tflw to run against and has grown into a good one: 30
// apiV2 controllers, two frontends, 126 `.tflw` files, a known-answer vulnerability ledger, a
// three-way perf ladder. What it never had is an answer to *does it actually exercise tflw?* The
// census taken while scoping `M154` says no: seven step keywords at literally zero occurrences,
// fourteen more at exactly one occurrence in exactly one file, four of six workload shapes never
// executed by anything, `check` used nine times against `expect`'s 1692.
//
// None of that was a decision. It happened because nothing was watching — the same shape as
// `M141`/`D538`'s unconditionally-green `jest --passWithNoTests` and `M149f-01`'s
// report-but-never-fail scan. **A property that holds because nobody got round to breaking it is
// not a property.** This script is the thing watching.
//
// ## Ground truth is the binary, not a list (`D723`)
//
// The construct set comes from `tflw spec --json`, emitted by the **vendored** build — the same
// artifact every other grader in this repository runs. So the checklist and the program under test
// cannot disagree. The rejected alternatives are worth naming because each looks reasonable:
//
//   a hand-maintained list        `D659` — this repo's guards do not maintain wordlists, and a
//                                 stale one reports green for ever, which is the exact failure here
//   `SPEC.md` §4.6's table        step keywords only; no probes, matchers, generators, locators or
//                                 diagnostics, so about half the surface would have no entry
//   the gate living in tflw       inverts CI's checkout direction and makes tflw red for a corpus
//                                 it does not control, which makes `D511`'s merge order harder
//
// ## Why this one refuses on a stale build where `check-acceptance.mjs` only reports
//
// `M153b-01`: a local `check:acceptance` graded a nine-day-old vendored tflw, correctly reported a
// grammar gap that had been closed nine days earlier, and the conclusion reached a PR body. That
// script now prints its provenance and banners a red, which is right for it — a stale build still
// gives a true answer about a real program, just an old one.
//
// This script cannot do the same, because staleness does not make its answer old, it makes it
// **wrong**. The manifest *is* the ground truth here. A vendored build from before a new keyword
// shipped emits a manifest without it, the ratchet matches, and the gate goes green on precisely
// the day it was built to go red. So provenance is a precondition, not an annotation, and a state
// outside `GRADEABLE` exits before anything is compared. That refusal is `M153b-01`'s close
// condition and it is what makes this the milestone that closes the row, rather than `M154a`, which
// only made the information available.
//
// ## Static by construction (`D727`)
//
// Parse a JSON document, read some files, compare some sets. No Docker stack, no browsers, no
// `.env`. That is what lets it live in the `acceptance-check` job and cost seconds on every PR,
// while the plants themselves — which need a stack, a browser and a load generator — are graded by
// `verify-construct-acceptance.mjs` in the regression sweep.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveTflw } from './lib/tflw-bin.mjs';
import { readSpec, siblingState, gradeProvenance, announceProvenance, GRADEABLE } from './lib/tflw-provenance.mjs';
import {
  PLANTS,
  PLANT_IDS,
  COVERED_CONSTRUCTS,
  REFERENCE_ROSTERS,
  REFERENCE_ROSTER_IDS,
  expandReferenceRosters,
  RATCHET,
  RATCHET_CEILING,
  GRADERS,
  assertLedgerIds,
} from './lib/constructs.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`✗ ${msg}`);
};
const ok = (msg) => console.log(`✓ ${msg}`);

// --- provenance is a precondition, not a footnote -----------------------------

const { entry } = resolveTflw('released', { label: 'construct-coverage' });
const spec = readSpec(entry);
const provenance = gradeProvenance(spec.build, siblingState());
announceProvenance('construct-coverage', provenance);

if (!GRADEABLE.has(provenance.state)) {
  console.error(
    `\n✗ REFUSING TO GRADE. ${provenance.summary}\n` +
      (provenance.detail ? `${provenance.detail}\n` : '') +
      '\n  This gate\'s ground truth IS the manifest that build emits. Against the wrong build it does\n' +
      '  not give an old answer, it gives a confident wrong one: a construct that shipped after this\n' +
      '  build was packed is simply absent, the ratchet matches, and the gate goes green on exactly\n' +
      '  the day it was built to go red. `M153b-01` is the row this refusal closes.\n' +
      '\n  Fix: npm run refresh-tflw\n',
  );
  process.exit(2);
}

// --- the manifest, and what this repository claims about it -------------------

if (spec.manifest !== 1) {
  fail(
    `\`tflw spec --json\` reports manifest version ${spec.manifest}; this gate was written against 1.\n` +
      '    The version is pinnable precisely so a shape change is a red here rather than a silent misread.',
  );
}

const manifestIds = spec.constructs.map((c) => c.id);
const manifestById = new Map(spec.constructs.map((c) => [c.id, c]));
if (manifestIds.length !== manifestById.size) fail('`tflw spec --json` emitted duplicate construct ids.');
ok(`manifest: ${manifestIds.length} constructs from tflw ${spec.build.version} (${spec.build.commit ?? 'no commit'})`);

const covered = new Set(COVERED_CONSTRUCTS);
const ratchet = new Set(RATCHET);

// --- the rosters that cite a gate instead of writing a row (`D751`, `D763`) ---
//
// A reference roster claims a whole family, and it claims it as a rule: the ids come from the
// manifest read a few lines above, never from a list in this repository. So the three things that
// could make the citation a lie are checked here, before a single id is added to `covered` — the
// grader has to exist, it has to be *gated*, and the family has to be non-empty in the manifest that
// this very run is grading against. The last one is the quiet failure: a family renamed upstream
// leaves a row that reads like sixty-six graded constructs and covers nothing at all.
const referenceCovered = expandReferenceRosters(spec.constructs);
for (const roster of REFERENCE_ROSTERS) {
  const ids = referenceCovered.get(roster.id) ?? [];
  const grader = GRADERS[roster.grader];
  if (!grader) {
    fail(`${roster.id} cites grader \`${roster.grader}\`, which is not in GRADERS — the citation resolves to nothing`);
    continue;
  }
  if (!grader.gated) {
    fail(
      `${roster.id} rosters the \`${roster.family}\` family by citing ${grader.script}, which nothing runs automatically.\n` +
        '    A row pointing at a gate nobody runs reads as evidence while nothing evaluates it — `M137e-01` in a new ledger,\n' +
        '    and worse here than for a plant, because one such row can carry a whole family.',
    );
    continue;
  }
  if (ids.length === 0) {
    fail(
      `${roster.id} rosters family \`${roster.family}\`, and \`tflw spec --json\` has no shipped construct in it.\n` +
        '    Either the family was renamed in tflw — in which case this row now covers nothing while still reading as a\n' +
        '    roster entry — or every one of its constructs was retired. Both need the row rewritten, not the count ignored.',
    );
    continue;
  }
  const alsoPlanted = ids.filter((id) => COVERED_CONSTRUCTS.includes(id));
  if (alsoPlanted.length > 0) {
    fail(
      `${roster.id} covers ${alsoPlanted.join(', ')} by reference, and a plant row rosters the same construct by hand.\n` +
        '    Two claims about one construct, which is how they drift apart. Pick the one that states the known answer.',
    );
  }
  for (const id of ids) covered.add(id);
  ok(`${roster.id} ${roster.family}:* — ${ids.length} construct(s) rostered by reference to ${grader.script} (${grader.phase})`);
}

// --- D730's three directions, each its own failure ----------------------------
//
// These are three different mistakes with three different fixes, so they are reported as three
// rather than as one set difference. Collapsing them is how a gate ends up saying "sets differ".

// 1. A construct tflw ships that this repository has never heard of. **This is the anti-regression
//    property**, and it is the one that makes the gate worth its seconds: a new keyword cannot ship
//    uncovered and unnoticed, which is precisely what happened to seven of them.
const unaccounted = manifestIds.filter((id) => !covered.has(id) && !ratchet.has(id));
if (unaccounted.length > 0) {
  fail(
    `${unaccounted.length} construct(s) in \`tflw spec --json\` appear on neither the roster nor the ratchet:\n` +
      unaccounted.map((id) => `      ${id}  (${manifestById.get(id).family} · ${manifestById.get(id).name})`).join('\n') +
      '\n    A construct tflw ships is either graded with a known answer (a row in CONSTRUCTS.md and a\n' +
      '    plant in scripts/lib/constructs.mjs) or explicitly unrostered (RATCHET). There is no third\n' +
      '    state, deliberately — the third state is what the census measured.',
  );
} else {
  ok(`every one of the ${manifestIds.length} constructs is accounted for: ${covered.size} rostered, ${ratchet.size} on the ratchet`);
}

// 2. A ratchet entry that is no longer in the manifest. `D730` asks for this by name, and it is the
//    direction that fails *silently* — a construct retired from tflw leaves a line here that reads
//    like honest work outstanding for ever.
const phantom = RATCHET.filter((id) => !manifestById.has(id));
if (phantom.length > 0) {
  fail(
    `${phantom.length} ratchet entr(ies) name a construct tflw no longer ships:\n` +
      phantom.map((id) => `      ${id}`).join('\n') +
      '\n    Delete them. A ratchet that lists constructs which do not exist is a to-do list that can\n' +
      '    never be finished, and its length stops meaning anything.',
  );
} else {
  ok('every ratchet entry names a construct the manifest still carries');
}

// 3. The ceiling (`D740`). The list is tracked so growth is a visible diff; the pin makes it a
//    mechanical one. Same shape as `scripts/verify-test-counts.mjs`'s `EXPECTED`.
if (RATCHET.length > RATCHET_CEILING) {
  fail(
    `the ratchet has ${RATCHET.length} entries and its ceiling is ${RATCHET_CEILING} — it grew.\n` +
      '    The list may only shrink. If a construct genuinely has to go back on it, raise the ceiling\n' +
      '    in the same commit and say why — the second edit is the point.',
  );
} else if (RATCHET.length < RATCHET_CEILING) {
  ok(`the ratchet is ${RATCHET.length}, under its ceiling of ${RATCHET_CEILING} — lower the ceiling to lock the gain in`);
} else {
  ok(`the ratchet is at its ceiling of ${RATCHET_CEILING}`);
}

const dupes = RATCHET.filter((id, i) => RATCHET.indexOf(id) !== i);
if (dupes.length > 0) fail(`the ratchet lists ${dupes.length} id(s) twice: ${[...new Set(dupes)].join(', ')} — its length is the pinned number, so a duplicate inflates it`);

const bothWays = [...covered].filter((id) => ratchet.has(id));
if (bothWays.length > 0) fail(`${bothWays.join(', ')} — rostered AND on the ratchet. A construct is graded or it is not.`);

// --- every roster row, against the manifest and against the corpus ------------

for (const plant of PLANTS) {
  const entryInManifest = manifestById.get(plant.construct);
  if (!entryInManifest) {
    fail(`${plant.id} grades \`${plant.construct}\`, which is not in \`tflw spec --json\` — the construct was renamed or retired, and the plant now grades nothing`);
    continue;
  }
  if (entryInManifest.status !== 'shipped') {
    // `D731`/`D736`: a `planned` construct is normally *absent* from the manifest rather than
    // listed. `MATCHERS` is the one table carrying its own status, so this is reachable, and a
    // known-answer plant for something that does not work yet is a red with nothing behind it.
    fail(`${plant.id} grades \`${plant.construct}\`, which the manifest marks \`${entryInManifest.status}\` rather than shipped`);
    continue;
  }
  if (plant.family !== entryInManifest.family) {
    fail(`${plant.id} states family \`${plant.family}\`; the manifest says \`${entryInManifest.family}\`. The id is opaque by tflw's contract, so this field is stated rather than parsed — and stating it means it can be wrong.`);
  }

  const file = path.join(ROOT, plant.evidence.file);
  if (!existsSync(file)) {
    fail(`${plant.id} — its evidence file ${plant.evidence.file} does not exist`);
    continue;
  }
  // Comment lines are stripped, and the pattern is anchored to the start of a step line. Both are
  // needed and neither is enough alone: the first version of this check searched for a substring in
  // the comment-stripped file, and deleting every `accept dialog` step from `C2`'s plant left it
  // green — the file still said the words, in the test's title. A search a *mention* satisfies is
  // exactly the presence-only bar `D722` rejects. It shipped as far as its own negative test and no
  // further, which is what running the failure directions is for.
  const steps = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'));
  const re = new RegExp(plant.evidence.pattern);
  const hits = steps.filter((l) => re.test(l)).length;
  const min = plant.evidence.min ?? 1;
  if (hits < min) {
    fail(
      `${plant.id} — ${plant.evidence.file} has ${hits} step line(s) matching /${plant.evidence.pattern}/, and the row claims at least ${min}.\n` +
        '    Either the plant stopped using the construct it claims to grade, or the file was rewritten.\n' +
        '    The count is asserted and not just the presence: `C2` needs three armings to tell a one-shot\n' +
        '    handler from a sticky one, and two of them would prove strictly less while still matching.',
    );
    continue;
  }
  const blocked = plant.blockedOn ? ` [blocked-on:${plant.blockedOn}]` : '';
  ok(`${plant.id} ${plant.construct} — ${plant.evidence.file}, ${hits} step line(s) matching /${plant.evidence.pattern}/ (needs ${min})${blocked}`);
}

// --- the ledger's prose agrees with the ledger's data --------------------------

const ledgerPath = path.join(ROOT, 'CONSTRUCTS.md');
if (!existsSync(ledgerPath)) {
  fail('CONSTRUCTS.md does not exist — the roster has no prose half, and `D724`\'s `no construct without a row` rule has nowhere to be stated');
} else {
  const before = failures;
  assertLedgerIds(readFileSync(ledgerPath, 'utf8'), fail);
  if (failures === before)
    ok(
      `CONSTRUCTS.md documents exactly the ${PLANT_IDS.length} plant(s) and ${REFERENCE_ROSTER_IDS.length} reference roster(s) the manifest module defines`,
    );
}

// --- every plant has a gated grader (`M137e-01`'s shape, one ledger over) ------

for (const plant of PLANTS) {
  const gated = plant.graders.filter((g) => GRADERS[g]?.gated);
  if (plant.graders.some((g) => !GRADERS[g])) fail(`${plant.id} names a grader that is not in GRADERS: ${plant.graders.filter((g) => !GRADERS[g]).join(', ')}`);
  else if (gated.length === 0) fail(`${plant.id} is graded only by scripts nothing runs automatically — that is \`M137e-01\` recurring in a new ledger`);
}

// --- the report --------------------------------------------------------------

const pct = ((covered.size / manifestIds.length) * 100).toFixed(1);
const byReference = covered.size - COVERED_CONSTRUCTS.length;
console.log(
  `\nrostered: ${covered.size}/${manifestIds.length} (${pct}%) — ${COVERED_CONSTRUCTS.length} by plant, ` +
    `${byReference} by reference (${REFERENCE_ROSTER_IDS.join(', ')}) · ratchet ${RATCHET.length}/${RATCHET_CEILING}`,
);
console.log(
  failures === 0
    ? '✓ construct coverage: every construct tflw ships is rostered or explicitly unrostered, and every roster row still carries its construct.'
    : `✗ construct coverage: ${failures} problem(s).`,
);
process.exit(failures === 0 ? 0 : 1);
