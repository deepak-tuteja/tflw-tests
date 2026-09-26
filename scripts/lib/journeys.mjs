// `S-3b` (decision 16, `PLAN_M239_DOGFOOD_EXPANSION.md`): how many journeys use each browser
// statement, and each workload shape. A *journey* is one `test` in a file this project runs as a
// user flow — under `tests/`, including `.env-specific/` (real flows, run in their own phases), and
// excluding the plants (`.constructs/`), the check-only fixtures (`.checkonly/`), scratch
// (`.scratch/`), the page's own suite (`.tflw-ui/`, a different target) and action files (`shared/`,
// which are not tests). A plant proves a construct's known answer once; a journey is what a user
// does, and the enterprise review found nine browser statements used exactly once outside the plants.
//
// Counting is textual on purpose: a statement is recognised by how a line starts inside a test,
// which is how it is written, and the count asks *which tests* — a test using `click` five times is
// one journey. A call to an action counts what the action's body writes, to any depth: the payment
// `stub` lives in `shared/webv2-checkout.tflw`'s `checkout()`, and every journey that checks out
// uses it as surely as one that wrote it inline. The floors live here; the table in CONSTRUCTS.md (`## Journeys`) is the published
// count, held equal to this module's by `scripts/verify-journeys.mjs`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** Statement → the line shape that writes it, the floor it is held to, and its lens. */
export const JOURNEY_STATEMENTS = [
  ['step:open', /^\s+open\s+"/, 3, 'browser'],
  ['step:click', /^\s+click\s/, 3, 'browser'],
  ['step:double', /^\s+double click\s/, 3, 'browser'],
  ['step:right', /^\s+right click\s/, 3, 'browser'],
  ['step:fill', /^\s+fill\s/, 3, 'browser'],
  ['step:select', /^\s+select\s+/, 3, 'browser'],
  ['step:tick', /^\s+tick\s/, 3, 'browser'],
  ['step:untick', /^\s+untick\s/, 3, 'browser'],
  ['step:press', /^\s+press\s+"/, 3, 'browser'],
  ['step:hover', /^\s+hover\s/, 3, 'browser'],
  ['step:scroll', /^\s+scroll to\s/, 3, 'browser'],
  ['step:within', /^\s+within\s/, 3, 'browser'],
  ['step:accept', /^\s+accept dialog\b/, 3, 'browser'],
  ['step:dismiss', /^\s+dismiss dialog\b/, 3, 'browser'],
  ['step:switch', /^\s+switch to (new tab|tab\s+\d)/, 3, 'browser'],
  ['step:close', /^\s+close tab\b/, 3, 'browser'],
  ['step:download', /^\s+download as\s/, 3, 'browser'],
  ['step:drag', /^\s+drag\s/, 3, 'browser'],
  ['step:drop', /^\s+drop file\s/, 3, 'browser'],
  ['step:screenshot', /^\s+screenshot\s+"/, 3, 'browser'],
  ['step:stub', /^\s+stub\s+[A-Z]+\s/, 3, 'browser'],
  // `S-3c` (decision 17): the five workload shapes, each at least once under `tests/`. A `hold`
  // names its unit, which is what separates it from a spike's `hold N for` stage.
  ['step:ramp', /^\s+ramp to\s/, 1, 'workload'],
  ['step:hold', /^\s+hold \d+ (users|rps) for\s/, 1, 'workload'],
  ['step:step', /^\s+step (users|rps)\s*$/, 1, 'workload'],
  ['step:spike', /^\s+spike (users|rps)\s*$/, 1, 'workload'],
  ['step:run', /^\s+run \d+ iterations\b/, 1, 'workload'],
];

const SKIPPED_DIRS = new Set(['.constructs', '.checkonly', '.scratch', '.tflw-ui', 'shared', 'snapshots', 'payloads']);

function* tflwFiles(dir) {
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIPPED_DIRS.has(entry)) yield* tflwFiles(full);
    } else if (isJourneyFile(entry)) yield full;
  }
}

// A dotfile is the ui's scratch (`.play.tflw`), gitignored, so a local count that read it would
// disagree with CI's on a checkout that has none.
function isJourneyFile(entry) {
  return entry.endsWith('.tflw') && !entry.startsWith('.');
}

/** The body lines of each top-level `test` in one file's source, and of each `action` by name. */
export function declarations(source) {
  const tests = [];
  const actions = new Map();
  let current = null;
  for (const line of source.split('\n')) {
    const action = /^action\s+([^(]+?)\s*\(/.exec(line);
    if (/^test\s+"/.test(line)) {
      current = [];
      tests.push(current);
    } else if (action) {
      current = [];
      actions.set(action[1], current);
    } else if (/^\S/.test(line) && !line.startsWith('#') && !line.startsWith('@')) {
      current = null;
    } else if (current !== null) {
      current.push(line);
    }
  }
  return { tests, actions };
}

/** The body lines of each top-level `test` in one file's source. */
export function testBodies(source) {
  return declarations(source).tests;
}

/** A body with every action it calls spliced in, to any depth; a cycle is followed once. */
export function expandCalls(body, actions, seen = new Set()) {
  const out = [];
  for (const line of body) {
    out.push(line);
    for (const [name, inner] of actions) {
      if (seen.has(name)) continue;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`^\\s+(let\\s+\\w+\\s*=\\s*)?${escaped}\\s*\\(`).test(line)) {
        out.push(...expandCalls(inner, actions, new Set([...seen, name])));
      }
    }
  }
  return out;
}

function* allTflw(dir) {
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* allTflw(full);
    else if (isJourneyFile(entry)) yield full;
  }
}

/** For each statement, the number of journeys (tests) under `testsDir` that use it. */
export function countJourneys(testsDir) {
  // Actions are collected from every file under `tests/`, `shared/` included, because that is where
  // journeys import them from; resolution is by name, which is how a call is written.
  const actions = new Map();
  for (const file of allTflw(testsDir)) {
    for (const [name, body] of declarations(readFileSync(file, 'utf8')).actions) actions.set(name, body);
  }
  const counts = new Map(JOURNEY_STATEMENTS.map(([id]) => [id, 0]));
  for (const file of tflwFiles(testsDir)) {
    for (const body of testBodies(readFileSync(file, 'utf8'))) {
      const lines = expandCalls(body, actions);
      for (const [id, shape] of JOURNEY_STATEMENTS) {
        if (lines.some((line) => shape.test(line))) counts.set(id, counts.get(id) + 1);
      }
    }
  }
  return counts;
}
