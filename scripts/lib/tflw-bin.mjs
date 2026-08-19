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
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** True for any entry that came out of a packed tarball rather than a build tree. */
function isVendored(entry) {
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
          `It asks about the branch under review, and this entry is ${isVendored(entry) ? 'a vendored build' : 'not the sibling build'}` +
          (existsSync(sibling)
            ? ` and its bytes differ from ${sibling}.`
            : `, and ${sibling} does not exist to compare against.`) +
          '\nEither unset the override or build the sibling checkout.',
      );
    }
  }

  if (!opts.quiet) {
    const who = opts.label ? `${opts.label}: ` : '';
    process.stderr.write(`${who}tflw[${question}] ${entry} sha=${sha.slice(0, 8)} <- ${from}\n`);
  }

  return { question, entry, sha, from };
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
