// JS escape hatch (M15, plan_v2.md Part H decision 2 + TFLW-GAPS.md gap #13): fires N genuinely
// concurrent order-creation requests via Promise.all — no native way to do this declaratively.
// `tflw run --workers N` parallelizes whole FILES against each other (packages/cli/src/cli.ts's
// `runWithConcurrency` dispatches one schedulable unit per file), never individual tests or
// `with each` rows within one file, so proving a race-safety property (like atomic stock
// decrement under real concurrency) from inside a single test needs raw `fetch` + `Promise.all`.
// The call itself is the assertion (same pattern as schema-and-shape.tflw's `assert matches
// schema(...)`) — throws if the observed succeeded/failed split doesn't match exactly.
// `M197`: the stack's port comes from the environment the run was started under (the same
// `TFLW_API_BASE` `tflw.config` reads, offset per regression worker); the literal is the default.
const BASE_URL = process.env.TFLW_API_BASE || 'http://localhost:4001/v1';

export async function assertConcurrentOversell(
  _ctx: { env: NodeJS.ProcessEnv },
  token: string,
  productId: string,
  attempts: number,
  expectedSucceeded: number,
): Promise<void> {
  const responses = await Promise.all(
    Array.from({ length: attempts }, () =>
      fetch(`${BASE_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: [{ productId, quantity: 1 }] }),
      }),
    ),
  );

  const succeeded = responses.filter((r) => r.status === 201).length;
  const conflicted = responses.filter((r) => r.status === 409).length;
  const expectedConflicted = attempts - expectedSucceeded;

  if (succeeded !== expectedSucceeded || conflicted !== expectedConflicted) {
    const statuses = responses.map((r) => r.status).join(', ');
    throw new Error(
      `expected exactly ${expectedSucceeded} succeeded (201) and ${expectedConflicted} conflicted (409) ` +
        `across ${attempts} concurrent attempts, got ${succeeded} succeeded and ${conflicted} conflicted ` +
        `(statuses: [${statuses}])`,
    );
  }
}
