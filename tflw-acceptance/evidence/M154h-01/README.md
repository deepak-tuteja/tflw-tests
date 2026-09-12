# `M154h-01` — the one CI failure, kept

<sub>**Notation.** `P#n`, `D<n>` and `M<n>` name blocks in design records neither repository
publishes; each resolves in tflw's [DECISIONS.md](https://github.com/deepak-tuteja/tflw/blob/main/DECISIONS.md), which lifts the block verbatim.
**Both repositories number their milestones from 1**, so an unqualified `M<n>` here is tflw's —
this repository's own are written `testFlow-tests M22`, and are published nowhere.</sub>

Evidence for the close of `testFlow` ledger row `M154h-01` (`M188c`, `D970`), taken from GitHub
Actions run `33012873951` **attempt 1** (PR #46, 2026-08-26 21:00:17Z), artifact
`regression-reports-group-core` id `9623624606`. That artifact expires on **2026-11-24**, and the
failure it records is a race a re-run cannot be made to repeat, so the three files that carry the
diagnosis live here instead.

- `failure.png` — tflw's failure screenshot at the second `expect`: empty stars, an empty comment
  box, the red client-side *pick a star rating first*, the first review in the list below.
- `network.txt` — every review request in the Playwright trace: two clicks on *Submit review*,
  **one** `POST /reviews`. The 409 path was never reached.
- `step.json` — the failing test's record from `results.json`, base64 stripped: every step with
  its duration, which is where the 6 ms first assertion and the 77 ms POST come from.

The reading is in `tests/mixed/storefront.tflw`'s header above the test.

## What belongs in `tflw-acceptance/evidence/`

**Evidence that cannot be regenerated** (`D971`). A mutation census can be re-run and a grader's
page re-derived, so those are *not* archived (`D969`); a one-off CI failure cannot, so it is. One
directory per ledger row, a README naming the run, the artifact and its expiry, and nothing a gate
reads — this directory can never become `M176-05`. Content must be safe for a public repository:
seed data only, no host paths, no addresses.
