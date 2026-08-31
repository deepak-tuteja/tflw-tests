// The sibling's mutation registry, read from tflw. `M164a`, testFlow `PLAN_M164_ROSTER_VACUITY.md`
// (`D838`, `D839`, `D843`).
//
// ## Why this file exists rather than a corpus of our own
//
// `M164` asks whether a roster plant would have gone red if its construct had broken. Answering it
// needs perturbations of tflw's *implementation* (`D838`), and tflw already has 311 of them:
// declarative `{ id, milestone, file, what, find, replace }` records in `scripts/mutate.mjs`, each
// maintained beside the code it mutates and each required to kill one of tflw's own tests.
//
// `D839` reuses them. The alternative — authoring one mutation per plant here — was the default
// until three things were measured. Mutations cannot be generated: the obvious "disable the branch"
// edit, `if (false && step.type === 'ExpectStmt' && step.soft)`, fails `tsc` with `TS2339` because
// putting the constant first destroys the discriminated-union narrowing that makes `step.soft`
// legal. So each one is hand-authored against real code and must compile. A second corpus would
// also drift with no coupling to the source it describes, and it would make this repository assert
// what tflw's internals look like — the inversion `verify-construct-coverage.mjs`'s docblock already
// rejects for its own gate.
//
// ## Importing `mutate.mjs` is safe, and that is load-bearing
//
// tflw's `D224` put a `main` guard on that file for this exact reason: `M122` once `import()`ed it
// to read `MUTATIONS`, the import ran a sweep, and it left a deleted guard behind in
// `interpreter.ts`. The response was first a written rule — *never import this script* — which is a
// sign next to a landmine. The guard is the fix, and this module is a consumer of it.
//
// ## Reachability is derived from the artifact, never hand-listed
//
// A mutation can only change what a plant sees if the file it edits ends up in the **vendored CLI
// bundle** the plants actually run. That is a question about a build, so it is answered by running
// esbuild over the same entry points `packages/cli/scripts/bundle.mjs` uses and reading the
// metafile — never by a list in this file. A hand-maintained list here would be `D767` exactly: a
// count no gate reads, going stale the first time tflw moves a module.
//
// It is worth saying what the derived answer corrected. The plan's own §2.3 estimated ~188
// reachable mutations from a hand-written list of "construct-observable" files. The measured answer
// is **271 of 311**, because the list wrongly excluded `lsp-server`, `sarif`, `repro` and `html` —
// all of which are in the bundle. Only `packages/cli/src` is bundled from source; every other
// package enters through its compiled `dist/`, which is why the mapping below exists.
//
// **Reachability is a sound EXCLUSION filter and an unsound inclusion filter.** A file outside the
// bundle cannot possibly affect a plant. A file inside it very well may not — the LSP server is
// bundled and no plant runs a language server, and SARIF is bundled but only read by a grader
// `D846` puts out of scope. So this module reports reachability and refuses to call it coverage.
// Which mutations actually reach which plants is measured by discovery (`M164b`), not predicted.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/**
 * The sibling checkout. `../testFlow` is the layout everyone here works in and stays the default,
 * but it is an assumption about the filesystem — `refresh-tflw.mjs` carries the same override for
 * the same reason, and its comment records what a hard-coded `..` cost when the scheduled
 * cross-repo gate ran from `~/tflw-perf/`. `TFLW_SIBLING_CLI` is honoured too, so a caller that
 * already sets the one this repository has had for months does not need to learn a second name.
 */
export function siblingRoot() {
  if (process.env.TFLW_SIBLING_ROOT) return path.resolve(process.env.TFLW_SIBLING_ROOT);
  if (process.env.TFLW_SIBLING_CLI) return path.resolve(process.env.TFLW_SIBLING_CLI, '..', '..');
  return path.join(ROOT, '..', 'testFlow');
}

export const REGISTRY_PATH = (root = siblingRoot()) => path.join(root, 'scripts', 'mutate.mjs');

/** Reads tflw's registry. Throws with an actionable message rather than a module-resolution stack. */
export async function readMutations(root = siblingRoot()) {
  const file = REGISTRY_PATH(root);
  if (!existsSync(file))
    throw new Error(
      `tflw's mutation registry not found at ${file}\n` +
        `  Set TFLW_SIBLING_ROOT to the tflw checkout (this repository defaults to ../testFlow).`,
    );
  const mod = await import(`file://${file}`);
  if (!Array.isArray(mod.MUTATIONS))
    throw new Error(`${file} no longer exports MUTATIONS — the registry's shape has changed (D839).`);
  return { mutations: mod.MUTATIONS, unreconstructed: mod.UNRECONSTRUCTED ?? [], file };
}

/**
 * Every `(find, replace)` pair a mutation applies. 305 of 311 carry `find`/`replace` directly; six
 * carry `edits`, an array of pairs, because one claim needs two coordinated edits to be reachable.
 * Callers that treat `find` as the only shape silently skip those six.
 */
export const editsOf = (m) => (m.edits ? m.edits.map(([find, replace]) => ({ find, replace })) : m.find ? [{ find: m.find, replace: m.replace }] : []);

/**
 * Where a mutated source file lands in the bundle. `packages/cli/src` is bundled from source; every
 * other workspace package is bundled from its compiled output, so `src/x.ts` is reached as
 * `dist/x.js`. Anything outside `packages/<pkg>/src` — `scripts/`, `.github/`, docs, `test/`,
 * `package.json` — has no bundle counterpart at all.
 */
export function bundleTargetFor(file) {
  const m = /^packages\/([^/]+)\/src\/(.+)\.ts$/.exec(file);
  if (!m) return null;
  return m[1] === 'cli' ? file : `packages/${m[1]}/dist/${m[2]}.js`;
}

const ESBUILD_PROBE = `
const { build } = require('esbuild');
const path = require('path');
const cli = path.join(process.cwd(), 'packages', 'cli');
const root = process.cwd();
(async () => {
  const all = new Set();
  for (const entry of ['src/cli.ts', '../runtime/src/mtlsWorkerEntry.ts']) {
    const r = await build({
      absWorkingDir: cli, entryPoints: [entry], bundle: true, platform: 'node',
      format: 'cjs', external: ['playwright'], write: false, metafile: true, logLevel: 'silent',
    });
    for (const f of Object.keys(r.metafile.inputs)) {
      const abs = path.resolve(cli, f);
      if (abs.startsWith(root + path.sep) && !abs.includes('node_modules')) all.add(path.relative(root, abs));
    }
  }
  process.stdout.write(JSON.stringify([...all].sort()));
})().catch((e) => { console.error(String(e && e.message ? e.message : e)); process.exit(1); });
`;

let _inputs = null;

/**
 * The bundle's real input set, computed by running esbuild in the sibling checkout — it owns
 * esbuild, this repository does not. Memoised per process: two entry points, ~1-2 s, and every
 * caller in this milestone wants the same answer.
 *
 * **What a stale `dist/` does to this answer, since `M153b-01` makes that the question to ask of
 * any derived set here.** Every package except `cli` is bundled from compiled output, so this reads
 * a build rather than the source the mutations edit. Staleness does *not* move the answer for an
 * edit to a file that already exists in the graph — the name is the same whatever the build's age.
 * It moves the answer only when a module has been **added or removed** since that build, and then a
 * genuinely reachable mutation is reported unreachable (or the reverse). Nothing here detects that,
 * and the anchor check will not either: anchors are read from `src`, membership from `dist`.
 *
 * It is left as a known limit rather than guarded because the consumer makes it harmless.
 * `M164b` re-vendors before every mutation, which rebuilds the graph, and a mutation wrongly
 * excluded here is a mutation not tried — a smaller candidate set, never a false kill or a false
 * survivor. The failure mode is undercounting, and `M164c` reads the candidate count against the
 * registry's own total, where 271 of 311 is visible as a number rather than assumed as complete.
 */
export function bundleInputs(root = siblingRoot()) {
  if (_inputs) return _inputs;
  const r = spawnSync(process.execPath, ['-e', ESBUILD_PROBE], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0)
    throw new Error(
      `could not derive the bundle's inputs from ${root}\n` +
        `  ${(r.stderr || '').trim().split('\n')[0]}\n` +
        `  The sibling checkout needs its dependencies installed (npm ci) and its packages built.`,
    );
  _inputs = new Set(JSON.parse(r.stdout));
  return _inputs;
}

/**
 * Classifies every mutation as reachable by a plant or not, with the reason written out. Note the
 * asymmetry this module refuses to hide: `reachable: false` is a proof, `reachable: true` is a
 * possibility (see this file's header).
 */
export function classify(mutations, inputs) {
  return mutations.map((m) => {
    const target = bundleTargetFor(m.file);
    if (!target) return { m, reachable: false, target: null, why: 'not a workspace source file — no bundle counterpart' };
    if (!inputs.has(target)) return { m, reachable: false, target, why: `${target} is not an input to the bundle` };
    return { m, reachable: true, target, why: `${target} is bundled into the CLI the plants run` };
  });
}

/**
 * Anchor health, which is the sibling's own staleness question (`D843`'s neighbour): a mutation
 * whose `find` no longer occurs is not appliable, and one that occurs more than once would patch an
 * unintended site. tflw checks this for itself; this repository has to check it too, because it is
 * about to *depend* on the registry and a silently shrinking candidate list is the `M153b-01`
 * shape — a gate quietly grading less than it claims.
 */
export function anchorState(m, root = siblingRoot()) {
  const file = path.join(root, m.file);
  if (!existsSync(file)) return { state: 'missing-file', detail: m.file };
  const src = readFileSync(file, 'utf8');
  const edits = editsOf(m);
  if (edits.length === 0) return { state: 'no-edits', detail: 'neither find/replace nor edits' };
  for (const { find } of edits) {
    const n = src.split(find).length - 1;
    if (n === 0) return { state: 'stale', detail: `anchor not found in ${m.file}` };
    if (n > 1) return { state: 'ambiguous', detail: `anchor occurs ${n}x in ${m.file}` };
  }
  return { state: 'ok', detail: `${edits.length} edit(s)` };
}
