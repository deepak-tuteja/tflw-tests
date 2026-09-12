// `kill-detail.json` — how each plant died — and, since `M188b`, the producer that writes it.
//
// `M176-05`. The file is read by `read-mutation-matrix.mjs`, which gates the hand-authored `COVERS`
// table against it in both directions (`D842`), and until `M188b` nothing wrote it: the census
// (`discover-mutation-kills.mjs`) kept the grader's page for every killing mutation as a transcript
// and a person derived the file from those pages by hand, once per census. That hand step produced
// `M168-05` — two relations filed under a `kind` their own note contradicts — and `M176e` made the
// label falsifiable from the row's own fields (`deriveKind`, below) without removing the step. The
// evidence was perishable, too: the transcripts live in `~/.tflw-mutation/transcripts` on the box,
// untracked and unsynced, and 9 of the 16 killing mutations' pages were already gone when the row
// was filed.
//
// `D968`: the sweep writes the file itself, from the same grader output it already parses for the
// kill set, one entry per red plant, provenance-stamped per mutation. `D969`: a transcript is a
// debugging aid, not evidence — the sweep is the evidence, reproducible from the mutation registry
// plus the tflw sha `run-meta.json` records; the transcripts stay untracked (they also carry the
// box's home path on their resolution line, which a tracked file must not — `D669`).
//
// The grader's page has two shapes this reads and nothing else:
//
//     ✗ C95 recall — neither variable set: the run is refused naming both (got: …)     a clause
//       ✗ C95 config:directive:require recall 1/4  precision 1/1                        the table
//       ✗ C42 config:key:viewport      recall 2/2  precision 3/3  (skipped: no report)
//       ✗ C43 step:dismiss             recall n/a  precision n/a  (skipped: no report)
//
// The table row is exactly the one `discover-mutation-kills.mjs`'s `runRoster` reads for the kill
// set, one column further along — `M168-09`'s shape. A red plant absent from the table is a
// refusal, not a quiet omission: the sweep already refuses a short table (`M153b-01`).
//
// The entries stay hand-authored until the next census regenerates them — the row's deferral
// trigger — and `read-mutation-matrix.mjs` counts how many of each kind it is reading, so that
// deferral is measurable rather than remembered.
import { fileURLToPath } from 'node:url';

/** The per-mutation provenance key. `$`-prefixed because plant ids are `C\d+` and never will be. */
export const PRODUCED = '$produced';

const TABLE_ROW = /^\s{2}([✓✗–])\s+(C\d+)\s+\S+\s+recall\s+(n\/a|\d+\/\d+)\s+precision\s+(n\/a|\d+\/\d+)(?:\s+\(skipped:\s*([^)]*)\))?\s*$/;
const CLAUSE = /^✗\s+(C\d+)\s+(recall|precision)\s+—\s+(.*\S)\s*$/;

/**
 * The kind, derived from three booleans the grader's page reports — never read off the row.
 * `M168-05` / `M176e`: `kind` used to carry WHAT THE PLANT ASSERTED and WHETHER ITS FIXTURE WAS
 * REFUSED in one word, which is why two rows had nowhere to go.
 *
 *         asserted?   refused?    kind
 *         no          yes         refusal          it asserted nothing; nothing can have covered it
 *         no          no          no-assertions    an empty tally the acceptance gate fails on (`M154f-03`)
 *         yes         either      assertion        it produced its known answer and the answer was FALSE
 *         yes         either      held             it produced its known answer and every clause HELD
 */
export function deriveKind(r) {
  const asserted = typeof r.tally === 'string' && r.tally.length > 0;
  if (!asserted) return typeof r.skipped === 'string' ? 'refusal' : 'no-assertions';
  return (r.failed ?? []).length > 0 ? 'assertion' : 'held';
}

/**
 * The entries for one killing mutation, from the grader's page and the ids the sweep found red.
 *
 * @param {string} out the roster's stdout+stderr, as `runRoster` holds it
 * @param {string[]} redIds the plants that did not produce their known answer
 * @returns {Record<string, {kind: string, tally?: string, failed?: string[], skipped?: string}>}
 */
export function detailFromRosterOutput(out, redIds) {
  const table = new Map();
  const clauses = new Map();
  for (const line of out.split('\n')) {
    let m = TABLE_ROW.exec(line);
    if (m) { table.set(m[2], { recall: m[3], precision: m[4], skipped: m[5] }); continue; }
    m = CLAUSE.exec(line);
    if (m) {
      if (!clauses.has(m[1])) clauses.set(m[1], []);
      clauses.get(m[1]).push(`${m[2]}: ${m[3]}`);
    }
  }
  const detail = {};
  for (const id of redIds) {
    const row = table.get(id);
    if (!row) throw new Error(`${id} is red in the kill set and absent from the grader's table — the page and the kill set disagree, so nothing is written`);
    const asserted = row.recall !== 'n/a' || row.precision !== 'n/a';
    const entry = {};
    if (asserted) {
      entry.tally = `${row.recall} / ${row.precision}`;
      entry.failed = clauses.get(id) ?? [];
    }
    if (typeof row.skipped === 'string') entry.skipped = row.skipped;
    detail[id] = { kind: deriveKind(entry), ...entry };
  }
  return detail;
}

/**
 * Merge one mutation's produced entries into the file's document, replacing whatever that
 * mutation carried (a hand-authored block, or an earlier census's), and stamp where they came from.
 */
export function mergeProduced(doc, mutationId, entries, provenance) {
  return { ...doc, [mutationId]: { ...entries, [PRODUCED]: { by: 'discover-mutation-kills.mjs', ...provenance } } };
}

/** The plant entries of one mutation's block, with the provenance key removed. */
export function plantsOf(block) {
  return Object.fromEntries(Object.entries(block).filter(([k]) => k !== PRODUCED));
}

/** How many of the document's mutation blocks the sweep wrote, and how many a person did. */
export function provenanceTally(doc) {
  let produced = 0, hand = 0;
  for (const block of Object.values(doc)) (block[PRODUCED] ? produced++ : hand++);
  return { produced, hand };
}

// ── self-test ─────────────────────────────────────────────────────────────────────────────────
function selfTest() {
  const ok = [], bad = [];
  const t = (name, cond) => (cond ? ok : bad).push(name);

  // A page with all four kinds on it, in the grader's own layout: clauses in the body, the table at
  // the end, unrelated lines between — including a `✗ C39-C42 produced no report.` line and a
  // `got:` payload that itself contains a `✗`, both of which the clause rule must not read.
  const page = [
    'C95 — require env',
    '✗ C39-C42 produced no report. Needs the stack, the storefront on :8090 and a browser.',
    '✗ C95 recall — neither variable set: the run is refused naming both (got: error: missing required environment variable: C95_TOKEN)',
    '  ✓ with both set the same run reaches the transport',
    '✗ C95 precision — exactly one of the two failed (got: 11:58:40.686 ✗ a discoverable file with nothing else to say)',
    '',
    'roster',
    '  ✗ C42 config:key:viewport recall 2/2  precision 3/3  (skipped: no report)',
    '  ✗ C43 step:dismiss   recall n/a  precision n/a  (skipped: no report)',
    '  ✗ C44 step:ramp      recall n/a  precision n/a',
    '  ✗ C95 config:directive:require recall 1/4  precision 1/1',
    '  ✓ C96 config:directive:exclude recall 3/3  precision 1/1',
    '',
  ].join('\n');
  const d = detailFromRosterOutput(page, ['C42', 'C43', 'C44', 'C95']);

  t('a refused plant with no tally is a `refusal` carrying the skip and nothing else',
    JSON.stringify(d.C43) === JSON.stringify({ kind: 'refusal', skipped: 'no report' }));
  t('a red plant with no tally and no skip is `no-assertions`', d.C44.kind === 'no-assertions' && !('tally' in d.C44));
  t('a plant that asserted and went false is an `assertion` with its clauses in order, `column: title`',
    d.C95.kind === 'assertion' && d.C95.tally === '1/4 / 1/1' && d.C95.failed.length === 2
      && d.C95.failed[0].startsWith('recall: neither variable set') && d.C95.failed[1].startsWith('precision: exactly one'));
  t('the `got:` payload travels with the clause, including its own ✗',
    d.C95.failed[1].endsWith('(got: 11:58:40.686 ✗ a discoverable file with nothing else to say)'));
  t('`M168-05`\'s case: asserted, every clause held, and skipped — is `held`, with the skip kept as its own field',
    JSON.stringify(d.C42) === JSON.stringify({ kind: 'held', tally: '2/2 / 3/3', failed: [], skipped: 'no report' }));
  t('a green plant is not written even when the page has it', !('C96' in d));
  t('the produced entry derives to its own kind, which is what `read-mutation-matrix.mjs` checks',
    Object.values(d).every((e) => deriveKind(e) === e.kind));

  // The refusal: a red id the table does not carry.
  let threw = null;
  try { detailFromRosterOutput(page, ['C99']); } catch (e) { threw = e.message; }
  t('a red plant absent from the table refuses rather than writing a partial block', /C99.*absent/.test(threw ?? ''));

  // Provenance: a merge replaces the block, stamps it, and the tally sees the stamp.
  const doc = { hand: { C1: { kind: 'refusal', skipped: 'no report' } }, redone: { C2: { kind: 'refusal', skipped: 'no report' } } };
  const merged = mergeProduced(doc, 'redone', { C3: { kind: 'no-assertions' } }, { baseline: 'abc1234', bundle: 'def5678', at: '2026-09-12T00:00:00.000Z' });
  t('a merge replaces the mutation\'s block and leaves the others', !('C2' in merged.redone) && 'C1' in merged.hand);
  t('the stamp names the producer, the build and the time', merged.redone[PRODUCED].by === 'discover-mutation-kills.mjs' && merged.redone[PRODUCED].baseline === 'abc1234' && merged.redone[PRODUCED].bundle === 'def5678');
  t('`plantsOf` hides the stamp from a reader iterating plants', !(PRODUCED in plantsOf(merged.redone)) && 'C3' in plantsOf(merged.redone));
  t('the tally separates produced from hand-authored blocks', JSON.stringify(provenanceTally(merged)) === JSON.stringify({ produced: 1, hand: 1 }));
  t('the input document is not mutated', !(PRODUCED in doc.redone));

  if (bad.length) {
    console.error(`✗ kill-detail self-test: ${bad.length} of ${ok.length + bad.length} control(s) did not fire`);
    for (const b of bad) console.error(`    · ${b}`);
    return 1;
  }
  console.log(`✓ kill-detail self-test: ${ok.length} control(s), each shown to fire on the input it exists for`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--self-test')) {
    console.error('✗ this module is a library; its only command-line mode is `--self-test`.');
    process.exit(64);
  }
  process.exit(selfTest());
}
