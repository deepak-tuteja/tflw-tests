// Which *build* am I grading, and is it the one the checkout beside me describes?
//
// `scripts/lib/tflw-bin.mjs` answers "which tflw am I running?" — a path and a content hash. That
// was `M115-03`'s question and it is fully answered. This module answers the one `M153b-01` asked,
// which the hash cannot: **is that program current with the source tree this working copy can
// see?** A sha256 tells two builds apart; it does not tell you that the vendored one is nine days
// behind, because there is nothing to compare it against.
//
// ## The incident this exists for (`M153b-01`, filed 2026-08-25)
//
// A local `npm run check:acceptance` graded a vendored tflw that had been packed nine days
// earlier. It reported a grammar gap that tflw had closed in the meantime. The red was real — the
// *vendored* build genuinely lacked the feature — and it was read as a statement about the branch
// under review, because nothing in the output distinguished the two. The wrong conclusion reached
// a PR body and was contradicted by CI, which refreshes the vendored copy every run and therefore
// could never reproduce it.
//
// Note what did **not** fail: `resolveTflw('released')` resolved correctly, printed its path and
// its hash, and every one of those facts was true. Provenance is a different axis from identity.
//
// ## Why the comparison is against the sibling checkout, and what happens when there isn't one
//
// tflw `M154a` made the answer available: `tflw spec --json` carries a build stamp — version,
// short commit, dirty flag, build time — baked in by `packages/cli/scripts/bundle.mjs`. `D737`
// governs it and its most useful clause here is that **the stamp is never invented**: outside a
// git checkout `commit` is `null`, not a guess. So this module has three answers, not two, and the
// third is `unknowable` rather than a silently-assumed pass.
//
// `unknowable` is the *normal* state on `fedora-box`. `scripts/exec.mjs` rsyncs both trees without
// `.git/`, so a build packed there truthfully reports no commit. Treating that as a failure would
// make the offload path unusable; treating it as a pass would make the check decorative. It is its
// own state, it is printed, and each caller decides — see `gradeProvenance`'s return value.
//
// ## Direction matters, so it is measured rather than assumed
//
// "Stale" is not simply "the shas differ". A vendored build can legitimately be *ahead* of the
// sibling's HEAD (refresh, then check out an older commit to reproduce something), and it can be
// on a diverged branch. Those are three different situations with three different fixes, so this
// asks git which it is via `merge-base --is-ancestor` rather than reporting an unhelpful "≠".

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/** The sibling checkout. `..` because the two repos are peers — same premise as `tflw-bin.mjs`. */
export const SIBLING_ROOT = path.join(ROOT, '..', 'testFlow');

/**
 * Run `tflw spec --json` on a resolved entry and return the parsed manifest.
 *
 * Spawned rather than imported for the reason `D723` gives: the checklist and the program under
 * test must be the same artifact. A module import would read this repository's idea of tflw's
 * surface; this reads the binary's own account of itself.
 *
 * @param {string} entry absolute path to a tflw `cli.cjs`
 * @returns {{ manifest: number, build: object, constructs: Array<object> }}
 */
export function readSpec(entry) {
  const r = spawnSync(process.execPath, [entry, 'spec', '--json'], {
    encoding: 'utf8',
    shell: false,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    throw new Error(
      `\`tflw spec --json\` failed (exit ${r.status}) on ${entry}.\n` +
        (/unknown command|usage/i.test(out)
          ? '  This build predates `tflw spec` (M154a). Run `npm run refresh-tflw` against a\n' +
            '  sibling checkout that has it — the gate has no ground truth without it.\n'
          : '') +
        out.split('\n').slice(-10).join('\n'),
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    throw new Error(`\`tflw spec --json\` did not emit JSON: ${e.message}`);
  }
  if (!Array.isArray(parsed.constructs) || typeof parsed.manifest !== 'number') {
    throw new Error('`tflw spec --json` emitted a document with no `manifest` version or no `constructs` array.');
  }
  return parsed;
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: SIBLING_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * What the sibling checkout says about itself, or `null` when there is nothing to ask.
 *
 * Both halves of `null` are ordinary rather than exceptional: no sibling directory at all (this
 * repo cloned on its own), and a sibling directory with no `.git/` (the `exec.mjs` offload, which
 * rsyncs the tree and deliberately omits history).
 */
export function siblingState() {
  if (!existsSync(SIBLING_ROOT)) return null;
  const head = git(['rev-parse', '--short', 'HEAD']);
  if (head === null) return null;
  return {
    head,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? '(detached)',
    dirty: (git(['status', '--porcelain']) ?? '') !== '',
  };
}

/** Is `commit` an ancestor of `HEAD` in the sibling? `null` when git cannot answer. */
function ancestorOfHead(commit) {
  if (!existsSync(path.join(SIBLING_ROOT, '.git'))) return null;
  const known = spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: SIBLING_ROOT, stdio: 'ignore' });
  if (known.status !== 0) return 'unknown-commit';
  const r = spawnSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: SIBLING_ROOT, stdio: 'ignore' });
  return r.status === 0;
}

/**
 * Grade a build stamp against the sibling checkout.
 *
 * Returns a `state` and prose. The states, and why each is its own:
 *
 *   `current`    the stamp names the sibling's HEAD. The only state a gate may grade in silence.
 *   `dirty`      HEAD matches, but the tree it was packed from had uncommitted edits. Not stale —
 *                if anything it is *ahead* of any commit — but a reviewer reading a red needs to
 *                know the program is not any commit anybody else can check out.
 *   `stale`      the stamp's commit is an ancestor of HEAD. **This is `M153b-01` exactly**, and it
 *                is the one state where a red is not evidence about the code under review.
 *   `ahead`      HEAD is an ancestor of the stamp's commit. Legitimate, and worth naming rather
 *                than lumping with `stale`: the fix is `git -C ../testFlow pull`, not a refresh.
 *   `diverged`   neither is an ancestor of the other.
 *   `unknown`    the sibling has never heard of that commit — a build packed elsewhere.
 *   `unknowable` the stamp carries no commit (`D737`), or there is no sibling git to ask. The
 *                ordinary state on the box, and deliberately not a synonym for `current`.
 *   `dev`        `source: 'dev'` — an unbundled `tsx` run, which has no provenance at all.
 *
 * @param {object} build the `build` object out of `tflw spec --json`
 * @param {ReturnType<typeof siblingState>} sibling
 */
export function gradeProvenance(build, sibling) {
  const stamp = `tflw ${build?.version ?? '?'}`;
  if (build?.source === 'dev') {
    return { state: 'dev', summary: `${stamp} built by \`npm run dev\` — no build stamp to check (D737).` };
  }
  if (!build?.commit) {
    return {
      state: 'unknowable',
      summary: `${stamp} carries no commit — packed outside a git checkout, so its provenance is unknowable (D737).`,
      detail: sibling
        ? `  The sibling checkout is at ${sibling.head}; the build cannot be compared to it.`
        : '  There is no sibling checkout to compare it against either.',
    };
  }
  if (!sibling) {
    return {
      state: 'unknowable',
      summary: `${stamp} built from ${build.commit}, but there is no sibling git checkout to compare it against.`,
    };
  }
  if (build.commit === sibling.head) {
    return build.dirty
      ? {
          state: 'dirty',
          summary: `${stamp} built from ${build.commit} (${sibling.branch}) with uncommitted changes in the tree.`,
          detail: '  The program under test is no commit anybody else can check out. Fine locally; not a result to quote.',
        }
      : { state: 'current', summary: `${stamp} built from ${build.commit} (${sibling.branch}), matching the sibling checkout.` };
  }
  const anc = ancestorOfHead(build.commit);
  if (anc === 'unknown-commit') {
    return {
      state: 'unknown',
      summary: `${stamp} built from ${build.commit}, which the sibling checkout has never heard of.`,
      detail: `  Sibling HEAD is ${sibling.head} (${sibling.branch}). This build came from somewhere else.`,
    };
  }
  if (anc === true) {
    const behind = git(['rev-list', '--count', `${build.commit}..HEAD`]);
    return {
      state: 'stale',
      summary: `${stamp} built from ${build.commit}, which is ${behind ?? 'some'} commit(s) BEHIND the sibling checkout at ${sibling.head} (${sibling.branch}).`,
      detail:
        '  Run `npm run refresh-tflw` before reading anything into a failure here — this is `M153b-01`,\n' +
        '  where a nine-day-old vendored build reported a gap that had been closed nine days earlier.',
    };
  }
  const headIsAncestor = spawnSync('git', ['merge-base', '--is-ancestor', 'HEAD', build.commit], {
    cwd: SIBLING_ROOT,
    stdio: 'ignore',
  }).status === 0;
  if (headIsAncestor) {
    return {
      state: 'ahead',
      summary: `${stamp} built from ${build.commit}, which is AHEAD of the sibling checkout at ${sibling.head} (${sibling.branch}).`,
      detail: '  The vendored build is newer than the source beside it. `git -C ../testFlow pull`, not a refresh.',
    };
  }
  return {
    state: 'diverged',
    summary: `${stamp} built from ${build.commit}, which has DIVERGED from the sibling checkout at ${sibling.head} (${sibling.branch}).`,
    detail: '  Neither commit contains the other. Neither a refresh nor a pull is obviously right; look first.',
  };
}

/** The states in which a red says something about the code under review rather than about the build. */
export const GRADEABLE = new Set(['current', 'dirty', 'unknowable']);

/**
 * One line for the top of any script that grades tflw, so provenance is on screen before the
 * verdict rather than reconstructible after it.
 */
export function announceProvenance(label, verdict) {
  const mark = verdict.state === 'current' ? '·' : '!';
  process.stderr.write(`${label}: ${mark} ${verdict.summary}\n`);
  if (verdict.detail && verdict.state !== 'current') process.stderr.write(`${verdict.detail}\n`);
}

/**
 * The loud form, for a script that is **about to report failures** on a build whose provenance is
 * not `current`. Acceptance clause 3 — *a vendored build older than the visible tflw checkout
 * cannot produce a bare red* — is this function plus the call sites that use it.
 *
 * Deliberately printed **after** the failures rather than before: the reader who needs it is the
 * one looking at the last thing on screen, which is why `M153b-01` happened at all.
 */
export function stalenessBanner(verdict) {
  if (verdict.state === 'current') return '';
  const bar = '─'.repeat(78);
  return (
    `\n${bar}\n` +
    `!  READ THIS BEFORE THE FAILURES ABOVE.\n` +
    `!  ${verdict.summary}\n` +
    (verdict.detail ? `${verdict.detail.split('\n').map((l) => `!${l}`).join('\n')}\n` : '') +
    `!  A failure here is a statement about THAT build. It is only a statement about the\n` +
    `!  code you are reviewing if the two are the same, and above says they are not.\n` +
    `${bar}\n`
  );
}
