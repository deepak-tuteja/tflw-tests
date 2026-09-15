#!/usr/bin/env node
// `M195` S2 (tflw `PLAN_M195_REGRESSION_GAP.md`, `D1017`): `tflw lsp` as an editor gets it — a
// process on stdio, driven by a real client over the wire, against this project's corpus with
// `tflw.config` found on disk. `@tflw/lsp-server`'s unit suite mocks the transport (an in-memory
// stream pair to `startServer()`), and the sweep drove the server not at all; what had never been
// asked is whether the *process* answers, over the framing, about *this* corpus, with the config
// resolved from the opened file's path rather than handed in. So the client is a client
// (`scripts/lib/lsp-client.mjs`, stdlib only) and the corpus is the one `tflw run` discovers.
//
// WHAT IT ASKS. `initialize` (the capabilities the server advertises, held to the set the editor
// extension relies on); every discoverable file opened, and the diagnostics the server publishes
// for each — expected empty on the green corpus, and compared against `tflw check` over the same
// files so the two paths' disagreement, if any, is printed rather than assumed away (the plan's
// prediction 3 is that they disagree at least once; this is where it is measured); a completion at a
// real site; a definition from a reference to its capture; a hover on that capture; a rename in a
// COPY of one file (`tests/.scratch/`, gitignored), its edits applied, the copy still clean by
// `check` and by the server after `didChange`; formatting on a formatted file (an empty edit list —
// the server's formatter is `tflw fmt`, and `verify:fmt` holds the corpus formatted); `shutdown`
// and `exit`, and the exit code the process gave.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveTflw } from './lib/tflw-bin.mjs';
import { applyEdits, offsetAt, positionAt, startLspClient } from './lib/lsp-client.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_ENTRY = resolveTflw('released', { label: 'verify-lsp' }).entry;
// Import-free, one capture defined and referenced twice, so a rename has three edits and the copy
// needs nothing beside it.
const SITE_FILE = 'tests/examples/hooks-explained.tflw';
const SCRATCH_DIR = path.join(ROOT, 'tests', '.scratch');
const COPY = path.join(SCRATCH_DIR, 'verify-lsp-rename-copy.tflw');
const DIAGNOSTICS_TIMEOUT_MS = 120_000;

let violations = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    violations++;
  }
}

/** The files `tflw run` discovers with no arguments — dot-directories and `node_modules` skipped,
 * the config's `exclude` honoured (tflw `packages/cli/src/project.ts`), walked here so the corpus
 * the server is asked about is the one the sweep runs. */
function discoverable(dir, exclude, rel = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (exclude.includes(relPath)) continue;
    if (e.isDirectory()) out.push(...discoverable(path.join(dir, e.name), exclude, relPath));
    else if (e.name.endsWith('.tflw')) out.push(relPath);
  }
  return out.sort();
}
const excludes = [...readFileSync(path.join(ROOT, 'tflw.config'), 'utf8').matchAll(/^\s*exclude\s+"([^"]+)"/gm)].map((m) => m[1]);
const FILES = discoverable(ROOT, excludes);
const uriOf = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const lsp = startLspClient('node', [CLI_ENTRY, 'lsp'], { cwd: ROOT });
const published = new Map(); // uri → diagnostics[] (latest)
lsp.on('textDocument/publishDiagnostics', (p) => published.set(p.uri, p.diagnostics));

async function waitForDiagnostics(uris, timeoutMs) {
  const start = Date.now();
  while (uris.some((u) => !published.has(u))) {
    if (Date.now() - start > timeoutMs) return uris.filter((u) => !published.has(u));
    await new Promise((r) => setTimeout(r, 50));
  }
  return [];
}

function open(rel, text, uri = uriOf(rel)) {
  lsp.notify('textDocument/didOpen', { textDocument: { uri, languageId: 'tflw', version: 1, text } });
  return uri;
}

try {
  const init = await lsp.request('initialize', { processId: process.pid, rootUri: pathToFileURL(ROOT).href, capabilities: {}, initializationOptions: {} });
  lsp.notify('initialized', {});
  const caps = init.capabilities ?? {};
  ok('`initialize` over stdio answers, and the server advertises hover, definition, completion, rename-with-prepare, signature help, semantic tokens and formatting',
    caps.hoverProvider === true && caps.definitionProvider === true && caps.completionProvider !== undefined && caps.renameProvider?.prepareProvider === true && caps.signatureHelpProvider !== undefined && caps.semanticTokensProvider !== undefined && caps.documentFormattingProvider === true,
    JSON.stringify(caps).slice(0, 300));

  // Every discoverable file, opened; the diagnostics the server publishes for each.
  const started = Date.now();
  const texts = new Map(FILES.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]));
  const uris = FILES.map((rel) => open(rel, texts.get(rel)));
  const unanswered = await waitForDiagnostics(uris, DIAGNOSTICS_TIMEOUT_MS);
  ok(`the server publishes diagnostics for every opened file — ${FILES.length} files in ${((Date.now() - started) / 1000).toFixed(1)}s`, unanswered.length === 0, `${unanswered.length} never answered: ${unanswered.slice(0, 3).map((u) => path.relative(ROOT, fileURLToPath(u))).join(', ')}`);
  const withDiagnostics = FILES.filter((rel) => (published.get(uriOf(rel)) ?? []).length > 0);
  const lspTotal = FILES.reduce((n, rel) => n + (published.get(uriOf(rel)) ?? []).length, 0);
  // The same corpus through `tflw check`, so a disagreement between the two paths is a printed
  // fact. `check` walks the same discovery with no file arguments.
  const check = spawnSync(process.execPath, [CLI_ENTRY, 'check', '--no-color'], { cwd: ROOT, encoding: 'utf8' });
  const checkClean = check.status === 0;
  console.log(`  diagnostics: server ${lspTotal} across ${withDiagnostics.length} file(s); \`tflw check\` exit ${check.status}`);
  for (const rel of withDiagnostics.slice(0, 10)) for (const d of published.get(uriOf(rel)).slice(0, 3)) console.log(`    ${rel}:${d.range.start.line + 1}:${d.range.start.character + 1} ${d.code ?? ''} ${d.message}`.slice(0, 200));
  ok('the server reports no diagnostic on the green corpus', lspTotal === 0, `${lspTotal} diagnostic(s) in ${withDiagnostics.length} file(s) — listed above`);
  ok('`tflw check` over the same corpus is clean — the two paths agree', checkClean && lspTotal === 0, `check exit ${check.status}, server ${lspTotal}`);

  // The control for the two lines above (`M141`'s shape: zero on a live path and zero on a dead one
  // look alike): a document that cannot parse, opened the same way, must draw a diagnostic over the
  // same transport before "no diagnostic on the corpus" means anything.
  const brokenUri = pathToFileURL(path.join(SCRATCH_DIR, 'verify-lsp-broken.tflw')).href;
  open(null, 'test "a step the language does not have"\n  frobnicate the /widgets\n', brokenUri);
  const brokenUnanswered = await waitForDiagnostics([brokenUri], 30000);
  const brokenDiagnostics = published.get(brokenUri) ?? [];
  ok(`the control: a document with an unknown step draws a diagnostic over the same transport — ${brokenDiagnostics.length}`, brokenUnanswered.length === 0 && brokenDiagnostics.length > 0, brokenUnanswered.length ? 'never answered' : JSON.stringify(brokenDiagnostics));
  lsp.notify('textDocument/didClose', { textDocument: { uri: brokenUri } });

  // A completion at a real site: the start of a step line inside a test, the keyword position.
  const siteText = texts.get(SITE_FILE);
  const siteUri = uriOf(SITE_FILE);
  const stepLine = siteText.split('\n').findIndex((l, i) => i > 0 && /^\s+api POST \/products/.test(l));
  ok(`the completion site exists in ${SITE_FILE} (a step line inside a test)`, stepLine > 0);
  const completion = await lsp.request('textDocument/completion', { textDocument: { uri: siteUri }, position: { line: stepLine, character: 2 } });
  const items = Array.isArray(completion) ? completion : (completion?.items ?? []);
  const labels = new Set(items.map((i) => i.label));
  ok(`\`textDocument/completion\` at the step position offers the step keywords — ${items.length} items, \`api\`, \`expect\`, \`capture\` among them`, labels.has('api') && labels.has('expect') && labels.has('capture'), [...labels].slice(0, 12).join(', '));

  // A definition from a reference to its capture, and a hover on the capture.
  const defOffset = siteText.indexOf('as adminToken') + 'as '.length;
  const refOffset = siteText.indexOf('{adminToken}', siteText.indexOf('test "')) + 1;
  ok('the definition site exists: `capture … as adminToken` defined once, `{adminToken}` referenced inside a test', defOffset > 2 && refOffset > 0);
  const definition = await lsp.request('textDocument/definition', { textDocument: { uri: siteUri }, position: positionAt(siteText, refOffset + 2) });
  const defLoc = Array.isArray(definition) ? definition[0] : definition;
  ok('`textDocument/definition` from `{adminToken}` lands on the `capture` that defines it', defLoc?.uri === siteUri && defLoc.range.start.line === positionAt(siteText, defOffset).line, JSON.stringify(defLoc));
  const hover = await lsp.request('textDocument/hover', { textDocument: { uri: siteUri }, position: positionAt(siteText, defOffset + 2) });
  const hoverText = typeof hover?.contents === 'string' ? hover.contents : (hover?.contents?.value ?? JSON.stringify(hover?.contents ?? null));
  ok('`textDocument/hover` on the capture answers, and names it', hover !== null && /adminToken/.test(hoverText), hoverText.slice(0, 160));

  // A rename, in a copy: prepare says where and what, rename says every edit, the edited copy is
  // still clean by both paths.
  mkdirSync(SCRATCH_DIR, { recursive: true });
  writeFileSync(COPY, siteText);
  const copyUri = pathToFileURL(COPY).href;
  open(null, siteText, copyUri);
  const copyFirst = await waitForDiagnostics([copyUri], 30000);
  ok('the copy opens clean — the server found `tflw.config` by walking up from `tests/.scratch/`', copyFirst.length === 0 && (published.get(copyUri) ?? []).length === 0, JSON.stringify(published.get(copyUri)?.slice(0, 2)));
  const prepare = await lsp.request('textDocument/prepareRename', { textDocument: { uri: copyUri }, position: positionAt(siteText, defOffset + 2) });
  ok('`textDocument/prepareRename` on the capture pre-selects `adminToken`', prepare?.placeholder === 'adminToken' && offsetAt(siteText, prepare.range.start) === defOffset, JSON.stringify(prepare));
  const rename = await lsp.request('textDocument/rename', { textDocument: { uri: copyUri }, position: positionAt(siteText, defOffset + 2), newName: 'rootToken' });
  const edits = rename?.changes?.[copyUri] ?? [];
  const occurrences = (siteText.match(/adminToken/g) ?? []).length;
  ok(`\`textDocument/rename\` returns one edit per occurrence — ${edits.length} of ${occurrences}, all in the copy`, edits.length === occurrences && Object.keys(rename?.changes ?? {}).length === 1, JSON.stringify(Object.keys(rename?.changes ?? {})));
  const renamed = applyEdits(siteText, edits);
  ok('applying the edits leaves no `adminToken` and puts `rootToken` at every site', !renamed.includes('adminToken') && (renamed.match(/rootToken/g) ?? []).length === occurrences);
  writeFileSync(COPY, renamed);
  const checkCopy = spawnSync(process.execPath, [CLI_ENTRY, 'check', '--no-color', path.relative(ROOT, COPY)], { cwd: ROOT, encoding: 'utf8' });
  ok('`tflw check` on the renamed copy is clean', checkCopy.status === 0, `${(checkCopy.stdout + checkCopy.stderr).trim().slice(0, 300)}`);
  published.delete(copyUri);
  lsp.notify('textDocument/didChange', { textDocument: { uri: copyUri, version: 2 }, contentChanges: [{ text: renamed }] });
  const copySecond = await waitForDiagnostics([copyUri], 30000);
  ok('after `didChange` with the renamed text the server publishes no diagnostic for the copy', copySecond.length === 0 && (published.get(copyUri) ?? []).length === 0, JSON.stringify(published.get(copyUri)?.slice(0, 2)));
  lsp.notify('textDocument/didClose', { textDocument: { uri: copyUri } });

  // Formatting on a formatted file: the empty edit list is the answer.
  const formatting = await lsp.request('textDocument/formatting', { textDocument: { uri: siteUri }, options: { tabSize: 2, insertSpaces: true } });
  ok('`textDocument/formatting` on a file `verify:fmt` holds formatted returns no edit', Array.isArray(formatting) && formatting.length === 0, JSON.stringify(formatting).slice(0, 160));

  const exit = await lsp.stop();
  ok('`shutdown` + `exit` end the process with exit 0', exit === 0, `exit ${exit}; stderr: ${lsp.stderr().slice(-300)}`);
} catch (error) {
  ok('the phase ran to its end', false, String(error?.stack ?? error).slice(0, 800));
  await lsp.stop();
} finally {
  if (existsSync(COPY)) rmSync(COPY);
}

if (violations > 0) {
  console.error(`\n${violations} tflw lsp violation(s).`);
  process.exit(1);
}
console.log('\ntflw lsp answers a real client over stdio about this corpus.');
