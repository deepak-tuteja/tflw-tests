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
const kinds = {};
const assertions = [];
for (const [mid, plants] of Object.entries(detail)) {
  for (const [pid, d] of Object.entries(plants)) {
    kinds[d.kind] = (kinds[d.kind] ?? 0) + 1;
    if (d.kind === 'assertion') assertions.push({ mid, pid, d });
  }
}
console.log('how the plants died (from the acceptance grader\'s own per-plant page):');
console.log(`  refusal        ${String(kinds.refusal ?? 0).padStart(3)}  the fixture was refused at check time — no report, so the plant asserted nothing`);
console.log(`  no-assertions  ${String(kinds['no-assertions'] ?? 0).padStart(3)}  an empty tally the acceptance gate itself fails on (\`M154f-03\`)`);
console.log(`  assertion      ${String(kinds.assertion ?? 0).padStart(3)}  the plant ran, produced its known answer, and the answer was false\n`);

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

console.log(
  failures === 0
    ? `\n✓ the hand-authored covers table and the measured matrix agree: ${measured.size} assertion relation(s), ${measured.size} label(s).`
    : `\n✗ mutation matrix: ${failures} mismatch(es).`,
);
if (GATE) process.exit(failures === 0 ? 0 : 1);
