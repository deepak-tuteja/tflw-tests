#!/usr/bin/env node
/**
 * The landed-clause (`M179c`, `D915`/`D917`/`D918`). The other half of tflw's `M179a`.
 *
 * WHAT IT BUYS BACK. tflw's `scripts/sibling-citations.json` used to be re-pinned at `main` after
 * every merge here. That chore was described in `M176-06` as *"cheap and lossless — 529 cited
 * identifiers before and after"*, and it was lossless in **content** and not in **meaning**: under
 * `D511` the pin is always taken from an unmerged branch, so re-pinning at `main` afterwards was the
 * step that retroactively confirmed **this repository's prose actually landed**. `M179a` deletes the
 * chore by pinning at `refs/pull/N/head`, a ref GitHub never deletes — and deleting a chore silently
 * deletes the guarantee that rode on it. So the guarantee becomes a clause (`D915`).
 *
 * WHY HERE AND NOT IN TFLW'S CI (`D916`). `D511` fixes the merge order: tflw merges FIRST. So at the
 * moment any tflw run happens, the pull request its pin names is *necessarily* still open — not
 * usually, only. `#182` and `#183` both pinned an open `#84`; after `#183` merged, tflw's own
 * push-to-`main` run still saw `#84` open; then `#84` merged and tflw never pushed again. A clause
 * living there would tolerate `OPEN` on every run it ever had and never once be asked its question.
 * That is `M141`'s shape — an instrument never pointed at its corpus — and shipping it into the gate
 * that closes `M176-06` would plant a fresh instance of the defect the row is about. The event that
 * makes the guarantee true happens HERE, so the check belongs here (`D917`).
 *
 * WHY IT NEEDS NOTHING NEW. `acceptance-check` already checks tflw out (`repository:
 * deepak-tuteja/tflw`), so the pin is read from disk rather than fetched, and no new external target
 * is declared. The one lookup is against THIS repository's own pulls, which `GITHUB_TOKEN` covers.
 * It opens no pull request and edits nothing.
 *
 * THE TRAP THIS SHIPPED WITH A CONTROL FOR. `gh api repos/<r>/pulls/<n> --jq .state` returns
 * **`closed` for a merged pull request** — measured on `#83`, which is merged and whose `.state` is
 * `closed` while `.merged` is `true`. `gh pr view --json state` normalises to `MERGED`; the REST API
 * does not, and the two interfaces disagree. A clause written as `state === 'MERGED'` would fail on
 * **every correctly merged pull request** — a gate that fails *plausibly*, which `M166` names as
 * worse than one that refuses. So the verdict reads `merged`/`merged_at`, and a fixture whose
 * `state` is `closed` and whose `merged` is `true` is a control of its own.
 *
 * @file
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = 'deepak-tuteja/tflw-tests';

/** Where `acceptance-check` puts the tflw checkout, relative to this repository's root. */
const TFLW_PIN = path.join('..', 'testFlow', 'scripts', 'sibling-citations.json');

/** tflw's `D914`: the one shape a published pin may take. Held here too, so this gate refuses a pin
 *  it cannot reason about instead of silently reading `null` out of a regex that did not match. */
const PULL_REF = /^refs\/pull\/([1-9][0-9]*)\/head$/;

function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/**
 * The whole verdict, as arithmetic over three facts, so every branch is reachable from a test
 * without a network (`M172e`). `pin` is the PR number tflw's pin names; `justMerged` is the PR the
 * pushed merge commit belongs to, or `null` when that could not be resolved; `pr` is the API's own
 * `{ merged, state }` for the pinned number.
 *
 * `D918`: three states are reachable and only two are unambiguous. `merged` passes. A pull request
 * `closed` without being merged is the exposure this clause exists for — tflw would be publishing
 * `cited from` lines against a tree that was abandoned after tflw had already merged its half, which
 * `D511`'s ordering makes reachable rather than hypothetical. `OPEN` is the ambiguous one: it is
 * either a live `D511` window or a pull request left open forever, and the merge commit is what
 * separates them. An age bound was refused outright — a verdict that changes with the calendar is
 * `M141`'s other half.
 */
export function classify({ pin, justMerged, pr }) {
  if (!pr) return { ok: false, why: `the pinned pull request #${pin} could not be read from ${REPO}` };
  if (pr.merged) return { ok: true, why: `tflw pins #${pin}, which is merged` };
  if (pr.state === 'closed') {
    return {
      ok: false,
      why: `tflw pins #${pin}, which was CLOSED without being merged.\n`
        + '  tflw has already merged its half of this change (D511 orders it first), so its index now\n'
        + '  publishes `cited from` lines against a tree that was abandoned. Re-pin tflw at a pull\n'
        + '  request that landed, or reopen and land this one.',
    };
  }
  if (justMerged !== null && justMerged === pin) {
    return {
      ok: false,
      why: `tflw pins #${pin}, the pull request this very push merged, and the API still reports it open.\n`
        + '  These cannot both be true. Re-run once; if it persists, the pin and the merge disagree.',
    };
  }
  return {
    ok: true,
    why: `tflw pins #${pin}, still open — a live D511 window`
      + (justMerged === null ? ' (this push merged no pull request this gate could resolve)' : `, while this push merged #${justMerged}`),
  };
}

function main() {
  let pin;
  try {
    pin = JSON.parse(readFileSync(TFLW_PIN, 'utf8'));
  } catch (err) {
    console.error(`✗ cannot read tflw's pin at ${TFLW_PIN}`);
    console.error(`  ${String(err.message).split('\n')[0]}`);
    console.error('  This step runs inside `acceptance-check`, which checks tflw out beside this');
    console.error('  repository. If that checkout moved, this path moves with it.');
    return 1;
  }

  const m = PULL_REF.exec(String(pin.ref ?? ''));
  if (!m) {
    console.error(`✗ tflw's pin names \`${pin.ref}\`, which is not \`refs/pull/<N>/head\` (tflw's D914).`);
    console.error('  This clause asks whether the pinned pull request landed, so it needs a pin that');
    console.error('  names one. tflw\'s own verify:sibling-pin refuses this shape; it is reported here');
    console.error('  rather than skipped, because a check that shrugs at an input it does not');
    console.error('  understand is green about nothing (M131-03).');
    return 1;
  }
  const pinned = Number(m[1]);

  const head = process.env.GITHUB_SHA;
  let justMerged = null;
  if (head) {
    const out = gh(['api', `repos/${REPO}/commits/${head}/pulls`, '--jq', '.[0].number']);
    if (out) justMerged = Number(out);
  }

  const raw = gh(['api', `repos/${REPO}/pulls/${pinned}`, '--jq', '{merged: .merged, state: .state}']);
  const pr = raw ? JSON.parse(raw) : null;

  const verdict = classify({ pin: pinned, justMerged, pr });
  if (!verdict.ok) {
    console.error(`\n✗ ${verdict.why}`);
    console.error('\n  D915: tflw pins at refs/pull/N/head so the pin outlives the squash-merge, and this');
    console.error('  clause is what still proves the prose landed. It runs here rather than in tflw\'s CI');
    console.error('  because D511 makes it unfalsifiable there (D916/D917).');
    return 1;
  }
  console.log(`✓ sibling pin landed: ${verdict.why}`);
  if (pr) console.log(`  (raw API: state=${pr.state} merged=${pr.merged} — these disagree by design; the verdict reads \`merged\`)`);
  return 0;
}

/**
 * `M172e`: a gate green on the day it lands says so, and ships the proof it can refuse. Every case
 * is arithmetic over `classify`, so none of them touches the network.
 */
function selfTest() {
  const cases = [
    ['a pin naming a merged pull request passes',
      () => classify({ pin: 84, justMerged: 84, pr: { merged: true, state: 'closed' } }).ok === true],
    // The trap, as its own control. This fixture IS a correctly merged pull request as the REST API
    // reports one, and a clause written against `state` would refuse it.
    ['`state` is `closed` on a merged pull request, and that must not be read as closed-unmerged',
      () => classify({ pin: 83, justMerged: 83, pr: { merged: true, state: 'closed' } }).ok === true],
    ['a pin naming a CLOSED, unmerged pull request fails',
      () => classify({ pin: 84, justMerged: 90, pr: { merged: false, state: 'closed' } }).ok === false],
    ['a pin naming a different, still-open pull request passes — that is D511\'s window',
      () => classify({ pin: 85, justMerged: 84, pr: { merged: false, state: 'open' } }).ok === true],
    ['a pin naming the pull request this push merged, found unmerged, fails',
      () => classify({ pin: 84, justMerged: 84, pr: { merged: false, state: 'open' } }).ok === false],
    ['an unreadable pull request is a failure, not a shrug (M131-03)',
      () => classify({ pin: 84, justMerged: null, pr: null }).ok === false],
    ['an open pin with no resolvable merge commit still passes, and says so',
      () => {
        const v = classify({ pin: 85, justMerged: null, pr: { merged: false, state: 'open' } });
        return v.ok === true && v.why.includes('no pull request this gate could resolve');
      }],
    // The shape rule is held here as well as in tflw, so both ends refuse the same inputs.
    ['the pull-ref shape accepts refs/pull/84/head and rejects main and a branch name',
      () => PULL_REF.test('refs/pull/84/head')
        && !PULL_REF.test('main')
        && !PULL_REF.test('m178-records-and-checks')
        && !PULL_REF.test('refs/pull/0/head')],
  ];
  let bad = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = fn(); } catch (e) { ok = false; console.error(`    threw: ${e.message}`); }
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (!ok) bad++;
  }
  console.log(bad === 0 ? `\n✓ ${cases.length} controls pass.` : `\n✗ ${bad} of ${cases.length} controls failed.`);
  return bad === 0 ? 0 : 1;
}

process.exit(process.argv.includes('--self-test') ? selfTest() : main());
