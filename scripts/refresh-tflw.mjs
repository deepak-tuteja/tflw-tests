// On-demand refresh: re-packs tflw's published CLI package as a real tarball
// (proven in testFlow's M2.7 — self-contained dist/cli.js, zero @tflw/* deps)
// and reinstalls it here, as close to "npm install tflw" as possible without
// actually publishing.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/**
 * The sibling checkout's CLI package. `../testFlow` is the layout every human here works in and
 * stays the default, but it is an *assumption about the filesystem* and it is wrong on the box:
 * `M154f`'s functional leg keeps its two checkouts under `~/tflw-perf/` with names of its own, and
 * a hard-coded `..` would have made the scheduled cross-repo gate silently pack the wrong tree — or,
 * more likely, exit 1 at 04:30 with nobody reading it. An env override rather than an argument
 * because the callers that need it are a systemd unit and a driver script, neither of which owns
 * this script's argv.
 */
const CLI_DIR = process.env.TFLW_SIBLING_CLI ?? path.join(ROOT, '..', 'testFlow', 'packages', 'cli');
const VENDOR_DIR = path.join(ROOT, 'vendor');
const PKG_PATH = path.join(ROOT, 'package.json');
const LOCK_PATH = path.join(ROOT, 'package-lock.json');

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

// ...and then drop the `integrity` hash npm just wrote back for it. `vendor/*.tgz` is gitignored
// (ci.yml decision 2: no committed tarball — every run dogfoods tflw's actual current `main`), so
// that hash is a content claim about a file no checkout ever contains. Leaving it committed is
// worse than useless in three distinct ways:
//
//   1. It is the *only* thing in this lockfile that changes when tflw's code changes, so every
//      milestone commit carries a meaningless one-line diff.
//   2. npm's cache is content-addressed by exactly this hash. On a machine that has packed tflw
//      before, `npm ci` with no `vendor/` at all still "succeeds" — resolving the package out of
//      _cacache and installing a build with no relation to the sibling repo's current `main`. The
//      same silent-staleness as the workaround above, one layer down.
//   3. On a cold cache it fails with `tarball data ... seems to be corrupted`, which sends you
//      looking for a damaged tarball instead of an absent one.
//
// With no hash recorded, all three go away: nothing churns, npm cannot resolve from cache, and a
// missing tarball reports a plain ENOENT naming the path it wanted. The other entries here
// (playwright, axe-core) are ordinary registry deps and stay fully pinned — this removes exactly
// one line, for the one dependency that is a regenerated build input rather than a fixed version.
const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
const tflwEntry = lock.packages?.['node_modules/tflw'];
if (tflwEntry?.integrity) {
  delete tflwEntry.integrity;
  fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n');
  console.log('Dropped the vendored tarball\'s integrity hash from package-lock.json.');
}

// Prove the install actually took. Every green run of this suite is a claim about the tflw build
// sitting in ../testFlow right now, so an install that quietly no-ops is not a small bug — it makes
// the entire dogfood loop report on a build nobody is looking at. M21 was exactly that, and it was
// found by hand rather than by anything failing. Compare the shipped entrypoint in node_modules
// against the one inside the tarball just packed; they are the same bytes or this run is a lie.
const packedCli = execSync(`tar -xzOf "${path.join(VENDOR_DIR, tarballName)}" package/dist/cli.cjs`, {
  maxBuffer: 64 * 1024 * 1024,
});
const installedCliPath = path.join(ROOT, 'node_modules', 'tflw', 'dist', 'cli.cjs');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
if (!fs.existsSync(installedCliPath) || sha(fs.readFileSync(installedCliPath)) !== sha(packedCli)) {
  console.error(
    `\nInstalled tflw does not match the tarball just packed — node_modules/tflw is stale.\n` +
      `  packed:    ${sha(packedCli)}\n` +
      `  installed: ${fs.existsSync(installedCliPath) ? sha(fs.readFileSync(installedCliPath)) : '<missing>'}\n` +
      `Delete node_modules/tflw and re-run; do not trust a suite run against this tree.`,
  );
  process.exit(1);
}
console.log('Verified node_modules/tflw matches the freshly packed tarball.');

console.log(`Done. tflw installed from ${tarballName}.`);
