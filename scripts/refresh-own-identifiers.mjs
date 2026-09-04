#!/usr/bin/env node
// `M169d2` (`D-M164-06-7`) — the manifest of identifiers this repository defines for itself.
//
// ## The property that did not exist
//
// tflw pins **what this repository cites** (`scripts/sibling-citations.json`, `D709`/`D710`), and
// nothing anywhere recorded **what this repository defines**. That asymmetry is why the two
// sequences can collide in silence: measured over the 762 tracked non-prose files, 69 identifiers
// are defined in BOTH repositories' record sets and **63 of them are already published by tflw**,
// so a bare `M22` in `docker-compose.yml` resolves today to tflw's coverage audit rather than to
// this repository's nginx mTLS sidecar. That is `D711`'s stated worst case — *a real entry about
// the wrong thing* — and no gate in either repository can see it, because the only artefact that
// could is this one.
//
// ## Why it is generated rather than written
//
// `D766`: a hand-written list of ambiguous identifiers is a hand-maintained invariant wearing a
// gate. It goes stale on the first plan nobody remembers to update, and it goes stale silently,
// because a missing entry produces a *resolution* rather than an error.
//
// ## Why it is tracked, and why it holds identifiers and nothing else
//
// This repository's `PLAN_*.md` and `PROGRESS.md` are `.gitignore`d by decision — both repositories
// are public and those records carry working notes and host names — so a CI checkout cannot read
// them, and the collision is measurable only on a developer's machine. A tracked manifest is the
// one thing that can carry the answer across that boundary.
//
// It therefore carries **identifiers and a count, and no paths, titles or line numbers.** The set
// of record *filenames* is part of what the `.gitignore` decision withholds, and a manifest that
// published it would route around the decision it depends on. An identifier alone leaks nothing:
// `M22` is a name this repository already prints in its own tracked code.
//
// ## What over-claiming and under-claiming each cost
//
// Not symmetric, and the asymmetry chose the rule. **Under-claiming is the dangerous direction**:
// an identifier this repository defines and the manifest omits stays a demand on tflw's index, and
// for the 63 that collide tflw *answers* — green, wrong entry, nobody told. **Over-claiming is
// loud**: a claimed identifier stops being demanded of tflw, so a citation that genuinely meant
// tflw's must be qualified at the site (`tflw M22`), and until it is, the reader sees a
// this-repository default that the file's own declaration contradicts.
//
// So the rule is the widest defensible one — every identifier this repository's records anchor —
// and the narrowing is done by a contradiction check in `verify-provenance.mjs` rather than by a
// shape heuristic here. A shape rule WAS measured first and rejected: restricting to the anchor
// kinds that introduce a definition block (`heading`, `headingMid`, `h1`, `boldLead`) and dropping
// the tabulating ones (`tableLead`, `tableRow`, `listBold`) drops `M2`, `M3`, `M4`, `M5` and `M39`
// — five milestones this repository plainly owns, defined in `PROGRESS.md`'s own milestone table —
// and every one of the five is published by tflw. The heuristic's failures land exactly on the
// cases the manifest exists for.
//
// ## Usage
//
//   node scripts/refresh-own-identifiers.mjs            # rewrite the manifest
//   node scripts/refresh-own-identifiers.mjs --check    # fail if it is out of date
//
// `--check` is a developer discipline rather than a CI gate, for `D859`'s reason exactly: it needs
// the records, and CI does not have them. CI checks the manifest is present and well-formed; only
// a machine with the records can check it is *current*.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DECLARED_UNRESOLVABLE, MANIFEST } from './verify-provenance.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export { MANIFEST };

/**
 * This repository's records. The same shape tflw's `readRecords` uses, deliberately written out
 * again rather than imported across the checkout boundary — `D711`'s arrangement, and the reason
 * `verify-provenance.mjs` re-implements the notation instead of reading tflw's copy.
 */
export function readOwnRecords(root) {
  const names = readdirSync(root).filter((f) => /^PLAN.*\.md$/i.test(f) || f === 'PROGRESS.md');
  return names.sort().map((f) => ({ path: f, text: readFileSync(join(root, f), 'utf8') }));
}

/**
 * The anchor shapes, re-implemented here for the reason above. These are the sites at which a
 * record *introduces* an identifier, in any of the seven spellings this repository's records use.
 */
const ANCHORS = [
  /^#\s+.*?`?(D\d{1,3}[a-z]?|M\d{1,3}[a-z]?\d?)(?!-\d)`?\s*[—:-]/,
  /^#{1,5}\s+(?:\d+\.\s*)?`?(D\d{1,3}[a-z]?|M\d{1,3}[a-z]?\d?)(?!-\d)`?\s*[—.:-]/,
  /^#{1,5}\s+.*?[(`]`?(D\d{1,3}[a-z]?|M\d{1,3}[a-z]?\d?)(?!-\d)`?[),`]/,
  /^\*\*`?(D\d{1,3}[a-z]?|M\d{1,3}[a-z]?\d?)(?!-\d)`?\s*[—.:-]/,
  /^\s*[-*]\s+\*\*`?(D\d{1,3}[a-z]?|M\d{1,3}[a-z]?\d?)(?!-\d)`?\*{0,2}\s*[—.:-]/,
  /^\|\s*\*{0,2}`?(D\d{1,3}[a-z]?|M\d{1,3}[a-z]?\d?)(?!-\d)`?\*{0,2}\s*[—:-]\s/,
  /^\|\s*\*{0,2}`?(D\d{1,3}[a-z]?|M\d{1,3}[a-z]?\d?)(?!-\d)`?\*{0,2}\s*\|/,
];

export function ownIdentifiers(records) {
  const found = new Set();
  for (const { text } of records) {
    for (const line of text.split('\n')) {
      for (const re of ANCHORS) {
        const m = re.exec(line);
        if (m) { found.add(m[1]); break; }
      }
    }
  }
  return found;
}

const byId = (a, b) => {
  const p = (s) => { const m = /^([DM])(\d+)([a-z]?)(\d?)$/.exec(s); return m ? [m[1], +m[2], m[3], m[4]] : [s, 0, '', '']; };
  const [ak, an, al, ax] = p(a); const [bk, bn, bl, bx] = p(b);
  return ak.localeCompare(bk) || an - bn || al.localeCompare(bl) || ax.localeCompare(bx);
};

/**
 * Deliberately carries NO record count and no generation date. Both would be true and both would
 * churn: adding a plan that defines nothing new would rewrite a tracked file, `--check` would fail
 * for a reason that is not about identifiers, and the next person would learn to re-run the
 * refresher without reading what changed. The manifest moves when its subject moves.
 *
 * `unresolvable` IS THE SECOND HALF OF THE SAME QUESTION (`M169d3`). The claims say *do not ask tflw
 * for these, they are ours*; the declarations say *do not ask tflw for these either, nothing can
 * answer them*. Both are answers to *what does this repository want from that index*, both are
 * knowable only here, and both have to cross a boundary where neither repository can read the
 * other's `.gitignore`d records — so they travel together, in the one tracked artefact that exists
 * to carry exactly that.
 *
 * It is generated from `verify-provenance.mjs`'s `DECLARED_UNRESOLVABLE` rather than restated, so
 * a declaration cannot be added to the gate and forgotten here; `--check` is what says so. The
 * reasons ride along because a list of bare identifiers in a public file, with no account of why,
 * is the thing `D860` was written against.
 */
export function renderManifest(ids, unresolvable) {
  return JSON.stringify({
    $comment: 'Generated by scripts/refresh-own-identifiers.mjs (M169d2, D-M164-06-7, M169d3). Do not edit by hand. Identifiers only, by decision: the set of record FILENAMES is part of what this repository\'s .gitignore withholds, and both repositories are public.',
    repo: 'deepak-tuteja/tflw-tests',
    identifiers: [...ids].sort(byId),
    unresolvable: Object.fromEntries([...unresolvable].sort((a, b) => byId(a[0], b[0]))),
  }, null, 2) + '\n';
}

function main(argv) {
  const records = readOwnRecords(ROOT);
  if (records.length === 0) {
    console.error(
      '✗ this repository\'s records are not present, so the manifest cannot be refreshed.\n' +
      '  PLAN_*.md and PROGRESS.md are .gitignore\'d by decision — run this on a machine that has\n' +
      '  them. A CI checkout never can, which is why --check is a developer discipline (D859).',
    );
    return 1;
  }
  const ids = ownIdentifiers(records);
  const next = renderManifest(ids, DECLARED_UNRESOLVABLE);
  const path = join(ROOT, MANIFEST);
  let current = null;
  try { current = readFileSync(path, 'utf8'); } catch { /* first run */ }

  if (argv.includes('--check')) {
    if (current === next) {
      console.log(`✓ own-identifiers.json is current: ${ids.size} identifier(s) from ${records.length} record(s).`);
      return 0;
    }
    const had = current ? new Set(JSON.parse(current).identifiers) : new Set();
    const added = [...ids].filter((i) => !had.has(i)).sort(byId);
    const gone = [...had].filter((i) => !ids.has(i)).sort(byId);
    console.error(
      `✗ own-identifiers.json is out of date against this repository's ${records.length} record(s).\n` +
      (added.length ? `  now defined and not in the manifest: ${added.join(' ')}\n` : '') +
      (gone.length ? `  in the manifest and no longer defined: ${gone.join(' ')}\n` : '') +
      '  Run `npm run refresh:own-identifiers` and commit the result. An identifier this repository\n' +
      '  defines and the manifest omits stays a demand on tflw\'s index — and for the ones whose\n' +
      '  number tflw also uses, tflw ANSWERS it, with the wrong entry and nothing reporting it.',
    );
    return 1;
  }

  writeFileSync(path, next);
  console.log(`✓ own-identifiers.json: ${ids.size} identifier(s) from ${records.length} record(s)${current === next ? ' (unchanged)' : ''}.`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
