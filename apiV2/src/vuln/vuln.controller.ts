import { Controller, Get, Post, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

// The hygiene fixture slice for tflw's pentest arc Tier 1 (testFlow PLAN_M128_PENTEST_TIER1.md,
// D293). Every route here exists to give one of the ten rules in the pack a response it cannot get
// from the real app. `VULNS.md` is the ledger — id, route, rule, expected severity, which acceptance
// case it serves — and `scripts/verify-security-target.mjs` is what keeps this file and that ledger
// from drifting apart.
//
// HEADERS AND COOKIE FLAGS ONLY. No broken authorization, no injection, no logic flaw. That is a
// deliberate line, not an unfinished job: Tier 1 is a passive scan of what a response *says about
// itself*, so a planted flaw it cannot see is cost with no coverage behind it. The expensive
// `vuln/` module the arc sketch has in mind — BOLA/IDOR objects to walk — belongs to Tier 2, when
// there is a generated authorization matrix to walk them with.
//
// TWO OF THE FIVE ROUTES ARE DELIBERATELY CLEAN, which is the non-obvious half. A rule needs three
// demonstrations (D295): it fires, it stays silent, and it reports not-applicable. Clean apiV2
// supplies the *not-applicable* case for `csp-missing`, `x-frame-options` and
// `cors-wildcard-with-credentials` — its responses are JSON and same-origin, so those rules never
// engage at all — and a rule that never engaged has not been shown to stay silent. Only a response
// that is genuinely a document, or genuinely carries CORS headers, and is nonetheless correct can
// do that. `/vuln/document-hardened` and `/vuln/cors-scoped` are those responses.
//
// Excluded from the OpenAPI document for the same reason `safety-demo` is — a test affordance, not
// a product surface — and here for a second reason: the whole module is absent unless `VULN_MODE=1`
// (see `vuln.module.ts`), so including it would make `/openapi.json` vary by environment and every
// contract assertion in this suite vary with it.
@ApiExcludeController()
@Controller('vuln')
export class VulnController {
  // POSITIVE — `sec/cors-wildcard-with-credentials` (critical).
  //
  // `*` with `Allow-Credentials: true` is the combination that matters: a browser refuses to honour
  // it, so this shape means somebody wanted permissive CORS, got a console error, and reached for
  // the wildcard rather than an origin list. Clean apiV2 sends no CORS headers at all (webV2 shares
  // its origin through an nginx proxy for exactly that reason), so the rule is never applicable
  // there and this is the only response in the suite that engages it.
  @Get('cors-wildcard')
  corsWildcard(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return { fixture: 'cors-wildcard' };
  }

  // NEGATIVE — `sec/cors-wildcard-with-credentials`.
  //
  // Credentialed CORS scoped to one named origin: applicable (the rule's precondition is "the
  // response carries Access-Control-Allow-Origin"), and correct. This is what separates "the rule
  // stayed silent" from "the rule never ran".
  @Get('cors-scoped')
  corsScoped(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Access-Control-Allow-Origin', 'https://storefront.example');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    return { fixture: 'cors-scoped' };
  }

  // POSITIVE — `sec/cookie-not-httponly` (critical), `sec/cookie-samesite-none` (moderate), and
  // over the 8443 listener `sec/cookie-not-secure` (critical) as well.
  //
  // Three findings from one response, and that is the point rather than a shortcut: `SameSite=None`
  // without `Secure` is precisely the pairing browsers reject, so the flags are not independent
  // defects to be planted one per route. The real session cookie carries all three flags correctly
  // (`auth.service.ts`), so it is this rule family's negative case and this route is its positive.
  //
  // Named `sid` rather than `session` so it can never be confused with — or overwrite — the real
  // session cookie in tflw's jar.
  @Post('weak-cookie')
  weakCookie(@Res({ passthrough: true }) res: Response) {
    res.cookie('sid', 'fixture-session-value', {
      path: '/',
      sameSite: 'none',
      // No `httpOnly`, no `secure`, and `sameSite: 'none'` — all three deliberate.
    });
    return { fixture: 'weak-cookie' };
  }

  // POSITIVE — `sec/csp-missing` (serious) and `sec/x-frame-options` (moderate).
  //
  // Both rules' precondition is "the response is a document", which no real apiV2 route satisfies:
  // it is a JSON API, and the storefront's HTML is served by webV2's own nginx on a different port.
  // A minimal `text/html` body is the whole fixture.
  @Get('document')
  document(@Res() res: Response) {
    res
      .type('text/html')
      .send(
        '<!doctype html><title>vuln fixture</title><p>no CSP, no X-Frame-Options',
      );
  }

  // NEGATIVE — `sec/csp-missing`, `sec/x-frame-options`, `sec/hsts-missing`,
  // `sec/nosniff-missing`, and `sec/authenticated-response-cacheable` when called with credentials.
  //
  // The same document, hardened. It is one route rather than four because the negative case for
  // each of these rules is the same sentence — "the header the rule asks for is present and
  // correct" — and a response either sets them or it does not.
  //
  // `Strict-Transport-Security` is set unconditionally, including over the plaintext listener,
  // where a browser would ignore it. That is not an oversight: the rule's own precondition is
  // "scheme is https", so over http this response is not-applicable no matter what it sends, and
  // over https it is the negative. Setting it conditionally would add a branch that no rule can
  // observe.
  @Get('document-hardened')
  documentHardened(@Res() res: Response) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; frame-ancestors 'none'",
    );
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
    res.setHeader('Cache-Control', 'no-store');
    res
      .type('text/html')
      .send(
        '<!doctype html><title>hardened fixture</title><p>CSP, XFO, HSTS, nosniff, no-store',
      );
  }
}
