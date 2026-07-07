// JS escape hatch (M6, plan_v2.md Part D decision 9): tflw has no `base64(...)` generator
// function, so encoding a classic HTTP Basic credential pair has no declarative route today —
// `basic-auth.tflw` uses this either way, to get real evidence of whether that's a genuine
// missing-generator gap or a working-as-intended computation punt (argued in TFLW-GAPS.md).
export function basicAuthHeader(
  _ctx: { env: NodeJS.ProcessEnv },
  email: string,
  password: string,
): string {
  return `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`;
}
