#!/usr/bin/env node
// M49 (PLAN_WEBV2_M45.md): `tests/.checkonly/` only covered 3 of 22 assigned TF0xx codes
// (TF011/TF014/TF028), manually run per its own header comments, never wired into
// regression.mjs/CI. Durable, repeatable proof for every remaining code: 13 via static fixtures
// under `tests/.checkonly/` (checked against this project's own real `tflw.config`, same as the
// 3 pre-existing fixtures), and 7 config-dialect codes (TF020-025, TF029) via inline fixture
// content written to a throwaway scratch directory and checked there — `tflw.config` is always
// read from `cwd` (`packages/cli/src/cli.ts`), so the config dialect's own diagnostics can't be
// triggered against a real file living inside this project without breaking the whole suite.
// TF004-009/TF017-019 are reserved, not assigned — nothing to dogfood there (SPEC.md).
//
// DRIFT CLOSED (M86, 2026-08-04). The closing line used to read "All N assigned TF0xx codes" where
// N was `Object.keys(...).length` — this script's own fixture count, not the count of codes tflw
// assigns. The two were equal at M49 and stopped being equal the next time tflw added a code, and
// the sentence went on claiming completeness for a year of milestones: at the point this was
// noticed, `TF033`/`TF034`/`TF035` had no fixture at all and the line still said "all". A
// completeness claim with nothing enforcing it is not a strong claim that might be stale — it is
// already stale, and it is exactly the class of defect the launch review was opened to find.
//
// The repair is `assignedCodes()` below: the expected list is read out of the *installed tflw
// bundle's* own §17 manifest, so adding a code to tflw and not dogfooding it here fails this
// script. tflw's `packages/lang/test/diagnosticsCoverage.test.ts` (M86) is the other half — it
// keeps that manifest in step with `Codes`, which is what makes it worth reading.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// IF YOU ARE READING THIS BECAUSE THIS SCRIPT WENT RED, RUN THIS FIRST (M132b, D351):
//
//     npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs
//
// `refresh-tflw` re-packs from the local tflw checkout, so this answers in seconds, on your own
// machine, with no Docker, no 32-phase sweep, no PR and no merge. **This is the whole of the fix
// for `M130-07`, and it is a discipline rather than machinery** — nothing forces anyone to run it,
// and that is a decision (D350) rather than an omission.
//
// WHAT THE RED USUALLY MEANS. A tflw milestone that assigns a diagnostic code is a **breaking
// change for this repository's `main`, with no additive path**: the moment it merges, CI here
// re-packs tflw from its live `main` (`.github/workflows/ci.yml`, checkout deliberately unpinned —
// pinning a `ref:` would kill the dogfooding exactly when it matters, and has been rejected twice)
// and this script demands a fixture that does not exist yet. So the tflw PR and the companion PR
// here are one unit of work: **a tflw milestone that adds a code is not done until both have
// merged**, and they merge back-to-back to keep the red window as short as a human can make it.
//
// The window is **not bounded by anything automatic**, and that is deliberate. Nothing in this
// repository re-runs when tflw merges; a cron would make the red *more* visible without making it
// shorter, which is the opposite of the pain. Observed three times (`M129`, `M130b2`, and once on
// `M131`'s PR in the reverse direction), each time correctly, each time with the repair already
// known. When `main` goes red here the gate is **telling the truth** — a code really did ship and
// the fixture really is missing — so an unbounded window means a true statement goes unobserved,
// not that a bug goes unfixed.
//
// **Reopen `M130-07` if a code reaches tflw `main` with no fixture here and the red is found by
// someone other than whoever caused it.** That is the condition under which discipline has
// demonstrably stopped working and machinery becomes worth its cost.
// ─────────────────────────────────────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// The *installed* tflw by default, which is the question this proof exists to answer: does the tflw
// a user would get have a fixture for every code it assigns. `TFLW_CLI_ENTRY` asks the other
// question — does a build in hand — and it is the same D9 split `check-acceptance.mjs`'s `TFLW_BIN`
// makes, for the same reason. It matters more here than it looks: this script reads tflw's
// diagnostic manifest out of the bundle, so against a stale vendored tarball it grades the fixtures
// against a *stale list of codes* and can fail in either direction — missing fixtures for codes
// that shipped, or "stale" fixtures for codes that had not yet. `M128-04` is the driver that made
// that easy to hit; this is how you check a branch build without reinstalling one.
const CLI_ENTRY = process.env.TFLW_CLI_ENTRY ?? path.join(ROOT, 'node_modules', 'tflw', 'dist', 'cli.cjs');

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

// Both streams, whatever the exit code — and `spawnSync` rather than `execFileSync` for exactly
// that reason. `execFileSync` hands back **stdout only** on success and reaches stderr solely via
// the thrown error, so the old success branch here could return `''` and be right: every shipped
// diagnostic was error-severity, so anything that reported also exited 2 and took the catch.
//
// tflw M97e/D147 ended that. `TF043`'s run tier is a **warning**, written to stderr at exit 0, so
// a fixture whose only diagnostic is a warning would have had its output discarded and been
// reported here as not reporting its code — a loud failure, but one blaming tflw for a defect in
// this script. The guard is supposed to be the thing that can be trusted when the two disagree.
function runCheck(args, opts = {}) {
  const { stdout, stderr } = spawnSync('node', [CLI_ENTRY, 'check', '--no-color', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  return (stdout ?? '') + (stderr ?? '');
}

// --- test-dialect codes: real fixtures under tests/.checkonly/, checked against the real project
// tflw.config (same as the 3 pre-existing fixtures, now also wired in here rather than only ever
// run by hand per their own header comments) ------------------------------------------------------
const FILE_FIXTURES = {
  TF001: 'stray-character.tflw',
  TF002: 'unterminated-string.tflw',
  TF003: 'bad-indent.tflw',
  TF010: 'missing-path.tflw',
  TF011: 'bad-keyword.tflw',
  TF012: 'unknown-method.tflw',
  TF013: 'unknown-subject.tflw',
  TF014: 'unknown-matcher.tflw',
  TF015: 'empty-block-body.tflw',
  TF016: 'bare-toplevel-step.tflw',
  TF026: 'unknown-api-service.tflw',
  TF027: 'unknown-table-column.tflw',
  TF028: 'bad-session.tflw',
  TF030: 'unbound-variable.tflw',
  TF031: 'request-and-response-combined.tflw',
  TF032: 'malformed-upload-type.tflw',
  TF033: 'workload-without-threshold.tflw',
  TF034: 'threshold-unknown-label.tflw',
  TF035: 'duplicate-action.tflw',
  TF037: 'unknown-call.tflw',
  TF038: 'call-wrong-arity.tflw',
  TF039: 'assert-before-any-request.tflw',
  TF040: 'call-in-dead-position.tflw',
  TF041: 'value-subject-misplaced.tflw',
  TF042: 'matcher-subject-mismatch.tflw',
  TF043: 'missing-referenced-file.tflw',
  TF044: 'action-call-cycle.tflw',
  TF045: 'unbalanced-bracket.tflw',
  TF046: 'empty-tag.tflw',
  TF047: 'unknown-escape.tflw',
  TF048: 'tab-indent.tflw',
  TF049: 'hidden-character.tflw',
  TF050: 'confusable-word.tflw',
  TF052: 'mask-without-snapshot.tflw',
  TF053: 'capture-uncapturable-subject.tflw',
  TF054: 'invalid-literal-operand.tflw',
  // TF055's second operand is this project's own `defaults timeout wait 5s`, so unlike TF051 and
  // TF057/TF058 below it needs no scratch config — the real config already withholds the budget.
  TF055: 'hold-exceeds-wait-timeout.tflw',
  TF056: 'data-table-extension.tflw',
  TF059: 'service-with-absolute-url.tflw',
  // TF060 is NOT here — it moved to its own scratch-config pair below when the root config gained
  // an `authorized target` (M130c). See that block for why.
  //
  // The pentest arc's Tier 2 (tflw `M130b2`). Three codes, not the two the plan budgeted, because a
  // diagnostic code is one *repair* rather than one topic: TF062 says move the credential into a
  // `session`, TF063 says give the assertion an identity to subtract, TF064 says poll first and
  // assert after. The fourth constraint in that family — the same assertion inside a
  // workload-bearing test — is `TF033`, filed with its neighbours for exactly the same reason, and
  // is why `workload-without-threshold.tflw` above is still TF033's only fixture.
  //
  // These three were written a milestone before they could be wired: this script grades against the
  // *installed* bundle in both directions, so a row here for an unshipped code fails as loudly as a
  // missing one. Wiring them is what proves the tflw the vendored tarball resolves really does
  // assign them (M130c).
  TF062: 'authz-step-names-own-credential.tflw',
  TF063: 'authz-assertion-without-owner.tflw',
  TF064: 'authz-assertion-in-wait-until.tflw',
};

for (const [code, file] of Object.entries(FILE_FIXTURES)) {
  const out = runCheck([`tests/.checkonly/${file}`]);
  ok(`${code}: tests/.checkonly/${file} reports ${code}`, out.includes(`[${code}]`), out.trim().split('\n')[0]);
}

// --- config-dialect codes: inline fixture content, own scratch tflw.config per case -------------
const CONFIG_FIXTURES = {
  TF020: 'env local default\n  api "http://localhost:4001"\n  headr "Accept" is "application/json"\n',
  TF021: 'env local default\n  api "http://localhost:4001"\n\ntest "not allowed here"\n  api GET /health\n',
  TF022: 'workers 3\n\nenv local default\n  api "http://localhost:4001"\n',
  TF023: 'defaults\n  timeout step 5x\n\nenv local default\n  api "http://localhost:4001"\n',
  TF024: 'env local default\n  api "http://localhost:4001"\n\nenv other default\n  api "http://localhost:4002"\n',
  TF025: 'defaults\n  web "http://localhost:8090"\n\nenv local default\n  api "http://localhost:4001"\n',
  TF029:
    'env local default\n  api "http://localhost:4001"\n\nsession admin\n  api POST /auth/login body { email: "a@a.com", password: "x" }\n\nsession admin\n  api POST /auth/login body { email: "a@a.com", password: "x" }\n',
  // tflw M85 (review cluster C1 / `A4-10`): the active env's own base URL against its own
  // `allow hosts`. It has to be the *default* env here — the check is env-scoped, and this script
  // runs `tflw check` with no `--env`.
  TF036: 'env local default\n  api "http://localhost:4001"\n  allow hosts "example.com"\n',
  // tflw M128b (pentest arc Tier 1 / D291): a declaration that authorizes nothing. A wildcard is
  // rejected here even though `allow hosts` accepts one, and the two only look alike: `allow hosts`
  // bounds where ordinary traffic may go, and a bound expressed as a pattern is still a bound. This
  // one is an author affirming they are permitted to scan a named host — and nobody is authorized
  // to scan `*.example.com`, because a pattern records a claim whose scope its author could not
  // have known when they wrote it. (The sibling case, a target with no scheme, reports the same
  // code one step earlier: `TF060` compares origins, and a bare hostname has none.)
  TF061:
    'defaults\n  authorized target "https://*.example.com" reason "staging sweep"\n\nenv local default\n  api "http://localhost:4001"\n',
};

const scratchDir = mkdtempSync(path.join(tmpdir(), 'tflw-check-config-'));
try {
  for (const [code, content] of Object.entries(CONFIG_FIXTURES)) {
    writeFileSync(path.join(scratchDir, 'tflw.config'), content);
    const out = runCheck([], { cwd: scratchDir });
    ok(`${code}: a scratch tflw.config reports ${code}`, out.includes(`[${code}]`), out.trim().split('\n')[0]);
  }
} finally {
  rmSync(scratchDir, { recursive: true, force: true });
}

// --- TF051: the two-operand code — a real fixture file, checked against generated configs -------
//
// Every other test-dialect fixture above is checked against this project's own `tflw.config`.
// `TF051` cannot be, and that is a property of the rule rather than an inconvenience: it fires on
// the gap between what a step needs and what the active env declares, and every env in this
// project declares an `api` base while the two that run browser steps declare `web` too. That is
// the correct state for a suite that works — so no file dropped into `tests/.checkonly/` can
// trigger it, and hijacking one of the api-only envs (`unreachableHost`, `mtlsSidecar`) with
// `--env` would cover only the `web` half while coupling this proof to an env that exists for an
// unrelated reason.
//
// So the fixture stays a real, readable file in the repo — it is dogfood, not a string in a script
// — and gets copied into a scratch directory that supplies the second operand. Each config
// withholds one half, and the *same unmodified file* reports a different diagnostic under each,
// which is the demonstration that the rule reads the config rather than the source text.
//
// The counts are asserted, not just the presence of the code. Under a config with no `web` exactly
// one site fires; under a config with no default `api` exactly two do — the un-prefixed request
// line and the relative `matches schema … from` source. Presence alone would stay green if the
// named-service control (`api orders GET /health`) started reporting, and that control is the one
// with real blast radius: it is the shape this project's own `env local` uses for `api inventory`.
const ENV_FIXTURE_FILE = 'missing-base-url.tflw';
const ENV_FIXTURES = [
  {
    label: 'an env that declares `api` but no `web`',
    config: 'env local default\n  api "http://localhost:4001"\n  api orders "http://localhost:5000"\n',
    expect: '`open` needs a `web` base URL',
    forbid: 'needs an `api` base URL',
    count: 1,
  },
  {
    label: 'an env that declares `web` but no default `api`',
    config: 'env local default\n  web "http://localhost:8090"\n  api orders "http://localhost:5000"\n',
    expect: 'needs an `api` base URL',
    forbid: 'needs a `web` base URL',
    count: 2,
  },
];

const envDir = mkdtempSync(path.join(tmpdir(), 'tflw-check-env-'));
try {
  copyFileSync(path.join(ROOT, 'tests', '.checkonly', ENV_FIXTURE_FILE), path.join(envDir, ENV_FIXTURE_FILE));
  // The fixture's last test names `./schema.json` relative to itself. Present so the run under test
  // is a clean `TF051` rather than `TF051` plus a `TF043` warning about a file this proof never
  // meant to be missing.
  writeFileSync(path.join(envDir, 'schema.json'), '{}\n');
  for (const { label, config, expect, forbid, count } of ENV_FIXTURES) {
    writeFileSync(path.join(envDir, 'tflw.config'), config);
    const out = runCheck([ENV_FIXTURE_FILE], { cwd: envDir });
    const fired = out.split('[TF051]').length - 1;
    ok(`TF051: ${ENV_FIXTURE_FILE} under ${label} reports TF051`, out.includes('[TF051]'), out.trim().split('\n')[0]);
    ok(`TF051: ${label} names the missing half`, out.includes(expect), `expected to see "${expect}"`);
    ok(`TF051: ${label} stays silent on the half it declares`, !out.includes(forbid), `unexpectedly saw "${forbid}"`);
    ok(`TF051: ${label} fires at exactly ${count} site(s)`, fired === count, `fired at ${fired} — a control regressed, or a site was added`);
  }
} finally {
  rmSync(envDir, { recursive: true, force: true });
}

// --- TF057/TF058: one file, two configs, and the absence of a declaration is the operand --------
//
// The same shape as `TF051` above and for the same reason — the rule has two operands and one of
// them is the config — but with an inversion worth stating outright, because it is the only place
// in the language where *not* declaring something means more enforcement rather than less. An
// absolute URL under an env that declares `allow hosts` is merely unportable (`TF057`, "`--env`
// will not move it"). The identical line under an env that declares none is a request the run will
// **refuse to send** (`TF058`), because writing an absolute URL is what opts a suite into declaring
// where it may reach.
//
// So neither code can be proven against this project's own `tflw.config`: `env local` declares
// `allow hosts "localhost", "127.0.0.1"`, which settles the choice at `TF057` and makes `TF058`
// unreachable from any file dropped into `tests/.checkonly/`. Hijacking `env webv2Admin` — which
// happens to declare no allowlist — would work and is exactly what `TF051`'s header argues against:
// it couples this proof to an env that exists for an unrelated reason, so the day someone adds an
// allowlist to the admin console's env this proof would go quiet rather than red.
//
// Each case forbids the other's message as well as asserting its own, since the failure that
// matters here is not "no diagnostic" but "the *other* diagnostic" — the two are chosen between,
// and a rule that picked wrong would still report something.
const ALLOWLIST_FIXTURE_FILE = 'absolute-url.tflw';
const ALLOWLIST_FIXTURES = [
  {
    label: 'an env that declares an allowlist',
    // `localhost` belongs in this allowlist even though the fixture never asks for it: an env whose
    // own `api` base is not in its own `allow hosts` is `TF036`, an *error*, and the check stops
    // there — so the first draft of this case proved nothing about `TF057` and said so by reporting
    // `TF036` instead. A scratch config that declares an allowlist has to allow its own base.
    config:
      'env local default\n  api "http://localhost:4001"\n  web "http://localhost:8090"\n  allow hosts "localhost", "api.example.com", "example.com"\n',
    code: 'TF057',
    forbid: 'TF058',
  },
  {
    label: 'an env that declares no allowlist',
    config: 'env local default\n  api "http://localhost:4001"\n  web "http://localhost:8090"\n',
    code: 'TF058',
    forbid: 'TF057',
  },
];

const allowDir = mkdtempSync(path.join(tmpdir(), 'tflw-check-allow-'));
try {
  copyFileSync(
    path.join(ROOT, 'tests', '.checkonly', ALLOWLIST_FIXTURE_FILE),
    path.join(allowDir, ALLOWLIST_FIXTURE_FILE),
  );
  for (const { label, config, code, forbid } of ALLOWLIST_FIXTURES) {
    writeFileSync(path.join(allowDir, 'tflw.config'), config);
    const out = runCheck([ALLOWLIST_FIXTURE_FILE], { cwd: allowDir });
    ok(
      `${code}: ${ALLOWLIST_FIXTURE_FILE} under ${label} reports ${code}`,
      out.includes(`[${code}]`),
      out.trim().split('\n')[0],
    );
    ok(
      `${code}: ${label} does not also report ${forbid}`,
      !out.includes(`[${forbid}]`),
      `both codes fired — the rule stopped choosing between them`,
    );
  }
} finally {
  rmSync(allowDir, { recursive: true, force: true });
}

// --- TF060: one file, two configs, and the absence of a declaration is the operand --------------
//
// **This case used to be a plain `FILE_FIXTURES` row, and M130c is what proved it could not stay
// one.** A `.checkonly` fixture is checked from the repo root, so it reads the *root* `tflw.config`
// — and `TF060` fires on the absence of an `authorized target`. That made the proof depend on the
// shared config never declaring one, which is a dependency on an **absence**, invisible at both
// ends: nothing in the fixture said so, and nothing in `tflw.config` said "adding this here breaks
// a proof over there".
//
// It broke exactly that way. `M130c` gave env `local` an `authorized target` so the dogfood suite
// could run `authz-generated.tflw`, and this row went red with `1 file checked, no problems found`
// — the fixture still existed, still parsed, and had quietly stopped demonstrating anything.
//
// This is the shape `TF051`'s and `TF057`/`TF058`'s headers already argue against; `TF060` was the
// one that had not been converted yet. Its own scratch configs make the operand explicit, and the
// conversion buys a case the old form could not express at all: the **positive** direction, where a
// declared target silences the diagnostic. An absence-based proof can only ever assert the absence.
const AUTHZ_TARGET_FIXTURE_FILE = 'security-without-authorized-target.tflw';
const AUTHZ_TARGET_FIXTURES = [
  {
    label: 'an env that declares no `authorized target`',
    config: 'env local default\n  api "http://localhost:4001"\n',
    expect: 'TF060',
  },
  {
    label: 'an env that declares one naming the base',
    config:
      'env local default\n  api "http://localhost:4001"\n  authorized target "http://localhost:4001" reason "self-hosted fixture"\n',
    expect: null,
  },
];

const targetDir = mkdtempSync(path.join(tmpdir(), 'tflw-check-target-'));
try {
  copyFileSync(
    path.join(ROOT, 'tests', '.checkonly', AUTHZ_TARGET_FIXTURE_FILE),
    path.join(targetDir, AUTHZ_TARGET_FIXTURE_FILE),
  );
  for (const { label, config, expect } of AUTHZ_TARGET_FIXTURES) {
    writeFileSync(path.join(targetDir, 'tflw.config'), config);
    const out = runCheck([AUTHZ_TARGET_FIXTURE_FILE], { cwd: targetDir });
    if (expect) {
      ok(
        `${expect}: ${AUTHZ_TARGET_FIXTURE_FILE} under ${label} reports ${expect}`,
        out.includes(`[${expect}]`),
        out.trim().split('\n')[0],
      );
    } else {
      // The half that matters most after M130c: a suite that *has* permission must not be nagged,
      // and this is what would have caught the old row going quiet instead of red.
      ok(
        `TF060: ${AUTHZ_TARGET_FIXTURE_FILE} under ${label} is silent`,
        !out.includes('[TF060]'),
        out.trim().split('\n')[0],
      );
    }
  }
} finally {
  rmSync(targetDir, { recursive: true, force: true });
}

// --- TF065/TF066: one file, one config, and the operand is the COMMAND LINE ---------------------
//
// The same scratch-pair shape as `TF060` directly above, with the one difference that is the whole
// point of the control: here the second operand is not a config at all. D21 §3.2(3) says a public
// target's affirmation must live somewhere a committed `tflw.config` cannot reach, so the three
// cases below share **one** config and differ only in the invocation — which is exactly the
// property under test, stated as the shape of the test rather than as a comment.
//
// Three outcomes, and the middle one is the reason there are two codes rather than one. A missing
// flag is repaired by adding it; a flag naming the wrong origin is repaired by fixing its value.
// One code for both would have made a generated codes-reference row false, which is the defect
// class `M92` spent a milestone on.
//
// `.invalid` is RFC 2606's never-resolves TLD, so nothing here can reach a host even by accident —
// and under tflw's literal, no-DNS classification it is `public` with no lookup, which is what
// makes an offline fixture able to exercise a control about the internet at all.
const PUBLIC_TARGET_FIXTURE_FILE = 'authz-scan-public-target.tflw';
const PUBLIC_TARGET_CONFIG = [
  'env staging default',
  '  api "https://staging.example.invalid/v1"',
  '  allow hosts "staging.example.invalid"',
  // Declared, so `TF060` is satisfied and cannot be what refuses the run. Without this line the
  // third case below would go red for a reason that has nothing to do with the flag, and the
  // evidence would be vacuous.
  '  authorized target "https://staging.example.invalid" reason "fixture target, never resolved"',
  '',
  'session shopper',
  '  api POST /auth/login body { email: "a@example.invalid", password: "x" }',
  '  expect status equals 200',
  '',
].join('\n');
const PUBLIC_TARGET_FIXTURES = [
  {
    label: 'no affirmation on the command line',
    flags: [],
    expect: 'TF065',
    says: '--allow-public-target https://staging.example.invalid',
  },
  {
    label: 'an affirmation naming an origin this run never scans',
    flags: ['--allow-public-target', 'https://other.example.invalid'],
    expect: 'TF066',
    says: 'matches nothing this run would scan',
  },
  {
    label: 'the affirmation this run actually needs',
    flags: ['--allow-public-target', 'https://staging.example.invalid'],
    expect: null,
  },
];

const publicDir = mkdtempSync(path.join(tmpdir(), 'tflw-check-public-'));
try {
  copyFileSync(
    path.join(ROOT, 'tests', '.checkonly', PUBLIC_TARGET_FIXTURE_FILE),
    path.join(publicDir, PUBLIC_TARGET_FIXTURE_FILE),
  );
  writeFileSync(path.join(publicDir, 'tflw.config'), PUBLIC_TARGET_CONFIG);
  for (const { label, flags, expect, says } of PUBLIC_TARGET_FIXTURES) {
    const out = runCheck([...flags, PUBLIC_TARGET_FIXTURE_FILE], { cwd: publicDir });
    if (expect) {
      ok(`${expect}: ${PUBLIC_TARGET_FIXTURE_FILE} with ${label} reports ${expect}`, out.includes(`[${expect}]`), out.trim().split('\n')[0]);
      ok(`${expect}: names the repair`, out.includes(says), `expected to see "${says}"`);
    } else {
      // The half a missing-flag-only proof cannot express: a suite that *has* affirmed the target
      // must not be nagged. This is also the only case that would catch the gate widening to cover
      // origins it should not.
      ok(`TF065/TF066: ${PUBLIC_TARGET_FIXTURE_FILE} with ${label} is silent`, !out.includes('[TF065]') && !out.includes('[TF066]'), out.trim().split('\n')[0]);
    }
    // D341, asserted in every one of the three: the Tier 1 assertion in that file inspects a
    // response the suite already asked for, so no invocation of this flag has anything to say
    // about it. A gate that quietly widened to cover `security violations` would pass every other
    // check in this script.
    ok(`D341: ${label} leaves the security-violations test alone`, !out.includes('security scan against'), out.trim().split('\n')[0]);
  }
} finally {
  rmSync(publicDir, { recursive: true, force: true });
}

// --- completeness: the expected list comes from tflw, not from this file ------------------------

/**
 * Every TF0xx code the *installed* tflw assigns, read out of the shipped bundle's own SPEC §17
 * manifest (`DIAGNOSTICS` in `@tflw/lang`'s `spec-data.ts`, inlined into `dist/cli.cjs` by esbuild
 * — `{ code: "TF001", meaning: …, example: … }`). `code:` followed by a quoted `TF` number is that
 * manifest and nothing else; SPEC prose elsewhere in the bundle mentions codes in running text, not
 * in that shape.
 *
 * Reading a bundle with a regex is the least appealing part of this script, and it is still the
 * right trade: tflw publishes exactly one file with one `bin` entry and no library export, so the
 * alternatives are a new public API existing only for this test (the `runLoad` mistake — a public
 * export with no production caller), or a second hand-maintained list of codes, which is precisely
 * the thing that drifted. If the bundle shape ever changes, this throws loudly by design: fix the
 * pattern, do not delete the guard.
 */
function assignedCodes() {
  const bundle = readFileSync(CLI_ENTRY, 'utf8');
  const codes = new Set([...bundle.matchAll(/\bcode:\s*["'](TF\d{3})["']/g)].map((m) => m[1]));
  if (codes.size === 0) {
    throw new Error(
      `could not read tflw's diagnostic manifest out of ${CLI_ENTRY}. The bundle's shape changed — ` +
        'update the pattern in assignedCodes() (see @tflw/lang spec-data.ts DIAGNOSTICS). Do not ' +
        'drop this check: without it the summary below is a claim about this file, not about tflw.',
    );
  }
  return codes;
}

const dogfooded = new Set([
  ...Object.keys(FILE_FIXTURES),
  ...Object.keys(CONFIG_FIXTURES),
  'TF051',
  ...ALLOWLIST_FIXTURES.map((f) => f.code),
  ...AUTHZ_TARGET_FIXTURES.map((f) => f.expect).filter(Boolean),
  ...PUBLIC_TARGET_FIXTURES.map((f) => f.expect).filter(Boolean),
]);
const assigned = assignedCodes();

const uncovered = [...assigned].filter((code) => !dogfooded.has(code)).sort();
ok(
  `completeness: every TF0xx code the installed tflw assigns has a fixture here`,
  uncovered.length === 0,
  uncovered.length
    ? `no fixture for ${uncovered.join(', ')} — add one under tests/.checkonly/ (test dialect) or CONFIG_FIXTURES (config dialect).\n` +
      `    A tflw milestone that assigns a code is not done until its companion PR here lands: adding the code is a breaking\n` +
      `    change for this repo's main, and there is no additive path. Check before you open either PR with:\n` +
      `        npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs`
    : '',
);

const stale = [...dogfooded].filter((code) => !assigned.has(code)).sort();
ok(
  `completeness: every fixture here names a code the installed tflw still assigns`,
  stale.length === 0,
  stale.length
    ? `${stale.join(', ')} is dogfooded but is not in the installed tflw's manifest. Either its tflw-side PR has not merged\n` +
      `    yet — merge it, then re-run — or the code was retired, in which case delete the fixture. The first has happened;\n` +
      `    the second never has. To tell them apart locally:\n` +
      `        npm run refresh-tflw && node scripts/verify-check-diagnostics.mjs`
    : '',
);

if (violations > 0) {
  console.error(`\n${violations} check-diagnostic proof violation(s).`);
  process.exit(1);
}
console.log(
  `\nAll ${assigned.size} TF0xx diagnostic codes the installed tflw assigns are dogfooded against a real \`tflw check\`` +
    ` (${Object.keys(FILE_FIXTURES).length} test-dialect fixtures, ${Object.keys(CONFIG_FIXTURES).length} config-dialect,` +
    ` ${ENV_FIXTURE_FILE} against ${ENV_FIXTURES.length} generated configs, ${ALLOWLIST_FIXTURE_FILE} against` +
    ` ${ALLOWLIST_FIXTURES.length} more, and ${AUTHZ_TARGET_FIXTURE_FILE} against ${AUTHZ_TARGET_FIXTURES.length}).`,
);
