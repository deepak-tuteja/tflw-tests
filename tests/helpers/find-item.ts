// JS escape hatch demo (M5): `any`/`all` quantifiers (SPEC §6.3) check ONE field per array
// element independently — there's no way to assert "the element where productId=X also has
// quantity=Y" in a single statement. Two separate `any` assertions (one per field) can each be
// satisfied by a *different* array element and still both pass, proving nothing about correlation.
// This does the correlated lookup a real JSONPath filter
// (`$.items[?(@.productId=='X')].quantity`) would express declaratively. Throws (rather than
// returning a boolean) so the call itself is the assertion, same pattern as schema-check.ts.
interface OrderItem {
  productId: string;
  quantity: number;
}

export function assertItemQuantity(
  _ctx: { env: NodeJS.ProcessEnv },
  items: unknown,
  productId: string,
  expectedQuantity: number,
): string {
  const match = (items as OrderItem[]).find((i) => i.productId === productId);
  if (!match) throw new Error(`no item with productId ${productId} found among ${(items as OrderItem[]).length}`);
  if (match.quantity !== expectedQuantity) {
    throw new Error(`item ${productId} has quantity ${match.quantity}, expected ${expectedQuantity}`);
  }
  return 'ok';
}
