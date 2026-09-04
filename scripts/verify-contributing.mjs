#!/usr/bin/env node
// M138b (`M136a-02`) — the gate set of this repo, held to the workflow that decides its merges.
//
// The sibling of `testFlow/scripts/verify-contributing.test.mjs`, and the same mechanism: `ci.yml`
// is authoritative because it is the thing that decides whether a merge is allowed, and
// `CONTRIBUTING.md` is prose checked against it. **Every `run:` command in every workflow is
// classified** as `gate` / `setup` / `ci-only` with a written reason, and a command matching no
// entry FAILS. That is the property that catches a gate arriving unannounced — which is not a
// hypothetical here: `npm run verify:external-targets` arrived in this file's own job two days
// before this milestone, and the plan being written at the time to enumerate the gate set did not
// know about it.
//
// A PLAIN SCRIPT RATHER THAN A TEST, because this repo has no test runner for `scripts/`: its
// `npm test` is `tflw run` — a suite of `.tflw` files against a running Docker stack, which is a
// different thing entirely. So this runs as a step in `acceptance-check`, beside
// `verify-external-targets.mjs`, which is the same shape: static, no Docker, no `.env`, no
// Playwright, seconds.
//
// AND IT RUNS THERE FOR A SECOND REASON. `acceptance-check` is **the only job that checks out both
// repositories** (it packs tflw to refresh the dependency), so it is the one place in either repo
// where a claim about the sibling can actually be verified. That is what the last check below does:
// tflw's `CONTRIBUTING.md` points here for the cross-repo diagnostic-code pair, and this asserts the
// pointer resolves and that the section it points at exists.
//
// **NO SKIP-IF-ABSENT.** If the sibling checkout is missing, this fails. A guard that passes when
// the thing it guards is not there is `M131-03`'s "green about nothing", and it is refused. The
// consequence is deliberate and is the merge order: **tflw merges first**, then this repo, chained
// (`D511`). Between the two merges this repo's `main` is red, which is the same accepted window a
// new `TF0xx` code opens and the reason the two PRs are one unit of work.
//
// WHAT IT DOES NOT CHECK: the prose. A gate's *command string* must appear in `CONTRIBUTING.md`
// exactly; the sentence explaining it is not read, and a gate whose condition lives in YAML rather
// than in its command text is required to carry a footnote marker, not a particular wording.
// Checking sentences for keywords cannot tell a claim from a citation.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOW_DIR = join(repoRoot, '.github', 'workflows');

/**
 * Every `run:` command in every workflow, and what a contributor is supposed to do about it.
 *
 * Keyed by `(workflow, job, cmd)` — class is a property of the **step**, not of the command. The
 * sibling repo has `npm run build` as a gate in one job and setup in another; here the same point is
 * made by `npm ci`, which appears in three jobs and is setup in all of them, and by `npm test`,
 * which is a gate **inside `apiV2/`** and is not the same command as this repo's root `npm test`
 * (that one is `tflw run` and is reached through the regression sweep, never on its own).
 */
const CLASSIFIED = [
  // --- job `apiv2` — one multi-line block, three commands, two classes ---------------------------
  { wf: 'ci.yml', job: 'apiv2', cmd: 'npm ci', class: 'setup', why: 'apiV2 has its own dependency tree; this block runs with `working-directory: apiV2`' },
  {
    wf: 'ci.yml',
    job: 'apiv2',
    cmd: 'npm run lint',
    class: 'gate',
    local: 'npm --prefix apiV2 run lint',
    why: 'eslint over the NestJS target app. The local form names the directory explicitly because this repo\'s root has no `lint` at all. **No `--fix`** as of `M141`/`D538` — an autofixing linter only fails on the unfixable subset, so the job was reporting on a tree it had just rewritten (`M141-01`). This job had a third command, `npm test`, until the same change: it was `jest --passWithNoTests` over a tree with no test files (`M138b-01`), and it was DELETED rather than filled in, because apiV2 is a dogfood target meant to keep changing shape',
  },

  // --- job `acceptance-check` — static, both trees checked out ------------------------------------
  { wf: 'ci.yml', job: 'acceptance-check', cmd: 'npm ci', class: 'setup', why: 'installs the tflw monorepo\'s dev deps so `npm pack` can rebuild what refresh-tflw packs' },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run refresh-tflw',
    class: 'setup',
    why: 'packs ../testFlow/packages/cli and installs the tarball — this repo dogfoods tflw\'s live main, unpinned on purpose. Also this repo\'s own dependency install; there is nothing else in package.json',
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run check:acceptance',
    class: 'gate',
    local: 'npm run check:acceptance',
    why: 'every tflw-acceptance/ corpus still parses. That tree is excluded from bare discovery, so before this existed nothing checked it and two checker tightenings silently un-parsed 10 of 12 files across four milestones',
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run verify:external-targets',
    class: 'gate',
    local: 'npm run verify:external-targets',
    why: 'the one host this repo does not own stays fenced, and a NEW external target fails until somebody writes down what it is for. **This is the gate that arrived while the plan enumerating the gate set was being written**, and not knowing about it is why this table exists',
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run verify:perf-parity',
    class: 'gate',
    local: 'npm run verify:perf-parity',
    why: 'the perf ladder\'s three runners agree on the fixture values, every rung is rostered, and every host a load generator points at is ours — the last of which nothing asserted before, because the gate above walks `tflw.config` roots and k6/Artillery files can never hold one',
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run verify:perf-baseline',
    class: 'gate',
    local: 'npm run verify:perf-baseline',
    why: 'the perf regression baseline still covers every rung that has a co-runner, and declares no band so wide it cannot fail. The comparison itself runs on the box inside the scheduled run — but a rung quietly dropping out of the baseline is a document defect, and from the outside it reads exactly like a rung with no regressions',
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run verify:provenance:self-test',
    class: 'gate',
    local: 'npm run verify:provenance:self-test',
    why: '`M169d1` — the gate above now reads TWO corpora (resolution over every tracked non-prose file, the escaping-link and `**Notation.**` rules over the 14 markdown ones), and this is the assertion that the split is deliberate rather than accidental: it measures that widening rule 2 would redden 394 files, that the corpora are disjoint, and that every exclusion in `D-M164-06-1`\'s list actually excludes something here. A contributor gate rather than ci-only for `verify:redaction:self-test`\'s reason — it is milliseconds, it needs no sibling checkout, and a corpus rule that has stopped discriminating is the one failure a green gate cannot report',
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run verify:construct-coverage',
    class: 'gate',
    local: 'npm run verify:construct-coverage',
    why: 'every construct tflw ships is rostered in `CONSTRUCTS.md` or explicitly on the ratchet, measured against `tflw spec --json` from the build under test (`M154b`, `D723`/`D730`). A contributor gate rather than ci-only because the thing it catches is a construct arriving with nowhere to be graded, and the person who can cheapest write that row is the one who just added it. It **refuses to run** against a vendored tflw that is not current with the sibling checkout (`D741`), so running it locally without `npm run refresh-tflw` first tells you so by name instead of guessing',
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run verify:redaction:self-test',
    class: 'gate',
    local: 'npm run verify:redaction:self-test',
    why: '`scripts/verify-redaction.mjs`\'s own guards, driven against synthetic fixtures (`M154g`, carrying `M154f-03`). The gate itself needs apiV2, a real `--env safetyRedaction` run and a direct ground-truth fetch, and runs as the `safety-redaction-check` regression phase — its guards need none of that. A contributor gate rather than ci-only because it is milliseconds and it is the thing that tells you a guard stopped discriminating, which is the one failure a green gate cannot report',
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run read:mutation-matrix:gate',
    class: 'gate',
    local: 'npm run read:mutation-matrix:gate',
    why: "the hand-authored half of `M164b`'s kill matrix — `scripts/lib/mutation-covers.mjs`, one line of reasoning per relation (`D842`) — is held to the measured half in `tflw-acceptance/mutation/kill-detail.json`, in both directions. A contributor gate rather than ci-only because it reads four committed files (`census-shape.json` since `M168-09`), runs no stack and takes milliseconds, and because a hand-maintained table nothing reads is `D767` by definition. It deliberately asserts **nothing** about how much of the roster is covered: `D851` measured that at one plant of 102 and refused to pin it",
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run verify:argv-contract',
    class: 'gate',
    local: 'npm run verify:argv-contract',
    why: "`M164-04` — `discover-mutation-kills.mjs` validated its flags with a set of spellings and read them with index arithmetic over raw `argv`, two independently written things that nothing made agree, so four of nine flags were wrong in four different ways and none of them made a sound: an eighteen-word `--why` recorded one word, `--limit=5` was read by nothing, a forgotten `--limit` value swept zero candidates and exited 0, and a forgotten `--window` value disabled the baseline bracket. One table now; both the validator and the readers are projections of it. A contributor gate rather than ci-only because it is milliseconds and static, and because its own case set is the fragile part — each case declares whether it discriminates against the previous implementation, which the gate reimplements and compares against, so a case that quietly stops proving anything is refused rather than reported green",
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run verify:sweep-size',
    class: 'gate',
    local: 'npm run verify:sweep-size',
    why: "`M167` (`D767`, `D857`) — no tracked file states how many phases the regression sweep has. `D504` keeps the phase list out of prose because a copy has no guard; a count is that copy compressed and drifted three times regardless. `M154g` deleted seven occurrences across four files and this file's guard was pointed at one of them; `M166-02` found the count still in six files, in three disagreeing numbers, one of them a file that repair's close-claim names as finished. A contributor gate rather than ci-only because it is milliseconds and because the person who will next write the number is the one editing the prose. Quoting a stale count is allowed — `CONTRIBUTING.md` shows the sentence that carried the defect — and asserting one is not",
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run verify:contributing',
    class: 'gate',
    local: 'npm run verify:contributing',
    why: 'this file. It is in the set it guards — adding it meant classifying it and naming it in CONTRIBUTING.md, which is the mechanism working on its first day rather than an oversight',
  },
  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run verify:tflw-resolution',
    class: 'gate',
    local: 'npm run verify:tflw-resolution',
    why: 'M141 (`M115-03`, `M128-04`) — every script that grades a tflw declares WHICH tflw and prints the entry it resolved, and nothing resolves one outside `scripts/lib/tflw-bin.mjs`. In `acceptance-check` rather than `apiv2` for a load-bearing reason and not just cheapness: half of it asserts that `released` and `branch` resolve to two different programs, which is only checkable where both trees exist, and this is the only job that checks out both',
  },

  {
    wf: 'ci.yml',
    job: 'acceptance-check',
    cmd: 'npm run verify:provenance',
    class: 'gate',
    local: 'npm run verify:provenance',
    why: 'M152e (`D673`/`D709`/`D711`) — no tracked prose file links out of the repository, every file citing tflw\'s notation declares WHICH sequence it means (both repos number milestones from 1, and 35 identifiers are defined in both record sets), and every unqualified citation resolves in tflw\'s published `DECISIONS.md`. Also checks tflw\'s tracked pin of this repository\'s citations in both directions — like the two gates above it needs both trees, and this is the only job that has them',
  },

  // --- job `regression` — the sweep, 4 matrix legs ------------------------------------------------
  { wf: 'ci.yml', job: 'regression', cmd: 'npm ci', class: 'setup', why: 'the tflw monorepo again — each matrix leg is a fresh runner' },
  {
    wf: 'ci.yml',
    job: 'regression',
    cmd: 'cp .env.example .env',
    class: 'setup',
    why: 'dev-safe defaults matching docker-compose.yml\'s own fallbacks; no GitHub Secret is involved. Locally this is the same line README\'s Setup section documents',
  },
  { wf: 'ci.yml', job: 'regression', cmd: 'npm run refresh-tflw', class: 'setup', why: 'as above, plus this repo\'s dependency install' },
  {
    wf: 'ci.yml',
    job: 'regression',
    cmd: 'npx playwright install chromium',
    class: 'setup',
    why: 'playwright has no postinstall download hook and the webV2 phases drive a real browser. Chromium only — this suite never runs firefox or webkit. NO `--with-deps` since `M143c`, where two legs of one run sat in this step for three hours; `CONTRIBUTING.md` keeps the flag for local setup on purpose and says why',
  },
  {
    wf: 'ci.yml',
    job: 'regression',
    cmd: 'xvfb-run -a npm run regression -- --group ${{ matrix.group }}',
    class: 'gate',
    local: 'xvfb-run -a npm run regression',
    alsoInDoc: [
      'xvfb-run -a npm run regression -- --group core',
      'xvfb-run -a npm run regression -- --group tooling',
      'xvfb-run -a npm run regression -- --group safety',
      'xvfb-run -a npm run regression -- --group security-ui',
    ],
    why:
      'the sweep, dealt into four duration-packed groups. **CONTRIBUTING names the four group commands and never the phases — nor, since `M154g`/`D767`, how many there are** (`D504`): the phase list changes every milestone, PHASE_GROUPS is already held to PHASES by a partition guard that exits 1 on an ungrouped phase, and a copy of the phase list in prose would be a copy with no guard. The count was such a copy and had drifted 30 vs 38 (`M154g-14`). `xvfb-run -a` is mandatory (`M131-04`) — the watch-check phase spawns a real headed browser',
  },
];

/**
 * Gates that are real and deliberately absent from CI. One-way checked: the string must appear in
 * `CONTRIBUTING.md`, since there is no step to compare it against.
 */
const ABSENT_FROM_CI = [
  {
    local: 'npm run verify:own-identifiers',
    why: '`M169d2` (`D-M164-06-7`) — `scripts/own-identifiers.json` is tracked so a CI checkout can read it, but only a machine with this repository\'s `.gitignore`d `PLAN_*.md`/`PROGRESS.md` can check it is CURRENT, so this is a developer discipline for `D859`\'s exact reason rather than a step. It is the one thing standing between a bare `M22` in `docker-compose.yml` and tflw\'s coverage audit: 63 identifiers are defined in both repositories and already published by tflw, so an omission here is not a red — it is a green answer from the wrong sequence. `verify:provenance` fails if the manifest is missing or malformed, which is the half CI can hold',
  },
  {
    local: 'npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs',
    why: 'the cross-repo pair. It belongs to both repos and to neither\'s ci.yml — it answers in seconds, BEFORE either PR exists, which is the whole point. M132 found that nobody knew it existed, after it would have caught the same failure three times',
  },
];

// --- reading the workflows ------------------------------------------------------------------------

/** Every `run:` command, as `{job, cmd}`. Multi-line `run: |` blocks are split per line: the apiv2
 *  block is `npm ci` (setup) followed by two gates, so classifying the block as a unit would be
 *  either blind or noisy. `${{ ... }}` is left as written — expanding YAML would mean reimplementing
 *  the matrix, and the `local` field is what that expansion would have been for. */
function runSteps(text) {
  const lines = text.split('\n');
  const out = [];
  let job = null;
  let inJobs = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    const jobMatch = inJobs && /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobMatch) { job = jobMatch[1]; continue; }

    const runMatch = /^(\s*)(?:- )?run:(.*)$/.exec(line);
    if (!runMatch) continue;
    const col = line.indexOf('run:');
    const value = runMatch[2].trim();

    if (value !== '|' && value !== '|-' && value !== '>' && value !== '>-') {
      out.push({ job, cmd: value });
      continue;
    }
    for (let j = i + 1; j < lines.length; j += 1) {
      const body = lines[j];
      if (body.trim() === '') continue;
      const indent = body.length - body.trimStart().length;
      if (indent <= col) break;
      if (body.trim().startsWith('#')) continue;
      out.push({ job, cmd: body.trim() });
    }
  }
  return out;
}

/** Every job and whether it declares its own `timeout-minutes`, as `{job, bounded}`. Indent 4
 *  EXACTLY: a step may carry a `timeout-minutes` of its own at indent 8, and a step-level bound is
 *  not a job-level one — `M143c` was caused by a job with no bound at all, and a check that counted
 *  a step's bound as the job's would have passed over it. */
function jobBounds(text) {
  const lines = text.split('\n');
  const out = [];
  let inJobs = false;
  let current = null;

  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    const jobMatch = inJobs && /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobMatch) {
      current = { job: jobMatch[1], bounded: false };
      out.push(current);
      continue;
    }
    if (current && /^ {4}timeout-minutes:/.test(line)) current.bounded = true;
  }
  return out;
}

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`✗ ${msg}`);
};

const workflowFiles = (await readdir(WORKFLOW_DIR)).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
const steps = [];
const jobs = [];
for (const wf of workflowFiles) {
  const text = await readFile(join(WORKFLOW_DIR, wf), 'utf8');
  for (const s of runSteps(text)) steps.push({ wf, ...s });
  for (const j of jobBounds(text)) jobs.push({ wf, ...j });
}

const key = (s) => `${s.wf} · ${s.job} · ${s.cmd}`;
const contributing = await readFile(join(repoRoot, 'CONTRIBUTING.md'), 'utf8');

/** The delimited region of CONTRIBUTING.md that presents commands as gates. Delimiters rather than a
 *  heading so the section can be retitled without silently disarming the guard. */
const gateStart = contributing.indexOf('<!-- gates:begin -->');
const gateEnd = contributing.indexOf('<!-- gates:end -->');
if (gateStart === -1 || gateEnd <= gateStart) {
  console.log('✗ CONTRIBUTING.md has lost its `<!-- gates:begin -->` / `<!-- gates:end -->` markers — the guard reads that region, so removing them disarms it');
  process.exit(1);
}
const region = contributing.slice(gateStart, gateEnd);

/** Command lines inside fenced blocks in that region, split from any trailing ` #` comment — the
 *  comment is where a footnote marker lives, the command is what is matched exactly. */
const claimed = [];
{
  let fenced = false;
  for (const raw of region.split('\n')) {
    if (/^\s*```/.test(raw)) { fenced = !fenced; continue; }
    if (!fenced) continue;
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const hash = line.indexOf(' #');
    claimed.push({ cmd: (hash === -1 ? line : line.slice(0, hash)).trim(), comment: hash === -1 ? '' : line.slice(hash + 1) });
  }
}

// --- 1. every run: command is classified ----------------------------------------------------------

const known = new Set(CLASSIFIED.map(key));
const unclassified = steps.filter((s) => !known.has(key(s)));
for (const s of unclassified) {
  fail(
    `unclassified CI step \`${key(s)}\`.\n` +
      `    A step must not arrive without somebody deciding, IN WRITING, whether a contributor has to run it\n` +
      `    before pushing — that decision going unmade is M136a-02 itself. Add an entry to CLASSIFIED in\n` +
      `    scripts/verify-contributing.mjs: gate (and name its local form in CONTRIBUTING.md), setup, or ci-only.`,
  );
}
if (unclassified.length === 0) console.log(`✓ ${steps.length} run: command(s) across ${workflowFiles.length} workflow(s), every one classified`);

// --- 2. no fossils: every entry still matches a live step ------------------------------------------

const live = new Set(steps.map(key));
for (const c of CLASSIFIED) {
  if (!live.has(key(c))) {
    fail(
      `classification entry \`${key(c)}\` matches no CI step any more.\n` +
        `    A deleted or edited step leaves a fossil that reads as coverage. This is the direction that makes\n` +
        `    the table a PAIR with the workflow rather than a list beside it. Delete it, or fix the command text.`,
    );
  }
}

// --- 3. every gate's local form appears in CONTRIBUTING.md, exactly --------------------------------

const gates = CLASSIFIED.filter((c) => c.class === 'gate');
for (const g of gates) {
  if (!g.local) {
    fail(`\`${key(g)}\` is classed \`gate\` but names no local form — a gate a contributor cannot type is not a gate`);
    continue;
  }
  for (const needed of [g.local, ...(g.alsoInDoc ?? [])]) {
    if (!region.includes(needed)) {
      fail(`CONTRIBUTING.md's gate list does not contain \`${needed}\` (from ${key(g)}). Exact string, not a keyword — wrong flags are a mismatch, which is the whole objection this check answers.`);
    }
  }
}
for (const a of ABSENT_FROM_CI) {
  if (!region.includes(a.local)) {
    fail(`CONTRIBUTING.md's gate list does not contain \`${a.local}\`, a real gate with no CI step to compare against — this assertion is the only thing holding it`);
  }
}
if (failures === 0) console.log(`✓ ${gates.length} gate(s) + ${ABSENT_FROM_CI.length} absent-from-CI gate(s), each named verbatim in CONTRIBUTING.md`);

// --- 4. and the reverse: prose cannot invent a gate ------------------------------------------------

const allowed = new Set([...gates.flatMap((g) => [g.local, ...(g.alsoInDoc ?? [])]), ...ABSENT_FROM_CI.map((a) => a.local)]);
for (const c of claimed) {
  if (!allowed.has(c.cmd)) {
    fail(
      `CONTRIBUTING.md presents \`${c.cmd}\` as a gate, and this file does not classify it.\n` +
        `    Prose cannot invent a gate any more than it can omit one. Classify it, or move it out of the gates\n` +
        `    region — setup and environment notes belong outside it.`,
    );
  }
}

// --- 5. README points here rather than carrying its own copy ---------------------------------------

const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
if (!readme.includes('CONTRIBUTING.md')) {
  fail('README.md no longer points at CONTRIBUTING.md. The gate list has one home and every other place points at it — that is the entire fix M136a-02 asked for.');
}
if (readme.includes('node scripts/verify-check-diagnostics.mjs')) {
  fail(
    'README.md carries the cross-repo pair command again. It was MOVED into CONTRIBUTING.md, not copied\n' +
      '    (D509): two homes for one command become one correct home and one stale one, which is the drift this\n' +
      '    milestone exists to end.',
  );
}

// --- 6. the sibling's pointer resolves — the check only this job can make ---------------------------

const siblingPath = join(repoRoot, '..', 'testFlow', 'CONTRIBUTING.md');
let sibling = null;
try {
  sibling = await readFile(siblingPath, 'utf8');
} catch {
  fail(
    `../testFlow/CONTRIBUTING.md is not readable from here.\n` +
      `    NO SKIP-IF-ABSENT, deliberately: a guard that passes when the thing it guards is missing is green about\n` +
      `    nothing (M131-03). If this is failing on a PR, tflw's half has not merged yet — the two merge chained,\n` +
      `    tflw FIRST (D511). If it is failing locally, clone tflw as a sibling directory.`,
  );
}
if (sibling !== null) {
  if (!sibling.includes('testFlow-tests/CONTRIBUTING.md')) {
    fail('tflw\'s CONTRIBUTING.md no longer points here for the cross-repo pair, so that command now has no reachable home from the repo where a contributor starts');
  } else if (!contributing.includes('verify-check-diagnostics.mjs')) {
    fail('tflw\'s CONTRIBUTING.md points here for the cross-repo pair and this file does not document it — the pointer resolves to nothing');
  } else {
    console.log('✓ tflw\'s CONTRIBUTING.md points here for the cross-repo pair, and the section it points at exists');
  }
}

// --- 7. every job is bounded in time --------------------------------------------------------------

// `M143c`. Not a claim about CONTRIBUTING.md, and the only check here that is not — it lives in this
// file because this file already parses every workflow and runs in the one job that is static,
// Docker-free and seconds long. A separate script would have meant a new gate to classify and name
// in the prose, growing the gate set M138b exists to hold still, for one regex.
//
// WHAT IT IS FOR. `timeout-minutes` is not a budget and a job crossing it is not slow — it is the
// bound that turns a hung job into a red one. Every job in this file went unbounded until `M143c`,
// so run 32270050039's stalled Playwright install was heading for GitHub's 6-hour default while
// tflw's identical stall — on a matrix that IS bounded — surfaced as twelve cancelled shards in
// thirty minutes and got diagnosed the same day. Size it off measured duration, generously; the
// number is chosen so that only a hang can reach it.
for (const j of jobs) {
  if (j.bounded) continue;
  fail(
    `job \`${j.wf}:${j.job}\` declares no \`timeout-minutes\`.\n` +
      `    An unbounded job does not fail when it hangs, it occupies a runner until GitHub's 6-hour default and\n` +
      `    reports nothing in the meantime. Add one at indent 4, sized off the job's measured maximum.`,
  );
}
if (jobs.every((j) => j.bounded)) console.log(`✓ ${jobs.length} job(s) across ${workflowFiles.length} workflow(s), every one time-bounded`);

if (failures > 0) {
  console.log(`\n✗ contributing gate set: ${failures} problem(s)`);
  process.exit(1);
}
console.log('\n✓ contributing gate set: the workflows and CONTRIBUTING.md agree, in both directions');
