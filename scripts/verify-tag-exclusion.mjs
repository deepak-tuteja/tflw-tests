#!/usr/bin/env node
// `T-1d` (tflw `M242` `D1327`, carried by `PLAN_M247_DOGFOOD_WHOLE_PRODUCT.md`): `--tag ui,!slow`,
// asserted by count. tflw `M247` withdrew `--skip-tag` because `--tag !x` already excludes, so the
// exclusion form is the one a CI job writes to keep its slow tests out — and a filter is only proved
// by what it ran. The expected count is read off the tree (every `@ui` test, less the `@ui @slow`
// ones), and the phase fails if either half is empty: an exclusion that removes nothing, or a tier
// that runs nothing, would pass any count comparison built from them.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTflw } from './lib/tflw-bin.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKIPPED = new Set(['.constructs', '.checkonly', '.scratch', '.tflw-ui', '.env-specific', '.demo-fail', '.gaps', 'shared']);

/** Each discovered `test`'s tags: the `@` lines directly above it. */
function taggedTests(dir, out = []) {
  for (const e of readdirSync(dir).sort()) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) {
      if (!SKIPPED.has(e)) taggedTests(full, out);
    } else if (e.endsWith('.tflw') && !e.startsWith('.')) {
      const lines = readFileSync(full, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/^test\s+"/.test(line)) return;
        const tags = new Set();
        for (let j = i - 1; j >= 0 && /^(@|with each|\s+\||#)/.test(lines[j]); j--) {
          for (const t of lines[j].matchAll(/@([\w-]+)/g)) if (lines[j].startsWith('@')) tags.add(t[1]);
        }
        out.push({ file: path.relative(ROOT, full), name: /^test\s+"((?:[^"\\]|\\.)*)"/.exec(line)[1], tags });
      });
    }
  }
  return out;
}

const tests = taggedTests(path.join(ROOT, 'tests'));
const ui = tests.filter((t) => t.tags.has('ui'));
const slow = ui.filter((t) => t.tags.has('slow'));
const expected = ui.length - slow.length;
console.log(`tree: ${ui.length} @ui test(s), ${slow.length} of them @slow — the tier without them is ${expected}`);
if (slow.length === 0 || expected === 0) {
  console.error('✗ the exclusion has nothing to prove: it needs at least one `@ui @slow` test and one `@ui` test that is not');
  process.exit(1);
}

const { entry } = resolveTflw('released', { label: 'verify-tag-exclusion' });
const r = spawnSync(process.execPath, [entry, 'run', '--no-color', '--skip-workload', '--tag', 'ui,!slow'], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, FORCE_COLOR: '0' },
});
const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
const summary = /(PASS|FAIL) (\d+)\/(\d+) passed[^\n]*/.exec(out);
if (!summary) {
  console.error(`✗ no summary line in the run's output (exit ${r.status}):\n${out.slice(-1500)}`);
  process.exit(1);
}
console.log(`run: ${summary[0]}`);
const ran = Number(summary[3]);
let failed = 0;
if (r.status !== 0) {
  failed++;
  console.error(`✗ \`tflw run --tag ui,!slow\` exited ${r.status}`);
}
if (ran !== expected) {
  failed++;
  console.error(`✗ it ran ${ran} test(s); the tree says ${expected} (${ui.length} @ui less ${slow.length} @slow)`);
}
// The count could agree by coincidence (one slow test run, one other test dropped), so the slow
// tests' own names must not appear as a result line.
for (const t of slow) {
  if (out.split('\n').some((l) => /[✓✗]/.test(l) && l.includes(t.name))) {
    failed++;
    console.error(`✗ \`${t.name}\` (${t.file}) is @slow and the run reported it`);
  }
}
if (failed > 0) process.exit(1);
console.log(`✓ \`--tag ui,!slow\` ran exactly the ${expected} @ui test(s) that are not @slow`);
