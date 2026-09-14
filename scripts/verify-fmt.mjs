#!/usr/bin/env node
// `npm run verify:fmt` — every `.tflw` this repository tracks is formatted (`M191`, tflw `D997`).
//
// The formatter is tflw's (`tflw fmt`, tflw `D994`–`D996`): a re-emission of the lexer's own token
// stream with one spacing rule, so a file it accepts round-trips to the same tokens, the same
// indent structure and the same comments — tflw's `verify:fmt-roundtrip` gate holds that claim
// over tflw's tree, and this repository leans on it rather than re-proving it. What this gate
// asserts is narrower and is this repository's own: **the corpus is formatted**, so a hand-edited
// file that drifts from the rule goes red here and not in a reader's eye three milestones later.
//
// It is `--check` only, never `fmt` in place. A gate that rewrites the tree it grades reports on
// something the author did not commit (`M141-01`, the same rule that took `--fix` off apiV2's
// lint) — a red here prints the `tflw fmt` line that fixes it, for a person to run.
//
// Roots are the three directories that hold a tracked `.tflw` (`tests/`, `tflw-acceptance/`, and
// `shared/` with its two), walked here rather than handed to `tflw fmt` as directories, for one
// reason: `tests/.checkonly/` is excluded, and it has to be excluded by name. Ten of its fixtures
// exist so as NOT to lex (`bad-indent.tflw`, `bad-keyword.tflw`, …) and a formatter that reads the
// lexer's tokens cannot have an opinion about a file the lexer refuses — `tflw fmt` reports each
// as `not formatted` and exits 1, which is the right answer for a real file and the wrong answer
// for a fixture whose whole purpose is that refusal. The other fifty lex, and formatting them would
// be safe by the round-trip guarantee, but they are inputs to `verify-check-diagnostics.mjs` and
// the honest statement is that their bytes are the test; this gate leaves the directory alone
// rather than grading half of it. `tests/.scratch/` is skipped too, for the plainer reason that it
// is gitignored (gap #17's `body bytes` round-trip writes there) — this gate grades what the
// repository tracks, and it walks the tree instead of asking git only so that it can run on the
// build box, where the tree arrives without `.git/`.
//
// Resolves the **released** build (`resolveTflw('released')`, `M141`) for the same reason
// `check-acceptance.mjs` does: this corpus is what the vendored tflw is run against, so the
// formatter it must satisfy is the vendored one. A vendored build without `fmt` (anything before
// tflw `M191`) is reported as such and refused — grading against a program that lacks the command
// would exit 1 with a usage error and look like an unformatted tree.

import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { resolveTflw } from './lib/tflw-bin.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const ROOTS = ['tests', 'tflw-acceptance', 'shared'];
/** Excluded by name — see the header. Relative to the repo root. */
const EXCLUDED = new Set(['tests/.checkonly', 'tests/.scratch']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'report']);

const TFLW_BIN = resolveTflw('released', { label: 'verify-fmt' }).entry;

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, e.name);
    const rel = relative(repoRoot, full);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || EXCLUDED.has(rel)) continue;
      await walk(full, out);
    } else if (e.isFile() && e.name.endsWith('.tflw')) {
      out.push(rel);
    }
  }
  return out;
}

const files = [];
for (const root of ROOTS) await walk(join(repoRoot, root), files);
if (files.length === 0) {
  console.error(`✗ no .tflw files found under ${ROOTS.join(', ')} — did the corpora move?`);
  process.exit(1);
}

// Does the vendored build know the command at all? `tflw fmt` on nothing is a usage error either
// way, so the question is asked of `--help`, which every build answers.
const help = spawnSync(process.execPath, [TFLW_BIN, '--help'], { encoding: 'utf8', shell: false });
if (!/\btflw fmt\b/.test(`${help.stdout ?? ''}${help.stderr ?? ''}`)) {
  console.error('✗ the vendored tflw has no `fmt` command (it predates tflw M191) — run `npm run refresh-tflw` against a current checkout');
  process.exit(1);
}

const result = spawnSync(process.execPath, [TFLW_BIN, 'fmt', '--check', ...files], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: false,
});
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd();
const summary = /^\d+ files?, .*$/m.exec(output);

if (result.status === 0) {
  console.log(`✓ fmt: ${files.length} file(s) under ${ROOTS.join(' + ')} are formatted (${[...EXCLUDED].join(', ')} excluded by name) — ${summary ? summary[0] : 'clean'}`);
  process.exit(0);
}

console.log(output.replace(/^/gm, '    '));
console.log(`\n✗ fmt: the corpus is not formatted — ${summary ? summary[0] : `tflw fmt exited ${result.status}`}`);
// The fix names the directories this gate walked and the program it resolved — never a bare
// `tests`, which would refuse `.checkonly/`'s ten unlexable fixtures and rewrite the other fifty.
console.log(`  fix: node ${relative(repoRoot, TFLW_BIN)} fmt ${[...new Set(files.map((f) => f.split('/').slice(0, 2).join('/')))].join(' ')}`);
console.log('  (the gate never writes; see the header)');
process.exit(1);
