#!/usr/bin/env node
// `npm run verify:reach-verdicts` — the hand-read half of the reach measurement is held to the
// measured half, both ways. `M189a` (`D974`); the reasoning and the vocabulary are in
// `lib/reach-verdicts.mjs`, and `read-mutation-matrix.mjs` prints the same bins without gating.
//
// Reads three committed files and runs nothing, so it is a contributor gate: milliseconds, no
// stack, no sibling checkout. It refuses when there is no complete measurement to hold the table
// to — a gate green about nothing is `D722`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMatrix, binsOf, checkVerdicts, loadReach, loadVerdicts, PRODUCED } from './lib/reach-verdicts.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, 'tflw-acceptance', 'mutation');

const reach = loadReach(DIR);
const matrix = readMatrix(path.join(DIR, 'kill-matrix.jsonl'));
const table = loadVerdicts(DIR);
const problems = checkVerdicts(reach, matrix, table);
if (problems.length > 0) {
  console.log(`✗ reach verdicts: ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  · ${p}`);
  process.exit(1);
}
const bins = binsOf(reach, matrix);
const verdicts = Object.entries(table).filter(([k]) => !k.startsWith('$'));
const byVerdict = {};
for (const [, v] of verdicts) byVerdict[v.verdict] = (byVerdict[v.verdict] ?? 0) + 1;
const families = new Set(verdicts.filter(([, v]) => v.verdict === 'not-asserted').map(([, v]) => v.family));
console.log(`✓ reach verdicts: ${bins.reached.length} reached survivor(s), ${verdicts.length} verdict(s) — ${Object.entries(byVerdict).map(([k, n]) => `${k} ${n}`).join(', ')}; ${families.size} construct famil${families.size === 1 ? 'y' : 'ies'} in the not-asserted bin; measured ${reach[PRODUCED].at?.slice(0, 10)} over ${reach[PRODUCED].plants.length} plant(s) against tflw ${reach[PRODUCED].tflw?.sha ?? '?'}`);
