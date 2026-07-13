// JS escape hatch (M18/plan_v2.md Part J, regression scan finding #3): walks every cursor page of
// GET /v1/products/:id/reviews and throws unless the union of every page is exactly
// `expectedCount` unique review ids — no loops in the DSL grammar (SPEC §7.5), and this is the one
// property a page-by-page `.tflw` assertion can't express: that the keyset tie-break
// (reviews.service.ts's millisecond-truncated comparison, needed because Postgres's `now()` has
// microsecond precision but the cursor is JS-Date-encoded to millisecond precision) never leaks a
// boundary row onto the next page twice or drops it entirely. The call itself is the assertion,
// same pattern as concurrent-orders.ts/schema-check.ts.
const BASE_URL = 'http://localhost:4001/v1';

export async function assertReviewCursorWalk(
  _ctx: { env: NodeJS.ProcessEnv },
  productId: string,
  pageSize: number,
  expectedCount: number,
): Promise<void> {
  const seen: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const url = cursor
      ? `${BASE_URL}/products/${productId}/reviews?limit=${pageSize}&cursor=${encodeURIComponent(cursor)}`
      : `${BASE_URL}/products/${productId}/reviews?limit=${pageSize}`;
    const res = await fetch(url);
    const body = (await res.json()) as { data: Array<{ id: string }>; nextCursor: string | null };
    seen.push(...body.data.map((row) => row.id));
    if (!body.nextCursor) break;
    cursor = body.nextCursor;
  }
  const unique = new Set(seen);
  if (unique.size !== seen.length) {
    throw new Error(`cursor walk returned a duplicate review id: saw ${seen.length}, ${unique.size} unique`);
  }
  if (seen.length !== expectedCount) {
    throw new Error(`cursor walk returned ${seen.length} reviews, expected exactly ${expectedCount}`);
  }
}
