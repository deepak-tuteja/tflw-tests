import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

// PLAN_ENTERPRISE_REGRESSION.md E3 — no class-level `@Roles(ADMIN)` anymore: an org owner/admin
// (system role USER) may now also create/list coupons for their own org, so the authority check
// moved into CouponsService (it needs to distinguish "system ADMIN, any org" from "org owner/admin,
// own org only" from "forbidden," which a route-level role list alone can't express).
@ApiTags('coupons')
@Controller('coupons')
@UseGuards(AnyAuthGuard, RolesGuard)
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Post()
  create(@Body() dto: CreateCouponDto, @CurrentUser() user: AuthedUser) {
    return this.coupons.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthedUser) {
    return this.coupons.findAllVisible(user);
  }
}
