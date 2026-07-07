// JS escape hatch demo (PLAN M1.5): honors a server's `Retry-After` header by actually waiting
// that long before the DSL re-issues the request — `retry N` (SPEC §4.4) is fixed-count only and
// has no way to read a response header to schedule its next attempt, so this is the workaround.
// Logged as an open gap in TFLW-FEATURE-GAPS.md #2.
export async function sleepAndRetry(_ctx: { env: NodeJS.ProcessEnv }, retryAfterSeconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Number(retryAfterSeconds) * 1000));
}
