// M48 (PLAN_BROWSER_PERF_SECURITY.md §2.20, D82) — k6 counterpart to ../tflw/search-read.tflw:
// real full-text-search read (`GET /products?q=gadgetronic`) against the bulk-seeded catalog,
// public/no-auth (unlike every other dogfood rung's script, this one has no login() at all — the
// endpoint genuinely needs none). Same ramp shape as the rest of the ladder.
//
// `summaryTrendStats` extended past k6's own default (avg/min/med/max/p90/p95) to include p99 —
// M48's second addition (D84): tflw already reports p50/p90/p95/p99 for free, k6 needs this to
// match, report-only, no new tolerance gate.

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = 'http://localhost:4001/v1';

export const options = {
  // `M154f-04` — **this is a metric declaration, not a check.** k6 materialises a tagged
  // sub-metric only when a threshold names it, so without this line the
  // `http_req_duration{name:search,expected_response:true}` that
  // `scripts/perf-conformance.mjs` reads is simply absent from `--summary-export` and the rung
  // contributes nothing to compare. The bound is deliberately always-true; judging belongs to
  // `verify-perf-baseline.mjs` (`D750`). Full rationale in `scripts/lib/perf-ladder.mjs`.
  thresholds: {
    'http_req_duration{name:search,expected_response:true}': ['min>=0'],
  },
  scenarios: {
    search_read: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '20s', target: 60 }],
      gracefulStop: '0s',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export default function () {
  const res = http.get(`${BASE_URL}/products?q=gadgetronic`, { tags: { name: 'search' } });
  check(res, { '200': (r) => r.status === 200 });
}
