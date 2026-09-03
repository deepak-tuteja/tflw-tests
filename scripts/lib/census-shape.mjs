// `M168-09` — what a census's denominators were, recorded as content rather than as a count.
//
// The age report in `read-mutation-matrix.mjs` used to ask whether the roster and the registry had
// moved by subtracting two integers. `M168-02` is the counter-example: it took `C108` from four
// graded clauses to seven, added no construct id, and the report printed `roster unchanged at 102`
// **in the run that re-measured a verdict precisely because the roster had moved**. The registry
// half is the same shape and worse — it lives in tflw, on a different merge cadence, and a
// mutation's `find`/`replace` bodies *are* the patch, so rewriting one keeps the count while every
// verdict keyed by that id starts answering a different question.
//
// One module for both the writer (`discover-mutation-kills.mjs`, at baseline) and the reader
// (`read-mutation-matrix.mjs`), so the two cannot disagree about what a digest is. That
// disagreement is not hypothetical here: `D847`'s bundle identity is computed in one place for
// exactly this reason, after a normalisation that existed in one copy and not the other.

import { createHash } from 'node:crypto';

const sha12 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

/**
 * Canonical JSON — object keys sorted at every depth, so a digest survives a reordering edit.
 *
 * Every field of all 112 plant records and all 316 registry entries is a string, a boolean, an
 * array of strings or a plain object (`evidence`, and `blockedOn` which is usually `null`). There
 * are no functions and no regexes to lose, which is why this is four lines rather than a
 * serialiser.
 */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

/**
 * The digest of a plant's stated claim — **the whole record**, not a chosen subset (`D-M168-09-1`).
 *
 * Every field is a claim. `title` and `target` say what the plant is about, `evidence` says what
 * must exist for it to be gradeable, `run` names the fixture, `graders` names who judges it. A
 * hand-picked subset is a judgement that can be wrong toward *unchanged*, and there is nothing to
 * buy by taking that risk on a report that costs one sha per plant.
 *
 * What this does NOT see is the predicate inside each `recall(…)`/`precision(…)` call in
 * `verify-construct-acceptance.mjs`. Every scheme for attributing that source text back to a plant
 * id mis-attributes setup code to the previous plant, which is a **false unchanged** — the one
 * direction that must not happen. `shapeOfRosterOutput` below takes the weaker claim that is
 * always true (how many clauses) instead of the stronger one that is sometimes a lie.
 */
export const claimDigest = (plant) => sha12(canonical(plant));

/** The digest of a mutation's patch — `find`/`replace`/`edits`, plus where it is applied. */
export const patchDigest = (m) => sha12(canonical({
  file: m.file ?? null, pkg: m.pkg ?? null, find: m.find ?? null, replace: m.replace ?? null,
  edits: m.edits ?? null, equivalent: m.equivalent ?? false,
}));

/** One digest over a whole shape, so a matrix row can carry the roster it was measured against. */
export const aggregate = (shape) => sha12(canonical(shape));

/**
 * Pull each plant's clause **denominators** out of the acceptance grader's closing table.
 *
 * `  ✓ C108 config:key:web   recall 4/4  precision 3/3  (skipped: …)  [blocked-on:…]`
 *
 * The numerator is the measurement; the denominator is the shape. Only the shape belongs here —
 * under a mutation the numerator is exactly what is supposed to move. This is why it is captured
 * at **baseline** and nowhere else (`D-M168-09-4`).
 *
 * The table is parsed rather than a JSON flag being added to the grader, for the reason
 * `runRoster` already gives: this sweep must not change the instrument it measures through.
 */
export function shapeOfRosterOutput(out) {
  const shape = new Map();
  for (const line of out.split('\n')) {
    const m = /^\s{2}[✓✗–]\s+(C\d+)\s.*\brecall\s+(\S+)\s+precision\s+(\S+)/.exec(line);
    if (!m) continue;
    const denom = (t) => (t === 'n/a' ? 'n/a' : (t.split('/')[1] ?? '?'));
    shape.set(m[1], `${denom(m[2])}/${denom(m[3])}`);
  }
  return shape;
}

/**
 * Compare a recorded `{id: digest}` map against a live one.
 *
 * Three outcomes and they are not the same finding: an **added** id has never been in a census, a
 * **removed** id leaves verdicts about something that no longer exists, and a **changed** id is the
 * dangerous one — the verdict is still keyed to a live id and now means something else.
 */
export function diffDigests(recorded, live) {
  const r = new Map(Object.entries(recorded ?? {}));
  const l = new Map(live);
  return {
    added: [...l.keys()].filter((k) => !r.has(k)),
    removed: [...r.keys()].filter((k) => !l.has(k)),
    changed: [...l.keys()].filter((k) => r.has(k) && r.get(k) !== l.get(k)),
    unchanged: [...l.keys()].filter((k) => r.has(k) && r.get(k) === l.get(k)).length,
  };
}
