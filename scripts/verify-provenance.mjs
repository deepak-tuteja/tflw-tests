#!/usr/bin/env node
// M152e (`D673`, `D709`, `D711`) — this repository's prose, held to what a reader can actually follow.
//
// Three claims, one gate, because they are one claim from the reader's side: *what this file says
// about tflw can be looked up.*
//
//   1. NO TRACKED PROSE FILE LINKS OUT OF THE REPOSITORY. Eight markdown links pointed at
//      `../testFlow/…`. Every one of them 404s on GitHub — a `../` cannot climb above a repository
//      root — so they resolved only in a checkout that happened to have both repos side by side,
//      which is why nobody noticed for a year. Four of the eight named a `PLAN_*.md` that tflw's
//      `.gitignore` excludes, so even the correct URL would have 404'd.
//
//   2. EVERY FILE THAT CITES THE NOTATION DECLARES WHICH SEQUENCE IT MEANS. Both repositories
//      number their milestones from 1 and 35 identifiers are defined in both record sets (`D711`):
//      this repository's `M22` is the nginx mTLS sidecar, tflw's is a coverage audit. A citation
//      that resolves to a real entry about the wrong thing is worse than one that resolves to
//      nothing, so the resolution is not offered without the sentence that says which list.
//
//   3. EVERY UNQUALIFIED CITATION RESOLVES IN tflw's PUBLISHED INDEX, and tflw's pin of this
//      repository agrees with this repository's prose in both directions.
//
// WHY THE PIN IS CHECKED HERE AND NOT THERE. tflw's `DECISIONS.md` publishes what BOTH repositories
// cite, and it learns this repository's half from a tracked pin — `scripts/sibling-citations.json`,
// refreshed from a ref. A pin can go stale, and the only place in either repository that can notice
// is this one: `acceptance-check` is the single job with both trees checked out, which is the same
// reason `verify-contributing.mjs` lives in it.
//
// AND THE NOTATION IS RE-IMPLEMENTED HERE RATHER THAN IMPORTED. Reading tflw's scripts across the
// checkout boundary would make one implementation and one reading of it; two independent readings
// that must agree is the stronger arrangement, and it is `D675`'s own shape. When they disagree,
// this fails — which is the point.
//
// NO SKIP-IF-ABSENT. If the sibling checkout is missing, this fails. `M131-03`: a guard that passes
// when the thing it guards is not there is green about nothing. The consequence is the merge order
// (`D511`): tflw merges first, then this repo, chained.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SIBLING = join(ROOT, '..', 'testFlow');

/**
 * The notation, in the four spellings this repository's prose uses. Deliberately the same shapes
 * tflw's `gen-decisions.mjs` collects, written out again — see the header.
 *
 * **`M154d` — the D-form was `D\d{2,3}` and the sentence above was false, which is the only kind of
 * duplication bug this arrangement can have.** tflw's `CITATION` is `D\d{1,3}`. Nothing noticed
 * while no tracked prose here cited a single-digit decision; `M154d`'s locator rows cited `D6`
 * (`field`'s cascade order) and `D7`, and the two instruments then disagreed about whether those
 * were citations at all. tflw's refresher put them in the pin, this file could not see them, and
 * `verify:provenance` reported them as stale-in-pin — a red that no edit to either document could
 * clear, because both documents were right.
 *
 * The narrow side was the wrong one. tflw numbers decisions from `D1` and publishes `D1`, `D5`,
 * `D6`, `D7`, `D9`; excluding them here meant this repository could cite any of them and the gate
 * would silently not require them to resolve — a vacuity in the gate whose entire job is that
 * citations resolve.
 *
 * Widened after measuring rather than before (`D716`'s lesson: that widening was reversed by
 * measuring it). Across all 13 tracked markdown files the change adds **exactly two** identifiers,
 * `D6` and `D7`, both in `CONSTRUCTS.md`, both published in tflw's index. No false positives.
 */
const CITATION = /(?<!\w)(P#\d{1,3}[a-z]?|D\d{1,3}[a-z]?|M\d{1,3}[a-z]?\d?)(?!-\d)\b/g;

/**
 * A citation marked as belonging to the other repository than the file's default. `D711`'s whole
 * mechanism: the default carries the majority and the minority is spelled out, so no reader has to
 * know which repository numbered a milestone and no gate has to guess.
 */
// Widened with `CITATION` above, for parity rather than for a symptom: measured across every
// tracked file, no marked citation here is a single-digit D-form today, so this changes nothing —
// which is the point. Leaving these two narrow would rebuild the divergence that just cost a red.
const OWN = /`?testFlow-tests\s+(?:M\d{1,3}[a-z]?\d?|D\d{1,3}[a-z]?)`?/g;
const THEIRS = /`?tflw\s+(M\d{1,3}[a-z]?\d?|D\d{1,3}[a-z]?)`?/g;

/** The declaration `D711` requires, matched on the two parts that carry the meaning. */
const DECLARES = (text) => /\*\*Notation\.\*\*/.test(text) && text.includes('/blob/main/DECISIONS.md');

/**
 * Which sequence a file's UNQUALIFIED `M<n>` indexes, read from its own declaration. Two files in
 * this repository default the opposite way from the other nine — `README.md` is about this
 * repository and cites its own milestones throughout, while the acceptance and security corpora
 * narrate tflw's arcs — and a single default would have been wrong for one of them either way.
 *
 * `D<n>` and `P#n` are not defaulted. This repository's own records number decisions per plan
 * (`D17.1`, `D19.1`), never bare, so a bare `D<n>` is unambiguously tflw's wherever it appears.
 */
const defaultsToOwn = (text) => /here is this repository's own/.test(text);

/**
 * A relative markdown link that climbs above the repository root. `](../x)` inside a file at the
 * root escapes; the same link from `a/b/c.md` does not. Counted by depth rather than by spotting
 * `../testFlow`, because the defect is *leaving the repository*, and the next one will name a
 * different sibling.
 */
export function escapingLinks(path, text) {
  const depth = path.split('/').length - 1;
  const out = [];
  for (const m of text.matchAll(/\]\((\.{1,2}\/[^)\s]*)\)/g)) {
    const up = m[1].split('/').filter((s) => s === '..').length;
    if (up > depth) out.push(m[1]);
  }
  return out;
}

/**
 * A range cites its interior. `D40–D44` is one citation phrase and five identifiers, and a reader
 * following it wants the three in the middle — tflw's index publishes them for that reason, so this
 * gate has to agree that they are cited.
 */
const RANGE = /(?<![\w#])([DM])(\d{1,3})[a-z]?\s*[-–—]\s*(?:[DM])?(\d{1,3})[a-z]?\b/g;

/** A ledger row: `M138b-01`. Names a row, not the milestone — see `citationsLoose`. */
const ROW = /(?<![\w#])(M\d{1,3}[a-z]?\d?|D\d{2,3}[a-z]?)-\d+\b/g;

/**
 * Every identifier a file cites, with the ones it has claimed for itself removed.
 *
 * STRICT, and this is the set the declaration's promise is measured against: each of these must
 * have an entry in tflw's index, because each is a bare identifier standing in front of a reader.
 */
export function citationsOf(text) {
  const own = defaultsToOwn(text);
  // In a file that defaults to this repository's own milestones, an unqualified `M<n>` is not a
  // citation of anything tflw publishes and must not be required to resolve there. Blanking them
  // rather than filtering afterwards keeps the range rule honest too: `M29-M33` in such a file is
  // this repository's cluster A-D, not tflw's workload grammar.
  const cleaned = (own ? text.replace(/(?<![\w#])M\d{1,3}[a-z]?\d?\b/g, ' ') : text).replace(OWN, ' ');
  const ids = new Set([...cleaned.matchAll(CITATION)].map((m) => m[1]));
  for (const [, kind, a, b] of cleaned.matchAll(RANGE)) {
    if (Number(b) <= Number(a)) continue;
    for (let n = Number(a) + 1; n < Number(b); n++) ids.add(`${kind}${n}`);
  }
  // The marked minority, which the blanking above would otherwise have taken with it.
  if (own) for (const [, id] of text.matchAll(THEIRS)) ids.add(id);
  return ids;
}

/**
 * The same, widened by the one spelling tflw's collector reads as a citation and this one does not:
 * a ledger row's prefix. `M138b-01` names a review row, which nothing publishes, and tflw's pattern
 * takes `M138b` off the front of it.
 *
 * The widening exists so the pin can be checked in BOTH directions without this file re-implementing
 * that quirk as a requirement. The pin must contain everything `citationsOf` finds, and may contain
 * nothing this does not — so a pin that has gone stale is still caught, and a disagreement about a
 * row id is not reported as one.
 */
export function citationsLoose(text) {
  const ids = citationsOf(text);
  for (const [, id] of text.matchAll(ROW)) ids.add(id);
  return ids;
}

// `M154i` — this gate's corpus IS `git ls-files`, and an empty answer is not an empty repository.
//
// WHAT WENT WRONG, because the shape of it matters more than the fix. Run this file in a tree that
// rsync carried but git did not — `~/tflw-exec/testFlow-tests` on fedora-box, whose `.git` is a
// skeleton with no index and no HEAD — and `git ls-files` returns **zero paths without failing**.
// Every conclusion below is then vacuous, and all of them vacuous in the same direction: nothing
// links out of the repository because nothing was read, nothing is undeclared because nothing cites
// anything, and every identifier in tflw's pin is "stale" because this repository now appears to
// cite none of them.
//
// The gate reported exactly that — 250-odd identifiers listed, with a remedy attached: *re-pin it*.
// The remedy was confidently wrong, and following it would have destroyed a correct pin to satisfy
// a tree that could not read itself. That is worse than a crash. A crash is legibly the
// environment; a plausible finding with an actionable fix is how a false red gets acted on, and
// this one was acted on to the extent of being reported twice as a real defect in tflw's pin.
//
// This file already knows the rule and applies it one branch over, where the sibling checkout is
// missing: *a guard that passes when the thing it guards is missing is green about nothing*
// (`M131-03`). The same sentence was always true of its own input. So git must answer, and the
// answer must not be empty.
//
// Neither case is a skip. This gate does not skip — CI's own comment gives the reason, that the
// tflw-first merge order deliberately leaves this repository's `main` red in the window between the
// two merges. The verdict does not change here. Only the reason does, from a false one to a true
// one.
function tracked() {
  let out;
  try {
    // `stdio` pipes git's stderr instead of letting it through: the message below quotes it, and
    // printing it twice reads like two problems.
    out = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const detail = String(e.stderr || e.message).split('\n')[0].trim();
    return { error: `git could not list this repository's tracked files (${detail})` };
  }
  const paths = out.split('\n').filter(Boolean);
  if (paths.length === 0) return { error: 'git lists no tracked markdown file at all in this tree' };
  return { files: paths.map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') })) };
}

function main() {
  const corpus = tracked();
  if (corpus.error) {
    console.error(
      `\u2717 ${corpus.error}.\n` +
      `  This gate's corpus is \`git ls-files '*.md'\`, so an empty answer does not make it pass —\n` +
      `  it makes it report tflw's ENTIRE pin as stale and tell you to re-pin it, which would\n` +
      `  discard a correct pin to satisfy a tree that cannot read itself.\n` +
      `  Run it in a real checkout. An rsync'd working tree is not one: \`scripts/exec.mjs\` copies\n` +
      `  files, not history, so this is one of the few gates that cannot run on the box.`,
    );
    return 1;
  }
  const files = corpus.files;
  const problems = [];

  // --- 1. links out of the repository ---------------------------------------------------------
  let links = 0;
  for (const { path, text } of files) {
    for (const target of escapingLinks(path, text)) {
      links++;
      problems.push(`${path} links \`${target}\`, which climbs above this repository. A relative link cannot leave a repo on GitHub — it 404s for everyone who is not you.`);
    }
  }

  // --- 2. the declaration ----------------------------------------------------------------------
  const citing = files.filter(({ text }) => citationsOf(text).size > 0);
  for (const { path, text } of citing) {
    if (!DECLARES(text)) {
      problems.push(`${path} cites the notation and does not declare which sequence it means. Both repositories number milestones from 1 (D711); add the **Notation.** paragraph naming tflw's DECISIONS.md.`);
    }
  }

  // --- 3. resolution, and the pin, both directions ----------------------------------------------
  let index, pin;
  try {
    index = readFileSync(join(SIBLING, 'DECISIONS.md'), 'utf8');
    pin = JSON.parse(readFileSync(join(SIBLING, 'scripts', 'sibling-citations.json'), 'utf8'));
  } catch (e) {
    console.error(
      `✗ the tflw checkout is not readable beside this one: ${String(e.message).split('\n')[0]}\n` +
      `  This gate compares this repository's prose against tflw's published index and against\n` +
      `  tflw's pin of this repository, so it needs both trees. It does not skip — a guard that\n` +
      `  passes when the thing it guards is missing is green about nothing (M131-03).`,
    );
    return 1;
  }

  const published = new Set([...index.matchAll(/^### (\S+)$/gm)].map((m) => m[1]));
  const mine = new Map();
  for (const { path, text } of citing) for (const id of citationsOf(text)) {
    if (!mine.has(id)) mine.set(id, []);
    mine.get(id).push(path);
  }

  const unresolved = [...mine.keys()].filter((id) => !published.has(id)).sort();
  if (unresolved.length) {
    problems.push(
      `${unresolved.length} identifier(s) this repository's prose cites have no entry in tflw's DECISIONS.md: ${unresolved.join(' ')}\n` +
      `    The **Notation.** paragraph promises they resolve there. Re-pin tflw's sibling-citations.json from this branch and regenerate its index.`,
    );
  }

  const pinned = new Set(Object.keys(pin.citations ?? {}));
  const missingFromPin = [...mine.keys()].filter((id) => !pinned.has(id)).sort();
  const loose = new Set();
  for (const { text } of citing) for (const id of citationsLoose(text)) loose.add(id);
  const staleInPin = [...pinned].filter((id) => !loose.has(id)).sort();
  if (missingFromPin.length) {
    problems.push(`tflw's pin does not know this repository cites ${missingFromPin.join(' ')} — re-pin it (\`node scripts/refresh-sibling-citations.mjs --ref <this branch>\`), tflw side, and merge tflw first (D511).`);
  }
  if (staleInPin.length) {
    problems.push(`tflw's pin still claims this repository cites ${staleInPin.join(' ')}, and it does not. Its index will publish entries nothing asks for — re-pin it.`);
  }

  if (problems.length) {
    console.error(`✗ ${problems.length} provenance problem(s)\n\n${problems.map((p) => `  · ${p}`).join('\n')}\n`);
    return 1;
  }
  console.log(
    `✓ provenance: ${files.length} tracked markdown files, ${links === 0 ? 'none' : links} linking outside the repository;\n` +
    `  ${citing.length} of them cite the notation and all declare which sequence they mean;\n` +
    `  ${mine.size} identifiers all resolve in tflw's DECISIONS.md (${published.size} entries), and its pin\n` +
    `  of this repository (${pin.repo}@${String(pin.sha).slice(0, 7)}) agrees in both directions.`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
