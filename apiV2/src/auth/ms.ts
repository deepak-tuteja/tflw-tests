// Tiny "5s"/"1h"/"2h" duration parser — just enough for the TTL strings this app configures
// (no calendar units), so cookie Max-Age and refresh-token expiresAt can agree with the JWT's
// own `expiresIn` without pulling in a general-purpose duration library.
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`unsupported duration format: "${value}"`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
}
