# The runs `baseline.json` was founded on

<sub>**Notation.** `P#n`, `D<n>` and `M<n>` name blocks in design records neither repository
publishes; each resolves in tflw's [DECISIONS.md](https://github.com/deepak-tuteja/tflw/blob/main/DECISIONS.md), which lifts the block verbatim.
**Both repositories number their milestones from 1**, so an unqualified `M<n>` here is tflw's —
this repository's own are written `testFlow-tests M22`, and are published nowhere.</sub>

These are the raw artifacts `scripts/derive-perf-bands.mjs` read to draw the ratio bands in
`../baseline.json`, kept so those bands can be **re-derived rather than believed**:

```
node scripts/derive-perf-bands.mjs \
  tflw-acceptance/perf/founding-runs/2026-08-26T10-29-43-000Z.json \
  tflw-acceptance/perf/founding-runs/2026-08-26T11-20-50-000Z.json \
  tflw-acceptance/perf/founding-runs/2026-08-26T10-23-37-000Z.json
```

The first two were taken on 2026-08-26 under the `tflw:load:conformance` lease (`D746`/`D747`) on an
otherwise idle `fedora-box`, `--profile ladder`, against the repaired apiV2. Both record
`reset.ok: true`, a healthy target on every rung, and a 0% error rate throughout — which is the bar
for founding a baseline at all, and the reason the other runs that day are **not** here.

They are committed rather than left in `~/tflw-perf/results/` on the box for one reason: a baseline
whose provenance is a path on one machine is a baseline nobody can audit. `M154f-09` is the row for
a rule derived from whichever run happened to be green, and the fix for that class is showing the
work, not asserting it more confidently.

Do not add runs here casually — this directory is the *founding* evidence, not a results archive.

## The third run is a partial contributor

`2026-08-26T10-23-37-000Z.json` is **not** a clean run — its apiV2 OOMed mid-ladder, and the
derivation discards every rung that measured apiV2's database in it (failed reset, dead target).
It is here because its two `echo-*` rungs ran against the driver's own stateless echo server with a
healthy target throughout, and those measurements are good. They are also the only observation of
the echo rungs under a *different* box state, and including them widened both echo bands — the
two-clean-run version sat 0.2% under this run's `echo-get-only` ratio, i.e. it would have flaked.

That is the argument for keeping it: a band founded only on back-to-back idle-box runs looks
precise and is not.
