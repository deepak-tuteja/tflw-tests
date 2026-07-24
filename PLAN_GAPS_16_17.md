# Implementation plan — tflw gaps #16 and #17

Both gaps were found dogfooding `testFlow-tests` (see `TFLW-GAPS.md`, gitignored/local-only, for
the original findings and empirical proof). The fixes themselves land in `testFlow` (tflw's own
"own git repo" — see this repo's `CLAUDE.md`), the same split every prior fixed gap (#1–#10) used:
this doc is the design record kept here, in the dogfood app, because that's where the gap was
found and where the fix gets consumed/verified end-to-end once shipped. No `testFlow` code changes
have been made yet — this is the plan to make them, with every open design question resolved
against the real, current `testFlow` source (paths/lines cited below), not left to a future
session to re-derive.

Both plans were produced by direct codebase research (parser/lexer/interpreter/matcher/checker,
plus live empirical checks against the running `apiV2` stack), not an interactive interview —
consistent with how M31–M33 resolved their own open design questions this session.

---

## Gap #16 — `HEAD`/`OPTIONS` verb support

**Gap recap:** `HttpMethod` (`packages/lang/src/ast.ts:112`) is `'GET' | 'POST' | 'PUT' | 'DELETE'
| 'PATCH'` — no `HEAD`/`OPTIONS` at all, an unaddressed gap (not confirmed-by-design).

### Decisions

**D16.1 — Widen the type, not add a second one.** `HttpMethod` gains `'HEAD' | 'OPTIONS'` as two
more union members, same flat shape as today. No new AST node, no new grammar production — `api
HEAD /health` parses through the exact same `parseApiRequestLine` branch every other verb already
does.

**D16.2 — Three hardcoded lists move in lockstep, not one.** Confirmed by grep: there are
independently-duplicated method lists, not a single source of truth —
- `packages/lang/src/parser.ts:130` — `const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']`
  (drives `isMethodWord()` and the `TF012` "expected an HTTP method (…)" message text).
- `packages/lang/src/lexer.ts:19` — `const METHOD_WORDS = new Set([...])`, used to disambiguate a
  bare `/` starting a path vs. a divide operator (`lexer.ts:276-278`'s own comment). This one is
  easy to miss — it's lexer-level, upstream of the parser, and a `HEAD`/`OPTIONS` line would
  mis-lex before ever reaching `parseApiRequestLine` if this list weren't updated too.
- `packages/lang/src/semanticTokens.ts:38` — VS Code semantic-highlighting keyword list.

All three get `'HEAD', 'OPTIONS'` appended (order: keep the existing five as-is, append the two new
ones at the end — lowest-frequency verbs last, matches how the list already reads by rough
real-world frequency).

**D16.3 — No runtime or interpreter change.** Confirmed by reading `packages/runtime/src/http.ts`
and `interpreter.ts`: `sendRequest`'s `method` is `readonly method: string` and forwarded verbatim
to `fetch`/`undiciFetch` (`http.ts:109,121`); nothing in `interpreter.ts` or `checker.ts`
branches on `HttpMethod` at all (grepped, zero hits). The gap really is parser/lexer-only, exactly
as `TFLW-GAPS.md`'s own "Proposed fix" already predicted — confirmed, not just assumed.

**D16.4 — No body-clause gating by method.** Open question: should `HEAD`/`OPTIONS` be barred from
carrying `body`/`form`/`upload`, since a `HEAD` request body is unusual? Resolved **no** — checked
`parseApiRequestLine` (`parser.ts:1068-1071`): today's grammar lets *any* verb, including `GET`,
carry a body clause with zero method-based restriction. Adding a new restriction only for the two
new verbs would be new, inconsistent behavior the language doesn't otherwise enforce — not fixing
anything. Leave it exactly as permissive as every other verb.

**D16.5 — Docs/tooling surface, confirmed by direct search, not guessed:**
- `packages/lang/GRAMMAR.md:98` — `METHOD := 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'`
  production — add `| 'HEAD' | 'OPTIONS'`.
- `packages/vscode/syntaxes/tflw.tmLanguage.json:44-45` — the method-keyword regex
  (`\b(GET|POST|PUT|DELETE|PATCH)\b`) — add the two new verbs; also update its own `comment` field.
- `packages/lang/test/__golden__/errors/unknown-method.txt` — the `TF012` golden test's expected
  message text embeds the literal list (`expected an HTTP method (GET, POST, PUT, DELETE,
  PATCH), found \`FETCH\``) — this golden file's expected output changes and must be updated in
  the same commit, or the test goes red for a reason unrelated to a real regression.
- **Checked, no change needed:** `SPEC.md` §5.1 documents the request line as `<METHOD>` (a
  placeholder, `SPEC.md:486`), not an enumerated list — nothing to update there. `spec-data.ts`'s
  `TF012` manifest entry (`spec-data.ts:90`) keeps its existing `FETCH`→`PATCH` example as-is
  (`FETCH` still isn't a real method either way). No LSP completion list exists for method words
  (grepped `packages/lsp-server/src/resolution/completion.ts` — no hits), so nothing to update
  there.

**D16.6 — Real consuming test in `testFlow-tests`, empirically verified against apiV2, not
assumed.** Checked live against the running stack (`curl -sD -`):
- `HEAD /v1/products` → real `200`, `Content-Length: 45296` identical to the equivalent `GET`,
  empty body — Express already auto-implements `HEAD` for any `GET` route (strips the body, keeps
  headers). **No `apiV2` backend change needed.**
- `OPTIONS /v1/products` → real `404` (`application/problem+json`) — `apiV2` has no CORS/global
  OPTIONS handler configured (`main.ts` has no `enableCors`), so it falls through to the app's own
  RFC7807 catch-all. Also a legitimate, real assertion target — proves `OPTIONS` isn't silently
  special-cased anywhere in the stack once the DSL can express it.

  Once shipped: `tests/.checkonly/http-method-head.tflw` (currently proves the *parse failure* —
  its whole premise disappears once this ships, same as gap #4's `wait-until-headers.tflw`
  precedent) moves out of `.checkonly/` into a real passing test — e.g. folded into
  `http-protocol-corners.tflw` (M30's own file, thematically the right home) with two new cases:
  `HEAD /products` (`expect status equals 200`, `expect header "content-length" equals
  "{knownLength}"` via a same-test `GET` capture, `expect body text equals ""`) and `OPTIONS
  /products` (`expect status equals 404`). New `@httpProtocolCorners` cases, no new tag.

### Sequencing

Small, mechanical, low-risk — implement and ship first, independently of gap #17.

---

## Gap #17 — binary-safe body assertion

**Gap recap:** `sendRequest` (`packages/runtime/src/http.ts:127`) calls `await res.text()`
unconditionally; `body text` is the only body subject; a binary response (confirmed via
`order-receipts.tflw`'s real `/FlateDecode` PDF) gets irreversibly UTF-8-corrupted before any
assertion ever sees it. Ranked **High × Low** in `TFLW-GAPS.md`.

This is a materially bigger design surface than gap #16 — every open question below was either
resolved by reading the runtime end-to-end or by a direct empirical Node repro, not left open.

### Decisions

**D17.1 — Capture raw bytes alongside (not instead of) decoded text, read once.** `ResponseTrace`
(`packages/runtime/src/types.ts:74`) gains a new field, `bodyBytes: Buffer` — the untouched
response body. `sendRequest` can't call both `res.text()` and `res.arrayBuffer()` on the same
`Response` (the body stream is single-read); instead it reads `await res.arrayBuffer()` once,
wraps it `Buffer.from(...)`, and derives `bodyText` from *that* buffer instead of from `res.text()`
directly.

**Verified this is behavior-preserving, not just assumed:** confirmed via a direct Node repro that
`Buffer.from(bytes).toString('utf8')` and `res.text()`'s own internal `TextDecoder('utf-8').decode()`
produce byte-for-byte identical output on the same bytes (including the replacement-character
behavior on invalid UTF-8 that gap #17's own write-up measured) — so every existing JSON/text
assertion in the whole 229-test suite keeps working exactly as today; this is additive, not a
behavior change to `bodyText`/`json`.

**D17.2 — New subject: `body bytes`, not a generator/transform function.** Considered and rejected
the write-up's alternative ("a `checksum(body)` generator-style function") — generators/transforms
(`unique(...)`, `base64 encode(...)`, etc.) are pure functions of *literal or captured* values
(SPEC §7.6); there's no existing route for a generator to reach into the live response the way a
`Subject` already does, and inventing one would be a materially bigger grammar change for no real
gain. `body bytes` fits the existing `Subject` union cleanly — response-scoped, same constraint
every other subject already has (SPEC §5.3), mirrors `body text`'s own two-keyword shape exactly:

- `packages/lang/src/ast.ts` — new `BodyBytesSubject extends Node { type: 'BodyBytesSubject' }`,
  added to the `Subject` union alongside `BodyTextSubject`.
- `packages/lang/src/parser.ts:1374-1384` (`parseSubject`'s `'body'` case) — add an `else if
  (this.isKw(this.peek(), 'bytes'))` branch parallel to the existing `text` branch (line 1376-1380).
- `packages/runtime/src/interpreter.ts`'s `resolveSubject` (`:1263`) — new case returning
  `response.bodyBytes` (label `'body bytes'`), parallel to the existing `BodyTextSubject` case.
- `any`/`all` on `body bytes`: **no new code needed** — `evaluateQuantified` (`interpreter.ts:1217`)
  already throws unless `step.subject.type === 'BodySubject'`; a `BodyBytesSubject` falls into that
  existing guard automatically, correctly rejecting a meaningless combination (raw bytes aren't a
  quantifiable array) for free.
- `capture body bytes as x` works with zero special-casing too — `execCapture` is already
  subject-generic (`interpreter.ts:1124`).

**D17.3 — Two matchers, not four.** Considered `equals`/`contains` against the raw bytes too;
rejected — there is no non-lossy way to spell an arbitrary binary literal inline in a `.tflw` file
(no byte-array or base64 literal syntax exists in the grammar, and inventing one is a separate,
much bigger feature), so `equals`/`contains` would only ever be reachable via a *captured* variable
from an earlier `body bytes` capture, which is gap #12's already-known, already-accepted limitation
(no assertion route needs adding for that case — it's not new). Scoped to exactly the two
assertions that answer this gap's real motivating case ("prove the file I get back is the file
that was actually sent," `TFLW-GAPS.md` gap #17's own framing):

1. **`hasCount N`** — byte length, reusing the existing matcher. `count()`
   (`packages/runtime/src/matcher.ts:209`) gains one branch: `if (actual instanceof Uint8Array)
   return actual.length;` (`Buffer` extends `Uint8Array`, so this covers `bodyBytes` directly). No
   new matcher name needed — genuinely just widening what `hasCount` already accepts.
2. **`matches file "<path>"`** — a new matcher, byte-for-byte comparison against a file on disk.
   This is the one genuinely new piece of grammar, and it has a strong direct precedent already in
   the codebase: `matches schema "Name" from "source"` (gap #6's fix) is *already* a matcher that
   doesn't use the generic `value: Value` operand — it carries its own dedicated fields
   (`schemaName`/`schemaSource`, `ast.ts:288-293`) and is dispatched around `evalMatcher` entirely
   in `evaluateExpect` (`interpreter.ts:1206-1208`) because it needs an async fetch. `matches file
   "<path>"` is structurally identical, swapping "fetch a URL" for "read a file":
   - `ast.ts`: `MatcherName` gains `'matchesFile'`; `Matcher` gains `filePath?: StringLit` (one
     field, not two — no `from` clause needed, there's only one operand).
   - `parser.ts`'s `matches` branch (`:1463-1481`) gains a third arm alongside `subset`/`schema`:
     `if (this.isKw(this.peek(), 'file')) { … return { …, name: 'matchesFile', filePath, … } }`.
   - **Path is a plain string literal, not `{var}`-interpolated** — matching `matchesSchema`'s own
     existing behavior exactly (`schemaName!.value`/`schemaSource!.value` are read directly, never
     run through `evalValue`, confirmed at `interpreter.ts:1207`). Deliberate consistency with the
     established precedent, not an oversight.
   - New `packages/runtime/src/binary-match.ts` (mirrors `contract.ts`'s existing dedicated-module
     precedent for `evaluateSchemaMatch`): `evaluateFileMatch(label, actual: Buffer, filePath:
     string, baseDir: string, negated: boolean): Promise<MatchOutcome>` — resolves the path via
     `node:path`'s `resolve` (same helper `interpreter.ts:10` already imports as `resolvePath`),
     reads it via `readFile(abs)` (same `Buffer`-returning call `UploadBody` already uses,
     `interpreter.ts:1086`), and compares via `Buffer.equals()`. Applies `negated` itself (same
     shape as `evaluateSchemaMatch`'s own `negated` param) since it bypasses `evalMatcher`'s
     built-in negation handling entirely.
   - `interpreter.ts`'s `evaluateExpect` (`:1196`) gains a `baseDir: string` parameter (threaded
     from `execExpect`, `:1105`, and `execWaitUntilApi`'s own already-in-scope `baseDir` param,
     `:1130-1167` — both call sites already have `tc.baseDir`/`baseDir` on hand, this is pure
     threading, not new plumbing) and a new branch dispatching `matchesFile` the same way
     `matchesSchema` already is (`:1206-1208`).

**D17.4 — Report/message representation needs a real fix, found by reading `repr()`, not
assumed.** `repr()` (`matcher.ts:222`) is `JSON.stringify(value)` for anything non-string — on a
`Buffer`, `JSON.stringify` serializes it as `{"0":37,"1":80,"2":68,...}`, one object key per byte —
unreadable garbage in both a `capture`'s step message (`execCapture`, `:1127`) and any `hasCount`
failure message. `repr()` gains a `Buffer`/`Uint8Array` branch: `` `<binary body, ${value.length}
bytes>` `` — human-readable, no attempt to dump raw bytes into text (the whole point of this gap).

**D17.5 — Non-goals, explicitly deferred, not silently dropped:**
- A hashing/checksum generator (`sha256(body)` or similar) — the write-up's other considered
  option. `matches file` already answers the real motivating case (byte-for-byte round-trip proof)
  with zero new dependencies and reuses existing file-reading infrastructure; a hash function adds
  a new dependency (or a hand-rolled digest) for a capability `matches file` already covers more
  directly. Revisit only if a real scenario needs comparing against a *remote* expected hash rather
  than a local fixture file.
- `equals`/`contains` directly on `body bytes` — see D17.3.

### Consuming test design in `testFlow-tests`, resolved concretely (not "TBD")

Reuses M32's existing `GET /orders/{id}/receipt` PDF endpoint — confirmed deterministic (read
`order-receipt.util.ts` in full: the only variable input is `order.createdAt`, a stable persisted
timestamp, no `new Date()`/randomness at render time — the same order's receipt is byte-identical
across repeated fetches).

Rejected a committed binary fixture file (`tests/payloads/expected-receipt.pdf`) — it would couple
the test to the seed data's exact order id/timestamp being bit-for-bit reproducible across every
reseed, a fragile dependency this project doesn't otherwise take on anywhere else. Resolved
instead with a self-contained, seed-independent design: fetch the receipt once, capture its bytes,
dump *those exact bytes* to a scratch file via a small new JS helper, fetch the same receipt again,
and compare the second fetch against the scratch file — proves real round-trip byte stability
without depending on any fixture ever being pre-generated or kept in sync:

```
api GET /orders/{orderId}/receipt
  header "Authorization" is "Bearer {adminToken}"
expect status equals 200
capture header "content-length" as receiptLength
capture body bytes as receiptBytes
let saved = save temp file(receiptBytes, "{scratchPath}")

api GET /orders/{orderId}/receipt
  header "Authorization" is "Bearer {adminToken}"
expect body bytes hasCount {receiptLength}
expect body bytes matches file "{scratchPath}"
```

New `tests/helpers/save-temp-file.ts` (JS escape hatch — this is filesystem scratch-space
management, not an assertion, the correct side of the escape-hatch fence per every prior
confirmed-by-design entry). Folds into `order-receipts.tflw` (M32's own file) as new
`@orderReceipts` cases — no new tag.

### Sequencing

Larger surface than gap #16 (new AST node, new matcher, new runtime module, `ResponseTrace` field
addition, `evaluateExpect` signature change) — implement second, after #16 ships and its own
regression sweep is clean, so a problem in one doesn't get conflated with the other.

---

## Verification plan (both gaps, upstream in `testFlow`)

Same bar every prior gap fix (#1–#10) was held to (`TFLW-GAPS.md`'s own "Fixed" section is the
template):

1. `testFlow`'s own workspace test suite (`npm test` across all 6 packages) green, with new unit
   coverage: gap #16 — parser test for `HEAD`/`OPTIONS` parsing successfully + lexer disambiguation
   test; gap #17 — `http.ts` test proving `bodyBytes`/`bodyText` both correct on a real binary
   fixture, `matcher.ts` tests for `hasCount` on bytes and `matches file` (pass/fail/negated), a
   `binary-match.ts` unit test for the file-read-and-compare path itself.
2. `npm run typecheck` clean workspace-wide.
3. `npm run build` (including `packages/docs-site`'s `vitepress build`, since `GRAMMAR.md`/SPEC
   changes cascade into the generated docs site) succeeds.
4. Vendored tarball refresh in `testFlow-tests` (`npm run refresh-tflw`), fresh Docker restart,
   `npx tflw check` (all files, no problems) → `npx tflw run` full suite green, including the new
   `http-protocol-corners.tflw`/`order-receipts.tflw` cases → repeat clean under `--workers 4` on
   another fresh restart → full `npm run regression` (14-phase) sweep green.
5. Both gap entries in `TFLW-GAPS.md` move from the ranked table into a new `##
   Fixed` sub-entries (#16, #17), following the exact write-up shape every prior fixed gap already
   uses — what shipped, what changed here in response, verification evidence.

## What this doc is not

Not a decision to implement immediately — this session's ask was specifically to plan and record
these two gaps first. Actual `testFlow` code changes are a separate, future implementation pass
against `testFlow`'s own repo, using this doc as the resolved design (no open questions left to
re-derive when that pass starts).
