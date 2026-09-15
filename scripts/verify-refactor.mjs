#!/usr/bin/env node
// `M195` S3 (tflw `PLAN_M195_REGRESSION_GAP.md`, `D1016`): `tflw refactor apply` scripted against a
// COPY. `regression.mjs` had said for its whole life that `refactor apply` is *"deliberately
// one-off/mutating/human-reviewed, not scripted here"* — true of applying it to the tracked corpus,
// and the reason it stays a human's call *whether* to extract. What that left unasked is whether it
// can be applied at all: the reuse pass proposes twenty extractions over this suite and no
// automated run had ever taken one. So: the suite copied to a temporary directory, `check` there
// for the ids it offers, the first one applied, `check` clean afterwards, the action file written
// where the hint said, the call sites rewritten, and the files it changed run green against the
// stack — the extraction executes, not only parses. The tracked tree is not touched.
//
// The copy is `tests/`, `shared/`, `tflw.config`, `.env`, `package.json` and `nginx/certs/`: what
// `tflw run` resolves from the root. `.env` because the affected tests log in with
// `env(ADMIN_EMAIL)`; the certs because the config's mTLS env names them and `refactor apply`
// refuses a tree whose `check` warns (`TF043`), the same way it refuses one whose `check` errors.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

const dir = mkdtempSync(path.join(tmpdir(), 'tflw-verify-refactor-'));
try {
  for (const m of COPIED) if (existsSync(path.join(ROOT, m))) cpSync(path.join(ROOT, m), path.join(dir, m), { recursive: true });
  const before = tflw(dir, 'check', '--no-color');
  const hints = hintsOf(before.out);
  ok(`\`tflw check\` over the copy is clean and offers reuse hints — ${hints.length}`, before.status === 0 && /no problems found/.test(before.out) && hints.length > 0, before.out.slice(0, 300));
  if (hints.length === 0) throw new Error('no hint to apply');

  // The first hint the checker accepts. `refactor apply` builds every byte in memory and re-checks
  // before it writes (`B5-02`), so a refused apply leaves the copy as it was and the ids stand; the
  // refusals are printed one line each, because a hint the pass offers and the checker refuses is
  // a fact about the pass worth seeing every sweep (`M195-01`: the first sweep found `RF001` refused
  // with `TF039` — an action of three `expect`s has no `api` before its `expect status`).
  let hint = null;
  let apply = null;
  const refused = [];
  for (const h of hints) {
    const r = tflw(dir, 'refactor', 'apply', h.id);
    if (r.status === 0) {
      hint = h;
      apply = r;
      break;
    }
    const firstLine = r.out.split('\n').find((l) => /^(error|warning)\[/.test(l)) ?? r.out.split('\n')[0];
    refused.push({ id: h.id, exit: r.status, why: firstLine });
  }
  for (const r of refused) console.log(`  refused ${r.id} (exit ${r.exit}): ${r.why}`.slice(0, 200));
  console.log(`  hints: ${hints.length} offered, ${refused.length} refused before one applied`);
  ok(`at least one offered hint can be applied — ${hint?.id ?? 'none'} after ${refused.length} refusal(s)`, hint !== null, refused.map((r) => `${r.id}: ${r.why}`).join(' | ').slice(0, 300));
  if (!hint) throw new Error('no applicable hint');
  console.log(`  applied ${hint.id}: action ${hint.actionName} into ${hint.actionFile}; touches ${hint.files.join(', ')}`);
  const originals = new Map(hint.files.map((f) => [f, readFileSync(path.join(ROOT, f), 'utf8')]));
  ok(`\`tflw refactor apply ${hint.id}\` exits 0 and reports the extraction`, apply.status === 0 && new RegExp(`applied ${hint.id}: extracted`).test(apply.out), `exit ${apply.status}: ${apply.out.slice(0, 300)}`);
  ok(`the action file it proposed exists in the copy: ${hint.actionFile}`, existsSync(path.join(dir, hint.actionFile)));
  const updated = /updated: (.+)$/m.exec(apply.out)?.[1]?.split(', ') ?? [];
  ok('the files it says it updated are the files the hint named, and each changed', JSON.stringify([...updated].sort()) === JSON.stringify([...hint.files].sort()) && hint.files.every((f) => readFileSync(path.join(dir, f), 'utf8') !== originals.get(f)), updated.join(', '));
  ok('each updated file now imports the action file and calls the action', hint.files.every((f) => {
    const s = readFileSync(path.join(dir, f), 'utf8');
    return /^import "/m.test(s) && s.includes(`${hint.actionName}(`);
  }));

  const after = tflw(dir, 'check', '--no-color');
  ok('`tflw check` after the apply is still clean', after.status === 0 && /no problems found/.test(after.out), after.out.slice(0, 300));
  const hintsBefore = (before.out.match(/^reuse\[RF/gm) ?? []).length;
  const hintsAfter = (after.out.match(/^reuse\[RF/gm) ?? []).length;
  ok(`the applied hint is no longer offered — ${hintsBefore} hint(s) before, ${hintsAfter} after`, hintsAfter < hintsBefore);

  const run = tflw(dir, 'run', '--no-color', ...hint.files);
  const summary = /(PASS|FAIL) (\d+)\/(\d+) passed/.exec(run.out);
  ok(`the changed files run green against the stack through the extracted action — ${summary?.[0] ?? 'no summary'}`, run.status === 0 && summary?.[1] === 'PASS', `exit ${run.status}: ${run.out.slice(-600)}`);

  ok('the tracked tree is untouched — no action file appeared under the real root', !existsSync(path.join(ROOT, hint.actionFile)) && hint.files.every((f) => readFileSync(path.join(ROOT, f), 'utf8') === originals.get(f)));
} catch (error) {
  ok('the phase ran to its end', false, String(error?.stack ?? error).slice(0, 600));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (violations > 0) {
  console.error(`\n${violations} tflw refactor violation(s).`);
  process.exit(1);
}
console.log('\ntflw refactor apply extracts a reuse hint that still checks and still runs.');
