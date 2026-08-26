#!/usr/bin/env node
// `M154g` step 1 — measure the cheap/expensive split, rather than assert it.
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
// So the measurement is a negative test, one construct at a time:
//
//   1. find the corpus sites that use the construct           (`--discover`, static, no stack)
//   2. perturb ONE site so the construct's contribution is wrong, on a scratch copy of the corpus
//   3. run the files that cover it, and record whether anything went red
//
// Step 3 needs the apiV2 stack and a quiet box, so the two halves are separate verbs. Discovery
// alone already settles some of the list — a construct with no sites at all cannot be cheap,
// whatever its occurrence count in tflw's own manual says — but discovery alone is NOT the
// measurement, and this script refuses to print a cheap/expensive verdict from it. That refusal is
// the point: reporting shape as if it were behaviour is the substitution the milestone exists to
// avoid, and it is exactly what `M154f` caught its own graders doing.
//
//   node scripts/measure-construct-evidence.mjs --discover [--json]
//   node scripts/measure-construct-evidence.mjs --probe [--only <id>] [--json]
//
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATCHET } from './lib/constructs.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;

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
  'declaration:test':        { find: /^\s*test\s+"/,                     break: null, note: 'the block itself; breaking it is not a perturbation but a deletion' },
  'declaration:action':      { find: /^\s*action\s+\w+\s*\(/,            break: { re: /\bgive\b/, with: 'give' }, note: 'body returns; perturb the give' },
  'declaration:import':      { find: /^\s*import\s+"/,                   break: null },
  'declaration:use':         { find: /^\s*use\s+"/,                      break: null },
  'declaration:before':      { find: /^\s*before\b/,                     break: null },
  'declaration:tags':        { find: /^\s*@[A-Za-z]/,                    break: null },
  'declaration:with-each':   { find: /^\s*with\s+each\b/,                break: null },
  'declaration:as':          { find: /^\s*test\s+.*\bas\s+\w/,           break: null, approximate: true },
  'declaration:concurrency': { find: /^\s*test\s+.*\b(parallel|sequential)\b/, break: null, approximate: true },
  // --- step (6) ---
  'step:api':      { find: /^\s*api\s+/,     break: null },
  'step:wait':     { find: /^\s*wait\s+/,    break: null },
  'step:expect':   { find: /^\s*expect\s+/,  break: null },
  'step:let':      { find: /^\s*let\s+/,     break: null },
  'step:capture':  { find: /^\s*capture\s+/, break: null },
  'step:log':      { find: /^\s*log\s+/,     break: null },
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

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'vendor') continue;
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
      // The ONLY verdict discovery is allowed to reach. Everything else waits for `--probe`.
      verdict: sites.length === 0 ? 'expensive:no-sites' : 'unmeasured',
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
      const v = r.verdict === 'expensive:no-sites' ? '  NO SITES' : '';
      console.log(`${flag}${r.id.padEnd(44)} ${String(r.sites).padStart(5)} sites  ${String(r.files).padStart(3)} files${v}`);
    }
  }
  const none = rows.filter((r) => r.verdict === 'expensive:no-sites');
  console.log(`\n${rows.length} unrostered non-diagnostic constructs measured for sites.`);
  console.log(`${none.length} have NO corpus site at all — those cannot be cheap, whatever their usage count elsewhere.`);
  console.log(`${rows.length - none.length} remain UNMEASURED: a site count is corpus shape, not evidence.`);
  console.log(`Run --probe on a quiet box with the stack up to turn shape into behaviour.`);
}
