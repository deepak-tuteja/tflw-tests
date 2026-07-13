// JS escape hatch (M19 finding): fires N genuinely concurrent `POST /auth/register` requests for
// the same email — the only way to prove the TOCTOU race between AuthService.register's
// pre-check and its INSERT is actually closed. The call itself is the assertion: throws unless
// exactly one request succeeded (201) and the rest were rejected with a clean conflict (409) —
// previously the losers surfaced as raw 500s (an uncaught unique-violation QueryFailedError).
const BASE_URL = 'http://localhost:4001/v1';

export async function assertConcurrentRegister(
  _ctx: { env: NodeJS.ProcessEnv },
  email: string,
  n: number,
): Promise<void> {
  const responses = await Promise.all(
    Array.from({ length: n }, () =>
      fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Race', email, password: 'race-Pass-123' }),
      }),
    ),
  );
  const statuses = responses.map((r) => r.status);
  const succeeded = statuses.filter((s) => s === 201).length;
  const conflicted = statuses.filter((s) => s === 409).length;
  if (succeeded !== 1 || conflicted !== n - 1) {
    throw new Error(
      `expected exactly 1 success and ${n - 1} conflicts, got statuses: ${JSON.stringify(statuses)}`,
    );
  }
}
