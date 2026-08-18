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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ── setup: the premise ───────────────────────────────────────────────────────────────────────
//
// Asked of the running stack rather than of `process.env`, because the flag that matters is the one
// the *container* was started with (`docker-compose.yml` passes it through), and a shell that
// happens to export it says nothing about that.
section('setup — the fixture slice must be absent from this stack');
{
  const probe = await send('GET', '/vuln/reports/orders');
  if (probe.status !== 404) {
    die(
      `GET /v1/vuln/reports/orders answered ${probe.status}, not 404 — the fixture slice is PRESENT.\n` +
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
    "…including V15's, the one route that IS documented under VULN_MODE=1",
    !Object.prototype.hasOwnProperty.call(doc?.paths ?? {}, '/v1/vuln/reports/orders'),
  );

  // Not a path check: a leaked tag or schema would be a slice half-described, which is the same
  // problem arriving through a different field. `@ApiTags('reports')` on the fixture controller is
  // the concrete thing this catches.
  const tags = (doc?.tags ?? []).map((t) => t?.name).filter((n) => typeof n === 'string');
  ok('no documented tag is the fixture slice\'s', !tags.includes('reports'), tags.join(', '));
}

// ── verdict ──────────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log(`\x1b[32m✓ ${checks} claim(s) checked; the vuln/ slice is invisible without VULN_MODE=1\x1b[0m`);
} else {
  console.error(`\x1b[31m✗ ${failures} of ${checks} claim(s) failed — the fixture slice is leaking into the default stack\x1b[0m`);
}
process.exit(failures === 0 ? 0 : 1);
