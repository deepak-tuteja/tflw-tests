import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';

// The broken-object-authorization fixture slice for tflw's pentest arc Tier 2 (testFlow
// PLAN_M130_PENTEST_TIER2.md, D317). `VULNS.md` rows `V6`–`V8`; `scripts/verify-security-target.mjs`
// keeps this file and that ledger from drifting apart.
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

  // POSITIVE — `sec/authz-object-leak` (critical), reachable only under `probe mutating`.
  //
  // This route is why tflw's D311 opt-in is not a vacuous control. `GET`/`HEAD`/`OPTIONS` are
  // probed by default; a replayed `DELETE` that *succeeds* is simultaneously the proof of the
  // vulnerability and the damage, so it is probed only when a `tflw.config` explicitly says
  // `probe mutating` under the `authorized target` for this host. D291's argument, repeated:
  // building a control with nothing to exercise it is the vacuous shape in a different costume.
  // So the opt-in ships with something that exercises it, and the acceptance corpus asserts both
  // halves — the default declines to probe this and says so; the opt-in probes it and finds the
  // leak.
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
}
