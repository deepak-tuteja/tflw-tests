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
    OWN: 'scripts/refresh-sibling-citations.mjs',
    THEIRS: 'scripts/refresh-sibling-citations.mjs',
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
      `  This gate reads both grammars as TEXT — it cannot import either side (importing tflw's\n` +
      `  \`refresh-sibling-citations.mjs\` shells out to \`gh\` at module scope). So a pattern that\n` +
      `  moved file, gained a line break, or is now built at run time is unreadable here, and this\n` +
      `  is a FAILURE rather than a skip: comparing nothing is the state this gate exists to refuse.\n` +
      `  Either restore the literal, or update SITES in scripts/verify-notation-parity.mjs.`,
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
  for (const [name, rel] of Object.entries(sites)) {
    if (!cache.has(rel)) cache.set(rel, readFileSync(join(root, rel), 'utf8'))
    out[name] = patternSource(cache.get(rel), name, rel)
  }
  return out
}

/**
 * The guard's own guards, on the input they exist for.
 *
 * Every one of these mutates something this gate reads and asserts the gate NOTICES. A gate whose
 * own controls have never been shown to fire is the shape `M141` names, and this one is especially
 * exposed to it: it is green on real prose by construction (see the header), so its fixtures are
 * the only thing standing between it and vacuity.
 */
export function selfTest() {
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

function main() {
  if (process.argv.includes('--self-test')) return selfTest()
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

  const problems = compare(ours, theirs)
  if (problems === null) {
    console.log(
      `✓ notation parity: ${TEXTUAL.length} pattern(s) byte-identical, ` +
      `${BEHAVIOURAL.length} behaviourally equal over ${FIXTURES.length} fixture(s), ` +
      `${PERMITTED.size} declared divergence(s), all still exercised`,
    )
    return 0
  }
  console.error(`✗ notation parity: ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`  ${p}\n`)
  return 1
}

if (process.argv[1] && process.argv[1].endsWith('verify-notation-parity.mjs')) process.exit(main())
