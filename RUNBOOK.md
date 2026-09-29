# RUNBOOK

The operator's page for this repository: how to bring the target up, point tflw at it, and run the
sweep that is tflw's pre-merge dogfood. The gates, and what each owes, are
[`CONTRIBUTING.md`](CONTRIBUTING.md)'s; the flake table both repositories share is in
[tflw's `RUNBOOK.md`](https://github.com/deepak-tuteja/tflw/blob/main/RUNBOOK.md#flakes).

## The stack

```sh
node cli.mjs start              # postgres, apiV2, nginx, webV2, webV2-admin, the inventory service
node cli.mjs status
node cli.mjs stop               # ephemeral volumes: the next start re-seeds from scratch
VULN_MODE=1 node cli.mjs start  # adds apiV2/src/vuln/'s five routes and nginx's :8445 (VULNS.md)
```

Every container is healthchecked (`status` shows each one). The seed is
deterministic, so two starts serve the same catalogue. `.env` holds the stack's real credentials
and is gitignored; so are the `.env` files under `tflw-acceptance/`.

`VULN_MODE` is the one switch that changes what the target *is*: without it the vulnerable slice
answers `404`, which is what `vuln-slice-hidden-check` asserts; with it, the pentest arc's plants
exist. A sweep starts the stack the way each phase needs it, so neither is a manual step there.

## The eleven envs

`tflw.config` declares one env per blast radius — a test that points somewhere unusual gets an env
nothing else uses, so a mistake in it cannot reach the rest of the suite.

| env | what it points at |
|---|---|
| `local` (default) | the stack as `start` brings it up: apiV2, webV2, the inventory service |
| `webv2Admin` | the admin SPA — `web` is one base URL per env, so the second UI needs its own |
| `ipv6Loopback` | apiV2 through `[::1]`, the base URL an IPv6-first host writes |
| `viaProxy` | apiV2 through an HTTP proxy (`proxy-check`, `NODE_USE_ENV_PROXY=1`) |
| `secureLocal` | nginx's TLS sidecar on `:8443`, the pentest arc's target |
| `mtlsSidecar` | nginx's `:8444`, which requires a client certificate — and gets one |
| `mtlsSidecarNoCert` | the same listener without the certificate, so the refusal is asserted |
| `safetyRedaction` | an endpoint whose PII must reach the report masked |
| `allowHostsBlocked` | a reachable host `allow hosts` does not list (`.demo-fail/`) |
| `unreachableHost` | a port nothing listens on — a connection-layer failure by construction |
| `logConfig` | `log` destinations and levels set in the config, which flags then override |

## Which tflw

The sweep grades the **vendored** tflw in `node_modules/tflw` — the CLI packed as npm would ship it
— not the sibling checkout. After a tflw change:

```sh
npm run refresh-tflw        # re-packs ../testFlow's CLI and reinstalls it here
```

A close-out names the build it graded with `TFLW_BIN` (`TFLW_BIN=../testFlow/packages/cli/dist/cli.cjs`),
so the result is about the branch and not about whatever was vendored last. Every gate prints the
build it read and refuses a vendored build older than the sibling checkout rather than grading it.

## The sweep

```sh
npm run regression                            # every phase, in order
node scripts/regression.mjs --group tooling   # one of core · tooling · safety · security-ui
node scripts/regression.mjs --parallel-groups # the four groups at once: one stack, tree copy and port offset each
node scripts/regression.mjs --list-phases     # the phases and their groups, as JSON
```

The four groups are a partition of the phases, checked at start — a phase in no group would never
run in CI, and the script refuses to start rather than say so later. CI runs one job per group.

On the Fedora box the sweep runs under the box's whole-box lease, as a browser-and-Docker tenant:
check the box is free first, and never put a model beside a Chromium-spawning sweep (the box has
hung silently under exactly that pairing). `--parallel-groups` exists for the box — four groups at
once took the sweep from 42 minutes to 15.

## Regenerating what tflw reads from here

tflw pins two files of this repository and compares them against its own build:

```sh
npm run refresh:check-coverage   # scripts/check-fixture-coverage.json — the check-phase codes the fixtures cover
node scripts/verify-journeys.mjs --write   # CONSTRUCTS.md's journeys table
```

Both are generated, never hand-edited, and both must be regenerated against the tflw build the
change pairs with — on the box, where that build is — and committed with the change. tflw then
re-pins this repository (`node scripts/refresh-sibling-citations.mjs --pr <N>` there).

## Merging a pair

tflw's PR merges first; this repository's pair second (`CONTRIBUTING.md`, *Merge order*). **Merge
this repository's PRs with a merge commit, never a squash**: tflw pins a commit of the PR branch,
and a squash leaves that commit outside `main`'s history, so tflw's `verify:sibling-pin` goes red
with *not an ancestor*. Before merging, drop the PR's `DECLARED_PENDING` entries in
`scripts/verify-provenance.mjs` for the tflw decisions that have now merged.
