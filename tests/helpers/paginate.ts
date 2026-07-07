// JS escape hatch demo (PLAN M1.5): walks every page of GET /products via a raw `fetch` — helpers
// get only `ctx.env`, no injected HTTP client (SPEC §11), so this does its own request against a
// hardcoded base URL, exactly like an `action` would thread its own headers. Proves the DSL's
// no-loops-by-design closed grammar (SPEC §7.5) can still express a full page-walk when a scenario
// genuinely needs one — the DSL itself can only ever assert a single page's shape directly.
// Logged as an open gap in TFLW-FEATURE-GAPS.md #1 (no native page-walk primitive).
const CORE_BASE_URL = 'http://localhost:4001';

export async function walkAllPages(_ctx: { env: NodeJS.ProcessEnv }, ns: string, pageSize: number): Promise<number> {
  let page = 1;
  let seen = 0;
  for (;;) {
    const res = await fetch(`${CORE_BASE_URL}/products?page=${page}&pageSize=${pageSize}`, {
      headers: { 'X-Test-NS': ns },
    });
    const body = (await res.json()) as { products: unknown[]; totalPages: number };
    seen += body.products.length;
    if (page >= body.totalPages) break;
    page++;
  }
  return seen;
}
