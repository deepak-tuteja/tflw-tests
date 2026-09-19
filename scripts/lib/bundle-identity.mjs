// `D847`'s bundle identity, in one place — which is what `census-shape.mjs`'s own comment already
// claims ("`D847`'s bundle identity is computed in one place for exactly this reason, after a
// normalisation that existed in one copy and not the other").
//
// **It was in two places when `M211` `S3` went looking, and they differed.** `reach.mjs` stripped a
// trailing `//# sourceMappingURL=` comment before hashing and `discover-mutation-kills.mjs` did
// not. Measured 2026-09-19 on the real bundle: both answered `414767c67fecbabd`, because
// `packages/cli/dist/cli.cjs` carries no sourcemap comment — so the copies agreed by a property of
// the input rather than by being the same rule, and the day the bundler emits one they would have
// stopped, with the census's writer and reader keyed on different digests. That is precisely the
// failure `census-shape.mjs` exists to prevent, and the comment describing the fix had drifted from
// the code it describes.
//
// ## Why a build needs an identity that is not its sha256
//
// `packages/cli/scripts/bundle.mjs` bakes `builtAt`, `commit` and `dirty` into the bundle, so two
// builds of a byte-identical tree differ. Measured on `fedora-box`: `03c152c7` against `46eb062f`,
// both 2,529,854 B, differing in one field. A raw sha therefore answers *are these the same bytes*
// and can never answer *is this the build of that source* — and `M196-01`/`D1023` made every
// milestone close-out print a `sha=` as evidence of exactly the second thing (`M203-01`).
//
// **The raw sha stays where it is right.** `tflw-bin.mjs`'s `vendorProvenance` compares an install
// against the tarball it claims to come from; both are the same artifact from one `npm pack`, so
// equality is exact and normalising the stamp out is what would have hidden `M184-01`'s
// `0f452bb8`. Two questions, two instruments, and that docblock says so already.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

/** The stamp fields the bundler bakes in, and the map comment. One list, read by every caller. */
const NORMALISE = [
  [/builtAt: *"[^"]*"/g, 'builtAt:"X"'],
  [/commit: *"[^"]*"/g, 'commit:"X"'],
  [/dirty: *(true|false)/g, 'dirty:X'],
  [/\n\/\/# sourceMappingURL=.*$/m, ''],
];

/** `D847`'s identity of a bundle's text: the sha with every build-stamp field normalised out. */
export function bundleIdentity(text) {
  let src = text;
  for (const [re, to] of NORMALISE) src = src.replace(re, to);
  return createHash('sha256').update(src).digest('hex').slice(0, 16);
}

/**
 * The same identity for a file on disk, with the evidence a caller needs to print it honestly.
 *
 * `stamps` is how many build-time literals were found. **Exactly one is the expected state**, and
 * anything else is announced rather than swallowed: a resolver that printed a normalised-looking
 * hash after normalising nothing would put a number that cannot be reproduced under a label
 * promising it can, which is `M203-01` one layer in.
 */
export function identityOf(file) {
  if (!existsSync(file)) return { sha: null, stamps: 0, normalised: false };
  const text = readFileSync(file, 'utf8');
  const stamps = (text.match(/builtAt: *"[^"]*"/g) ?? []).length;
  return { sha: bundleIdentity(text), stamps, normalised: stamps === 1 };
}

// ── self-test ─────────────────────────────────────────────────────────────────────────────────
// Each control is shown to fire on the input it exists for, which is this repository's shape for a
// self-test. The map-comment control is the one this module was extracted for: it is the clause
// that lived in `reach.mjs`'s copy and not in `discover-mutation-kills.mjs`'s.

import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function selfTest() {
  const ok = [];
  const bad = [];
  const t = (name, pass) => (pass ? ok : bad).push(name);

  const body = 'function x(){return 1}\n';
  const stamped = (at, commit, dirty) => `${body}const s={builtAt: "${at}", commit: "${commit}", dirty: ${dirty}};\n`;

  t('two builds of one tree share an identity — the whole point (`M203-01`)',
    bundleIdentity(stamped('2026-01-01T00:00:00.000Z', 'aaaaaaa', 'true')) ===
      bundleIdentity(stamped('2026-09-19T01:02:03.004Z', 'bbbbbbb', 'false')));

  t('a real content difference still moves it — the identity is not a constant',
    bundleIdentity(stamped('x', 'y', 'true')) !== bundleIdentity(`${stamped('x', 'y', 'true')}const extra=2;\n`));

  t('the trailing source-map comment is normalised out — the clause one of the two copies lacked',
    bundleIdentity(`${stamped('x', 'y', 'true')}\n//# sourceMappingURL=cli.cjs.map`) === bundleIdentity(stamped('x', 'y', 'true')));

  // A control for the control: the clause must not be so broad that it eats real code. Only a
  // trailing map comment goes; the same text mid-file is content.
  t('a `sourceMappingURL` that is not the trailing comment is content, not noise',
    bundleIdentity(`const u="//# sourceMappingURL=x";\n${stamped('x', 'y', 'true')}`) !== bundleIdentity(stamped('x', 'y', 'true')));

  const dir = mkdtempSync(path.join(tmpdir(), 'tflw-identity-'));
  const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };

  const one = identityOf(write('one.cjs', stamped('x', 'y', 'true')));
  t('a file with exactly one build stamp is normalised, and says so', one.stamps === 1 && one.normalised === true && one.sha !== null);

  const none = identityOf(write('none.cjs', body));
  t('a file with no build stamp is NOT claimed as normalised — the refusal `M203-01` is about',
    none.stamps === 0 && none.normalised === false && none.sha !== null);

  const two = identityOf(write('two.cjs', `${stamped('a', 'b', 'true')}${stamped('c', 'd', 'false')}`));
  t('two stamps is not the expected state either, and is announced rather than swallowed',
    two.stamps === 2 && two.normalised === false);

  const missing = identityOf(path.join(dir, 'nope.cjs'));
  t('a file that is not there answers null rather than throwing inside a resolver',
    missing.sha === null && missing.normalised === false);

  if (bad.length) {
    console.error(`✗ bundle-identity self-test: ${bad.length} of ${ok.length + bad.length} control(s) did not fire`);
    for (const b of bad) console.error(`    · ${b}`);
    return 1;
  }
  console.log(`✓ bundle-identity self-test: ${ok.length} control(s), each shown to fire on the input it exists for`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--self-test')) {
    console.error('usage: node scripts/lib/bundle-identity.mjs --self-test');
    process.exit(2);
  }
  process.exit(selfTest());
}
