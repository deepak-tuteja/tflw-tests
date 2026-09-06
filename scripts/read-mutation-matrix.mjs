#!/usr/bin/env node
// `M164c` — the reading of the kill matrix. testFlow `PLAN_M164_ROSTER_VACUITY.md` (`D840`-`D842`,
// `D849`-`D851`).
//
// `M164b` measured which plants a mutation kills. This joins that to two things it could not:
// **how** each plant died (`kill-detail.json`, from the grader's own per-plant page), and **whether**
// the mutation is about that plant's construct (`lib/mutation-covers.mjs`, hand-authored per
// `D842`). It then computes the covering set `D841` says is an output rather than a choice.
//
// It reads committed artefacts and runs nothing, so it is cheap enough to be a gate and is wired as
// one: `--gate` refuses if the hand table and the measurement have drifted apart in either
// direction. That is the only claim it makes automatically. It deliberately does **not** assert a
// coverage floor — `M164c` measured the floor at 1 plant of 102, and a gate pinning that number
// would be `D722`'s "a gate whose presence is not evidence" wearing a ratchet.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANTS, plantsFor } from './lib/constructs.mjs';
import { COVERS } from './lib/mutation-covers.mjs';
import { readMutations, siblingRoot } from './lib/mutations.mjs';
import { claimDigest, patchDigest, diffDigests } from './lib/census-shape.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, 'tflw-acceptance', 'mutation');
const GATE = process.argv.includes('--gate');

const matrix = new Map();
for (const line of fs.readFileSync(path.join(DIR, 'kill-matrix.jsonl'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  // Append-only, last row wins, and a `retracted` row erases the verdict above it (`D848`).
  if (row.state === 'retracted') matrix.delete(row.id);
  else matrix.set(row.id, row);
}
const detail = JSON.parse(fs.readFileSync(path.join(DIR, 'kill-detail.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'run-meta.json'), 'utf8'));

const GRADED = plantsFor('acceptance').map((p) => p.id);
const P = new Map(PLANTS.map((p) => [p.id, p]));
const killers = [...matrix.values()].filter((r) => r.state === 'killed').sort((a, b) => b.killed.length - a.killed.length);

let failures = 0;
const fail = (msg) => { failures += 1; console.log(`✗ ${msg}`); };

// ── the census, restated ──────────────────────────────────────────────────────────────────────
const tally = {};
for (const r of matrix.values()) tally[r.state] = (tally[r.state] ?? 0) + 1;
const relations = killers.reduce((n, r) => n + r.killed.length, 0);
console.log(`kill matrix — ${matrix.size} of ${meta.candidates} candidates, ${GRADED.length} graded plants`);
console.log(`  ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join('  ')}   ${relations} kill relation(s)\n`);

// ── how each kill happened, measured ──────────────────────────────────────────────────────────
//
// `M168-05`. THE VOCABULARY IS DERIVED FROM THE ROW, NOT READ OFF IT.
//
// `D849`'s three kinds were drawn from one census in which the split was clean: 195 rows carried
// `recall n/a precision n/a (skipped: no report)` and six carried a real tally with no skip. The
// resume produced rows carrying **both**, because a plant can be graded statically and then have
// its fixture refused at run time — and the schema had no cell for it. Two of them went to
// `refusal` with a `note` that contradicts the kind in its own row (*"skipped: no report — the
// static half asserted (recall 2/2, precision 3/3) and every clause held"*), which is a label
// saying the plant asserted nothing above prose saying what it asserted.
//
// The repair is not a fourth label bolted on. `kind` was carrying two independent facts at once —
// WHAT THE PLANT ASSERTED and WHETHER ITS FIXTURE WAS REFUSED — and packing them into one word is
// why two of them had nowhere to go. They are now two fields, and the kind is a function of three
// booleans the grader's own page already reports:
//
//         asserted?   refused?    kind
//         no          yes         refusal          it asserted nothing; nothing can have covered it
//         no          no          no-assertions    an empty tally the acceptance gate fails on (`M154f-03`)
//         yes         either      assertion        it produced its known answer and the answer was FALSE
//         yes         either      held             it produced its known answer and every clause HELD
//
// `assertion` and `held` are separated by `failed`, not by the skip — which is what keeps `C78`
// and `C79` where `D842` needs them (they asserted, they went false, they are labelled in
// `lib/mutation-covers.mjs`) while `C42` and `C76` stop claiming to have asserted nothing.
//
// And it is DERIVED and then checked against the stored label, because `kill-detail.json` has no
// producer in this tree: it is transcribed from the grader's per-plant page by hand, once per
// census, which is the step that mislabelled these two in the first place. A hand step nothing
// checks is `D767` with a person in the loop. This makes the label falsifiable from the row's own
// fields; it does not make the transcription unnecessary (see `M176-05`).
//
// So the schema is now load-bearing and a transcriber has to honour it: a skip is the `skipped`
// field and a tally is the `tally` field, never prose in `note`. A row written the old way is
// refused rather than mis-derived — the pre-`M176e` `{kind: 'refusal', note: 'skipped: no report'}`
// derives as `no-assertions` and says so, naming both readings. That is deliberate. `M166`'s rule
// is that a gate which fails plausibly is worse than one that refuses, and a silent re-derivation
// of 267 rows from prose would be exactly the plausible failure.
function deriveKind(r) {
  const asserted = typeof r.tally === 'string' && r.tally.length > 0;
  if (!asserted) return typeof r.skipped === 'string' ? 'refusal' : 'no-assertions';
  return (r.failed ?? []).length > 0 ? 'assertion' : 'held';
}

const kinds = {};
const assertions = [];
for (const [mid, plants] of Object.entries(detail)) {
  for (const [pid, d] of Object.entries(plants)) {
    const derived = deriveKind(d);
    if (derived !== d.kind)
      fail(`${mid} × ${pid} is stored as \`${d.kind}\` in \`kill-detail.json\` and its own fields say \`${derived}\``
        + ` (tally ${d.tally ? `\`${d.tally}\`` : 'absent'}, ${(d.failed ?? []).length} failed clause(s),`
        + ` ${typeof d.skipped === 'string' ? `skipped: ${d.skipped}` : 'not skipped'}). \`M168-05\`.`);
    kinds[derived] = (kinds[derived] ?? 0) + 1;
    if (derived === 'assertion') assertions.push({ mid, pid, d });
  }
}
const skips = Object.values(detail).flatMap((p) => Object.values(p)).filter((d) => typeof d.skipped === 'string');
console.log('how the plants died (from the acceptance grader\'s own per-plant page):');
console.log(`  refusal        ${String(kinds.refusal ?? 0).padStart(3)}  the fixture was refused at check time — no report, so the plant asserted nothing`);
console.log(`  no-assertions  ${String(kinds['no-assertions'] ?? 0).padStart(3)}  an empty tally the acceptance gate itself fails on (\`M154f-03\`)`);
console.log(`  assertion      ${String(kinds.assertion ?? 0).padStart(3)}  the plant ran, produced its known answer, and the answer was false`);
console.log(`  held           ${String(kinds.held ?? 0).padStart(3)}  the plant produced its known answer, every clause held, and it is red only because the rest of its fixture was refused (\`M168-05\`)`);
console.log(`  ${String(skips.length).padStart(3)} of those ${Object.values(detail).reduce((n, p) => n + Object.keys(p).length, 0)} were skipped at run time — an orthogonal fact, and the ${skips.filter((d) => d.tally).length} that also carry a tally are why it is one\n`);

// ── the hand table must match the measurement exactly, both ways (`D767`) ─────────────────────
const measured = new Set(assertions.map((a) => `${a.mid}|${a.pid}`));
const labelled = new Set();
for (const [mid, plants] of Object.entries(COVERS)) for (const pid of Object.keys(plants)) labelled.add(`${mid}|${pid}`);
for (const key of measured) if (!labelled.has(key)) fail(`${key.replace('|', ' × ')} is an \`assertion\` kill with no \`covers\` label. \`D842\` requires one line of reasoning per relation.`);
for (const key of labelled) if (!measured.has(key)) fail(`${key.replace('|', ' × ')} is labelled in \`lib/mutation-covers.mjs\` but is not an \`assertion\` kill in \`kill-detail.json\`. A label for a relation that no longer happens is \`D767\`'s shape.`);

// ── covers ────────────────────────────────────────────────────────────────────────────────────
const coveredBy = new Map();
for (const [mid, plants] of Object.entries(COVERS)) {
  for (const [pid, v] of Object.entries(plants)) {
    if (!v.covers) continue;
    if (!coveredBy.has(pid)) coveredBy.set(pid, []);
    coveredBy.get(pid).push(mid);
  }
}
console.log('covers (hand-asserted, `D842`):');
for (const { mutation, plant, covers, why } of Object.entries(COVERS).flatMap(([m, ps]) => Object.entries(ps).map(([p, v]) => ({ mutation: m, plant: p, ...v })))) {
  const c = P.get(plant);
  console.log(`  ${covers ? '✓' : '·'} ${plant} ${c.construct.padEnd(24)} ${mutation}`);
  if (!covers) console.log(`      collateral — ${why.split('.')[0]}.`);
}

// ── the covering set, `D841` ──────────────────────────────────────────────────────────────────
const remaining = new Set(coveredBy.keys());
const chosen = [];
while (remaining.size > 0) {
  let best = null; let gain = 0;
  for (const mid of Object.keys(COVERS)) {
    const g = [...remaining].filter((p) => (coveredBy.get(p) ?? []).includes(mid)).length;
    if (g > gain) { gain = g; best = mid; }
  }
  if (!best) break;
  chosen.push({ mid: best, gain });
  for (const p of [...remaining]) if ((coveredBy.get(p) ?? []).includes(best)) remaining.delete(p);
}
console.log(`\ncovering set (\`D841\`, computed over *covers* and not over kills): ${chosen.length} mutation(s)`);
for (const c of chosen) console.log(`  +${c.gain}  ${c.mid}`);

// ── the partition of the graded roster ────────────────────────────────────────────────────────
const everRed = new Set(killers.flatMap((r) => r.killed));
const everAsserted = new Set(assertions.map((a) => a.pid));
const buckets = { covered: [], 'assertion-collateral': [], 'refusal-only': [], 'never-red': [] };
for (const id of GRADED) {
  if (coveredBy.has(id)) buckets.covered.push(id);
  else if (everAsserted.has(id)) buckets['assertion-collateral'].push(id);
  else if (everRed.has(id)) buckets['refusal-only'].push(id);
  else buckets['never-red'].push(id);
}
console.log(`\nthe ${GRADED.length} acceptance-graded plants (\`D846\`):`);
console.log(`  covered              ${String(buckets.covered.length).padStart(3)}  a mutation about this plant's own construct made its own known answer false`);
console.log(`  assertion-collateral ${String(buckets['assertion-collateral'].length).padStart(3)}  went red on its own assertions, but under a break in some other construct`);
console.log(`  refusal-only         ${String(buckets['refusal-only'].length).padStart(3)}  only ever red because its fixture was refused — it has never asserted a false answer`);
console.log(`  never-red            ${String(buckets['never-red'].length).padStart(3)}  no candidate mutation made it red at all`);
for (const [name, ids] of Object.entries(buckets)) if (name !== 'refusal-only' && ids.length > 0) console.log(`    ${name}: ${ids.join(', ')}`);

// ── how old this measurement is, measured rather than asserted (`D854`) ───────────────────────
//
// `D851` refused the ratchet, so nothing re-runs the census — and a committed measurement nothing
// re-measures is `D767`'s shape exactly, one level up from a count. What is cheap is asking whether
// the census's *denominators* still hold: the registry it was taken against, and the roster it
// graded. Both are one import away and neither needs a stack.
//
// This REPORTS and does not fail, deliberately. Failing would make every mutation tflw adds turn
// this repository's CI red until somebody spends seven hours on the box — a gate punishing the
// wrong repository for the right change. `verify-ledger.mjs`'s citation-staleness line already
// takes this shape here ("this informs; it does not fail"), and this is the same claim: the drift
// is visible in the artefact's own output rather than in a plan nobody checks out.
const stamps = [...matrix.values()].map((r) => r.at).filter(Boolean).sort();
console.log(`\ncensus taken ${meta.startedAt?.slice(0, 10) ?? '?'} on the ${meta.machine}`);

// `M168-06`. THE COST AND THE SPAN ARE TWO NUMBERS, AND ONLY ONE OF THEM IS A COST.
//
// This block printed exactly one figure — the first-to-last stamp span — and called it
// `wall clock ... resumes included`. Both halves of that phrase were doing damage. It was derived
// from the rows' own stamps rather than from `run-meta`, for `D849`'s reason (the meta block is
// written once per invocation and a resumed sweep is several of them), and that reasoning is
// right about *when the census was taken* and wrong about *what it cost*: the very property that
// makes a span robust to a resume is what makes it meaningless across one. `resumes included`
// reads as `this figure accounts for them`; what it meant was `this figure contains the nights`.
//
// Measured on the box over this committed matrix: span **50.6 h**, sum of `rosterSeconds`
// **6.2 h** — 8.1x, up from the 7x the finding was filed on, because a span grows with the
// calendar and a cost does not. This was the only cost number in the artefact, so it is the one a
// reader sizing the next census would have used.
//
// The repair needed no re-run: `rosterSeconds` is a committed field, written per row by
// `discover-mutation-kills.mjs:659` from that mutation's own roster invocation. State what it is
// and what it leaves out rather than rounding it into the span:
//   - it is ROSTER time only. The per-candidate re-vendor is not in it (`run-meta` records one
//     baseline `revendorSeconds`, not one per row), and neither are the stack recycles.
//   - the `unbuildable` rows carry none at all, and that is correct rather than missing data —
//     those candidates failed to re-vendor and never reached the roster.
// So it is a floor and the span is a ceiling, and the two are printed as what they are.
const seconds = [...matrix.values()].map((r) => r.rosterSeconds).filter((n) => typeof n === 'number');
if (seconds.length > 0) {
  const cost = seconds.reduce((a, b) => a + b, 0) / 3600;
  const without = matrix.size - seconds.length;
  console.log(`  ${cost.toFixed(1)} h of roster time, summed from the ${seconds.length} row(s) of ${matrix.size} that record it`
    + `${without > 0 ? ` (the other ${without} never reached the roster)` : ''} — a floor: the per-candidate`
    + ` re-vendor and the stack recycles are measured nowhere per row`);
}
if (stamps.length > 1) {
  const hours = (Date.parse(stamps[stamps.length - 1]) - Date.parse(stamps[0])) / 3.6e6;
  console.log(`  ${hours.toFixed(1)} h calendar span from the first recorded row to the last`
    + ` — a ceiling, and across a resume it is mostly the gap between sittings, not work`);
}
// `M168-09`. The denominators are compared by CONTENT, not by cardinality.
//
// Both lines here used to be a difference of two integers, and both could be false while being
// arithmetically correct. `M168-02` is the proof: it took `C108` from four graded clauses to seven,
// added no construct id, and this printed `roster unchanged at 102 acceptance-graded plant(s)` in
// the same run that re-measured a verdict *precisely because the roster had moved*. The registry
// half is the same shape and worse, because the registry lives in tflw on its own merge cadence and
// a mutation's `find`/`replace` bodies are the patch itself.
//
// Three outcomes, and they are not one finding: **added** has never been in a census, **removed**
// leaves verdicts about something that no longer exists, and **changed** is the dangerous one — the
// verdict is still keyed to a live id and now means something else.
const shapePath = path.join(DIR, 'census-shape.json');
const shape = fs.existsSync(shapePath) ? JSON.parse(fs.readFileSync(shapePath, 'utf8')) : null;
const name = (ids) => (ids.length > 8 ? `${ids.slice(0, 8).join(', ')} +${ids.length - 8} more` : ids.join(', '));

const liveClaims = new Map(plantsFor('acceptance').map((p) => [p.id, claimDigest(p)]));
if (!shape) {
  const plantGrew = GRADED.length - (meta.gradedPlants ?? GRADED.length);
  console.log(`  roster: no fingerprint recorded — this census predates \`M168-09\`, so all it can compare is the count`
    + ` (${meta.gradedPlants ?? '?'} at census time, ${GRADED.length} now${plantGrew === 0 ? ', which a plant whose clauses moved would not change' : ''})`);
} else {
  const d = diffDigests(shape.plants ? Object.fromEntries(Object.entries(shape.plants).map(([k, v]) => [k, v.claim])) : {}, liveClaims);
  console.log(
    d.changed.length + d.added.length + d.removed.length === 0
      ? `  roster unchanged: ${d.unchanged} plant(s) hash identically to the fingerprint taken ${shape.at?.slice(0, 10)}`
      : `  roster has MOVED since ${shape.at?.slice(0, 10)}: ${d.changed.length} plant(s) changed${d.changed.length ? ` (${name(d.changed)})` : ''}`
        + `${d.added.length ? `, ${d.added.length} added (${name(d.added)})` : ''}`
        + `${d.removed.length ? `, ${d.removed.length} removed (${name(d.removed)})` : ''}`
        + ` — ${d.unchanged} unchanged`,
  );
  // The verdicts that are demonstrably about a plant that has moved. A *survived* verdict may have
  // gone stale too and nothing here can tell which one — that is the whole census — so this names
  // only what it can name, and says what it is leaving out.
  const moved = new Set([...d.changed, ...d.removed]);
  const suspect = [...matrix.values()].filter((r) => (r.killed ?? []).some((id) => moved.has(id)));
  if (suspect.length > 0) {
    console.log(`    ${suspect.length} recorded verdict(s) name a moved plant — re-measure them with:`);
    console.log(`    npm run discover:mutation-kills -- --remeasure ${suspect.map((r) => r.id).join(',')} --why "<what changed>"`);
    console.log(`    (a \`survived\` verdict can go stale the same way and this cannot say which — that answer is a whole census)`);
  }
}

try {
  const { mutations } = await readMutations();
  const livePatches = new Map(mutations.map((m) => [m.id, patchDigest(m)]));
  if (!shape) {
    const grew = mutations.length - (meta.registryTotal ?? mutations.length);
    console.log(`  registry: no fingerprint recorded — count only`
      + ` (${meta.registryTotal ?? '?'} at census time, ${mutations.length} now`
      + `${grew === 0 ? ', which a registry that rewrote one entry in place would not change' : ''})`);
  } else {
    const d = diffDigests(shape.registry ?? {}, livePatches);
    console.log(
      d.changed.length + d.added.length + d.removed.length === 0
        ? `  registry unchanged: ${d.unchanged} mutation(s) hash identically to the fingerprint`
        : `  registry has MOVED: ${d.changed.length} patch(es) rewritten in place${d.changed.length ? ` (${name(d.changed)})` : ''}`
          + `${d.added.length ? `, ${d.added.length} never tried (${name(d.added)})` : ''}`
          + `${d.removed.length ? `, ${d.removed.length} no longer exist (${name(d.removed)})` : ''}`
          + ` — ${d.unchanged} unchanged`,
    );
  }
} catch (e) {
  console.log(`  registry not readable from ${siblingRoot()} — cannot say whether it has moved (${String(e.message).split('\n')[0]})`);
}

// Per-row, because `M168-02`'s carry is that a verdict is a statement about a mutation AND the
// roster it was measured against. The stamp is an aggregate over both maps, so it can be compared
// to the shape file but NOT recomputed here: half of it is the grader's measured clause counts, and
// recomputing those needs a seven-container stack. Hence *matches the fingerprint* rather than
// *matches the tree*.
const rowStamps = new Map();
for (const r of matrix.values()) rowStamps.set(r.rosterStamp ?? null, (rowStamps.get(r.rosterStamp ?? null) ?? 0) + 1);
const unstamped = rowStamps.get(null) ?? 0;
if (unstamped > 0) {
  console.log(`  ${unstamped} of ${matrix.size} verdict(s) carry no roster stamp — measured before \`M168-09\`, so their staleness cannot be determined at all`);
}
for (const [s, n] of rowStamps) {
  if (s === null) continue;
  console.log(`  ${n} verdict(s) stamped ${s}${shape ? (s === shape.aggregate ? ' — the current fingerprint' : ' — an EARLIER fingerprint than the one recorded') : ''}`);
}
// The residue, stated rather than left to be found. `verify-construct-acceptance.mjs` holds the
// predicate inside each `recall(…)`/`precision(…)`, and no scheme for attributing that source text
// back to a plant id avoids mis-attributing setup code to the previous plant — a false *unchanged*,
// the one direction that must not happen. So a threshold loosened from `<= 6` to `<= 60` still
// reports the roster unchanged. The clause COUNT is covered, and only by the next baseline.
console.log('  A clause whose predicate changed without changing its plant record or its count is not visible here (`M168-09` §4).');
console.log('  This informs; it does not fail. Re-run `npm run discover:mutation-kills` on the box to close the gap.');

console.log(
  failures === 0
    ? `\n✓ the hand-authored covers table and the measured matrix agree: ${measured.size} assertion relation(s), ${measured.size} label(s).`
    : `\n✗ mutation matrix: ${failures} mismatch(es).`,
);
if (GATE) process.exit(failures === 0 ? 0 : 1);
