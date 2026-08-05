// M39 (PLAN_BROWSER_PERF_SECURITY.md §2.10, D49) — k6 counterpart to
// ../tflw/dogfood-post-uncontended.tflw: isolated POST-uncontended rung against the real dogfood
// target (`POST /cart/items`, static body, per-user cart row — no shared lock across VUs), with
// the same login-once + retry-on-401 session handling as checkout-burst.js (D31). `productId`
// below is the seed's pinned `LOAD_HOT_PRODUCT_ID` (apiV2/src/load-admin/load-target.constants.ts)
// and must stay in sync with the tflw and Artillery sides. It used to be a hand-resolved copy of a
// randomly-generated UUID, so a reseed broke all three at once — silently here, because k6 has no
// equivalent of `tflw check` and nothing compares this file against the running catalog. Same ramp
// shape as checkout-burst.js for apples-to-apples comparison against the contended rung.

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = 'http://localhost:4001/v1';
const LOAD_USER_EMAIL = __ENV.LOAD_USER_EMAIL || 'load@example.com';
const LOAD_USER_PW = __ENV.LOAD_USER_PW || 'load-pw-123';
const BODY = JSON.stringify({ productId: '10ad7e57-0000-4000-8000-000000000001', quantity: 1 });

export const options = {
  scenarios: {
    dogfood_post_uncontended: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '20s', target: 60 }],
      gracefulStop: '0s',
    },
  },
  // M48 (PLAN_BROWSER_PERF_SECURITY.md §2.20, D84) — see checkout-burst.js's own comment.
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
  const res = authedRequest('POST', `${BASE_URL}/cart/items`, BODY, { name: 'cart-add' });
  check(res, { '201': (r) => r.status === 201 });
}
