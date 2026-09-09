#!/usr/bin/env node
// `M171d` (`M164-12`) — the two notation implementations are held to one grammar.
//
// ## The row this closes
//
// `D711` keeps two implementations of the citation notation on purpose: this repository extracts
// identifiers from its own prose and code, tflw extracts them from its design records, and neither
// imports the other. That is a deliberate cost — two readings that agree are evidence, one reading
// that agrees with itself is not. What `M164-12` files is that **nothing was paying the other half
// of that cost**: nothing held the two grammars together, so the only thing that had ever detected
// a divergence between them was a red neither repository could clear.
//
// Measured while scoping (`PLAN_M171` §12.2): the two grammars disagreed on **10 of 24**
// citation-shaped cases, and had done since `M169a` tightened tflw's side nine milestones ago.
//
// ## Why the corpus is a fixture list and not this repository's prose
//
// READ THIS BEFORE REPLACING THE FIXTURES WITH `git ls-files`. Over the 14 tracked markdown files
// here, the two grammars extract **the same 288 identifiers** — measured on `main` at `fcfbb02`,
// and it was equally true through every one of those nine milestones of divergence. A gate whose
// corpus is the repositories' real prose would therefore have been **green on its first day and
// green on the day the divergence was found**, which is `M141`'s vacuous shape exactly: a guard
// nobody has seen fire is the one someone tidies away.
//
// So the corpus is a hand-written list of citation-shaped strings chosen to *separate* the two
// grammars. That is the same hand-list property `M171-01` files against three other guards — and it
// is sound **here** for `D895`'s reason: a hand list that fails loudly on a member it does not know
// is not standing in for an open population. This one cannot silently shrink, because
// `PERMITTED` below is checked for exercise: an exemption that stops diverging fails the gate
// rather than sitting there.
//
// ## What it compares, and how the two halves differ
//
// **`OWN` and `THEIRS` — source-text parity.** These two are byte-identical across the repositories
// and there is no reason for them to drift, so the assertion is literal string equality of the
// regex source. The stronger assertion is available, so it is the one made (`D860`).
//
// **`CITATION` and `RANGE` — behavioural parity.** These cannot be text-identical, because this
// repository's `CITATION` carries one clause tflw's does not and should keep it. So the assertion
// is that both grammars extract the same identifiers from every fixture, with the divergences
// declared in `PERMITTED` by case and by reason.
//
// ## The one permitted difference
//
// `(?!-\d)` — this repository refuses `M149f` out of `M149f-01`, because a ledger row id is not a
// citation of the milestone it belongs to. tflw's `CITATION` has no such clause; `citationsLoose`
// is where the other half of that rule lives over there. Converging everything else changed this
// repository's extraction over its own prose by **0 identifiers lost and 0 gained**, which is why
// the convergence and the guard could land in one edit rather than leaving a red behind.
//
// ## What it is blind to (`D895`)
//
// A pattern built at run time rather than written as a literal is invisible to a textual read. The
// answer is not to compare nothing: `patternSource` **throws** when a named pattern is not found
// where it is declared to live, so moving or computing one turns this gate red rather than quiet.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `M183c` — the READING half compares this repository's own reading against tflw's. Importing it
// here (rather than re-deriving it) is what makes the assertion a third statement and not a third
// implementation.
import { citationsLoose, citationsOf, DECLARES } from './verify-provenance.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SIBLING = join(ROOT, '..', 'testFlow')

/**
 * Where each named pattern is declared, on each side.
 *
 * tflw's four are split across TWO files — `PLAN_M170` §2.6 and `PLAN_M171` §12.1 both name only
 * `gen-decisions.mjs`, and `OWN`/`THEIRS` are not there. Recorded here rather than repaired
 * silently: a guard that reads the wrong file finds nothing, and `patternSource` turning that into
 * a red is the whole of why this table is data.
 */
export const SITES = {
  ours: {
    CITATION: 'scripts/verify-provenance.mjs',
    RANGE: 'scripts/verify-provenance.mjs',
    OWN: 'scripts/verify-provenance.mjs',
    THEIRS: 'scripts/verify-provenance.mjs',
  },
  theirs: {
    CITATION: 'scripts/gen-decisions.mjs',
    RANGE: 'scripts/gen-decisions.mjs',
    // `M183c` (`D950`) — these two moved out of `refresh-sibling-citations.mjs`, which shells out
    // to `gh` at module scope and is therefore unimportable, into `gen-decisions.mjs`, where they
    // are prefixed because `OWN` in that file would be ambiguous about whose sequence it names.
    // The move was proved neutral by the pin: byte-identical across it.
    //
    // THE RENAME IS WHY THIS TABLE CARRIES NAMES AND NOT ONLY FILES. `patternSource` looks for a
    // literal declared as `NAME`, so a rename is exactly as invisible to it as a move, and this
    // gate found the move by failing on the first run after it — which is `D895` working.
    OWN: { file: 'scripts/gen-decisions.mjs', name: 'SIBLING_OWN' },
    THEIRS: { file: 'scripts/gen-decisions.mjs', name: 'SIBLING_THEIRS' },
  },
}

/** The two held to byte equality, and the two held to behaviour. */
export const TEXTUAL = ['OWN', 'THEIRS']
export const BEHAVIOURAL = ['CITATION', 'RANGE']

/**
 * The regex literal declared as `NAME` in `text`, as source.
 *
 * THROWS when it is not there. `D895`: a hand list that fails loudly on a member it does not know
 * is stronger than a declaration, and a textual reader that silently compares nothing when a
 * pattern moves is `D880`'s defect wearing a different hat.
 */
export function patternSource(text, name, where) {
  const m = text.match(new RegExp(`^(?:export )?const ${name} = (/.*/[gimsuy]*)\\s*;?\\s*$`, 'm'))
  if (m === null) {
    throw new Error(
      `\`${name}\` is not declared as a single-line regex literal in \`${where}\`.\n` +
      `  This half of the gate reads both grammars as TEXT, deliberately: comparing the patterns\n` +
      `  as source is a stronger assertion than comparing what they extract, and it is available\n` +
      `  (D860). So a pattern that moved file, was RENAMED, gained a line break, or is now built at\n` +
      `  run time is unreadable here, and that is a FAILURE rather than a skip — comparing nothing\n` +
      `  is the state this gate exists to refuse.\n` +
      `  Either restore the literal, or update SITES in scripts/verify-notation-parity.mjs — whose\n` +
      `  entries may be a path, or {file, name} when the two sides declare it under different names.\n` +
      `  (The READING half below does import tflw's side; M183c/D950 moved it somewhere importable.)`,
    )
  }
  return m[1]
}

/** Compile a read pattern source back into a RegExp, always global so `matchAll` is legal. */
export function compile(source) {
  const at = source.lastIndexOf('/')
  const body = source.slice(1, at)
  const flags = source.slice(at + 1)
  return new RegExp(body, flags.includes('g') ? flags : flags + 'g')
}

/**
 * The identifiers a (CITATION, RANGE) pair extracts from one string.
 *
 * Deliberately the same shape both sides use — a citation match contributes its own id, a range
 * match contributes every id between its endpoints. This is what makes `D93-122` a *behavioural*
 * difference worth 28 identifiers rather than a cosmetic one.
 */
export function extract(text, citation, range) {
  const out = new Set()
  for (const m of text.matchAll(citation)) out.add(m[1])
  for (const m of text.matchAll(range)) {
    const [, kind, lo, hi] = m
    for (let i = Number(lo); i <= Number(hi); i++) out.add(kind + i)
  }
  return [...out].sort()
}

/**
 * Citation-shaped strings chosen to SEPARATE the two grammars, not to represent real prose.
 *
 * Every case that diverged when `M171d` was scoped is here, plus the negative controls that pin
 * what must NOT change. See the header for why real prose is the wrong corpus for this assertion.
 */
export const FIXTURES = [
  { text: 'both D318s were wrong', why: 'a plural — `D318s` is not an identifier, and reading it as one invents an id that cannot resolve' },
  { text: 'D12 - D15 covers it', why: 'a spaced range with both sides qualified' },
  { text: 'D12-M15 is not a range', why: 'endpoints of different kinds are two citations, not a span (`D861`)' },
  { text: 'D93-122 in the table', why: '`D861`\'s own finding — an unqualified right endpoint read as a range invents 28 identifiers' },
  { text: 'D12+D13 in one cell', why: '`+` is a citation boundary, not a separator' },
  { text: 'D12=13 in one cell', why: '`=` likewise — both appear inside base64 tails' },
  { text: 'see #D318 below', why: 'a `#`-prefixed form is an anchor, not a citation' },
  { text: 'M138b-01 names a review row', why: 'THE PERMITTED DIVERGENCE — a ledger row id is not a citation of its milestone' },
  { text: 'M149f-01 is open', why: 'the same, on the id that first made the rule necessary' },
  { text: 'the `sha512-` tail …Xg+M7w== is not a citation', why: 'the base64 case both repositories declare unresolvable' },

  // ADDED BY `M183c`, AND FOUND BY ITS OWN CONTROL. Narrowing tflw's `CITATION` D-form to
  // `D\d{2,3}` — `M154d`'s divergence, the one that cost this pair a red — left this half GREEN,
  // because not one of the sixteen fixtures carried a single-digit D. The reading half caught it
  // and this half could not. A fixture list assembled around the divergences known at the time is
  // blind to the divergence that came before them.
  { text: 'D9 is a single-digit decision', why: '`M154d`\'s case — the D-form is `D\\d{1,3}` on BOTH sides, and nothing here exercised it until M183c' },
  { text: 'D318 and M154b and P#12', why: 'NEGATIVE CONTROL — the three plain forms must agree' },
  { text: 'M88c2 is a sub-milestone', why: 'NEGATIVE CONTROL — letter-then-digit suffix' },
  { text: 'D12–D15 with an en dash', why: 'NEGATIVE CONTROL — a qualified range in both grammars' },
  { text: 'D12—D15 with an em dash', why: 'NEGATIVE CONTROL — the third dash' },
  { text: 'nothing citation-shaped here at all', why: 'NEGATIVE CONTROL — both grammars extract nothing' },
  { text: 'wordD318 embedded', why: 'NEGATIVE CONTROL — a word boundary is required on the left' },
]

/**
 * Cases allowed to diverge — each stating the reason AND the exact extraction expected on both
 * sides, and each CHECKED FOR EXERCISE.
 *
 * An exemption that has stopped diverging is not a harmless leftover — it is the record of a rule
 * nobody is applying any more, and it fails this gate rather than passing quietly.
 *
 * **THE `ours`/`theirs` SETS ARE NOT DECORATION, AND THE SELF-TEST IS WHAT FOUND THAT.** The first
 * version of this map waived the *case*, so an exemption granted for one clause silently swallowed
 * any other divergence on the same string: reverting `RANGE` to its pre-convergence form left
 * `D93-122` green, because that fixture was already excused for a `CITATION` reason. An exemption
 * that waives a case is a hole shaped like every future defect on that case. Stating both sides
 * makes it waive one *observation* instead, so the same revert now reddens the gate.
 */
export const PERMITTED = new Map([
  ['M138b-01 names a review row', { ours: [], theirs: ['M138b'], why: '`(?!-\\d)` — this repository refuses a ledger row id as a citation of its milestone; tflw keeps that rule in `citationsLoose` instead' }],
  ['M149f-01 is open', { ours: [], theirs: ['M149f'], why: '`(?!-\\d)` — the same clause, on the id that made it necessary' }],
  // FOUND BY THIS GATE ON ITS FIRST RUN, AFTER THE CONVERGENCE, AND IT IS NOT A LEDGER ROW.
  // `(?!-\d)` is stated as a rule about row ids and is in fact a rule about ANY digit after a dash,
  // so it also drops the left endpoint of a malformed range: tflw reads `D93` out of `D93-122` and
  // this repository reads nothing. Both grammars agree the span is not a range — that is the
  // convergence working — and they disagree about whether the left endpoint is a citation at all.
  // Declared rather than repaired, for two reasons. It costs nothing today: over the 14 tracked
  // markdown files the converged pair extracts the same 288 identifiers, so no real prose has this
  // shape. And narrowing the clause to `(?!-\d\d?$)` or widening it to tflw's `citationsLoose`
  // split is a change to what this repository DEMANDS of tflw, which is a re-pin and a `D511`
  // sequence rather than a docblock edit. The row is where that belongs.
  ['D93-122 in the table', { ours: [], theirs: ['D93'], why: '`(?!-\\d)` again, beyond its stated scope — the clause is written as a rule about ledger row ids and also refuses the left endpoint of a malformed range. tflw yields `D93` here and this repository yields nothing. Latent: no tracked prose has this shape' }],
])

/** `null` when the two grammars agree everywhere they are required to, otherwise the report. */
export function compare(ours, theirs) {
  const problems = []

  for (const name of TEXTUAL) {
    if (ours[name] !== theirs[name]) {
      problems.push(
        `${name} is held to SOURCE-TEXT parity and the two no longer match:\n` +
        `    here : ${ours[name]}\n` +
        `    tflw : ${theirs[name]}\n` +
        `  These two have no reason to differ, so the stronger assertion is the one made (D860).`,
      )
    }
  }

  const unexercised = new Set(PERMITTED.keys())
  for (const { text, why } of FIXTURES) {
    const a = extract(text, compile(ours.CITATION), compile(ours.RANGE))
    const b = extract(text, compile(theirs.CITATION), compile(theirs.RANGE))
    const same = a.length === b.length && a.every((x, i) => x === b[i])
    if (same) continue
    const allowed = PERMITTED.get(text)
    if (allowed !== undefined) {
      const matches =
        allowed.ours.length === a.length && allowed.ours.every((x, i) => x === a[i]) &&
        allowed.theirs.length === b.length && allowed.theirs.every((x, i) => x === b[i])
      if (matches) {
        unexercised.delete(text)
        continue
      }
      problems.push(
        `a PERMITTED divergence is not the divergence on record:\n` +
        `    case     : ${JSON.stringify(text)}\n` +
        `    on record: here [${allowed.ours.join(', ')}]  tflw [${allowed.theirs.join(', ')}]\n` +
        `    measured : here [${a.join(', ')}]  tflw [${b.join(', ')}]\n` +
        `    reason   : ${allowed.why}\n` +
        `  An exemption waives one observation, not the whole case — otherwise it would swallow every\n` +
        `  future divergence on this fixture. Re-measure and update the sets, or converge.`,
      )
      unexercised.delete(text)
      continue
    }
    problems.push(
      `the two grammars disagree on a fixture, and the difference is not declared:\n` +
      `    case  : ${JSON.stringify(text)}\n` +
      `    why   : ${why}\n` +
      `    here  : [${a.join(', ')}]\n` +
      `    tflw  : [${b.join(', ')}]\n` +
      `  Either converge the grammars, or add the case to PERMITTED with the reason it may differ.`,
    )
  }

  for (const text of unexercised) {
    problems.push(
      `a PERMITTED divergence no longer diverges: ${JSON.stringify(text)}\n` +
      `    reason on record: ${PERMITTED.get(text).why}\n` +
      `  An exemption that has stopped being exercised records a rule nobody is applying. Remove it,\n` +
      `  or replace the fixture with one that still separates the two grammars.`,
    )
  }

  return problems.length === 0 ? null : problems
}

/** Read one side's four patterns, by the table rather than by guesswork. */
export function readSide(root, sites) {
  const cache = new Map()
  const out = {}
  for (const [name, site] of Object.entries(sites)) {
    // A site is a path, or a path plus the name the pattern is declared under on that side. The
    // second form exists because a rename is as invisible to a textual reader as a move (`M183c`).
    const rel = typeof site === 'string' ? site : site.file
    const declaredAs = typeof site === 'string' ? name : site.name
    if (!cache.has(rel)) cache.set(rel, readFileSync(join(root, rel), 'utf8'))
    out[name] = patternSource(cache.get(rel), declaredAs, rel)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// The READING layer (`M183c`, `M164-12`, `D944`, `D948`, `D951`, `D952`)
// ---------------------------------------------------------------------------------------------
//
// WHAT THE HALF ABOVE DOES NOT COMPARE. Everything to this point compares the two grammars at the
// *pattern* layer: it reads `OWN`, `THEIRS`, `CITATION` and `RANGE` as source and asks what that
// pair of regexes extracts from a bare string. Nothing compares the layer that decides **what text
// those patterns ever see** — fence handling, the per-file `**Notation.**` resolution, the corpus
// split. `M167`'s class, on the gate built to close `M164-12`:
//
//     layer                 decided by                                    compared by
//     the patterns          OWN THEIRS CITATION RANGE                     the half above
//     fence handling        tflw's scanLines + PRODUCT_FENCE_INFO         this half
//     per-file resolution   **Notation.** / "here is this repository's own" this half
//     corpus split          EXCLUDED here, EXCLUSIONS there               still nothing
//
// The last row is stated rather than closed, because a green here must not imply it.
//
// THIS FOUND A LIVE DIVERGENCE, AND THAT IS THE EVIDENCE THE CONTROLS BELOW CANNOT GIVE.
// tflw's collector has always skipped `tflw`/`console` fences; this reader had no fence rule at
// all, so a `D`- or `M`-form inside such a block was demanded here and structurally unable to
// enter the pin — a stale-pin red with no clearing edit in either document, whose message proposes
// the re-pin that destroys a correct pin. Measured on `main` before the repair: **6 breaks over 24
// constructions × 2 corpora, and 0 over all 789 tracked files**. The corpus could not have shown
// it; a written-down construction did. `M183c` c2 converged this side onto tflw's rule and the 6
// went to 0.
//
// WHY THE ASSERTION IS A SANDWICH AND NOT AN EQUALITY. The two readings are not meant to be equal:
// `citationsLoose` forgives exactly one spelling tflw reads and this side does not. What must hold
// is the contract the pin is built on, which until now lived only in `citationsLoose`'s docblock —
//
//     citationsOf(t)   ⊆   what tflw pins from t   ⊆   citationsLoose(t)
//
// The lower bound is the demand: every identifier this repository asks a reader to resolve must be
// something the pin can carry. The upper bound is the pin's honesty. A break in either direction
// is `M154d`'s unclearable red.
//
// `D711` IS UNTOUCHED. The two readings are still written twice and neither calls the other. What
// is shared is this assertion, which exists to *contradict* one with the other and can only do so
// by holding both (`D948`). The import became possible when `M183c` c1 moved tflw's reading out of
// `refresh-sibling-citations.mjs`, which shells out to `gh` at module scope — the reason
// `M164-12` gives for why neither half of this pair was ever reachable from a test.

/**
 * Constructions that separate the two READINGS, in the corpus each is read as. A fixture is a whole
 * file body, so the presence or absence of a `**Notation.**` declaration is itself a construction.
 *
 * `D951` — every entry must be load-bearing. These are not the pattern layer's fixtures repeated:
 * each is here because some *stage above the regex* can treat it differently on the two sides.
 */
export const READING_FIXTURES = [
  { label: 'product fence, tflw', corpus: 'prose', text: '**Notation.**\n\n```tflw\nsee D9\n```\n', why: 'THE DIVERGENCE M183c FOUND — tflw skips product fences, this side had no fence rule' },
  { label: 'product fence, console', corpus: 'prose', text: '**Notation.**\n\n```console\nsee D9\n```\n', why: 'the second product fence info string' },
  { label: 'product fence, tilde', corpus: 'prose', text: '**Notation.**\n\n~~~tflw\nsee D9\n~~~\n', why: 'the tilde spelling — a fence rule that reads only backticks is half a rule' },
  { label: 'product fence in code', corpus: 'code', text: '// ```tflw\n// see D9\n// ```\n', why: 'the same, in the corpus where a `.tflw` sample is most likely to be embedded' },
  { label: 'untagged fence', corpus: 'prose', text: '**Notation.**\n\n```\nsee D9\n```\n', why: 'NEGATIVE CONTROL — untagged fences carry authored prose and must be READ by both (99 citations ride on this)' },
  { label: 'non-product fence', corpus: 'prose', text: '**Notation.**\n\n```js\n// see D9\n```\n', why: 'NEGATIVE CONTROL — an info string that is not a product fence' },
  { label: 'undeclared file', corpus: 'prose', text: 'see D9 for why\n', why: 'no `**Notation.**` — tflw contributes NOTHING from such a file rather than guessing' },
  { label: 'declared, defaults to ours', corpus: 'prose', text: "**Notation.**\n\nUnqualified here is this repository's own. See M164 and `tflw M22`.\n", why: 'the per-file default: a bare `M<n>` is not tflw’s, and the marked minority survives it' },
  { label: 'declared, defaults to theirs', corpus: 'prose', text: '**Notation.**\n\nSee M164 and `testFlow-tests D4`.\n', why: 'the other branch: bare forms are tflw’s and the sibling-qualified one is blanked' },
  { label: 'ledger row', corpus: 'prose', text: '**Notation.**\n\nsee M138b-01 for why\n', why: 'NEGATIVE CONTROL — the one permitted pattern-layer divergence must be absorbed by the sandwich, not reported by it' },
  // THE SPAN IS THREE WIDE, NOT FIVE, AND THE REASON IS THIS GATE'S OWN SUBJECT. A fixture written
  // into a code file is read by the code corpus as a real citation, and the code corpus EXPANDS
  // ranges (`D862`) where tflw's own does not (`D861`) — the exact asymmetry this fixture exists to
  // pin. A five-wide span therefore MINTED a demand for an interior identifier tflw anchors
  // nowhere, and reddened `verify:provenance`. Narrowing it to an interior that resolves separates
  // an expanding reader from a non-expanding one just as well — three identifiers against two —
  // and costs no permanent exemption.
  //
  // Note what this comment cannot do: name the span it replaced, or the identifier that demand was
  // for. Writing either here would re-mint it, because this file is in the corpus it describes.
  { label: 'range in code', corpus: 'code', text: "const span = 'D5-D7';\n", why: 'ranges expand in the sibling code corpus by D862 and not in tflw’s own markdown-only rule — the parameter must actually be passed' },
  { label: 'plain citation', corpus: 'prose', text: '**Notation.**\n\nsee D318 and M154b and P#12\n', why: 'NEGATIVE CONTROL — the readings are not trivially empty' },
]

/**
 * Reading-layer divergences that are allowed, with both sides' observation, checked for exercise
 * exactly as `PERMITTED` is. **Empty today**, and that is the claim: after c2 the two readings
 * bracket correctly on every construction above.
 */
export const READING_PERMITTED = new Map([
  ['undeclared file', {
    demandedNotPinnable: ['D9'],
    pinnedNotCited: [],
    why:
      'tflw\'s `resolveSiblingProse` contributes NOTHING from a markdown file with no ' +
      '`**Notation.**` paragraph — it declines to guess which sequence a bare `M<n>` means. This ' +
      'reader has no such rule and demands the identifier. FOUND BY THIS HALF ON ITS FIRST RUN, ' +
      'and DECLARED RATHER THAN CONVERGED, because converging would disable the rule that makes ' +
      'it safe: `verify-provenance.mjs` rule 2 selects the files that must declare with ' +
      '`citationsOf(text).size > 0`, so a `citationsOf` that returned nothing for an undeclared ' +
      'file would make rule 2 fire on no file ever. The state is therefore unreachable in prose — ' +
      'a citing file without the declaration is already a red, one rule earlier, and cannot reach ' +
      'the pin. `M131-03` in the constructive direction: the exemption is sound because another ' +
      'guard covers it, and the control below asserts that guard\'s precondition still holds.',
  }],
])

/** The bracket, for one fixture. Returns the break, or null. */
export function bracket({ label, corpus, text }, theirs, ours) {
  const prose = corpus === 'prose'
  const path = prose ? 'DOC.md' : 'src/thing.ts'
  const mid = new Set((prose ? theirs.prose : theirs.code)([{ path, text }]).keys())
  const strict = ours.strict(text, prose)
  const loose = ours.loose(text, prose)
  const demandedNotPinnable = [...strict].filter((id) => !mid.has(id)).sort()
  const pinnedNotCited = [...mid].filter((id) => !loose.has(id)).sort()
  if (!demandedNotPinnable.length && !pinnedNotCited.length) return null
  return { label, corpus, demandedNotPinnable, pinnedNotCited, mid: [...mid].sort(), strict: [...strict].sort(), loose: [...loose].sort() }
}

/**
 * The reading-layer comparison. `theirs` and `ours` are injected so the controls can substitute a
 * deliberately wrong one — a comparison whose controls cannot make it fire is `M141`'s shape.
 */
export function compareReadings(theirs, ours, fixtures = READING_FIXTURES, permitted = READING_PERMITTED) {
  const problems = []
  const unexercised = new Set(permitted.keys())
  for (const fx of fixtures) {
    const b = bracket(fx, theirs, ours)
    if (b === null) continue
    const allowed = permitted.get(fx.label)
    if (allowed !== undefined) {
      const same = (a, c) => a.length === c.length && a.every((x, i) => x === c[i])
      if (same(allowed.demandedNotPinnable ?? [], b.demandedNotPinnable) && same(allowed.pinnedNotCited ?? [], b.pinnedNotCited)) {
        unexercised.delete(fx.label)
        continue
      }
      problems.push(
        `a PERMITTED reading divergence is not the divergence on record:\n` +
        `    case     : ${JSON.stringify(fx.label)} (${fx.corpus})\n` +
        `    on record: demanded-not-pinnable [${(allowed.demandedNotPinnable ?? []).join(', ')}]  pinned-not-cited [${(allowed.pinnedNotCited ?? []).join(', ')}]\n` +
        `    measured : demanded-not-pinnable [${b.demandedNotPinnable.join(', ')}]  pinned-not-cited [${b.pinnedNotCited.join(', ')}]\n` +
        `    reason   : ${allowed.why}`,
      )
      unexercised.delete(fx.label)
      continue
    }
    const which = b.demandedNotPinnable.length
      ? `this repository DEMANDS [${b.demandedNotPinnable.join(', ')}], which tflw's reading does not take from the same text`
      : `tflw's reading TAKES [${b.pinnedNotCited.join(', ')}], which nothing here cites even loosely`
    problems.push(
      `the two READINGS disagree, and the difference is not declared:\n` +
      `    case  : ${JSON.stringify(fx.label)} (${fx.corpus})\n` +
      `    why   : ${fx.why}\n` +
      `    ${which}\n` +
      `    here  : strict [${b.strict.join(', ')}]  loose [${b.loose.join(', ')}]\n` +
      `    tflw  : [${b.mid.join(', ')}]\n` +
      `  THE PIN IS NOT STALE. Do not re-pin — that is the remedy M164-12 exists to remove, and it\n` +
      `  would destroy a correct pin. Two READINGS of the notation have diverged above the regexes:\n` +
      `  fence handling, the per-file **Notation.** resolution, or the corpus split. Converge them,\n` +
      `  or declare the case in READING_PERMITTED with both sides' observation.`,
    )
  }
  for (const label of unexercised) {
    problems.push(
      `a PERMITTED reading divergence no longer diverges: ${JSON.stringify(label)}\n` +
      `    reason on record: ${permitted.get(label).why}\n` +
      `  An exemption that has stopped being exercised records a rule nobody is applying.`,
    )
  }
  return problems.length === 0 ? null : problems
}

/** This repository's reading, as the pair `compareReadings` consumes. */
export const OUR_READING = { strict: citationsOf, loose: citationsLoose }

/**
 * tflw's reading, imported. `D948` — the assertion holds both; neither implementation holds the
 * other. Absent is a FAILURE and not a skip (`D880`, `M131-03`).
 */
export async function loadTheirReading(siblingRoot = SIBLING) {
  const m = await import(join(siblingRoot, 'scripts', 'gen-decisions.mjs'))
  const { siblingProseCitations, siblingCodeCitations } = m
  if (typeof siblingProseCitations !== 'function' || typeof siblingCodeCitations !== 'function') {
    throw new Error(
      `tflw's scripts/gen-decisions.mjs does not export siblingProseCitations/siblingCodeCitations.\n` +
      `  M183c (D950) extracted them there so this gate could compare READINGS and not only patterns.\n` +
      `  If they moved again, point this at the new home — a reading half that cannot load tflw's\n` +
      `  side must fail, because comparing nothing is what this gate exists to refuse.`,
    )
  }
  return { prose: siblingProseCitations, code: siblingCodeCitations }
}

/**
 * The guard's own guards, on the input they exist for.
 *
 * Every one of these mutates something this gate reads and asserts the gate NOTICES. A gate whose
 * own controls have never been shown to fire is the shape `M141` names, and this one is especially
 * exposed to it: it is green on real prose by construction (see the header), so its fixtures are
 * the only thing standing between it and vacuity.
 */
export function selfTest(reading = null) {
  const ok = []
  const bad = []
  const t = (what, pass) => (pass ? ok : bad).push(what)

  const ours = readSide(ROOT, SITES.ours)
  const theirs = readSide(SIBLING, SITES.theirs)

  t('the live comparison is green — if this fails, the rest of the self-test is about a red tree',
    compare(ours, theirs) === null)

  // A textual reader that cannot find its pattern must SAY SO, not compare nothing (`D895`).
  let threw = false
  try { patternSource('const SOMETHING_ELSE = /x/g;\n', 'CITATION', 'a fixture') } catch { threw = true }
  t('an absent pattern THROWS rather than comparing nothing', threw)

  t('a pattern built at run time is absent to this reader, and therefore also throws',
    (() => { try { patternSource('const CITATION = new RegExp(body, "g");\n', 'CITATION', 'x'); return false } catch { return true } })())

  // Source-text parity actually bites.
  t('a one-character drift in OWN is caught',
    compare({ ...ours, OWN: ours.OWN.replace('testFlow-tests', 'testFlow-test') }, theirs) !== null)

  // Behavioural parity actually bites — put the OLD range pattern back and the D93-122 case returns.
  const preConvergence = { ...ours, RANGE: String.raw`/(?<![\w#])([DM])(\d{1,3})[a-z]?\s*[-–—]\s*(?:[DM])?(\d{1,3})[a-z]?\b/g` }
  const reverted = compare(preConvergence, theirs)
  t('reverting RANGE to its pre-convergence form reddens the gate',
    reverted !== null && reverted.some((p) => p.includes('D93')))

  // The exemption check bites in the other direction: a PERMITTED case that stopped diverging.
  t('a declared divergence that no longer diverges is a failure, not a pass',
    compare(ours, { ...theirs, CITATION: ours.CITATION }) !== null)

  // --- the READING half (`M183c`) ------------------------------------------------------------
  //
  // These run synchronously against a reading pair loaded by the caller; `main` awaits the import
  // once and hands it in, so a missing tflw checkout fails there rather than being skipped here.
  if (reading !== null) {
    t('the live READING comparison is green — if this fails, the rest is about a red tree',
      compareReadings(reading, OUR_READING) === null)

    // CONTROL 1 — the divergence M183c FOUND, simulated faithfully. A reader with no fence rule
    // sees fence content as ordinary prose, which is what deleting the delimiter lines produces.
    // This is the state `main` was in until c2 converged it.
    const fenceBlind = {
      strict: (t2, prose) => OUR_READING.strict(t2.replace(/^[ \t]*(?:```+|~~~+).*$/gm, ''), prose),
      loose: (t2, prose) => OUR_READING.loose(t2.replace(/^[ \t]*(?:```+|~~~+).*$/gm, ''), prose),
    }
    const blind = compareReadings(reading, fenceBlind)
    t('CONTROL — a reader with no product-fence rule reddens the READING half on the fence family',
      blind !== null && blind.filter((p) => p.includes('product fence')).length >= 3)
    t('CONTROL — and that red names the grammar, never the pin',
      blind !== null && blind.every((p) => p.includes('THE PIN IS NOT STALE')))

    // CONTROL 2 — the other direction: tflw reading MORE than this side cites even loosely.
    const greedy = {
      prose: (files) => { const m2 = reading.prose(files); m2.set('D999', { sites: [], viaRange: false }); return m2 },
      code: (files) => { const m2 = reading.code(files); m2.set('D999', { sites: [], viaRange: false }); return m2 },
    }
    t('CONTROL — an identifier tflw reads that nothing here cites reddens the READING half too',
      (() => { const r = compareReadings(greedy, OUR_READING); return r !== null && r.some((p) => p.includes('D999')) })())

    // CONTROL 3 — the exemption is exercise-checked in BOTH directions.
    t('CONTROL — a READING_PERMITTED case that stopped diverging is a failure',
      compareReadings(reading, OUR_READING, READING_FIXTURES, new Map([...READING_PERMITTED, ['plain citation', { demandedNotPinnable: ['D318'], pinnedNotCited: [], why: 'a fabrication, to prove the exercise check fires' }]])) !== null)

    // CONTROL 4 — WHAT MAKES THE ONE EXEMPTION SOUND. `verify-provenance.mjs` rule 2 selects the
    // files that must carry the declaration with `citationsOf(text).size > 0`. If this side ever
    // converged onto tflw's "an undeclared file contributes nothing", rule 2 would fire on no file
    // ever and the exemption's reason would be false. Asserted rather than trusted.
    t('CONTROL — the exemption\'s precondition holds: an undeclared citing file is still visible to rule 2',
      citationsOf('see D9 for why\n', true).size > 0 && !DECLARES('see D9 for why\n'))
  }

  // NEGATIVE CONTROL — the comparison is not trivially true.
  t('NEGATIVE CONTROL — extract() actually returns identifiers',
    extract('D318 and M154b', compile(ours.CITATION), compile(ours.RANGE)).length === 2)

  t('NEGATIVE CONTROL — the two grammars really do differ in source text, so behavioural parity is doing work',
    ours.CITATION !== theirs.CITATION)

  for (const w of ok) console.log(`  ✓ ${w}`)
  for (const w of bad) console.error(`  ✗ ${w}`)
  if (bad.length > 0) {
    console.error(`✗ notation parity self-test: ${bad.length} of ${ok.length + bad.length} control(s) did not fire`)
    return 1
  }
  console.log(`✓ notation parity self-test: ${ok.length} control(s), each shown to fire on the input it exists for`)
  return 0
}

async function main() {
  // The reading half needs tflw's module. Absent is a FAILURE and not a skip (`D880`, `M131-03`):
  // this gate's whole subject is that comparing nothing is the state to refuse.
  let reading
  try {
    reading = await loadTheirReading()
  } catch (err) {
    console.error(
      `✗ notation parity: the READING half cannot load tflw's grammar.\n  ${String(err.message).split('\n').join('\n  ')}`,
    )
    return 1
  }
  if (process.argv.includes('--self-test')) return selfTest(reading)
  let ours, theirs
  try {
    ours = readSide(ROOT, SITES.ours)
    theirs = readSide(SIBLING, SITES.theirs)
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(
        `✗ notation parity: ${err.path} is not readable.\n` +
        `  This gate needs BOTH trees side by side, and runs in the one CI job that checks out both.\n` +
        `  Absent is a failure and not a skip (D880) — a gate that goes quiet when the thing it\n` +
        `  compares is missing is the defect M172d planted a mutation for.`,
      )
      return 1
    }
    console.error(`✗ notation parity: ${err.message}`)
    return 1
  }

  const problems = [...(compare(ours, theirs) ?? []), ...(compareReadings(reading, OUR_READING) ?? [])]
  if (problems.length === 0) {
    console.log(
      `✓ notation parity: ${TEXTUAL.length} pattern(s) byte-identical, ` +
      `${BEHAVIOURAL.length} behaviourally equal over ${FIXTURES.length} fixture(s), ` +
      `${PERMITTED.size} declared divergence(s), all still exercised`,
    )
    console.log(
      `✓ notation parity, READING layer (M183c): the two readings bracket over ` +
      `${READING_FIXTURES.length} construction(s) — citationsOf ⊆ tflw's reading ⊆ citationsLoose, ` +
      `${READING_PERMITTED.size} declared divergence(s), all still exercised`,
    )
    console.log(
      `  not compared by either half: the corpus split (EXCLUDED here, EXCLUSIONS there). ` +
      `Stated so this green does not imply it.`,
    )
    return 0
  }
  console.error(`✗ notation parity: ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`  ${p}\n`)
  return 1
}

if (process.argv[1] && process.argv[1].endsWith('verify-notation-parity.mjs')) process.exit(await main())
