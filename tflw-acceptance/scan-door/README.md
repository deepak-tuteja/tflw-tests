# `scan-door` — the SCANS door's own corpus

<sub>**Notation.** `D<n>` and `M<n>` name blocks in design records neither repository publishes;
each resolves in tflw's [DECISIONS.md](https://github.com/deepak-tuteja/tflw/blob/main/DECISIONS.md), which lifts the block verbatim.
**Both repositories number their milestones from 1**, so an unqualified `M<n>` here is tflw's —
this repository's own are written `testFlow-tests M22`, and are published nowhere.</sub>

Written for `M228`, the round that retired `ScanForm` and made the SCANS door draw the standard
Compose pane like the other three.

```
# in testFlow/, if it is not already up:
npm run example:serve          # the storefront on :4720 — the target these tests point at

# in testFlow-tests/:
npx tflw ui tflw-acceptance/scan-door
cd tflw-acceptance/scan-door && npx tflw check
```

Everything on the door except ▶ works with the target down.

| file | what it is there to show |
| --- | --- |
| `families.tflw` | the three scan families + the severity floor control, and why a11y is **not** a fourth |
| `negated.tflw` | `not has no …` — drawn open on the row that uses it, behind `⋯` on the row that does not |
| `crawls.tflw` | two crawls: the band, the seeds, the excludes, read-only with a reason |
| `mixed.tflw` | a scan assertion in a file that is also API's and BROWSER's — open it on **API** |

`tflw.config` declares a second scannable origin (`api orders`) that is **deliberately not
authorized**, so `TF060` is live across the corpus and the `scan` segment's coverage table has one
covered row and one uncovered one. Comment that line out and it all checks clean.
