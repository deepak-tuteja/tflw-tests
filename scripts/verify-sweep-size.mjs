#!/usr/bin/env node
// `D767`/`D857` — no tracked file in this repository states how many phases the regression sweep has.
//
// THE HOLE THIS CLOSES. `D504` keeps the phase *list* out of prose because a copy of it would be a
// copy with no guard. `D767` extended that to the *count*, which is the same copy compressed, after
// `M154g-14` found `CONTRIBUTING.md` claiming 30 while `PHASES` held 38. That repair named four
// files and removed seven occurrences, and `verify-contributing.mjs` was pointed at one of them.
//
// `M166-02` found the count still in six files eight days later — `scripts/regression.mjs:9` among
// them, a file `M154g-14`'s status cell lists as repaired. `git log -L 9,9` puts that line's last
// write two days *before* the repair, so the pass missed a line already sitting there and the closed
// row carried a false close-claim. By then the sweep printed "All 40 phases passed" and the tracked
// tree offered three different answers: 30, 31 and 32.
//
// **A repair spanning six files with a guard covering one looks complete for exactly as long as
// nobody counts.** That is what this gate is: the guard widened to the set the repair actually had.
//
// WHAT IT FORBIDS. A numeral bound to the word `phase`/`phases`, with at most one word between them
// — "30 phases", "30-phase sweep", "30 independent phases". That shape is every one of the nine
// occurrences the sweep for `M167` found, and the window is one word rather than two because two
// starts matching prose that counts nothing (`step 2 ended the phase`, `decision 9 wants every
// phase's report`, both real lines in this repository).
//
// WHAT IT ALLOWS, AND WHY THE CARVE-OUT IS THE RULE RATHER THAN A HOLE IN IT. Text inside double
// quotes is exempt. `CONTRIBUTING.md` documents this defect by quoting the sentence that carried it
// — *these three sentences said "30-phase sweep" while `PHASES` held 38* — and a rule that forced
// that quotation to be paraphrased would delete the evidence in the name of the finding. **You may
// quote a stale count; you may not assert one.** A count is a claim about now, and a quotation is a
// claim about what somebody wrote, which cannot drift because the moment it names is fixed.
//
// WHAT IT DOES NOT CATCH, stated rather than left to be discovered. A size written without the word
// (*"the sweep has 40"*), spelled out (*"forty phases"*), or put inside quotation marks to get past
// this. The first two are the honest limit of a lexical rule; the third is not a defence this gate
// pretends to have, because the failure mode it exists for is a copy going stale, not a copy being
// smuggled. The derived number is untouched by all of it: `regression.mjs` prints
// `` All ${measured} phases `` at the end of a run, which is a template and has no numeral to drift.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A numeral bound to `phase`/`phases`, with at most one word between. The leading group refuses a
 * numeral that is part of a larger token: `Tier 1/2 phase` and `webV2 phases` are both real lines
 * here and neither counts anything.
 */
export const COUNT = /(?:^|[^0-9A-Za-z/])([0-9]+(?:[ -][A-Za-z'’]+)?[ -]phases?)(?![A-Za-z])/g;

/**
 * Blank out double-quoted spans, preserving length so a column stays a column. Quoting a stale
 * count is how the record documents the defect; asserting one is the defect.
 */
export function stripQuoted(line) {
  return line.replace(/"[^"\n]*"/g, (m) => ' '.repeat(m.length));
}

/** @returns {{file: string, line: number, text: string, match: string}[]} */
export function findCounts(file, text) {
  const out = [];
  text.split('\n').forEach((raw, i) => {
    for (const m of stripQuoted(raw).matchAll(COUNT)) {
      out.push({ file, line: i + 1, text: raw.trim(), match: m[1] });
    }
  });
  return out;
}

/**
 * @param {{path: string, text: string}[]} files
 * @returns {string[]} one problem per stated size
 */
export function check(files) {
  return files
    .flatMap((f) => findCounts(f.path, f.text))
    .map((h) => `${h.file}:${h.line} states the sweep's size — \`${h.match}\`\n    ${h.text}`);
}

// `M166`/`D855` in the sibling repository is the reason this refuses rather than reporting zero.
// `scripts/exec.mjs` rsyncs the tree to the box **without `.git/`**, so `git ls-files` there lists
// nothing and a gate that reported on what it found would print `✓ 0 stated sizes` against a tree it
// could not read. A gate that fails plausibly is worse than one that refuses; so is one that passes
// plausibly.
function trackedFiles(root) {
  if (!existsSync(join(root, '.git'))) {
    console.error(
      'verify-sweep-size needs `git ls-files` and this tree has no .git — it is an rsync of the\n' +
        'working tree, not a checkout. Run it on the Mac. It is deliberately NOT reporting zero.',
    );
    process.exit(2);
  }
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);
}

function readText(root, rel) {
  try {
    const text = readFileSync(join(root, rel), 'utf8');
    return text.includes('\0') ? null : text;
  } catch {
    return null; // a submodule, a symlink into nothing, a file deleted but still in the index
  }
}

/**
 * The guards, driven against synthetic lines. Every forbidden case is paired with the negative
 * control that a naive version of this rule fails, because a gate that has never refused anything is
 * decoration (`M154f`, and `verify:redaction:self-test` is here for the same reason).
 */
function selfTest() {
  // The positive fixtures are built from variables rather than spelled out, for the reason the rule
  // itself gives: a derived number is not a stated one. Writing them as literals would make this file
  // fail its own gate on the line that documents it, and the fix for that is not an exemption for the
  // file — an exemption is a hole, and this is the rule working. The negative controls stay literal
  // because none of them is a count.
  const [a, b, c, d] = [30, 31, 32, 8];
  const cases = [
    [`${a} phases total`, true, 'the plain count'],
    [`the ${a}-phase \`.tflw\` sweep below`, true, 'hyphenated, the shape three CI comments used'],
    [`change ${a} independent phases exist to catch`, true, 'one word between the numeral and the noun'],
    [`Current total: ${b} phases`, true, 'what `regression.mjs:9` said for eight days'],
    [`with no Docker, no ${c}-phase sweep, no PR`, true, 'the third disagreeing number in the tree'],
    [`the sweep already costs ~${a} phases each`, true, 'an approximation is still a stated size'],
    [`\`core\` — ${d} phases, the unique smallest`, true, 'a past fact in the present tense reads as now'],
    ['the Tier 1/2 phase every sweep has run', false, 'NEGATIVE: `2` is the tail of `1/2`'],
    ['the webV2 phases drive a real browser', false, 'NEGATIVE: `2` is the tail of `webV2`'],
    ['until step 2 ended the phase with a mutation control', false, 'NEGATIVE: two words between, counts nothing'],
    ["decision 9 wants every phase's report.html uploaded", false, 'NEGATIVE: two words between, counts nothing'],
    ['console.log(`All ${measured} phases passed`)', false, 'NEGATIVE: the derived number has no numeral'],
    ['a 3 phased rollout of the stack', false, 'NEGATIVE: `phased` is an adjective, not a count of phases'],
    ['sentences said "30-phase sweep" while `PHASES` held 38', false, 'NEGATIVE: quoting a stale count is not asserting one'],
    [`said "${a}-phase sweep" and the sweep has ${a} phases`, true, 'a quotation does not exempt the rest of the line'],
  ];
  let failed = 0;
  for (const [line, shouldFlag, why] of cases) {
    const hit = findCounts('<self-test>', line).length > 0;
    if (hit !== shouldFlag) {
      failed++;
      console.error(`  ✗ expected ${shouldFlag ? 'a hit' : 'no hit'} — ${why}\n    ${line}`);
    }
  }
  if (failed > 0) {
    console.error(`verify-sweep-size self-test: ${failed} of ${cases.length} guards do not discriminate`);
    process.exit(1);
  }
  console.log(`✓ verify-sweep-size self-test: ${cases.length} guards, ${cases.filter((c) => !c[1]).length} of them negative controls`);
}

function main() {
  // The guards run first on every invocation, not behind a flag. This gate's whole subject is a
  // check that was pointed at one file while the claim spanned six, so a run of it that has not just
  // proved its own rule still discriminates would be the same mistake in a smaller costume.
  selfTest();
  if (process.argv.includes('--self-test')) return;
  const files = trackedFiles(ROOT)
    .map((path) => ({ path, text: readText(ROOT, path) }))
    .filter((f) => f.text !== null);
  const problems = check(files);
  if (problems.length > 0) {
    console.error(
      `${problems.length} tracked line(s) state the regression sweep's size. \`D767\`: delete the\n` +
        "number, do not correct it — `scripts/regression.mjs`'s `PHASES` is the list and the runner\n" +
        'prints the count it measured. This has now drifted three times.\n',
    );
    for (const p of problems) console.error(`  · ${p}`);
    process.exit(1);
  }
  console.log(`✓ sweep size: ${files.length} tracked files, none states how many phases the sweep has`);
}

main();
