import type { Request } from 'express';

// Was this request made over TLS?
//
// Added by testFlow's `M128a` (PLAN_M128_PENTEST_TIER1.md, D293) for one caller: the session
// cookie. `auth.service.ts`'s `res.cookie()` set `httpOnly`/`sameSite`/`maxAge`/`path` and **no
// `secure`**, so the session cookie came back without the `Secure` flag over the nginx sidecar's
// https listener (8443). That is a real defect, not a fixture — it was found by reading this file's
// caller while scoping tflw's Tier 1 hygiene rule pack, before any rule existed to catch it.
//
// WHY THE FLAG IS CONDITIONAL RATHER THAN ALWAYS ON. A `Secure` cookie is simply not sent back over
// plaintext, and ~30 of this suite's files log in over `env local`'s `http://localhost:4001`. An
// unconditional `secure: true` would have logged every one of them in and then dropped the cookie
// on the next request. Conditional is also what a real deployment behind a TLS terminator does.
//
// `req.secure` is Express's own answer and is the whole answer when nothing is in front of the app.
// Here something always is — nginx (8443/8444) and webV2's nginx both `proxy_pass` to plain
// `http://api:4001`, so the app's own socket is never TLS and `req.secure` is always false. The
// terminator's `X-Forwarded-Proto` is the only surviving evidence of the client's scheme, which is
// why `nginx/nginx.conf` now sets it.
//
// Read directly rather than via `app.set('trust proxy', …)`: enabling trust-proxy globally would
// also rewrite `req.ip`/`req.ips`/`req.hostname` for every request in the suite, which is real
// blast radius for a one-caller need. The trade is that a client talking straight to :4001 can
// claim `X-Forwarded-Proto: https` and get a `Secure` cookie it cannot then send — a header-
// spoofing hole in a real app, and the reason a real app terminates the header at its edge. This is
// a dogfood target on a private Docker network with a fixed set of front-ends; noted rather than
// defended, so nobody reads this as the pattern to copy.
export function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const forwarded = req.headers['x-forwarded-proto'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  // A chain of proxies appends, so the value can be `https, http`; the client-facing hop is first.
  return first?.split(',')[0]?.trim().toLowerCase() === 'https';
}
