#!/usr/bin/env node
// Lifecycle wrapper for testFlow-tests v2's Dockerized stack (postgres + api on :4001).
// Wraps `docker compose` — see plan_v2.md Part A. Same CLI contract (start|stop|status)
// as the retired plain-Node version, so the testflow-tests-app skill keeps working.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ports, stackEnv } from './scripts/lib/stack-ports.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// `M197` (tflw `D1025`): the ports come from `scripts/lib/stack-ports.mjs` — offset by
// `TFLW_STACK_OFFSET`, exported as `TFLW_PORT_*` for `docker-compose.yml`'s `${…:-default}`
// bindings — so four stacks can run on one machine under `COMPOSE_PROJECT_NAME`s of their own.
const STACK = stackEnv();
const P = ports();

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...STACK } });
}

function start() {
  run('docker compose up -d --build --wait');
  const project = process.env.COMPOSE_PROJECT_NAME ? ` [${process.env.COMPOSE_PROJECT_NAME}, offset ${STACK.TFLW_STACK_OFFSET}]` : '';
  console.log(`\napi v2: http://localhost:${P.API}${project} (health /v1/health, docs /docs, spec /openapi.json)`);
  console.log(
    `tls sidecar: https://localhost:${P.TLS} (self-signed) · https://localhost:${P.MTLS} (mTLS — client ` +
      'cert required, see nginx/certs/ after start)',
  );
  // M137g's plant listener, announced only when it is actually there. Printing it unconditionally
  // would tell somebody running a clean stack that a broken-cipher host is up when 8445 is refusing
  // connections, and a banner nobody can trust is worse than one line shorter.
  if (process.env.VULN_MODE === '1') {
    console.log(`tls sidecar (VULN_MODE): https://localhost:${P.VULN_TLS} — V18, offers NULL-SHA256 alongside a modern suite`);
  }
  console.log(`webV2 storefront: http://localhost:${P.WEB} (browser-arc dogfood target)`);
  console.log(`webV2 admin console: http://localhost:${P.WEB_ADMIN} (SSR, full-page-nav dogfood target)`);
}

function stop() {
  // -v drops the postgres volume too: the isolation model is an ephemeral
  // per-run DB (plan_v2.md Part A), so every `start` begins from a clean database.
  run('docker compose down -v');
}

function status() {
  run('docker compose ps');
}

const cmd = process.argv[2];
if (cmd === 'start') start();
else if (cmd === 'stop') stop();
else if (cmd === 'status') status();
else {
  console.log('Usage: ./cli.mjs <start|stop|status>');
  process.exit(1);
}
