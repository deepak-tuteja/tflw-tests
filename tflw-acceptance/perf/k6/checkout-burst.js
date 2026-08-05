// D31's acceptance scenario, hand-written for k6 — the exact counterpart to
// ../tflw/checkout-burst.tflw. Same target (testFlow-tests' perf-0 contended `POST /orders`),
// same workload shape (closed-model VUs ramping 0→60 linearly over 20s, no hold stage), same
// steps (look up the hot product by name, then check out one unit of it), same thresholds
// (error rate < 1%, p95 duration < 250ms — k6's own `http_req_duration` metric, scoped to the
// checkout request specifically via a tag, and since M89 to successful requests only — see the
// `expected_response:true` note on `thresholds` below).
//
// Real finding from developing this side-by-side (acceptance/README.md's perf leg has the full
// write-up): apiV2's `JWT_ACCESS_TTL` is a deliberately short 5s in this dev environment
// (exercises other suites' own token-refresh coverage), so a bearer token obtained once routinely
// expires mid-run. tflw's session model re-establishes automatically on a 401
// (packages/runtime/src/interpreter.ts: "lets an ApiStep that gets a 401 know which session(s) to
// invalidate + re-establish") — completely free to a `.tflw` author. k6 has no equivalent, so
// `authedRequest` below is the hand-written replacement, and its ~10 lines are a real, measured
// asymmetry: this is exactly the kind of resilience tflw's session model buys for free that a raw
// tool makes you build yourself.
//
// The other deliberate asymmetry: tflw's `scenario` has **no** equivalent of k6's `setup()` for
// anything past session establishment (PLAN_BROWSER_PERF_SECURITY.md D16-D19 never designed one),
// so the product-id lookup below runs on *every iteration*, even though idiomatic k6 would resolve
// it once in `setup()` — kept deliberately unidiomatic so the measured numbers reflect the same
// real work on both sides rather than giving k6 free work tflw structurally can't skip either.

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = 'http://localhost:4001/v1';
const LOAD_USER_EMAIL = __ENV.LOAD_USER_EMAIL || 'load@example.com';
const LOAD_USER_PW = __ENV.LOAD_USER_PW || 'load-pw-123';

export const options = {
  scenarios: {
    checkout_burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '20s', target: 60 }],
      gracefulStop: '0s',
    },
  },
  // M89's D-M89-8 (tflw PLAN_M89_WORKLOAD_TRUTH.md §5). Until M89a, tflw's duration percentiles
  // read *every* iteration and k6's read every request, so the two sides measured the same
  // population and the perf leg's published gap compared like with like. M89a changed tflw's:
  // a `threshold … duration` now reads only the iterations that **succeeded** (SPEC §12), because
  // a fast-failing endpoint was satisfying a latency threshold. From that moment an unfiltered k6
  // selector compares two different populations, and M49's published 3.54% p95 gap silently stops
  // meaning what it says. It held only because this scenario runs at ~0% errors — where the two
  // populations coincide — which was luck, not design.
  //
  // So `expected_response:true` aligns k6's threshold population with tflw's. Note this is not a
  // no-op even at a 0.00% *scenario* error rate: `authedRequest` below absorbs a 401 by
  // re-logging-in and retrying, so those fast 401 responses are real, successful-to-the-scenario
  // iterations whose *requests* k6 tags `expected_response:false`. They were dragging the
  // unfiltered p95 down.
  //
  // The unfiltered sub-metric is kept, at the same bound, so a single run reports both
  // populations and the difference between them is measured rather than assumed. It is a real
  // gate, not a report-only entry: unfiltered generally sits at or below filtered (it admits the
  // fast 401s), so it failing while the aligned one passes would itself be a finding.
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration{name:checkout,expected_response:true}': ['p(95)<250'],
    'http_req_duration{name:checkout}': ['p(95)<250'],
  },
  // M48 (PLAN_BROWSER_PERF_SECURITY.md §2.20, D84) — extended past k6's own default
  // (avg/min/med/max/p90/p95) to include p99: tflw already reports p50/p90/p95/p99 for free,
  // this is the k6-side change needed to match. Report-only, no new threshold.
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

function login() {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email: LOAD_USER_EMAIL, password: LOAD_USER_PW }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'login' },
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${res.body}`);
  return res.json('accessToken');
}

// Per-VU token cache — k6 gives every VU its own JS runtime instance, so this module-level `let`
// is automatically VU-local (the closest k6 equivalent to tflw's own session establishment).
let token;

function authedRequest(method, url, body, tags) {
  if (!token) token = login();
  const attempt = () => {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    return method === 'GET' ? http.get(url, { headers, tags }) : http.post(url, body, { headers, tags });
  };
  let res = attempt();
  if (res.status === 401) {
    token = login();
    res = attempt();
  }
  return res;
}

export default function () {
  const lookup = authedRequest('GET', `${BASE_URL}/products?q=${encodeURIComponent('Load Test Widget')}`, null, { name: 'lookup' });
  check(lookup, { 'lookup 200': (r) => r.status === 200 });
  const productId = lookup.json('0.id');

  const checkout = authedRequest('POST', `${BASE_URL}/orders`, JSON.stringify({ items: [{ productId, quantity: 1 }] }), { name: 'checkout' });
  check(checkout, { 'checkout 201': (r) => r.status === 201 });
}
