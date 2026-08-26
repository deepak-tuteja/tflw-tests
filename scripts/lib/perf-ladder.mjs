// The perf ladder's inventory: which rungs exist, in which of the three runners, and which
// fixture values every implementation of a rung must agree on.
//
// `M154e`, testFlow `PLAN_M154_DOGFOOD_CONFORMANCE.md` — **this file closes `B6-15`**, whose
// reopening condition is verbatim *"reopens when the parity ladder is next run in anger"*.
// `M154e` runs it in anger.
//
// ## The gap this exists to close, stated exactly
//
// `scripts/check-acceptance.mjs` discovers corpora by walking for a `tflw.config`
// (`configRoots`, that file's own comment says a hand-maintained list is how the last corpus
// rotted). That is the right rule for tflw corpora and it makes `perf/k6/` and `perf/artillery/`
// **structurally undiscoverable** — not overlooked, *ineligible*: they are JavaScript and YAML,
// they will never hold a `tflw.config`, and no amount of fixing the walk will reach them.
// `scripts/verify-external-targets.mjs` walks the same roots and inherits the same blind spot, so
// **the host a k6 script or an Artillery scenario points at is fenced by nothing at all** — found
// while scoping this milestone, and the more serious half of the two. Both files today target
// `localhost:4001` and `127.0.0.1:4099`; that is a fact about today, not a property.
//
// So the fix is not a better walk. It is a **declared inventory** — this file — checked against the
// filesystem by `scripts/verify-perf-parity.mjs`, on exactly the `constructs.mjs` / `plants.mjs`
// model: the manifest is the source, the tree is checked against it, and a new file nobody wrote a
// row for turns the gate red rather than joining the ladder unnoticed.
//
// ## Why the fixture values are checked and not imported
//
// The shared `productId` has drifted twice at real cost — 98% k6 failure at `M48`, and on
// 2026-08-05 the tflw side ran at a **100% error rate while reporting PASS** (it declared no
// `threshold`; tflw `TF033`/`M60`). All three copies already carry a prose comment saying they must
// stay in sync. They drifted anyway, twice, *with the warning in the file*. That is the whole
// argument for a mechanical check and against a fourth comment.
//
// **`D744` — the copies stay literal and are asserted equal to the constant, rather than
// single-sourced at run time.** The obvious reading of `B6-15`'s "single-source the fixture id" is
// an import, and it is refused for a measurement reason: `dogfood-post-uncontended` is the rung
// that isolates *POST with a static body and zero capture or interpolation overhead*. Resolving the
// id at run time — a lookup on the tflw side, `open()` on the k6 side, a `processor.cjs` hook on
// the Artillery side — changes what that rung measures, and it would change it by a different
// amount in each of the three runners, which is precisely the comparison the ladder exists to make.
// Artillery's YAML cannot import at all, so one of the three would have needed a different
// mechanism regardless. Single-sourcing here therefore means *one source of truth and a gate that
// proves the copies match it*, which is `D489`'s shape ("the file is the source and the markdown is
// checked against it") applied to a value instead of a document.
//
// The constant is read out of the TypeScript by regex rather than imported, because this gate must
// run without a build step and `apiV2/` compiles to `dist/` only inside its own Docker image. The
// pattern is anchored on `export const <NAME> =` and fails loudly if it matches nothing, so the
// failure mode is a red gate, never a silently-empty expectation.

/** Where the fixture values are defined, and how to find each one. `pattern` must capture the
 *  literal in group 1. */
export const FIXTURE_SOURCE = 'apiV2/src/load-admin/load-target.constants.ts';

/** The k6 rungs that log in. k6 has no `.env` loading and no shared module the way Artillery's
 *  `processor.cjs` is shared, so each of these carries the credentials inline — which is why the
 *  credential fixtures are carried by four k6 files and exactly one Artillery file, and by no tflw
 *  file at all (the tflw side reads `perf/tflw/.env`, untracked and local). The asymmetry is real
 *  and is recorded rather than smoothed over: a gate that demanded every runner hold every literal
 *  would be demanding the ladder be built differently than it is. */
const K6_AUTHED = [
  'perf/k6/checkout-burst.js',
  'perf/k6/dogfood-get-only.js',
  'perf/k6/dogfood-post-uncontended.js',
  'perf/k6/ticket-write.js',
];

export const FIXTURES = {
  hotProductId: {
    constant: 'LOAD_HOT_PRODUCT_ID',
    pattern: /export const LOAD_HOT_PRODUCT_ID\s*=\s*'([^']+)'/,
    what: 'the pinned "Load Test Widget" row every POST rung adds to a cart',
    // The three copies `B6-15` is actually about. All three are hardcoded on purpose (see
    // `D744`), and all three broke together on 2026-08-05.
    carriedBy: [
      'perf/tflw/dogfood-post-uncontended.tflw',
      'perf/k6/dogfood-post-uncontended.js',
      'perf/artillery/dogfood-post-uncontended.yml',
    ],
  },
  loadUserEmail: {
    constant: 'LOAD_USER_EMAIL',
    // Defaulted from the environment, so the literal is the fallback rather than the assignment.
    pattern: /export const LOAD_USER_EMAIL\s*=\s*[\s\S]*?\?\?\s*'([^']+)'/,
    what: 'the load user every runner logs in as',
    carriedBy: K6_AUTHED.concat(['perf/artillery/processor.cjs']),
  },
  loadUserPw: {
    constant: 'LOAD_USER_PW',
    pattern: /export const LOAD_USER_PW\s*=\s*[\s\S]*?\?\?\s*'([^']+)'/,
    what: "the load user's password",
    carriedBy: K6_AUTHED.concat(['perf/artillery/processor.cjs']),
  },
};

/**
 * **The positive list above is not the check that matters, and saying why is the point.**
 *
 * `carriedBy` catches a copy that was deleted or a file that was renamed. It cannot catch the
 * failure `B6-15` is actually about — a copy that is still there and *wrong* — in any file nobody
 * remembered to list, and a hand-maintained list of files is the exact thing `check-acceptance.mjs`
 * says rotted last time.
 *
 * So the load-bearing check is the converse one: scan every ladder file for literals of each
 * fixture's *shape*, and refuse any that is not the value the constant defines. That needs no list.
 * A new rung that hardcodes last month's product id goes red on the day it lands, whether or not
 * anybody rostered it.
 *
 * Each scanner's group 1 is the literal; `fixture` names the value it must equal.
 */
export const DRIFT_SCANNERS = [
  {
    what: 'a UUID literal',
    fixture: 'hotProductId',
    pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    // No capture group: the whole match is the literal.
    whole: true,
  },
  {
    what: 'an @example.com address',
    fixture: 'loadUserEmail',
    pattern: /[A-Za-z0-9._%+-]+@example\.com/g,
    whole: true,
  },
  {
    what: 'a password literal',
    fixture: 'loadUserPw',
    // Anchored on the name rather than the value, because a password has no shape to recognise.
    // Covers k6's `__ENV.X ||`, Node's `process.env.X ||`/`??`, and a bare assignment.
    pattern: /(?:PW|PASSWORD|password)\s*[:=]\s*(?:(?:__ENV|process\.env)\.\w+\s*(?:\|\||\?\?)\s*)?['"]([^'"]+)['"]/gi,
    whole: false,
  },
];

/** Hosts a ladder file may address. Deliberately the same set `verify-external-targets.mjs` calls
 *  ours, restated here rather than imported, because that file's list is about `tflw.config` roots
 *  and this one is about runners that have no config — sharing the constant would imply the two
 *  gates cover the same files, which is the exact confusion this milestone found. */
export const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);

/**
 * **`M154f-05` — the two servers this ladder measures against, declared rather than inferred.**
 *
 * The ladder has always had two targets: apiV2 in Docker, and the zero-latency `echo-server.mjs`
 * the two `echo-*` rungs use as a runner-overhead floor. Nothing said so in machine-readable form.
 * The tflw side of those rungs lives under `perf/profile/` and their `why` explains that in prose,
 * which is exactly as much as a driver can act on: none. `perf-conformance.mjs` derived each
 * rung's working directory from the *runner's* name instead of from the file it was given, so both
 * echo rungs looked for `perf/tflw/echo-get-only.tflw`, died `ENOENT`, and were reported as
 * regressions — and nothing had started the echo server either way.
 *
 * `managed` says who is responsible for the server being up:
 *   `external`  the Docker stack. The driver asserts it is healthy and refuses to measure if not;
 *               starting it is out of scope and would make a load run able to mutate the box.
 *   `driver`    the driver starts it and stops it. `echo-server.mjs` is a 40-line stdlib script
 *               with no state, so owning its lifecycle is cheap and leaving it to a human is how
 *               the rung silently measured nothing for as long as it did.
 */
export const TARGETS = {
  apiV2: {
    what: 'the real dogfood target — NestJS + Postgres, in Docker',
    health: 'http://localhost:4001/v1/health',
    managed: 'external',
  },
  echo: {
    what: 'the runner-overhead floor — perf/profile/echo-server.mjs, no database, no auth',
    health: 'http://127.0.0.1:4099/products',
    managed: 'driver',
    script: 'perf/profile/echo-server.mjs',
    port: 4099,
  },
};

/**
 * One row per rung. `impls` maps a runner to its file, relative to `tflw-acceptance/`.
 *
 * A runner absent from `impls` is a **recorded** absence, and `why` must say so — the ladder is
 * genuinely ragged (Artillery has no `search-read` or `ticket-write`; `generator-saturation-demo`
 * is a tflw-only demonstration), and a gate that demanded all three everywhere would be a gate
 * somebody switches off. What the gate refuses is an *unrecorded* absence and an unrostered file.
 *
 * `k6Tag` is the k6 request-name tag whose `http_req_duration` sub-metric is *the thing this rung
 * measures* — never the rung's own name, and never the bare top-level metric. Every k6 rung also
 * tags a `login` request, and `checkout-burst` additionally tags a `lookup`, so reading
 * `http_req_duration` unfiltered averages the measured call together with its auth overhead. Worse,
 * tflw's percentiles are successful-only (`SPEC` §12, tflw `M89a`) while k6's unfiltered metric is
 * not — `tflw-acceptance/README.md` §M89 records that this exact mismatch made `M49`'s published
 * 3.54% p95 gap a comparison of two different populations, which held only by the luck of a
 * near-zero error rate. Declared here, and `verify-perf-parity.mjs` proves each tag really appears
 * in the file it names, so a renamed tag is a red gate rather than a silently absent sub-metric.
 *
 * **`M154f-04` — a tag is necessary and not sufficient: the sub-metric also has to be
 * *materialised*.** k6 emits a tagged sub-metric into `--summary-export` only when a
 * **threshold** names it. Tagging a request creates the tag; it does not create the metric. Every
 * k6 rung therefore carries a `thresholds` entry naming exactly the key the driver reads, and for
 * six of the seven that entry is `min>=0` — an always-true bound whose only job is to bring the
 * metric into existence. That is deliberate and it is not `M141`'s vacuity: a vacuous *check* is
 * one that claims to judge and cannot fail, whereas this claims nothing. Judging is `D750`'s job
 * and lives in `verify-perf-baseline.mjs`, which compares runners against each other in the same
 * run precisely because an absolute bound on this box is either a flake generator or, once
 * widened enough to stop flaking, meaningless. `checkout-burst` keeps its real `p(95)<250`
 * because it had one already.
 *
 * This cost a whole ladder run to find. On 2026-08-26 six of seven k6 rungs produced no comparable
 * metric at all, the run compared **zero** rungs, and every static gate was green throughout —
 * `verify-perf-parity.mjs` proved the tags were tagged and nothing proved they were readable.
 * That gate now also requires the threshold, so the next rung that ships without one is red on the
 * day it lands rather than at the next run in anger.
 *
 * `fixtures` lists which of `FIXTURES` every implementation of this rung must carry verbatim. A
 * rung that does not use a fixture lists none; the gate then only checks its hosts and its roster
 * membership.
 */
export const RUNGS = [
  {
    name: 'checkout-burst',
    target: 'apiV2',
    k6Tag: 'checkout',
    what: 'the contended rung — every VU races the one hot product row through a real Postgres row lock',
    impls: {
      tflw: 'perf/tflw/checkout-burst.tflw',
      k6: 'perf/k6/checkout-burst.js',
      artillery: 'perf/artillery/checkout-burst.yml',
    },
  },
  {
    name: 'dogfood-get-only',
    target: 'apiV2',
    k6Tag: 'health',
    what: 'the read rung — GET with no body, no capture',
    impls: {
      tflw: 'perf/tflw/dogfood-get-only.tflw',
      k6: 'perf/k6/dogfood-get-only.js',
      artillery: 'perf/artillery/dogfood-get-only.yml',
    },
  },
  {
    name: 'dogfood-post-uncontended',
    target: 'apiV2',
    k6Tag: 'cart-add',
    what: 'the write rung with zero interpolation overhead — the one the drifting id broke twice',
    impls: {
      tflw: 'perf/tflw/dogfood-post-uncontended.tflw',
      k6: 'perf/k6/dogfood-post-uncontended.js',
      artillery: 'perf/artillery/dogfood-post-uncontended.yml',
    },
  },
  {
    name: 'search-read',
    target: 'apiV2',
    k6Tag: 'search',
    what: 'catalog search under load',
    impls: {
      tflw: 'perf/tflw/search-read.tflw',
      k6: 'perf/k6/search-read.js',
    },
    why: 'no Artillery side — the Artillery leg was built for the M46d open-model comparison (§2.20) and only the four rungs that comparison needed were ported.',
  },
  {
    name: 'ticket-write',
    target: 'apiV2',
    k6Tag: 'ticket-create',
    what: 'the rate-limited + uniquely-constrained write path',
    impls: {
      tflw: 'perf/tflw/ticket-write.tflw',
      k6: 'perf/k6/ticket-write.js',
    },
    why: 'no Artillery side — same reason as search-read.',
  },
  {
    name: 'echo-get-only',
    target: 'echo',
    k6Tag: 'products',
    what: 'the runner-overhead floor: a local echo server, no database, no auth',
    impls: {
      tflw: 'perf/profile/echo-get-only.tflw',
      k6: 'perf/k6/echo-get-only.js',
      artillery: 'perf/artillery/echo-get-only.yml',
    },
    why: 'the tflw side lives under `perf/profile/` rather than `perf/tflw/` because it is graded by the profiling harness there and shares that directory\'s `tflw.config`, which points at the echo server rather than at apiV2.',
  },
  {
    name: 'echo-post-only',
    target: 'echo',
    k6Tag: 'orders',
    what: 'the same floor, with a body',
    impls: {
      tflw: 'perf/profile/echo-post-only.tflw',
      k6: 'perf/k6/echo-post-only.js',
      artillery: 'perf/artillery/echo-post-only.yml',
    },
    why: 'tflw side under `perf/profile/` — same reason as echo-get-only.',
  },
  {
    name: 'generator-saturation-demo',
    target: 'apiV2',
    what: 'a demonstration that the generator, not the target, is the ceiling at high rates',
    impls: {
      tflw: 'perf/tflw/generator-saturation-demo.tflw',
    },
    why: 'tflw-only by construction — it is a claim about tflw\'s own generator, so a k6 or Artillery counterpart would measure a different program and answer nothing.',
  },
];

/** Files under the runner directories that are not rungs. Everything else there must be rostered. */
export const NON_RUNG_FILES = new Set([
  // Artillery's shared login/token hook. Not a rung — it is machinery every Artillery rung calls,
  // and it carries the load credentials, so the fixture check reaches it through `ALSO_FIXTURED`.
  'perf/artillery/processor.cjs',
  // tflw's side of the ladder shares one config root and one helper module across its rungs.
  'perf/tflw/tflw.config',
  'perf/tflw/helpers.ts',
]);


