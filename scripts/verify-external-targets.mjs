#!/usr/bin/env node
// **Every host this repo can send a request to, and what each one is allowed to be used for.**
//
// Almost everything here targets our own stack — apiV2 on `:4001`, the TLS sidecar on `:8443`/`:8444`,
// the storefront on `:8090`, the admin console on `:8091`, all started by `./cli.mjs start`. Two other
// categories are safe by construction and are recognised rather than listed: RFC 2606 / RFC 6761
// reserved names (`.invalid`, `.test`, `.example`, `example.com`), which are guaranteed never to
// resolve and exist here precisely to prove refusal paths work; and loopback.
//
// **Exactly one real third-party host remains, and this file is its fence.** `tflw-acceptance/
// restful-booker/` targets a public QA-practice API we do not control (PLAN.md decision 41, chosen
// before apiV2 existed as "a more honest acceptance target than our own sample app"). The ruling
// recorded here is that it stays usable for **functional API tests** and for nothing else:
//
//   - **no load or performance runs** — it is somebody else's free sandbox, not a target to saturate
//   - **no security or vulnerability scans** — pointing a pentest tool at a host we do not own is not
//     ours to authorise, whatever a config says
//   - **not on CI, and not repeatedly** — a suite that runs on every push is traffic we are sending
//     to a stranger's server forever
//
// All three were already true when this file was written, and every one of them was true only by
// **omission**: nothing prevented somebody adding an `authorized target` line, or a `ramp to` clause,
// or a CI job. That is exactly the shape this repo keeps filing findings about — a property that
// holds because nobody has got round to breaking it is not a property, it is a coincidence. So each
// one is asserted.
//
// The `authorized target` check is the load-bearing one and it is **exact rather than a keyword
// guess**: tflw refuses every scan and every probe against an origin no `authorized target` affirms
// (`TF060`, D21 layer 2). So "this root declares no affirmation" is not evidence that scanning is
// unlikely — it is the mechanism that makes scanning impossible.
//
// And the general property, which matters more than the specific one: **a new external target
// anywhere in this repo fails this gate until somebody writes down what it is for.** The next
// third-party host to appear will not arrive announcing itself.

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Roots we walk looking for `tflw.config`. */
const SEARCH_ROOTS = ['tflw-acceptance', 'tests', 'examples'];

/** Hosts that are ours. `host.docker.internal` is the stack reaching back at a listener we started. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);

/** RFC 2606 / RFC 6761: reserved for documentation and testing, guaranteed never to resolve. A
 *  request to one of these cannot reach anybody, which is why the safety corpus uses them for the
 *  fixtures whose whole job is to be refused. */
const RESERVED_SUFFIXES = ['.invalid', '.test', '.example', '.localhost', '.local'];
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'];

/**
 * The one external target, its reason, and the fences that apply to it.
 *
 * `root` is a repo-relative directory. Adding an entry here is a deliberate act with a written
 * justification, which is the entire point — an external host that nobody had to argue for is the
 * failure this table exists to make impossible.
 */
const FENCED = [
  {
    root: 'tflw-acceptance/restful-booker',
    host: 'restful-booker.herokuapp.com',
    why: 'a public QA-practice API, kept as a functional-API-test leg against a surface we did not shape around tflw (PLAN.md decision 41)',
    allow: 'functional API tests, run by hand',
    forbid: ['load and performance runs are', 'security and vulnerability scans are', 'CI, and any repeated schedule, is'],
  },
];

/** Clauses that turn a `test` into a workload. A denylist, and the reason one is acceptable here is
 *  that it is the *second* fence rather than the only one: a load run is something a human invokes,
 *  so the binding check is "no npm script and no CI job names this root". This catches the file-level
 *  edit that would precede it. */
const WORKLOAD_CLAUSES = [/^\s*ramp to\b/m, /^\s*hold\b/m, /^\s*arrival rate\b/m, /^\s*iterations\b/m, /^\s*threshold\b/m, /^\s*shape\b/m];

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`✗ ${msg}`);
};

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    // `=== '.git'`, NOT `startsWith('.git')`. The first draft used the prefix and thereby skipped
    // `.github` — so the "not on CI" check below walked an empty list and passed unconditionally.
    // It was caught by deliberately violating the rule and watching the guard stay green, which is
    // the only way a vacuous check ever announces itself.
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

function classify(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return { kind: 'unparseable', host: url };
  }
  if (LOCAL_HOSTS.has(host)) return { kind: 'local', host };
  if (RESERVED_SUFFIXES.some((s) => host.endsWith(s)) || RESERVED_DOMAINS.includes(host)) return { kind: 'reserved', host };
  return { kind: 'external', host };
}

// `api "<url>"` and `api <name> "<url>"` — a service declaration. Deliberately NOT `stub`, whose URLs
// are intercepted in-process and never dialled, and not prose in a comment.
const API_BASE = /^\s*api(?:\s+[A-Za-z_][A-Za-z0-9_]*)?\s+"([^"]+)"/gm;

const files = await walk(repoRoot);
const configs = files.filter((f) => f.endsWith('tflw.config') && SEARCH_ROOTS.some((r) => relative(repoRoot, f).startsWith(r + '/')));

const externals = new Map(); // host -> Set of config paths
for (const cfg of configs) {
  const text = await readFile(cfg, 'utf8');
  for (const m of text.matchAll(API_BASE)) {
    const { kind, host } = classify(m[1]);
    if (kind !== 'external') continue;
    const rel = relative(repoRoot, cfg);
    if (!externals.has(host)) externals.set(host, new Set());
    externals.get(host).add(rel);
  }
}

// --- 1. every external target is declared -------------------------------------------------------

for (const [host, where] of externals) {
  const entry = FENCED.find((f) => f.host === host);
  if (!entry) {
    fail(
      `undeclared external target \`${host}\` in ${[...where].join(', ')}.\n` +
        `    This repo sends requests to hosts it owns. A third-party target needs an entry in\n` +
        `    scripts/verify-external-targets.mjs saying what it is for and what it may not be used for —\n` +
        `    at minimum: no load runs, no security scans, not on CI. Write the reason down, then add it.`,
    );
  }
}
if (externals.size === 0) console.log('✓ no external targets at all — every configured base is ours or reserved');

// --- 2. each declared one is fenced --------------------------------------------------------------

const ciFiles = files.filter((f) => relative(repoRoot, f).startsWith('.github/'));
const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
const scriptText = Object.entries(pkg.scripts ?? {})
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');

for (const entry of FENCED) {
  if (!externals.has(entry.host)) {
    // Not a pass. A fence over a target that no longer exists is a fence over nothing, and leaving it
    // here would let the next reader believe something is being checked.
    fail(`\`${entry.host}\` is fenced here but no config declares it any more — delete the entry, or the fence guards nothing`);
    continue;
  }

  const rootFiles = files.filter((f) => relative(repoRoot, f).startsWith(entry.root + '/'));
  const tflwFiles = rootFiles.filter((f) => f.endsWith('.tflw') || f.endsWith('tflw.config'));

  // (a) no affirmation -> tflw refuses every scan and probe against it (TF060, D21 layer 2)
  let affirmed = [];
  for (const f of tflwFiles) {
    const text = await readFile(f, 'utf8');
    if (/^\s*authorized target\b/m.test(text)) affirmed.push(relative(repoRoot, f));
  }
  if (affirmed.length > 0) {
    fail(
      `\`${entry.host}\` — ${affirmed.join(', ')} declares an \`authorized target\`.\n` +
        `    That single line is what lets a security scan run against this origin, and it is not ours to\n` +
        `    authorise: ${entry.forbid[1]} forbidden for this target. Remove it.`,
    );
  } else {
    console.log(`✓ ${entry.root} declares no \`authorized target\` — TF060 refuses every scan and probe against \`${entry.host}\``);
  }

  // (b) no workload clause
  let workloads = [];
  for (const f of tflwFiles.filter((x) => x.endsWith('.tflw'))) {
    const text = await readFile(f, 'utf8');
    if (WORKLOAD_CLAUSES.some((re) => re.test(text))) workloads.push(relative(repoRoot, f));
  }
  if (workloads.length > 0) {
    fail(`\`${entry.host}\` — ${workloads.join(', ')} carries a workload clause, and ${entry.forbid[0]} forbidden for this target`);
  } else {
    console.log(`✓ ${entry.root} declares no workload clause — it is a functional suite, not a load one`);
  }

  // (c) not on CI, and not reachable from an npm script
  const inCi = [];
  for (const f of ciFiles) {
    const text = await readFile(f, 'utf8');
    if (text.includes(entry.root) || text.includes(entry.host)) inCi.push(relative(repoRoot, f));
  }
  if (inCi.length > 0) {
    fail(`\`${entry.host}\` — named in ${inCi.join(', ')}, and ${entry.forbid[2]} forbidden for this target`);
  } else if (scriptText.includes(entry.root) || scriptText.includes(entry.host)) {
    fail(`\`${entry.host}\` — reachable from an npm script, which is one \`npm run\` away from a CI job; ${entry.forbid[2]} forbidden for this target`);
  } else {
    console.log(`✓ ${entry.root} is named in no workflow and no npm script — it runs only when a human runs it`);
  }
}

if (failures > 0) {
  console.log(`\n✗ external-target policy: ${failures} problem(s)`);
  process.exit(1);
}
console.log(`\n✓ external-target policy: ${externals.size} external target(s), all declared and fenced`);
