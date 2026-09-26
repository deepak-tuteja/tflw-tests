#!/usr/bin/env node
// `M195` S1 (tflw `PLAN_M195_REGRESSION_GAP.md`, `D1011`–`D1015`): `tflw ui` driven the way a person
// drives it, against this project with the stack up. `tflw ui` (tflw `M192`) had no phase at all —
// the sweep drove `run` in every mode, `watch`, `pick`, `migrate`, the check diagnostics and the CLI
// flags, and the page that runs `tflw run` as a child and streams it was exercised once, by hand, in
// `M192` U7. That hand run found three defects in the run's own artefacts (`M192-01`–`03`, closed by
// `M192b`), and this phase is where those three are graded from now on, so a regression in any of
// them reddens the sweep rather than waiting for the next person to open the page.
//
// WHAT IT DRIVES. The server's every route: the page's bundle (`/` — a 503 here means the vendored
// package shipped without `dist/ui`), `/api/project` (the files `tflw run` would discover, with
// their tests), `POST /api/run` (a `--tag smoke` run, then a two-file run), `/api/runs/<id>/events`
// (the stream, read the way the page reads it: every line the child wrote, then the server's `end`),
// `/api/runs`, `/api/runs/<id>/cancel`, `/api/reports`, and the kept directory the record names. It
// ends with SIGINT, the way `verify-watch.mjs` ends `tflw watch`.
//
// THE THREE GRADERS, one per closed row:
//   `M192-01`/`D1014` — the stream is written as it arrives, and the run's exit is the suite's
//     verdict: the whole `--format ndjson` run exits 0, every stdout line is one event, and the last
//     one is a `run:end`. (The defect needed ~512 MB of events to show; what is graded here is the
//     shape a streamed sink has and a joined string does not: `results.json`'s `total` equals what
//     the stream announced, and the stream's last line is the last file's end.)
//   `M192-02`/`D1013` — a hook's pair says it is a hook, and a consumer counts by the field: at every
//     prefix of the stream the tests ended never exceed the tests announced, and at the end the two
//     are equal. The control that keeps this from being vacuous: the two-file run includes files
//     with a `before file`, at least one pair in its stream carries `hook`, and counting the pairs
//     *without* excluding passing hooks would exceed the announcement — which is the 106-of-105 U7
//     saw.
//   `M192-03`/`D1015` — a run owns `report/` whole: the members a run writes only when it has
//     something to write (`findings.sarif`, `events.ndjson`, `assets/`) are planted stale before
//     the two-file run, and afterwards none of them is the planted one — `findings.sarif` is gone
//     (nothing in this suite scans), `assets/` is gone, `events.ndjson` starts with this run's own
//     `run:start`, and the kept copy has no `findings.sarif` either. Planted rather than produced
//     by a scan, because no file in the dogfood suite scans and a scan's `report/` in another
//     corpus root says nothing about this one; what the row filed was the survival, and survival
//     is what the plant measures.
//
// `report/runs/<id>/` entries this phase creates are removed at the end: `report/` is shared by every
// phase and the next phase's restart does not clear `runs/`.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTflw } from './lib/tflw-bin.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_ENTRY = resolveTflw('released', { label: 'verify-ui' }).entry;
const REPORT_DIR = path.join(ROOT, 'report');
// Two files with a `before file` (one `after file` too), API-only, so the D1013 control is real and
// the run is seconds. `hooks-explained.tflw` is `tests/examples/`' teaching file for exactly this.
const HOOK_FILES = ['tests/examples/hooks-explained.tflw', 'tests/api/admin/admin-moderation.tflw'];
const RUN_TIMEOUT_MS = 8 * 60 * 1000;

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

// ── the server ──────────────────────────────────────────────────────────────────────────────────

function startUi() {
  const child = spawn('node', [CLI_ENTRY, 'ui', '.', '--no-open', '--port', '0'], { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0' } });
  let out = '';
  child.stdout.on('data', (d) => (out += d.toString()));
  child.stderr.on('data', (d) => (out += d.toString()));
  let exitCode = null;
  const exited = new Promise((resolve) => child.on('exit', (code) => ((exitCode = code), resolve())));
  // tflw `M239` `A` (`D1316`): the printed URL carries the session token, and every request below
  // sends it the way the page does — `Authorization: Bearer` — read off that line and nowhere else.
  let token = '';
  return {
    output: () => out,
    token: () => token,
    async port(timeoutMs = 30000) {
      const start = Date.now();
      for (;;) {
        const m = /at http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/.exec(out);
        if (m) {
          token = m[2];
          TOKEN = m[2];
          return Number(m[1]);
        }
        if (exitCode !== null) throw new Error(`tflw ui exited ${exitCode} before listening:\n${out}`);
        if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for tflw ui to listen; output so far:\n${out}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    async stop() {
      child.kill('SIGINT');
      await Promise.race([exited, new Promise((r) => setTimeout(r, 15000))]);
      if (exitCode === null) child.kill('SIGKILL');
      return exitCode;
    },
  };
}

/** The token the running server printed — set by `startUi().port()`; every request carries it. */
let TOKEN = '';
const authed = (init = {}) => ({ ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${TOKEN}` } });

async function getJson(port, route) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, authed({ cache: 'no-store' }));
  if (!res.ok) throw new Error(`GET ${route}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function postJson(port, route, body) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, authed({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  if (!res.ok) throw new Error(`POST ${route}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** The stream, read as the page reads it (`packages/ui/src/api.ts` `subscribe`): every `data:` line
 * is one line the child wrote — an event when it parses, the child's noise when it does not — and
 * the server's `event: end` closes it. `onEvent` runs per event so a prefix invariant can be held
 * at every point of the stream rather than only at its end. */
function readStream(port, id, onEvent) {
  return new Promise((resolve, reject) => {
    const events = [];
    const noise = [];
    let buffered = '';
    const timer = setTimeout(() => reject(new Error(`run ${id}: no \`end\` within ${RUN_TIMEOUT_MS / 1000}s (${events.length} events so far)`)), RUN_TIMEOUT_MS);
    // `?token=`, not a header: an `EventSource` cannot set one, so the page sends the token this way
    // on both streams (tflw `D1316`) and this reader does what the page does.
    const req = http.get({ host: '127.0.0.1', port, path: `/api/runs/${encodeURIComponent(id)}/events?token=${encodeURIComponent(TOKEN)}` }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`events: ${res.statusCode}`));
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffered += chunk;
        let sep = buffered.indexOf('\n\n');
        while (sep !== -1) {
          const block = buffered.slice(0, sep);
          buffered = buffered.slice(sep + 2);
          let name = 'message';
          const data = [];
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) name = line.slice(7);
            else if (line.startsWith('data: ')) data.push(line.slice(6));
          }
          const payload = data.join('\n');
          if (name === 'end') {
            clearTimeout(timer);
            req.destroy();
            return resolve({ events, noise, end: JSON.parse(payload) });
          }
          try {
            const event = JSON.parse(payload);
            events.push(event);
            onEvent?.(event, events);
          } catch {
            noise.push(payload);
          }
          sep = buffered.indexOf('\n\n');
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

// ── the counting the page does, held independently ───────────────────────────────────────────────

/** Tests announced and tests ended, by tflw SPEC §13: `run:start.total` counts tests; a
 * `test:end` whose pair is a *passing* file hook (`hook` set, `result.ok`) is work, not a test. */
function tally(events) {
  let announced = 0;
  let done = 0;
  let pairs = 0;
  let hookPairs = 0;
  for (const e of events) {
    if (e.type === 'run:start') announced += e.total;
    if (e.type === 'test:end') {
      pairs += 1;
      if (e.hook) hookPairs += 1;
      if (!(e.hook && e.result.ok)) done += 1;
    }
  }
  return { announced, done, pairs, hookPairs };
}

function gradeStream(label, { events, noise, end }, prefixViolations) {
  const last = events[events.length - 1];
  const starts = events.filter((e) => e.type === 'run:start').length;
  const ends = events.filter((e) => e.type === 'run:end').length;
  const files = new Set(events.map((e) => e.file).filter(Boolean));
  const t = tally(events);
  ok(`[${label}] the server's \`end\` says done, exit 0 — the run's exit is the suite's verdict (D1014)`, end.status === 'done' && end.exitCode === 0, `status ${end.status}, exit ${end.exitCode}`);
  ok(`[${label}] every stdout line the child wrote is one event — no noise in a \`--format ndjson\` run`, noise.length === 0, `${noise.length} non-JSON line(s): ${noise.slice(0, 2).join(' | ').slice(0, 160)}`);
  ok(`[${label}] the stream's last line is a \`run:end\` — the sink was written to its end (D1014)`, last?.type === 'run:end', `last was ${last?.type}`);
  ok(`[${label}] one \`run:start\` and one \`run:end\` per file, ${files.size} file(s)`, starts === files.size && ends === files.size, `starts ${starts}, ends ${ends}, files ${files.size}`);
  ok(`[${label}] tests ended never exceeded tests announced at any point of the stream (D1013)`, prefixViolations.length === 0, `first at event #${prefixViolations[0]?.at}: ${prefixViolations[0]?.done} of ${prefixViolations[0]?.announced}`);
  ok(`[${label}] at the end, tests ended equals tests announced: ${t.done} of ${t.announced}`, t.done === t.announced && t.announced > 0);
  return t;
}

/** Holds D1013's invariant per event: `done <= announced` at every prefix. */
function prefixWatcher() {
  const violations = [];
  let announced = 0;
  let done = 0;
  return {
    violations,
    onEvent(e, events) {
      if (e.type === 'run:start') announced += e.total;
      if (e.type === 'test:end' && !(e.hook && e.result.ok)) done += 1;
      if (done > announced) violations.push({ at: events.length, done, announced });
    },
  };
}

/** The files `tflw run` discovers with no arguments (tflw `packages/cli/src/project.ts`): every
 * `.tflw` under the root, dot-directories and `node_modules` skipped, the config's `exclude` list
 * honoured — walked here independently so the page's list is graded against the rule, not against
 * a number. */
function discoverable(dir, exclude, rel = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (exclude.includes(relPath)) continue;
    if (e.isDirectory()) out.push(...discoverable(path.join(dir, e.name), exclude, relPath));
    else if (e.name.endsWith('.tflw')) out.push(relPath);
  }
  return out;
}

function configExcludes() {
  return [...readFileSync(path.join(ROOT, 'tflw.config'), 'utf8').matchAll(/^\s*exclude\s+"([^"]+)"/gm)].map((m) => m[1]);
}

function keptDirOf(end) {
  return end.kept ? path.join(ROOT, end.kept) : null;
}

function readResults(dir) {
  return JSON.parse(readFileSync(path.join(dir, 'results.json'), 'utf8'));
}

// ── the phase ────────────────────────────────────────────────────────────────────────────────────

const ui = startUi();
const keptDirs = [];
try {
  const port = await ui.port();
  ok('`tflw ui --no-open --port 0` listens on a free loopback port and says which', Number.isInteger(port) && port > 0);

  // The page itself. A 503 is the server's own message for a package shipped without the bundle.
  const page = await fetch(`http://127.0.0.1:${port}/?token=${TOKEN}`);
  const html = await page.text();
  ok('`/` serves the page (200, an HTML document titled tflw) — the vendored package ships `dist/ui`', page.status === 200 && /<title>tflw<\/title>/.test(html), `status ${page.status}: ${html.slice(0, 120)}`);

  // The project as the page sees it.
  const project = await getJson(port, '/api/project');
  const listed = new Set(project.files.map((f) => f.path));
  const expected = discoverable(ROOT, configExcludes()).sort();
  const listedSorted = [...listed].sort();
  ok(`\`/api/project\` lists exactly the files \`tflw run\` would discover — ${expected.length}`, JSON.stringify(listedSorted) === JSON.stringify(expected), `listed ${listed.size}, discoverable ${expected.length}; only-listed: ${listedSorted.filter((f) => !expected.includes(f)).slice(0, 3).join(', ')} only-discoverable: ${expected.filter((f) => !listed.has(f)).slice(0, 3).join(', ')}`);
  ok('`/api/project` names the two hook-carrying files this phase runs', HOOK_FILES.every((f) => listed.has(f)), HOOK_FILES.filter((f) => !listed.has(f)).join(', '));
  ok('`/api/project` reads the config: `local` is the default env, the report dir is the default `./report`', project.envs.some((e) => e.name === 'local' && e.isDefault) && project.reportDir === './report', `${JSON.stringify(project.envs)} ${project.reportDir}`);
  ok('every listed file parses (0 diagnostics) — the corpus `check` keeps clean is what the page shows', project.files.every((f) => f.diagnostics === 0), project.files.filter((f) => f.diagnostics > 0).map((f) => f.path).join(', '));
  const listedTests = project.files.reduce((n, f) => n + f.tests.length, 0);
  ok(`the listed files carry their tests — ${listedTests} across the project`, listedTests > project.files.length);

  // Run 1: the mixed sample, started through the page.
  const smoke = await postJson(port, '/api/run', { tags: ['smoke'] });
  ok('`POST /api/run { tags: [smoke] }` records the argv a terminal would get', JSON.stringify(smoke.argv) === JSON.stringify(['run', '--format', 'ndjson', '--no-color', '--tag', 'smoke']), JSON.stringify(smoke.argv));
  const smokeWatch = prefixWatcher();
  const smokeStarted = Date.now();
  const smokeStream = await readStream(port, smoke.id, smokeWatch.onEvent);
  console.log(`  [smoke] ${smokeStream.events.length} events in ${((Date.now() - smokeStarted) / 1000).toFixed(1)}s`);
  const smokeTally = gradeStream('smoke', smokeStream, smokeWatch.violations);
  const smokeKept = keptDirOf(smokeStream.end);
  if (smokeKept) keptDirs.push(smokeKept);
  ok('[smoke] the record names the kept directory, and it holds the run', smokeKept !== null && existsSync(path.join(smokeKept, 'results.json')), `kept ${smokeStream.end.kept}`);
  if (smokeKept) {
    const r = readResults(smokeKept);
    ok(`[smoke] the kept \`results.json\` agrees with the stream: ${r.total} tests, ok`, r.total === smokeTally.announced && r.ok === true, `results total ${r.total} ok ${r.ok}; stream announced ${smokeTally.announced}`);
  }

  // A cancel: the page's other gesture. Started and cancelled at once; the child handles SIGINT
  // and the server says `cancelled` from its own knowledge, not from the signal.
  const doomed = await postJson(port, '/api/run', { tags: ['smoke'] });
  const cancelled = await postJson(port, `/api/runs/${encodeURIComponent(doomed.id)}/cancel`, {});
  const doomedStream = await readStream(port, doomed.id);
  ok('`POST /api/runs/<id>/cancel` on a running run answers cancelled and the stream ends `cancelled`', cancelled.cancelled === true && doomedStream.end.status === 'cancelled', `${JSON.stringify(cancelled)} → ${doomedStream.end.status}`);
  if (doomedStream.end.kept) keptDirs.push(keptDirOf(doomedStream.end));

  // Plant the stale members `M192-03` found surviving, then run two files that write none of them.
  mkdirSync(path.join(REPORT_DIR, 'assets'), { recursive: true });
  const stale = { sarif: path.join(REPORT_DIR, 'findings.sarif'), asset: path.join(REPORT_DIR, 'assets', 'stale-verify-ui.png'), events: path.join(REPORT_DIR, 'events.ndjson') };
  writeFileSync(stale.sarif, JSON.stringify({ version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json', runs: [], stale: 'verify-ui' }));
  writeFileSync(stale.asset, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(stale.events, `${JSON.stringify({ type: 'run:start', total: 999, env: 'stale', stale: 'verify-ui' })}\n`);
  const before = await getJson(port, '/api/reports');
  // **`current` is a PROPERTY of a run, not an id** — tflw `M229` `E` (`D1254`), 2026-09-22. The
  // page's run list used to draw the newest run twice, because `keepReport` copies `report/` into
  // `report/runs/<id>` entry by entry and both were rows; it now carries `current: true` on the run
  // that holds it, and `id === 'current'` survives only when `report/` matches **no** kept run —
  // a `tflw run` in a terminal, or exactly the state the plant below creates.
  //
  // **This phase is what found the first version of that fold, and the row is worth keeping.** It
  // folded on `results.json` alone, which is the same *run* but not the same *evidence*: the plant
  // makes `report/` hold a `findings.sarif` its copy does not, and the fold closed the only window
  // `M192-03`'s grader has onto `report/`'s own members. tflw now folds only when the member lists
  // agree too — so the row marked `current` always describes the bytes in `report/`, folded or not,
  // and these two assertions are exactly as strong as when they named an id.
  const currentRow = (list) => list.find((e) => e.current === true);
  const current = currentRow(before);
  /* **`artefacts`, and it was `files` until tflw's `M232` (`D1271`)** — the rename crossed the
     repository boundary and this is the only thing on either side that reads that wire. `files`
     was true of two different lists (the artefacts in a report directory, and the `.tflw` files a
     run executed) and wrong about one of them, which is what `M213-19` was filed for; the sweep is
     what noticed, because nothing inside tflw consumes `/api/reports` from outside its own tree. */
  ok('the plant is visible to the page before the run: `/api/reports` lists `findings.sarif` on the run `report/` holds', current?.artefacts?.includes('findings.sarif') === true, JSON.stringify(current?.artefacts));
  ok('…and the plant makes it a row of its own, because a stale member is not the same evidence as its copy', current?.id === 'current', JSON.stringify(before.map((e) => e.id)));

  const two = await postJson(port, '/api/run', { files: HOOK_FILES });
  ok('`POST /api/run { files }` puts the files last in the argv', JSON.stringify(two.argv.slice(-2)) === JSON.stringify(HOOK_FILES), JSON.stringify(two.argv));
  const twoWatch = prefixWatcher();
  const twoStarted = Date.now();
  const twoStream = await readStream(port, two.id, twoWatch.onEvent);
  console.log(`  [two files] ${twoStream.events.length} events in ${((Date.now() - twoStarted) / 1000).toFixed(1)}s`);
  const twoTally = gradeStream('two files', twoStream, twoWatch.violations);
  ok('[two files] the control: at least one pair in the stream carries `hook` (D1013 is graded on a stream that has hooks)', twoTally.hookPairs > 0);
  ok(`[two files] the control: counting every pair would exceed the announcement — ${twoTally.pairs} pairs against ${twoTally.announced} tests — which is what the field prevents`, twoTally.pairs > twoTally.announced);
  const passingHook = twoStream.events.find((e) => e.type === 'test:end' && e.hook && e.result.ok);
  ok("[two files] a passing hook's `test:end` names its kind on the pair, not in the name", passingHook !== undefined && ['before file', 'after file'].includes(passingHook.hook), JSON.stringify(passingHook?.hook));
  const twoKept = keptDirOf(twoStream.end);
  if (twoKept) keptDirs.push(twoKept);

  // D1015: nothing planted survived the run.
  ok('[two files] `report/findings.sarif` is gone — a run that scanned nothing leaves no findings (D1015)', !existsSync(stale.sarif));
  ok('[two files] `report/assets/` is gone — a run that took no screenshot leaves no assets (D1015)', !existsSync(path.join(REPORT_DIR, 'assets')));
  const firstEventLine = existsSync(stale.events) ? readFileSync(stale.events, 'utf8').split('\n')[0] : '';
  const firstEvent = (() => {
    try {
      return JSON.parse(firstEventLine);
    } catch {
      return null;
    }
  })();
  ok("[two files] `report/events.ndjson` is this run's — its first line is a `run:start` without the plant's mark", firstEvent?.type === 'run:start' && firstEvent.stale === undefined, firstEventLine.slice(0, 120));
  ok('[two files] the kept copy has no `findings.sarif` either', twoKept !== null && !existsSync(path.join(twoKept, 'findings.sarif')), `kept ${twoStream.end.kept}`);
  const after = await getJson(port, '/api/reports');
  const currentAfter = currentRow(after);
  ok('[two files] `/api/reports` no longer lists `findings.sarif` on the run `report/` holds', currentAfter !== undefined && !currentAfter.artefacts.includes('findings.sarif'), JSON.stringify(currentAfter?.artefacts));
  // …and with the plant gone the two directories hold the same evidence again, so the list stops
  // drawing one run as two. The id it keeps is the kept run's, which is the addressable one.
  ok('[two files] the run and its copy have folded back into one row', currentAfter?.id !== 'current' && after.filter((e) => e.current === true).length === 1, JSON.stringify(after.map((e) => [e.id, e.current === true])));
  if (twoKept) {
    const r = readResults(twoKept);
    ok(`[two files] the kept \`results.json\` agrees with the stream: ${r.total} tests, ok`, r.total === twoTally.announced && r.ok === true, `results total ${r.total} ok ${r.ok}; stream announced ${twoTally.announced}`);
  }

  // The record of the session.
  const runs = await getJson(port, '/api/runs');
  const byId = new Map(runs.map((r) => [r.id, r]));
  ok('`/api/runs` lists the three runs with their final status', byId.get(smoke.id)?.status === 'done' && byId.get(doomed.id)?.status === 'cancelled' && byId.get(two.id)?.status === 'done', runs.map((r) => `${r.id}:${r.status}`).join(', '));

  const exitCode = await ui.stop();
  ok('Ctrl+C (SIGINT) stops `tflw ui` cleanly (exit 0 or 130)', exitCode === 0 || exitCode === 130, `exit ${exitCode}`);
} catch (error) {
  ok('the phase ran to its end', false, String(error?.stack ?? error).slice(0, 600));
  await ui.stop();
} finally {
  for (const dir of keptDirs) if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

if (violations > 0) {
  console.error(`\n${violations} tflw ui violation(s).`);
  process.exit(1);
}
console.log('\ntflw ui drives this project the way the page does, and the three M192 rows stay closed.');
