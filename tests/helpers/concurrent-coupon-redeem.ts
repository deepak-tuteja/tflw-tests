// JS escape hatch (M19 finding): fires 3 genuinely concurrent `POST /cart/checkout` requests,
// each a distinct shopper with their own single-item cart, all redeeming the same coupon code —
// the only way to prove a `usageLimit` boundary is enforced atomically under real concurrency
// (same reasoning as concurrent-orders.ts's stock proof and concurrent-cart-add.ts's quantity
// proof). Three discrete token params, not an array, matching this file's existing
// scalar-argument convention (concurrent-orders.ts, concurrent-cart-add.ts) rather than relying
// on an untested array-literal-as-argument DSL call shape. The call itself is the assertion:
// throws unless exactly one request succeeded (201) and the other two were rejected with a
// usage-limit conflict (409).
const BASE_URL = 'http://localhost:4001/v1';

export async function assertConcurrentCouponRedeem(
  _ctx: { env: NodeJS.ProcessEnv },
  tokenA: string,
  tokenB: string,
  tokenC: string,
  couponCode: string,
): Promise<void> {
  const responses = await Promise.all(
    [tokenA, tokenB, tokenC].map((token) =>
      fetch(`${BASE_URL}/cart/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ couponCode }),
      }),
    ),
  );
  const statuses = responses.map((r) => r.status);
  const succeeded = statuses.filter((s) => s === 201).length;
  const conflicted = statuses.filter((s) => s === 409).length;
  if (succeeded !== 1 || conflicted !== 2) {
    throw new Error(
      `expected exactly 1 success and 2 usage-limit conflicts, got statuses: ${JSON.stringify(statuses)}`,
    );
  }
}
