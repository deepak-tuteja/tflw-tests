#!/usr/bin/env node
// tflw `M249` `D` (`D1370`) / this repo's `T-3`: `tflw doctor` against this project, under the four
// envs whose facts differ in the ways doctor reports — the plain stack, the TLS sidecar, the mTLS
// sidecar with a client certificate, and the proxy env — plus the refusal it owes a directory with
// no config. Doctor is offline by decision, so this needs no stack: every assertion is about what
// the config resolves to and what this machine has installed, which is exactly its claim.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tflwArgv } from './lib/tflw-bin.mjs';
import { urls } from './lib/stack-ports.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [NODE, ...TFLW] = tflwArgv('released', { label: 'verify-doctor' });
const U = urls();

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

function doctor(args, { cwd = ROOT, env = {} } = {}) {
  const r = spawnSync(NODE, [...TFLW, 'doctor', '--json', ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  let report = null;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    // left null: the assertions below say what was expected
  }
  return { status: r.status, report, out: `${r.stdout}${r.stderr}` };
}

// 1. The plain stack: the api base this worker's ports put it on, a clean bill, the suite's size.
{
  const { status, report, out } = doctor(['--env', 'local']);
  ok('local: doctor exits 0 on this project', status === 0, out.slice(0, 600));
  ok('local: the api base is the one this worker\'s stack answers on', report?.services?.[''] === U.TFLW_API_BASE, JSON.stringify(report?.services));
  ok('local: certificates verified, no client certificate', report?.tls?.line === 'certificates verified; no client certificate', report?.tls?.line);
  ok('local: the suite is counted, and some of it drives a browser', report?.suite?.files > 50 && report?.suite?.browserTests > 0, JSON.stringify(report?.suite));
  ok('local: the browsers line names chromium, which the sweep downloads', /chromium/.test(report?.browsers?.line ?? ''), report?.browsers?.line);
}

// 2. The TLS sidecar: `insecure true`, said as loudly as the env means it.
{
  const { report } = doctor(['--env', 'secureLocal']);
  ok('secureLocal: the https base', report?.services?.[''] === U.TFLW_TLS_BASE, JSON.stringify(report?.services));
  ok('secureLocal: insecure is reported as certificates NOT verified', /^insecure true — certificates are NOT verified/.test(report?.tls?.line ?? ''), report?.tls?.line);
}

// 3. The mTLS sidecar: the client certificate it presents, and that it is on disk.
{
  const { report } = doctor(['--env', 'mtlsSidecar']);
  ok('mtlsSidecar: the client certificate is named', report?.tls?.clientCert?.cert === 'nginx/certs/client.pem', JSON.stringify(report?.tls));
  ok('mtlsSidecar: and it is on disk (the compose stack\'s own cert)', report?.tls?.clientCert?.onDisk === true, JSON.stringify(report?.tls?.clientCert));
}

// 4. The proxy env, run the way `proxy-check` runs it: doctor names the variables and whether Node reads them.
{
  const on = doctor(['--env', 'viaProxy'], { env: { HTTP_PROXY: U.TFLW_PROXY_URL, NODE_USE_ENV_PROXY: '1' } });
  ok('viaProxy: HTTP_PROXY is named, and NODE_USE_ENV_PROXY=1 is seen', /HTTP_PROXY.*NODE_USE_ENV_PROXY=1 \(it is\)/.test(on.report?.proxy?.line ?? ''), on.report?.proxy?.line);
  const off = doctor(['--env', 'viaProxy'], { env: { HTTP_PROXY: U.TFLW_PROXY_URL, NODE_USE_ENV_PROXY: '' } });
  ok('viaProxy control: the same variable without NODE_USE_ENV_PROXY is reported as not read', /\(it is not\)/.test(off.report?.proxy?.line ?? ''), off.report?.proxy?.line);
}

// 5. The refusals: no config is exit 1 with its remedy; an env the config does not declare is usage.
{
  const scratch = mkdtempSync(path.join(tmpdir(), 'tflw-doctor-'));
  try {
    const none = doctor([], { cwd: scratch });
    ok('no config: exit 1', none.status === 1, none.out.slice(0, 400));
    ok('no config: the problem names `tflw init`', /no tflw\.config in .* — run `tflw init` here/.test(none.report?.problems?.[0] ?? ''), JSON.stringify(none.report?.problems));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  const bad = doctor(['--env', 'nosuchenv']);
  ok('an undeclared --env is a usage error (exit 2), not a doctor failure', bad.status === 2, bad.out.slice(0, 300));
}

// 6. tflw `M267` (`D1431`, `D1432`): doctor makes the checks `run` makes. For every env this project
//    declares, doctor's `checks` agree with `tflw check --env <env>`'s exit code — whatever that
//    code is, since the claim is the agreement and not that every env is clean.
{
  const all = doctor(['--all-envs']);
  const envs = all.report?.envs ?? [];
  ok('--all-envs: one row per declared env', envs.length >= 4 && envs.some((e) => e.name === 'local'), JSON.stringify(envs.map((e) => e.name)));
  ok('--all-envs: exit 1 exactly when some env cannot run', all.status === (envs.every((e) => e.ok) ? 0 : 1), `exit ${all.status}`);
  const disagree = [];
  for (const { name, ok: rowOk } of envs) {
    const one = doctor(['--env', name]);
    const check = spawnSync(NODE, [...TFLW, 'check', '--env', name], { cwd: ROOT, encoding: 'utf8' });
    const clean = (one.report?.checks?.errors ?? -1) === 0;
    if (clean !== (check.status === 0)) disagree.push(`${name}: doctor ${one.report?.checks?.errors} error(s), check exit ${check.status}`);
    if (rowOk !== one.report?.ok) disagree.push(`${name}: --all-envs says ${rowOk}, --env says ${one.report?.ok}`);
  }
  ok(`every env (${envs.length}): doctor's checks agree with \`tflw check --env\`, and --all-envs with --env`, disagree.length === 0, disagree.join('; '));
}

// 7. `D1433`: the engine `run --browser` would launch is the one that must be downloaded.
{
  const { report } = doctor(['--env', 'local', '--browser', 'webkit']);
  const missing = !(report?.browsers?.installed ?? []).includes('webkit');
  ok('--browser webkit: the engine named is the one judged', report?.browsers?.engine === 'webkit', JSON.stringify(report?.browsers));
  ok(
    `--browser webkit: a problem exactly when webkit is not downloaded (it ${missing ? 'is not' : 'is'})`,
    missing === (report?.problems ?? []).some((p) => /webkit, the engine `tflw run` --browser webkit launches, is not downloaded/.test(p)),
    JSON.stringify(report?.problems),
  );
}

// 8. `D1435`, `D1436`: a `.env` git would commit is a warning, and a warning leaves the exit at 0.
{
  const scratch = mkdtempSync(path.join(tmpdir(), 'tflw-doctor-env-'));
  try {
    writeFileSync(path.join(scratch, 'tflw.config'), 'env local default\n  api "http://127.0.0.1:9/v1"\n');
    writeFileSync(path.join(scratch, 'a.tflw'), 'test "t"\n  api GET /health\n  expect status equals 200\n');
    writeFileSync(path.join(scratch, '.env'), 'TOKEN=x\n');
    spawnSync('git', ['init', '-q'], { cwd: scratch });
    const exposed = doctor([], { cwd: scratch });
    ok('.env not ignored: a warning, and exit 0', exposed.status === 0 && (exposed.report?.warnings ?? []).some((w) => /^`\.env` is not ignored by git/.test(w)), `${exposed.status} ${JSON.stringify(exposed.report?.warnings)}`);
    writeFileSync(path.join(scratch, '.gitignore'), '.env\n');
    const ignored = doctor([], { cwd: scratch });
    ok('.env ignored: no warning', !(ignored.report?.warnings ?? []).some((w) => /\.env/.test(w)), JSON.stringify(ignored.report?.warnings));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (violations > 0) {
  console.error(`\n${violations} doctor proof violation(s).`);
  process.exit(1);
}
console.log('\n`tflw doctor` reports this project\'s envs as they resolve, agrees with `tflw check` under every one, and refuses a directory with no config.');
