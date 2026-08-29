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
  tflw-acceptance/perf/founding-runs/2026-08-26T10-23-37-000Z.json \
  tflw-acceptance/perf/founding-runs/2026-08-29T14-29-32-000Z.json \
  tflw-acceptance/perf/founding-runs/2026-08-29T14-33-41-000Z.json
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

## The 2026-08-29 pair, and what they were for (`M160`)

`2026-08-29T14-29-32-000Z.json` and `14-33-41-000Z.json` are back-to-back `--profile ladder` runs on
an idle `fedora-box` under the same lease, both `PASS`, 7 rungs compared, 0 regressions, against tflw
`0e49518` and this repository at `a7c8924`.

They were taken because the 2026-08-26 three **cannot** found a `p95Ratio` for the three rungs that
had none. Those runs measured a tflw that rounded every duration to a whole millisecond, and the
readings say so: `1/1/1 ms` on both `echo-*` rungs. `M160` removed that rounding and `D809` replaced
it with a magnitude-relative render, so a current tflw reports `0.86` where the old one reported `1`.
No amount of re-derivation recovers a digit the old build never wrote down.

**Both dates are here, and both still contribute**, which is the point worth carrying. `D836` makes
contribution per-*metric* as well as per-rung: coarse reporting disqualifies a run's `p95Ratio` and
not its `rpsRatio`, because a count of completed iterations does not become less true because the
percentile printed beside it was rounded. So the `echo-*` `p95Ratio` bands rest on the 2026-08-29
pair alone, while their `rpsRatio` bands rest on all five — and keeping the older three is what holds
those bands at x1.91/x1.90 instead of the x1.56 floor two back-to-back idle-box runs would produce.

That is the same argument the section above makes for the partial run, applied to a second axis. The
older set is not superseded evidence. It is evidence about a different question.

**How each run's precision is known** is recorded in the artifact rather than inferred: since `D835`,
`perf-conformance.mjs` copies the measuring build's `durations` block from tflw's artifact contract
into `tflw.durations`. The 2026-08-26 three have no such field, which is not missing data — it is how
a pre-`D809` build identifies itself, and the derivation has an exact model for what that build did.
