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
//
// `T-1a` (tflw `D1372`, `PLAN_M247_DOGFOOD_WHOLE_PRODUCT.md`): the floor reaches every family the
// manifest reports — the other steps, the declarations, subjects, matchers and generators at one
// journey each, and every config directive in the root `tflw.config`. The browser statements and
// the workload shapes keep their floors. `FAMILY_SHAPES` is keyed by manifest id, and the gate asks
// the vendored build's `tflw spec --json` for the id set in both directions, so this is not a
// wordlist (`D659`): a construct tflw ships without a shape here is a red, and so is a shape for one
// it no longer ships.
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
    // A `crawl` is a unit of execution and of reporting like a `test` (tflw's SPEC says so), and
    // its body is where the `has no … violations` matchers live, so it is a journey too. No
    // browser statement or workload shape can appear in one, so the older rows do not move.
    if (/^(test|crawl)\s+"/.test(line)) {
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

// ---------------------------------------------------------------------------------------------
// `T-1a` — every other family, keyed by the manifest id `tflw spec --json` gives it.

// An assertion line, and the optional quantifier a collection subject takes.
const ASSERT = String.raw`^\s+(?:expect|check|wait until)\s+(?:(?:any|every|all|no)\s+)?`;
const subject = (rest) => new RegExp(ASSERT + rest);
// A matcher is read off an assertion line with its string literals emptied, so `expect text "is
// empty" is visible` is a `state-word` and not an `is-empty`.
const matcher = (rest) => ({ assertion: true, shape: new RegExp(String.raw`\b` + rest) });
// A declaration is read off the file, not a test body: most of them sit above or beside a `test`.
const header = (rest) => new RegExp(String.raw`^(?:test|crawl)\s+"(?:[^"\\]|\\.)*"` + rest, 'm');

/**
 * id → how a line (or, for `declaration:`/`config:`, a file) writes it. A regular expression is a
 * body-line shape; `{ assertion, shape }` a matcher shape; `{ file }` a whole-file shape.
 */
export const FAMILY_SHAPES = new Map([
  // the steps the browser and workload rows above do not already hold
  ['step:api', /^\s+api\s/],
  ['step:wait', /^\s+wait until\s/],
  ['step:expect', /^\s+expect\s/],
  ['step:check', /^\s+check\s/],
  ['step:let', /^\s+let\s+\w+\s*=/],
  ['step:capture', /^\s+capture\s/],
  ['step:log', /^\s+log\s/],
  ['step:give', /^\s+give\s/],
  ['step:pause', /^\s+pause\s/],
  // tflw `G1` (`D1381`): the rows of a concurrent table meet here; a bare word on its own line.
  ['step:together', /^\s+together\s*$/],
  ['step:threshold', /^\s+threshold\s/],

  ['declaration:test', { file: /^test\s+"/m }],
  ['declaration:crawl', { file: /^crawl\s+"/m }],
  ['declaration:action', { file: /^action\s+\S/m }],
  ['declaration:element', { file: /^element\s+\w+\s*=/m }],
  ['declaration:import', { file: /^import\s+"/m }],
  ['declaration:use', { file: /^use\s+"/m }],
  ['declaration:before', { file: /^before(\s+file)?\s*$/m }],
  ['declaration:after', { file: /^after(\s+file)?\s*$/m }],
  ['declaration:tags', { file: /^@[\w-]/m }],
  ['declaration:with-each', { file: /^with each\b/m }],
  // tflw `G10` (`D1384`): a `rows` block sits at column 0 directly under its test.
  ['declaration:rows', { file: /^rows\s*$/m }],
  ['declaration:as', { file: header(String.raw`.*\bas\s+\w`) }],
  ['declaration:skip', { file: header(String.raw`.*\bskip\s+"`) }],
  ['declaration:retry', { file: header(String.raw`.*\bretry\s+\d`) }],
  ['declaration:concurrency', { file: header(String.raw`.*\b(parallel|sequential)\s*$`) }],

  ['subject:status', subject(String.raw`status\b`)],
  ['subject:duration', subject(String.raw`duration\b`)],
  ['subject:header', subject(String.raw`header\s+"`)],
  ['subject:body', subject(String.raw`body\b(?!\s+(text|bytes|csv|pdf)\b)`)],
  ['subject:body-text', subject(String.raw`body text\b`)],
  ['subject:body-bytes', subject(String.raw`body bytes\b`)],
  ['subject:body-csv', subject(String.raw`body csv\b`)],
  ['subject:body-pdf-text', subject(String.raw`body pdf text\b`)],
  ['subject:request', subject(String.raw`request\b(?!\s+to\s)`)],
  ['subject:network-request', subject(String.raw`request to\s+"`)],
  ['subject:locator', subject(String.raw`(button|field|text|list|css|xpath)\s+"`)],
  ['subject:page', subject(String.raw`page\b`)],
  ['subject:response', subject(String.raw`response\b`)],
  ['subject:dialog-message', subject(String.raw`dialog message\b`)],
  ['subject:dialog-type', subject(String.raw`dialog type\b`)],
  ['subject:value', subject(String.raw`\{`)],

  ['matcher:equals', matcher(String.raw`equals\b`)],
  ['matcher:contains', matcher(String.raw`contains\b`)],
  ['matcher:matches-regex', matcher(String.raw`matches\s+""`)],
  ['matcher:matches-subset', matcher(String.raw`matches subset\b`)],
  ['matcher:matches-schema', matcher(String.raw`matches schema\b`)],
  ['matcher:matches-file', matcher(String.raw`matches file\b`)],
  ['matcher:greater-less-than', matcher(String.raw`is (not )?(greater|less) than\b`)],
  ['matcher:has-count', matcher(String.raw`has count (?!at )`)],
  ['matcher:has-count-at-least', matcher(String.raw`has count at least\b`)],
  ['matcher:has-count-at-most', matcher(String.raw`has count at most\b`)],
  ['matcher:is-empty', matcher(String.raw`is (not )?empty\b`)],
  ['matcher:has-value', matcher(String.raw`has value\b`)],
  ['matcher:state-word', matcher(String.raw`is (not )?(visible|hidden|enabled|disabled|checked)\b`)],
  ['matcher:connects', matcher(String.raw`connects\b`)],
  ['matcher:fails', matcher(String.raw`fails\b`)],
  ['matcher:was-made', matcher(String.raw`was made\b`)],
  ['matcher:has-no-a11y-violations', matcher(String.raw`has no (\w+ )?a11y violations\b`)],
  ['matcher:has-no-security-violations', matcher(String.raw`has no (\w+ )?security violations\b`)],
  ['matcher:has-no-authorization-violations', matcher(String.raw`has no (\w+ )?authorization violations\b`)],
  ['matcher:has-no-input-handling-violations', matcher(String.raw`has no (\w+ )?input handling violations\b`)],
  ['matcher:matches-snapshot', matcher(String.raw`matches snapshot\b`)],

  ['generator:unique-prefix', /\bunique\(\s*"/],
  ['generator:unique-email', /\bunique email\b/],
  ['generator:unique-number', /\bunique number\b/],
  ['generator:unique-like', /\bunique like\s+"/],
  ['generator:unique-uuid', /\bunique uuid\b/],
  ['generator:random-number', /\brandom (number|decimal)\s+-?\d/],
  ['generator:random-date', /\brandom date\b/],
  ['generator:random-of', /\brandom of\s+"/],
  ['generator:random-string', /\brandom string\b/],
  ['generator:random-like', /\brandom like\s+"/],
  ['generator:random-uuid', /\brandom uuid\b/],
  ['generator:random-password', /\brandom password\b/],
  ['generator:transform-base64', /\bbase64 (encode|decode)\(/],
  ['generator:transform-hex', /\bhex (encode|decode)\(/],
  ['generator:transform-length', /\blength of\b/],
  ['generator:transform-join', /\bjoined with\b/],
  ['generator:transform-url', /\burl (encode|decode)\(/],

  // `D1372`: every config directive, in the root `tflw.config` — the file this project runs under.
  ...['defaults', 'env', 'session', 'signer', 'require', 'exclude', 'helpers', 'runs'].map(
    (d) => [`config:directive:${d}`, { config: new RegExp(String.raw`^${d}\b`, 'm') }],
  ),
]);

/** The families `FAMILY_SHAPES` answers for; the gate compares them with the manifest's. */
export const GATED_FAMILIES = ['step', 'declaration', 'subject', 'matcher', 'generator'];
export const GATED_CONFIG_SLOTS = ['directive'];

/** What a row counts, for the table: a journey (test or crawl), a file, or the root config. */
export function unitOf(id) {
  const shape = FAMILY_SHAPES.get(id);
  if (shape?.file) return 'files';
  if (shape?.config) return 'config';
  return 'journeys';
}

const stripStrings = (line) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
const isComment = (line) => /^\s*#/.test(line);

/** One line against one shape (a comment line never counts). */
export function lineUses(shape, line) {
  if (isComment(line)) return false;
  if (shape instanceof RegExp) return shape.test(line);
  if (shape.assertion) return new RegExp(ASSERT).test(line) && shape.shape.test(stripStrings(line));
  return false;
}

/** A file's source with its comment lines blanked, so a declaration mentioned in prose is not one. */
const uncommented = (source) => source.split('\n').map((l) => (isComment(l) ? '' : l)).join('\n');

/**
 * For each `FAMILY_SHAPES` id: journeys that use it (body shapes), journey files plus `shared/`
 * that declare it (file shapes), or occurrences in `configText` (config shapes).
 */
export function countFamilies(testsDir, configText) {
  const actions = new Map();
  for (const file of allTflw(testsDir)) {
    for (const [name, body] of declarations(readFileSync(file, 'utf8')).actions) actions.set(name, body);
  }
  const counts = new Map([...FAMILY_SHAPES.keys()].map((id) => [id, 0]));
  const bodyIds = [...FAMILY_SHAPES].filter(([, s]) => !s.file && !s.config);
  const fileIds = [...FAMILY_SHAPES].filter(([, s]) => s.file);
  for (const file of tflwFiles(testsDir)) {
    const source = readFileSync(file, 'utf8');
    for (const [id, s] of fileIds) if (s.file.test(uncommented(source))) counts.set(id, counts.get(id) + 1);
    for (const body of testBodies(source)) {
      const lines = expandCalls(body, actions);
      for (const [id, shape] of bodyIds) if (lines.some((l) => lineUses(shape, l))) counts.set(id, counts.get(id) + 1);
    }
  }
  // `shared/` holds no journeys but it is where a project declares what its journeys import —
  // the `element` aliases above all (`T-1d`) — so its declarations count, its bodies do not.
  const shared = path.join(testsDir, 'shared');
  try {
    for (const entry of readdirSync(shared).sort()) {
      if (!isJourneyFile(entry)) continue;
      const source = uncommented(readFileSync(path.join(shared, entry), 'utf8'));
      for (const [id, s] of fileIds) if (s.file.test(source)) counts.set(id, counts.get(id) + 1);
    }
  } catch {
    // no shared/ directory: nothing declared there
  }
  const config = uncommented(configText);
  for (const [id, s] of FAMILY_SHAPES) {
    if (s.config) counts.set(id, (config.match(new RegExp(s.config.source, 'gm')) ?? []).length);
  }
  return counts;
}
