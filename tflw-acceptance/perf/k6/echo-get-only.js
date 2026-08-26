// M39 (PLAN_BROWSER_PERF_SECURITY.md §2.10, D49) — k6 counterpart to
// ../profile/echo-get-only.tflw: isolated GET-only rung against the zero-latency echo-server
// harness. No auth (echo-server.mjs has none), same ramp shape as the tflw side.

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = 'http://127.0.0.1:4099';

export const options = {
  // `M154f-04` — **this is a metric declaration, not a check.** k6 materialises a tagged
  // sub-metric only when a threshold names it, so without this line the
  // `http_req_duration{name:products,expected_response:true}` that
  // `scripts/perf-conformance.mjs` reads is simply absent from `--summary-export` and the rung
  // contributes nothing to compare. The bound is deliberately always-true; judging belongs to
  // `verify-perf-baseline.mjs` (`D750`). Full rationale in `scripts/lib/perf-ladder.mjs`.
  thresholds: {
    'http_req_duration{name:products,expected_response:true}': ['min>=0'],
  },
  scenarios: {
    echo_get_only: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '8s', target: 30 }],
      gracefulStop: '0s',
    },
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/products`, { tags: { name: 'products' } });
  check(res, { '200': (r) => r.status === 200 });
}
