// One answer to "which tflw am I running?", and it says the answer out loud.
//
// Closes `M115-03` and `M128-04` (ledger Order 1, `M141`). Before this module, `testFlow-tests`
// held **seven** answers to that one question across ~50 resolution sites: three environment
// variable names (`TFLW_BIN`, `TFLW_CLI_ENTRY`, `TFLW_ARTIFACT_CONTRACT`), three defaults (the
// vendored tarball, `npx`, the sibling branch build), and **zero** places that printed which one
// had won. A script could grade the wrong program and its log would look identical either way.
//
// The defect was never the `npx`. `check-acceptance.mjs:39` argues at length that `npx`-by-default
// is *correct there* — that corpus' job is to grade a **released** tflw, so reporting it red on a
// branch feature the vendored 0.1.0 has never heard of is a true statement, not a bug. Both
// answers are legitimate. What was missing is anything recording **which question was asked**.
// So the fix is not a path rewrite: it is that the question becomes an argument.
//
//   resolveTflw('released')   // the vendored tarball — "does the shipped build still do this?"
//   resolveTflw('branch')     // the sibling working tree — "does my change still do this?"
//
// Deliberately NOT solved by having tflw print its own entry path in its run banner, which was the
// more obvious idea: `tflw --version` reports `0.1.0` for **both** builds (`__TFLW_VERSION__` is
// baked from `package.json`), so the CLI cannot discriminate them from the inside. Path + content
// hash is the only discriminator available, and it is the consumer's business (`D534`).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/** The vendored tarball's unpacked entry — what `npx tflw` resolves to from this repo root. */
export const RELEASED_ENTRY = path.join(ROOT, 'node_modules', 'tflw', 'dist', 'cli.cjs');

/** The sibling checkout's build. `..` because the two repos are peers, per `scripts/exec.mjs` D9. */
export const BRANCH_ENTRY = path.join(ROOT, '..', 'testFlow', 'packages', 'cli', 'dist', 'cli.cjs');

const QUESTIONS = {
  released: { entry: RELEASED_ENTRY, what: 'the vendored tarball' },
  branch: { entry: BRANCH_ENTRY, what: 'the sibling working tree' },
};

/**
 * `TFLW_BIN` is the one name. The other two are honoured as aliases so that a shell, a CI step or a
 * habit that predates this module keeps working, but each prints a deprecation line — three names
 * for one question was the defect in miniature, and silently accepting them would preserve it.
 *
 * Precedence is fixed and stated rather than discovered: `TFLW_BIN`, then `TFLW_CLI_ENTRY`. It is
 * an error to set both to different paths, because there is no honest way to pick.
 */
function envOverride() {
  const bin = process.env.TFLW_BIN?.trim() || null;
  const legacy = process.env.TFLW_CLI_ENTRY?.trim() || null;
  if (bin && legacy && path.resolve(bin) !== path.resolve(legacy)) {
    throw new Error(
      'TFLW_BIN and TFLW_CLI_ENTRY are both set and disagree:\n' +
        `  TFLW_BIN=${bin}\n  TFLW_CLI_ENTRY=${legacy}\n` +
        'They name the same thing. Unset TFLW_CLI_ENTRY (deprecated) and keep TFLW_BIN.',
    );
  }
  if (bin) return { value: bin, from: 'TFLW_BIN' };
  if (legacy) {
    process.stderr.write('tflw-bin: TFLW_CLI_ENTRY is deprecated — use TFLW_BIN (M141).\n');
    return { value: legacy, from: 'TFLW_CLI_ENTRY' };
  }
  return null;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Where `refresh-tflw` packs to, and the only artifact a `released` install may come from. */
const VENDOR_DIR = path.join(ROOT, 'vendor');

/**
 * One named entry out of an *uncompressed* tar, or `null`. Fifty lines of tar format would be a
 * dependency in any other repository; here it is twenty, and a dependency is the thing this file
 * exists to avoid taking a position on. Only the fields this needs are read — name at 0, size at
 * 124 as octal — and entries are walked in 512-byte blocks.
 */
function tarEntry(buf, want) {
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf.toString('utf8', off, off + 100).replace(/\0.*$/, '');
    if (!name) return null;
    const size = parseInt(buf.toString('ascii', off + 124, off + 136).replace(/\0.*$/, '').trim() || '0', 8);
    const body = off + 512;
    if (name === want) return buf.subarray(body, body + size);
    off = body + Math.ceil(size / 512) * 512;
  }
  return null;
}

/**
 * Does the installed entry actually come from the tarball sitting in `vendor/`? (`M184b`, `D956`.)
 *
 * WHY THIS IS NOT ALREADY ANSWERED. `refresh-tflw.mjs` verifies exactly this, by sha256, and it is
 * the right check — pointed at the one moment it cannot fail. It compares what it just packed
 * against what it just installed. The drift happens *afterwards*: until `M184a`, `exec.mjs` rsynced
 * `vendor/` to the box and excluded `node_modules/`, so a `prepare()` replaced the tarball and left
 * the install standing. Measured 2026-09-09, both machines held the identical tarball whose inner
 * `cli.cjs` hashed `7a74eade` while the box ran `0f452bb8` — and the box's build was the *better*
 * one, which is what makes this worse than staleness. Filed as `M184-01`.
 *
 * WHY THE RAW SHA IS THE RIGHT INSTRUMENT HERE AND THE WRONG ONE IN `D847`. `D847` measured that
 * `node_modules/tflw/dist/cli.cjs` moves on **every** rebuild, because `builtAt` is baked into the
 * bundle — `6f9de43c` to `23aaf15d` across two no-op refreshes — so as a proof that a *mutation*
 * was installed it says yes unconditionally. That is a statement about build *identity*. This is a
 * different question: both files here are the same artifact from the same `npm pack`, so equality
 * is exact and inequality means the two halves stopped being one fact. No normalisation, and none
 * would be correct — normalising the stamp out is precisely what would hide the box's `0f452bb8`.
 *
 * THREE STATES, NEVER TWO, on `D737`'s precedent. `unknowable` is its own answer and is printed:
 * a tree with no `vendor/*.tgz` has an install this cannot speak about, and answering `verified`
 * there would be `M131-03`'s green-about-nothing.
 *
 * `vendorDir` is a parameter so the gate can point it at a fixture. That is the seam a mutation
 * control needs; without it the only way to exercise `mismatch` is to corrupt a real install.
 *
 * @param {string} installedSha sha256 of the resolved entry
 * @param {string} [vendorDir]
 * @returns {{state:'verified'|'mismatch'|'unknowable', tarball:string|null, tarballSha:string|null,
 *            innerSha:string|null, reason:string}}
 */
export function vendorProvenance(installedSha, vendorDir = VENDOR_DIR) {
  const none = (reason) => ({ state: 'unknowable', tarball: null, tarballSha: null, innerSha: null, reason });
  if (!existsSync(vendorDir)) return none('there is no vendor/ directory to verify against (unknowable, D737)');
  const tgzs = readdirSync(vendorDir).filter((f) => f.endsWith('.tgz')).sort();
  if (tgzs.length === 0) return none('vendor/ holds no .tgz to verify against (unknowable, D737)');
  if (tgzs.length > 1) {
    return none(`vendor/ holds ${tgzs.length} tarballs (${tgzs.join(', ')}) and none of them is "the" one — refresh-tflw clears the directory before packing, so this is a hand-made state (unknowable, D737)`);
  }
  const tarball = tgzs[0];
  const file = path.join(vendorDir, tarball);
  const tarballSha = sha256(file);
  let inner;
  try {
    inner = tarEntry(gunzipSync(readFileSync(file)), 'package/dist/cli.cjs');
  } catch (err) {
    return none(`vendor/${tarball} could not be read as a gzipped tar (${err.message}) (unknowable, D737)`);
  }
  if (!inner) return none(`vendor/${tarball} contains no package/dist/cli.cjs (unknowable, D737)`);
  const innerSha = createHash('sha256').update(inner).digest('hex');
  if (innerSha === installedSha) {
    return { state: 'verified', tarball, tarballSha, innerSha, reason: 'the install matches the tarball' };
  }
  return {
    state: 'mismatch',
    tarball,
    tarballSha,
    innerSha,
    reason:
      `the installed build did NOT come from vendor/${tarball}\n` +
      `    installed  node_modules/tflw/dist/cli.cjs  sha256 ${installedSha}\n` +
      `    vendor/${tarball}  package/dist/cli.cjs     sha256 ${innerSha}\n` +
      `    (tarball file itself: ${tarballSha})\n` +
      '    One of the two arrived by a route that did not update the other — a copied tarball, or an\n' +
      '    install this tree never packed. Re-pack and re-install here: npm run refresh-tflw.\n' +
      '    The refresh is a local act on every machine and no tarball is carried between them (D954).',
  };
}

/** The ref a `released` build is allowed to have been packed from. One name, stated rather than
 *  derived, because "the default branch" is a fact about a remote this file never talks to. */
const RELEASED_REF = 'main';

/**
 * What this install was packed FROM, as recorded beside the tarball by `refresh-tflw` (`M184c`,
 * `D955`). Distinct from `vendorProvenance`, which asks whether the install matches the tarball —
 * these two can disagree in either direction and conflating them is how `M184-01` stayed invisible.
 *
 * Absent is `unknowable`, not a pass: a `vendor/` predating `M184c` has no record, and inventing
 * one from the build stamp is exactly what `D737` forbids.
 */
export function packedFrom(vendorDir = VENDOR_DIR) {
  try {
    const rec = JSON.parse(readFileSync(path.join(vendorDir, 'packed-from.json'), 'utf8'));
    return { ...rec, present: true };
  } catch {
    return { present: false, ref: null, sha: null, dirty: null, verified: false,
      source: 'no packed-from.json beside the tarball — this install predates M184c, or was not made by refresh-tflw' };
  }
}

/**
 * Why a `'released'` grader must refuse this build, or `null`.
 *
 * `released` asks *does the shipped build still do this?*, and a build packed from a feature branch
 * is not the shipped build. Grading one as `released` is the failure `M153b-01` recorded from the
 * other direction — a vendored build nine days stale reported a grammar gap tflw had already
 * closed, and the red reached a pull request body. Same class: the answer was true of some build
 * and the question was about a different one.
 *
 * ABSENT DOES NOT REFUSE, and that is deliberate rather than lenient. Every install made before
 * `M184c` has no record, so refusing on absence would brick the two machines this arrangement runs
 * on until both are refreshed — and `M131-03`'s rule is that a guard must not be green about
 * nothing, not that it must be red about everything. What it does instead is carry the state into
 * the announcement, where a reader sees `unknowable` rather than nothing at all.
 *
 * DIRTY DOES NOT REFUSE EITHER. A dirty `main` is the normal state of a working checkout and
 * refusing it would make the guard fire constantly for a condition nobody is asking about; it is
 * announced, because a grader reporting on uncommitted work should say so.
 *
 * THE ESCAPE IS THE ONE THAT ALREADY EXISTS. There is no override flag here — `resolveTflw`
 * skips this whole check when `TFLW_BIN` points somewhere else, and the honest way to grade a
 * branch build is to ask `resolveTflw('branch')`, which is what that question is for. A new
 * suppression flag would rebuild the silent path this removes (`D540`).
 */
export function packedFromProblem(rec) {
  if (!rec || !rec.present || rec.ref === null || rec.ref === RELEASED_REF) return null;
  return (
    `resolveTflw('released'): this tflw was packed from \`${rec.ref}\`, not \`${RELEASED_REF}\`.\n` +
    `    ${rec.sha ? `at ${rec.sha}${rec.dirty ? ' (dirty)' : ''}, ` : ''}${rec.verified ? 'observed in the checkout it was packed from' : 'unverified — ' + rec.source}\n` +
    `    \`released\` asks whether the SHIPPED build still does this, and a branch build is not it.\n` +
    `    Ask the other question instead — resolveTflw('branch') — or re-pack from \`${RELEASED_REF}\`\n` +
    '    on this machine: npm run refresh-tflw. The refresh is a local act on every machine (D954).'
  );
}

/**
 * What, if anything, makes a provenance verdict fatal. Separated from `resolveTflw` so the gate can
 * assert the refusal as a fact about a state rather than by corrupting an install.
 *
 * A `mismatch` refuses: `released` *means* the vendored tarball, so if the install is not from it
 * the question has no answer and grading against it reports on a build nobody named. `unknowable`
 * does not refuse — it is printed and carried, which is `D737`'s three-state design and the reason
 * a machine that installed tflw some other way is not bricked by a gate about provenance.
 */
export function vendorProblem(prov) {
  return prov && prov.state === 'mismatch' ? `resolveTflw('released'): ${prov.reason}` : null;
}

/**
 * True for any entry that is an INSTALL — something under `node_modules` — rather than a build
 * tree. The old name (`isVendored`) and its old sentence, *"came out of a packed tarball"*, were
 * both `D956`'s defect: this predicate cannot see where an install came from, only that it is one.
 * That is the whole reason `vendorProvenance` below has to exist.
 */
function isInstalledEntry(entry) {
  return entry.split(path.sep).includes('node_modules');
}

/**
 * Resolve the tflw entry point for a declared question, announce it, and return it.
 *
 * @param {'released'|'branch'} question which build the caller means to grade
 * @param {{ label?: string, quiet?: boolean }} [opts] `label` names the caller in the announcement
 * @returns {{ question: string, entry: string, sha: string, from: string }}
 */
export function resolveTflw(question, opts = {}) {
  const spec = QUESTIONS[question];
  if (!spec) {
    throw new Error(
      `resolveTflw(${JSON.stringify(question)}): the question must be 'released' or 'branch'. ` +
        'It is an argument and not a default precisely so that a call site cannot leave it implied.',
    );
  }

  const override = envOverride();
  const entry = path.resolve(override ? override.value : spec.entry);
  const from = override ? override.from : `default (${spec.what})`;

  if (!existsSync(entry)) {
    throw new Error(
      `resolveTflw('${question}'): no tflw entry at ${entry} (from ${from}).\n` +
        (question === 'branch'
          ? 'Build the sibling checkout first: (cd ../testFlow && npm run build).'
          : 'Install the vendored tarball first: npm run refresh-tflw.'),
    );
  }

  const sha = sha256(entry);

  // `M128-04`'s refusal, relocated. The row asked for "the driver refusing to run `npx`-based
  // phases without [the override]" — but the driver is untracked (`D14`, in mac-fedora-connect),
  // so a refusal living there is one no gate can see and no reviewer receives. Here a test holds
  // it. An override pointing at a *copy* of the branch build is fine; identity is by content, not
  // by path, because `exec.mjs` legitimately rsyncs the tree to the box under a different prefix.
  if (question === 'branch' && entry !== path.resolve(BRANCH_ENTRY)) {
    const sibling = path.resolve(BRANCH_ENTRY);
    const equivalent = existsSync(sibling) && sha256(sibling) === sha;
    if (!equivalent) {
      throw new Error(
        `resolveTflw('branch') refuses ${entry} (from ${from}).\n` +
          `It asks about the branch under review, and this entry is ${isInstalledEntry(entry) ? 'an installed build' : 'not the sibling build'}` +
          (existsSync(sibling)
            ? ` and its bytes differ from ${sibling}.`
            : `, and ${sibling} does not exist to compare against.`) +
          '\nEither unset the override or build the sibling checkout.',
      );
    }
  }

  // `M184b` / `D956`. The old line was `... sha=<installed> <- default (the vendored tarball)`:
  // a *resolution mode* on the right of an arrow, read by every human as a claim about the
  // artifact on the left. On the box those two were about different builds for five days and the
  // line stayed true-as-written the whole time, which is `M115-03`'s own distinction — identity is
  // not provenance — one layer out. Checked only when the entry really is the vendored install; an
  // override names its own source and has no tarball to be from.
  const vendor = question === 'released' && entry === path.resolve(RELEASED_ENTRY)
    ? vendorProvenance(sha)
    : null;
  const problem = vendorProblem(vendor);
  if (problem) throw new Error(problem);

  // `M184c` / `D955`. A second, independent fact about the same install: which ref it was packed
  // from. Checked only where the vendor check is, for the same reason — an override names its own
  // source and was never packed here.
  const packedRec = vendor ? packedFrom() : null;
  const fromProblem = packedFromProblem(packedRec);
  if (fromProblem) throw new Error(fromProblem);

  if (!opts.quiet) {
    const who = opts.label ? `${opts.label}: ` : '';
    const provenance = vendor
      ? (vendor.state === 'verified'
          ? ` — installed from vendor/${vendor.tarball} (${vendor.tarballSha.slice(0, 8)}), contents verified`
          : ` — ${vendor.reason}`)
      : '';
    // The ref is announced whatever it says, including `unknowable` — `M184-01` was invisible for
    // five days because the line printed a category and stopped, so a state this cannot establish
    // is printed as that rather than omitted.
    const packed = packedRec
      ? (packedRec.present
          ? `, packed from ${packedRec.ref ?? 'an unknown ref'}${packedRec.sha ? `@${packedRec.sha}` : ''}${packedRec.dirty ? ' (dirty)' : ''}${packedRec.verified ? '' : ' [unverified]'}`
          : ', packed from an unrecorded ref [unknowable]')
      : '';
    process.stderr.write(`${who}tflw[${question}] ${entry} sha=${sha.slice(0, 8)} <- ${from}${provenance}${packed}\n`);
  }

  return { question, entry, sha, from, vendor, packedFrom: packedRec };
}

/**
 * The resolution as an **argv pair**, for call sites that spawn rather than shell out — including
 * `verify-cli-flags.mjs`, which hands the argv to a Python `os.execvp` inside a pty. Those sites
 * cannot use a quoted string and were the last place an `['npx', 'tflw', …]` literal survived.
 */
export function tflwArgv(question, opts = {}) {
  return [process.execPath, resolveTflw(question, opts).entry];
}

/** An argv rendered for a shell. Quoted, because `ROOT` is a user path and may contain spaces. */
export function quoteArgv(argv) {
  return argv.map((a) => JSON.stringify(a)).join(' ');
}

/**
 * The same resolution, rendered for the `execSync`-with-a-string call sites that used to open with
 * a literal `npx tflw`.
 */
export function tflwCommand(question, opts = {}) {
  return quoteArgv(tflwArgv(question, opts));
}

/**
 * `dist/artifact-contract.json` beside a resolved entry. `TFLW_ARTIFACT_CONTRACT` was the third
 * env-var name for this one question; it is kept as a deprecated direct override so an operator can
 * still point the contract check at a file by hand, but the default now derives from the same
 * answer every other resolution uses instead of hardcoding the vendored path a second time.
 */
export function resolveArtifactContract(question, opts = {}) {
  const direct = process.env.TFLW_ARTIFACT_CONTRACT?.trim();
  if (direct) {
    process.stderr.write(
      'tflw-bin: TFLW_ARTIFACT_CONTRACT is deprecated — it names a build, and TFLW_BIN already does (M141).\n',
    );
    return { question, file: path.resolve(direct), from: 'TFLW_ARTIFACT_CONTRACT' };
  }
  const { entry, from } = resolveTflw(question, opts);
  return { question, file: path.join(path.dirname(entry), 'artifact-contract.json'), from };
}
