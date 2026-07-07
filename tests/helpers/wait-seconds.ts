// JS escape hatch demo (M5): `sleep` doesn't exist by design (SPEC §9.3 P#8 — "every step
// auto-waits; only `wait until <condition>`") and `wait until api` can't carry per-step headers
// (TFLW-FEATURE-GAPS.md #3) — so waiting out a real token TTL with a specific bearer header
// attached has no declarative route at all; this is the plain fixed-delay workaround.
export async function waitSeconds(_ctx: { env: NodeJS.ProcessEnv }, seconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Number(seconds) * 1000));
}
