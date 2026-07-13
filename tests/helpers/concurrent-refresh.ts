// JS escape hatch (M19 finding): fires N genuinely concurrent `POST /auth/refresh` requests for
// the same refresh token — the only way to prove TokenRecordsService.claimForRotation's atomic
// check-and-revoke actually grants exactly one winner. The call itself is the assertion: throws
// unless exactly one request succeeded (200) and the rest were rejected (401) — previously a
// separate assertLive+revoke pair let multiple concurrent requests each mint their own successor
// pair from the same token.
const BASE_URL = 'http://localhost:4001/v1';

export async function assertConcurrentRefresh(
  _ctx: { env: NodeJS.ProcessEnv },
  refreshToken: string,
  n: number,
): Promise<void> {
  const responses = await Promise.all(
    Array.from({ length: n }, () =>
      fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }),
    ),
  );
  const statuses = responses.map((r) => r.status);
  const succeeded = statuses.filter((s) => s === 200).length;
  const rejected = statuses.filter((s) => s === 401).length;
  if (succeeded !== 1 || rejected !== n - 1) {
    throw new Error(
      `expected exactly 1 success and ${n - 1} rejections, got statuses: ${JSON.stringify(statuses)}`,
    );
  }
}
