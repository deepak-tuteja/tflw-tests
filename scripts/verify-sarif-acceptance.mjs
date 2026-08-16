#!/usr/bin/env node
// `npm run verify:sarif-acceptance` — D415's measurement (testFlow M135c, PLAN_M135_SARIF.md).
//
// `verify-security-acceptance.mjs` and `verify-input-acceptance.mjs` grade what the *run report*
// says. This grades the **document tflw hands to a machine**, and it exists because that document
// has a failure mode none of the others have: an invalid or mis-anchored SARIF file uploads
// successfully, produces no alerts, and reports no error anywhere. Every other artifact this suite
// writes is checked by a human opening it. This one is checked by a consumer that says nothing when
// it declines.
//
// ## Why the acceptance and not an upload (D415)
//
// The end-to-end proof would be `github/codeql-action/upload-sarif` against this repository. D415
// declined it: `testFlow-tests` is a corpus of *intentional* flaws, so uploading would leave ~14
// standing critical alerts that reopen on every run, and the authority on what should be found is
// `VULNS.md` — which this CI already checks — not GitHub's UI. The cost of that refusal is that
// **nothing downstream ever reports a wrong document**, and this file is what pays it.
//
// It paid immediately. The first run of this script found `artifactLocation.uri` emitted as
// `positives.tflw` for a file the repository holds at `tflw-acceptance/security/positives.tflw` —
// tflw records paths relative to the directory it was invoked from, and `%SRCROOT%` means the
// repository root. Every alert would have anchored to nothing. D405 had named that exact failure in
// advance and D415 had assigned the check here; see `sarifUri` in tflw's `packages/reporter`.
//
// ## What it asserts, and what each assertion is protecting
//
// | assertion | the failure it catches |
// | --- | --- |
// | every **positive** plant is present with its rule, `level` and `security-severity` | a rule that stopped reaching the document, or a severity that renders in the wrong band |
// | every **negative** plant is absent | a document that reports the hardened twin as a weakness |
// | every `uri` is repo-relative, `%SRCROOT%`-based, and **names a file that exists** | an alert that uploads and anchors to nothing |
// | the fingerprint set is identical across two consecutive runs | churn in a system that dedupes on identity — a fresh permanent alert per run |
// | seeded findings are absent | an un-keyable finding minting a new alert on every reseed (D411) |
// | a baselined finding carries `suppressions`, one below `--fail-on` does not | accepted and unranked collapsing into one state (D410) |
// | `tflw/notApplicable` names the rules that stood down | *silent* and *never applicable* collapsing into one empty state (D412) |
//
// ## Execution
//
// Needs the stack up with `VULN_MODE=1` — same requirement as `security-target-check`, and the
// reason this runs as its own regression phase rather than beside the other acceptance scripts.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const corpus = join(repoRoot, 'tflw-acceptance', 'security');
const sarifPath = join(corpus, 'report', 'findings.sarif');
const resultsPath = join(corpus, 'report', 'results.json');

/**
 * D406's table, mirrored rather than imported for the same reason `verify-security-acceptance.mjs`
 * mirrors the rule packs: a grader that read tflw's own mapping would agree with it by construction,
 * including on the day it changes. `security-severity` is asserted as a **string** — GitHub ignores
 * a numeric one with no error at all, and the alert simply ranks wrong.
 */
const SEVERITY = {
  critical: { level: 'error', securitySeverity: '9.5' },
  serious: { level: 'error', securitySeverity: '7.5' },
  moderate: { level: 'warning', securitySeverity: '5.0' },
  minor: { level: 'note', securitySeverity: '2.0' },
};

/**
 * The plants, mirrored from `VULNS.md` by hand.
 *
 * **`kind` is the whole point of the table.** D415 says "every planted `V1`–`V14` present", and
 * three of the fourteen are *negatives* — the hardened twins whose entire job is to produce no
 * finding — while `V8` is planted, probed, and deliberately never judged (`M130-05`). Asserting all
 * fourteen "present" would demand exactly the alerts this corpus is built to prove do not appear.
 * So: positives must be in the document with their rule and severity, negatives must be absent by
 * endpoint, and `V8` is absent for a reason that is not a bug and is recorded as such.
 *
 * `endpoint` is the templated form tflw computes for the fingerprint and reports as
 * `properties["tflw/endpoint"]`, so it is matched exactly. A wrong string here fails as "not found"
 * rather than passing quietly, which is why the ids are not matched loosely.
 */
const PLANTS = [
  { id: 'V1', kind: 'positive', endpoint: 'GET /v1/vuln/cors-wildcard', rules: { 'sec/cors-wildcard-with-credentials': 'critical' } },
  { id: 'V2', kind: 'negative', endpoint: 'GET /v1/vuln/cors-scoped' },
  { id: 'V3', kind: 'positive', endpoint: 'POST /v1/vuln/weak-cookie', rules: { 'sec/cookie-not-httponly': 'critical', 'sec/cookie-not-secure': 'critical', 'sec/cookie-samesite-none': 'moderate' } },
  { id: 'V4', kind: 'positive', endpoint: 'GET /v1/vuln/document', rules: { 'sec/csp-missing': 'serious', 'sec/x-frame-options': 'moderate' } },
  { id: 'V5', kind: 'negative', endpoint: 'GET /v1/vuln/document-hardened' },
  { id: 'V6', kind: 'positive', endpoint: 'GET /v1/vuln/orders/{id}', rules: { 'sec/authz-object-leak': 'critical' } },
  { id: 'V7', kind: 'positive', endpoint: 'GET /v1/vuln/orders', rules: { 'sec/authz-collection-leak': 'critical' } },
  // Probed under `probe mutating`, and no principal can judge it: the owner's own DELETE destroys
  // the row before any probe replays it. `M130-05` records the measurement; the row below (`V9`) is
  // the same request on an idempotent verb, and it *does* produce a finding. Absent here is the
  // corpus being right, so it is asserted absent rather than skipped — an unexplained absence and a
  // measured one look identical in a list of things nobody checked.
  { id: 'V8', kind: 'negative', endpoint: 'DELETE /v1/vuln/orders/{id}' },
  { id: 'V9', kind: 'positive', endpoint: 'PUT /v1/vuln/orders/{id}', rules: { 'sec/authz-object-leak': 'critical' } },
  { id: 'V10', kind: 'positive', endpoint: 'GET /v1/vuln/lookup', rules: { 'sec/reflected-input-unescaped': 'moderate' } },
  { id: 'V11', kind: 'positive', endpoint: 'GET /v1/vuln/items/{id}', rules: { 'sec/path-traversal-read': 'critical' } },
  { id: 'V12', kind: 'positive', endpoint: 'POST /v1/vuln/notes', rules: { 'sec/error-detail-disclosure': 'serious', 'sec/oversized-input-accepted': 'minor' } },
  { id: 'V13', kind: 'positive', endpoint: 'POST /v1/vuln/notes', rules: { 'sec/oversized-input-accepted': 'minor' } },
  { id: 'V14', kind: 'negative', endpoint: 'GET /v1/vuln/lookup-escaped' },
];

/**
 * The runs whose documents are graded, together.
 *
 * Four, because the corpus needs four to reach all fourteen plants: the hygiene and authorization
 * plants answer over TLS, the Tier 3 input plants live in their own files, and two rules are only
 * observable over plaintext. Each writes `report/findings.sarif` and the next overwrites it, so each
 * document is read and kept the moment its run finishes — reading the file at the end would grade
 * whichever run happened to be last, which is a mistake this suite has made before with
 * `results.json`.
 */
const RUNS = [
  { name: 'security @ secureLocal', env: 'secureLocal', files: ['positives.tflw', 'negatives.tflw', 'authz.tflw'] },
  { name: 'security @ plaintext', env: 'plaintext', files: ['plaintext.tflw'] },
  { name: 'input @ secureLocal', env: 'secureLocal', files: ['input.tflw'] },
  { name: 'input @ plaintext', env: 'plaintext', files: ['input-plaintext.tflw'] },
];

// ---------------------------------------------------------------------------
// Running the corpus
// ---------------------------------------------------------------------------

/**
 * See `verify-security-acceptance.mjs` for why the root `.env` is read here and passed through
 * rather than copied into the corpus directory: the corpus declares `require env`, tflw auto-loads
 * `.env` from the *config* directory, and copying a secret to make a path shorter is how a secret
 * ends up committed.
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

/** **Never `npx tflw`** (`M115-03`): that resolves this suite's vendored `tflw-0.1.0.tgz`, which
 *  predates the whole pentest arc and would grade a document it cannot produce. */
const TFLW_BIN = process.env.TFLW_BIN ?? join(repoRoot, '..', 'testFlow', 'packages', 'cli', 'dist', 'cli.cjs');

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`✗ ${msg}`);
};
const pass = (msg) => console.log(`✓ ${msg}`);

/**
 * One run, returning its SARIF document and its `results.json`.
 *
 * Both artifacts are **deleted first, not merely overwritten** — a run that dies before it writes
 * leaves the previous run's files in place, and this script would grade one env's document as
 * another's and report a long list of confident, meaningless mismatches. `verify-security-
 * acceptance.mjs` did exactly that once, which is why its `runCorpus` opens the same way.
 *
 * `sarif` is `null` when no document was written, which is a legitimate outcome (D404) and one
 * assertion below depends on being able to see it.
 */
function runCorpus(env, files, extraArgs = []) {
  rmSync(sarifPath, { force: true });
  rmSync(resultsPath, { force: true });
  const args = [TFLW_BIN, 'run', '--env', env, '--no-color', ...extraArgs, ...files];
  const r = spawnSync(process.execPath, args, { cwd: corpus, encoding: 'utf8', shell: false, env: CHILD_ENV });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  let results;
  try {
    results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  } catch (e) {
    console.error(`could not read the run report for --env ${env} (${files.join(' ')}): ${e.message}`);
    console.error(`  (tflw binary: ${TFLW_BIN})`);
    console.error(output.trimEnd().split('\n').slice(-25).join('\n'));
    process.exit(1);
  }
  let sarif = null;
  try {
    sarif = JSON.parse(readFileSync(sarifPath, 'utf8'));
  } catch {
    sarif = null;
  }
  return { sarif, results, output };
}

const resultsOf = (doc) => doc?.runs?.[0]?.results ?? [];
const rulesOf = (doc) => doc?.runs?.[0]?.tool?.driver?.rules ?? [];
const notApplicableOf = (doc) => doc?.runs?.[0]?.properties?.['tflw/notApplicable'] ?? [];
const endpointOf = (res) => res.properties?.['tflw/endpoint'];
const fingerprintOf = (res) => res.partialFingerprints?.tflwFindingV1;

// ---------------------------------------------------------------------------
// The four graded runs
// ---------------------------------------------------------------------------

const documents = [];
for (const spec of RUNS) {
  const { sarif } = runCorpus(spec.env, spec.files);
  if (!sarif) {
    fail(`[${spec.name}] no findings.sarif was written — every one of these runs evaluates a security assertion, so D404's condition is met and the file is not optional`);
    continue;
  }
  documents.push({ ...spec, doc: sarif });
  pass(`[${spec.name}] wrote findings.sarif — ${resultsOf(sarif).length} result(s), ${rulesOf(sarif).length} rule(s) applied`);
}

/** Every result from every graded run, with the run it came from kept alongside it — a plant that
 *  appears in the wrong document is still a plant that appeared, and this is the only place that
 *  distinction could be lost. */
const allResults = documents.flatMap(({ name, doc }) => resultsOf(doc).map((res) => ({ res, run: name })));

// ---------------------------------------------------------------------------
// D415 — every positive plant, with its rule, level and security-severity
// ---------------------------------------------------------------------------

console.log('\nD415 — the planted weaknesses, in the document:\n');

for (const plant of PLANTS.filter((p) => p.kind === 'positive')) {
  for (const [rule, severity] of Object.entries(plant.rules)) {
    const hits = allResults.filter(({ res }) => res.ruleId === rule && endpointOf(res) === plant.endpoint);
    if (hits.length === 0) {
      fail(`${plant.id} — no result for ${rule} on \`${plant.endpoint}\`. Either the rule stopped reaching the document, or this ledger row and VULNS.md have drifted`);
      continue;
    }
    const want = SEVERITY[severity];
    const wrongLevel = hits.filter(({ res }) => res.level !== want.level);
    if (wrongLevel.length > 0) {
      fail(`${plant.id} — ${rule} is \`${wrongLevel[0].res.level}\`, expected \`${want.level}\` for a ${severity} finding`);
      continue;
    }
    const descriptor = rulesOf(documents.find((d) => d.name === hits[0].run).doc).find((r) => r.id === rule);
    if (!descriptor) {
      fail(`${plant.id} — ${rule} produced a result but is absent from rules[]; the document describes a finding it cannot explain`);
      continue;
    }
    const got = descriptor.properties?.['security-severity'];
    if (typeof got !== 'string') {
      fail(`${plant.id} — ${rule}'s security-severity is ${typeof got}, not a string. GitHub ignores a numeric one silently and ranks the alert wrong`);
      continue;
    }
    if (got !== want.securitySeverity) {
      fail(`${plant.id} — ${rule} carries security-severity ${got}, expected ${want.securitySeverity} for ${severity}`);
      continue;
    }
    pass(`${plant.id} — ${rule} on \`${plant.endpoint}\`: ${hits.length} result(s), ${want.level}, security-severity "${got}"`);
  }
}

console.log('\nD415 — the negatives and the unjudgeable, absent:\n');

for (const plant of PLANTS.filter((p) => p.kind === 'negative')) {
  const hits = allResults.filter(({ res }) => endpointOf(res) === plant.endpoint);
  if (hits.length > 0) {
    fail(`${plant.id} — \`${plant.endpoint}\` produced ${hits.length} result(s) (${[...new Set(hits.map((h) => h.res.ruleId))].join(', ')}); this endpoint is planted to produce none`);
    continue;
  }
  pass(`${plant.id} — \`${plant.endpoint}\` produced no result, as planted`);
}

// ---------------------------------------------------------------------------
// D405 / risk 3 — the URI's form, which nothing downstream checks
// ---------------------------------------------------------------------------

console.log('\nD405 — every physical location anchors to a file this repository actually has:\n');

{
  let checked = 0;
  let logicalOnly = 0;
  const seenUris = new Set();
  for (const { res, run } of allResults) {
    const loc = res.locations?.[0];
    if (!loc) {
      fail(`[${run}] ${res.ruleId} has no locations at all`);
      continue;
    }
    const physical = loc.physicalLocation;
    if (!physical) {
      // Legal, and the documented degradation for a finding with no usable file. Counted rather
      // than passed over: if every result took this path the checks below would vacuously pass.
      logicalOnly += 1;
      continue;
    }
    const artifact = physical.artifactLocation ?? {};
    const uri = artifact.uri;
    checked += 1;
    if (typeof uri !== 'string' || uri === '') {
      fail(`[${run}] ${res.ruleId} has a physicalLocation with no uri`);
      continue;
    }
    if (artifact.uriBaseId !== '%SRCROOT%') {
      fail(`[${run}] ${res.ruleId} anchors to "${uri}" with uriBaseId ${JSON.stringify(artifact.uriBaseId)} — a relative uri with no base is resolved against nothing in particular`);
      continue;
    }
    if (uri.startsWith('/') || /^[A-Za-z]:/.test(uri) || uri.startsWith('../') || uri.includes('/../')) {
      fail(`[${run}] ${res.ruleId} anchors to "${uri}", which is not a path inside the repository`);
      continue;
    }
    // The assertion this whole section exists for. A uri that is *shaped* correctly and names a
    // file the repository does not have is exactly what a cwd-relative path looks like, and it is
    // indistinguishable from a correct one until something resolves it. Nothing downstream does.
    try {
      readFileSync(join(repoRoot, uri));
    } catch {
      fail(`[${run}] ${res.ruleId} anchors to "${uri}", which does not exist under the repository root. This is what a path relative to the *run's* directory looks like — the alert would upload and match no file`);
      continue;
    }
    seenUris.add(uri);
  }
  if (checked === 0) fail('no result carried a physicalLocation at all, so nothing above was actually checked');
  else pass(`${checked} physical location(s) across ${seenUris.size} file(s), each repo-relative under %SRCROOT% and each naming a file that exists`);
  if (logicalOnly > 0) console.log(`  (${logicalOnly} result(s) carried a logical location only — legal, and the documented degradation)`);
}

// ---------------------------------------------------------------------------
// R8 — the fingerprint is the identity a tracking system dedupes on
// ---------------------------------------------------------------------------

console.log('\nR8 — the same weakness keeps the same identity across runs:\n');

{
  const first = documents.find((d) => d.name === 'security @ secureLocal');
  const { sarif: second } = runCorpus('secureLocal', ['positives.tflw', 'negatives.tflw', 'authz.tflw']);
  const idsOf = (doc) => resultsOf(doc).map(fingerprintOf).sort();
  const a = idsOf(first.doc);
  const b = idsOf(second);
  const missing = a.filter((x) => !x);
  if (missing.length > 0) {
    fail(`${missing.length} result(s) carry no partialFingerprints. GitHub falls back to hashing the location, so every one of them is a fresh permanent alert on the next run`);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    // Printed as the two sets rather than a count: "unstable" is not actionable, and the *shape* of
    // the difference says which input leaked into the identity (an id, a timestamp, an ordering).
    fail(`the fingerprint set changed between two consecutive runs of the same corpus\n    run 1: ${a.join(', ')}\n    run 2: ${b.join(', ')}`);
  } else {
    pass(`${a.length} fingerprint(s), identical across two consecutive runs of the same corpus`);
  }
}

// ---------------------------------------------------------------------------
// D411 — seeded findings are absent, because they cannot be keyed
// ---------------------------------------------------------------------------

console.log('\nD411 — a generated payload never reaches a system that dedupes on identity:\n');

{
  const { sarif, results } = runCorpus('secureLocal', ['input.tflw'], ['--probe-seeded', '2']);
  const findings = results.findings ?? [];
  const seeded = findings.filter((f) => f.seeded);
  if (seeded.length === 0) {
    // Not a pass. D363's lesson from `M132b`, restated for this milestone: an assertion about a
    // thing the run never produced "passes" on nothing. If `--probe-seeded 2` draws no finding, the
    // exclusion below is untested and saying so is the only honest outcome.
    fail('`--probe-seeded 2` produced no seeded finding, so the exclusion this section asserts was never exercised — check that the seeded layer still reaches an already-granted payload class');
  } else {
    const results2 = resultsOf(sarif);
    const leaked = results2.filter((res) => seeded.some((s) => res.message?.text === s.detail));
    if (leaked.length > 0) {
      fail(`${leaked.length} seeded finding(s) reached the SARIF document; each carries no fingerprint by construction, so each is a permanent alert that a reseed replaces rather than matches`);
    } else if (results2.length !== findings.length - seeded.length) {
      fail(`the document carries ${results2.length} result(s) for ${findings.length - seeded.length} non-seeded finding(s) — the two should be exactly the same set`);
    } else {
      pass(`${seeded.length} seeded finding(s) in results.json, 0 in findings.sarif, and the other ${results2.length} present`);
    }
  }
}

// ---------------------------------------------------------------------------
// D410 — `baseline` suppresses; `--fail-on` does not
// ---------------------------------------------------------------------------

console.log('\nD410 — accepted and unranked are different states in the document:\n');

{
  const base = documents.find((d) => d.name === 'security @ secureLocal');
  const target = resultsOf(base.doc).find((res) => fingerprintOf(res));
  if (!target) {
    fail('no fingerprinted result to baseline, so this section could not run');
  } else {
    // **One entry, not the whole run.** `--baseline-write` would accept everything, every result
    // would come back suppressed, and an exporter that suppressed unconditionally would pass. The
    // control is the contrast: exactly this finding dismissed, and every other one ordinary.
    const name = 'sarif-acceptance-baseline.json';
    const file = join(corpus, name);
    writeFileSync(
      file,
      `${JSON.stringify({ version: 1, accepted: [{ fingerprint: fingerprintOf(target), rule: target.ruleId, endpoint: endpointOf(target) }] }, null, 2)}\n`,
    );
    try {
      const { sarif } = runCorpus('secureLocal', ['positives.tflw', 'negatives.tflw', 'authz.tflw'], ['--baseline', name, '--fail-on', 'critical']);
      const results3 = resultsOf(sarif);
      const baselined = results3.find((res) => fingerprintOf(res) === fingerprintOf(target));
      const others = results3.filter((res) => fingerprintOf(res) !== fingerprintOf(target));
      if (!baselined) {
        fail('the baselined finding vanished from the document. A suppression is a dismissed alert, not a deleted one — dropping it makes the next reader think it was fixed');
      } else if (!Array.isArray(baselined.suppressions) || baselined.suppressions.length === 0) {
        fail(`the baselined ${baselined.ruleId} carries no suppressions[], so it uploads as an ordinary open alert despite a human having accepted it`);
      } else if (baselined.suppressions[0].kind !== 'external') {
        fail(`the suppression is kind "${baselined.suppressions[0].kind}"; a decision recorded outside the tool is \`external\``);
      } else if (others.some((res) => res.suppressions)) {
        const bad = others.find((res) => res.suppressions);
        fail(`${bad.ruleId} is suppressed without being in the baseline — most likely \`--fail-on\` suppressing too, which collapses "a human accepted this" onto "a flag ranked this out"`);
      } else {
        pass(`the baselined ${baselined.ruleId} uploads suppressed (external); the other ${others.length} result(s) upload open, including the ones below the critical floor`);
      }
    } finally {
      rmSync(file, { force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// D412 — the three-state coverage model, in SARIF's own vocabulary
// ---------------------------------------------------------------------------

console.log('\nD412 — a rule that stood down is named, not merely missing:\n');

{
  let sawNotApplicable = false;
  for (const { name, doc } of documents) {
    const stoodDown = notApplicableOf(doc);
    const applied = new Set(rulesOf(doc).map((r) => r.id));
    const overlap = stoodDown.filter((n) => applied.has(n.rule));
    if (overlap.length > 0) {
      // Both at once is not a contradiction — different assertions in one run can reach different
      // responses — so this is reported and not failed. It is here because a document where *every*
      // rule appears on both sides would satisfy every other check in this section.
      console.log(`  (${name}: ${overlap.length} rule(s) both applied somewhere and stood down elsewhere — expected when one run makes several requests)`);
    }
    for (const n of stoodDown) {
      if (!n.rule || !Array.isArray(n.because) || n.because.length === 0) {
        fail(`[${name}] a tflw/notApplicable entry carries no reason: ${JSON.stringify(n)}. "Not applicable" without why is the empty state this whole model exists to avoid`);
      }
    }
    if (stoodDown.length > 0) {
      sawNotApplicable = true;
      pass(`[${name}] ${stoodDown.length} rule(s) stood down, each with its unmet precondition — e.g. ${stoodDown[0].rule}: ${stoodDown[0].because[0]}`);
    }
  }
  if (!sawNotApplicable) {
    fail('no run reported a single stood-down rule, so D412\'s third state is not demonstrated anywhere in this corpus');
  }
}

// ---------------------------------------------------------------------------
// Every result's rule is in the catalog
// ---------------------------------------------------------------------------

{
  let orphans = 0;
  for (const { name, doc } of documents) {
    const ids = rulesOf(doc).map((r) => r.id);
    for (const res of resultsOf(doc)) {
      if (!ids.includes(res.ruleId)) {
        fail(`[${name}] result ${res.ruleId} has no entry in rules[] — the document reports a finding it cannot describe, and the alert arrives with no remediation`);
        orphans += 1;
      }
      if (res.ruleIndex !== undefined && ids[res.ruleIndex] !== res.ruleId) {
        fail(`[${name}] result ${res.ruleId} carries ruleIndex ${res.ruleIndex}, which points at ${ids[res.ruleIndex] ?? '(nothing)'}`);
        orphans += 1;
      }
    }
  }
  if (orphans === 0) pass('every result names a rule the document also describes, and every ruleIndex points at it');
}

// ---------------------------------------------------------------------------
// The artifact (D415)
// ---------------------------------------------------------------------------

// Copied into the root `report/` rather than left in the corpus, because that is the directory
// `archivePhaseReport` moves into `report-by-phase/<phase>/` and CI already uploads. D415 asks for
// the document to be archived as a plain artifact; doing it here costs no workflow change and
// cannot drift from where the phase actually writes.
{
  // Straight into `report/`, not a subdirectory of it: `archivePhaseReport` renames the whole
  // directory to `report-by-phase/sarif-acceptance/`, so a folder of the same name inside it would
  // arrive as `sarif-acceptance/sarif-acceptance/findings.sarif`.
  const dest = join(repoRoot, 'report');
  mkdirSync(dest, { recursive: true });
  try {
    cpSync(sarifPath, join(dest, 'findings.sarif'));
    cpSync(resultsPath, join(dest, 'results.json'));
  } catch {
    // The last run is the baseline one and it always writes; if it did not, the failure is already
    // reported above and losing the copy is not a second finding.
  }
}

console.log('');
if (failures > 0) {
  console.log(`✗ SARIF acceptance: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('✓ SARIF acceptance: the document says what VULNS.md says, and every alert in it anchors to a real file');
