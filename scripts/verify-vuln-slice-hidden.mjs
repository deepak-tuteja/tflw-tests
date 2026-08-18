#!/usr/bin/env node
// M137e (testFlow PLAN_M137_PENTEST_TIER4.md, D438) — the half of the guard rail
// `verify-security-target.mjs` structurally cannot check: that the fixture slice is **absent** from
// the stack this suite normally runs against.
//
// WHY THIS IS A SEPARATE SCRIPT AND NOT A SECTION OVER THERE. Both scripts ask about the same four
// controllers, and folding them together is the obvious tidier arrangement — right up until you
// notice that they need *opposite stacks*. `regression.mjs` runs `security-target-check` under
// `stackEnv: { VULN_MODE: '1' }`, which is what makes its assertions possible; the claim here is
// only meaningful against a stack started **without** the flag, which is the default every other
// phase already uses. One script cannot see both, and a flag telling it which half to run would put
// the two claims one CLI argument away from each other with nothing checking that both got made.
//
// WHY THE CLAIM MATTERS AT ALL, given that `vuln.module.ts` is imported conditionally and has been
// since M128a. Until M137e it was true and cheap: the whole slice was `@ApiExcludeController()`, so
// nothing could describe it and nothing could route to it without the flag, and either half failing
// would have failed loudly. `M137e` narrows that. `VulnReportsController` is deliberately **not**
// excluded — a crawler reading `/openapi.json` has to be able to find it, which is D437's whole
// enumeration plant — and the argument for why that is safe (D438) is precisely that the route
// exists only under `VULN_MODE=1`. An argument load-bearing enough to override a standing exclusion
// is one worth having a test for, because the thing that would break it is not exotic: a stray
// import in `app.module.ts`, a `VulnModule` pulled in by another module for its repository, a
// compose file that starts passing the variable through.
//
// **The failure this prevents is silent in both directions.** A leaked fixture route would put a
// documented, deliberately-broken, authorization-free collection endpoint into the surface ~45 other
// files run against — and no test in this repo asserts that route is missing, so every one of them
// would stay green. In the other direction it would make `/openapi.json` vary by environment, which
// is the exact consequence `vuln.controller.ts:24-27` gives as the exclusion's reason for existing.
//
// Run it against a stack started WITHOUT the fixture slice — i.e. the ordinary one:
//
//     node cli.mjs start
//     node scripts/verify-vuln-slice-hidden.mjs
//
// The absence of `VULN_MODE` is checked first and reported as a setup error rather than as a wall of
// failing assertions, for the reason its sibling gives: "the slice is present" and "the slice is
// wrong" are different problems with different fixes, and here the first one would fail *every*
// assertion below and say nothing about which.
import { readdirSync, readFileSync } from 'node:fs';
import { connect as tlsConnect } from 'node:tls';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANTS, assertClaims, plantsFor } from './lib/plants.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const API_BASE = 'http://localhost:4001/v1';
const DOC_URL = 'http://localhost:4001/openapi.json';

let failures = 0;
let checks = 0;

function ok(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    console.error(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function die(msg) {
  console.error(`\n\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(2);
}

/**
 * Every route the fixture slice declares, read off the controllers themselves.
 *
 * Derived rather than listed, and the direction of the coupling is the point: a fifth fixture
 * controller is covered by this script the moment it exists, with no line here to remember. Its
 * sibling keeps a hand-maintained list because it also asserts *behaviour* per route, which cannot
 * be derived from a decorator — but "does this 404" can be, so it is.
 *
 * The directory scan is safe here in a way `verify-security-target.mjs` argued it would not be over
 * there: this script's only verb is "assert absent", so a file it picks up by accident can make it
 * fail but can never make it pass on less than it should.
 */
function fixtureRoutes() {
  const dir = path.join(ROOT, 'apiV2/src/vuln');
  const routes = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.controller.ts')).sort()) {
    const src = readFileSync(path.join(dir, file), 'utf8');
    const prefix = /@Controller\('([^']+)'\)/.exec(src)?.[1];
    if (!prefix) {
      ok(`${file} declares a @Controller prefix`, false);
      continue;
    }
    for (const m of src.matchAll(/@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)/g)) {
      const method = m[1].toUpperCase();
      // A path parameter is left as its literal template segment. Express matches a parameterised
      // route whatever the segment says, so on a stack that *has* the slice this would reach the
      // guard and answer 401 — and on one that does not it answers 404 either way. The distinction
      // this script draws survives not knowing a real id, so it does not manufacture one.
      const suffix = m[2] ? `/${m[2]}` : '';
      routes.push({ method, route: `/${prefix}${suffix}` });
    }
  }
  return routes;
}

async function send(method, route) {
  try {
    return await fetch(`${API_BASE}${route}`, { method, redirect: 'manual' });
  } catch (err) {
    die(
      `${method} ${API_BASE}${route} — ${err.message}\n` +
        '  Is the stack up? `node cli.mjs start` (WITHOUT VULN_MODE=1 — this script asserts the slice is absent).',
    );
  }
}

// ── the two plants whose ABSENCE this script owns, read from the manifest ─────────────────────
//
// `M139-2` (testFlow `PLAN_M139_LEDGER_ACCEPTANCE.md` D488). Both subjects used to be string literals
// here — `/v1/vuln/reports/orders` and port 8445 — written a second time in a script whose whole job
// is to assert they are missing. That is the one duplication direction that fails **quietly**: a
// renamed route or a moved port makes the absence assertion pass on a subject that no longer exists,
// and an absence check with the wrong subject cannot go red.
//
// Selected structurally — every manifest row carrying an `absence` facet — and cross-checked against
// the rows claiming this grader, so a nineteenth plant with an absence to assert cannot be added
// without either being graded here or being noticed.
const ABSENT = PLANTS.filter((p) => p.absence);
assertClaims('hidden', ABSENT, (msg) => {
  failures += 1;
  console.error(`\x1b[31m  ✗ ${msg}\x1b[0m`);
});
const V15_ABSENCE = ABSENT.find((p) => p.absence.documentedPath);
const V18_ABSENCE = ABSENT.find((p) => p.absence.listener);
if (!V15_ABSENCE || !V18_ABSENCE) {
  die('the manifest no longer carries both absence facets this script asserts (a documented path and a listener) — scripts/lib/plants.mjs and this grader have drifted');
}

// ── setup: the premise ───────────────────────────────────────────────────────────────────────
//
// Asked of the running stack rather than of `process.env`, because the flag that matters is the one
// the *container* was started with (`docker-compose.yml` passes it through), and a shell that
// happens to export it says nothing about that.
section('setup — the fixture slice must be absent from this stack');
{
  // `API_BASE` already carries `/v1`, which the manifest's path states in full — stripped here rather
  // than stored twice, so the route this dials and the path asserted absent from `/openapi.json` below
  // cannot come to disagree about which plant they are talking about.
  const route = V15_ABSENCE.absence.documentedPath.replace(/^\/v1/, '');
  const probe = await send('GET', route);
  if (probe.status !== 404) {
    die(
      `GET ${V15_ABSENCE.absence.documentedPath} answered ${probe.status}, not 404 — the fixture slice is PRESENT.\n` +
        '  This script asserts it is absent, so every assertion below would fail for one reason.\n' +
        '  Restart without the flag: `node cli.mjs stop && node cli.mjs start`.',
    );
  }
  ok('the slice is absent — VULN_MODE is off on the running stack', true);
}

// ── every fixture route 404s ─────────────────────────────────────────────────────────────────
section('routing — no fixture route is reachable');
{
  const routes = fixtureRoutes();
  // M127's rule, and this file is the shape it was written for: a derivation that quietly produced
  // nothing would print "0 failed" and mean "nothing was checked". The count is asserted before the
  // routes are.
  ok('the fixture controllers declare routes to check at all', routes.length > 0);
  ok(
    `…and there are at least as many as the four controllers carry (${routes.length} found)`,
    routes.length >= 10,
    `${routes.length} — the ledger describes 15 cases across 4 controllers, so a handful is a broken derivation`,
  );
  for (const { method, route } of routes) {
    const res = await send(method, route);
    ok(`${method} /v1${route} → 404`, res.status === 404, `status ${res.status}`);
  }
}

// ── the document describes none of it ────────────────────────────────────────────────────────
section('/openapi.json — the documented surface mentions no fixture route');
{
  let res;
  try {
    res = await fetch(DOC_URL);
  } catch (err) {
    die(`GET ${DOC_URL} — ${err.message}`);
  }
  ok('/openapi.json is served', res.status === 200, `status ${res.status}`);
  const raw = await res.text();
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    die('/openapi.json did not parse as JSON');
  }
  const paths = Object.keys(doc?.paths ?? {});
  // The denominator again: an empty or truncated document would satisfy "mentions no fixture route"
  // perfectly, and that is the failure mode this whole file is about — a claim that passes because
  // nothing was there to contradict it.
  ok('…and describes a real surface', paths.length > 50, `${paths.length} path(s)`);
  const leaked = paths.filter((p) => p.includes('/vuln'));
  ok('no documented path mentions the fixture slice', leaked.length === 0, leaked.join(', '));

  // The `V15` complement of `verify-security-target.mjs`'s document assertion. Stated as its own
  // check rather than folded into the filter above so the failure names the route the exclusion
  // argument rests on, instead of naming whichever fixture path happened to leak first.
  ok(
    `…including ${V15_ABSENCE.id}'s \`${V15_ABSENCE.absence.documentedPath}\`, the one route that IS documented under VULN_MODE=1`,
    !Object.prototype.hasOwnProperty.call(doc?.paths ?? {}, V15_ABSENCE.absence.documentedPath),
  );

  // Not a path check: a leaked tag or schema would be a slice half-described, which is the same
  // problem arriving through a different field. `@ApiTags('reports')` on the fixture controller is
  // the concrete thing this catches.
  const tags = (doc?.tags ?? []).map((t) => t?.name).filter((n) => typeof n === 'string');
  ok('no documented tag is the fixture slice\'s', !tags.includes('reports'), tags.join(', '));
}

// ── M137g: the plant that is not a route ─────────────────────────────────────────────────────
//
// `V18` is nginx's 8445 listener, which offers `NULL-SHA256`. It is `VULN_MODE`-gated like every
// other plant, but by a completely different mechanism — `nginx/docker-entrypoint.sh` copies
// `offering.conf` into an included directory under the flag and removes it otherwise — and a
// mechanism nothing checks is one that stops working quietly.
//
// **The failure mode is worse here than for a leaked route.** A leaked `/v1/vuln/…` endpoint is at
// least discoverable by anyone who looks at the surface; a listener that stayed up would sit under
// every https suite in this repo offering a suite with no encryption, and no assertion anywhere
// would mention it — `sec/tls-weak-cipher` cannot see an offer without `probe ciphers`, which is
// the entire reason M137g exists.
//
// A raw TLS connect rather than `fetch`, and `ECONNREFUSED` is the expected result rather than an
// error: `send()` above turns a connection failure into `die()`, which is right for a claim about a
// route on a listener that must be up and exactly wrong for a claim about a listener that must not.
section(`the ${V18_ABSENCE.absence.listener.port} offering listener (${V18_ABSENCE.id}) is not running`);
{
  const refusal = await new Promise((resolve) => {
    let socket;
    const done = (v) => {
      try {
        socket?.destroy();
      } catch {
        /* already gone */
      }
      resolve(v);
    };
    try {
      socket = tlsConnect({ ...V18_ABSENCE.absence.listener, rejectUnauthorized: false, timeout: 4000 }, () => done('connected'));
    } catch (err) {
      return done(err.code ?? 'threw');
    }
    socket.on('error', (err) => done(err.code ?? 'error'));
    // A listener that accepts the TCP connection and then says nothing is neither refused nor
    // handshaking; without this the script would hang rather than fail, which reads as a slow
    // machine and gets ignored.
    socket.on('timeout', () => done('timeout'));
  });
  // **The claim is "no TLS session is established", not a particular errno**, and the difference was
  // measured rather than guessed. `docker-compose.yml` publishes 8445 unconditionally — a compose
  // file cannot publish a port only sometimes — so the host port accepts the TCP connection and the
  // proxy resets it when nothing inside the container answers. That is `ECONNRESET` on this box and
  // would be `ECONNREFUSED` on a stack run without Docker's port proxy. Pinning either one would make
  // this assertion fail on a correct stack for a reason that has nothing to do with the plant.
  //
  // What cannot happen either way is a completed handshake, and that is the whole claim: `V18` is a
  // *listener*, so it is either speaking TLS or it is not there.
  ok(
    `no TLS session can be established on https://${V18_ABSENCE.absence.listener.host}:${V18_ABSENCE.absence.listener.port}`,
    refusal !== 'connected' && refusal !== 'timeout',
    refusal === 'connected'
      ? 'the offering listener IS up on a stack started without VULN_MODE=1 — check nginx/docker-entrypoint.sh and the nginx service\'s environment block'
      : `something accepted the connection and then said nothing (${refusal}) — neither a refusal nor a handshake, so this claim cannot be made either way`,
  );
  console.log(`    (the connection ended as ${refusal} — published port, nothing behind it)`);
}

// ── verdict ──────────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log(`\x1b[32m✓ ${checks} claim(s) checked; the vuln/ slice is invisible without VULN_MODE=1\x1b[0m`);
} else {
  console.error(`\x1b[31m✗ ${failures} of ${checks} claim(s) failed — the fixture slice is leaking into the default stack\x1b[0m`);
}
process.exit(failures === 0 ? 0 : 1);
