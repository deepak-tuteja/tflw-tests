#!/usr/bin/env node
// tflw `M268b` (`D1454`) — every lockfile this repository commits is audited, scanned and watched.
//
// tflw `M268` fixed every advisory in the root and `apiV2` lockfiles and put both under a moderate
// audit, a weekly deprecation scan and Dependabot. Switching this repository's Dependabot alerts on
// then showed 30 open alerts in three more lockfiles — `inventory-service`, `webV2`, `webV2/admin` —
// which no step read, because each of the three lists had been written by naming trees rather than
// by asking which trees exist. This gate asks: every committed `package-lock.json` must be
//   1. in `LOCKFILES` below, which is the deprecation scan's default list;
//   2. audited at moderate by a step of `ci.yml`'s `supply-chain` job; and
//   3. a `package-ecosystem: npm` directory in `.github/dependabot.yml`;
// and every name in those three must still be a committed lockfile, so none of them can describe a
// tree that has gone.
//
// Usage:  node scripts/verify-lockfiles.mjs
//         node scripts/verify-lockfiles.mjs --self-test

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Every lockfile the repository commits, relative to its root. */
export const LOCKFILES = [
  'package-lock.json',
  'apiV2/package-lock.json',
  'inventory-service/package-lock.json',
  'webV2/package-lock.json',
  'webV2/admin/package-lock.json',
];

/** `'apiV2/package-lock.json'` → `'apiV2'`; the root's is `'.'`. */
const dirOf = (lockfile) => (lockfile.includes('/') ? lockfile.slice(0, lockfile.lastIndexOf('/')) : '.');

/** The directories the `supply-chain` job audits at moderate: `npm audit …` is the root, and
 * `npm --prefix <dir> audit …` is `<dir>`. A step at any other level does not count. */
export function auditedDirs(ciYaml) {
  const start = ciYaml.search(/^ {2}supply-chain:\s*$/m);
  if (start < 0) return [];
  const rest = ciYaml.slice(start + 1);
  const next = rest.search(/^ {2}[A-Za-z0-9_-]+:\s*$/m);
  const job = next < 0 ? rest : rest.slice(0, next);
  const dirs = [];
  for (const m of job.matchAll(/^\s+run:\s*npm (?:--prefix (\S+) )?audit --audit-level=moderate\s*$/gm)) dirs.push(m[1] ?? '.');
  return dirs;
}

/** The directories `dependabot.yml` watches for npm. */
export function dependabotDirs(yaml) {
  const dirs = [];
  for (const block of yaml.split(/^ {2}- /m).slice(1)) {
    if (!/package-ecosystem:\s*npm\s*$/m.test(block)) continue;
    const m = block.match(/directory:\s*(\S+)/);
    if (m) dirs.push(m[1] === '/' ? '.' : m[1].replace(/^\//, '').replace(/\/$/, ''));
  }
  return dirs;
}

/** Every problem, as a sentence; an empty list is a pass. */
export function judge({ committed, listed, audited, watched }) {
  const problems = [];
  if (committed.length === 0) problems.push('git lists no committed package-lock.json — nothing was checked');
  const want = new Set(committed);
  const wantDirs = new Set(committed.map(dirOf));
  for (const f of committed) {
    if (!listed.includes(f)) problems.push(`${f} is committed and not in LOCKFILES (scripts/verify-lockfiles.mjs), so the weekly deprecation scan does not read it`);
    if (!audited.includes(dirOf(f))) problems.push(`${f} is committed and no step of ci.yml's supply-chain job runs \`npm${dirOf(f) === '.' ? '' : ` --prefix ${dirOf(f)}`} audit --audit-level=moderate\``);
    if (!watched.includes(dirOf(f))) problems.push(`${f} is committed and .github/dependabot.yml has no npm entry for \`${dirOf(f) === '.' ? '/' : `/${dirOf(f)}`}\``);
  }
  for (const f of listed) if (!want.has(f)) problems.push(`LOCKFILES names ${f}, which is not a committed lockfile — remove it`);
  for (const d of audited) if (!wantDirs.has(d)) problems.push(`ci.yml audits \`${d}\`, which holds no committed lockfile — remove the step`);
  for (const d of watched) if (!wantDirs.has(d)) problems.push(`dependabot.yml watches \`${d}\`, which holds no committed lockfile — remove the entry`);
  return problems;
}

function committedLockfiles() {
  const out = execFileSync('git', ['ls-files', '--', 'package-lock.json', '*/package-lock.json'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).sort();
}

function run() {
  const facts = {
    committed: committedLockfiles(),
    listed: LOCKFILES,
    audited: auditedDirs(readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')),
    watched: dependabotDirs(readFileSync(join(ROOT, '.github', 'dependabot.yml'), 'utf8')),
  };
  const problems = judge(facts);
  if (problems.length) {
    console.error(`✗ ${problems.length} lockfile coverage problem${problems.length === 1 ? '' : 's'}:`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`✓ ${facts.committed.length} committed lockfiles, each audited at moderate, scanned weekly and watched by Dependabot.`);
  return 0;
}

// ---------------------------------------------------------------------------------------------------

function selfTest() {
  const ci = (dirs) => `jobs:\n  other:\n    steps:\n      - run: npm --prefix stray audit --audit-level=moderate\n  supply-chain:\n    steps:\n${
    dirs.map((d) => `      - name: x\n        run: npm ${d === '.' ? '' : `--prefix ${d} `}audit --audit-level=moderate\n`).join('')}  after:\n    steps: []\n`;
  const dependabot = (dirs) => `version: 2\nupdates:\n${dirs.map((d) => `  - package-ecosystem: npm\n    directory: ${d === '.' ? '/' : `/${d}`}\n`).join('')}  - package-ecosystem: github-actions\n    directory: /web\n`;
  const all = ['package-lock.json', 'a/package-lock.json', 'a/b/package-lock.json'];
  const dirs = all.map(dirOf);
  const facts = (over = {}) => ({ committed: all, listed: all, audited: auditedDirs(ci(dirs)), watched: dependabotDirs(dependabot(dirs)), ...over });
  const cases = [
    ['the parsers read the supply-chain job only, and npm entries only', () =>
      JSON.stringify(auditedDirs(ci(dirs))) === JSON.stringify(dirs) && JSON.stringify(dependabotDirs(dependabot(dirs))) === JSON.stringify(dirs)],
    ['every lockfile covered three ways passes', () => judge(facts()).length === 0],
    ['a lockfile missing from LOCKFILES fails', () => judge(facts({ listed: all.slice(0, 2) })).length === 1],
    ['a lockfile with no audit step fails', () => judge(facts({ audited: auditedDirs(ci(dirs.slice(0, 2))) })).length === 1],
    ['an audit step at high does not count', () =>
      judge(facts({ audited: auditedDirs(ci(dirs).replace('--prefix a/b audit --audit-level=moderate', '--prefix a/b audit --audit-level=high')) })).length === 1],
    ['a lockfile Dependabot does not watch fails', () => judge(facts({ watched: dependabotDirs(dependabot(dirs.slice(1))) })).length === 1],
    ['a name for a lockfile that is gone fails, in each list', () =>
      judge(facts({ committed: all.slice(0, 2) })).length === 3],
    ['no committed lockfile at all fails as checking nothing', () => judge({ committed: [], listed: [], audited: [], watched: [] }).length === 1],
    ['this checkout: git lists exactly LOCKFILES', () => JSON.stringify(committedLockfiles()) === JSON.stringify([...LOCKFILES].sort())],
  ];
  let bad = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = fn(); } catch (e) { console.error(`    threw: ${e.message}`); }
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (!ok) bad++;
  }
  console.log(bad === 0 ? `\n✓ ${cases.length} controls pass.` : `\n✗ ${bad} of ${cases.length} controls failed.`);
  return bad === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(process.argv.includes('--self-test') ? selfTest() : run());
}
