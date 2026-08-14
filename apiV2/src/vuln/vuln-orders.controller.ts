import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';

// The broken-object-authorization fixture slice for tflw's pentest arc Tier 2 (testFlow
// PLAN_M130_PENTEST_TIER2.md, D317). `VULNS.md` rows `V6`–`V9`; `scripts/verify-security-target.mjs`
// keeps this file and that ledger from drifting apart. `V9` arrived later, in M132b (D356), for a
// reason worth reading at the `PUT` at the bottom: the tier's mutating opt-in had shipped with no
// positive it could actually reach.
//
// WHY THIS EXISTS AT ALL, WHICH IS THE OPPOSITE OF TIER 1'S REASON. `M128a` planted headers and
// cookie flags because the real app could not produce them. This slice is planted because the real
// app is *correct*: PLAN_M130's scoping probe read every `:id` route in apiV2 looking for a natural
// BOLA and found none — every owner-scoped resource routes through a scoping service, and the `:id`
// routes with no `@CurrentUser` (`/orgs/*`, `/products/*`, `/categories/*`) are `@Roles(ADMIN)`
// platform-operator surfaces by design. `plan_v2.md:765`'s "missing `ParseUUIDPipe` IDOR already
// occurs naturally" is no longer true of this tree. So a tier built to find BOLA has nothing to
// find, and an acceptance bar with no positive case measures only that the rule stayed quiet.
//
// AUTHENTICATED, AND NOT AUTHORIZED. That pairing is the whole fixture. `AnyAuthGuard` runs, so a
// caller with no credentials still gets `401` and these are not public routes — what is missing is
// the *second* check, the one asking whether this authenticated caller may see this particular
// object. That is precisely OWASP API #1, and it is the shape a status-code oracle cannot see:
// every response below is a `200` that a correctly-implemented endpoint would also have returned to
// somebody. Only comparing *which* resource came back separates them.
//
// THE FLAW IS IN A DEDICATED ROUTE, NEVER IN `OrdersService`. A `VULN_MODE` branch inside
// `findOneScoped` would be cheaper and would exercise the genuine route with its genuine body — and
// it would put an authorization bypass inside authorization code, one misread environment variable
// away from being a real vulnerability rather than a test fixture. `VULNS.md`'s standing rule holds:
// real endpoints stay clean, and that is what makes the other ~45 files' results mean anything.
//
// Excluded from the OpenAPI document, and absent entirely without `VULN_MODE=1` — see
// `vuln.module.ts` for both, and `vuln.controller.ts` for the hygiene slice next door.
@ApiExcludeController()
@Controller('vuln/orders')
@UseGuards(AnyAuthGuard)
export class VulnOrdersController {
  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
  ) {}

  // POSITIVE — `sec/authz-collection-leak` (critical).
  //
  // Every user's orders, unfiltered. The clean counterpart is `GET /v1/orders`, whose
  // `findOwn(user.id)` scopes to the caller — and the difference between the two responses is
  // invisible to a status oracle, because *both* are a `200` carrying a JSON array. A non-owner
  // asking the clean route gets their own orders and is correctly served; a non-owner asking this
  // one gets everybody's.
  //
  // Declared before `:id` below, the same route-ordering rule `orders.controller.ts` follows for
  // `all`/`org`/`export`.
  //
  // The relations mirror `findOwn`'s exactly (order → items[] → product → category), so the leaked
  // objects are byte-identical to the ones their owner would have received. A fixture that leaked a
  // *thinner* object would let a rule pass by noticing the shape rather than the identity.
  @Get()
  leakEveryonesOrders(): Promise<Order[]> {
    return this.orders.find({
      relations: { items: { product: { category: true } } },
      order: { createdAt: 'DESC' },
    });
  }

  // POSITIVE — `sec/authz-object-leak` (critical).
  //
  // Any order by id, with no ownership check whatsoever. The clean counterpart is
  // `GET /v1/orders/:id`, where `findOneScoped` (`orders.service.ts:409`) admits the owner, an
  // admin, and an owner/admin of the placing user's org, and throws `ForbiddenException('not your
  // order')` for anyone else.
  //
  // `ParseUUIDPipe` is kept, deliberately, even though dropping it would be a second flaw for free.
  // This route plants exactly one defect — a missing authorization check — so that a finding
  // against it can only mean the rule saw that defect. Bundling an id-enumeration weakness on top
  // would make a firing rule ambiguous about which one it caught, and an acceptance bar reads the
  // exact set of rule ids per response.
  //
  // A missing order is a `404` rather than a leak: the fixture is broken authorization, not a
  // broken lookup, and `findOneScoped` answers `404` for a bad id too. Keeping the two routes
  // identical everywhere except the ownership check is what makes the comparison mean something.
  @Get(':id')
  async leakAnyOrder(@Param('id', ParseUUIDPipe) id: string): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: { product: { category: true } } },
    });
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  // PROBED-BUT-UNJUDGEABLE — the bound on `probe mutating`, planted deliberately.
  //
  // **This route's comment used to end "…the opt-in probes it and finds the leak". It does the
  // first and not the second, and M130-05 records why.** The correction is kept rather than
  // quietly deleted because the wrong sentence is the more instructive one: a `DELETE` looks like
  // the obvious way to exercise a mutating probe right up until you notice that a replay oracle
  // cannot judge destruction. The owner's own `DELETE` succeeds first and removes the row, so
  // every probe that replays it asks about a resource that no longer exists and is correctly
  // `refused`; had it failed instead, the response is a `4xx` the rules decline. There is no third
  // arrangement, and no probe set can rescue it — the obstacle is the verb, not the principals.
  //
  // So what this route actually proves is the *default* half of D311: `GET`/`HEAD`/`OPTIONS` are
  // probed without asking, and anything else stays `not probed` until a `tflw.config` says
  // `probe mutating` under the `authorized target` for this host. The acceptance corpus grades
  // that contrast on the identical request across two envs.
  //
  // **The reachable positive is the `PUT` below** (`V9`, M132b/D356), which is where D291's
  // argument — a control with nothing to exercise it is the vacuous shape in a different costume —
  // is actually satisfied. The two sit side by side under one probe set on purpose: same host,
  // same opt-in, same principals, and the only variable is whether the verb destroys what it
  // touches. Without the `PUT` beside it, "the `DELETE` could not be judged" is confounded — it
  // would be equally consistent with *no principal was able to answer*, which was true of this
  // corpus until `shopperBearer` was declared.
  //
  // The response names the id it destroyed. That is what makes the finding detectable under an
  // oracle that compares resource identity, and it is also the honest answer: a caller who was
  // never allowed to touch this order now knows it existed and that it is gone.
  //
  // Genuinely destructive, on purpose, and safe to be so: `order_items`, `jobs` and
  // `return_requests` all carry `onDelete: 'CASCADE'` on their order FK, so this removes a real
  // row and its dependents rather than erroring at the database. Any suite that opts in is
  // accepting that; that acceptance is the point of the opt-in.
  @Delete(':id')
  async destroyAnyOrder(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ deleted: true; id: string }> {
    const result = await this.orders.delete(id);
    if (!result.affected) throw new NotFoundException('order not found');
    return { deleted: true, id };
  }

  // POSITIVE — `sec/authz-object-leak` (critical), reachable only under `probe mutating`.
  //
  // **The plant that makes `probe mutating` a control with a reachable positive** (M132b, D356).
  // The opt-in's only mutating route was the `DELETE` above, whose verdict is structurally out of
  // reach, so its acceptance evidence was "the request was probed" and never "the leak was found"
  // — a control whose positive cannot occur, which is the vacuous shape D291 has now rejected five
  // times.
  //
  // **Idempotent, and that is the entire point rather than a style preference.** `PUT` leaves the
  // row where it was, so a probe replaying the owner's request receives the owner's order back,
  // by id, with the owner's `userId` on it — the same identity comparison that judges the `GET` at
  // `V6`, now reached through a mutating verb. Re-issue it any number of times and the state and
  // the response are unchanged, so the probe does no cumulative damage and the assertion means the
  // same thing on the second run as on the first.
  //
  // The write is real, not cosmetic: it persists `status`. A route that returned the order without
  // touching it would be a `GET` wearing a `PUT`'s method, and would prove nothing about mutating
  // probes that `V6` does not already prove.
  //
  // Missing `status` re-writes the value already there, which keeps the route idempotent under a
  // body-less replay instead of failing in a way that would read as the boundary holding. An
  // unknown status is a `400` — this route plants exactly one defect, the missing ownership check,
  // for the reason `V6`'s comment gives at length.
  //
  // The clean counterpart is `PATCH /v1/orders/:id/items/:itemId`, asserted beside this one in
  // `verify-security-target.mjs`. It is the closest thing the real app has to this route and the
  // comparison is exact: `updateItem` (`orders.service.ts:442`) routes through the *same*
  // `findOneScoped` that guards `GET /orders/:id`, so an idempotent write and an ownership-scoped
  // read are refused by one shared check — and this plant is precisely that check's absence, on a
  // mutating verb.
  //
  // **One polarity, deliberately** (D356). A correctly-scoped `PUT` beside this would prove the
  // oracle does not cry wolf on idempotent mutation, but that is currently justified by symmetry
  // rather than by an observed false positive. Deferred on a condition: **if this plant ever
  // reports something surprising, or a false positive is observed on an idempotent mutating
  // route.**
  @Put(':id')
  async updateAnyOrder(
    @Param('id', ParseUUIDPipe) id: string,
    // Typed as a plain object on purpose: the global `ValidationPipe`
    // (`whitelist`/`forbidNonWhitelisted`, `main.ts:24`) only engages for a DTO class, so this
    // keeps the fixture's single defect from being joined by a validation difference the clean
    // counterpart does not have. The status is checked by hand below.
    @Body() body: { status?: string },
  ): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: { product: { category: true } } },
    });
    if (!order) throw new NotFoundException('order not found');

    const next = body?.status ?? order.status;
    if (!Object.values(OrderStatus).includes(next as OrderStatus)) {
      throw new BadRequestException(
        `status must be one of: ${Object.values(OrderStatus).join(', ')}`,
      );
    }

    order.status = next as OrderStatus;
    await this.orders.save(order);
    return order;
  }
}
