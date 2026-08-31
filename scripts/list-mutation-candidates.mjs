#!/usr/bin/env node
// `npm run list:mutation-candidates` — which of tflw's mutations could reach a roster plant.
//
// `M164a`, testFlow `PLAN_M164_ROSTER_VACUITY.md` (`D839`, `D841`, `D846`).
//
// ## THIS SCRIPT RUNS IN NO AUTOMATED PASS, AND THAT IS DELIBERATE
//
// Declared here because `M163`'s `D828` made it a rule: a grader reachable from no automated phase
// must say so in its own header, with the reason. Four graders in this repository were found running
// nowhere — `verify-security-acceptance.mjs` (`M137e-01`), `verify-input-acceptance.mjs`
// (`D764`/`M154g-13`), `measure-construct-evidence.mjs`'s missing half (`M154g-02`) and
// `verify-screenshot-step.mjs` (`D828`) — and each was found by accident.
//
// The reason here is that **this script asserts nothing.** It reports the candidate set that
// discovery (`M164b`) consumes; it has no known answer to be wrong about, and a gate over "how many
// mutations exist upstream" would fail on tflw's ordinary work. The thing with a known answer is
// the kill matrix, and the gate over it is `M164d`, sized and placed then (`D844`).
//
// It is not free of obligations, though. It **exits non-zero** if the registry cannot be read or if
// any candidate's anchor is stale or ambiguous, because those make the candidate list silently
// smaller than it claims — the `M153b-01` shape, where an instrument grades less than it says and
// goes green doing it.
//
// ## Reachable is not covered
//
// The `reachable` column answers *could this mutation change the binary the plants run*, derived
// from the bundle's own metafile. It is a sound exclusion and an unsound inclusion: the LSP server
// is in the bundle and no plant runs a language server. Which mutations kill which plants is
// measured, never predicted — that is the whole of `M164b`, and `D842` then separates a kill from
// coverage by hand.
//
//   node scripts/list-mutation-candidates.mjs [--json] [--by-file] [--all]
//
// A `--stale` filter was drafted here and removed before it shipped. It parsed and did
// nothing, which is `D826` exactly — the flag that reached the usage block, the argv
// contract and the closing line without reaching an implementation. Unhealthy anchors are
// always reported, so the filter had no question of its own to answer.

import { readMutations, bundleInputs, classify, anchorState, siblingRoot, editsOf } from './lib/mutations.mjs';

const argv = process.argv.slice(2);
const KNOWN = new Set(['--json', '--by-file', '--all']);
for (const a of argv) {
  if (!KNOWN.has(a)) {
    console.error(`unknown flag ${a}\n  usage: node scripts/list-mutation-candidates.mjs [--json] [--by-file] [--all]`);
    process.exit(64);
  }
}
const JSON_OUT = argv.includes('--json');
const BY_FILE = argv.includes('--by-file');
const ALL = argv.includes('--all');

const root = siblingRoot();
let reg;
try {
  reg = await readMutations(root);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}

let inputs;
try {
  inputs = bundleInputs(root);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}

const rows = classify(reg.mutations, inputs).map((r) => ({ ...r, anchor: anchorState(r.m, root) }));
const reachable = rows.filter((r) => r.reachable);
const excluded = rows.filter((r) => !r.reachable);
const unhealthy = reachable.filter((r) => r.anchor.state !== 'ok');
const equivalent = reachable.filter((r) => r.m.equivalent);

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        siblingRoot: root,
        registry: reg.file,
        bundleInputs: inputs.size,
        total: rows.length,
        reachable: reachable.length,
        excluded: excluded.length,
        equivalent: equivalent.length,
        unhealthyAnchors: unhealthy.length,
        candidates: reachable.map((r) => ({
          id: r.m.id,
          milestone: r.m.milestone,
          file: r.m.file,
          bundledAs: r.target,
          edits: editsOf(r.m).length,
          equivalent: Boolean(r.m.equivalent),
          anchor: r.anchor.state,
          what: r.m.what,
        })),
        excludedRows: excluded.map((r) => ({ id: r.m.id, file: r.m.file, why: r.why })),
      },
      null,
      2,
    ),
  );
  process.exit(unhealthy.length === 0 ? 0 : 1);
}

console.log(`mutation candidates: tflw registry ${reg.file}`);
console.log(`  sibling root      ${root}`);
console.log(`  bundle inputs     ${inputs.size} repo file(s) reach the CLI the plants run`);
console.log('');
console.log(`  ${String(reachable.length).padStart(3)} of ${rows.length} mutations edit a file that is in that bundle`);
console.log(`  ${String(excluded.length).padStart(3)} cannot reach a plant at all — no bundle counterpart`);
if (equivalent.length) console.log(`  ${String(equivalent.length).padStart(3)} of the candidates are declared \`equivalent\` upstream — expected survivors, not defects`);
console.log('');
console.log('  Reachable is a sound exclusion and an unsound inclusion (D839). Which of these');
console.log('  actually kill a roster plant is measured by M164b, not predicted here.');

if (BY_FILE || ALL) {
  const byFile = {};
  for (const r of reachable) byFile[r.m.file] = (byFile[r.m.file] ?? 0) + 1;
  console.log('\n  candidates by file:');
  for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
    console.log(`    ${String(n).padStart(3)}  ${f}`);
  const outByFile = {};
  for (const r of excluded) outByFile[r.m.file] = (outByFile[r.m.file] ?? 0) + 1;
  console.log('\n  excluded by file:');
  for (const [f, n] of Object.entries(outByFile).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
    console.log(`    ${String(n).padStart(3)}  ${f}`);
}

if (ALL) {
  console.log('\n  every candidate:');
  for (const r of reachable) console.log(`    ${r.m.id.padEnd(38)} ${r.anchor.state.padEnd(9)} ${r.m.file}`);
}

if (unhealthy.length === 0) {
  console.log(`\n✓ ${reachable.length} candidate(s), every anchor resolving exactly once in the sibling checkout`);
  process.exit(0);
}

console.log(`\n✗ ${unhealthy.length} candidate(s) cannot be applied as written:`);
for (const r of unhealthy) console.log(`    ${r.m.id.padEnd(38)} ${r.anchor.state.padEnd(9)} ${r.anchor.detail}`);
console.log('');
console.log('  A stale or ambiguous anchor makes the candidate set quietly smaller than this script');
console.log('  reports, which is `M153b-01`: an instrument grading less than it claims, in green.');
console.log('  Fix upstream (tflw owns these), or re-pin this repository to a sibling ref that matches.');
process.exit(1);
