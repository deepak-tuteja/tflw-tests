#!/usr/bin/env node
// M137a (`M136c-01`) — the second seam between these two repositories, which until now had no gate.
//
// `verify-check-diagnostics.mjs` guards the first: tflw assigns a `TF0xx` code, this repo owes it a
// fixture, and that script reads the code list out of the *installed bundle* so the debt is visible
// in seconds. This one guards the other: tflw writes `findings.sarif`, this repo's graders read it
// by name, and nothing joined the two.
//
// THE BREAK THAT FILED THE ROW. `M136a` renamed the field identifying a `tflw/notApplicable` entry
// from `rule` to `id`. `M136c` had been planned as *"sequenced, not coupled — there is no coupled
// red, because no diagnostic code moves"*, which was true and beside the point. No code moved.
// `verify-sarif-acceptance.mjs` failed all eleven entries with a message naming a field that no
// longer existed, and it was found by *running an acceptance phase* — the slowest and most expensive
// route available. D351's incantation was green the whole time, correctly, because it answers a
// different question.
//
// IF YOU ARE READING THIS BECAUSE IT WENT RED, run the same incantation D351 established — the
// contract ships inside the package, so re-packing is what makes this answer about your branch:
//
//     npm run refresh-tflw && node scripts/verify-artifact-contract.mjs
//
// WHAT RED MEANS. tflw changed the shape of an artifact this repo reads. That is not necessarily
// wrong — `M136a`'s rename was an improvement — but it is a **coupled** change, and the two halves
// merge together the way a code assignment does. The repair is on this side: update the grader named
// beside the missing key, then update the row here.
//
// WHY EACH ROW STATES THE VALUE IT EXPECTS, rather than merely that the contract has the key. The
// first draft of this script checked that each dotted path resolved to *some* non-empty string,
// which is a check that cannot fail: `M136a`'s rename moved the value, not the path. Replaying that
// exact break against it — `notApplicableFields.id` set to `"rule"` — came back green. So each row
// names the literal this repo's graders assume, and the assertion is equality. The duplication is
// the mechanism, not an oversight: a contract check is two independent statements of one shape,
// compared. One statement compared with itself is a tautology with a tick beside it.
//
// AND WHY EACH ROW CARRIES A `witness`. Without it the list becomes a third hand-maintained copy of
// the shape, free to go on demanding a key after the last grader stopped reading it — holding tflw
// to a contract nobody consumes. The witness is the **accessor**, not the bare value: the second
// draft searched the grader for the value itself, and `"id"` and `"rule"` appear in that file
// dozens of times for unrelated reasons, so a rename passed that check too. A witness has to be
// distinctive enough that its presence means the key is genuinely read.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveArtifactContract } from './lib/tflw-bin.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONTRACT_FILE = resolveArtifactContract('released', { label: 'verify-artifact-contract' }).file;

/** The contract version this script was written against. A newer one is refused rather than read
 *  optimistically: the failure being guarded against is "the shape changed and nothing said so",
 *  and reading a version you do not understand is that failure wearing this script's own clothes. */
const UNDERSTOOD_VERSION = 1;

/**
 * Every name this repository reads out of `findings.sarif`.
 *
 * `path` is the dotted route into the contract; `is` is the literal the graders here assume;
 * `witness` is the accessor proving one of them still reads it, and `reads` is the file it is in.
 *
 * Standard SARIF vocabulary — `ruleId`, `level`, `locations`, `suppressions`, and
 * `partialFingerprints` itself — is deliberately absent. Those are the specification's names, tflw
 * cannot rename them, and rows for them would guard nothing while making the list look thorough.
 */
const GRADER = 'scripts/verify-sarif-acceptance.mjs';
/** The second consumer, and the first that reads something other than `findings.sarif`. */
// `M160d`/`D813` — `durations` reaches its consumer in two hops, and the row names the hop a rename
// would actually break. `perf-conformance.mjs` copies the whole block into each artifact it writes,
// so the bound stays attached to the run it describes; that copy is by reference to the block and
// would survive any rename inside it. `derive-perf-bands.mjs` is where the individual key names are
// spelled out, so a renamed `maxRelativeError` silently returns `undefined` there, falls to the
// legacy model, and suppresses a band for a reason that is no longer true — a green gate over a
// wrong answer, which is `M136c-01` exactly.
const BANDS = 'scripts/derive-perf-bands.mjs';
const EXPECTED = [
  { path: 'sarif.runProperties.notApplicable', is: 'tflw/notApplicable', witness: `properties?.['tflw/notApplicable']`, reads: GRADER },
  { path: 'sarif.notApplicableFields.kind', is: 'kind', witness: 'n.kind', reads: GRADER },
  // The one `M136a` renamed, and the reason this file exists. Its own row rather than folded into
  // the line above because it is the worked example: this row is what would have gone red in
  // seconds instead of eleven failed entries in an acceptance phase.
  { path: 'sarif.notApplicableFields.id', is: 'id', witness: 'applied.has(n.id)', reads: GRADER },
  { path: 'sarif.resultProperties.endpoint', is: 'tflw/endpoint', witness: `res.properties?.['tflw/endpoint']`, reads: GRADER },
  { path: 'sarif.ruleProperties.securitySeverity', is: 'security-severity', witness: `descriptor.properties?.['security-severity']`, reads: GRADER },
  { path: 'sarif.partialFingerprint', is: 'tflwFindingV1', witness: 'res.partialFingerprints?.tflwFindingV1', reads: GRADER },
  // `M160d` (`D812`) — not a name, and not from `findings.sarif`. tflw's *rounding rule*, which
  // `derive-perf-bands.mjs` needs in order to decide whether a p95 is precise enough to band. It
  // held that as a local `QUANTUM_MS = 0.5` until tflw's `M160a` made it false, and the rows above
  // are the reason that is worth a row: this is `M136c-01`'s break in a second currency. Nothing
  // failed at check time then either — the derivation simply went on suppressing bands on
  // arithmetic that had stopped being true.
  //
  // `maxRelativeError` is a **number**, and the equality assertion is the point exactly as it is for
  // the names: a bound that drifts from 0.0477 to 0.5 suppresses every band in the baseline and
  // reads, from here, like a quiet policy change nobody made.
  { path: 'durations.rule', is: 'D809', witness: `durations?.rule`, reads: BANDS },
  { path: 'durations.maxRelativeError', is: 0.0477, witness: `durations?.maxRelativeError`, reads: BANDS },
];

const problems = [];
const note = (m) => problems.push(m);

if (!existsSync(CONTRACT_FILE)) {
  console.error(
    `✗ no artifact contract at ${path.relative(ROOT, CONTRACT_FILE)}\n` +
      '  The installed tflw predates M137a, or the package was installed without a build. Run\n' +
      '  `npm run refresh-tflw` to re-pack from your local tflw checkout.\n' +
      '  Do NOT make this check skip when the file is missing: a gate that passes when its input is\n' +
      "  absent is green about nothing, which is the exact failure `verify-ledger`'s header names.",
  );
  process.exit(1);
}

const contract = JSON.parse(readFileSync(CONTRACT_FILE, 'utf8'));

if (contract.version !== UNDERSTOOD_VERSION) {
  console.error(
    `✗ artifact contract is version ${contract.version}; this script understands ${UNDERSTOOD_VERSION}.\n` +
      '  tflw changed the contract itself, not just a key. Read its `artifact-contract.ts`, update the\n' +
      '  graders and this script together, then bump UNDERSTOOD_VERSION.',
  );
  process.exit(1);
}

const resolve = (dotted) => dotted.split('.').reduce((o, k) => (o === undefined ? undefined : o[k]), contract);

for (const { path: dotted, is, witness, reads } of EXPECTED) {
  const value = resolve(dotted);
  if (value === undefined) {
    note(
      `${dotted} is absent from the contract.\n` +
        `    ${reads} reads it as "${is}". tflw removed it — a coupled change, and the two halves\n` +
        '    merge together.',
    );
    continue;
  }
  if (value !== is) {
    note(
      `${dotted} is "${value}" in the installed tflw; the graders here read "${is}".\n` +
        `    tflw renamed it. This is exactly \`M136c-01\`: nothing failed at check time, and\n` +
        `    ${reads} will fail every entry with a message naming a field that no longer exists.\n` +
        `    Update the accessor there, then update this row.`,
    );
    continue;
  }
  const graderPath = path.join(ROOT, reads);
  if (!existsSync(graderPath)) {
    note(`${dotted} names ${reads}, which does not exist. Point this row at the file that reads it now.`);
    continue;
  }
  if (!readFileSync(graderPath, 'utf8').includes(witness)) {
    note(
      `${dotted} claims ${reads} reads it via \`${witness}\`, and that accessor is not in the file.\n` +
        '    Either the grader was refactored and this row is stale, or nothing here reads this key\n' +
        '    any more and the row should go — a demand nobody consumes holds tflw to a contract for\n' +
        '    no one.',
    );
  }
}

if (problems.length > 0) {
  console.error(`✗ artifact contract: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}

console.log(
  `✓ artifact contract v${contract.version}: all ${EXPECTED.length} names and values this repo reads ` +
    'are present in the installed tflw, and each is really read by the consumer named beside it',
);
