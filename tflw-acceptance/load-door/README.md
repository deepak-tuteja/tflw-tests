# The LOAD door, with something behind it

`M224` rebuilt the LOAD door's Compose pane. Until that round it was not a variant of the standard
pane at all — it was `D1088`'s retired staging form, the one `M213` removed from BROWSER and
`M213-08` removed from API, still shipping on the last door. This directory is what you open to see
what replaced it.

It exists because the dogfood suite could not show you. `tests/` holds 86 files and 321 tests, and
**not one of them carries a workload line** — the LOAD door there opens on 80 dimmed file rows
reading `0` and six reading `—`. The corpus below is 16 tests, 14 of them workload-bearing, against
the same apiV2 stack everything else in this repository runs against.

## Run it

From the repository root:

```sh
node cli.mjs start                                      # the stack: api :4001, storefront :8090
npx tflw ui tflw-acceptance/load-door                   # the page — then pick the LOAD door
```

`tflw run` has no `--config`; a project is the directory you run from, so the suite runs as:

```sh
cd tflw-acceptance/load-door && npx tflw run           # 17 tests, about 20s
```

or, on the box with the stack there instead of here:

```sh
node scripts/exec.mjs run --in tflw-acceptance/load-door
```

Or press ▶ on a declaration in the page and let it run the one test you are looking at.

No `.env`, no `require env`, no session: every endpoint here is a public read. That is deliberate —
`tflw-acceptance/perf/tflw/` authenticates because its rungs measure a contended write, and a corpus
you have to configure before you can look at it is a corpus nobody looks at.

## Why it is not under `tests/`

`tflw-acceptance/` is already excluded from discovery by the root config, so a bare `tflw run` and
every `--tag` phase of the regression sweep are untouched by this directory.

That is not tidiness. **The run's bottleneck judgement is a property of the whole run**, not of the
test that caused it: one workload that saturates the generator marks *every* threshold in the run
`skipped` and takes the repository's headline verdict to INCONCLUSIVE with it. tflw's own
`examples/storefront/tests/load.tflw` records that happening and the measurement behind it — a rate
cap on one test flipped a different test's verdict. A 321-test functional suite is the wrong place
to find that out.

## What is here

| file | what it holds |
| --- | --- |
| `rate-shapes.tflw` | `ramp` and `hold`, in both units — the four one-line workloads |
| `staged-shapes.tflw` | `step` and `spike`, in both units — the four block workloads |
| `iteration-shapes.tflw` | `run N iterations across M`, and `per user` — the two bounded by work |
| `editing-cases.tflw` | the four cases the pane has to *edit* rather than draw |
| `browser-contrast.tflw` | the control: a browser test and a plain api test, neither on LOAD |

Between them the first three cover **all ten workload shapes the language has**, which is what
`workloadEditOf` reads and `workloadSpecOf` writes. Every one of its ten cases has a declaration
here to be exercised against.

## What to check, and where

Each row is something `M224` changed. Open the LOAD door on this project (`#/load`) unless a row
says otherwise.

**A workload is an ordinary clause now (`D1205`).** Select any test in `rate-shapes.tflw`. The band
under the editor carries a `workload` row with the profile grid, the unit pair and the
target/duration fields — not a `LOAD` badge linking somewhere else. Before this round that row was a
link, and the door it linked to listed every workload test as *"(already a workload test)"* with the
arming checkbox disabled. A workload, once written, could not be changed by anything in the product.

**Editing writes bytes through the builders (`D1206`, `D1087`).** Change a target on one of the
`ramp` tests and watch the source line rewrite. Then do the same on a `step` test in
`staged-shapes.tflw`: one line becomes three, and the statements below it do not move. A block's
span runs into the next line's indentation, so an edit that read its end off the span swallowed the
line below — `replaceWorkload` reads the end off the node's own offsets.

**`+ workload` and `✕ workload`.** Open *"a threshold-only test, waiting for a workload"* in
`editing-cases.tflw` — it is on the LOAD door on the strength of its thresholds alone, because
`lenses.ts` takes the lens from `test.workload !== null || test.thresholds.length > 0` and LOAD is
carried by no statement. `+ add to this test → workload` writes one. `✕` on the row removes it.
Before this round that menu item drew a label with zero controls and no way out.

**`TF033` refuses — in the other direction from the one you would guess.** Adding a workload to a
thresholdless test is *allowed*; `TF033` is a checker rule, so what you get is a file `tflw check`
reports on. The refusal lives on the removal. Open *"only the catalogue read is timed"* and press
`✕` on `thresholds`:

> TF033 — a test that carries a `workload` must carry a threshold, so this one cannot be the last
> thing removed. Take the workload off first — the row above.

Take the workload off and press it again and the sentence changes to the ordinary *"empty it first
— 2 thresholds still here"*, because the rule that was speaking no longer applies. The check is
*does this test carry a workload*, not *is this the last threshold*.

**The anchor (`D1207`).** `+ add to this test → threshold` on *"the test above a comment block"*.
This is the shape that broke `+ threshold` on **8 of the 13 tests** in tflw's example project — the
anchor walked back over whitespace only, so a test followed by a comment introducing the *next* test
spliced below that comment, inside the next declaration, and came back `TF010 at line …`. The
comment must stay where it is, attached to the test below it.

**Region 2 is segmented by what the declaration earns (`D1209`).** Under the editor, `plan` /
`response`. On a workload test the plan panel draws the shape — and the two units are not the same
picture: `users` is closed, `rps` is open. Compare *"the catalogue holds up as readers arrive"*
against *"…at a fixed arrival rate"*. Select a request and the segment moves to `response` on its
own.

**▶ states its price (`D1212`).** The control reads what the run will cost off the workload's own
stages, which is what keeps it from looking like `send`. `hold 15 rps for 2s` and `run 40 iterations
across 4 users` are worth comparing — one states a duration, the other states an amount of work and
cannot state a duration at all.

**`+ new test` scaffolds a workload (`D1213`, `D1211`).** On this door `+ new test` writes a
workload *and* a threshold, in the printer's order — the threshold at the foot of the body, not
under the workload. On API it writes neither.

**The door decides where you land, and nothing else (`D1042`, `D1044`).** Open
`browser-contrast.tflw`'s browser test on the **BROWSER** door: `+ add to this test` is one item
shorter, with no `workload`. That absence is the grammar refusing — a workload may not sit beside a
browser step — not the door deciding. Every other door that can hold a workload shows its editor.

**The pane fills its window (`M223`, `D1214`).** The LOAD door computes `main main-fill` now; before
this round it computed `"main"` and left 190 px at the bottom of a 900 px window belonging to
nobody. And `[hidden]` is honoured — `.shape-grid` used to be declared hidden and render 29 live
controls, because the stylesheet had no `[hidden]` rule and the attribute lost on specificity.
