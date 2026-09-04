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
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';


/**
 * Where the manifest lives. Declared HERE and imported by the generator, not the other way round
 * (`M169d3`). The generator needs this gate's `DECLARED_UNRESOLVABLE` to write the manifest's second
 * half, and this gate needs the path — so one of the two directions has to go, and the path is the
 * smaller thing to move. A dynamic `import()` was tried first and deadlocks: the cycle is real at
 * runtime too, because the outer module is still evaluating when the inner one asks for it.
 */
export const MANIFEST = join('scripts', 'own-identifiers.json');

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
 *
 * **`M169d3` — THIS IS A PROSE DEVICE, and reading it in the code corpus made it match its own
 * definition.** The line below contains the pattern it tests for, so `verify-provenance.mjs`
 * declared *itself* a file that defaults to this repository's own milestones — and `citationsOf`
 * then blanked **19 bare `M`-forms** in it, `M131 M141 M152e M154d M164 M167` among them, every one
 * a real citation of tflw in a docblock. Measured over the whole corpus: exactly one file trips it,
 * and it is this one. The gate whose subject is *which sequence an identifier means* was the only
 * file in the repository exempt from having to answer that question.
 *
 * It is the same self-reference `M169d1` §0.2 records for a plan that anchors what it lists as
 * unanchored, and `M169d2`'s fix for a manifest read as a citation surface — the fourth in this
 * milestone, and the sharpest, because here the predicate matches the source of the predicate.
 *
 * The repair is the corpus split itself. A `.ts` file cannot carry a `**Notation.**` paragraph
 * (`M169d1`'s rule 2) and it cannot carry this declaration either; what decides for code is
 * `M169d2`'s manifest, per identifier, and `main` already partitions on it. So the parameter is not
 * a special case — it says which of the two corpora is being read.
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

/**
 * A ledger row: `M138b-01`. Names a row, not the milestone — see `citationsLoose`.
 *
 * `M164-10`: the D-form is `D\d{1,3}` for the same reason `CITATION` above is, and the divergence
 * runs the *other* way here. tflw's collector carries no `(?!-\d)` at all, so it reads `D4` out of
 * `D4-1` and pins it; at `D\d{2,3}` this rule could not take that prefix back, and the pin then held
 * an identifier `citationsLoose` did not — the same unclearable stale-pin red `M154d` describes,
 * arriving from the side where the *gate* is the narrow one rather than the collector. Both
 * directions were reproduced against the two implementations before either was changed.
 *
 * Measured: no tracked file here writes a single-digit D-form row today, and this rule only ever
 * adds to the loose set, so widening it can clear a false red and cannot create one.
 */
const ROW = /(?<![\w#])(M\d{1,3}[a-z]?\d?|D\d{1,3}[a-z]?)-\d+\b/g;

/**
 * Every identifier a file cites, with the ones it has claimed for itself removed.
 *
 * STRICT, and this is the set the declaration's promise is measured against: each of these must
 * have an entry in tflw's index, because each is a bare identifier standing in front of a reader.
 */
export function citationsOf(text, prose = true) {
  const own = prose && defaultsToOwn(text);
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
export function citationsLoose(text, prose = true) {
  const ids = citationsOf(text, prose);
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


// ---------------------------------------------------------------------------------------------
// `M169d1` — the second corpus (`D-M164-06-2`)
// ---------------------------------------------------------------------------------------------

/**
 * The three rules split by corpus, because they are three promises and only one of them is about
 * resolution.
 *
 * Rules 1 and 2 stay on `git ls-files '*.md'`. Rule 1 is a *markdown link* defect — `](../x)` does
 * not exist in a `.ts` file — and rule 2 requires the `**Notation.**` paragraph, which a `.ts` file
 * cannot carry: 397 of the files below cite something, so widening rule 2 with the others would
 * turn this gate red on 397 files with no repair that is not absurd. That is `M167`'s shape read
 * forwards for once — a guard deliberately narrower than its file set, with the reason written
 * down rather than discovered eight days later.
 *
 * Rule 3 widens to here. An identifier standing in front of a reader in a code comment is standing
 * in front of a reader.
 *
 * The exclusions are `D-M164-06-1`'s, by exclusion-with-a-reason rather than by extension
 * allowlist, and every one of them is printed on every run so the corpus NOT read is visible on a
 * green one. An allowlist is the defect: it fails silent and in the safe-looking direction.
 */
export const IMAGE_EXT = new Set(['.png', '.svg', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.avif']);

export const EXCLUSIONS = [
  {
    label: 'markdown',
    why: 'the other corpus — rules 1 and 2 read these under the full publish-and-resolve contract, and reading them here too would report every identifier twice',
    test: (path) => path.endsWith('.md'),
  },
  {
    label: 'image',
    why: 'an SVG path is written in a language where `M<n>` means *moveto*; tflw measured its own three SVGs and every hit was a coordinate',
    test: (path) => IMAGE_EXT.has(extname(path).toLowerCase()),
  },
  {
    label: 'lockfile',
    why: 'a `sha512-` digest tail parses as a citation and cannot be told from one by any grammar — `M7w` comes out of `apiV2/package-lock.json`, which is how tflw arrived at the same exclusion from the other side of the boundary',
    test: (path) => /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(path),
  },
  {
    label: 'the manifest',
    why: 'a claim source, not a citation surface — `own-identifiers.json` LISTS the identifiers this repository defines, and reading a list of names as a list of citations is the same mistake one level up from `M169d1` §0.2, where a record that lists an unanchored identifier anchors it. Caught within the hour: `M169d2` shipped without this and the corpus grew by 19 identifiers that nothing cites, six of which then reported themselves as ambiguous',
    test: (path) => path === MANIFEST || path === MANIFEST.replace(/\\/g, '/'),
  },
  {
    label: 'recorded data',
    why: 'a census row\'s `why` field is an *anchor source* rather than a citation surface — the same distinction `gen-decisions.mjs` draws for records, and 30 of this corpus\'s identifiers reach it through `kill-matrix.jsonl` alone',
    test: (path) => path.endsWith('.jsonl'),
  },
];

/**
 * The tracked non-prose corpus. Binary is detected on content rather than on extension, so a file
 * with a misleading name is excluded for what it is; tflw's `receipt.png` is the worked example in
 * the other direction, an ASCII fixture that stays *in* on the extension rule.
 *
 * @returns {{files: {path: string, text: string}[], excluded: Map<string, number>}}
 */
export function readCode(root) {
  let out;
  try {
    out = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return { error: String(e.stderr || e.message).split('\n')[0].trim() };
  }
  const paths = out.split('\n').filter(Boolean);
  if (paths.length === 0) return { error: 'git lists no tracked file at all in this tree' };
  const files = [];
  const excluded = new Map([...EXCLUSIONS.map((r) => [r.label, 0]), ['binary', 0]]);
  for (const path of paths) {
    const rule = EXCLUSIONS.find((r) => r.test(path));
    if (rule) { excluded.set(rule.label, excluded.get(rule.label) + 1); continue; }
    const buf = readFileSync(join(root, path));
    if (buf.includes(0)) { excluded.set('binary', excluded.get('binary') + 1); continue; }
    files.push({ path, text: buf.toString('utf8') });
  }
  return { files, excluded };
}

/**
 * What this repository defines for itself (`M169d2`, `D-M164-06-7`). Tracked, so a CI checkout can
 * read it; generated, so it cannot go stale by inattention; identifiers only, because the record
 * filenames are part of what the `.gitignore` decision withholds.
 *
 * This is the artefact that makes `D711`'s worst case visible. 69 identifiers are anchored in both
 * repositories' record sets and 63 are already published by tflw, so without this file a bare
 * `M22` in `docker-compose.yml` is demanded of tflw's index and tflw *answers* — with its coverage
 * audit, where this repository meant its nginx mTLS sidecar. A wrong entry, delivered green.
 *
 * It is read rather than skipped-if-absent, per this file's standing rule: a missing manifest is a
 * failure, not a pass with fewer claims.
 */
function ownManifest() {
  try {
    const parsed = JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8'));
    if (!Array.isArray(parsed.identifiers)) return { error: `${MANIFEST} has no \`identifiers\` array` };
    return { ids: new Set(parsed.identifiers) };
  } catch (e) {
    return { error: `${MANIFEST} is missing or unreadable (${String(e.message).split('\n')[0]}) — run \`npm run refresh:own-identifiers\`` };
  }
}

/**
 * The identifiers this repository's code cites **because they resolve to nothing**, each with the
 * reason beside it. `D860`'s shape, re-declared on this side rather than shared — `D711`'s argument
 * that the two readings stay independent applies to the exclusion list as much as to the grammar,
 * and the measurement is the evidence it works: this side re-derived `D4` and `M7w` without looking
 * at tflw's list, and agrees with it on both.
 *
 * `M141b` is the one entry that is not a grammar artefact, and it is worth reading closely, because
 * the citation is **correct** and the anchor set is what cannot hold it. It names `37edd5c` —
 * *"M141b: one answer to \"which tflw am I running?\", and the second answers deleted (#27)"* — a
 * real merged commit in this repository, which touched both of the two files that cite it. It is
 * unanchored because tflw's records anchor whole milestones (`M141`, decisions `D531`-`D546`) and
 * name its two PR halves only in a build-order table cell, and because this repository's own
 * records are `.gitignore`d by decision and so cannot anchor anything for a public index.
 *
 * A general channel was considered and **rejected on a measurement**: a probe asking whether any
 * other unresolved identifier names a real commit in either repository returns exactly one, this
 * one. A resolution mechanism built for a single member is a mechanism whose maintenance cost
 * exceeds its subject.
 *
 * `D4` WAS HERE AND IS NOT ANY MORE, which is the list working rather than shrinking. It was
 * declared unresolvable because `apiV2/src/orders/order-receipt.util.ts` cites `PLAN_FILEFORMATS.md
 * D4` and tflw publishes a *different* `D4`. `M169d2`'s manifest gives the better account: this
 * repository genuinely **defines** a `D4`, so the citation is correct and the demand was the
 * mistake. The contradiction check below is what found it — an identifier cannot both be defined
 * here and resolve nowhere — and it found it on the manifest's first run.
 *
 * WHY THE SHA IS NOT CHECKED HERE. It would be the better declaration — a reason that goes stale
 * loudly beats one that goes stale silently — but `actions/checkout` sets no `fetch-depth` in this
 * repository's workflow, so CI holds a depth-1 clone and `37edd5c` is not an object it has. A gate
 * that verified it would be green on every developer machine and red on every CI run, which is the
 * failure mode this file's own `M154i` comment is about, inverted. It is printed for a reader and
 * checked by hand.
 */
export const DECLARED_UNRESOLVABLE = new Map([
  ['M164d', '`discover-mutation-kills.mjs` / `list-mutation-candidates.mjs` — `D851` records that `M164d` is not built. A citation of an unbuilt milestone is what a declared exclusion is for'],
  ['M141b', '`lib/regression-shared.mjs` / `regression.mjs` — names commit `37edd5c` (#27), this repository\'s half of `M141`. Not a dead pointer: the citation is accurate and no anchor set can hold it. See the docblock above'],
  // THESE THREE ARE ALL IN THIS FILE, and that is the finding rather than a coincidence (`M169d3`).
  // Until the prose default stopped reaching the code corpus, `verify-provenance.mjs` declared
  // itself as defaulting to this repository's own milestones — because it contains the pattern that
  // test looks for — and every bare `M`-form in it was blanked. The gate whose subject is which
  // sequence an identifier means was the last file in the repository not answering for its own.
  ['M7w', '`verify-provenance.mjs` — the base64 tail of the `sha512-` digest quoted in the lockfile exclusion\'s reason and used as its self-test fixture. tflw declares the same identifier for the same shape in its own docblocks, which is two independent readings agreeing (`D711`)'],
  ['M404b', '`verify-provenance.mjs` — the invented half of the self-test\'s planted citation, `a comment mentioning D404 and M404b`. `D404` is a real tflw decision and resolves; only the `M` half is fictional, which is why the plant tests the grammar rather than the index'],
  ['M154i', '`verify-provenance.mjs` — names the false red this gate produced against a tree `rsync` carried and git did not. Minted in that comment and referred back to once in tflw\'s `M164-12` row; a mention is not an anchor, and `M154a`-`M154h` are all anchored where this one never was'],
]);

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

  // --- the code corpus, read before the pin so the pin can be compared against BOTH halves -----
  const codeCorpus = readCode(ROOT);
  const own = ownManifest();
  if (own.error) problems.push(own.error);
  const claimed = own.ids ?? new Set();
  const codeCited = new Map();
  // `D866` — qualification is a property of a SITE, so it is recorded against one. This was a single
  // corpus-wide `Set` until `M169d5`, which made one `tflw M22` anywhere re-admit every bare `M22`
  // everywhere: 7 identifiers, 47 pin sites that mean this repository's sequence, and `M22`'s two
  // qualifying sites were both prose *about* the collision — one of them the docblock of
  // `refresh-own-identifiers.mjs`, the file that generates `claimed`.
  const qualifiedAt = new Map();
  if (!codeCorpus.error) {
    for (const { path, text } of codeCorpus.files) {
      for (const id of citationsOf(text, false)) {
        if (!codeCited.has(id)) codeCited.set(id, []);
        codeCited.get(id).push(path);
      }
      const here = new Set();
      for (const [, id] of text.matchAll(THEIRS)) here.add(id);
      if (here.size) qualifiedAt.set(path, here);
    }
  }
  /** Does THIS file put `id` back into the demand? `D866`. */
  const qualifiesAt = (path, id) => qualifiedAt.get(path)?.has(id) === true;

  /**
   * WHAT THE PIN IS FOR, WRITTEN AS A SET (`M169d3`, `D864`). tflw publishes what this repository
   * ASKS OF IT, which is not the same as what this repository cites: the 64 identifiers below that
   * both repositories define are cited here and must not be asked there, or the index answers a
   * sentence about this repository's nginx sidecar with tflw's coverage audit. So the demand is
   *
   *     everything the prose cites  +  (what the code cites − what the manifest claims)  +  `tflw <id>`
   *
   * and the pin has to hold exactly that. The `tflw <id>` term is the per-site override
   * (`D-M164-06-8`): it is the one spelling that puts a claimed identifier back into the demand.
   * **It is spent per site (`D866`), which is what this sentence always said and what neither
   * implementation did until `M169d5`.** A claimed identifier re-enters the demand from the files
   * that qualify it and from no others; a bare mention in a sibling file means this repository's
   * sequence no matter what some other file spells.
   *
   * THIS WIDENED IN `M169d3` AND NOT IN `M169d4`, which is worth stating because the enforcement
   * half deliberately waits. `D511` accepts a red window on THIS repository's `main` between the
   * two merges — it does not accept a permanent one, and a pin that has grown a code half while
   * this comparison still reads only markdown reports all 207 of them as stale on every run, with
   * a remedy attached that would delete a correct pin. That is `M154i` exactly: a plausible finding
   * with an actionable fix, and this file has been acted on that way before.
   */
  const demanded = new Set(mine.keys());
  for (const [id, paths] of codeCited) {
    // `D866`: unclaimed → every site asks tflw. Claimed → only the sites that spell `tflw <id>`.
    if (!claimed.has(id) || paths.some((p) => qualifiesAt(p, id))) demanded.add(id);
  }
  // A declared identifier is not asked of tflw — that is what the declaration says. It travels to
  // the refresher in the manifest beside the claims (`M169d3`), so the pin will not carry it, and
  // subtracting it here is what keeps the two sides of this comparison describing the same set.
  for (const id of DECLARED_UNRESOLVABLE.keys()) demanded.delete(id);

  const pinned = new Set(Object.keys(pin.citations ?? {}));
  const missingFromPin = [...demanded].filter((id) => !pinned.has(id)).sort();
  const loose = new Set();
  for (const { text } of citing) for (const id of citationsLoose(text)) loose.add(id);
  for (const { text } of codeCorpus.files ?? []) for (const id of citationsLoose(text, false)) loose.add(id);
  const staleInPin = [...pinned].filter((id) => !loose.has(id)).sort();
  if (missingFromPin.length) {
    problems.push(`tflw's pin does not know this repository cites ${missingFromPin.join(' ')} — re-pin it (\`node scripts/refresh-sibling-citations.mjs --ref <this branch>\`), tflw side, and merge tflw first (D511).`);
  }
  if (staleInPin.length) {
    problems.push(`tflw's pin still claims this repository cites ${staleInPin.join(' ')}, and it does not. Its index will publish entries nothing asks for — re-pin it.`);
  }

  // --- the widened rule 3, computed and NOT enforced (`M169d1`) ---------------------------------
  //
  // WHY IT PRINTS INSTEAD OF FAILING. Enforcing it today would redden `main` on 124 identifiers,
  // and 120 of those are not defects: they are anchored in tflw's records and merely unpublished,
  // because tflw's index is demand-driven and until now nothing in code was allowed to demand
  // anything. Publishing them is `M169d3`, it takes a tflw pull request first (`D511`), and it was
  // approved as `M164-06` §9 on 2026-09-03 after a human scan of the exact publish set.
  //
  // So this reports a number that is going to move, and says which way. A gate that fails on work
  // that is already scheduled teaches people to ignore it; a gate that is silent until the day it
  // is switched on teaches nobody anything. `M169d4` is the switch.
  //
  // THIS MILESTONE'S OWN NAME IS IN THAT NUMBER, and it is not a slip. `M169d1` is cited by the
  // two comments that introduce this corpus — `ci.yml`'s step and `verify-contributing.mjs`'s
  // entry — and it can never resolve in tflw's index, because it is anchored only in a
  // `.gitignore`d plan in THIS repository. That completes the statement of the defect: an
  // identifier this repository defines and cites in its own code either collides with a
  // same-numbered tflw identifier and resolves to a real entry about the wrong thing (63 of them
  // do today), or does not collide and resolves to nothing (`M141b`, `M164d`, and now this). There
  // is no third outcome, and neither one is visible to a gate whose corpus is markdown. `M169d2`'s
  // manifest is the fix, and the fact that the first commit of `M169d1` produced an instance of it
  // is the argument for building `M169d2` next rather than later.
  //
  // AND IT CANNOT SEE THE WORSE DEFECT AT ALL, which is the honest part. 69 of the identifiers
  // below are defined in BOTH repositories' record sets and 63 are already published, so resolving
  // them here means answering with a real entry about the wrong thing — `D711`'s stated worst case.
  // That census needs both record sets, and both are `.gitignore`d, so it is not computable from a
  // checkout. `M169d2`'s generated manifest is what makes it computable; until then this report is
  // measuring the smaller half and must not be read as clearance.
  const codeLines = [];
  if (codeCorpus.error) {
    codeLines.push(`  code corpus (M169d1): NOT READ — ${codeCorpus.error}.`);
  } else {
    const codeUnresolved = [...codeCited.keys()].filter((id) => !published.has(id)).sort();
    const mineNotTheirs = codeUnresolved.filter((id) => claimed.has(id));
    const undeclared = codeUnresolved.filter((id) => !DECLARED_UNRESOLVABLE.has(id) && !claimed.has(id));
    const staleDecl = [...DECLARED_UNRESOLVABLE.keys()].filter((id) => published.has(id)).sort();
    // THE CONTRADICTION, and it is `M169d1` §0.2's rule turned into a gate. An identifier cannot
    // both be one this repository defines and one that resolves nowhere: if the manifest claims it,
    // the declaration is not merely redundant, it is a second answer to a question that has one.
    // This is what stops a record from silently repairing a dead pointer by listing it — writing
    // `- **\`M164d\`** — resolves to nothing` in a plan anchors `M164d`, the manifest then claims
    // it, and the declaration explaining that it resolves to nowhere would sit beside a claim that
    // this repository defines it. Measured on the day this landed: the rule fires on `D4`, and
    // correctly — `PLAN_FILEFORMATS.md` really does define a `D4`, so the manifest is the right
    // account of it and the declaration was the wrong one.
    const ambiguous = [...codeCited.keys()].filter((id) => published.has(id) && claimed.has(id)).sort();
    const contradicted = [...DECLARED_UNRESOLVABLE.keys()].filter((id) => claimed.has(id)).sort();
    if (contradicted.length) {
      problems.push(
        `${contradicted.join(' ')} is BOTH declared unresolvable in verify-provenance.mjs AND claimed by ${MANIFEST} as an identifier this repository defines.\n` +
        `    Those cannot both be true. If this repository's records define it, delete the declaration — the manifest already stops it being demanded of tflw.\n` +
        `    If they do not, the records are anchoring it by accident: a plan that LISTS an identifier in a defining shape defines it (M169d1 §0.2).`,
      );
    }
    const skipped = [...codeCorpus.excluded].filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(' · ');
    codeLines.push(
      `  code corpus (M169d1, D-M164-06-2): ${codeCorpus.files.length} tracked non-prose files — not read: ${skipped}.`,
      `  ${codeCited.size} identifiers cited there; ${codeCited.size - codeUnresolved.length} resolve in tflw's index.`,
      `  ${mineNotTheirs.length} are this repository's own (${MANIFEST}, ${claimed.size} claimed) and are not demanded of tflw.`,
      // These RESOLVE — tflw publishes an entry under the same identifier — so no gate had ever had
      // a reason to mention them, and a reader who follows one can land on a real entry about the
      // wrong thing (`D711`).
      //
      // `D-M164-06-8` SAID THIS IS REPAIRED PER SITE, and `M169d4` measured that: **3543 bare sites
      // across 384 files**. It is not a hand edit, and reading the sites says why it should not be
      // one — the manifest's per-identifier default is already what almost every one of them means,
      // because almost every one of them IS this repository's own milestone. Qualifying 3543 sites
      // to restate a default that is already correct is churn wearing a repair's clothes.
      //
      // What the default was wrong about was narrower and checkable, and `M169d4` fixed it there
      // instead: `D16`, `D17` and `D19` were claimed and this repository has never written any of
      // them — its records number decisions per plan, `D16.1`, `D17.2` — so a bare `D17` in code,
      // unambiguously tflw's, was being withheld from the demand as ours. Three identifiers, one
      // lookahead, no churn. The count below is what is left, and it is left ON PURPOSE: these are
      // identifiers both repositories genuinely define, the census is the artefact that says so,
      // and the residue is a list to read rather than a defect to close.
      `  ⚠ ${ambiguous.length} resolve in tflw's index AND are claimed here — both record sets define them (D711):`,
      `    ${ambiguous.join(' ')}`,
      `  ${undeclared.length} unresolved and undeclared (ENFORCED since M169d4); ${DECLARED_UNRESOLVABLE.size} declared unresolvable:`,
    );
    for (const [id, why] of DECLARED_UNRESOLVABLE) codeLines.push(`    ${id.padEnd(6)} ${why}`);
    // `M169d4` — THE SWITCH. Everything above this line was computed and printed for three
    // milestones while the index caught up; `M169d3` published the 93 it was waiting for and the
    // count reached zero, so the report becomes a gate. What it now says is the same sentence rule
    // 3 has always made about prose: an identifier a reader meets resolves, or it is declared, or
    // this fails.
    //
    // The order was not caution for its own sake. Enforcing before the publication would have
    // reddened `main` on 89 identifiers that were anchored in tflw's records and merely unpublished
    // — work already scheduled and approved — and a gate that fails on scheduled work is a gate
    // people learn to pass with `--no-verify`.
    if (undeclared.length) {
      problems.push(
        `${undeclared.length} identifier(s) cited in this repository's code resolve to nothing: ${undeclared.join(' ')}\n` +
        `    Each is one of three things. If tflw's records anchor it, re-pin (\`refresh-sibling-citations.mjs --ref <branch>\`)\n` +
        `    and regenerate its index — that is the M169d3 path and it publishes on demand. If THIS repository\n` +
        `    defines it, \`npm run refresh:own-identifiers\` — the manifest is what stops it being asked of tflw.\n` +
        `    If nothing anywhere defines it, add it to DECLARED_UNRESOLVABLE with the reason, which is a\n` +
        `    declaration a reader can check rather than a pointer they cannot follow (D860).`,
      );
    }
    codeLines.push(
      `  ENFORCED since M169d4 — an undeclared unresolved citation in code fails this gate.`,
    );
    // A declaration that starts resolving is a lie that nobody is told. This one IS enforced —
    // it costs nothing today and it is the property a by-identifier exclusion has that a
    // by-file one cannot (`D860`).
    if (staleDecl.length) {
      problems.push(`${staleDecl.join(' ')} is declared unresolvable in verify-provenance.mjs and now resolves in tflw's index. Remove the declaration — a declared non-existence that quietly became a lie is worse than no declaration.`);
    }
  }

  if (problems.length) {
    console.error(`✗ ${problems.length} provenance problem(s)\n\n${problems.map((p) => `  · ${p}`).join('\n')}\n`);
    console.error(codeLines.join('\n'));
    return 1;
  }
  console.log(
    `✓ provenance: ${files.length} tracked markdown files, ${links === 0 ? 'none' : links} linking outside the repository;\n` +
    `  ${citing.length} of them cite the notation and all declare which sequence they mean;\n` +
    `  ${mine.size} identifiers all resolve in tflw's DECISIONS.md (${published.size} entries), and its pin\n` +
    `  of this repository (${pin.repo}@${String(pin.sha).slice(0, 7)}) agrees in both directions.`,
  );
  console.log(codeLines.join('\n'));
  return 0;
}

// ---------------------------------------------------------------------------------------------
// `--self-test` — the split is load-bearing, and each exclusion excludes something
// ---------------------------------------------------------------------------------------------
//
// `M164-04`'s rule, applied to a corpus change: a gate that reads more files is worth nothing if it
// cannot be shown to fail on a file it newly reads, and an exclusion is worth nothing if nothing
// demonstrates it excluding. Both directions, and the vacuity control matters more than the
// positive case here — the whole claim of `M169d1` is that two corpora are different ON PURPOSE,
// and "different on purpose" is indistinguishable from "different by accident" without a test that
// says what breaks if they are merged.
//
// It runs on the pure cores and needs no sibling checkout, which is why it is a separate entry
// point rather than a branch inside `main`.
function selfTest() {
  let bad = 0;
  const ok = (label) => console.log(`  ✓ ${label}`);
  const no = (label, detail) => { console.error(`  ✗ ${label} — ${detail}`); bad++; };

  const md = tracked();
  const code = readCode(ROOT);
  if (md.error || code.error) { console.error(`✗ self-test needs a real checkout: ${md.error ?? code.error}`); return 1; }

  // 1. The two corpora are disjoint, and neither is empty. If they ever overlap, an identifier is
  //    reported twice and the "markdown is read by the publish half instead" line becomes false.
  const mdPaths = new Set(md.files.map((f) => f.path));
  const overlap = code.files.filter((f) => mdPaths.has(f.path));
  if (overlap.length === 0 && md.files.length > 0 && code.files.length > 0) {
    ok(`the two corpora are disjoint and non-empty (${md.files.length} markdown, ${code.files.length} non-prose)`);
  } else {
    no('the two corpora are disjoint', `${overlap.length} file(s) in both, or one is empty`);
  }

  // 2. THE VACUITY CONTROL. Rule 2 is markdown-only by decision; this measures what that decision
  //    costs if it is ever quietly widened, so the number is in the output rather than in a
  //    comment that can go stale.
  const wouldRedden = code.files.filter(({ text }) => citationsOf(text, false).size > 0 && !DECLARES(text)).length;
  if (wouldRedden > 100) ok(`widening rule 2 to the code corpus would redden ${wouldRedden} files — the split is load-bearing, not decorative`);
  else no('the rule-2 split is load-bearing', `widening it would redden only ${wouldRedden} files; if this is genuinely small, rule 2 should widen and this test should go`);

  // 3. Every exclusion excludes something. A rule that matches nothing is a rule nobody has
  //    tested, and it will be wrong on the day it first matches.
  for (const [label, n] of code.excluded) {
    if (n > 0) ok(`the \`${label}\` exclusion is exercised (${n} file(s))`);
    else no(`the \`${label}\` exclusion is exercised`, 'it excluded nothing in this tree, so nothing here demonstrates it works');
  }

  // 4. The planted citation, both directions (`M164-04`). A citation in code is SEEN; the two
  //    shapes the exclusions exist for are NOT.
  const planted = 'a comment mentioning D404 and M404b';
  if (citationsOf(planted, false).has('D404') && citationsOf(planted, false).has('M404b')) ok('a planted citation in a code comment is seen by the widened rule');
  else no('a planted citation in a code comment is seen', `got ${[...citationsOf(planted, false)].join(' ')}`);

  // 4b. `M169d3` — the prose declaration does not reach the code corpus, and the negative control
  //     is the file that found it. A source carrying the phrase `defaultsToOwn` tests for is a
  //     source that declared itself, so this asserts the two readings of the SAME text differ, and
  //     names the count that was being lost. Reverting the parameter makes both sides equal and
  //     reddens this line.
  const selfDeclaring = code.files.find((f) => f.path === 'scripts/verify-provenance.mjs');
  if (!selfDeclaring) {
    no('the self-declaring file is in the code corpus', 'scripts/verify-provenance.mjs was not read — the corpus or the path changed');
  } else {
    const asProse = citationsOf(selfDeclaring.text, true);
    const asCode = citationsOf(selfDeclaring.text, false);
    const recovered = [...asCode].filter((id) => !asProse.has(id));
    if (recovered.length > 10 && recovered.includes('M154d')) {
      ok(`the prose default does not reach the code corpus — reading this file as prose loses ${recovered.length} identifiers, ${recovered.slice(0, 4).join(' ')} among them`);
    } else {
      no('the prose default does not reach the code corpus',
         `reading this file as prose loses ${recovered.length} identifier(s) (${recovered.join(' ') || 'none'}) — if that is genuinely zero the parameter is doing nothing`);
    }
  }

  const digest = 'sha512-xQe0+cX8ncDDoNfMhoNXtQBg0lVMbAxSJH+M7w==';
  const lockRule = EXCLUSIONS.find((r) => r.label === 'lockfile');
  const dataRule = EXCLUSIONS.find((r) => r.label === 'recorded data');
  if (citationsOf(digest).size > 0 && lockRule.test('apiV2/package-lock.json')) {
    ok('a `sha512-` tail IS read as a citation, and is excluded by path rather than by grammar');
  } else {
    no('the lockfile exclusion is the thing standing between the grammar and a digest',
       `grammar found ${[...citationsOf(digest)].join(' ') || 'nothing'}; path rule ${lockRule.test('apiV2/package-lock.json')}`);
  }
  if (dataRule.test('tflw-acceptance/mutation/kill-matrix.jsonl') && !dataRule.test('scripts/regression.mjs')) {
    ok('the recorded-data exclusion takes the census rows and leaves the scripts');
  } else {
    no('the recorded-data exclusion is scoped', 'it matches the wrong set');
  }

  // 5. A declaration must name sites that still exist. The sha is deliberately unchecked (see the
  //    docblock: CI is a depth-1 clone), but a declared identifier that nothing cites any more is
  //    a declaration that has outlived its subject.
  const citedInCode = new Set();
  for (const { text } of code.files) for (const id of citationsOf(text, false)) citedInCode.add(id);
  const orphaned = [...DECLARED_UNRESOLVABLE.keys()].filter((id) => !citedInCode.has(id));
  if (orphaned.length === 0) ok(`all ${DECLARED_UNRESOLVABLE.size} declarations still have a citation site`);
  else no('every declaration still has a citation site', `${orphaned.join(' ')} is declared and no longer cited — delete the declaration`);

  // 6. `M169d2` — the manifest. Well-formed, load-bearing, and not contradicting the declarations.
  const own = ownManifest();
  if (own.error) {
    no('the own-identifiers manifest is readable', own.error);
  } else {
    if (own.ids.size > 0) ok(`the own-identifiers manifest is well-formed and non-empty (${own.ids.size} claimed)`);
    else no('the own-identifiers manifest is non-empty', 'it claims nothing, so it cannot be doing anything');

    // The vacuity control. A manifest that changes no outcome is decorative, and the number it
    // changes things by is the thing worth printing — it is the count of identifiers that would
    // otherwise be demanded of a repository that did not define them.
    // `M169d4` — enforcement is not vacuous. The declarations are the only thing standing between
    // the gate and a red, so the count of them that would fail it is the number worth printing:
    // if this is ever zero, either the corpus stopped being read or the rule stopped being a rule.
    const wouldFail = [...DECLARED_UNRESOLVABLE.keys()].filter((id) => citedInCode.has(id));
    if (wouldFail.length > 0) ok(`enforcement is load-bearing: ${wouldFail.length} cited identifier(s) would fail the gate if their declarations were removed`);
    else no('enforcement is load-bearing', 'no declared identifier is cited in code, so nothing demonstrates the gate can fail at all');

    const claimedAndCited = [...citedInCode].filter((id) => own.ids.has(id));
    if (claimedAndCited.length > 0) ok(`the manifest is load-bearing: ${claimedAndCited.length} identifier(s) it claims are cited in this repository's own code`);
    else no('the manifest is load-bearing', 'nothing it claims is cited in code, so removing it would change no outcome');

    // The contradiction, as a property rather than only as a gate finding. Stated here too because
    // the gate's copy needs the sibling checkout and this one does not.
    const clash = [...DECLARED_UNRESOLVABLE.keys()].filter((id) => own.ids.has(id));
    if (clash.length === 0) ok('no identifier is both declared unresolvable and claimed as this repository\'s own');
    else no('the declaration list and the manifest are disjoint', `${clash.join(' ')} appears in both — see M169d1 §0.2`);
  }

  // 7. `D866` — the override is spent PER SITE, and this property exists to record WHY this gate
  //    could not have caught the defect. Read corpus-wide (what both implementations did until
  //    `M169d5`) and read per-site, the two produce the IDENTICAL identifier set: a file that
  //    spells `tflw M22` also cites `M22` by the bare grammar, so it is its own qualifying site and
  //    no identifier ever enters or leaves the demand. They differ only in WHICH SITES ask, and
  //    sites are what tflw's pin carries and this gate does not compare. So the blindness is
  //    structural, not an oversight — `M164-12` asks for a parity artefact between the two
  //    implementations, and this is the measurement that a parity check cannot be one: it is blind
  //    to an error both sides make, and both sides made this one.
  //
  //    The number below is the control. If it ever reaches zero, either the corpus stopped
  //    containing a claimed-and-qualified identifier or the override stopped being spent at all,
  //    and in both cases nothing here is demonstrating anything.
  {
    const claimedIds = own.error ? new Set() : own.ids;
    const qAt = new Map();
    const citedAt = new Map();
    for (const { path, text } of code.files) {
      const here = new Set();
      for (const [, id] of text.matchAll(THEIRS)) here.add(id);
      if (here.size) qAt.set(path, here);
      for (const id of citationsOf(text, false)) {
        if (!citedAt.has(id)) citedAt.set(id, []);
        citedAt.get(id).push(path);
      }
    }
    const anywhere = new Set();
    for (const s of qAt.values()) for (const id of s) anywhere.add(id);
    const wide = new Set();
    const perSite = new Set();
    let bareSites = 0;
    const affected = [];
    for (const [id, paths] of citedAt) {
      if (!claimedIds.has(id) || anywhere.has(id)) wide.add(id);
      if (!claimedIds.has(id) || paths.some((p) => qAt.get(p)?.has(id))) perSite.add(id);
      if (claimedIds.has(id) && anywhere.has(id)) {
        const bare = paths.filter((p) => !qAt.get(p)?.has(id));
        if (bare.length) { bareSites += bare.length; affected.push(`${id}×${bare.length}`); }
      }
    }
    const sameIds = wide.size === perSite.size && [...wide].every((id) => perSite.has(id));
    if (sameIds && bareSites > 0) {
      ok(`the override is spent per site (D866): both readings demand the same ${wide.size} identifiers — which is why this gate is blind to it — and differ at ${bareSites} site(s): ${affected.sort().join(' ')}`);
    } else if (!sameIds) {
      no('the two readings of the override demand the same identifiers',
         `they differ, which contradicts D866's account of why this gate could not see the defect — wide ${wide.size}, per-site ${perSite.size}`);
    } else {
      no('the per-site override is demonstrated by the corpus',
         'no claimed identifier is cited bare at one site and qualified at another, so nothing here distinguishes per-site from corpus-wide');
    }
  }

  console.log(bad === 0
    ? `\n✓ self-test: the corpus split is deliberate, demonstrated, and every exclusion is exercised.`
    : `\n✗ self-test: ${bad} property/properties did not hold.`);
  return bad === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes('--self-test') ? selfTest() : main());
}
