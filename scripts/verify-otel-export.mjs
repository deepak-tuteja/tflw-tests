#!/usr/bin/env node
// `S-4b` (tflw `M242` `F`, `D1331`) — `tflw export otlp` graded against a real OpenTelemetry
// Collector: the span tree that arrives is compared with the run's own `results.json`, so what is
// checked is what the collector received, not what tflw meant to send.
//
// Control: the same export pointed at a port nothing listens on must exit 1 and say so, so a green
// here cannot be an exporter that exits 0 without sending.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quoteArgv, tflwArgv } from './lib/tflw-bin.mjs';

const TFLW_ARGV = tflwArgv('released', { label: 'verify-otel-export' });
const TFLW = quoteArgv(TFLW_ARGV);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'report', 'otel');
const PORT = process.env.TFLW_PORT_OTEL ?? '4318';
let violations = 0;
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
};
const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
try {
  sh('docker compose --profile otel up -d otel-collector');
  // The collector answers once its receiver is bound; poll the port rather than sleep a guess.
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    up = spawnSync('curl', ['-s', '-o', '/dev/null', '-X', 'POST', '-H', 'content-type: application/json', '-d', '{}', `http://127.0.0.1:${PORT}/v1/traces`]).status === 0;
    if (!up) spawnSync('sleep', ['1']);
  }
  ok('the collector is listening', up);

  const run = spawnSync(TFLW_ARGV[0], [...TFLW_ARGV.slice(1), 'run', 'tests/.constructs/language-m242.tflw', '--no-color'], { cwd: ROOT, encoding: 'utf8' });
  ok('the run it exports passed', run.status === 0, (run.stdout ?? '').trim().split('\n').pop());
  const results = JSON.parse(readFileSync(path.join(ROOT, 'report', 'results.json'), 'utf8'));

  const exp = spawnSync(TFLW_ARGV[0], [...TFLW_ARGV.slice(1), 'export', 'otlp', '--endpoint', `http://127.0.0.1:${PORT}/v1/traces`], { cwd: ROOT, encoding: 'utf8' });
  ok('`tflw export otlp` exits 0 and names what it sent', exp.status === 0 && /exported \d+ spans \(one trace\)/.test(exp.stdout), `${exp.status}: ${exp.stdout}${exp.stderr}`);

  // The file exporter flushes on its own schedule; wait for the line rather than assume it.
  const file = path.join(OUT, 'traces.json');
  let doc = null;
  for (let i = 0; i < 30 && !doc; i++) {
    if (existsSync(file) && readFileSync(file, 'utf8').trim()) doc = JSON.parse(readFileSync(file, 'utf8').trim().split('\n').pop());
    else spawnSync('sleep', ['1']);
  }
  ok('the collector wrote what it received', doc !== null);
  const spans = (doc?.resourceSpans ?? []).flatMap((r) => r.scopeSpans ?? []).flatMap((s) => s.spans ?? []);
  const byName = (n) => spans.filter((s) => s.name === n);
  const roots = spans.filter((s) => !s.parentSpanId);
  ok('one root, the run', roots.length === 1 && roots[0].name === 'tflw run', roots.map((s) => s.name).join(', '));
  const tests = results.tests.map((t) => t.name);
  ok(`a span for every test in results.json (${tests.length})`, tests.every((n) => byName(n).length === 1), tests.filter((n) => byName(n).length !== 1).join(', '));
  const stepCount = results.tests.reduce((n, t) => n + (t.steps?.length ?? 0), 0);
  ok(`and one per step (${stepCount})`, spans.length === 1 + new Set(results.tests.map((t) => t.file)).size + tests.length + stepCount, `${spans.length} spans`);
  const skipped = results.tests.find((t) => t.skipped);
  const skipSpan = skipped ? byName(skipped.name)[0] : undefined;
  ok('the skipped test arrived as skipped, not failed', skipSpan?.attributes?.some((a) => a.key === 'tflw.outcome' && a.value?.stringValue === 'skipped') === true);

  const dead = spawnSync(TFLW_ARGV[0], [...TFLW_ARGV.slice(1), 'export', 'otlp', '--endpoint', 'http://127.0.0.1:9/v1/traces'], { cwd: ROOT, encoding: 'utf8' });
  ok('control: an export to nothing exits 1 and says it could not be reached', dead.status === 1 && /could not be reached/.test(dead.stderr), `${dead.status}: ${dead.stderr}`);
} finally {
  spawnSync('docker', ['compose', '--profile', 'otel', 'rm', '-sf', 'otel-collector'], { cwd: ROOT });
}

if (violations > 0) {
  console.error(`\n${violations} OTLP export violation(s).`);
  process.exit(1);
}
console.log('\n`tflw export otlp` delivers the run to a real collector, span for span.');
