// The driver's argument refusals. `M190b` (`D992`), testFlow `PLAN_M190B_CONTENDED_KILLS.md`.
//
// `M190-03`: `exec.mjs exec -- 'setsid nohup … &'` never returns. The remote command runs under
// `bash -c`; a detached child keeps the wrapper's stdout open, so the ssh channel — and the
// driver's `tflw:exec` lease with it — stays held until the child exits or the Mac sleeps. The
// overnight census was launched that way on 2026-09-13: the driver hung, the sweep's own
// `boxlock.sh acquire` timed out behind the driver's lease and ran with none, and the lease would
// have vanished with the laptop lid. The rule is that a detached run takes its lease ON THE BOX,
// and the driver now says so instead of hanging.
//
// The trailing-pipeline trap (`| tail`, `| tee` — the pipeline's status is the exit status) is
// deliberately NOT a refusal here: a `| tee` is sometimes wanted, and the honest fix is `pipefail`
// for every caller, which is a behaviour change with its own row if it is ever taken.
import { fileURLToPath } from 'node:url';

/**
 * The command the driver is about to run, as the words after `--`, joined. Returns the refusal
 * text when the command's last token detaches, else `null`.
 * @param {string[]} argv
 */
export function detachedTail(argv) {
  const cmd = argv.join(' ').replace(/[\s;]+$/, '');
  if (!/(^|[^&])&$/.test(cmd)) return null;
  return 'the command ends in `&` — a detached child keeps the remote wrapper alive, so this driver would never return and its `tflw:exec` lease would be held until the Mac sleeps (`M190-03`). '
    + 'A detached run takes its lease on the box: sync the trees with a normal `exec` first, then launch by bare `ssh` with `setsid nohup … &` and a box-side `boxlock.sh acquire` holder.';
}

function selfTest() {
  const ok = []; const bad = [];
  const t = (name, cond) => (cond ? ok : bad).push(name);
  t('the overnight launch, verbatim, is refused', detachedTail(['setsid', 'nohup', 'bash', '~/m190-overnight.sh', '3', '>', 'log', '2>&1', '<', '/dev/null', '&']) !== null);
  t('a trailing `&` inside the last word is refused too', detachedTail(['sleep 5 &']) !== null);
  t('a trailing `;` after the `&` does not hide it', detachedTail(['sleep 5 &;']) !== null);
  t('`&&` is a conjunction, not a detach', detachedTail(['npm run build &&']) === null);
  t('a redirection `2>&1` at the end is not a detach', detachedTail(['npm test', '2>&1']) === null);
  t('an ordinary command passes', detachedTail(['npm', 'run', 'measure:mutation-reach']) === null);
  t('the refusal names the rule', /lease on the box/.test(detachedTail(['x &']) ?? ''));
  if (bad.length) {
    console.error(`✗ exec-argv self-test: ${bad.length} of ${ok.length + bad.length} control(s) did not fire`);
    for (const b of bad) console.error(`    · ${b}`);
    return 1;
  }
  console.log(`✓ exec-argv self-test: ${ok.length} control(s), each shown to fire on the input it exists for`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--self-test')) {
    console.error('✗ this module is a library; its only command-line mode is `--self-test`.');
    process.exit(64);
  }
  process.exit(selfTest());
}
