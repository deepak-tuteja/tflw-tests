// The plant manifest: one row per planted weakness in `VULNS.md`'s ledger, hand-authored and
// authoritative (`M139-1`/`M139-2`, testFlow `PLAN_M139_LEDGER_ACCEPTANCE.md` D488–D492).
//
// ## Why this file exists at all
//
// Every one of the eighteen plants **was** graded before this file, and nothing asserted that. The
// grading was split across three scripts by tier accident — `V1`–`V9` and `V15`–`V18` in
// `verify-security-acceptance.mjs`, `V10`–`V14` in `verify-sarif-acceptance.mjs` and (ungated)
// `verify-input-acceptance.mjs`, `V15`/`V18`'s *absence* in `verify-vuln-slice-hidden.mjs` — and the
// V-numbers appeared only inside free-text test titles. So the union happened to equal the ledger,
// and a nineteenth plant needed no grader edit to be silently ungraded.
//
// This is that union, written down once as data.
//
// ## The direction, which is the whole design (D489)
//
// **This file is the source. `VULNS.md` is checked against it.** Not the other way round: parsing
// prose to build the oracle would let a typo in a markdown table silently retune what the graders
// expect, and generating it from tflw's own output would make the oracle agree with the thing it
// grades by construction. `VULNS.md` stays prose a human reads and gains exactly one machine-checked
// invariant — its id set.
//
// ## Why importing this is not the mirroring violation it looks like (D488)
//
// `verify-sarif-acceptance.mjs` mirrors tflw's severity map rather than importing it, and
// `verify-security-acceptance.mjs` mirrors the rule packs, both for the same stated reason: a grader
// that read the mapping it grades would agree with it on the day it changes. **That rule is about the
// thing under test.** `securityRules.ts`, `authzRules.ts` and D406's severity table are tflw's; this
// ledger is the corpus's own specification, authored in this repo by the same hand as the graders.
// Grader-vs-gradee is the axis, not duplication-vs-sharing. The rule packs stay mirrored; the plant
// ledger does not.
//
// ## The schema (D490)
//
// The schema that stopped at `V14` was endpoint-keyed, on the premise that every planted route is
// served at `/v1/vuln/…`. That premise broke twice — first for pages (`V16`/`V17`), then for a
// *listener* (`V18`, the first plant whose subject is not a request at all). So a row keys on its
// **subject**:
//
//   `endpoint`   a templated request fingerprint, matched exactly    `V1`–`V14`
//   `page`       a document a spider reached                         `V16`, `V17`
//   `listener`   a TLS listener; there is no request                 `V18`
//   `via`        a reachability restriction, not a route             `V15` (and `V7`'s second face)
//
// `kind: 'positive' | 'negative'` is retained unchanged from `PLANTS`, because it is the most
// load-bearing thing in the old table: three of the first fourteen are hardened twins whose entire
// job is to produce nothing, and `V8`'s silence is *measured* rather than unexplained.
//
// `graders` is §2.1's table turned into data — which scripts own a row. It buys one invariant worth
// more than the tidiness: a plant graded **only** by an ungated script is the `M137e-01` shape
// recurring, and that is now checkable rather than a thing somebody notices two milestones later.
//
// `surface` is the plant's own **discriminator** (D491), which the graders used to infer. See
// `plantSurfaceMatch` below for what a match does and does not mean.

/** Every planted route lives under this prefix, and the exemption it grants is **deliberately
 *  coarse** — see `plantSurfaceMatch`. Written once rather than per row: it is one fact about how
 *  `apiV2/src/vuln/` is mounted, not eighteen facts. */
const VULN_ROUTES = { pathPrefix: '/v1/vuln/' };

/** The scripts that grade this ledger, and whether an automated pass runs them.
 *
 *  `gated` is the field with teeth. `verify-security-acceptance.mjs` ran by hand and by nothing else
 *  until `M139-5` split it, which is the entire content of `M137e-01`. A row whose only graders are
 *  ungated is graded by nobody on any day nobody was looking.
 *
 *  **`input` was stale here for the whole of `M154g`, and `M163e`'s audit (`D828`) is what found it.**
 *  `M154g` step 5 (`D765`) gated Tier 3's grader — `input-acceptance` has been a `regression.mjs`
 *  phase since — and `lib/constructs.mjs`'s `GRADERS` was updated to say so while this copy was not.
 *  Two tables carrying one fact, and the one that went stale is the one
 *  `verify-security-acceptance.mjs` reads for its "graded only by ungated script(s)" check.
 *
 *  **The damage was available rather than done, and the distinction is measured, not assumed.** That
 *  check fires only when *every* grader on a plant is ungated; five plants name `input` (`V10`-`V14`)
 *  and none names it alone, so the false verdict had no subject. The next plant graded solely by
 *  Tier 3 would have been reported as graded by nobody — a gate telling the truth's opposite, in the
 *  exact words `M137e-01` exists to prevent.
 *
 *  Corrected rather than deduplicated. One table fed from the other is the right shape and is not
 *  this milestone's to build: they hold different key sets for different ledgers, and merging them
 *  is a change to both callers. Filed instead (`M163-02`). */
export const GRADERS = {
  security: { script: 'scripts/verify-security-acceptance.mjs --gate', phase: 'security-acceptance-gate', gated: true },
  sarif: { script: 'scripts/verify-sarif-acceptance.mjs', phase: 'sarif-acceptance', gated: true },
  hidden: { script: 'scripts/verify-vuln-slice-hidden.mjs', phase: 'vuln-slice-hidden-check', gated: true },
  input: { script: 'scripts/verify-input-acceptance.mjs', phase: 'input-acceptance', gated: true },
};

export const PLANTS = [
  // --- Tier 1: claims a response makes about itself ------------------------------------------------
  {
    id: 'V1',
    kind: 'positive',
    subject: 'endpoint',
    endpoint: 'GET /v1/vuln/cors-wildcard',
    rules: { 'sec/cors-wildcard-with-credentials': 'critical' },
    surface: VULN_ROUTES,
    graders: ['security', 'sarif'],
  },
  {
    id: 'V2',
    kind: 'negative',
    subject: 'endpoint',
    endpoint: 'GET /v1/vuln/cors-scoped',
    surface: VULN_ROUTES,
    graders: ['security', 'sarif'],
  },
  {
    id: 'V3',
    kind: 'positive',
    subject: 'endpoint',
    endpoint: 'POST /v1/vuln/weak-cookie',
    rules: { 'sec/cookie-not-httponly': 'critical', 'sec/cookie-not-secure': 'critical', 'sec/cookie-samesite-none': 'moderate' },
    surface: VULN_ROUTES,
    graders: ['security', 'sarif'],
  },
  {
    id: 'V4',
    kind: 'positive',
    subject: 'endpoint',
    endpoint: 'GET /v1/vuln/document',
    rules: { 'sec/csp-missing': 'serious', 'sec/x-frame-options': 'moderate' },
    surface: VULN_ROUTES,
    graders: ['security', 'sarif'],
  },
  {
    id: 'V5',
    kind: 'negative',
    subject: 'endpoint',
    endpoint: 'GET /v1/vuln/document-hardened',
    surface: VULN_ROUTES,
    graders: ['security', 'sarif'],
  },
  // --- Tier 2: claims about who is allowed to see what ---------------------------------------------
  {
    id: 'V6',
    kind: 'positive',
    subject: 'endpoint',
    endpoint: 'GET /v1/vuln/orders/{id}',
    rules: { 'sec/authz-object-leak': 'critical' },
    surface: VULN_ROUTES,
    graders: ['security', 'sarif'],
  },
  {
    id: 'V7',
    kind: 'positive',
    subject: 'endpoint',
    endpoint: 'GET /v1/vuln/orders',
    rules: { 'sec/authz-collection-leak': 'critical' },
    surface: VULN_ROUTES,
    graders: ['security', 'sarif'],
    // **`V7`'s second face, and the reason `via` is a subject kind rather than a field on `V15`.**
    // This route is `@ApiExcludeController()`, so it is absent from `/openapi.json` and a crawl can
    // only arrive at it by having *seen the suite make the request*. `V15` breaks the same rule in the
    // same way and is reachable by the opposite seed — the pair is the whole measurement, and reading
    // either one alone would make provenance look incidental.
    reach: { via: 'traffic', rule: 'sec/authz-collection-leak', findings: 3, why: 'V7 — @ApiExcludeController(), so only the traffic seed can reach it' },
  },
  {
    id: 'V8',
    // **Probed and never judged, which is a measurement rather than a gap** (`M130-05`). A `DELETE`
    // cannot be replayed as the owner, so the identity comparison that judges `V6` is structurally
    // unreachable here; `V9` is the row that supplies what this one cannot. Graded as a negative
    // because that is what the evidence looks like — no finding — and the ledger says why.
    kind: 'negative',
    subject: 'endpoint',
    endpoint: 'DELETE /v1/vuln/orders/{id}',
    surface: VULN_ROUTES,
    graders: ['security', 'sarif'],
  },
  {
    id: 'V9',
    kind: 'positive',
    subject: 'endpoint',
    endpoint: 'PUT /v1/vuln/orders/{id}',
    rules: { 'sec/authz-object-leak': 'critical' },
    surface: VULN_ROUTES,
    graders: ['security', 'sarif'],
  },
  // --- Tier 3: claims about what the app does with an input it did not expect ----------------------
  //
  // These five are the arc's one asymmetry worth naming here: their evidence is a response to a
  // request **tflw constructed**, so the security corpus cannot exercise them at all and does not
  // claim them. `sarif` is what gates them; `input` grades them by ledger row and runs by hand.
  {
    id: 'V10',
    kind: 'positive',
    subject: 'endpoint',
    endpoint: 'GET /v1/vuln/lookup',
    rules: { 'sec/reflected-input-unescaped': 'moderate' },
    surface: VULN_ROUTES,
    graders: ['sarif', 'input'],
  },
  {
    id: 'V11',
    kind: 'positive',
    subject: 'endpoint',
    endpoint: 'GET /v1/vuln/items/{id}',
    rules: { 'sec/path-traversal-read': 'critical' },
    surface: VULN_ROUTES,
    graders: ['sarif', 'input'],
  },
  {
    id: 'V12',
    kind: 'positive',
    subject: 'endpoint',
    endpoint: 'POST /v1/vuln/notes',
    rules: { 'sec/error-detail-disclosure': 'serious', 'sec/oversized-input-accepted': 'minor' },
    surface: VULN_ROUTES,
    graders: ['sarif', 'input'],
  },
  {
    id: 'V13',
    // Same route as `V12`, different leaf (`body.title` rather than `body.text`). Kept as its own row
    // because per-site attribution is the property `V13` exists to demonstrate — a rule firing twice
    // on one body at two fields is not the same evidence as firing once.
    kind: 'positive',
    subject: 'endpoint',
    endpoint: 'POST /v1/vuln/notes',
    rules: { 'sec/oversized-input-accepted': 'minor' },
    surface: VULN_ROUTES,
    graders: ['sarif', 'input'],
  },
  {
    id: 'V14',
    kind: 'negative',
    subject: 'endpoint',
    endpoint: 'GET /v1/vuln/lookup-escaped',
    surface: VULN_ROUTES,
    graders: ['sarif', 'input'],
  },
  // --- Tier 4: subjects that are not a request fingerprint -----------------------------------------
  {
    id: 'V15',
    // **The first row in the ledger whose distinguishing property is not in its response.** It breaks
    // the same rule `V7` does, in the same way; what separates them is *who can find it*. So its
    // subject is the reachability restriction, and its endpoint is a detail of it.
    kind: 'positive',
    subject: 'via',
    endpoint: 'GET /v1/vuln/reports/orders',
    rules: { 'sec/authz-collection-leak': 'critical' },
    surface: VULN_ROUTES,
    graders: ['security', 'hidden'],
    reach: { via: 'openapi', rule: 'sec/authz-collection-leak', findings: 3, why: 'V15 — documented and never exercised, so only enumeration can reach it' },
    // The one fixture route deliberately present in `/openapi.json` under `VULN_MODE=1` (tflw D438),
    // which is exactly why its absence without the flag has to be gated: the argument for documenting
    // it is that the route is not there at all otherwise.
    absence: { documentedPath: '/v1/vuln/reports/orders' },
  },
  {
    id: 'V16',
    // An entire **origin**: every page `webV2/admin` serves on `:8091` is served without security
    // headers on purpose, so that three document rules and one authenticated-cacheability rule finally
    // have a real document to judge rather than `vuln.controller.ts`'s fabricated `text/html`.
    kind: 'positive',
    subject: 'page',
    origin: 'http://localhost:8091',
    rules: {
      'sec/csp-missing': 'serious',
      'sec/x-frame-options': 'moderate',
      'sec/nosniff-missing': 'moderate',
      // Arrived **because of** the `M137f-01` fix and is the cleanest evidence that the fix did what
      // it claims: this rule's precondition is "the request carried credentials", so it was
      // unreachable by a walk that was not logged in.
      'sec/authenticated-response-cacheable': 'moderate',
    },
    // Rules that arrived on this plant *after* it was planted, rather than rules it was built for.
    // The distinction is graded: `gradeSpider` asserts each rule the plant was built for fires with a
    // message about judging a page written for people, and asserts the accounted set — built-for plus
    // arrived-with — **exactly**, because `gradePrecision` exempts the whole spider surface. A rule
    // firing there that nobody wrote down has to go red somewhere, and this is where.
    arrivedWith: ['sec/authenticated-response-cacheable'],
    surface: { via: 'spider' },
    graders: ['security'],
  },
  {
    id: 'V17',
    kind: 'negative',
    subject: 'page',
    page: '/hardened',
    origin: 'http://localhost:8091',
    surface: { via: 'spider' },
    graders: ['security'],
  },
  {
    id: 'V18',
    // nginx's `:8445` listener — the transport, not a route. Its findings arrive on ordinary endpoints
    // (`GET /v1/health` is the plainest response the app has) because the weakness is *underneath* the
    // response rather than in it, which is why neither the path prefix nor `via` can see it.
    kind: 'positive',
    subject: 'listener',
    listener: { host: 'localhost', port: 8445 },
    rules: { 'sec/tls-weak-cipher': 'serious' },
    // The env **is** the discriminator here, and honestly so: `offeringTls` exists for no other
    // purpose, runs one file, and is the only place in this repo where a transport is deliberately
    // broken. The rule set is named rather than left open — `sec/tls-version-old` firing here would
    // mean the listener had silently lost TLS 1.2/1.3, and that is the regression this exemption must
    // not absorb. `hsts-missing` is deliberately absent: it is nginx being nginx on all three
    // listeners, and the committed baseline accounts for it by fingerprint.
    surface: { env: 'offeringTls', rules: ['sec/tls-weak-cipher'] },
    graders: ['security', 'hidden'],
    absence: { listener: { host: '127.0.0.1', port: 8445 } },
  },
];

export const PLANT_IDS = PLANTS.map((p) => p.id);

/** Rows a grader claims. */
export const plantsFor = (grader) => PLANTS.filter((p) => p.graders.includes(grader));

/** Rows by subject kind — the structural half of each grader's claim check. */
export const plantsWithSubject = (subject) => PLANTS.filter((p) => p.subject === subject);

/** Rows carrying a `retired` reason (D492). Asserted **absent** rather than deleted, because deleting
 *  a row whose plant is gone produces "expected finding not found", which is indistinguishable from a
 *  recall regression in tflw — a false red pointing at the wrong repo, which is `M131-05`'s class. */
export const retiredPlants = () => PLANTS.filter((p) => p.retired);

/** Rows whose evidence is a finding this run should produce. */
export const livePlants = () => PLANTS.filter((p) => !p.retired);

/**
 * **The one discriminator (D491), and what a match means.**
 *
 * This replaces `PLANT_PREFIX` / `isSpiderPlant` / `isOfferingPlant`, three mechanisms OR'd together
 * because the endpoint-keyed premise broke twice and each break got its own special case. A third
 * special case would have been a design rather than an accident, so the plant declares its own
 * surface and this function reads it.
 *
 * **A match is an exemption, not an attribution**, and conflating the two would quietly weaken the
 * precision gate. The surfaces are deliberately coarse — `VULN_ROUTES` exempts *any* finding under
 * `/v1/vuln/`, and `{ via: 'spider' }` exempts the *whole* spider surface, which is 67-odd findings on
 * pages nobody enumerated. That breadth is inherited verbatim from the code this replaces and D491
 * explicitly does not narrow it: narrowing would start failing precision on findings the corpus is
 * built to produce. The power the gate would otherwise lose is bought back elsewhere, by graders that
 * *do* attribute — `gradeSpider` asserts the spider's rule set exactly, `gradeCrawl` asserts
 * provenance per plant, and per-plant recall asserts each row's own evidence.
 *
 * So the returned row is "the first plant whose surface covers this finding", which is useful for a
 * message and must not be read as "the plant that produced it".
 */
export function plantSurfaceMatch(env, finding) {
  for (const plant of PLANTS) {
    const s = plant.surface ?? {};
    if (s.pathPrefix) {
      const endpoint = finding.endpoint ?? '';
      if (new RegExp(`^[A-Z]+ ${s.pathPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(endpoint)) return plant;
      continue;
    }
    if (s.via) {
      if (finding.via === s.via) return plant;
      continue;
    }
    if (s.env) {
      if (env === s.env && (s.rules ?? []).includes(finding.rule)) return plant;
      continue;
    }
  }
  return null;
}

/** `true` when a finding falls on some plant's declared surface. The precision bar's `plants` half. */
export const isPlantFinding = (env, finding) => plantSurfaceMatch(env, finding) !== null;

/**
 * **Each grader checks that the rows claiming it are the rows it actually selected.**
 *
 * Without this the `graders` field is a comment: a grader that filters by the claim agrees with the
 * claim by construction, which is the objection D488 raises against importing a mapping under test.
 * So a grader derives its selection **structurally** — `sarif` takes every `endpoint`-subject row,
 * `hidden` takes every row with an `absence` facet — and asserts the two sets are equal. A new plant
 * that forgets a claim, or claims a grader that cannot see it, is red in that grader.
 *
 * `fail` is passed in rather than thrown so each caller keeps its own failure accounting and message
 * style; every one of these scripts counts failures and exits on the total rather than on the first.
 */
export function assertClaims(grader, structural, fail) {
  const claimed = plantsFor(grader).map((p) => p.id);
  const structuralIds = structural.map((p) => p.id);
  const unclaimed = structuralIds.filter((id) => !claimed.includes(id));
  const overclaimed = claimed.filter((id) => !structuralIds.includes(id));
  if (unclaimed.length === 0 && overclaimed.length === 0) return true;
  const plural = (ids) => (ids.length === 1 ? `plant ${ids[0]} is` : `plants ${ids.join(', ')} are`);
  if (unclaimed.length > 0) {
    fail(
      `${plural(unclaimed)} gradeable by \`${grader}\` but do not list it in \`graders\` — ` +
        `scripts/lib/plants.mjs is the only place that says who grades a plant, so an unclaimed row is one nobody is asserted to check`,
    );
  }
  if (overclaimed.length > 0) {
    fail(
      `${plural(overclaimed)} listed under \`${grader}\` in \`graders\`, but this grader cannot see ${overclaimed.length === 1 ? 'it' : 'them'} — ` +
        `either the claim is wrong or the grader stopped selecting the row, and the second one is how coverage disappears quietly`,
    );
  }
  return false;
}
