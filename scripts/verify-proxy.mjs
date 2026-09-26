#!/usr/bin/env node
// `S-3d` infrastructure (tflw-tests `PLAN_M239_DOGFOOD_EXPANSION.md`, decision 18) — tflw through a
// real HTTP proxy, the tinyproxy tenant under `ops/proxy` (`--profile proxy`), by SPEC §3.5's route:
// `NODE_USE_ENV_PROXY=1` and `HTTP_PROXY`. The corpus names the api by its compose service name,
// which this host cannot resolve, so a green run went through the proxy by construction.
//
// Two controls, so a green here cannot be something else: the same run without
// `NODE_USE_ENV_PROXY` must fail on the name (the proxy variable alone is not what routes it), and
// the proxy must refuse a host its filter does not name (it is not an open proxy).
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { urls } from './lib/stack-ports.mjs';
import { tflwArgv } from './lib/tflw-bin.mjs';

const TFLW_ARGV = tflwArgv('released', { label: 'verify-proxy' });
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROXY = urls().TFLW_PROXY_URL;
const CORPUS = 'tests/.env-specific/via-proxy.tflw';
let violations = 0;
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
};
const tail = (r) => `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').filter((l) => /✗|request failed|FAIL|PASS/.test(l)).slice(0, 8).join('\n');
const run = (env) =>
  spawnSync(TFLW_ARGV[0], [...TFLW_ARGV.slice(1), 'run', '--no-color', '--env', 'viaProxy', CORPUS], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, HTTP_PROXY: PROXY, http_proxy: PROXY, NO_PROXY: '', no_proxy: '', ...env },
  });

try {
  // `--no-deps`: the stack is already up, and letting compose reconcile the api here recreated it
  // under the phase's feet — the first run's two reds were a proxy asking a container that was
  // restarting.
  execSync('docker compose --profile proxy up -d --build --no-deps proxy', { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  // Ready means the api answers THROUGH the proxy, not that the proxy's port is open.
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    const r = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-x', PROXY, 'http://api:4001/v1/edge/via'], { encoding: 'utf8' });
    up = r.stdout === '200';
    if (!up) spawnSync('sleep', ['1']);
  }
  ok(`the api answers through the proxy at ${PROXY}`, up);

  const logs = () => spawnSync('docker', ['compose', '--profile', 'proxy', 'logs', '--no-log-prefix', 'proxy'], { cwd: ROOT, encoding: 'utf8' }).stdout ?? '';
  const tunnels = () => (logs().match(/Request \(file descriptor \d+\): CONNECT api:4001 /g) ?? []).length;
  const before = tunnels();
  const through = run({ NODE_USE_ENV_PROXY: '1' });
  ok('through the proxy, the corpus passes — the api answered by a name only the compose network resolves', through.status === 0, tail(through));
  // The proxy's own record, not tflw's. At least one tunnel — not one per request: the agent keeps
  // the tunnel alive and sends the corpus's three requests down it (measured: one `CONNECT`).
  const opened = tunnels() - before;
  ok(`and the proxy logged the tunnel it carried them in (${opened})`, opened >= 1, `${opened} \`CONNECT api:4001\` lines`);
  // A proxied plain GET is where `Via` is written, so the witness route reads it — the control that
  // a tunnel's missing `Via` is the tunnel's doing and not a proxy that never saw the request.
  const via = spawnSync('curl', ['-s', '-x', PROXY, 'http://api:4001/v1/edge/via'], { encoding: 'utf8' });
  ok('control: a proxied plain GET arrives with the proxy\'s Via', /tflw-proxy/.test(via.stdout), via.stdout);

  const direct = run({ NODE_USE_ENV_PROXY: '' });
  ok('control: without NODE_USE_ENV_PROXY the same run fails on the name', direct.status !== 0 && /ENOTFOUND|DNS/i.test(`${direct.stdout}${direct.stderr}`), tail(direct));

  const refused = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-x', PROXY, 'http://webv2/'], { encoding: 'utf8' });
  ok('control: the proxy refuses a host its filter does not name (403)', refused.stdout === '403', `got ${refused.stdout}`);
} finally {
  spawnSync('docker', ['compose', '--profile', 'proxy', 'rm', '-sf', 'proxy'], { cwd: ROOT });
}

if (violations > 0) {
  console.error(`\n${violations} proxy violation(s).`);
  process.exit(1);
}
console.log('\ntflw reaches the api through a real proxy, and only through it.');
