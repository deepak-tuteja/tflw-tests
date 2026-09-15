// JS escape hatch (M19 finding): fires N genuinely concurrent `POST /cart/items` requests for
// the same product via `Promise.all` — the same "no native way to do this declaratively" reason
// concurrent-orders.ts already documents (`tflw run --workers` parallelizes whole files, never
// rows/tests within one file). The call itself is the assertion: throws unless the final cart
// quantity for this product is exactly `baseQuantity + n * perRequestQuantity` — proving
// CartService.addItem's atomic increment (fixed from a read-modify-write race) holds under real
// concurrency, the same lost-update class M15 already fixed for stock.
// `M197`: the stack's port comes from the environment the run was started under (the same
// `TFLW_API_BASE` `tflw.config` reads, offset per regression worker); the literal is the default.
const BASE_URL = process.env.TFLW_API_BASE || 'http://localhost:4001/v1';

export async function assertConcurrentCartAdd(
  _ctx: { env: NodeJS.ProcessEnv },
  shopperToken: string,
  productId: string,
  n: number,
  perRequestQuantity: number,
  expectedFinalQuantity: number,
): Promise<void> {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${shopperToken}`,
  };
  const requests = Array.from({ length: n }, () =>
    fetch(`${BASE_URL}/cart/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ productId, quantity: perRequestQuantity }),
    }),
  );
  const responses = await Promise.all(requests);
  for (const res of responses) {
    if (res.status !== 201) {
      throw new Error(`expected every concurrent add-item request to 201, got ${res.status}`);
    }
  }

  const cartRes = await fetch(`${BASE_URL}/cart`, { headers });
  const cart = (await cartRes.json()) as { items: Array<{ productId: string; quantity: number }> };
  const item = cart.items.find((i) => i.productId === productId);
  const finalQuantity = item?.quantity ?? 0;
  if (finalQuantity !== expectedFinalQuantity) {
    throw new Error(
      `expected final cart quantity ${expectedFinalQuantity}, got ${finalQuantity} (lost update under concurrency)`,
    );
  }
}
