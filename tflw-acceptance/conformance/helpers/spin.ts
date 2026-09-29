// `C45` (`short-run.tflw`) — CPU by construction. A busy wait for `ms` milliseconds on the
// runner's own thread, so a 150 ms run spends its window on the CPU whatever the machine is.
// Without it the plant's CPU reading was startup cost alone, which is a property of the host:
// 110–116% on the box, 97% pinned to one core, 84–89% on a GitHub runner.
export function spinFor(_ctx: unknown, ms: number): number {
  const end = performance.now() + ms;
  let n = 0;
  while (performance.now() < end) n++;
  return n;
}
