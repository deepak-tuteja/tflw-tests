#!/usr/bin/env node
// `M195` S3 (tflw `PLAN_M195_REGRESSION_GAP.md`, `D1016`): `tflw refactor apply` scripted against a
// COPY. `regression.mjs` had said for its whole life that `refactor apply` is *"deliberately
// one-off/mutating/human-reviewed, not scripted here"* — true of applying it to the tracked corpus,
// and the reason it stays a human's call *whether* to extract. What that left unasked is whether it
// can be applied at all: the reuse pass proposes twenty extractions over this suite and no
// automated run had ever taken one. So: the suite copied to a temporary directory, `check` there
// for the ids it offers, the first one applied, `check` clean afterwards, the action file written
// where the hint said, the call sites rewritten, and the files it changed run green against the
// stack — the extraction executes, not only parses. The tracked tree is not touched. Since
// `M196` (tflw D1020) it is every hint to a fixpoint, not the first one the checker accepts, and a
// refusal is a violation: the pass offers only windows that are frames now (`M195-01`).
//
// The copy is `tests/`, `shared/`, `tflw.config`, `.env`, `package.json` and `nginx/certs/`: what
// `tflw run` resolves from the root. `.env` because the affected tests log in with
// `env(ADMIN_EMAIL)`; the certs because the config's mTLS env names them and `refactor apply`
// refuses a tree whose `check` warns (`TF043`), the same way it refuses one whose `check` errors.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTflw } from './lib/tflw-bin.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_ENTRY = resolveTflw('released', { label: 'verify-refactor' }).entry;
const COPIED = ['tests', 'shared', 'tflw.config', '.env', 'package.json', 'nginx/certs'];

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

function tflw(cwd, ...args) {
  const r = spawnSync(process.execPath, [CLI_ENTRY, ...args], { cwd, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Every hint `check` prints, in order: id, the files it touches, the action it proposes. */
function hintsOf(checkOut) {
  const hints = [];
  const re = /reuse\[(RF\d+)\]:[^]*?= apply:/g;
  for (const m of checkOut.matchAll(re)) {
    const block = m[0];
    const files = [...new Set([...block.matchAll(/^\s*--> (\S+):\d+/gm)].map((x) => x[1]))];
    const actionFile = /= proposed: action .+ in (\S+)/.exec(block)?.[1];
    const actionName = /= proposed: action (.+?)\(/.exec(block)?.[1];
    if (files.length && actionFile && actionName) hints.push({ id: m[1], files, actionFile, actionName });
  }
  return hints;
}

/** Every `.tflw` under the real root's `tests/` and `shared/`, by content — the untouched-tree
 *  assertion's before-state, taken before any apply. */
function snapshotTree() {
  const out = new Map();
  const walk = (d) => {
    for (const e of readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = path.posix.join(d, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.tflw')) out.set(rel, readFileSync(path.join(ROOT, rel), 'utf8'));
    }
  };
  for (const d of ['tests', 'shared']) if (existsSync(path.join(ROOT, d))) walk(d);
  return out;
}

const dir = mkdtempSync(path.join(tmpdir(), 'tflw-verify-refactor-'));
const beforeTree = snapshotTree();
try {
  for (const m of COPIED) if (existsSync(path.join(ROOT, m))) cpSync(path.join(ROOT, m), path.join(dir, m), { recursive: true });
  const before = tflw(dir, 'check', '--no-color');
  const hints = hintsOf(before.out);
  ok(`\`tflw check\` over the copy is clean and offers reuse hints — ${hints.length}`, before.status === 0 && /no problems found/.test(before.out) && hints.length > 0, before.out.slice(0, 300));
  if (hints.length === 0) throw new Error('no hint to apply');

  // `M196` (tflw D1020): every hint, to a fixpoint. Until `M196` this applied the first hint the
  // checker accepted and printed the refusals as facts about the pass (`M195-01`: twelve of twenty
  // refused with `TF039`, every one a window that read a response before any `api` inside it —
  // an action `call` could never satisfy). Now the pass offers only windows that are frames, so a
  // refusal is a defect and counts as one; and one apply was standing in for "the hints can be
  // taken", so the phase takes all of them: apply the first, re-`check`, repeat until `check`
  // offers none. Each apply reshapes the next round's hints (the ids renumber, a longer window
  // vanishes and a shorter one it shadowed appears), so the phase prints the trajectory rather
  // than asserting a count. Bounded twice: a round whose accepted apply does not lower the hint
  // count fails, and so does a fortieth round.
  const applied = [];
  const refused = [];
  const touched = new Set();
  let remaining = hints;
  let round = 0;
  while (remaining.length > 0) {
    round++;
    if (round > 40) throw new Error(`no fixpoint after 40 rounds — ${remaining.length} hint(s) still offered`);
    const h = remaining[0];
    const r = tflw(dir, 'refactor', 'apply', h.id);
    if (r.status !== 0) {
      const firstLine = r.out.split('\n').find((l) => /^(error|warning)\[/.test(l)) ?? r.out.split('\n')[0];
      refused.push({ id: h.id, round, why: firstLine });
      console.log(`  round ${round}: ${h.id} REFUSED (exit ${r.status}): ${firstLine}`.slice(0, 200));
      // A refused hint stays offered under the same id, so skip past it this round rather than
      // spin on it; the violation is counted below.
      remaining = remaining.slice(1);
      continue;
    }
    const updated = /updated: (.+)$/m.exec(r.out)?.[1]?.split(', ') ?? [];
    const namedFiles = [...h.files].sort();
    ok(`round ${round}: \`refactor apply ${h.id}\` extracted ${h.actionName} into ${h.actionFile} and updated exactly the files the hint named`,
      new RegExp(`applied ${h.id}: extracted`).test(r.out) && JSON.stringify([...updated].sort()) === JSON.stringify(namedFiles) && existsSync(path.join(dir, h.actionFile)),
      r.out.slice(0, 300));
    for (const f of h.files) {
      touched.add(f);
      const text = readFileSync(path.join(dir, f), 'utf8');
      if (!(/^import "/m.test(text) && text.includes(`${h.actionName}(`))) ok(`${f} imports the action file and calls ${h.actionName}`, false);
    }
    applied.push({ id: h.id, round, actionName: h.actionName, actionFile: h.actionFile, files: h.files.length });
    const again = tflw(dir, 'check', '--no-color');
    const next = hintsOf(again.out);
    console.log(`  round ${round}: ${h.id} → action ${h.actionName} (${h.files.length} file(s)); ${next.length} hint(s) remain`);
    if (again.status !== 0 || !/no problems found/.test(again.out)) {
      ok(`round ${round}: \`tflw check\` is still clean after ${h.id}`, false, again.out.slice(0, 300));
      break;
    }
    if (next.length >= remaining.length) {
      ok(`round ${round}: applying ${h.id} lowered the hint count (${remaining.length} → ${next.length})`, false);
      break;
    }
    remaining = next;
  }
  console.log(`  fixpoint: ${applied.length} applied in ${round} round(s), ${refused.length} refused, ${touched.size} file(s) touched`);
  ok(`every hint the pass offers is one the checker accepts — ${refused.length} refused (M195-01, fixed M196)`, refused.length === 0,
    refused.map((x) => `${x.id}: ${x.why}`).join('; '));
  ok(`the fixpoint is reached — \`tflw check\` offers no reuse hint after ${applied.length} apply(s)`, remaining.length === 0 && applied.length > 0);

  const after = tflw(dir, 'check', '--no-color');
  ok('`tflw check` over the copy is clean at the fixpoint', after.status === 0 && /no problems found/.test(after.out), after.out.slice(0, 300));

  const files = [...touched].sort();
  const run = tflw(dir, 'run', '--no-color', ...files);
  const summary = /(PASS|FAIL) (\d+)\/(\d+) passed/.exec(run.out);
  ok(`every touched file (${files.length}) runs green against the stack through the extracted actions — ${summary?.[0] ?? 'no summary'}`,
    run.status === 0 && summary?.[1] === 'PASS', run.out.split('\n').filter((l) => /FAIL|✗|error/.test(l)).slice(0, 12).join('\n'));

  // Snapshotted BEFORE the loop (`M196`): the `M195` version of this read the originals from the
  // real root after the apply and compared the root to itself — green with the tracked tree
  // rewritten, which is the assertion's one job.
  const now = snapshotTree();
  const changed = [...beforeTree.keys()].filter((f) => now.get(f) !== beforeTree.get(f));
  const appeared = applied.map((a) => a.actionFile).filter((f) => existsSync(path.join(ROOT, f)));
  ok('the tracked tree is untouched — no file under tests/ or shared/ changed and no action file appeared under the real root',
    changed.length === 0 && appeared.length === 0, [...changed, ...appeared].join(', '));
} catch (error) {
  ok('the phase ran to its end', false, String(error?.stack ?? error).slice(0, 600));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (violations > 0) {
  console.error(`\n${violations} tflw refactor violation(s).`);
  process.exit(1);
}
console.log('\ntflw refactor apply takes every reuse hint the pass offers, to a fixpoint that still checks and still runs.');
