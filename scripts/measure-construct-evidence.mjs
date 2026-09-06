#!/usr/bin/env node
// `M154g` step 1 — corpus shape per construct. Half a measurement, and it says so.
//
// **The behavioural half (`--probe`) was specified, never implemented, and deleted by `D826`
// (`M163d`) rather than built.** See "So the measurement is a negative test" below.
//
// WHY THIS SCRIPT EXISTS. `M154g`'s scoping divides the unrostered remainder into a cheap end (the
// workhorses: "the evidence exists and the claim is missing") and an expensive end (the twelve
// generators: "each needs an observable built"). That division was written on the strength of
// occurrence counts, and the plan says so in as many words — *"the cheap/expensive split in 2-4 is
// asserted, not measured, and measuring it is `M154g`'s first step"*. `M154d` is the reason for the
// caution: it found three constructs whose known answer sat in a test comment no gate read, and one
// whose comment claimed something nothing checked. Occurrence counts predicted neither.
//
// WHAT "CHEAP" HAS TO MEAN FOR THE MEASUREMENT TO BE WORTH TAKING. Not "is it used a lot" and not
// "does a gate run the file it appears in". Both are properties of the corpus's *shape*. The claim
// `M154g` wants to make is a property of its *behaviour*: **if this construct silently misbehaved,
// would anything here go red?** If yes, the construct is cheap — a `CONSTRUCTS.md` row and a pointer
// at the plant that already fails. If no, an observable has to be built first, and that is the
// expensive end wherever it actually falls.
//
// The measurement was designed as a negative test, one construct at a time:
//
//   1. find the corpus sites that use the construct           (static, no stack)      <- built
//   2. perturb ONE site so the construct's contribution is wrong, on a scratch copy   <- never built
//   3. run the files that cover it, and record whether anything went red              <- never built
//
// **Steps 2 and 3 were `--probe`, and `D826` (`M163d`) deleted the verb instead of building it.**
// Only step 1 was ever implemented. `--probe` was parsed by nothing — `argv` reads `--json` and
// `--only` and neither verb — so `--discover` and `--probe` produced byte-identical output, and the
// run closed by printing *"Run --probe on a quiet box with the stack up to turn shape into
// behaviour"*: a script instructing its reader to run a verb it does not implement. That is
// `M154g`'s own subject committed by `M154g`'s own instrument, one milestone after `M154f` caught
// three graders doing it (`M154g-02`).
//
// **It was deleted rather than finished because its consumer no longer existed at the time, not
// because it is expensive.** `--probe` existed to sequence the rostering of the unrostered
// remainder — measure which constructs are cheap to roster, do those first. When `D826` deleted it
// that remainder was empty, so a cheap/expensive split would have sequenced nothing. The work got
// done by hand and came out right, which is evidence about that plan and not a general licence —
// recorded here so the next reader of `M154g` step 1 learns it from this paragraph rather than from
// an empty verb.
//
// `M178a`: that paragraph stated the remainder's size as a literal and `M176c` refilled it, so the
// sentence was false within hours (`M176-07`). The size is not restated here any more — it is in
// `lib/constructs.mjs` and printed by `verify:construct-coverage` — and the deletion argument is
// written against the state at the time, which is what it was actually about. Whether a refilled
// ratchet is reason to rebuild `--probe` is a live question this file does not answer.
//
// **What this script still does, and what that is worth today.** It reports corpus *shape* — site
// counts per construct — and it refuses to call that behaviour. It iterates whatever is on the
// `RATCHET`, which is a number this paragraph deliberately does not restate. The `find` patterns are
// kept deliberately: `D827` names the roster-vacuity gate (`M164`) as the instrument this repository
// actually lacks, and it wants them.
//
// Discovery alone was never the measurement, and this script still refuses to print a
// cheap/expensive verdict from it. That refusal is the point: reporting shape as if it were
// behaviour is the substitution the milestone exists to avoid.
//
//   node scripts/measure-construct-evidence.mjs [--only <id>] [--json]
//
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATCHET } from './lib/constructs.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;

// `M163d`. **Deleting a verb silently is the same defect one layer down.** `--probe` and
// `--discover` were both accepted-by-being-ignored before this milestone — `argv` read neither, so
// the two produced byte-identical output and the script closed by telling the reader to run one of
// them. Removing the words from the usage block would leave anyone with the old invocation in their
// shell history, or in `M154g`'s plan, getting a plausible zeros report and no indication that the
// verb is gone. Named refusal instead: the flags that were never implemented say so, and any other
// unknown flag is refused rather than absorbed.
{
  const RETIRED = { '--probe': 'D826 (M163d)', '--discover': 'D826 (M163d) — discovery is now the only mode, so the flag is redundant' };
  const KNOWN = new Set(['--json', '--only']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') { i++; continue; }
    if (KNOWN.has(a)) continue;
    if (a in RETIRED) {
      console.error(`${a} was removed by ${RETIRED[a]}.`);
      if (a === '--probe') {
        console.error('  It was specified and never implemented: it perturbed nothing, ran nothing, and its');
        console.error('  output was byte-identical to a bare run. Deleted rather than built because the');
        console.error('  remainder it existed to sequence was empty at the time. This script reports');
        console.error('  corpus shape only, and no instrument here turns that into behaviour.');
      }
      console.error('  usage: node scripts/measure-construct-evidence.mjs [--only <id>] [--json]');
      process.exit(2);
    }
    console.error(`unknown flag: ${a}`);
    console.error('usage: node scripts/measure-construct-evidence.mjs [--only <id>] [--json]');
    process.exit(64);
  }
}

/**
 * How each construct is spotted in the corpus, and how it would be broken.
 *
 * `find` is deliberately conservative — anchored at a line start wherever the construct is a
 * statement keyword — because an over-broad pattern inflates the site count and a site count is the
 * one thing this script must not quietly turn into a verdict. Where a construct has no honest
 * textual signature (`declaration:as` inside a `test` header, `declaration:concurrency`), the
 * pattern says so and the entry carries `approximate: true`.
 *
 * `break` is the perturbation `--probe` applies: a rewrite that leaves the file parseable but makes
 * the construct's own contribution wrong. Parseable matters — a syntax error reddens everything and
 * would score every construct "cheap" for the wrong reason, which is this measurement's version of a
 * vacuous gate.
 */
const PROBES = {
  // --- declaration (9) ---
  'declaration:test':        { find: /^\s*test\s+"/, note: 'the block itself; breaking it is not a perturbation but a deletion' },
  'declaration:action':      { find: /^\s*action\s+\w+\s*\(/, note: 'body returns; perturb the give' },
  'declaration:import':      { find: /^\s*import\s+"/ },
  'declaration:use':         { find: /^\s*use\s+"/ },
  'declaration:before':      { find: /^\s*before\b/ },
  'declaration:tags':        { find: /^\s*@[A-Za-z]/ },
  'declaration:with-each':   { find: /^\s*with\s+each\b/ },
  'declaration:as':          { find: /^\s*test\s+.*\bas\s+\w/, approximate: true },
  'declaration:concurrency': { find: /^\s*test\s+.*\b(parallel|sequential)\b/, approximate: true },
  // --- step (6) ---
  'step:api':      { find: /^\s*api\s+/ },
  'step:wait':     { find: /^\s*wait\s+/ },
  'step:expect':   { find: /^\s*expect\s+/ },
  'step:let':      { find: /^\s*let\s+/ },
  'step:capture':  { find: /^\s*capture\s+/ },
  'step:log':      { find: /^\s*log\s+/ },
  // --- matcher (9) ---
  'matcher:equals':            { find: /\bequals\b/ },
  'matcher:contains':          { find: /\bcontains\b/ },
  'matcher:matches-regex':     { find: /\bmatches\s+"/ },
  'matcher:matches-subset':    { find: /\bmatches\s+subset\b/ },
  'matcher:matches-schema':    { find: /\bmatches\s+schema\b/ },
  'matcher:greater-less-than': { find: /\bis\s+(greater|less)\s+than\b/ },
  'matcher:has-count':         { find: /\bhas\s+count\b/ },
  'matcher:was-made':          { find: /\bwas\s+made\b/ },
  'matcher:has-no-input-handling-violations': { find: /\bhas\s+no\b.*\binput\s+handling\s+violations\b/ },
  // --- generator (12) — the family the milestone predicts is expensive ---
  'generator:unique-prefix':   { find: /\bunique\s*\(/ },
  'generator:unique-email':    { find: /\bunique\s+email\b/ },
  'generator:unique-number':   { find: /\bunique\s+number\b/ },
  'generator:unique-like':     { find: /\bunique\s+like\b/ },
  'generator:unique-uuid':     { find: /\bunique\s+uuid\b/ },
  'generator:random-number':   { find: /\brandom\s+(number|decimal)\b/ },
  'generator:random-date':     { find: /\brandom\s+date\b/ },
  'generator:random-of':       { find: /\brandom\s+of\b/ },
  'generator:random-string':   { find: /\brandom\s+string\b/ },
  'generator:random-like':     { find: /\brandom\s+like\b/ },
  'generator:random-uuid':     { find: /\brandom\s+uuid\b/ },
  'generator:random-password': { find: /\brandom\s+password\b/ },

  // --- subject (13 of 15) ---
  //
  // `M178a` (`M178-01`). `M176c` put fifteen `subject:*` ids on the `RATCHET` and this table had
  // none of them, so `discover()` fell through its `if (probe?.find)` and scored every one
  // `expensive:no-sites` — the script printed **"15 have NO corpus site at all"** about fifteen
  // constructs it had never searched for. `subject:status` has **1357** sites in 204 files.
  //
  // Each pattern below was measured against the corpus before it was written, not derived from the
  // grammar: `expect status equals 200`, `capture body.accessToken as adminToken`. The subject is
  // the first word after the assertion or capture keyword, which is why these anchor on that keyword
  // rather than on a line start alone — a bare `\bstatus\b` matches prose in a comment and the
  // docblock above is explicit that an over-broad pattern is the failure this script must not have.
  //
  // **`subject:network-request` and `subject:value` are deliberately absent.** The analogous pattern
  // finds no site for either, and this repository's vendored build is `manifest 2`'s predecessor —
  // 183 constructs, not 199 — so their written forms cannot be read back from `tflw spec --json`
  // here to tell a true zero from a wrong spelling. An unverified pattern that returns zero is the
  // exact defect this block repairs, one spelling further along, so they stay unprobed and the
  // report says `NO PROBE` rather than `NO SITES`.
  'subject:status':          { find: /^\s*(expect|check|capture)\s+status\b/ },
  'subject:duration':        { find: /^\s*(expect|check|capture)\s+duration\b/ },
  'subject:header':          { find: /^\s*(expect|check|capture)\s+header\b/ },
  'subject:body':            { find: /^\s*(expect|check|capture)\s+body(?:[\s.[]|$)/ },
  'subject:body-text':       { find: /^\s*(expect|check|capture)\s+body\s+text\b/ },
  'subject:body-bytes':      { find: /^\s*(expect|check|capture)\s+body\s+bytes\b/ },
  'subject:body-csv':        { find: /^\s*(expect|check|capture)\s+body\s+csv\b/ },
  'subject:body-pdf-text':   { find: /^\s*(expect|check|capture)\s+body\s+pdf\s+text\b/ },
  'subject:request':         { find: /^\s*(expect|check|capture)\s+request\b/ },
  'subject:page':            { find: /^\s*(expect|check|capture)\s+page\b/ },
  'subject:response':        { find: /^\s*(expect|check|capture)\s+response\b/ },
  'subject:dialog-message':  { find: /^\s*(expect|check|capture)\s+dialog\s+message\b/ },
  'subject:dialog-type':     { find: /^\s*(expect|check|capture)\s+dialog\s+type\b/ },
};

/** Config constructs live in `tflw.config` files, not in `.tflw` bodies, so they scan separately. */
const CONFIG_PROBES = {
  'config:directive:defaults': /^\s*defaults\b/,
  'config:directive:env':      /^\s*env\s+/,
  'config:directive:session':  /^\s*session\s+/,
  'config:directive:require':  /^\s*require\b/,
  'config:directive:exclude':  /^\s*exclude\b/,
  'config:key:header':   /^\s*header\s+/,
  'config:key:timeout':  /^\s*timeout\s+/,
  'config:key:workers':  /^\s*workers\s+/,
  'config:key:report':   /^\s*report\s+/,
  'config:key:web':      /^\s*web\b/,
  'config:key:api':      /^\s*api\b/,
  'config:key:insecure': /^\s*insecure\b/,
  'config:key:cert':     /^\s*cert\s+/,
  'config:key:key':      /^\s*key\s+/,
  'config:key:allow':    /^\s*allow\b/,
  'config:key:log':      /^\s*log\b/,
  'config:probe:oversized': /\boversized\b/,
  'config:probe:traversal': /\btraversal\b/,
};

// `M178a` (`M178-02`). The walk used to skip three names and take everything else, which meant the
// corpus was *the working tree* rather than the repository — so any `.tflw` anybody had left lying
// around counted. Measured when the subject probes landed: `tests/.scratch/m162/arm-b.tflw` alone
// contributed **240** `subject:status` sites and 120 `subject:body` sites, and the four untracked
// files together supplied 300 of the 1657 this script reported — **18%** of the published number,
// from files no reviewer would call corpus. One of them was a probe fixture this very session had
// written an hour earlier, which is the cleanest possible demonstration: the instrument was reading
// its own operator's scratch and reporting it as a property of the repository.
//
// Scratch is excluded by name rather than by asking git, because `exec.mjs` rsyncs this tree to the
// box **without** `.git` and a corpus rule that silently changes shape depending on which machine
// runs it is worse than one that is slightly coarse on both. `tests/.checkonly/` is tracked corpus
// and stays in; `M171-01` is why the corpus is now stated in the output instead of assumed.
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '.scratch']);
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.endsWith('-scratch')) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const tflwFiles = files.filter((f) => f.endsWith('.tflw'));
const configFiles = files.filter((f) => path.basename(f) === 'tflw.config');

/** Every site of every construct, as `{file, line, text}`. */
function discover() {
  const rows = [];
  const targets = RATCHET.filter((c) => !c.startsWith('diagnostic:'));
  for (const id of targets) {
    if (only && id !== only) continue;
    const isConfig = id.startsWith('config:');
    const probe = isConfig ? { find: CONFIG_PROBES[id] } : PROBES[id];
    const scan = isConfig ? configFiles : tflwFiles;
    const sites = [];
    if (probe?.find) {
      for (const file of scan) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((text, i) => {
          if (probe.find.test(text)) sites.push({ file: path.relative(ROOT, file), line: i + 1, text: text.trim().slice(0, 100) });
        });
      }
    }
    rows.push({
      id,
      family: id.split(':')[0],
      pattern: probe?.find ? String(probe.find) : null,
      approximate: Boolean(probe?.approximate),
      sites: sites.length,
      files: [...new Set(sites.map((s) => s.file))].length,
      examples: sites.slice(0, 3),
      // The ONLY verdict this script is allowed to reach about *behaviour*. There is no second one:
      // `--probe` was specified, never implemented, and deleted by `D826` rather than built.
      //
      // `M178a` (`M178-01`) adds a third value that is not a verdict at all but a refusal. Until it,
      // a construct with no entry in `PROBES` skipped the scan entirely and fell into
      // `expensive:no-sites` — indistinguishable in the output from one that was searched for and
      // genuinely absent. Those two states are opposites: one says *the corpus does not use this*,
      // the other says *this script cannot see it*, and the second was printed as the first for all
      // fifteen `subject:*` ids from `M176c` until here. A zero from a scan that never ran is
      // `M141`'s shape, and the reason it survived is that nothing gates this script's output.
      verdict: !probe?.find ? 'unmeasured:no-probe' : sites.length === 0 ? 'expensive:no-sites' : 'unmeasured',
    });
  }
  return rows;
}

const rows = discover();

if (JSON_OUT) {
  console.log(JSON.stringify({ v: 1, mode: 'discover', targets: rows.length, rows }, null, 2));
} else {
  const byFamily = {};
  for (const r of rows) (byFamily[r.family] ??= []).push(r);
  for (const [family, list] of Object.entries(byFamily)) {
    console.log(`\n── ${family} (${list.length}) ─────────────────────────────`);
    for (const r of list) {
      const flag = r.approximate ? ' ~' : '  ';
      const v = r.verdict === 'expensive:no-sites' ? '  NO SITES'
        : r.verdict === 'unmeasured:no-probe' ? '  NO PROBE — not searched for, which is not the same as absent'
        : '';
      console.log(`${flag}${r.id.padEnd(44)} ${String(r.sites).padStart(5)} sites  ${String(r.files).padStart(3)} files${v}`);
    }
  }
  const none = rows.filter((r) => r.verdict === 'expensive:no-sites');
  const blind = rows.filter((r) => r.verdict === 'unmeasured:no-probe');
  // `M163d`, corrected by `M178a`. This branch used to state the ratchet's size and ceiling as
  // literals — `RATCHET` is empty, `RATCHET_CEILING` is 0 — and `M176c` made both false four hours
  // after raising the ceiling to 15 (`M176-07`). The numbers live in `lib/constructs.mjs` and are
  // printed by `verify:construct-coverage`; restating them here bought nothing and went stale.
  // What the branch is *for* survives: zero rows is a state, not an empty report, so say so.
  if (rows.length === 0) {
    console.log('\nNo targets: `RATCHET` is empty, so this script has nothing to measure the shape');
    console.log('of. That is the state, not a failure. `verify:construct-coverage` prints its size.');
  }
  // `M171-01`. State the corpus, do not imply it: a count is only as good as what was counted, and
  // the previous version of this line did not exist at all.
  console.log(`\ncorpus: ${tflwFiles.length} .tflw file(s) and ${configFiles.length} tflw.config file(s), all of them read`
    + ' — scratch directories excluded, so this is the repository and not the working tree.');
  console.log(`${rows.length} unrostered non-diagnostic constructs on the ratchet.`);
  console.log(`${rows.length - blind.length} were searched for; ${blind.length} have no probe in this file and were NOT searched for.`);
  console.log(`${none.length} were searched for and have NO corpus site at all — those cannot be cheap, whatever their usage count elsewhere.`);
  console.log(`${rows.length - none.length - blind.length} remain UNMEASURED: a site count is corpus shape, not evidence.`);
  if (blind.length) {
    console.log(`\nNot searched for (${blind.map((r) => r.id).join(', ')}): this script has no pattern for them.`);
    console.log('That is a gap in this file, not a fact about the corpus — do not read it as absence.');
  }
  // `D826`/`M163d`. This line used to read "Run --probe on a quiet box with the stack up to turn
  // shape into behaviour" — a verb this script never implemented, instructing the reader to run it.
  console.log(`Shape only. Nothing in this repository turns these site counts into behaviour (D826).`);
}
