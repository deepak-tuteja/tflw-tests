// M171b2 (`M164-09`, `D882`-`D884`) — this repository's half of the publication gate.
//
// THE THING BEING GUARDED is what a public repository publishes. `deepak-tuteja/tflw-tests` is
// public, and until `M171b` the only mechanical reader of that question lived in the sibling and
// read one region of one file there — so this repository had **no** reader at all. What it was
// publishing, measured: the box account's absolute home path **25 times across five tracked files**
// of committed perf artifacts, a personal mailbox in `package.json`, and one fixture address on a
// domain registered to a stranger. All three are repaired by the milestone that adds this file; the
// gate is what stops the fourth.
//
// THE RULES ARE IMPORTED, NOT COPIED (`D882`). They are declared once, in tflw's
// `scripts/gen-decisions.mjs`, where each carries the corpus it covers as data (`D875`). Copying
// them here would produce two implementations of one grammar with nothing holding them together —
// which is `M164-12`, verbatim, deliberately created in the middle of the milestone about guards
// whose corpus does not match the subject they claim. The import goes through `siblingRoot()`, the
// resolver this repository already uses to read tflw's mutation registry: one answer to *where is
// the sibling*, not a second one invented here.
//
// WHAT THIS DOES NOT COVER, so it is not assumed: the build host's name. `D876` puts that rule's
// corpus at tflw's generated `DECISIONS.md` block and refuses to widen it, because the host is
// named on purpose in provenance comments whose job is to say *this number was not measured on your
// machine*. It is named 45 times in 20 tracked files here and **none of them is a finding**. A gate
// that listed them would be deleted within a week, and the generated block would lose its only
// reader.
//
// IT DOES NOT SKIP WHEN THE SIBLING IS MISSING, for the reason `verify:contributing` states three
// steps above it in `ci.yml`: this runs in the one job that checks out both repositories, the two
// PRs merge chained with tflw first, and the red window between the two merges is accepted (`D511`).
// A publication gate that goes quiet when it cannot find its rules is the failure this whole
// milestone is named after.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { siblingRoot } from './lib/mutations.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Files this sweep does not read, per rule, with the reason kept here (`D883`).
 *
 * This repository's list, not the sibling's, because the corpus is this repository's. Both entries
 * are npm's own registry metadata: a lockfile records the maintainer address the registry publishes
 * for each package, which is not this repository's text to edit and not this repository's leak. The
 * alternative — an allow-list entry for that address in the shared rule — would blind the email rule
 * in **both** repositories to a real address, to excuse a file in one of them.
 *
 * Each entry is checked for still exempting something, by the sibling's own `staleExemptions`. An
 * exemption that outlives its specimen goes on excusing a whole file for a reason that stopped being
 * true, silently, and only ever in the failing-open direction.
 */
export const EXEMPT = [
  { file: 'apiV2/package-lock.json', rules: ['email'], why: "npm's published maintainer metadata for a transitive dependency — recorded by the registry, not written here" },
  { file: 'inventory-service/package-lock.json', rules: ['email'], why: "the same, in this service's own lockfile" },
];

const BINARY = /\.(png|jpe?g|gif|ico|webp|bmp|woff2?|ttf|eot|otf|pdf|zip|gz|tgz|wasm|mp4|webm|mp3|wav|ogg)$/i;

/** tflw's rule set, imported. Throws with an actionable message rather than a resolution stack. */
async function loadRules(root = siblingRoot()) {
  const file = path.join(root, 'scripts', 'gen-decisions.mjs');
  if (!existsSync(file))
    throw new Error(
      `tflw's scrub rules not found at ${file}\n` +
        `  Set TFLW_SIBLING_ROOT to the tflw checkout (this repository defaults to ../testFlow).\n` +
        `  This gate does not skip when they are missing: a publication gate that goes quiet when it\n` +
        `  cannot find its rules reports a clean repository it never read (D882).`,
    );
  const mod = await import(`file://${file}`);
  for (const name of ['SCRUB', 'scrub', 'staleExemptions'])
    if (mod[name] === undefined)
      throw new Error(`${file} no longer exports ${name} — the rule set's shape has changed (D882).`);
  return { ...mod, file };
}

async function main() {
  const { SCRUB, scrub, staleExemptions, file } = await loadRules();
  const covering = SCRUB.filter((r) => r.corpus === 'tracked');
  const outside = SCRUB.filter((r) => r.corpus !== 'tracked');

  const files = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);

  const dirt = [];
  const hits = new Map();
  for (const f of files) {
    if (BINARY.test(f)) continue;
    let text;
    try { text = readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue;
    for (const d of scrub(text, 'tracked')) {
      const key = `${f} ${d.id}`;
      hits.set(key, (hits.get(key) ?? 0) + 1);
      if (!EXEMPT.some((e) => e.file === f && e.rules.includes(d.id))) dirt.push({ ...d, file: f });
    }
  }
  const stale = staleExemptions(hits, new Set(files), EXEMPT);

  console.log(`scrub: rules read from ${path.relative(ROOT, file)}`);
  for (const r of covering) console.log(`  covering this repository — ${r.name}: ${r.subject}`);
  for (const r of outside) console.log(`  OUT OF CORPUS by decision (D876) — ${r.name}: covered only in ${r.corpus} text`);
  console.log(`  ${files.length} tracked file(s), ${EXEMPT.length} named exemption(s)`);

  let failed = false;
  if (stale.length) {
    failed = true;
    console.error(`\n✗ ${stale.length} exemption(s) no longer exempt anything:\n` +
      stale.map((t) => `    ${t.file} · rule ${t.rule}`).join('\n') + '\n' +
      `  Each excuses a file from a rule for a reason that has stopped being true. Delete the entry,\n` +
      `  or narrow it to the rules the file still needs (D883).`);
  }
  if (dirt.length) {
    failed = true;
    const shown = dirt.slice(0, 10).map((d) => `    ${d.file}:${d.line}: ${d.name} — ${JSON.stringify(d.hit)}`);
    console.error(`\n✗ ${dirt.length} thing(s) in tracked files must not be published:\n${shown.join('\n')}\n` +
      `  This repository is public. A fixture address belongs on an RFC 2606 reserved TLD\n` +
      `  (.test/.invalid/.example) rather than a domain somebody owns, and an absolute home path\n` +
      `  names a real account on a private machine (D878, D875).`);
  }
  if (failed) return 1;

  console.log(`\n✓ scrub: ${files.length} tracked files swept by ${covering.length} rule(s), nothing to report`);
  return 0;
}

process.exitCode = await main();
