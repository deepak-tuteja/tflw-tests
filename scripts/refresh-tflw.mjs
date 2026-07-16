// On-demand refresh: re-packs tflw's published CLI package as a real tarball
// (proven in testFlow's M2.7 — self-contained dist/cli.js, zero @tflw/* deps)
// and reinstalls it here, as close to "npm install tflw" as possible without
// actually publishing.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_DIR = path.join(ROOT, '..', 'testFlow', 'packages', 'cli');
const VENDOR_DIR = path.join(ROOT, 'vendor');
const PKG_PATH = path.join(ROOT, 'package.json');

if (!fs.existsSync(CLI_DIR)) {
  console.error(`tflw CLI package not found at ${CLI_DIR}`);
  process.exit(1);
}

fs.mkdirSync(VENDOR_DIR, { recursive: true });

// Clear previously packed tarballs so a stale version never lingers alongside the fresh one.
for (const f of fs.readdirSync(VENDOR_DIR)) {
  if (f.endsWith('.tgz')) fs.rmSync(path.join(VENDOR_DIR, f));
}

console.log(`Packing tflw from ${CLI_DIR} ...`);
const packOutput = execSync(`npm pack --pack-destination "${VENDOR_DIR}"`, {
  cwd: CLI_DIR,
  encoding: 'utf8',
});
const tarballName = packOutput.trim().split('\n').pop();
console.log(`Packed ${tarballName}`);

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
pkg.dependencies.tflw = `file:vendor/${tarballName}`;
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');

// A bare `npm install` isn't enough when the tarball's filename+version haven't changed (the
// common case here, since tflw stays pre-1.0 `0.1.0` across refreshes): package-lock.json already
// has an `integrity` hash pinned for that exact path from the *previous* pack, so npm trusts the
// lockfile and silently skips re-extracting the new tarball content (found the hard way, decision
// 98's consumption — M21). Installing the tarball path explicitly forces npm to recompute the
// hash from what's actually on disk right now.
console.log('Reinstalling...');
execSync(`npm install "./vendor/${tarballName}"`, { cwd: ROOT, stdio: 'inherit' });

console.log(`Done. tflw installed from ${tarballName}.`);
