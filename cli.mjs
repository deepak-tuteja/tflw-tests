#!/usr/bin/env node
// Lifecycle wrapper for testFlow-tests' three plain-Node processes (api/core :4001,
// api/auth :4002, frontend :4000). No Docker — see PLAN.md's "Runtime" section.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PID_FILE = path.join(ROOT, '.testflow-tests.pids');

const SERVICES = [
  { name: 'core', script: 'api/core/server.js', port: 4001 },
  { name: 'auth', script: 'api/auth/server.js', port: 4002 },
  { name: 'frontend', script: 'frontend/server.js', port: 4000 },
];

function portInUse(port) {
  try {
    execSync(`lsof -i :${port} -t`, { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function readPids() {
  if (!fs.existsSync(PID_FILE)) return {};
  return JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
}

function start() {
  const pids = readPids();
  for (const svc of SERVICES) {
    if (portInUse(svc.port)) {
      console.log(`${svc.name}: already listening on :${svc.port}, skipping`);
      continue;
    }
    const child = spawn('node', [svc.script], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    pids[svc.name] = child.pid;
    console.log(`${svc.name}: started (pid ${child.pid}) on :${svc.port}`);
  }
  fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));
  console.log('\nFrontend: http://localhost:4000');
}

function stop() {
  const pids = readPids();
  for (const svc of SERVICES) {
    const pid = pids[svc.name];
    if (!pid) {
      console.log(`${svc.name}: no recorded pid, skipping`);
      continue;
    }
    try {
      process.kill(pid);
      console.log(`${svc.name}: stopped (pid ${pid})`);
    } catch {
      console.log(`${svc.name}: pid ${pid} not running`);
    }
  }
  fs.rmSync(PID_FILE, { force: true });
}

function status() {
  for (const svc of SERVICES) {
    console.log(`${svc.name} (:${svc.port}): ${portInUse(svc.port) ? 'running' : 'not running'}`);
  }
}

const cmd = process.argv[2];
if (cmd === 'start') start();
else if (cmd === 'stop') stop();
else if (cmd === 'status') status();
else {
  console.log('Usage: ./cli.mjs <start|stop|status>');
  process.exit(1);
}
