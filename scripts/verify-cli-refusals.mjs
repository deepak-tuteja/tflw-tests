#!/usr/bin/env node
// tflw `M239` (`D1276`–`D1279`; this repo's `PLAN_M239_DOGFOOD_EXPANSION.md` `S-1c`): the CLI's
// refusals, planted — the same "script it, don't trust a one-time manual check forever" reasoning
// as every other `*-check` phase, pointed at the things tflw is supposed to say NO to.
//
// Three subjects, one phase:
//
//   1. **The page's boundary.** tflw's enterprise-readiness review forged three requests against a
//      running `tflw ui` by hand and each was answered; this sends the whole set — a foreign
//      `Origin`, a foreign `Host`, no token, a cookie where a header is required, a `text/plain`
//      body, `files` outside the project, a symlink out of it, `?trace=` outside `report/` — and
//      asserts the status each gets. **And beside every refusal, the control**: the same request
//      with the token and the right headers is accepted, so a green here is a verdict about the
//      boundary and not a server that refuses everything.
//   2. **`tflw fmt --check`** is red on a planted unformatted file and names it, and green on a
//      formatted one from the real corpus.
//   3. **`tflw migrate`** rewrites a planted deprecation (`scenario` → `test`), and its second run
//      over the same file is a no-op — the mutating assertion `verify-migrate.mjs`'s own header
//      said would exist "the day tflw ships its first deprecation", against a copy so the real
//      suite's no-op proof stays what it is.
//
// `released`, like `verify-ui.mjs`: the page and the commands are what a user installs. No stack,
// no browser; the one run this starts is cancelled at once.

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTflw } from './lib/tflw-bin.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_ENTRY = resolveTflw('released', { label: 'verify-cli-refusals' }).entry;

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

// ── the server, as `verify-ui.mjs` starts it ─────────────────────────────────────────────────────

function startUi() {
  const child = spawn('node', [CLI_ENTRY, 'ui', '.', '--no-open', '--port', '0'], { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0' } });
  let out = '';
  child.stdout.on('data', (d) => (out += d.toString()));
  child.stderr.on('data', (d) => (out += d.toString()));
  let exitCode = null;
  const exited = new Promise((resolve) => child.on('exit', (code) => ((exitCode = code), resolve())));
  return {
    output: () => out,
    async start(timeoutMs = 30000) {
      const started = Date.now();
      for (;;) {
        const m = /at http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/.exec(out);
        if (m) return { port: Number(m[1]), token: m[2] };
        if (exitCode !== null) throw new Error(`tflw ui exited ${exitCode} before listening:\n${out}`);
        if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for tflw ui to listen; output so far:\n${out}`);
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

/** A raw request, for the one header `fetch` refuses to send on our behalf (`Host`). */
function raw(port, { method = 'GET', path: p = '/', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text, headers: res.headers }));
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

const tflw = (args, cwd = ROOT) => {
  const r = spawnSync(process.execPath, [CLI_ENTRY, ...args], { cwd, encoding: 'utf8', shell: false, env: { ...process.env, FORCE_COLOR: '0' } });
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

// ── 1. the page's boundary ───────────────────────────────────────────────────────────────────────

const ui = startUi();
const outside = mkdtempSync(path.join(tmpdir(), 'tflw-refusals-'));
const link = path.join(ROOT, 'zz-refusal-link.tflw');
let started = null;
try {
  const { port, token } = await ui.start();
  ok('`tflw ui` prints a URL that carries this session\'s token', token.length >= 32, `token ${token.length} chars`);
  const base = `http://127.0.0.1:${port}`;
  const bearer = { authorization: `Bearer ${token}` };
  const json = { 'content-type': 'application/json' };
  const body = async (res) => { try { return await res.json(); } catch { return {}; } };

  // The page itself.
  const bare = await fetch(`${base}/`);
  ok('`GET /` with no token is 401, and the page it serves names the way in', bare.status === 401 && /tflw ui<\/code> printed/.test(await bare.text()), `status ${bare.status}`);
  const page = await fetch(`${base}/?token=${token}`);
  const csp = page.headers.get('content-security-policy') ?? '';
  ok('`GET /?token=…` is the page, under a Content-Security-Policy with a nonce, nosniff and no-referrer', page.status === 200 && /script-src 'self' 'nonce-/.test(csp) && page.headers.get('x-content-type-options') === 'nosniff' && page.headers.get('referrer-policy') === 'no-referrer', `status ${page.status}; csp ${csp.slice(0, 80)}`);

  // The forgeries, each with its control.
  const noToken = await fetch(`${base}/api/project`);
  ok('no token → 401 on `/api/project`', noToken.status === 401, `status ${noToken.status}`);
  const withToken = await fetch(`${base}/api/project`, { headers: bearer });
  ok('  …and the control: with the token it is 200', withToken.status === 200, `status ${withToken.status}`);

  const cookieOnly = await fetch(`${base}/api/pick?path=tests/examples/hooks-explained.tflw`, { headers: { cookie: `tflw-ui-token=${token}` } });
  ok('the cookie alone → 401 on `GET /api/pick` (a same-site `<img src>` must not start a browser)', cookieOnly.status === 401, `status ${cookieOnly.status}`);

  const foreignOrigin = await fetch(`${base}/api/run`, { method: 'POST', headers: { ...bearer, ...json, origin: 'https://evil.example' }, body: '{}' });
  ok('a foreign `Origin` → 403 on `POST /api/run`, token or not', foreignOrigin.status === 403, `status ${foreignOrigin.status}`);
  const ownOrigin = await fetch(`${base}/api/runs`, { headers: { ...bearer, origin: `http://127.0.0.1:${port}` } });
  ok('  …and the control: the page\'s own origin is accepted', ownOrigin.status === 200, `status ${ownOrigin.status}`);

  const foreignHost = await raw(port, { path: '/api/project', headers: { ...bearer, host: 'evil.example' } });
  ok('a foreign `Host` → 421 (DNS rebinding)', foreignHost.status === 421, `status ${foreignHost.status}`);
  const forwardedHost = await raw(port, { path: '/api/project', headers: { ...bearer, host: '127.0.0.1:9000' } });
  ok('  …and the control: a loopback `Host` on another port is accepted — `ssh -L` with a different local port keeps working', forwardedHost.status === 200, `status ${forwardedHost.status}`);

  const plain = await fetch(`${base}/api/run`, { method: 'POST', headers: { ...bearer, 'content-type': 'text/plain' }, body: 'not json' });
  ok('a `text/plain` body → 415 before it is read', plain.status === 415, `status ${plain.status}`);

  const up = await fetch(`${base}/api/run`, { method: 'POST', headers: { ...bearer, ...json }, body: JSON.stringify({ files: ['../x.tflw'] }) });
  ok('`files: ["../x.tflw"]` → 400 naming the entry', up.status === 400 && /`\.\.\/x\.tflw`/.test((await body(up)).error ?? ''), `status ${up.status}`);

  writeFileSync(path.join(outside, 'outside.tflw'), 'test "outside"\n  api GET /health\n', 'utf8');
  symlinkSync(path.join(outside, 'outside.tflw'), link);
  const linked = await fetch(`${base}/api/run`, { method: 'POST', headers: { ...bearer, ...json }, body: JSON.stringify({ files: ['zz-refusal-link.tflw'] }) });
  ok('a symlink out of the project → 400 (judged after realpath)', linked.status === 400 && /outside the project/.test((await body(linked)).error ?? ''), `status ${linked.status}`);
  rmSync(link, { force: true });

  const badTrace = await fetch(`${base}/trace/index.html?trace=${encodeURIComponent('http://127.0.0.1/tflw.config')}`, { headers: bearer });
  ok('`?trace=` naming anything but a report file → 400', badTrace.status === 400, `status ${badTrace.status}`);
  const goodTrace = await fetch(`${base}/trace/index.html?trace=${encodeURIComponent(`${base}/api/reports/current/trace.zip`)}`, { headers: bearer });
  ok('  …and the control: a report file of this project is not refused by that rule', goodTrace.status !== 400, `status ${goodTrace.status}`);

  // The control for the run route itself: a well-formed request is accepted — then cancelled.
  const accepted = await fetch(`${base}/api/run`, { method: 'POST', headers: { ...bearer, ...json }, body: JSON.stringify({ files: ['tests/examples/hooks-explained.tflw'] }) });
  started = accepted.status === 202 ? await body(accepted) : null;
  ok('a well-formed `POST /api/run` with the token is 202', accepted.status === 202, `status ${accepted.status}`);
  if (started) {
    const cancelled = await fetch(`${base}/api/runs/${encodeURIComponent(started.id)}/cancel`, { method: 'POST', headers: bearer });
    ok('  …and a bodiless cancel with the token is 200 — no content type needed for no body', cancelled.status === 200, `status ${cancelled.status}`);
  }

  const exitCode = await ui.stop();
  ok('Ctrl+C stops `tflw ui` cleanly', exitCode === 0 || exitCode === 130, `exit ${exitCode}`);
} catch (error) {
  ok('the page half ran to its end', false, String(error?.stack ?? error).slice(0, 600));
  await ui.stop();
} finally {
  rmSync(link, { force: true });
  rmSync(outside, { recursive: true, force: true });
}

// ── 2. `fmt --check` ─────────────────────────────────────────────────────────────────────────────

const UNFORMATTED = 'tests/.checkonly/fmt/unformatted.tflw';
// `fmt` takes `--check` and paths and nothing else — it prints file names, never colour — so
// `--no-color` here was a forgery of the kind section 1 makes on purpose (exit 2, unknown flag).
const red = tflw(['fmt', '--check', UNFORMATTED]);
ok('`fmt --check` on a planted unformatted file exits 1 and names it', red.code === 1 && red.out.includes(UNFORMATTED), `exit ${red.code}: ${red.out.trim().split('\n')[0]}`);
ok('  …and writes nothing: the plant is still unformatted afterwards', /\n {4}api GET/.test(readFileSync(path.join(ROOT, UNFORMATTED), 'utf8')));
const green = tflw(['fmt', '--check', 'tests/examples/hooks-explained.tflw']);
ok('  …and the control: a formatted file from the real corpus exits 0', green.code === 0, `exit ${green.code}: ${green.out.trim().split('\n')[0]}`);

// ── 3. `migrate` on a planted deprecation, against a copy ────────────────────────────────────────

const scratch = mkdtempSync(path.join(tmpdir(), 'tflw-migrate-'));
try {
  writeFileSync(path.join(scratch, 'tflw.config'), 'env local default\n  api "http://127.0.0.1:9/v1"\n', 'utf8');
  copyFileSync(path.join(ROOT, 'tests', '.checkonly', 'migrate', 'deprecated.tflw'), path.join(scratch, 'deprecated.tflw'));
  const first = tflw(['migrate', '--no-color'], scratch);
  const after = readFileSync(path.join(scratch, 'deprecated.tflw'), 'utf8');
  // Anchored to a line start: the plant's own header names `scenario` four times in prose, and a
  // migration that rewrote comments would be the defect, not the proof.
  ok('`migrate` rewrites a planted `scenario` to `test` and says it migrated one file', /migrated 1 file/.test(first.out) && /^test "legacy"/m.test(after) && !/^scenario/m.test(after), `exit ${first.code}: ${first.out.trim().split('\n')[0]}`);
  const second = tflw(['migrate', '--no-color'], scratch);
  ok('  …and its second run over the same file is a no-op', /nothing to migrate/.test(second.out) && readFileSync(path.join(scratch, 'deprecated.tflw'), 'utf8') === after, `exit ${second.code}: ${second.out.trim().split('\n')[0]}`);
  ok('  …and the migrated file checks clean', tflw(['check', '--no-color', 'deprecated.tflw'], scratch).code === 0);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
ok('the plant in the tree is untouched — `migrate` ran against a copy', existsSync(path.join(ROOT, 'tests', '.checkonly', 'migrate', 'deprecated.tflw')) && /^scenario "legacy"/m.test(readFileSync(path.join(ROOT, 'tests', '.checkonly', 'migrate', 'deprecated.tflw'), 'utf8')));

if (violations > 0) {
  console.error(`\n${violations} refusal(s) not made, or control(s) not accepted.`);
  process.exit(1);
}
console.log('\ntflw refuses what it should and accepts the control beside each refusal.');
