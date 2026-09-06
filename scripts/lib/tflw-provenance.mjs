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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
function ancestorOfHead(commit, root = SIBLING_ROOT) {
  if (!existsSync(path.join(root, '.git'))) return null;
  const known = spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: root, stdio: 'ignore' });
  if (known.status !== 0) return 'unknown-commit';
  const r = spawnSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: root, stdio: 'ignore' });
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
 *   `orphaned`   the commit resolves as an object but is reachable from no ref. **The normal
 *                post-merge state, not a rare one** (`M170-02`): tflw squash-merges every pull
 *                request, so a build packed while working on a branch names a commit that ceases
 *                to be reachable the moment that branch lands. Its fix is `refresh-tflw`, the same
 *                as `stale`, and it must be asked BEFORE `diverged` — with neither ancestor test
 *                able to succeed, an orphan satisfies `diverged`'s definition while needing none
 *                of its advice.
 *   `diverged`   neither is an ancestor of the other, and both are reachable from some ref.
 *   `unknown`    the sibling has never heard of that commit — a build packed elsewhere.
 *   `unknowable` the stamp carries no commit (`D737`), or there is no sibling git to ask. The
 *                ordinary state on the box, and deliberately not a synonym for `current`.
 *   `dev`        `source: 'dev'` — an unbundled `tsx` run, which has no provenance at all.
 *
 * `root` defaults to the real sibling checkout and exists so this state machine is reachable from
 * a test at all. That is not a test-only seam: `M164-12` files the fact that this repository's
 * `scripts/` are unreachable from any harness, and every git question here is already *about* a
 * named directory — hard-coding the one directory was the accident. `--self-test` below drives all
 * six git-answerable states against a real throwaway repository rather than a stubbed `spawnSync`,
 * because a stub would agree with whatever this file believes `git branch --contains` prints.
 *
 * @param {object} build the `build` object out of `tflw spec --json`
 * @param {ReturnType<typeof siblingState>} sibling
 * @param {string} [root] the checkout to ask; defaults to the real sibling
 */
export function gradeProvenance(build, sibling, root = SIBLING_ROOT) {
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
  const anc = ancestorOfHead(build.commit, root);
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
    cwd: root,
    stdio: 'ignore',
  }).status === 0;
  if (headIsAncestor) {
    return {
      state: 'ahead',
      summary: `${stamp} built from ${build.commit}, which is AHEAD of the sibling checkout at ${sibling.head} (${sibling.branch}).`,
      detail: '  The vendored build is newer than the source beside it. `git -C ../testFlow pull`, not a refresh.',
    };
  }
  // `M170-02`. Both ancestor tests have now failed, which is `diverged`'s definition — and for the
  // commonest state this repository can be in, that definition is met for a reason `diverged`'s
  // advice does not address. tflw squash-merges every pull request, so the commit `npm pack`
  // recorded while working on a branch is replaced by a new one when that branch lands and is left
  // reachable from no ref at all. Measured 2026-09-06: the local vendored build named `42efb20`,
  // `git branch -a --contains` returned nothing, and its squash replacement was `50af50a` (#160).
  //
  // So the question is asked rather than assumed, and it is one command. An orphan is exactly
  // `refresh-tflw`'s case, which is why this branch carries `stale`'s advice and not `diverged`'s
  // *"look first"* — the guard whose exceptional branch is the common path is `M141`'s shape
  // inverted, and a reader who follows advice written for the rare case investigates a situation
  // with a one-command fix.
  if (!reachableFromAnyRef(build.commit, root)) {
    return {
      state: 'orphaned',
      summary: `${stamp} built from ${build.commit}, which is reachable from no ref in the sibling checkout at ${sibling.head} (${sibling.branch}).`,
      detail:
        '  Almost certainly a squash merge: the branch this build was packed from has landed, and the\n' +
        '  commit it recorded was replaced rather than kept. Run `npm run refresh-tflw` (`M170-02`).',
    };
  }
  return {
    state: 'diverged',
    summary: `${stamp} built from ${build.commit}, which has DIVERGED from the sibling checkout at ${sibling.head} (${sibling.branch}).`,
    detail: '  Neither commit contains the other. Neither a refresh nor a pull is obviously right; look first.',
  };
}

/**
 * Is `commit` reachable from any ref in the sibling checkout (`M170-02`)?
 *
 * `git branch -a --contains` rather than `rev-list --all`: the question is *does any branch, local
 * or remote-tracking, contain it*, which is what "the history somebody else can check out" means
 * here. A commit that only a tag or a reflog holds is still orphaned for this purpose — a refresh
 * is still the right advice — so widening the ref set would move the answer without improving it.
 *
 * Empty stdout is the orphan answer. A non-zero exit means git could not tell us, and the caller
 * must NOT read that as an orphan: an unanswerable question routed into the state whose advice is
 * "run a refresh" would be `M166`'s failing-plausibly one level down. It falls through to
 * `diverged`, which is the answer the caller already had.
 */
export function reachableFromAnyRef(commit, root = SIBLING_ROOT) {
  const r = spawnSync('git', ['branch', '-a', '--contains', commit], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (r.status !== 0) return true;
  return r.stdout.trim().length > 0;
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

// --- `--self-test`: the state machine, against a real repository (`M170-02`) ---------------------
//
// `node scripts/lib/tflw-provenance.mjs --self-test`.
//
// This module is a library and it is also the only place the six git-answerable states are decided,
// so the control lives with the decision rather than in whichever gate happens to import it — all
// four importers resolve a tflw binary at module scope, so a flag on any of them would pay a full
// build resolution to answer a question about `git branch --contains` (`M170-01`'s shape, third
// site).
//
// **A real repository, not a stubbed `spawnSync`.** The thing under test is what git prints for a
// commit no ref contains; a stub asserts what this file already believes about that, which is
// `D711`'s "a shared implementation would agree with itself" arriving as a fake. The fixture makes
// a genuine orphan the way the real one was made — commit on a branch, delete the branch — and the
// squash merge this row is about produces exactly that state.

function fixtureRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'tflw-provenance-'));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in the fixture: ${r.stderr}`);
    return r.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'fixture');
  writeFileSync(path.join(dir, 'a'), 'a\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');

  git('checkout', '-q', '-b', 'feature');
  writeFileSync(path.join(dir, 'b'), 'b\n');
  git('add', '-A');
  git('commit', '-qm', 'on a branch, as a vendored build would be packed');
  const onBranch = git('rev-parse', 'HEAD');

  // The squash: main gains the branch's content as a NEW commit, and the branch goes away. This is
  // `M170-02` reproduced in miniature — `onBranch` is now reachable from no ref.
  git('checkout', '-q', 'main');
  writeFileSync(path.join(dir, 'b'), 'b\n');
  git('add', '-A');
  git('commit', '-qm', 'the squash that replaced it (#1)');
  const squashed = git('rev-parse', 'HEAD');
  git('branch', '-qD', 'feature');

  // An ancestor of HEAD that is still reachable, for the `stale` control.
  return { dir, base, onBranch, squashed, head: squashed };
}

function selfTest() {
  const ok = [];
  const bad = [];
  const t = (name, cond) => (cond ? ok : bad).push(name);

  const fx = fixtureRepo();
  const sib = { head: fx.head, branch: 'main' };
  const build = (commit, extra = {}) => ({ version: '0.1.0', source: 'released', commit, ...extra });

  // The discriminator itself, both ways round — an orphan and a reachable commit in one repository,
  // so a `reachableFromAnyRef` that answered a constant would fail one of these whichever it chose.
  t('a commit reachable from a branch is reachable', reachableFromAnyRef(fx.base, fx.dir) === true);
  t('a commit whose only branch was deleted is NOT reachable', reachableFromAnyRef(fx.onBranch, fx.dir) === false);

  // The routing this row is about: an orphan satisfies `diverged`'s definition, and must not get
  // `diverged`'s advice.
  const orphan = gradeProvenance(build(fx.onBranch), sib, fx.dir);
  t('a squashed-away build commit grades `orphaned`, not `diverged`', orphan.state === 'orphaned');
  t('and it is told to refresh, which is the one-command fix', /refresh-tflw/.test(orphan.detail ?? ''));
  t('`orphaned` is not gradeable — a manifest from the wrong build is wrong, not old',
    !GRADEABLE.has('orphaned'));

  // The neighbours still answer as they did, so the new branch narrowed nothing.
  t('an ancestor of HEAD is still `stale`', gradeProvenance(build(fx.base), sib, fx.dir).state === 'stale');
  t('HEAD itself is still `current`', gradeProvenance(build(fx.head), sib, fx.dir).state === 'current');
  t('HEAD with a dirty tree is still `dirty`',
    gradeProvenance(build(fx.head, { dirty: true }), sib, fx.dir).state === 'dirty');
  t('a commit this repository has never seen is still `unknown`',
    gradeProvenance(build('0'.repeat(40)), sib, fx.dir).state === 'unknown');
  t('a build with no commit is still `unknowable`', gradeProvenance(build(undefined), sib, fx.dir).state === 'unknowable');
  t('a dev build is still `dev`', gradeProvenance({ version: '0.1.0', source: 'dev' }, sib, fx.dir).state === 'dev');

  // The control that makes the orphan case non-vacuous: with the reachability question removed, the
  // orphan falls through to `diverged` exactly as it did before this repair.
  const withoutTheQuestion = (commit) => {
    const anc = ancestorOfHead(commit, fx.dir);
    return anc === true ? 'stale' : 'diverged';
  };
  t('without the reachability question the same commit reads `diverged` — the defect, reproduced',
    withoutTheQuestion(fx.onBranch) === 'diverged');

  rmSync(fx.dir, { recursive: true, force: true });

  if (bad.length) {
    console.error(`✗ build-provenance self-test: ${bad.length} of ${ok.length + bad.length} control(s) did not fire`);
    for (const b of bad) console.error(`    · ${b}`);
    return 1;
  }
  console.log(`✓ build-provenance self-test: ${ok.length} control(s) against a real repository, each shown to fire on the input it exists for`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--self-test')) {
    console.error('✗ this module is a library; its only command-line mode is `--self-test`.');
    process.exit(64);
  }
  process.exit(selfTest());
}

