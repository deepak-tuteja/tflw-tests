// JS escape hatch demo (M4): walks every page of GET /v1/products via a raw `fetch` — helpers
// get only `ctx.env`, no injected HTTP client (SPEC §11), so this does its own request against a
// hardcoded base URL, exactly like an `action` would thread its own headers. Proves the DSL's
// no-loops-by-design closed grammar (SPEC §7.5) can still express a full page-walk when a scenario
// genuinely needs one — the DSL itself can only ever assert a single page's shape directly.
// `q` scopes to this test's own unique-tagged products, replacing v1's `X-Test-NS` header (gone
// in v2) — the same per-test-unique-facet isolation the rest of this suite already relies on.
// `M197`: the stack's port comes from the environment the run was started under (the same
// `TFLW_API_BASE` `tflw.config` reads, offset per regression worker); the literal is the default.
const BASE_URL = process.env.TFLW_API_BASE || 'http://localhost:4001/v1';

export async function walkAllPages(_ctx: { env: NodeJS.ProcessEnv }, q: string, pageSize: number): Promise<number> {
  let page = 1;
  let seen = 0;
  for (;;) {
    const res = await fetch(
      `${BASE_URL}/products?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`,
    );
    const body = (await res.json()) as { data: unknown[]; totalPages: number };
    seen += body.data.length;
    if (page >= body.totalPages) break;
    page++;
  }
  return seen;
}
