import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request, Response } from "express";

// Cookie-scoping fixture for tflw's cookie jar (tflw SPEC §3.3, review cluster C2 / `B4-06`,
// D-M88-10) — the *second origin*, without which the fix is unprovable here.
//
// Until tflw M88c2 a cookie was tracked by name alone, so a `session` cookie issued by apiV2 on
// :4001 was replayed to every other service a test talked to — this one included. That is a
// credential leaving the origin that issued it with nothing having decided so: no config, no
// directive, no step. Origin scoping ended it, and the reason it needs a fixture *here* rather
// than a unit test is that unit tests can fake two origins all day without ever exercising whether
// the runtime files a cookie under the origin that actually set it. Two real ports, two real
// servers, one suite.
//
// `/echo` reflects only the `Cookie` header the caller itself just sent — the assertion this
// enables is a *negative* one ("apiV2's session cookie is not in here"), and a negative needs to
// see the whole header, not a boolean.
//
// Excluded from the OpenAPI doc: a test-affordance, not a forward-facing surface — same reasoning
// as apiV2's `SafetyDemoController`/`CatalogRedirectController`.
@ApiExcludeController()
@Controller("ops-session")
export class OpsSessionController {
  @Post()
  establish(@Res({ passthrough: true }) res: Response) {
    // Deliberately named nothing like apiV2's `session`: the point of the test is which *origin* a
    // cookie belongs to, and two same-named cookies would let a name collision masquerade as
    // correct scoping.
    res.cookie("inv_ops", "warehouse-ops-token", { path: "/", httpOnly: true });
    return { established: true };
  }

  @Get("echo")
  echo(@Req() req: Request) {
    return { cookie: req.headers.cookie ?? null };
  }
}
