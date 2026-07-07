// JS escape hatch (M6): finding a category by name within a list has no declarative predicate
// route (same "no correlated lookup" shape as find-item.ts's item-by-productId case) — used here
// only to reach one of the M6-only bulk categories (never written to by any other test in this
// suite) so `large-catalog.tflw` can assert an exact per-category count safely under parallel
// workers.
interface Category {
  id: string;
  name: string;
}

export function findCategoryId(
  _ctx: { env: NodeJS.ProcessEnv },
  categories: unknown,
  name: string,
): string {
  const match = (categories as Category[]).find((c) => c.name === name);
  if (!match) {
    throw new Error(`category "${name}" not found among ${(categories as Category[]).length}`);
  }
  return match.id;
}
