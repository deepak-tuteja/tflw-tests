#!/usr/bin/env node
// Lifecycle wrapper for testFlow-tests v2's Dockerized stack (postgres + api on :4001).
// Wraps `docker compose` — see plan_v2.md Part A. Same CLI contract (start|stop|status)
// as the retired plain-Node version, so the testflow-tests-app skill keeps working.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function start() {
  run('docker compose up -d --build --wait');
  console.log('\napi v2: http://localhost:4001 (health /v1/health, docs /docs, spec /openapi.json)');
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
