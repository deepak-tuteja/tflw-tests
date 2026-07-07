# tflw feature gaps found while building this suite

Discovered while building the M1.5 showcase expansion (parallelization, negative cases, richer API
scenarios). Per that milestone's scope decision, **tflw itself (`testFlow/`) is not touched here**
— these are backlog notes for a future testFlow session, not fixes.

Three related findings from the *same* planning pass turned out to already be fixed/documented
upstream in `testFlow/` (PLAN.md decision 86, testFlow/PROGRESS.md M2.10) rather than left open:
`report.html` now shows every `retry` attempt's evidence (not just the last), and SPEC.md now
documents `before file`/`after file`'s scope isolation and `unique`-vs-`random` retry-stability.
Not repeated here — see testFlow/PLAN.md decision 86 for the full writeup.

## 1. No native page-walk primitive

The DSL has no loops/conditionals by design (SPEC §7.5 — branching lives in JS). A single `api`
step can only ever see one page of a paginated response; walking every page of `GET
/products?page=N&pageSize=M` requires the JS escape hatch (`tests/helpers/paginate.ts`'s
`walkAllPages`), which does its own `fetch`-based loop and returns an aggregate for the DSL to
`expect` against. See `tests/pagination.tflw`. A future `for each page`-style construct is out of
scope for now — noted as a real gap, not urgent.

## 2. No `Retry-After`-aware retry

`retry N` (SPEC §4.4) is fixed-count only — it has no way to read a response header (like
`Retry-After` on a `429`) to schedule its next attempt. `tests/rate-limit.tflw`'s JS helper
(`tests/helpers/sleep-and-retry.ts`) is the workaround: it sleeps for the server-specified duration
after the DSL captures the header, then the DSL re-issues the request itself as an ordinary `api`
step.

## 3. `wait until api` cannot carry per-step headers

Confirmed by reading the parser (`testFlow/packages/lang/src/parser.ts`): `parseApiStep` calls
`parseApiHeaders()` after the request line, but `parseWaitUntilApi` does not — a plain `api` step
can attach `header "X" is "Y"` lines under it, but a `wait until api` block cannot. Session headers
(`as <session>`) still apply automatically to both (they're threaded through `EvalCtx.sessionHeaders`
at request-build time, not parsed per-step), but a dynamically-generated per-test header value
(e.g. this suite's `X-Test-NS` parallel-safety namespace) cannot be attached to a poll.

Impact here: `tests/order-workflow.tflw` and `tests/.demo-fail/wait-timeout.tflw` skip
`X-Test-NS` namespacing entirely rather than partially namespace some steps and not others — safe
in both cases only because they look up a single order by its globally-unique id and never make a
list-based assertion that cross-file `default`-bucket contamination could corrupt. A scenario
needing both `wait until api` *and* list-safety would have no clean way to combine them in v0.1.

## 4. Only one `session` may be opted into per test

`test ... as <session>` is a single optional clause — genuinely interleaving a second identity in
one test (`tests/interleaved-sessions.tflw`) requires an inline ad hoc login rather than a second
`as <name>` clause. Easily worked around; noted since it wasn't obvious from SPEC prose alone.

## 5. No cookie-subject / cookie-jar (discovered building v2's M1 auth cluster)

`capture header "set-cookie" as x` captures every `Set-Cookie` line, newline-joined if there's more
than one (SPEC §5.4, decision 61) — correct for *reading* them, but there's no declarative way to
turn that back into a `Cookie` header a real cookie jar would send (attribute-stripped, one line,
last-value-wins per name). Reusing the whole raw capture as a `Cookie` header value happens to work
when a response sets **exactly one** cookie (`cookie-parser` tolerantly parses the leftover
`Path=/`/`HttpOnly`/etc. as junk keys alongside the real one) — that's the pattern
`tflw.config`'s `shopper` session and most of `sessions.tflw` rely on. It stops working the moment a
response sets **two or more** cookies at once (e.g. `/auth/session-login-full`'s `session` +
`session_refresh`): the newline-joined capture would put a literal `\n` inside an HTTP header
value, which real HTTP clients reject outright as header injection — not a graceful failure, a hard
error. `sessions.tflw`'s dual-cookie test works around this by only ever *asserting* on the raw
`set-cookie` capture (regex matches for `HttpOnly`/`SameSite`/attributes) rather than trying to
chain it into a further request. A first-class cookie subject (SPEC §16 parking lot P#33) — one
that tracks cookies by name, applies `Set-Cookie` attribute semantics, and re-serializes only
name=value pairs on the next request — is a real, recurring gap, not a branching/computation punt;
ranked properly in M5's `TFLW-GAPS.md` once the full v2 suite has surfaced every recurrence.
