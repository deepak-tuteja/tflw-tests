import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';

// The **enumeration** fixture slice for tflw's pentest arc Tier 4 (testFlow
// PLAN_M137_PENTEST_TIER4.md, D437/D438). `VULNS.md` row `V15`. One route, one defect, and the
// thing that makes it different from the other three controllers in this directory is not what it
// serves — it is who can find it.
//
// THIS CONTROLLER IS NOT `@ApiExcludeController()`, AND THAT IS THE ENTIRE POINT. Every other
// fixture controller here is excluded from `/openapi.json`, which until now made `VULNS.md`'s
// standing rule and the exclusion add up to *no plant can ever be documented* — and that would
// leave Tier 4's crawler with nothing an OpenAPI seed could reach that a captured-traffic seed
// could not. D437's rule is that **each seed source gets at least one plant only it can reach**,
// because otherwise dropping the enumerator makes a named plant go missing rather than making
// recall quietly drop by an amount nobody notices.
//
// WHY THAT DOES NOT VIOLATE THE EXCLUSION IT LOOKS LIKE IT VIOLATES (D438). Read
// `vuln.controller.ts:24-27`: the exclusion's stated reason is that documenting the slice
// *"would make `/openapi.json` vary by environment and every contract assertion in this suite vary
// with it."* That reason is narrower than its effect. The contract assertions it protects —
// `tests/api/catalog/contract-and-retry.tflw`, `tests/examples/matchers-explained.tflw`,
// `tests/api/admin/versioning.tflw` — all run against a stack started **without** `VULN_MODE=1`,
// and `scripts/regression.mjs` brings the stack up with the flag for exactly two phases. So a route
// that is documented **and** exists only under `VULN_MODE=1` leaves every one of those assertions
// looking at the document it has always looked at.
//
// The reasoning is written here and in `VULNS.md`'s row rather than only in the plan, so the next
// reader who notices the missing decorator finds the argument instead of re-deriving it — or worse,
// "fixing" it.
//
// THE GUARD RAIL, because this narrows a safety property rather than adding a route (D438).
// Documented-under-`VULN_MODE` is only safe if it is *also* absent without it, and the two halves
// need two different stacks to check:
//   - `scripts/verify-security-target.mjs` asserts the route is **present** in the `VULN_MODE`
//     document, and its ledger-parity loop reads this file by name — a fourth controller missing
//     from that hand-maintained list is invisible to both halves of the parity check, which is the
//     fail-open shape that script's own header warns about.
//   - `scripts/verify-vuln-slice-hidden.mjs` asserts it is **absent** from the default document.
//     That cannot live in the script above, because `regression.mjs` runs that one under
//     `stackEnv: { VULN_MODE: '1' }`; it is its own phase precisely because it needs the other
//     stack.
//
// NEVER EXERCISED, ON PURPOSE, AND THAT IS A PROPERTY OF THE WHOLE SUITE RATHER THAN OF THIS FILE.
// No `.tflw` test may send a request to this route. If one ever does, the captured-traffic seed
// finds it too, the two seeds stop being distinguishable here, and D437's per-seed attribution
// silently loses its only enumeration-exclusive positive — a coverage claim that reads exactly the
// same when it has stopped being true. `verify-security-acceptance.mjs` grades the finding's `via`
// as `openapi`, which is what turns that requirement into something a run can fail.
@ApiTags('reports')
@Controller('vuln/reports')
@UseGuards(AnyAuthGuard)
export class VulnReportsController {
  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
  ) {}

  // POSITIVE — `sec/authz-collection-leak` (critical). `V15`.
  //
  // Every user's orders, unfiltered, to any authenticated caller. The clean counterpart is
  // `GET /v1/orders/all` (`orders.controller.ts:60`), which serves the same unscoped collection and
  // is `@Roles(UserRole.ADMIN)` — so a shopper asking the real route gets `403` and a shopper
  // asking this one gets everybody's orders. The plant is that one missing decorator; nothing else
  // about the route differs.
  //
  // `AnyAuthGuard` stays, so this is not a public route and an unauthenticated caller still gets
  // `401`. Authenticated-and-not-authorized is the pairing the whole `vuln/` slice is built on, and
  // it is the shape a status-code oracle cannot see: this is a `200` carrying a JSON array, which
  // is exactly what `GET /v1/orders` correctly returns to the same caller. Only comparing *which*
  // resources came back separates them.
  //
  // **NO PATH PARAMETER AND NO REQUIRED QUERY, DELIBERATELY.** A crawl's OpenAPI seed has to invent
  // the values a documented request cannot be made without (D436), and an invented id does not
  // exist, so a synthesized `GET /vuln/reports/orders/{id}` would answer `404` and be recorded as
  // *not reached* rather than judged. This route needs nothing invented, so it reaches real code on
  // the first attempt — which means a finding against it can only mean the crawl enumerated the
  // document and the rule saw the defect. Bundling a synthesis dependency on top would make a
  // *missing* finding ambiguous between "the crawler cannot enumerate" and "the crawler invented a
  // bad value", and those have different repairs.
  //
  // **One defect, per `V6`'s rule.** No missing `ParseUUIDPipe` (there is no id), no weak header, no
  // reflected input. An acceptance bar reads the exact set of rule ids per response, and a route
  // carrying two defects makes a firing rule ambiguous about which one it caught.
  //
  // The relations mirror `findOwn`'s exactly (order → items[] → product → category), for `V7`'s
  // reason: a fixture that leaked a *thinner* object would let a rule pass by noticing the shape
  // rather than the identity.
  //
  // **No operation-level `@ApiBearerAuth()`, matching the rest of apiV2** — not one exists anywhere
  // in this tree, which caps what a crawler reading `/openapi.json` can know about which routes need
  // credentials (testFlow `PLAN_M137_PENTEST_TIER4.md` §1.2/D447). That is realistic of many real
  // APIs and is kept as a recorded choice rather than an accident; documenting security on this one
  // route alone would make the fixture unrepresentative of the surface around it.
  @Get('orders')
  leakEveryonesOrdersToAnyone(): Promise<Order[]> {
    return this.orders.find({
      relations: { items: { product: { category: true } } },
      order: { createdAt: 'DESC' },
    });
  }
}
