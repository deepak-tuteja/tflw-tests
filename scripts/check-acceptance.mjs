#!/usr/bin/env node
// `npm run check:acceptance` — parse + checker over every corpus under `tflw-acceptance/`.
//
// Why this exists. `tflw.config`'s `exclude "tflw-acceptance"` (D127, PLAN_DISCOVERY_EXCLUDE.md)
// keeps that second, independent suite out of bare `tflw run` discovery — it has its own sessions,
// its own env, and its own targets, and `npm test` has no business starting it. What nobody noticed
// is that the same exclusion also meant nothing ever *checked* it. `tflw check` was never wired to
// it either, so for four milestones the only files anyone validated were the ones a human happened
// to run by hand.
//
// The cost showed up in `tflw-acceptance/perf/`. `TF033` tightened twice — M60 required a
// `threshold` on every workload-bearing test, M89c required a duration threshold to be paired with
// an unscoped `error rate` one — and 10 of the 12 `.tflw` files there silently stopped parsing. The
// commit that consumed M89c (`de2852d`) touched exactly two files: the two reachable ones. Nothing
// went red, because nothing was looking.
//
// Config roots are **discovered, not listed**. Hardcoding them is precisely how this rotted: a
// hand-maintained list is a thing to forget the next time a corpus is added, and forgetting it
// looks identical to passing. Every directory holding a `tflw.config` gets checked, so a new corpus
// is covered the moment it has one.
//
// Deliberately cheap: `tflw check` is parse + checker only. No Docker stack, no browsers, no `.env`
// (`require env` is a *run*-time requirement — the perf config declares two and checks clean
// without them). That is what lets this run as its own fast CI job instead of riding along with the
// regression sweep, and what makes it reasonable to run before every commit.
//
// Note the redundancy this accepts: `tflw-acceptance/perf/profile/delayed/` is its own config root
// *and* sits under `perf/profile/`, so its two files are checked twice — once against each config.
// Harmless today (neither uses a session), and the alternative — teaching this script to prune
// nested roots — would mean the inner files get checked against only one of the two configs they
// can be run under, which is strictly less coverage than doing it twice.

import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const acceptanceRoot = join(repoRoot, 'tflw-acceptance');

/** Every directory under `tflw-acceptance/` that holds a `tflw.config`, sorted for stable output. */
async function configRoots(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  if (entries.some((e) => e.isFile() && e.name === 'tflw.config')) found.push(dir);
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      found.push(...(await configRoots(join(dir, e.name))));
    }
  }
  return found.sort();
}

const roots = await configRoots(acceptanceRoot);
if (roots.length === 0) {
  console.error(`no tflw.config found anywhere under ${relative(repoRoot, acceptanceRoot)} — did the suite move?`);
  process.exit(1);
}

let failed = 0;
for (const root of roots) {
  const rel = relative(repoRoot, root);
  const result = spawnSync('npx', ['tflw', 'check', '--no-color'], { cwd: root, encoding: 'utf8', shell: false });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd();
  if (result.status === 0) {
    // Matched, not `.pop()`ed: a clean check can still print a trailing `reuse[RF…]` hint block
    // (P#2), and the last line of that is `= apply: tflw refactor apply RF001`, not the tally.
    const tally = /^\d+ files? checked.*$/m.exec(output);
    console.log(`✓ ${rel} — ${tally ? tally[0] : output.split('\n').pop()}`);
  } else {
    failed += 1;
    console.log(`✗ ${rel}`);
    console.log(output.replace(/^/gm, '    '));
  }
}

console.log(`\n${roots.length} corpora checked, ${failed} with problems.`);
process.exit(failed === 0 ? 0 : 1);
