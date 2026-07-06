// JS escape hatch demo (P#11): called from actions-and-helpers.tflw as `make receipt(...)`
// (camelCase -> makeReceipt). Embeds a `require env` secret in its return value to prove
// redaction survives the escape hatch (SPEC's taint-tracking guarantee).
export function makeReceipt(ctx: { env: NodeJS.ProcessEnv }, productId: string, price: number): string {
  return `receipt for ${productId}: $${price.toFixed(2)}, approved by ${ctx.env.ADMIN_EMAIL ?? 'unknown'}`;
}
