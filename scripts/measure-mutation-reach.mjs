#!/usr/bin/env node
// `npm run measure:mutation-reach` — which registry mutations does the roster even execute?
//
// `M189a`, testFlow `PLAN_M189_REACHED_BUT_NOT_ASSERTED.md` (`D974`). The census (`M164b`,
// `discover-mutation-kills.mjs`) says whether the roster goes red under each mutation; this says
// whether the roster *runs through* each mutation's source at all, so the 99 surviving runtime
// mutants can be read as two populations — reached-and-not-asserted, and never reached — instead of
// one. The reasoning is in `lib/reach.mjs`; this file is the run.
//
// ## What one invocation does
//
//   1. refuse if tflw's mutation journal is open — a reach measured through a mutated build is a
//      measurement of the wrong thing, and the census holds that journal while it runs
//   2. re-vendor tflw with `TFLW_BUNDLE_SOURCEMAP=1`, so `node_modules/tflw/dist/cli.cjs` carries
//      the map back to `packages/*/src` (`bundle.mjs` gates the map on that variable)
//   3. run the acceptance grader ONCE PER PLANT, `--only <id>`, with `NODE_V8_COVERAGE` pointed at
//      a directory named for the plant — so the attribution of a line to a plant is the process
//      tree that plant's own clauses spawned, not a guess from timestamps
//   4. fold every process's block coverage onto the bundle's mapped positions, take them back to
//      source lines, and ask each registry mutation whether any line of its `find` region ran
//   5. run three controls and refuse to write if any fails (below)
//   6. write `reach.json` under a `$produced` stamp, and re-vendor plainly
//
// Per-plant runs cost the grader's start-up 103 times over (`tflw spec`, the runnable check, the
// provenance announcement — a second or two each) on top of one roster's worth of plant runs. That
// is the price of attribution, and it buys a second fact for free: a plant that does not grade
// green under `--only <its own id>` is recorded as such, because a plant that is only ever green
// in company is a plant whose evidence is someone else's run.
//
// ## The controls, and why the artefact refuses without them
//
//   alignment  every named function V8 reports maps back to a source line carrying its name;
//              the rate must be at least 0.9, or the offsets are not the file's own offsets and
//              every reach below would be plausible and wrong (`lib/reach.mjs`)
//   reached    every mutation the census recorded as an `assertion` kill (`kill-detail.json`) must
//              read reached — a plant asserted a false answer through it, so it was executed
//   unreached  every survivor in `packages/lsp-server/` must read unreached — no plant runs a
//              language server (`lib/mutations.mjs`'s docblock says so; this checks it)
//
// A control is only a control if the run can fail it, and the third can: a plant that starts
// spawning `tflw lsp` would flip it, and that is the day the docblock's sentence needs rewriting.
//
// ## Where the artefact lands, and why it is not written into the tree
//
// `~/.tflw-mutation/reach.json` by default, the census's own state directory, for the census's own
// reason: `exec.mjs` rsyncs this tree to the box with `--delete`, so a file the box has and the Mac
// does not is deleted by the next invocation of anything. The committed copy at
// `tflw-acceptance/mutation/reach.json` is carried over by hand, as `kill-matrix.jsonl` is, and
// `read-mutation-matrix.mjs` reads the committed one.
//
//   node scripts/measure-mutation-reach.mjs                      every acceptance-graded plant
//   node scripts/measure-mutation-reach.mjs --only C95,C114      a subset (the stamp says so)
//   node scripts/measure-mutation-reach.mjs --skip-revendor      the vendored build already has its map
//   node scripts/measure-mutation-reach.mjs --keep-coverage      leave the raw V8 files for inspection
//   node scripts/measure-mutation-reach.mjs --out /tmp/reach
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { siblingRoot, readMutations, editsOf } from './lib/mutations.mjs';
import { plantsFor } from './lib/constructs.mjs';
import { patchDigest } from './lib/census-shape.mjs';
import { plantsOf } from './lib/kill-detail.mjs';
import { resolveTflw, packedFrom, BRANCH_ENTRY } from './lib/tflw-bin.mjs';
import { parseArgv, BOOLEAN, VALUE } from './lib/argv.mjs';
import { positionsOf, markExecuted, linesBySource, reachOf, alignmentControl, bundleIdentity } from './lib/reach.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SIB = siblingRoot();
const COMMITTED = path.join(ROOT, 'tflw-acceptance', 'mutation');

const SPEC = { '--only': VALUE, '--out': VALUE, '--skip-revendor': BOOLEAN, '--keep-coverage': BOOLEAN, '--help': BOOLEAN };
const parsed = parseArgv(process.argv.slice(2), SPEC);
if (!parsed.ok) { console.error(parsed.error); process.exit(64); }
const flag = (n) => parsed.values[n] ?? null;
const has = (n) => parsed.values[n] === true;
if (has('--help')) {
  console.log([
    'usage: node scripts/measure-mutation-reach.mjs [options]',
    '',
    '  --only <ids>       comma-separated plant ids (default: every acceptance-graded plant)',
    '  --out <dir>        state directory (default: ~/.tflw-mutation)',
    '  --skip-revendor    do not re-vendor before or after; the vendored build must already carry its map',
    '  --keep-coverage    keep the raw NODE_V8_COVERAGE files under <out>/reach-coverage',
    '  --help',
  ].join('\n'));
  process.exit(0);
}
const ONLY = flag('--only') ? new Set(flag('--only').split(',')) : null;
const OUT_DIR = flag('--out') ? path.resolve(flag('--out')) : path.join(homedir(), '.tflw-mutation');
const COV_DIR = path.join(OUT_DIR, 'reach-coverage');
const REACH = path.join(OUT_DIR, 'reach.json');
const ALIGNMENT_FLOOR = 0.9;

const { entry: CLI } = resolveTflw('released', { label: 'mutation-reach' });
// Where the map was BUILT, relative to the sibling root — the resolver's branch entry is the
// sibling's own `dist/cli.cjs`, and the map's sources are written relative to its directory.
const BUILT_DIR = path.relative(SIB, path.dirname(BRANCH_ENTRY)).split(path.sep).join('/');
const BUNDLES = [
  { name: 'cli.cjs', file: CLI },
  { name: 'mtls-worker.cjs', file: path.join(path.dirname(CLI), 'mtls-worker.cjs') },
];

// ── 1. the journal ────────────────────────────────────────────────────────────────────────────
const journal = await import(`file://${path.join(SIB, 'scripts', 'mutation-journal.mjs')}`);
{
  const open = journal.readJournal();
  if (open) {
    console.error(`✗ tflw's mutation journal is open (\`${open.id}\`, pid ${open.pid}) — a reach measured through a mutated build measures the wrong build.`);
    console.error('  Let the sweep finish, or repair the journal with `node scripts/discover-mutation-kills.mjs --status` in this repository.');
    process.exit(2);
  }
}

// ── 2. the instrumented vendor ────────────────────────────────────────────────────────────────
function refresh(withMap) {
  const t = Date.now();
  const r = spawnSync('npm', ['run', 'refresh-tflw'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: withMap ? { ...process.env, TFLW_BUNDLE_SOURCEMAP: '1' } : { ...process.env, TFLW_BUNDLE_SOURCEMAP: '' },
  });
  return { code: r.status, secs: Number(((Date.now() - t) / 1000).toFixed(1)), out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}
function mapOf(bundle) {
  const text = readFileSync(bundle.file, 'utf8');
  const m = /\n\/\/# sourceMappingURL=(\S+)\s*$/.exec(text);
  if (!m) return { text, map: null, why: 'no `sourceMappingURL` comment — the bundle was built without `TFLW_BUNDLE_SOURCEMAP=1`' };
  const mapFile = path.join(path.dirname(bundle.file), m[1]);
  if (!existsSync(mapFile)) return { text, map: null, why: `${m[1]} named and absent` };
  return { text, map: JSON.parse(readFileSync(mapFile, 'utf8')), why: null };
}

if (!has('--skip-revendor')) {
  console.log('› re-vendoring tflw with its source map (TFLW_BUNDLE_SOURCEMAP=1)');
  const r = refresh(true);
  if (r.code !== 0) { console.error(`✗ refresh-tflw exited ${r.code}\n${r.out.trim().split('\n').slice(-12).join('\n')}`); process.exit(1); }
  console.log(`  ${r.secs}s`);
}
let mapped;
try {
  mapped = BUNDLES.map((b) => ({ ...b, ...mapOf(b) }));
} catch (e) {
  console.error(`✗ cannot read the vendored bundles: ${e.message}`);
  process.exit(1);
}
for (const b of mapped) if (!b.map) { console.error(`✗ ${b.name}: ${b.why}`); process.exit(1); }
const BUNDLE_ID = bundleIdentity(mapped[0].text);
const packed = packedFrom();
console.log(`  bundle ${BUNDLE_ID} (D847 identity), packed from ${packed.ref ?? '?'}@${packed.sha ?? '?'}${packed.dirty ? ' (dirty)' : ''}`);

const restore = () => {
  if (has('--skip-revendor')) return;
  console.log('› re-vendoring tflw plainly (the published shape carries no map)');
  const r = refresh(false);
  if (r.code !== 0) console.error(`✗ the plain re-vendor exited ${r.code} — the vendored tflw still carries a map; run \`npm run refresh-tflw\`\n${r.out.trim().split('\n').slice(-6).join('\n')}`);
  else {
    const stillMapped = /sourceMappingURL/.test(readFileSync(CLI, 'utf8'));
    if (stillMapped) console.error('✗ the plain re-vendor left a `sourceMappingURL` in place — TFLW_BUNDLE_SOURCEMAP is set in this environment; unset it and run `npm run refresh-tflw`');
    else console.log(`  ${r.secs}s, verified: no map`);
  }
};

// ── 3. the roster, one plant at a time ────────────────────────────────────────────────────────
const GRADED = plantsFor('acceptance').map((p) => p.id);
const PLANTS = ONLY ? GRADED.filter((id) => ONLY.has(id)) : GRADED;
if (ONLY) for (const id of ONLY) if (!GRADED.includes(id)) { console.error(`✗ --only names ${id}, which is not an acceptance-graded plant`); restore(); process.exit(64); }

rmSync(COV_DIR, { recursive: true, force: true });
mkdirSync(COV_DIR, { recursive: true });

const rosterVerdicts = {};
let rosterSeconds = 0;
console.log(`› running ${PLANTS.length} plant(s), each under its own NODE_V8_COVERAGE directory`);
for (const id of PLANTS) {
  const dir = path.join(COV_DIR, id);
  mkdirSync(dir, { recursive: true });
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-construct-acceptance.mjs'), '--only', id], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NODE_V8_COVERAGE: dir },
  });
  const secs = Number(((Date.now() - t) / 1000).toFixed(1));
  rosterSeconds += secs;
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  let glyph = null, skipped = null;
  for (const line of out.split('\n')) {
    const m = new RegExp(`^\\s{2}([✓✗–])\\s+${id}\\s.*?(?:\\(skipped:\\s*([^)]*)\\))?\\s*$`).exec(line);
    if (m) { glyph = m[1]; skipped = m[2] ?? null; }
  }
  const files = readdirSync(dir).filter((f) => f.startsWith('coverage-') && f.endsWith('.json'));
  rosterVerdicts[id] = { verdict: glyph === '✓' ? 'green' : glyph === '✗' ? 'red' : 'unparsed', skipped, seconds: secs, processes: files.length };
  console.log(`  ${glyph ?? '?'} ${id.padEnd(5)} ${String(secs).padStart(6)}s  ${files.length} process(es)${skipped ? `  (skipped: ${skipped})` : ''}`);
  if (glyph === null) console.log(`      the grader's table carried no row for ${id} — recorded as unparsed, not as green`);
}

// ── 4. the fold ───────────────────────────────────────────────────────────────────────────────
console.log('› folding coverage onto the bundles');
for (const b of mapped) {
  b.positions = positionsOf(b.text, b.map, BUILT_DIR);
  b.hit = new Uint8Array(b.positions.length);
  b.hitBy = new Map(); // plant -> Uint8Array
  b.functions = []; // one process's, for the alignment control
  b.url = `file://${b.file}`;
}
for (const id of PLANTS) {
  const dir = path.join(COV_DIR, id);
  for (const f of readdirSync(dir)) {
    if (!f.startsWith('coverage-') || !f.endsWith('.json')) continue;
    let doc;
    try { doc = JSON.parse(readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    for (const script of doc.result ?? []) {
      const b = mapped.find((x) => script.url === x.url || script.url.endsWith(`/${x.name}`));
      if (!b) continue;
      const top = script.functions.find((fn) => fn.ranges[0]?.startOffset === 0);
      if (top && top.ranges[0].endOffset !== b.text.length) {
        console.error(`✗ ${b.name}: V8's top-level range ends at ${top.ranges[0].endOffset} and the file is ${b.text.length} characters — the offsets are not the file's own, so no line below could be trusted`);
        restore(); process.exit(1);
      }
      if (!b.hitBy.has(id)) b.hitBy.set(id, new Uint8Array(b.positions.length));
      markExecuted(b.positions, script.functions, b.hitBy.get(id));
      if (b.functions.length < script.functions.length) b.functions = script.functions;
    }
  }
}
for (const b of mapped) for (const arr of b.hitBy.values()) for (let i = 0; i < arr.length; i++) if (arr[i]) b.hit[i] = 1;

// Merge the two bundles' folds: source -> lines, and per plant.
const reachedBySource = new Map();
const mappedBySource = new Map();
const reachedByPlant = new Map(PLANTS.map((id) => [id, new Map()]));
const union = (into, from) => { for (const [s, lines] of from) { if (!into.has(s)) into.set(s, new Set()); for (const l of lines) into.get(s).add(l); } };
for (const b of mapped) {
  union(reachedBySource, linesBySource(b.positions, b.hit));
  union(mappedBySource, linesBySource(b.positions));
  for (const [id, arr] of b.hitBy) union(reachedByPlant.get(id), linesBySource(b.positions, arr));
}
const sourceCache = new Map();
const readSource = (rel) => {
  if (sourceCache.has(rel)) return sourceCache.get(rel);
  const p = path.join(SIB, rel);
  const text = existsSync(p) ? readFileSync(p, 'utf8') : null;
  sourceCache.set(rel, text);
  return text;
};
const plantsReaching = (source, inRegion) => PLANTS.filter((id) => [...(reachedByPlant.get(id).get(source) ?? [])].some(inRegion));

// ── the registry, every entry ─────────────────────────────────────────────────────────────────
const { mutations } = await readMutations();
const reach = {};
for (const m of mutations) {
  const text = readSource(m.file);
  const entry = { file: m.file, patch: patchDigest(m) };
  if (text === null) { reach[m.id] = { ...entry, located: false, reason: 'source file absent from the sibling tree', mapped: false, reached: false, regions: [], lines: [], plants: [] }; continue; }
  reach[m.id] = { ...entry, ...reachOf(editsOf(m), text, reachedBySource, mappedBySource, m.file, plantsReaching) };
}

// ── 5. the controls ───────────────────────────────────────────────────────────────────────────
const controls = {};
{
  const cli = mapped[0];
  const a = alignmentControl(cli.positions, cli.functions, readSource);
  controls.alignment = { checked: a.checked, matched: a.matched, rate: Number(a.rate.toFixed(3)), floor: ALIGNMENT_FLOOR, ok: a.checked > 0 && a.rate >= ALIGNMENT_FLOOR, misses: a.misses };
}
const matrix = new Map();
const matrixPath = path.join(COMMITTED, 'kill-matrix.jsonl');
if (existsSync(matrixPath)) for (const line of readFileSync(matrixPath, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  if (row.state === 'retracted') matrix.delete(row.id); else matrix.set(row.id, row);
}
const detailPath = path.join(COMMITTED, 'kill-detail.json');
const detail = existsSync(detailPath) ? JSON.parse(readFileSync(detailPath, 'utf8')) : {};
{
  // Every assertion kill was executed by the plant it killed — when that plant produced its known
  // answer here. A plant that was red or skipped in this run (`C79` with the stack down: its
  // `tflw check` half grades and its run half is refused) did not execute what the census saw it
  // execute, so the relation is set aside and counted as such rather than read as a miss.
  const green = new Set(PLANTS.filter((id) => rosterVerdicts[id].verdict === 'green'));
  const expect = [], setAside = [];
  for (const [mid, block] of Object.entries(detail)) for (const [pid, d] of Object.entries(plantsOf(block))) {
    if (d.kind !== 'assertion' || !PLANTS.includes(pid) || !reach[mid]) continue;
    (green.has(pid) ? expect : setAside).push({ mid, pid });
  }
  const failed = expect.filter(({ mid, pid }) => !(reach[mid].reached && reach[mid].plants.includes(pid)));
  controls.reached = { relations: expect.length, ok: expect.length > 0 && failed.length === 0, failed, setAside };
}
{
  const lsp = [...matrix.values()].filter((r) => r.state === 'survived' && r.file.startsWith('packages/lsp-server/') && reach[r.id]);
  const failed = lsp.filter((r) => reach[r.id].reached).map((r) => r.id);
  controls.unreached = { survivors: lsp.length, ok: lsp.length > 0 && failed.length === 0, failed };
}

console.log('› controls');
console.log(`  ${controls.alignment.ok ? '✓' : '✗'} alignment: ${controls.alignment.matched} of ${controls.alignment.checked} named functions map to a line carrying their name (${controls.alignment.rate}, floor ${ALIGNMENT_FLOOR})`);
for (const m of controls.alignment.misses.slice(0, 4)) console.log(`      · ${m.name} → ${m.source}:${m.line}  ${m.text}`);
console.log(`  ${controls.reached.ok ? '✓' : '✗'} reached: ${controls.reached.relations - controls.reached.failed.length} of ${controls.reached.relations} assertion-kill relation(s) whose plant ran read reached by that plant${controls.reached.relations === 0 ? ' — NONE RAN, so this control fired on nothing' : ''}`);
for (const f of controls.reached.failed) console.log(`      · ${f.mid} × ${f.pid}`);
if (controls.reached.setAside.length > 0) console.log(`      ${controls.reached.setAside.length} relation(s) set aside because the plant was not green in this run: ${controls.reached.setAside.map((r) => `${r.mid} × ${r.pid}`).join(', ')}`);
console.log(`  ${controls.unreached.ok ? '✓' : '✗'} unreached: ${controls.unreached.survivors - controls.unreached.failed.length} of ${controls.unreached.survivors} lsp-server survivor(s) read unreached`);
for (const f of controls.unreached.failed) console.log(`      · ${f}`);

// ── 6. the bins, and the file ─────────────────────────────────────────────────────────────────
const survivors = [...matrix.values()].filter((r) => r.state === 'survived' && r.file.startsWith('packages/runtime/') && reach[r.id]);
const bins = { reached: [], unreached: [], unmapped: [], 'not-located': [] };
for (const r of survivors) {
  const x = reach[r.id];
  (!x.located ? bins['not-located'] : !x.mapped ? bins.unmapped : x.reached ? bins.reached : bins.unreached).push(r.id);
}
const all = Object.values(reach);
console.log(`\nregistry: ${all.length} mutation(s) — ${all.filter((x) => x.reached).length} reached, ${all.filter((x) => x.located && x.mapped && !x.reached).length} unreached, ${all.filter((x) => x.located && !x.mapped).length} unmapped, ${all.filter((x) => !x.located).length} not located in the current source`);
console.log(`surviving runtime mutants (the census's): ${survivors.length} — ${bins.reached.length} reached / ${bins.unreached.length} unreached / ${bins.unmapped.length} unmapped / ${bins['not-located'].length} not located`);
const notGreen = Object.entries(rosterVerdicts).filter(([, v]) => v.verdict !== 'green');
if (notGreen.length > 0) console.log(`plants not green under their own --only: ${notGreen.map(([id, v]) => `${id} (${v.verdict}${v.skipped ? `, skipped: ${v.skipped}` : ''})`).join(', ')}`);

const allOk = Object.values(controls).every((c) => c.ok);
if (!allOk) {
  console.error('\n✗ a control did not behave; the reach is NOT written. Nothing above is a measurement until it does.');
  if (!has('--keep-coverage')) rmSync(COV_DIR, { recursive: true, force: true });
  restore();
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
const doc = {
  $produced: {
    by: 'measure-mutation-reach.mjs',
    at: new Date().toISOString(),
    machine: process.env.TFLW_EXEC_MACHINE ?? (process.platform === 'darwin' ? 'mac' : 'box'),
    tflw: { ref: packed.ref ?? null, sha: packed.sha ?? null, dirty: packed.dirty ?? null },
    bundle: BUNDLE_ID,
    registry: mutations.length,
    plants: PLANTS,
    partial: PLANTS.length !== GRADED.length,
    rosterSeconds: Number(rosterSeconds.toFixed(1)),
    rosterVerdicts,
    controls,
  },
  mutations: Object.fromEntries(Object.keys(reach).sort().map((k) => [k, reach[k]])),
};
writeFileSync(REACH, `${JSON.stringify(doc, null, 1)}\n`);
console.log(`\n✓ wrote ${REACH}${doc.$produced.partial ? ` — PARTIAL: ${PLANTS.length} of ${GRADED.length} plants, and the stamp says so` : ''}`);
console.log(`  copy it to tflw-acceptance/mutation/reach.json to commit; read:mutation-matrix reads the committed one`);
if (!has('--keep-coverage')) rmSync(COV_DIR, { recursive: true, force: true });
restore();
