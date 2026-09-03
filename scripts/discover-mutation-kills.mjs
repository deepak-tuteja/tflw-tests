#!/usr/bin/env node
// `npm run discover:mutation-kills` — does each roster plant actually discriminate?
//
// `M164b`, testFlow `PLAN_M164_ROSTER_VACUITY.md` (`D827`, `D838`-`D847`). The expensive half of
// `D840`'s two-artefact split: this runs a census, `M164d` runs the cheap ratchet derived from it.
//
// ## What it does, per candidate
//
//   apply -> re-vendor -> PROVE THE MUTATION IS INSTALLED (`D843`) -> run the whole roster ->
//   record which plants died -> revert -> verify the revert
//
// A plant that dies is *killed*. A plant that lives under a mutation of its own construct has
// nothing to say about that construct, which is the thing `D827` says nobody has ever checked.
// **A kill is measured here; `covers` is asserted by hand in `M164c` (`D842`).** This script never
// claims coverage.
//
// ## `D847` — why the installation proof is not the vendored build's sha
//
// `D843` said to prove installation by watching "the vendored build's identity change", pointing at
// `verify-construct-coverage.mjs`'s provenance helpers. Measured on the box before this was built,
// and both halves of that sentence are wrong:
//
//   - The provenance helpers read `tflw spec --json`'s `build.commit`. A mutation edits the working
//     tree without committing, so `commit` is **the same string for every mutation in this sweep**.
//   - The raw sha256 of `node_modules/tflw/dist/cli.cjs` moves on *every* rebuild, because
//     `builtAt` is baked into the bundle. Two consecutive refreshes with nothing changed:
//     `6f9de43c15181f72` -> `23aaf15ddec59800`. As an installation proof that is **vacuous** — it
//     says yes unconditionally, which is exactly why `D838` rejected corpus-level perturbation.
//
// So the identity used here is the sha of the bundle with the three build-stamp fields normalised
// out. Measured, same box, same probe: stable at `8a17551fad75ee97` across two no-op refreshes, and
// moving under both a `packages/lang` mutation (`bom-col`) and a `packages/cli/src` one
// (`log-file-mkdir`). It is a real instrument; the one `D843` named is not.
//
// Three states, never two (`D843`): `killed`, `survived`, and `unbuildable` — the last covering
// both a re-vendor that exits non-zero and one that exits 0 without moving the normalised bundle.
// The pilot in `PLAN_M164` §3 produced a clean sweep of false survivors from a `tsc` failure; that
// is what this refuses to repeat.
//
// ## Restoration is proved by content, not by `git status`
//
// The box tree carries no `.git/` — `exec.mjs` rsyncs without it — so `git status` throws there and
// cannot be the check. The revert is verified by reading the file back against the journal's
// original bytes, and the sweep additionally re-measures the normalised bundle against the
// baseline. That is a stronger claim than a clean `git status` in any case.
//
// ## The journal is tflw's, deliberately
//
// This edits *tflw's* tracked sources, which is `mutate.mjs`'s job and `mutation-journal.mjs`'s
// promise. Writing the same journal buys two things for free: an interrupted sweep is repairable by
// tflw's own `--list` path, and a concurrent `mutate.mjs` **refuses to start** rather than
// restoring a source this sweep is still measuring. That last one is `M123-03` — a false survivor
// produced by exactly this collision, one repository over.
//
// ## Cost, and why it is chunked
//
// Measured: re-vendor 5.2-5.5 s on the box (not the 7 s `PLAN_M164` §2.2 sized with), full roster
// ~85 s. Over 271 candidates that is ~6.8 h. `exec.mjs` holds the box lease on an open SSH
// connection, so a single 7-hour invocation is one dropped link away from nothing. `--limit` makes
// each invocation bounded and the JSONL matrix makes the next one resume, per `D840`'s note that a
// long run which cannot resume gets run once and never again.
//
// ## Not on a schedule, not in CI (`D844`)
//
// Invoked by hand, under the box lock. Nothing here arms a timer.
//
//   node scripts/discover-mutation-kills.mjs --limit 40
//   node scripts/discover-mutation-kills.mjs --only bom-col,log-file-mkdir
//   node scripts/discover-mutation-kills.mjs --baseline-only
//   node scripts/discover-mutation-kills.mjs --status
//   node scripts/discover-mutation-kills.mjs --out /tmp/sweep   (default: ~/.tflw-mutation)
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { siblingRoot, readMutations, editsOf, bundleInputs, classify, anchorState } from './lib/mutations.mjs';
import { plantsFor } from './lib/constructs.mjs';
import { claimDigest, patchDigest, aggregate, shapeOfRosterOutput } from './lib/census-shape.mjs';
import { resolveTflw } from './lib/tflw-bin.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SIB = siblingRoot();
// `released` — the vendored tarball, which is the build the plants actually run and therefore the
// only one whose identity answers "is this mutation installed?". Asked through the resolver rather
// than by hand so the question is declared, which is what `verify-tflw-resolution.mjs` exists to
// require; it caught the hand-built path in this file's first draft.
const { entry: CLI } = resolveTflw('released', { label: 'mutation-discovery' });

// ── argv ─────────────────────────────────────────────────────────────────────────────────────
const KNOWN = new Set(['--limit', '--only', '--baseline-only', '--status', '--out', '--window', '--remeasure', '--why', '--help']);
const argv = process.argv.slice(2);
for (const a of argv) {
  if (a.startsWith('--') && !KNOWN.has(a.split('=')[0])) {
    console.error(`unknown flag: ${a}\nknown: ${[...KNOWN].join(' ')}`);
    process.exit(64);
  }
}
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};
const has = (name) => argv.includes(name);

// `--help` was in `KNOWN` from the first draft with nothing reading it, so asking for usage passed
// validation and started a multi-hour sweep under the box lock. `KNOWN` looks like a list of
// supported flags and is only a list of spellings that avoid exit 64; two of its six entries did
// nothing. Anything added there needs a reader, and this is the reader for one of them.
if (has('--help')) {
  console.log(
    [
      'usage: node scripts/discover-mutation-kills.mjs [options]',
      '',
      '  --limit <n>        stop after n candidates this invocation (default: all)',
      '  --only <a,b,...>   sweep only these mutation ids',
      '  --remeasure <a,b,...>  retract these settled verdicts so a changed roster can be measured',
      '                     against them again; needs --why. `--only` alone will NOT re-run a',
      '                     recorded id — it narrows the candidates before `settled()` filters them',
      '  --why <text>       what changed, recorded on each retraction row',
      '  --baseline-only    run the baseline roster and stop',
      '  --status           report how far the recorded matrix has got, and stop',
      '  --out <dir>        where the matrix and run metadata live (default: ~/.tflw-mutation)',
      '  --window <n>       re-verify the baseline every n candidates, and recycle the stack',
      '                     (default 20; 0 disables, which is how the first census corrupted itself)',
      '  --help             this text',
      '',
      '  env TFLW_DISCOVER_CONTROL=break|noop   force an `unbuildable` path on the first candidate',
    ].join('\n'),
  );
  process.exit(0);
}
const LIMIT = flag('--limit') ? Number(flag('--limit')) : Infinity;
const ONLY = flag('--only') ? new Set(flag('--only').split(',')) : null;
const BASELINE_ONLY = has('--baseline-only');
const STATUS = has('--status');
const WINDOW = flag('--window') !== null ? Number(flag('--window')) : 20;

/**
 * Where the matrix lives, and why it is NOT under `tflw-acceptance/`.
 *
 * It was, for exactly one run. `exec.mjs` rsyncs both trees to the box with `--delete`, and the
 * matrix is a file the box has and this Mac does not, so **the next chunk's own invocation deletes
 * the matrix it was going to resume from**. Measured 2026-09-01: six recorded candidates, nine
 * minutes of box time, destroyed by a `--status` call — the one command whose entire job is to
 * report how far the sweep got. It then printed `recorded 0 of 271` and exited 0. `D840` makes the
 * JSONL matrix the mechanism by which a chunked sweep resumes; sited in the synced tree, that
 * mechanism is inert, and inert in the silent direction.
 *
 * Excluding the path in `exec.mjs` would work — that is what `.tflw-exec-lockhash` and
 * `nginx/certs/` do there, for the same `--delete` reason. It is deliberately **not** the fix here.
 * `exec.mjs` is untracked (`D14`), machine-local, and read by no gate, so a correctness property of
 * a tracked script would depend on a file that ships nowhere and that nothing checks. The docblock
 * listing those two prior wipes is in the same file that failed to prevent this third one.
 *
 * So the default sits outside every rsynced tree, in a per-user state directory that is the same
 * shape on both machines. `--out <dir>` overrides it, and now actually does: it was in `KNOWN` from
 * the first draft and never read, so `--out` parsed, validated, and silently wrote to the default.
 */
const OUT_DIR = flag('--out') ? path.resolve(flag('--out')) : path.join(homedir(), '.tflw-mutation');
const MATRIX = path.join(OUT_DIR, 'kill-matrix.jsonl');
const META = path.join(OUT_DIR, 'run-meta.json');
// `M168-09`. The roster and the registry a census was measured against, recorded as content rather
// than as a count. Its own file rather than a field on `run-meta.json`, which is a nine-line header
// a human reads and which 418 digests would drown (`D-M168-09-5`).
const SHAPE = path.join(OUT_DIR, 'census-shape.json');
// `M164c`. A kill records WHICH plants went red and nothing about HOW, and those are two
// different findings. The acceptance grader prints both — a plant whose fixture never ran says
// `(skipped: no report)` and has an empty tally, a plant whose own known answer came out false
// says `recall 2/3` — and the census kept only the glyph. `D842` cannot be decided from the
// glyph: a plant that asserted nothing cannot have been covered by anything. So the grader's
// own page is kept for every killing mutation, which is ten files, not 271.
const TRANSCRIPTS = path.join(OUT_DIR, 'transcripts');

/**
 * `TFLW_DISCOVER_CONTROL=break` / `=noop` — force the `unbuildable` verdict's two paths on the
 * first candidate swept, so both can be watched running.
 *
 * An env var rather than a flag, and the precedent is one file over: tflw's `mutation-journal.mjs`
 * exposes `TFLW_MUTATE_JOURNAL` because *"a repair path nobody has ever watched run is a claim, not
 * a control"*. `D843` exists because the pilot mis-read a failed build as a clean sweep of
 * survivors; a branch written to prevent that and never once executed would be the same defect
 * wearing the fix's clothes.
 *
 *   break  corrupt the source after applying, so `refresh-tflw` must exit non-zero
 *   noop   put the source back before re-vendoring, so the build succeeds and the bundle is
 *          identical to baseline — the case a plain exit-code check cannot see
 */
const CONTROL = process.env.TFLW_DISCOVER_CONTROL ?? null;
if (CONTROL && !['break', 'noop'].includes(CONTROL)) {
  console.error(`TFLW_DISCOVER_CONTROL must be 'break' or 'noop' (got ${CONTROL})`);
  process.exit(64);
}

// ── identity of the vendored build, with the build stamp normalised out (`D847`) ─────────────
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
function bundleIdentity() {
  if (!existsSync(CLI)) return '<missing>';
  const src = readFileSync(CLI, 'utf8')
    .replace(/builtAt: *"[^"]*"/g, 'builtAt:"X"')
    .replace(/commit: *"[^"]*"/g, 'commit:"X"')
    .replace(/dirty: *(true|false)/g, 'dirty:X');
  return sha(src);
}

// ── the roster, and reading its per-plant verdicts ────────────────────────────────────────────
const GRADED = plantsFor('acceptance').map((p) => p.id);

/**
 * Run the acceptance roster and return the set of plant ids that did NOT produce their known answer.
 *
 * The grader's closing table is parsed rather than a JSON flag being added to it: this sweep must
 * not change the instrument it is measuring through. The parse is guarded instead — every id the
 * gate claims to grade must appear in the table exactly once, or this refuses. A format change then
 * stops the sweep rather than silently shrinking the kill set, which is `M153b-01`'s failure mode
 * (a confident wrong answer from a stale read) applied to a table instead of a build.
 */
function runRoster() {
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-construct-acceptance.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const seen = new Map();
  for (const line of out.split('\n')) {
    const m = /^\s{2}([✓✗–])\s+(C\d+)\s/.exec(line);
    if (m) seen.set(m[2], m[1]);
  }
  const missing = GRADED.filter((id) => !seen.has(id));
  const red = GRADED.filter((id) => seen.get(id) === '✗');
  // `M168-09`. The same table, one column further along: `recall 4/4  precision 3/3`. The
  // DENOMINATORS only — the numerator is the measurement and moving it is the whole point of a
  // mutation, so only a baseline's shape is meaningful and only a baseline records it.
  return { code: r.status, secs: Number(((Date.now() - t) / 1000).toFixed(1)), seen, missing, red, out, shape: shapeOfRosterOutput(out) };
}

// ── the journal (tflw's own) ──────────────────────────────────────────────────────────────────
const journal = await import(`file://${path.join(SIB, 'scripts', 'mutation-journal.mjs')}`);

function refuseIfJournalOpen() {
  const open = journal.readJournal();
  if (!open) return;
  if (journal.isProcessAlive(open.pid) && open.pid !== process.pid) {
    console.error(`✗ a mutation sweep is already running in ${SIB} (pid ${open.pid}), holding \`${open.id}\`.`);
    console.error('  Two sweeps cannot share one worktree — whichever finishes second restores what the');
    console.error('  first was still measuring (`M123-03`). Wait for it.');
    process.exit(2);
  }
  const { restored, problems } = journal.applyJournal(open, SIB);
  if (problems.length > 0) {
    console.error(`✗ a previous run died with \`${open.id}\` applied and the repair failed:`);
    for (const p of problems) console.error(`    ${p}`);
    process.exit(2);
  }
  if (restored.length > 0) console.log(`↺ repaired a stale journal: restored ${restored.join(', ')}`);
  journal.clearJournal();
}

// ── apply / revert ────────────────────────────────────────────────────────────────────────────
function applyMutation(m) {
  const originals = {};
  for (const rel of new Set([m.file])) originals[rel] = readFileSync(path.join(SIB, rel), 'utf8');
  const entry = { id: m.id, milestone: `M164b (${m.milestone ?? '?'})`, pid: process.pid, startedAt: new Date().toISOString(), files: originals };
  journal.writeJournal(entry);
  const abs = path.join(SIB, m.file);
  let cur = readFileSync(abs, 'utf8');
  for (const e of editsOf(m)) {
    const n = cur.split(e.find).length - 1;
    if (n !== 1) {
      journal.applyJournal(entry, SIB);
      journal.clearJournal();
      return { ok: false, why: `anchor matches ${n}x (expected exactly 1)` };
    }
    cur = cur.replace(e.find, e.replace);
  }
  writeFileSync(abs, cur);
  return { ok: true, entry };
}

function revertMutation(entry) {
  const { problems } = journal.applyJournal(entry, SIB);
  for (const [rel, original] of Object.entries(entry.files)) {
    if (readFileSync(path.join(SIB, rel), 'utf8') !== original) problems.push(`${rel}: still differs after restore`);
  }
  journal.clearJournal();
  return problems;
}

function refresh() {
  const t = Date.now();
  const r = spawnSync('npm', ['run', 'refresh-tflw'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, secs: Number(((Date.now() - t) / 1000).toFixed(1)), out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

// ── the matrix, append-only so the sweep resumes ──────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const done = new Map();
if (existsSync(MATRIX)) {
  for (const line of readFileSync(MATRIX, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const row = JSON.parse(line); done.set(row.id, row); } catch { /* a torn last line from a kill -9; re-run overwrites it */ }
  }
}
/**
 * `M168-09`. The roster a row was measured against, stamped onto the row.
 *
 * `M168-02`'s carry is that *a verdict is a statement about a mutation **and the roster it was
 * measured against**, and the matrix keys it by the mutation alone*. Recording the roster once per
 * census is the second half of that sentence; stamping it per row is the whole sentence, and costs
 * one field. Set at baseline, so the retraction rows written before it carry `null` — which is
 * correct: a retraction is not a measurement of anything.
 */
let ROSTER_STAMP = null;
const record = (row) => {
  appendFileSync(MATRIX, `${JSON.stringify(ROSTER_STAMP ? { ...row, rosterStamp: ROSTER_STAMP } : row)}\n`);
  done.set(row.id, row);
};

/**
 * A recorded id counts as done unless its most recent row RETRACTS it. Retraction exists because a
 * verdict can be invalidated after the fact by something the verdict itself could not see — see
 * `D848`. The row is appended rather than deleted so the matrix stays append-only and the
 * retraction is part of the record instead of a gap in it.
 */
const settled = (id) => done.has(id) && done.get(id).state !== 'retracted';

// ── candidates ────────────────────────────────────────────────────────────────────────────────
const { mutations, file: registryFile } = await readMutations(SIB);
// The full reachable set is kept separate from what THIS invocation will run, because `run-meta`
// records the census's denominator and `--only` must not shrink it. A replay of ten mutations that
// rewrote `candidates: 10` would leave a committed artefact claiming a ten-mutation census.
const allCandidates = classify(mutations, bundleInputs(SIB)).filter((c) => c.reachable).map((c) => c.m);
let candidates = ONLY ? allCandidates.filter((m) => ONLY.has(m.id)) : allCandidates;

if (STATUS) {
  const tally = { killed: 0, survived: 0, unbuildable: 0, skipped: 0 };
  for (const row of done.values()) tally[row.state] = (tally[row.state] ?? 0) + 1;
  const left = candidates.filter((m) => !settled(m.id)).length;
  console.log(`matrix: ${MATRIX}`);
  console.log(`recorded ${done.size} of ${candidates.length} candidate(s) — ${left} remaining`);
  console.log(`  killed ${tally.killed}  survived ${tally.survived}  unbuildable ${tally.unbuildable}  skipped ${tally.skipped}`);
  process.exit(0);
}

console.log(`registry:   ${registryFile}`);
console.log(`candidates: ${candidates.length} reachable of ${mutations.length}`);
console.log(`graded plants: ${GRADED.length}`);
console.log(`matrix:     ${MATRIX} (${done.size} already recorded)\n`);

/**
 * `--remeasure` — retract settled verdicts so a CHANGED ROSTER can be measured against them again.
 *
 * `M168-02` is what named the hole. A verdict is a statement about a mutation **and the roster it
 * was measured against**, and this matrix keys it by the mutation alone; when a plant changes, every
 * verdict measured against the old plant is stale. Until this flag there was no way to say so:
 * `settled()` skips any recorded id, `--only` narrows `candidates` BEFORE that filter runs, and the
 * sole producer of a `retracted` row was `closeWindow` reacting to baseline drift. So the exact
 * command `M168-02` set as its own closing condition swept nothing and exited 0.
 *
 * Retraction rather than deletion, and through this script rather than by hand, for the same reason
 * the matrix is append-only at all: why a verdict stopped counting belongs in the record. A
 * hand-appended row would be `M168-04` over again — a repair applied to an artefact while the
 * mechanism that regenerates it keeps the bad input.
 *
 * `--why` is required. A retraction carrying no cause cannot be told from a mistake, and this is the
 * one operation in the census that discards a measurement somebody paid box time for.
 */
const REMEASURE = flag('--remeasure') ? new Set(flag('--remeasure').split(',')) : null;
if (REMEASURE) {
  const why = flag('--why');
  if (!why) {
    console.error('--remeasure needs --why "<what changed>": a retraction with no stated cause cannot be told from a mistake');
    process.exit(64);
  }
  const reachable = new Set(allCandidates.map((m) => m.id));
  const unknown = [...REMEASURE].filter((id) => !reachable.has(id));
  if (unknown.length > 0) {
    console.error(`--remeasure names ${unknown.length} id(s) that are not reachable candidates: ${unknown.join(', ')}`);
    process.exit(64);
  }
  let retracted = 0;
  for (const id of REMEASURE) {
    if (!settled(id)) {
      console.log(`  --remeasure ${id}: not settled, nothing to retract`);
      continue;
    }
    const row = done.get(id);
    record({
      id, file: row.file ?? null, milestone: row.milestone ?? null, state: 'retracted',
      reason: `remeasure: ${why}`,
      previous: row.state, previousKilled: row.killed ?? [], killed: [],
      at: new Date().toISOString(),
    });
    retracted += 1;
  }
  console.log(`  retracted ${retracted} settled verdict(s) for re-measurement — ${why}\n`);
}

refuseIfJournalOpen();

// ── baseline: the tree must be pristine and the whole roster green ────────────────────────────
// A plant already red for an unrelated reason would otherwise read as killed by every mutation in
// the sweep — 271 false kills, all of them confident. `D842` cares about which mutation killed
// which plant; a dirty baseline makes that question meaningless before it is asked.
console.log('baseline: re-vendoring the unmutated tree ...');
let r = refresh();
if (r.code !== 0) {
  console.error(`✗ baseline re-vendor failed (exit ${r.code}). The sibling tree is not buildable; nothing was mutated.`);
  console.error(r.out.trim().split('\n').slice(-15).join('\n'));
  process.exit(1);
}
const BASE_ID = bundleIdentity();
console.log(`  re-vendor ${r.secs}s — bundle identity ${BASE_ID}`);
console.log('baseline: running the roster ...');
const base = runRoster();
console.log(`  roster ${base.secs}s exit=${base.code} — ${base.seen.size} plant row(s) parsed`);
if (base.missing.length > 0) {
  console.error(`✗ the grader's table did not carry ${base.missing.length} plant(s) this gate claims to grade: ${base.missing.slice(0, 8).join(', ')}${base.missing.length > 8 ? ' ...' : ''}`);
  console.error('  The parse this sweep depends on no longer matches the grader\'s output format.');
  console.error('  Refusing rather than reporting a kill set that is short by an unknown amount.');
  process.exit(1);
}
if (base.red.length > 0) {
  console.error(`✗ baseline is not green: ${base.red.length} plant(s) already failing — ${base.red.join(', ')}`);
  console.error('  Every mutation in the sweep would record these as killed. Fix the baseline first.');
  process.exit(1);
}
// `M164e`. This block runs once per INVOCATION, and a 7-hour sweep is several invocations, so a
// naive `startedAt: new Date()` records the last resume's start and calls it the run's. The
// committed `run-meta.json` said `16:29` for a sweep whose first row is stamped `09:42` — six and a
// half hours of a measurement quietly missing from the artefact that dates it. An earlier
// `startedAt` is therefore carried forward, and `updatedAt` says when this chunk began.
//
// `registryTotal` is here because `candidates` alone cannot answer *how much of the registry has
// never been tried*: 271 of 311 reads as complete without the denominator, which is the shape
// `D767` keeps finding. `read-mutation-matrix.mjs` compares both against the live sibling and
// reports the drift (`D854`).
/**
 * `startedAt` is carried forward from the EARLIEST of two files, not from the state directory
 * alone — because `M164e` repaired the wrong one.
 *
 * That milestone found `startedAt` being rewritten at every invocation, and fixed it twice: the
 * carry-forward below, and a hand-edit of the committed `run-meta.json` putting `09:42` back. The
 * carry-forward reads `OUT_DIR`, which by the siting argument above is outside every rsynced tree
 * and so was **not** the file that got repaired. The box's copy still says `16:29`, so the next
 * resume — `M168`'s, the first one there has ever been — would have written the wrong value
 * straight back over the repair, with the harness fix present and working exactly as designed.
 * A repair applied to an artefact while the mechanism that regenerates it keeps the bad input is
 * `M168-04`.
 *
 * The committed artefact is therefore read as a *floor* rather than as the source: neither file is
 * authoritative and the earliest surviving stamp wins. `M164e`'s own argument is that a census is
 * dated by the measurement of its first row, and nothing recorded later can make that earlier.
 */
const readMeta = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const priorMeta = readMeta(META);
const committedMeta = readMeta(path.join(ROOT, 'tflw-acceptance', 'mutation', 'run-meta.json'));
const earliestStart = [priorMeta?.startedAt, committedMeta?.startedAt].filter(Boolean).sort()[0];
writeFileSync(META, `${JSON.stringify({
  machine: process.env.TFLW_EXEC_MACHINE ?? (process.platform === 'darwin' ? 'mac' : 'box'),
  startedAt: earliestStart ?? new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  registry: path.relative(SIB, registryFile),
  candidates: allCandidates.length,
  registryTotal: mutations.length,
  gradedPlants: GRADED.length,
  baselineBundle: BASE_ID,
  baselineRosterSeconds: base.secs,
  revendorSeconds: r.secs,
}, null, 2)}\n`);

/**
 * `M168-09`. The census's own denominators, recorded as content.
 *
 * Two maps and one aggregate. `plants[id].claim` is a digest of the whole plant record — every
 * field is a claim, and picking a subset is a judgement that can be wrong toward *unchanged*
 * (`D-M168-09-1`). `plants[id].shape` is the clause count the grader just printed, which nothing
 * cheap can recompute later, so it is recorded here and compared only by the next baseline
 * (`D-M168-09-4`). `registry[id]` digests the patch itself — `find`/`replace`/`edits` — because a
 * registry that rewrites one mutation keeps its count while every verdict keyed to that id starts
 * answering a different question.
 *
 * Written at every baseline, including `--baseline-only`, which is what makes this cheap to
 * refresh: ~95 s against the seven hours a census costs.
 */
const plantShape = {};
for (const p of plantsFor('acceptance')) {
  plantShape[p.id] = { claim: claimDigest(p), shape: base.shape.get(p.id) ?? null };
}
const registryShape = Object.fromEntries(mutations.map((m) => [m.id, patchDigest(m)]));
ROSTER_STAMP = aggregate({ plants: plantShape, registry: registryShape });
writeFileSync(SHAPE, `${JSON.stringify({
  at: new Date().toISOString(),
  aggregate: ROSTER_STAMP,
  plants: plantShape,
  registry: registryShape,
}, null, 2)}\n`);
const unshaped = Object.values(plantShape).filter((s) => !s.shape).length;
console.log(`  roster fingerprint ${ROSTER_STAMP} — ${Object.keys(plantShape).length} plant(s), `
  + `${Object.keys(registryShape).length} registry entr(ies)${unshaped > 0 ? `, ${unshaped} with no clause shape in the table` : ''}`);

console.log(`  baseline green: ${GRADED.length} plant(s) produced their known answers\n`);
if (BASELINE_ONLY) process.exit(0);

/**
 * Drift, and why the baseline is a BRACKET rather than a precondition (`D848`).
 *
 * The baseline ran once, before the sweep, and read as a guarantee. It is not one. Every candidate
 * runs the full roster against a live 7-container stack, and that stack accumulates state — so the
 * tree can be pristine and the roster still go red for reasons no mutation caused.
 *
 * Measured 2026-09-01, and it had already corrupted a chunk. Candidates 1-38 were clean; from 39
 * onward **every** candidate reported killing exactly `C23`, `C36`, `C37` and nothing else. Those
 * three plants share one browser scenario whose first step is `expect status equals 201`, and it
 * had begun answering `409` — the accumulated-state signature `M162-01` names. Eight consecutive
 * rows recorded a kill set that belonged to the stack, not to the mutation, and the run exited 0
 * with a matrix that looked richer for it. **A false kill is the dangerous direction here**: it
 * makes a plant look discriminating, which is the exact claim `M164` exists to test.
 *
 * A precondition cannot catch this, because the condition it checks is true when it is checked and
 * false later. So the window is closed at both ends: a green baseline opens it, a green baseline
 * closes it, and only then are the verdicts inside it trusted. If the closing baseline is red with
 * set `R`, every `killed` row in the window whose kills are a subset of `R` is **retracted** — its
 * verdict is indistinguishable from drift, which is not the same as knowing it was wrong.
 *
 * Then the stack is recycled. `cli.mjs stop` is `docker compose down -v`, which drops the postgres
 * volume, so `start` begins from a clean database — the ephemeral-per-run isolation model the stack
 * was designed around, and which a multi-hour sweep silently violates by staying up.
 *
 * The window size is a COST parameter, not a correctness one, which is the point of bracketing: too
 * large only means more work redone when drift is found, never a wrong verdict kept.
 */
function recycleStack() {
  const t = Date.now();
  const opts = { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
  const stop = spawnSync('node', ['cli.mjs', 'stop'], opts);
  const start = spawnSync('node', ['cli.mjs', 'start'], opts);
  return { code: stop.status === 0 && start.status === 0 ? 0 : 1, secs: Number(((Date.now() - t) / 1000).toFixed(1)) };
}

/** Close a window: re-vendor the (already reverted) tree, re-run the roster, retract what drift could explain. */
function closeWindow(ids) {
  if (ids.length === 0) return true;
  console.log(`\n── closing a window of ${ids.length} candidate(s): re-verifying the baseline ...`);
  const rv = refresh();
  if (rv.code !== 0) {
    console.error(`✗ the window's closing re-vendor failed (exit ${rv.code}) — cannot validate ${ids.length} verdict(s).`);
    process.exit(1);
  }
  const nowId = bundleIdentity();
  if (nowId !== BASE_ID) {
    console.error(`✗ the tree is not back at baseline (${nowId} vs ${BASE_ID}) — refusing to validate.`);
    process.exit(1);
  }
  const run = runRoster();
  if (run.missing.length > 0) {
    console.error(`✗ the closing roster did not grade ${run.missing.length} plant(s) — refusing to validate.`);
    process.exit(1);
  }
  if (run.red.length === 0) {
    console.log(`  baseline still green after ${run.secs}s — ${ids.length} verdict(s) stand`);
    return true;
  }
  const R = new Set(run.red);
  console.log(`  ! baseline DRIFTED: ${run.red.length} plant(s) red with nothing mutated — ${run.red.join(', ')}`);
  let retracted = 0;
  for (const id of ids) {
    const row = done.get(id);
    if (!row || row.state !== 'killed') continue;
    if (!row.killed.every((p) => R.has(p))) continue;
    record({
      id, file: row.file ?? null, milestone: row.milestone ?? null, state: 'retracted',
      reason: `every plant it killed (${row.killed.join(', ')}) was also red on an unmutated tree at the close of its window`,
      previous: row.state, previousKilled: row.killed, killed: [], driftRed: run.red,
      at: new Date().toISOString(),
    });
    retracted += 1;
  }
  console.log(`  retracted ${retracted} verdict(s); they will be re-run against a fresh stack`);
  return false;
}

// ── the sweep ─────────────────────────────────────────────────────────────────────────────────
let inFlight = null;
const cleanup = () => { if (inFlight) { revertMutation(inFlight); inFlight = null; } };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });
process.on('uncaughtException', (e) => { cleanup(); console.error(e); process.exit(1); });

const todo = candidates.filter((m) => !settled(m.id)).slice(0, LIMIT);
console.log(`sweeping ${todo.length} candidate(s)\n`);
const startedAt = Date.now();
const windowIds = [];

for (const [i, m] of todo.entries()) {
  const label = `[${i + 1}/${todo.length}] ${m.id}`;
  const anchor = anchorState(m, SIB).state;
  if (anchor !== 'ok') {
    record({ id: m.id, file: m.file, milestone: m.milestone ?? null, state: 'skipped', reason: `anchor ${anchor}`, killed: [], at: new Date().toISOString() });
    console.log(`${label} – skipped (anchor ${anchor})`);
    continue;
  }
  const applied = applyMutation(m);
  if (!applied.ok) {
    record({ id: m.id, file: m.file, milestone: m.milestone ?? null, state: 'skipped', reason: applied.why, killed: [], at: new Date().toISOString() });
    console.log(`${label} – skipped (${applied.why})`);
    continue;
  }
  inFlight = applied.entry;
  if (CONTROL && i === 0) {
    const abs = path.join(SIB, m.file);
    if (CONTROL === 'break') writeFileSync(abs, `${readFileSync(abs, 'utf8')}\nthis is not typescript(((\n`);
    else writeFileSync(abs, applied.entry.files[m.file]);
    console.log(`  [control: ${CONTROL}] applied to ${m.file}`);
  }
  const rv = refresh();
  const id = bundleIdentity();
  let row;
  if (rv.code !== 0) {
    row = { id: m.id, state: 'unbuildable', reason: `re-vendor exit ${rv.code}`, killed: [] };
  } else if (id === BASE_ID) {
    // Exit 0 and the bundle is byte-identical to the unmutated one. The mutation is NOT in the
    // build being graded, so a green roster here would be a false survivor (`D843`).
    row = { id: m.id, state: 'unbuildable', reason: 'built, but the bundle is identical to baseline — the mutation is not in it', killed: [] };
  } else {
    const run = runRoster();
    row = run.missing.length > 0
      ? { id: m.id, state: 'unbuildable', reason: `roster table short by ${run.missing.length} plant(s)`, killed: [] }
      : { id: m.id, state: run.red.length > 0 ? 'killed' : 'survived', killed: run.red, rosterSeconds: run.secs, bundle: id };
    if (row.state === 'killed') {
      mkdirSync(TRANSCRIPTS, { recursive: true });
      writeFileSync(path.join(TRANSCRIPTS, `${m.id}.txt`), run.out);
    }
  }
  const problems = revertMutation(applied.entry);
  inFlight = null;
  if (problems.length > 0) {
    console.error(`✗ ${m.id}: the revert failed — ${problems.join('; ')}`);
    console.error(`  Stopping. ${SIB} holds a mutated tracked source and this sweep will not add to it.`);
    record({ ...row, file: m.file, milestone: m.milestone ?? null, revertFailed: problems, at: new Date().toISOString() });
    process.exit(1);
  }
  record({ ...row, file: m.file, milestone: m.milestone ?? null, equivalent: m.equivalent === true, what: m.what ?? null, at: new Date().toISOString() });
  const glyph = row.state === 'killed' ? '✓' : row.state === 'survived' ? '✗' : '!';
  const detail = row.state === 'killed' ? `killed ${row.killed.length}: ${row.killed.slice(0, 6).join(' ')}${row.killed.length > 6 ? ' ...' : ''}`
    : row.state === 'survived' ? `SURVIVED${m.equivalent ? ' (declared equivalent upstream)' : ''}`
    : row.reason;
  const eta = ((Date.now() - startedAt) / (i + 1)) * (todo.length - i - 1) / 60000;
  console.log(`${label} ${glyph} ${detail}   [${eta.toFixed(0)}m left]`);

  windowIds.push(m.id);
  if (WINDOW > 0 && windowIds.length >= WINDOW && i < todo.length - 1) {
    closeWindow(windowIds);
    windowIds.length = 0;
    console.log('── recycling the stack (down -v + up), so the next window starts on a clean database ...');
    const rc = recycleStack();
    if (rc.code !== 0) {
      console.error(`✗ the stack did not come back (exit ${rc.code}). Stopping rather than sweeping against a dead target.`);
      process.exit(1);
    }
    console.log(`  stack recycled in ${rc.secs}s\n`);
  }
}

// The tail of the sweep gets the same bracket as every other window — otherwise the last few
// verdicts are exactly the ones nothing validates, which is where the drift was found.
if (WINDOW > 0) closeWindow(windowIds);

// ── close ─────────────────────────────────────────────────────────────────────────────────────
//
// The vendored bundle still holds the LAST mutation's build: the sweep reverts sources, not
// artifacts. So this re-vendors once and only then compares. The first draft compared without
// rebuilding and printed `*** TREE NOT RESTORED ***` on a run whose every revert had been verified
// byte-for-byte — a control asserting the wrong subject, measuring an artifact to make a claim
// about sources. It failed in the safe direction, but a control that cries wolf on every clean run
// is a control someone switches off.
//
// Rebuilding is also the useful thing to do: it leaves `node_modules/tflw` matching the unmutated
// checkout, so whatever runs next in this tree is not grading the tail of this sweep.
console.log('\nre-vendoring the restored tree ...');
const closing = refresh();
const finalId = bundleIdentity();
console.log(`bundle identity now ${finalId} (baseline ${BASE_ID}) ${closing.code === 0 && finalId === BASE_ID ? '— tree restored' : '*** TREE NOT RESTORED ***'}`);
const tally = { killed: 0, survived: 0, unbuildable: 0, skipped: 0 };
for (const row of done.values()) tally[row.state] = (tally[row.state] ?? 0) + 1;
const left = candidates.filter((m) => !done.has(m.id)).length;
console.log(`matrix: ${done.size}/${candidates.length} recorded — killed ${tally.killed}, survived ${tally.survived}, unbuildable ${tally.unbuildable}, skipped ${tally.skipped}; ${left} remaining`);
process.exit(closing.code === 0 && finalId === BASE_ID ? 0 : 1);
