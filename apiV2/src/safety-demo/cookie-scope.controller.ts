import { Controller, Get, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';

// The apiV2 half of the cookie-scoping fixture (tflw SPEC §3.3, review cluster C2 / `B4-06`,
// D-M88-10) — `inventory-service`'s `OpsSessionController` is the other, and neither proves much
// alone. Origin scoping is a claim about a *pair* of directions, and the direction that used to be
// broken is only visible from the receiving end: before tflw M88c2, `inventory-service`'s own
// `inv_ops` cookie came back to *this* service on the very next step, because the jar tracked
// cookies by name and nothing else.
//
// Reflects only the `Cookie` header the caller itself just sent. Lives beside `safety-demo` rather
// than in a module of its own because it is the same kind of thing: a deliberately-excluded test
// affordance that exists so a guardrail can be shown working, not a product surface.
@ApiExcludeController()
@Controller('cookie-scope')
export class CookieScopeController {
  @Get('echo')
  echo(@Req() req: Request) {
    return { cookie: req.headers.cookie ?? null };
  }
}
