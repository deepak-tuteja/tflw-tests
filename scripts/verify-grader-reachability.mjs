#!/usr/bin/env node
/**
 * Every script in `scripts/` that states and asserts a known answer is reachable from something that
 * runs — or says here, by name, that it is not and why.
 *
 * `M163-01`, `D828`. **This is the fourth time the same defect was found by accident and the first
 * time anything looks for it.** `M137e` found `verify-security-acceptance.mjs` running in no
 * automated pass; `D764`/`M154g-13` found `verify-input-acceptance.mjs`; `M154g-02` found
 * `measure-construct-evidence.mjs`'s missing half; and `M163e`'s hand audit found
 * `verify-screenshot-step.mjs` with **zero callers of any kind** — no phase, no `package.json`
 * entry, no CI reference, no mention in any document — asserting four known answers and exiting
 * non-zero since `M50`. Each of the first three surfaced because somebody happened to be working on
 * that file for another reason. `D828` made the audit a pass over `scripts/`; a pass is a date, and
 * this is the standing version of it.
 *
 * **Reachability is read as structure, never as text.** `regression.mjs --list-phases` prints its
 * real `PHASES`/`PHASE_GROUPS` (added by `M178a` for this gate), `package.json` is JSON, and only
 * the CI workflow is scanned as text — deliberately, and only for `run:` lines, because a YAML
 * parser is not in this repository and a step's command is the one thing there that is unambiguous.
 * Grepping `regression.mjs` for paths was tried and refused on a measurement: the array mixes a
 * one-line `{ name, cmd }` form with a multi-line one, so an anchored pattern finds 8 of the 19
 * scripts named in that file and a loose one also matches paths quoted in its comments. `M166`.
 *
 * **`EXEMPT` is a hand list held in both directions (`D895`).** A script that grades nothing is not
 * a defect, but "grades nothing" is a claim about a file and belongs in writing next to the file's
 * name. An unreachable script that is not on this list fails. An entry naming a file that no longer
 * exists, or one that has since become reachable, also fails — a declaration about nothing is
 * `D767`'s shape, and this gate is not allowed to carry one while reporting on others.
 *
 * **It is green the day it lands, and that is stated rather than discovered.** The three unreachable
 * scripts today are exactly the three on `EXEMPT`. `M172e` shipped a gate in the same condition and
 * the rule it set is the one followed here: say so in the guard, say so in the close, and give it a
 * self-test that proves it can go red, so nobody later reads a permanent green as an argument for
 * deleting it. Run `--self-test` for that proof.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPTS = path.join(ROOT, 'scripts');

/**
 * Scripts that reach nothing because they assert nothing. Each entry is a claim about that file.
 *
 * `regression-smoke.mjs` is NOT here: `M163-01` predicted it would be and it is reachable through
 * `package.json`, which is the kind of thing a hand list gets wrong and a both-directions check
 * catches on the first run.
 */
const EXEMPT = {
  'exec.mjs': 'the box runner — it ships work to fedora-box and reports what came back. It states no known answer of its own, and its exit status is famously not one either (its own header says to treat it as carrying no information).',
  'derive-perf-bands.mjs': 'named by `M163-01` as an opt-out. It derives baseline bands from recorded runs and writes them; the assertions live in `verify-perf-baseline.mjs`, which reads what this produces.',
  'measure-construct-evidence.mjs': 'reports corpus *shape* — site counts per construct — and `D826` is the decision that it must never turn that into a verdict. A script forbidden to reach a verdict cannot be unreachable from one.',
};

const problems = [];
const fail = (m) => problems.push(m);

/** Every `.mjs` directly under `scripts/`. `lib/` is imported, never invoked, so it is not a caller. */
function corpus() {
  return readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs')).sort();
}

/** The real phase table, from the runner itself. */
function phaseCommands() {
  const out = execFileSync('node', [path.join(SCRIPTS, 'regression.mjs'), '--list-phases'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24,
  });
  const start = out.indexOf('{');
  if (start === -1) throw new Error('regression.mjs --list-phases printed no JSON');
  const parsed = JSON.parse(out.slice(start));
  if (parsed.v !== 1) throw new Error(`--list-phases speaks v${parsed.v}; this gate reads v1`);
  return parsed.phases.map((p) => [p.cmd ?? '', (p.args ?? []).join(' ')].join(' '));
}

function packageCommands() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return Object.values(pkg.scripts ?? {});
}

/** Only `run:` lines. Everything else in a workflow is prose to this gate. */
function ciCommands() {
  const yml = readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  return yml.split('\n').filter((l) => /^\s*(run:|-\s*run:)/.test(l) || /^\s{6,}\S/.test(l));
}

export function unreachable(files, haystacks) {
  const hay = haystacks.join('\n');
  return files.filter((f) => !hay.includes(`scripts/${f}`));
}

function main() {
  const files = corpus();
  const haystacks = [...phaseCommands(), ...packageCommands(), ...ciCommands()];
  const dark = unreachable(files, haystacks);

  for (const f of dark) {
    if (!(f in EXEMPT)) {
      fail(
        `scripts/${f} is reachable from nothing — no regression phase, no package.json script, no CI ` +
          `run: line.\n    If it grades something, wire it into a phase or a CI step. If it grades ` +
          `nothing, add it to EXEMPT in this file with the reason, which is a claim a reader can check.\n` +
          `    This is M163-01's shape: verify-screenshot-step.mjs asserted four known answers and ` +
          `exited non-zero for 13 milestones with no caller at all.`,
      );
    }
  }
  for (const [f, why] of Object.entries(EXEMPT)) {
    if (!files.includes(f)) {
      fail(`EXEMPT names scripts/${f}, which does not exist — a declaration about nothing (D767). Remove it.\n    Its stated reason was: ${why}`);
    } else if (!dark.includes(f)) {
      fail(
        `EXEMPT says scripts/${f} reaches nothing, and it is now reachable — so the exemption is ` +
          `stale and stops meaning anything.\n    Remove it from EXEMPT: a caller exists, and the ` +
          `next reader should be told by the list rather than by grepping.`,
      );
    }
  }

  if (problems.length > 0) {
    console.error(`\n✗ grader reachability: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  · ${p}\n`);
    return 1;
  }
  console.log(
    `✓ grader reachability: ${files.length} script(s) in scripts/ — ${files.length - dark.length} reachable ` +
      `from a regression phase, a package.json script or a CI run: line; ${dark.length} declared to grade ` +
      `nothing, by name, in EXEMPT (${Object.keys(EXEMPT).join(', ')}).\n` +
      `  Green on the day it landed and stated so (M178a): the unreachable set and the declared set are ` +
      `the same three files. It fires on the fourth, which is the whole point — run --self-test for the proof.`,
  );
  return 0;
}

/** Proof that the two directions actually fire. `M141`: a gate nobody has seen refuse is a gate nobody has tested. */
function selfTest() {
  const cases = [
    ['an unreachable script that is not exempt is caught',
      () => unreachable(['verify-orphan.mjs'], ['node scripts/regression.mjs']).length === 1],
    ['a reachable script is not caught',
      () => unreachable(['verify-x.mjs'], ['node scripts/verify-x.mjs --gate']).length === 0],
    ['reachability is substring-based over the real command, not over a filename alone',
      () => unreachable(['exec.mjs'], ['node scripts/exec.mjs exec -- npm test']).length === 0],
    ['a name that appears only as a bare basename does NOT count as reachable',
      () => unreachable(['verify-x.mjs'], ['node verify-x.mjs']).length === 1],
    ['the phase table is readable and non-empty',
      () => phaseCommands().length > 20],
    ['package.json contributes commands',
      () => packageCommands().length > 20],
    ['every EXEMPT entry names a file that exists',
      () => Object.keys(EXEMPT).every((f) => corpus().includes(f))],
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
