// `M189a` (`D974`) — is a mutation's source even executed by the roster? Measured, never judged.
//
// ## The question, and why it is a different one from the census's
//
// `M164b`'s census asks *does the roster go red under this mutation?* and 99 runtime mutations
// answered no. Each of those is a precise sentence — tflw's own suite tells this line from its
// opposite and the dogfood cannot — but it folds two very different situations into one word. A
// plant may run straight through the mutated line and assert nothing that depends on it (the
// dogfood is shallow there), or no plant may ever execute the line at all (the dogfood does not
// go there). The repair for the first is an assertion; for the second it is a fixture, or a
// decision that the roster has no business going there. Nothing in the census can say which, and
// a person reading 99 survivors by eye is `M176-05`'s hand step again, one artefact over.
//
// So this measures it. The roster runs once against **unmutated** tflw with V8's block coverage
// on (`NODE_V8_COVERAGE`, which every spawned `node` inherits, so the vendored `cli.cjs` the plants
// actually execute is what gets recorded), the bundle's source map takes each executed range back
// to `packages/*/src`, and each registry mutation's `find` region is asked whether any of its
// lines was hit. That is a fact about one run, and it is stamped as one.
//
// ## What "reached" does and does not mean
//
// Reached is a **necessary** condition for a plant to see the mutation and never a sufficient one:
// the census is the sufficient half. Unreached is the strong verdict — no plant executed a single
// line of the region, so no assertion anywhere could have depended on it, and the `M164b` verdict
// for that mutation is a statement about the roster's *reach* and nothing about its *depth*. A
// `find` region is often a whole `if` including its body, so a region whose guard line runs and
// whose body never does still reads reached; the per-line detail is kept for exactly that reason.
//
// ## Why stdlib, and why the map is decoded here
//
// tflw's own `scripts/coverage.mjs` gets the same numbers from `c8`, and the source-map decode
// below is the forty lines of that tool this repository needs. The sibling has two dev
// dependencies on purpose (`axe-core`, `playwright`) and a coverage stack is not going to be the
// third for one census-time script. `bundle.mjs` already emits the map when
// `TFLW_BUNDLE_SOURCEMAP=1` is set, gated so the published artifact never carries it — the
// driver sets that for one re-vendor and re-vendors plainly afterwards (`D954`: the box's vendored
// tflw is only ever changed by `refresh-tflw`).
//
// ## The offsets are trusted only after a control says they line up
//
// V8 reports character offsets into the script source it compiled. For a CommonJS file on
// current Node that is the file's own text — the loader compiles with parameters rather than by
// prepending a wrapper — but that has been false before (`c8`'s `--wrapper-length` exists because
// of it), and an off-by-62 here would read as a plausible but wrong reach for every mutation.
// `alignmentControl` therefore maps the start of every named function V8 reports back to source
// and checks the name is on that line; the driver refuses to write a number until that rate is
// high. `M166`'s rule: a gate that fails plausibly is worse than one that refuses.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ── source maps (v3), decoded ─────────────────────────────────────────────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64V = new Map([...B64].map((c, i) => [c, i]));

/** Decodes one VLQ run into its integers. Exported for the self-test's known vectors. */
export function decodeVlq(s) {
  const out = [];
  let value = 0, shift = 0;
  for (const c of s) {
    const d = B64V.get(c);
    if (d === undefined) throw new Error(`not a base64-VLQ character: ${JSON.stringify(c)}`);
    value += (d & 31) << shift;
    if (d & 32) { shift += 5; continue; }
    out.push(value & 1 ? -(value >> 1) : value >> 1);
    value = 0; shift = 0;
  }
  if (shift !== 0) throw new Error('truncated VLQ run');
  return out;
}

/**
 * The map's segments, one array per generated line: `[genCol, srcIdx, srcLine, srcCol]`, all
 * 0-based. Segments with no source (one field) are dropped — they carry no attribution.
 */
export function decodeMappings(mappings) {
  const lines = [];
  let src = 0, srcLine = 0, srcCol = 0;
  for (const line of mappings.split(';')) {
    const segs = [];
    let genCol = 0;
    if (line.length > 0) for (const seg of line.split(',')) {
      const f = decodeVlq(seg);
      genCol += f[0];
      if (f.length < 4) continue;
      src += f[1]; srcLine += f[2]; srcCol += f[3];
      segs.push([genCol, src, srcLine, srcCol]);
    }
    lines.push(segs);
  }
  return lines;
}

/** Offset of each line's first character, so `(line, col)` and V8's flat offsets can meet. */
export function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/**
 * The bundle's sources as repository-relative paths. esbuild writes them relative to the map's
 * own directory — `../../runtime/src/x.ts` from the CLI package's `dist/` — so they are resolved
 * against where the map was *built*, not where it was installed. `builtDir` is that directory
 * relative to the sibling root, and the caller gets it from the resolver (`lib/tflw-bin.mjs`),
 * which is the one place allowed to know where a tflw build lives. Third-party sources resolve
 * under `node_modules/` and are kept as such; nothing in the registry lives there.
 */
export function sourcePaths(map, builtDir) {
  if (typeof builtDir !== 'string' || builtDir.length === 0) throw new Error('sourcePaths needs the directory the map was built in, relative to the sibling root');
  const root = map.sourceRoot ? map.sourceRoot.replace(/\/$/, '') + '/' : '';
  return map.sources.map((s) => {
    const parts = `${builtDir}/${root}${s}`.split('/');
    const out = [];
    for (const p of parts) {
      if (p === '' || p === '.') continue;
      if (p === '..') out.pop(); else out.push(p);
    }
    return out.join('/');
  });
}

// ── V8 block coverage, folded onto generated positions ────────────────────────────────────────
/**
 * Every mapped generated position of one bundle, sorted by offset, each knowing its source line.
 * Built once per bundle; every process's coverage is then a boolean sweep over it.
 */
export function positionsOf(bundleText, map, builtDir) {
  const starts = lineStarts(bundleText);
  const lines = decodeMappings(map.mappings);
  const sources = sourcePaths(map, builtDir);
  const positions = [];
  for (let l = 0; l < lines.length && l < starts.length; l++) {
    for (const [col, src, srcLine] of lines[l]) positions.push({ offset: starts[l] + col, source: sources[src], line: srcLine + 1 });
  }
  positions.sort((a, b) => a.offset - b.offset);
  return positions;
}

/**
 * Marks, in `hit` (a `Uint8Array` parallel to `positions`), every position whose innermost V8
 * range executed at least once in this process. Ranges nest or are disjoint (a block inside its
 * function, a function inside its enclosing one), so a stack sweep gives the innermost one.
 * Counts are OR-ed across processes by the caller: a line is reached if any process reached it.
 */
export function markExecuted(positions, functions, hit) {
  const ranges = [];
  for (const f of functions) for (const r of f.ranges) ranges.push(r);
  ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  const stack = [];
  let next = 0;
  for (let i = 0; i < positions.length; i++) {
    const at = positions[i].offset;
    while (next < ranges.length && ranges[next].startOffset <= at) stack.push(ranges[next++]);
    while (stack.length > 0 && stack[stack.length - 1].endOffset <= at) stack.pop();
    if (stack.length > 0 && stack[stack.length - 1].count > 0) hit[i] = 1;
  }
  return hit;
}

/** Folds `hit` into `source -> Set<line>`; with `hit` omitted, every mapped line (the denominator). */
export function linesBySource(positions, hit = null) {
  const out = new Map();
  for (let i = 0; i < positions.length; i++) {
    if (hit && !hit[i]) continue;
    const p = positions[i];
    if (!out.has(p.source)) out.set(p.source, new Set());
    out.get(p.source).add(p.line);
  }
  return out;
}

// ── a mutation's region, located the way `mutate.mjs` locates it ──────────────────────────────
/**
 * Where a `find` string sits in its file, as 1-based inclusive lines. `mutate.mjs` applies a
 * patch only when `find` occurs exactly once, so anything else is *not located* here too — and
 * says how many times, because a registry that has moved since the census is `D854`'s case and
 * the reader must be able to tell it from an unreached line.
 */
export function locateFind(text, find) {
  const n = text.split(find).length - 1;
  if (n !== 1) return { ok: false, reason: n === 0 ? 'find string absent from the source' : `find string matches ${n} times, not 1` };
  const start = text.indexOf(find);
  const line = (at) => text.slice(0, at).split('\n').length;
  return { ok: true, from: line(start), to: line(start + Math.max(find.length - 1, 0)) };
}

/**
 * One mutation's reach. `edits` (`lib/mutations.mjs`'s `editsOf`) are unioned — a mutation
 * reachable through any of its coordinated edits is reachable.
 *
 *   located  every find string occurs exactly once in the current source
 *   mapped   at least one region line has a mapping in the bundle at all (an import line, a type,
 *            or a file outside the bundle has none, and that is `unmapped`, not `unreached`)
 *   reached  at least one region line executed in at least one plant's run
 */
export function reachOf(edits, sourceText, reachedBySource, mappedBySource, source, plantsReaching) {
  const regions = [];
  for (const { find } of edits) {
    const loc = locateFind(sourceText, find);
    if (!loc.ok) return { located: false, reason: loc.reason, mapped: false, reached: false, regions: [], lines: [], plants: [] };
    regions.push([loc.from, loc.to]);
  }
  const inRegion = (l) => regions.some(([a, b]) => l >= a && l <= b);
  const mapped = [...(mappedBySource.get(source) ?? [])].filter(inRegion).sort((a, b) => a - b);
  const lines = [...(reachedBySource.get(source) ?? [])].filter(inRegion).sort((a, b) => a - b);
  const plants = plantsReaching ? plantsReaching(source, inRegion) : [];
  return { located: true, mapped: mapped.length > 0, mappedLines: mapped.length, reached: lines.length > 0, regions, lines, plants };
}

// ── the alignment control ─────────────────────────────────────────────────────────────────────
/**
 * Every named function V8 reports, mapped back through the bundle: the name should be on the
 * source line its start offset lands on. esbuild renames a colliding name with a numeric suffix
 * (`resolve2`), so the suffix is allowed to be absent from the source. Returns the rate and the
 * first misses, so a wrong answer can be looked at rather than argued with.
 */
export function alignmentControl(positions, functions, readSource, limit = 2000) {
  let checked = 0, matched = 0;
  const misses = [];
  const byOffset = positions;
  const posAt = (offset) => {
    let lo = 0, hi = byOffset.length - 1, best = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (byOffset[mid].offset <= offset) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    return best === -1 ? null : byOffset[best];
  };
  for (const f of functions) {
    if (checked >= limit) break;
    if (!f.functionName || !/^[A-Za-z_$][\w$]*$/.test(f.functionName)) continue;
    const start = f.ranges[0]?.startOffset;
    if (start === undefined) continue;
    const p = posAt(start);
    if (!p || p.source.startsWith('node_modules/')) continue;
    const text = readSource(p.source);
    if (text === null) continue;
    const line = text.split('\n')[p.line - 1] ?? '';
    checked += 1;
    const bare = f.functionName.replace(/\d+$/, '');
    if (line.includes(f.functionName) || line.includes(bare)) matched += 1;
    else if (misses.length < 8) misses.push({ name: f.functionName, source: p.source, line: p.line, text: line.trim().slice(0, 80) });
  }
  return { checked, matched, rate: checked === 0 ? 0 : matched / checked, misses };
}

/**
 * `D847`'s bundle identity — the sha of the bundle with the three build-stamp fields normalised
 * out. The census computes the same thing over the same file; a stamp carrying this lets a reader
 * put a reach measurement and a census beside each other and know whether they saw one build.
 */
export function bundleIdentity(text) {
  const src = text
    .replace(/builtAt: *"[^"]*"/g, 'builtAt:"X"')
    .replace(/commit: *"[^"]*"/g, 'commit:"X"')
    .replace(/dirty: *(true|false)/g, 'dirty:X')
    .replace(/\n\/\/# sourceMappingURL=.*$/m, '');
  return createHash('sha256').update(src).digest('hex').slice(0, 16);
}

// ── self-test ─────────────────────────────────────────────────────────────────────────────────
// A VLQ encoder exists here only so the fold can be driven over a map built in the test; the
// decoder is checked against known vectors first, so the two are not merely agreeing with each other.
function encodeVlq(nums) {
  let s = '';
  for (let n of nums) {
    let v = n < 0 ? ((-n) << 1) | 1 : n << 1;
    do { let d = v & 31; v >>>= 5; if (v > 0) d |= 32; s += B64[d]; } while (v > 0);
  }
  return s;
}

function selfTest() {
  const ok = [], bad = [];
  const t = (name, cond) => (cond ? ok : bad).push(name);

  t('VLQ known vectors: `A`=0 `C`=1 `D`=-1 `gB`=16 `hB`=-16', JSON.stringify(decodeVlq('ACDgBhB')) === '[0,1,-1,16,-16]');
  t('the test encoder round-trips through the decoder', JSON.stringify(decodeVlq(encodeVlq([0, 7, -3, 1234, -99999]))) === '[0,7,-3,1234,-99999]');
  t('a truncated run is refused, not read as zero', (() => { try { decodeVlq('g'); return false; } catch { return true; } })());

  // A three-line "bundle" mapped to two sources. Source A: line 1 -> gen line 0 cols 0 and 10;
  // line 2 -> gen line 1 col 0. Source B: line 5 -> gen line 2 col 4. Gen line 1 col 8 has a
  // one-field segment (no source) that must be dropped.
  const gen = 'aaaaaaaaaaAAAAAAAAAA\nbbbbbbbbBBBB\n    cccc\n';
  const mappings = [
    [encodeVlq([0, 0, 0, 0]), encodeVlq([10, 0, 0, 5])].join(','),
    [encodeVlq([0, 0, 1, -5]), encodeVlq([8])].join(','),
    encodeVlq([4, 1, 3, 0]),
  ].join(';');
  const map = { version: 3, sources: ['../../runtime/src/a.ts', '../src/b.ts'], mappings };
  const BUILT = 'pk/tool/out';
  t('sources resolve from the built directory to repository paths', JSON.stringify(sourcePaths(map, BUILT)) === '["pk/runtime/src/a.ts","pk/tool/src/b.ts"]');
  t('a map cannot be read without saying where it was built', (() => { try { sourcePaths(map); return false; } catch { return true; } })());
  const positions = positionsOf(gen, map, BUILT);
  t('four mapped positions, the source-less segment dropped, sorted by offset',
    positions.length === 4 && positions.map((p) => p.offset).join(',') === '0,10,21,38');
  t('positions carry 1-based source lines', positions[0].line === 1 && positions[2].line === 2 && positions[3].line === 5);

  // One process: the whole script ran (count 1), a nested block over gen line 1 did not (count 0),
  // and a block inside THAT block did (count 2) — innermost wins in both directions.
  const proc1 = [{ functionName: '', ranges: [
    { startOffset: 0, endOffset: gen.length, count: 1 },
    { startOffset: 21, endOffset: 34, count: 0 },
    { startOffset: 21, endOffset: 22, count: 2 },
  ] }];
  const hit = new Uint8Array(positions.length);
  markExecuted(positions, proc1, hit);
  t('innermost range decides: the outer count-1 does not rescue a count-0 block', hit[0] === 1 && hit[1] === 1 && hit[3] === 1 && hit[2] === 1);
  const hit2 = new Uint8Array(positions.length);
  markExecuted(positions, [{ functionName: '', ranges: [{ startOffset: 0, endOffset: gen.length, count: 1 }, { startOffset: 21, endOffset: 34, count: 0 }] }], hit2);
  t('a position inside an unexecuted block is not hit', hit2[2] === 0 && hit2[0] === 1);
  markExecuted(positions, [{ functionName: '', ranges: [{ startOffset: 0, endOffset: gen.length, count: 0 }, { startOffset: 20, endOffset: 34, count: 3 }] }], hit2);
  t('a second process ORs in: the same position is now hit', hit2[2] === 1);
  const reached = linesBySource(positions, hit2);
  const mapped = linesBySource(positions);
  t('folded by source and line', [...reached.get('pk/runtime/src/a.ts')].join(',') === '1,2' && mapped.get('pk/tool/src/b.ts').has(5));

  // locate + reach
  const srcA = 'import x;\nconst a = 1;\nif (a) {\n  b();\n}\nconst c = 2;\n';
  t('a find occurring once is located to its lines', JSON.stringify(locateFind(srcA, 'if (a) {\n  b();\n}')) === '{"ok":true,"from":3,"to":5}');
  t('a find absent from the source is not located, and says so', /absent/.test(locateFind(srcA, 'zzz').reason));
  t('a find occurring twice is not located, and says how many', /2 times/.test(locateFind(srcA, 'const').reason));
  const rb = new Map([['a.ts', new Set([2, 3])]]);
  const mb = new Map([['a.ts', new Set([2, 3, 4, 6])]]);
  const plants = (s, inRegion) => (inRegion(3) ? ['C1'] : []);
  const r1 = reachOf([{ find: 'if (a) {\n  b();\n}' }], srcA, rb, mb, 'a.ts', plants);
  t('a region whose guard line ran is reached, with only the executed lines listed', r1.reached && r1.lines.join(',') === '3' && r1.mappedLines === 2 && r1.plants[0] === 'C1');
  const r2 = reachOf([{ find: 'const c = 2;' }], srcA, rb, mb, 'a.ts', plants);
  t('a mapped region no process executed is unreached, not unmapped', r2.located && r2.mapped && !r2.reached);
  const r3 = reachOf([{ find: 'import x;' }], srcA, rb, mb, 'a.ts', plants);
  t('a region with no mapping at all is unmapped, and not counted as unreached', r3.located && !r3.mapped && !r3.reached);
  const r4 = reachOf([{ find: 'nope' }, { find: 'const c = 2;' }], srcA, rb, mb, 'a.ts', plants);
  t('a coordinated edit with one absent find is not located as a whole', !r4.located);
  const r5 = reachOf([{ find: 'import x;' }, { find: 'if (a) {' }], srcA, rb, mb, 'a.ts', plants);
  t('coordinated edits union: one unmapped and one reached is reached', r5.reached && r5.lines.join(',') === '3');

  // alignment
  const fns = [
    { functionName: 'alpha', ranges: [{ startOffset: 0, endOffset: 5, count: 1 }] },
    { functionName: 'beta2', ranges: [{ startOffset: 21, endOffset: 25, count: 1 }] },
    { functionName: 'gamma', ranges: [{ startOffset: 38, endOffset: 40, count: 1 }] },
  ];
  const read = (s) => (s.endsWith('a.ts') ? 'function alpha() {}\nconst beta = () => 1;\n' : 'x\nx\nx\nx\nnot here\n');
  const al = alignmentControl(positions, fns, read);
  t('the alignment control counts names found on their mapped line, suffix-stripped, and lists the misses',
    al.checked === 3 && al.matched === 2 && al.misses.length === 1 && al.misses[0].name === 'gamma' && al.misses[0].line === 5);

  t('the bundle identity ignores the build stamp and the map comment',
    bundleIdentity('x builtAt:"a" commit:"b" dirty:true\n//# sourceMappingURL=cli.cjs.map') === bundleIdentity('x builtAt:"c" commit:"d" dirty:false'));

  if (bad.length) {
    console.error(`✗ reach self-test: ${bad.length} of ${ok.length + bad.length} control(s) did not fire`);
    for (const b of bad) console.error(`    · ${b}`);
    return 1;
  }
  console.log(`✓ reach self-test: ${ok.length} control(s), each shown to fire on the input it exists for`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--self-test')) {
    console.error('✗ this module is a library; its only command-line mode is `--self-test`.');
    process.exit(64);
  }
  process.exit(selfTest());
}
